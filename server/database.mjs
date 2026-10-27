/**
 * database.mjs — доступ к «БД» (server/db.yaml).
 *
 * Принципы:
 *  - YAML как имитация БД; атомарная запись (tmp → rename)
 *  - debounce 300 мс на flush (быстрые изменения не бьют диск)
 *  - синхронный flush при SIGINT/SIGTERM (не терять данные)
 *  - schema_version + миграции (массив функций от текущей к целевой)
 *
 * API:
 *   loadDb()        → Promise<Db>      (чтение из файла, миграции при необходимости)
 *   markDirty()     → void             (пометить dirty, запустить debounce)
 *   flush()         → Promise<void>    (синхронно записать на диск)
 *   mutateDb(fn)    → Promise<void>    (fn(db) затем markDirty)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE = path.join(__dirname, 'db.yaml')
const DB_EXAMPLE = path.join(__dirname, 'db.example.yaml')

const CURRENT_SCHEMA_VERSION = 1
const FLUSH_DEBOUNCE_MS = 300

// ---------- Миграции ----------
// m1to2(db), m2to3(db), ... — чистые функции, возвращают новый db
const MIGRATIONS = {
  // при добавлении новой версии: MIGRATIONS[1] = (db) => ({ ...db })
}

function migrateSchema(db, from) {
  let v = from
  while (v < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[v]
    if (!step) throw new Error(`Нет миграции с схемы v${v} → v${v + 1}`)
    db = step(db)
    v++
  }
  return db
}

// ---------- Состояние ----------
let db = null          // текущий экземпляр
let dirty = false
let flushTimer = null
let flushing = false

// ---------- Чтение ----------
/**
 * Загрузить БД из файла. При отсутствии — создать из db.example.yaml.
 * Применим миграции при устаревшей версии схемы.
 */
export async function loadDb() {
  if (db) return db
  const raw = fs.readFileSync(DB_FILE, 'utf8')
  db = yamlLoad(raw) || {}
  // Нормализация: пароль по умолчанию требует смены при первом входе
  // (у существующих записей поле может отсутствовать — считаем его true)
  if (Array.isArray(db.users)) {
    let changed = false
    for (const u of db.users) {
      if (u.must_change_password === undefined) {
        u.must_change_password = true
        changed = true
      }
    }
    if (changed) markDirty()
  }
  const from = Number((db.meta && db.meta.schema_version) || 0)
  if (from !== CURRENT_SCHEMA_VERSION) {
    db = migrateSchema(db, from)
    db.meta = { ...(db.meta || {}), schema_version: CURRENT_SCHEMA_VERSION }
    markDirty() // записать смигрированную схему
  }
  return db
}

/** Создать db.yaml из примера (вызывается вручную, если файл не существует) */
export function ensureDbFile() {
  if (fs.existsSync(DB_FILE)) return false
  fs.copyFileSync(DB_EXAMPLE, DB_FILE)
  console.log(`[db] Создан db.yaml из db.example.yaml: ${DB_FILE}`)
  return true
}

// ---------- Запись ----------
/** Пометить dirty + запустить debounce flush */
export function markDirty() {
  if (!db) return
  dirty = true
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush().catch((err) => {
      console.error('[db] Ошибка flush (debounce):', err.message)
    })
  }, FLUSH_DEBOUNCE_MS)
}

/** Атомарно записать db на диск (tmp → rename) */
export async function flush() {
  if (!db) return
  if (flushing) return
  flushing = true
  try {
    db.meta = { ...(db.meta || {}), updated_at: new Date().toISOString() }
    const yamlText = yamlDump(db, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    })
    const tmp = DB_FILE + '.tmp'
    fs.writeFileSync(tmp, yamlText, 'utf8')
    fs.renameSync(tmp, DB_FILE)
    dirty = false
  } finally {
    flushing = false
  }
}

// ---------- Мутация ----------
/**
 * Применить fn к текущему db и пометить dirty.
 * fn может быть sync или async; db мутируется in-place.
 */
export async function mutateDb(fn) {
  await loadDb()
  const result = await fn(db)
  markDirty()
  // Ждём debounce, чтобы изменения гарантированно были на диске к моменту завершения
  await flush()
  return result
}

// ---------- Справочные доступы ----------
export function getDb() {
  if (!db) throw new Error('db не загружен — вызовите loadDb()')
  return db
}

/**
 * Сбросить вшитанную БД до seed (db.example.yaml): перезаписать файл и перезагрузить memory.
 * Используется для чистого stартa. В проде заменится на DROP/RECREATE таблиц.
 */
export async function resetDb() {
  clearTimeout(flushTimer)
  dirty = false
  db = null
  fs.copyFileSync(DB_EXAMPLE, DB_FILE)
  db = yamlLoad(fs.readFileSync(DB_FILE, 'utf8')) || {}
  db.meta = { ...(db.meta || {}), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  // Синхронный write чтобы seed гарантированно был на диске
  const yamlText = yamlDump(db, { indent: 2, lineWidth: 120, noRefs: true, quotingType: '"' })
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, yamlText, 'utf8')
  fs.renameSync(tmp, DB_FILE)
  console.log('[db] БД сброшена к seed (db.example.yaml)')
}

export function findUser(username) {
  return getDb().users.find((u) => u.username === username) || null
}

export function findRecord(patientId) {
  const id = Number(patientId)
  return getDb().records.find((r) => r.id === id) || null
}

export function ensureRecord(patientId) {
  const d = getDb()
  const id = Number(patientId)
  let rec = d.records.find((r) => r.id === id)
  if (!rec) {
    rec = { id, card: { diagnosis: '—', notes: '' }, tests: [], visits: [], recommendations: [] }
    d.records.push(rec)
    markDirty()
  }
  return rec
}

// ---------- Lifecycle ----------
let shutdownHooked = false
export function hookShutdown() {
  if (shutdownHooked) return
  shutdownHooked = true
  const doFlush = async (signal) => {
    console.log(`[db] ${signal}: синхронный flush db.yaml`)
    try {
      clearTimeout(flushTimer)
      await flush()
    } catch (err) {
      console.error('[db] Ошибка flush при завершении:', err.message)
    }
    process.exit(0)
  }
  process.on('SIGINT', () => doFlush('SIGINT'))
  process.on('SIGTERM', () => doFlush('SIGTERM'))
  process.on('beforeExit', () => {
    // Best-effort: если debounce ещё не сработал
    if (dirty && db) {
      const yamlText = yamlDump(db, { indent: 2, lineWidth: 120, noRefs: true, quotingType: '"' })
      const tmp = DB_FILE + '.tmp'
      fs.writeFileSync(tmp, yamlText, 'utf8')
      fs.renameSync(tmp, DB_FILE)
      dirty = false
    }
  })
}
