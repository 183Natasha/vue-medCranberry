#!/usr/bin/env node
/**
 * scripts/migrate-to-db.mjs — импорт JSON (из «Экспорт localStorage» в AdminPanel) в server/db.yaml.
 *
 * Использование (на машине с бэкендом):
 *   node scripts/migrate-to-db.mjs medicabinet-2026-10-25.json
 *   npm run migrate:local-to-db -- medicabinet-2026-10-25.json
 *
 * Поведение:
 *   - ПЕРЕД запуском сервер ОБЯЗАТЕЛЬНО остановите (иначе в памяти чужое состояние и запись перезапишет файл).
 *   - Создаёт бекап server/db.yaml.bak (с меткой времени) — откат: cp db.yaml.bak db.yaml
 *   - --dry-run: только отчёт, файл не меняется
 *   - Пользователи: сливаются (db-пользователь побеждает по конфликту username;
 *     новые получают id = max+1; валидация role)
 *   - Записи пациентов: сливаются поле-в-поле:
 *       card / recommendations / system_notifications — db-значения не затираются,
 *       tests / visits — объединение по id (новые id получают max+1 в блоке)
 *
 * Пароли: JSON из localStorage содержит plaintext-пароли — в db.yaml они НЕ
 * переносятся (на сервере пароли = hash+salt). Импорт только метаданных.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(ROOT, 'server', 'db.yaml')

// ---------- Аргументы ----------
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const fileArg = args.find((a) => !a.startsWith('--'))

if (!fileArg) {
  console.error('Использование: node scripts/migrate-to-db.mjs <export-json> [--dry-run]')
  console.error('  --dry-run — только отчёт о том, что будет изменено')
  process.exit(1)
}
const jsonPath = path.resolve(fileArg)
if (!fs.existsSync(jsonPath)) {
  console.error(`Файл не найден: ${jsonPath}`)
  process.exit(1)
}
if (!fs.existsSync(DB_FILE)) {
  console.error(`db.yaml не найден: ${DB_FILE}`)
  process.exit(1)
}

// ---------- Чтение ----------
const importData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const db = yamlLoad(fs.readFileSync(DB_FILE, 'utf8')) || {}

if (importData.source !== 'medicabinet_localstorage') {
  console.error(`Неизвестный source: ${importData.source} (ожидается medicabinet_localstorage)`)
  process.exit(1)
}

console.log(`Экспорт от: ${importData.exported_at}`)
console.log(`Импорт: ${(importData.users || []).length} пользователей, ${Object.keys(importData.patientData || {}).length} пациентов из JSON`)
if (DRY_RUN) console.log('— режим DRY RUN (файл не меняется) —')
console.log('')

// ---------- Пользователи ----------
const ROLE_ALIASES = { admin: 'admin', doctor: 'doctor', patient: 'patient' }
const maxUserId = (db.users || []).reduce((m, u) => Math.max(m, Number(u.id) || 0), 0)
let nextUserId = maxUserId + 1
let usersAdded = 0, usersSkipped = 0

for (const u of importData.users || []) {
  const role = ROLE_ALIASES[u.role]
  if (!role) { console.log(`  [skip] пользователь ${u.username}: неизвестная роль ${u.role}`); usersSkipped++; continue }
  const existing = (db.users || []).find((x) => x.username === u.username)
  if (existing) {
    usersSkipped++
    continue // db-пользователь побеждает (у него уже hash+salt)
  }
  db.users = db.users || []
  // Для локального каталога создаём salt с demo-паролем 'change-me' — админ сменит пароль позже
  const salt = crypto.randomBytes(16).toString('hex')
  db.users.push({
    id: nextUserId++,
    username: u.username,
    password_hash: 'sha256:' + crypto.createHash('sha256').update('change-me|' + salt).digest('hex'),
    salt,
    role,
    full_name: u.fullName || u.username,
    birth_date: u.birthDate || null,
    email: u.email || null,
    // Пароль — 'change-me': потребовать смену при первом входе
    must_change_password: true,
  })
  usersAdded++
  console.log(`  [+user] ${u.username} (id ${nextUserId - 1}, role ${role}) — пароль: change-me (смените!)`)
}

// ---------- Записи пациентов ----------
db.records = db.records || []
let recordsTouched = 0, testsAdded = 0, visitsAdded = 0

for (const [pidStr, src] of Object.entries(importData.patientData || {})) {
  const pid = Number(pidStr)
  if (!Number.isFinite(pid)) continue
  let rec = db.records.find((r) => Number(r.id) === pid)
  const isNewRecord = !rec
  if (isNewRecord) {
    rec = { id: pid, card: { diagnosis: '—', notes: '' }, tests: [], visits: [], recommendations: [] }
    db.records.push(rec)
  }
  rec.card = rec.card || { diagnosis: '—', notes: '' }

  // tests: объединение по id
  const maxTestId = (rec.tests || []).reduce((m, t) => Math.max(m, Number(t.id) || 0), 0)
  let nextTestId = maxTestId + 1
  for (const t of src.tests || []) {
    if ((rec.tests || []).some((x) => Number(x.id) === Number(t.id))) continue
    rec.tests.push({ id: nextTestId++, date: t.date, type: t.type, score: Number(t.score) })
    testsAdded++
  }
  if (!Array.isArray(rec.tests)) rec.tests = []
  rec.tests.sort((a, b) => String(a.date).localeCompare(String(b.date)))

  // visits: объединение по id
  const maxVisitId = (rec.visits || []).reduce((m, v) => Math.max(m, Number(v.id) || 0), 0)
  let nextVisitId = maxVisitId + 1
  for (const v of src.visits || []) {
    if ((rec.visits || []).some((x) => Number(x.id) === Number(v.id))) continue
    // date может быть string (старый формат) — переводим в ts
    let date = v.date
    if (typeof date === 'string') date = Date.parse(date.length === 10 ? date + 'T00:00:00Z' : date) || Date.now()
    rec.visits.push({ id: nextVisitId++, ...v, date })
    visitsAdded++
  }
  if (!Array.isArray(rec.visits)) rec.visits = []
  rec.visits.sort((a, b) => (b.date || 0) - (a.date || 0))

  recordsTouched++
  console.log(`  [+rec ${pid}] ${isNewRecord ? 'новая запись' : 'слияние'}: tests ${src.tests?.length || 0}, visits ${src.visits?.length || 0}`)
}

// ---------- Отчёт ----------
console.log('')
console.log('Итог:')
console.log(`  пользователей: +${usersAdded}, пропущено ${usersSkipped} (уже есть)` )
console.log(`  записей пациентов: затронуто ${recordsTouched}`)
console.log(`  тестов: +${testsAdded}, приёмов: +${visitsAdded}`)

if (DRY_RUN) {
  console.log('\nDRY RUN — db.yaml не изменён.')
  process.exit(0)
}

// ---------- Бекап + запись ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const backup = path.join(DB_FILE + '.bak-' + ts)
fs.copyFileSync(DB_FILE, backup)
console.log(`\nБекап: ${path.relative(ROOT, backup)}`)

db.meta = { ...(db.meta || {}), updated_at: new Date().toISOString() }
const yaml = yamlDump(db, { lineWidth: 10000, noRefs: true })
const tmp = DB_FILE + '.tmp'
fs.writeFileSync(tmp, yaml, 'utf8')
fs.renameSync(tmp, DB_FILE)
console.log(`db.yaml обновлён: ${path.relative(ROOT, DB_FILE)}`)
console.log('\nГотово. Запустите сервер: npm run server')
console.log('Не забудьте сменить пароль "change-me" у перенесённых пользователей (в admin UI пока пароли из db не меняются — при необходимости отредактируйте db.yaml вручную или пересоздайте пользователя через UI).')
