/**
 * Лёгкий Node-бэкенд «МедиКабинета» (без фреймворков).
 *
 * Маршруты:
 *   GET  /settings.yaml                  — базовый конфиг приложения
 *   GET  /api/ip                         — IP клиента (для аудит-событий)
 *   POST /api/audit                      — батч аудит-событий → log-файл
 *
 *   AUTH:
 *   POST /api/auth/login                 — { username, password } → { ok, user, sessionToken }
 *   POST /api/auth/change-password      — { oldPassword, newPassword } (авторизованному) → { ok }
 *   POST /api/auth/logout                — (X-Session-Token) → { ok }
 *   GET  /api/auth/session               — (X-Session-Token) → { ok, user | null }
 *
 *   NOTIFICATIONS:
 *   GET    /api/notifications            — (auth) → { ok, system: [], personal: [] }
 *   POST   /api/notifications            — (admin) { severity, title, body, starts_at?, ends_at?, expires_at? }
 *   DELETE /api/notifications/:id        — (admin)
 *   POST   /api/notifications/:id/read   — (auth)
 *
 *   PATIENT RECORDS:
 *   GET  /api/patients                    — (doctor) → { ok, records: [] }
 *   GET  /api/patients/:id               — (doctor|patient=self)
 *   PUT  /api/patients/:id               — (doctor) → частичная замена record
 *   POST /api/patients/:id/tests         — (patient=self|doctor) { type, score, date? }
 *   POST /api/patients/:id/visits        — (doctor) VisitInput
 *   POST /api/patients/:id/recommendations — (doctor) { scale_key, due_date?, note? }
 *   POST /api/patients/:id/recommendations/:recId/done — (patient|doctor) { result_id? }
 *
 * Запуск:  npm run server  (порт 3001; Vite dev проксирует /api и /settings.yaml)
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as yamlLoad } from 'js-yaml'

import {
  ensureDbFile,
  loadDb,
  mutateDb,
  getDb,
  findUser,
  findRecord,
  ensureRecord,
  hookShutdown,
  resetDb,
} from './database.mjs'
import { login as loginAuth, logout as logoutAuth, getSession, requireAuth, createUser as createUserAuth, removeUser as removeUserAuth, updateUser as updateUserAuth, changePassword as changePasswordAuth } from './auth.mjs'
import { sessionToApiUser } from './users.serializer.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SETTINGS_FILE = path.join(ROOT, 'settings.yaml')
const PORT = Number(process.env.PORT || 3001)

// ─── Чтение конфига ───
function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
    return yamlLoad(raw) || {}
  } catch (err) {
    console.error('[server] Не удалось прочитать settings.yaml:', err.message)
    return {}
  }
}

/** Куда писать логи (по умолчанию logs/audit.log относительно корня) */
function logFilePath() {
  const s = readSettings()
  const p = (s.logs && s.logs.path) || 'logs/audit.log'
  return path.isAbsolute(p) ? p : path.join(ROOT, p)
}

// ─── Форматирование события в строку лога ───
const pad = (n) => String(n).padStart(2, '0')
function fmtDate(ts) {
  const x = new Date(ts)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`
}
function fmtEvent(e) {
  const parts = [`user=${e.username || '?'}`]
  if (e.role) parts.push(`role=${e.role}`)
  if (e.ip) parts.push(`ip=${e.ip}`)
  if (e.details) parts.push(`details=${JSON.stringify(e.details)}`)
  return `${fmtDate(e.ts)} [${String(e.type || 'unknown').toUpperCase()}] ${parts.join(' ')}`
}

/** IP клиента соединения ( ::ffff:127.0.0.1 → 127.0.0.1 ) */
function clientIp(req) {
  const raw = (req.socket && req.socket.remoteAddress) || ''
  return raw.replace(/^::ffff:/, '') || 'unknown'
}

// ─── Вспомогательные ───
/** Прочитать тело запроса как JSON; null при ошибке/пустоте */
async function readJson(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/** Заголовок X-Session-Token */
function sessionToken(req) {
  return req.headers['x-session-token'] || null
}

function maxId(arr, key = 'id') {
  return arr.length ? Math.max(...arr.map((x) => Number(x[key]) || 0)) + 1 : 1
}

/** Проверить, что notification активна (expires_at) */
function notifActive(n, now = Date.now()) {
  if (n.expires_at && new Date(n.expires_at).getTime() < now) return false
  if (n.starts_at && new Date(n.starts_at).getTime() > now) return false
  return true
}

// Маппинг TestType → scale_key (для авто-complete рекомендаций)
const TEST_TO_SCALE = { HADS_A: 'HADS', HADS_D: 'HADS', PHQ9: 'PHQ9', GAD7: 'GAD7', PHQ4: 'PHQ4', ISI: 'ISI' }

// Помощник: отметить активную рекомендацию по scale_key как completed
async function markRecommendationDoneByTest(patientId, testType) {
  const scaleKey = TEST_TO_SCALE[testType]
  if (!scaleKey) return
  await mutateDb((db) => {
    const rec = findRecord(patientId)
    if (!rec) return
    const active = (rec.recommendations || [])
      .filter((r) => r.scale_key === scaleKey && !r.done_at)
      .sort((a, b) => a.id - b.id)
    if (active.length) active[0].done_at = new Date().toISOString()
  })
}

// ─── HTTP-сервер ───
const server = http.createServer(async (req, res) => {
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    res.end(body)
  }
  const sendJson = (code, obj) => send(code, JSON.stringify(obj), 'application/json')
  const url = req.url.split('?')[0]
  const ip = clientIp(req)
  let m = null

  try {
    // ============ СТАРЫЕ МАРШРУТЫ ============

    if (req.method === 'GET' && url === '/settings.yaml') {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
      return send(200, raw, 'text/yaml; charset=utf-8')
    }

    if (req.method === 'GET' && url === '/api/ip') {
      return sendJson(200, { ok: true, ip })
    }

    if (req.method === 'POST' && url === '/api/audit') {
      let events
      try {
        const body = await readJson(req)
        events = body && body.events
        if (!Array.isArray(events)) throw new Error('events[] expected')
      } catch (err) {
        return sendJson(400, { ok: false, error: 'bad json: ' + err.message })
      }
      const file = logFilePath()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const lines = events.map(fmtEvent).join('\n') + '\n'
      fs.appendFileSync(file, lines)
      return sendJson(200, { ok: true, written: events.length, file: path.relative(ROOT, file) })
    }

    // ============ AUTH ============

    if (req.method === 'POST' && url === '/api/auth/login') {
      const body = await readJson(req)
      const username = body && typeof body.username === 'string' ? body.username.trim() : ''
      const password = body && typeof body.password === 'string' ? body.password : ''
      if (!username || !password) {
        return sendJson(400, { ok: false, error: 'username and password required' })
      }
      const result = loginAuth(username, password, (u) => findUser(u))
      if (!result.ok) {
        try {
          const file = logFilePath()
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.appendFileSync(file, `${fmtDate(Date.now())} [LOGIN_FAILED] user=${username} ip=${ip}\n`)
        } catch { /* ignore */ }
        return sendJson(401, { ok: false, error: 'wrong_credentials' })
      }
      console.log(`[server] login: ${username} (${result.user.role}) from ${ip}`)
      // user уже в едином API-формате (users.serializer.mjs)
      return sendJson(200, { ok: true, user: result.user, sessionToken: result.sessionToken })
    }

    if (req.method === 'POST' && url === '/api/auth/logout') {
      const token = sessionToken(req)
      const s = token ? getSession(token) : null
      if (s) console.log(`[server] logout: ${s.username}`)
      logoutAuth(token)
      return sendJson(200, { ok: true })
    }

    if (req.method === 'GET' && url === '/api/auth/session') {
      const token = sessionToken(req)
      const s = token ? getSession(token) : null
      if (!s) return sendJson(200, { ok: true, user: null })
      return sendJson(200, { ok: true, user: sessionToApiUser(s) })
    }

    // Смена пароля самим пользователем (например, при первом входе после установки админом)
    if (req.method === 'POST' && url === '/api/auth/change-password') {
      const auth = requireAuth(sessionToken(req))
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const body = await readJson(req)
      const oldPassword = body && typeof body.oldPassword === 'string' ? body.oldPassword : ''
      const newPassword = body && typeof body.newPassword === 'string' ? body.newPassword : ''
      const result = await changePasswordAuth(auth.session.userId, oldPassword, newPassword)
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400
        return sendJson(code, { ok: false, error: result.error })
      }
      console.log(`[server] password changed: ${auth.session.username} from ${ip}`)
      return sendJson(200, { ok: true })
    }

    // ============ NOTIFICATIONS ============

    if (req.method === 'GET' && url === '/api/notifications') {
      const auth = requireAuth(sessionToken(req))
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const d = getDb()
      const now = Date.now()
      const system = (d.system_notifications || []).filter((n) => notifActive(n, now))
      return sendJson(200, { ok: true, system, personal: [] })
    }

    // Админ: список ВСЕХ уведомлений (включая будущие и истёкшие) — для CRUD в админке
    if (req.method === 'GET' && url === '/api/admin/notifications') {
      const auth = requireAuth(sessionToken(req), 'admin')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const d = getDb()
      return sendJson(200, { ok: true, notifications: d.system_notifications || [] })
    }

    if (req.method === 'POST' && url === '/api/notifications') {
      const auth = requireAuth(sessionToken(req), 'admin')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const body = await readJson(req)
      if (!body || typeof body.title !== 'string' || typeof body.body !== 'string') {
        return sendJson(400, { ok: false, error: 'title and body (string) required' })
      }
      const severity = ['info', 'warning', 'critical'].includes(body.severity) ? body.severity : 'info'
      const result = await mutateDb((d) => {
        d.system_notifications = d.system_notifications || []
        const id = maxId(d.system_notifications)
        d.system_notifications.push({
          id,
          severity,
          title: body.title,
          body: body.body,
          created_at: new Date().toISOString(),
          created_by: auth.session.username,
          starts_at: body.starts_at || null,
          ends_at: body.ends_at || null,
          expires_at: body.expires_at || '2099-12-31T23:59:59.000Z',
          seen_by: [],
        })
        return id
      })
      return sendJson(200, { ok: true, id: result })
    }

    let m
    if (req.method === 'DELETE' && (m = url.match(/^\/api\/notifications\/(\d+)$/))) {
      const auth = requireAuth(sessionToken(req), 'admin')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      await mutateDb((d) => {
        const arr = d.system_notifications || []
        const i = arr.findIndex((n) => n.id === id)
        if (i !== -1) arr.splice(i, 1)
      })
      return sendJson(200, { ok: true })
    }

    if (req.method === 'POST' && (m = url.match(/^\/api\/notifications\/(\d+)\/read$/))) {
      const auth = requireAuth(sessionToken(req))
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      await mutateDb((d) => {
        const n = (d.system_notifications || []).find((x) => x.id === id)
        if (n) {
          n.seen_by = n.seen_by || []
          if (!n.seen_by.includes(auth.session.userId)) n.seen_by.push(auth.session.userId)
        }
      })
      return sendJson(200, { ok: true })
    }

    // ============ PATIENT RECORDS ============

    // ============ USERS (admin only) ============
    if (req.method === 'POST' && url === '/api/users') {
      const auth = requireAuth(sessionToken(req), 'admin')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const body = await readJson(req)
      if (!body || typeof body.username !== 'string' || !body.username.trim()) {
        return sendJson(400, { ok: false, error: 'username required' })
      }
      if (!body.password || typeof body.password !== 'string' || body.password.length < 3) {
        return sendJson(400, { ok: false, error: 'password required (min 3 chars)' })
      }
      const roles = ['admin', 'doctor', 'patient']
      const role = roles.includes(body.role) ? body.role : 'patient'
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(400, { ok: false, error: 'invalid email format' })
      }
      const result = await createUserAuth({
        username: body.username.trim(),
        password: body.password,
        role,
        full_name: body.fullName || body.username.trim(),
        birth_date: body.birthDate || null,
        email: email || null,
        // Чекбокс «сменить пароль» (по умолчанию true)
        must_change_password: body.mustChangePassword !== undefined ? !!body.mustChangePassword : true,
      })
      if (!result.ok) {
        return sendJson(409, { ok: false, error: result.error })
      }
      console.log(`[server] user created: ${body.username} (${role}) by ${auth.session.username}`)
      // user уже в едином API-формате ( users.serializer.mjs )
      return sendJson(200, { ok: true, user: result.user })
    }

    // Редактирование пользователя (админ). Логин не меняется; пароль — опционально.
    if (req.method === 'PUT' && (m = url.match(/^\/api\/users\/(\d+)$/))) {
      const auth = requireAuth(sessionToken(req), 'admin')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      const body = await readJson(req)
      if (!body) return sendJson(400, { ok: false, error: 'body required' })
      // Защита от само-блокировки: свою роль менять нельзя
      if (id === auth.session.userId && body.role && body.role !== auth.session.role) {
        return sendJson(400, { ok: false, error: 'cannot change own role' })
      }
      const roles = ['admin', 'doctor', 'patient']
      if (body.role !== undefined && !roles.includes(body.role)) {
        return sendJson(400, { ok: false, error: 'invalid role' })
      }
      if (body.password !== undefined && body.password !== '' &&
          (typeof body.password !== 'string' || body.password.length < 3)) {
        return sendJson(400, { ok: false, error: 'password required (min 3 chars)' })
      }
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(400, { ok: false, error: 'invalid email format' })
      }
      const result = await updateUserAuth(id, {
        full_name: typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim() : undefined,
        role: body.role,
        birth_date: body.birthDate || null,
        email: email || null,
        password: body.password || undefined,
        // Чекбокс «сменить пароль» (undefined — не менять текущее значение флага)
        must_change_password: body.mustChangePassword !== undefined ? !!body.mustChangePassword : undefined,
      })
      if (!result.ok) {
        return sendJson(result.error === 'not_found' ? 404 : 409, { ok: false, error: result.error })
      }
      console.log(`[server] user updated: ${result.user.username} by ${auth.session.username}`)
      return sendJson(200, { ok: true, user: result.user })
    }

    if (req.method === 'DELETE' && (m = url.match(/^\/api\/users\/(\d+)$/))) {
      const auth = requireAuth(sessionToken(req), 'admin')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      if (id === auth.session.userId) {
        return sendJson(400, { ok: false, error: 'cannot delete self' })
      }
      const result = await removeUserAuth(id)
      if (!result.ok) {
        return sendJson(404, { ok: false, error: 'not_found' })
      }
      console.log(`[server] user removed: id=${id} by ${auth.session.username}`)
      return sendJson(200, { ok: true })
    }

    // ============ PATIENT RECORDS ============
    if (req.method === 'GET' && url === '/api/patients') {
      const auth = requireAuth(sessionToken(req), 'doctor')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const d = getDb()
      return sendJson(200, { ok: true, records: d.records || [] })
    }

    if (req.method === 'GET' && (m = url.match(/^\/api\/patients\/(\d+)$/))) {
      const auth = requireAuth(sessionToken(req))
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      if (auth.session.role === 'patient' && auth.session.userId !== id) {
        return sendJson(403, { ok: false, error: 'forbidden' })
      }
      const rec = findRecord(id)
      if (!rec) return sendJson(404, { ok: false, error: 'not_found' })
      return sendJson(200, { ok: true, record: rec })
    }

    if (req.method === 'PUT' && (m = url.match(/^\/api\/patients\/(\d+)$/))) {
      const auth = requireAuth(sessionToken(req), 'doctor')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      const body = await readJson(req)
      if (!body || typeof body !== 'object') return sendJson(400, { ok: false, error: 'json object expected' })
      await mutateDb((d) => {
        const rec = ensureRecord(id)
        if (body.card) rec.card = body.card
        if (Array.isArray(body.tests)) rec.tests = body.tests
        if (Array.isArray(body.visits)) rec.visits = body.visits
        if (Array.isArray(body.recommendations)) rec.recommendations = body.recommendations
      })
      return sendJson(200, { ok: true })
    }

    if (req.method === 'POST' && (m = url.match(/^\/api\/patients\/(\d+)\/tests$/))) {
      const auth = requireAuth(sessionToken(req))
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      if (auth.session.role === 'patient' && auth.session.userId !== id) {
        return sendJson(403, { ok: false, error: 'forbidden' })
      }
      const body = await readJson(req)
      if (!body || !body.type || typeof body.score !== 'number') {
        return sendJson(400, { ok: false, error: 'type (string) and score (number) required' })
      }
      const d = getDb()
      const testType = d.constants?.test_types?.[body.type]
      if (!testType) {
        const valid = Object.keys(d.constants?.test_types || {})
        return sendJson(400, { ok: false, error: `unknown test type: ${body.type} (valid: ${valid.join(', ')})` })
      }
      if (body.score > testType.max) {
        return sendJson(400, { ok: false, error: `score exceeds max (${testType.max}) for ${body.type}` })
      }
      const testId = await mutateDb((db) => {
        const rec = ensureRecord(id)
        const tid = maxId(rec.tests)
        rec.tests.push({
          id: tid,
          date: body.date || new Date().toISOString().slice(0, 10),
          type: body.type,
          score: body.score,
        })
        rec.tests.sort((a, b) => String(a.date).localeCompare(String(b.date)))
        return tid
      })
      await markRecommendationDoneByTest(id, body.type)
      return sendJson(200, { ok: true, testId })
    }

    if (req.method === 'POST' && (m = url.match(/^\/api\/patients\/(\d+)\/visits$/))) {
      const auth = requireAuth(sessionToken(req), 'doctor')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      const body = await readJson(req)
      if (!body || typeof body !== 'object') return sendJson(400, { ok: false, error: 'json object expected' })
      const visitId = await mutateDb((db) => {
        const rec = ensureRecord(id)
        const vid = maxId(rec.visits)
        rec.visits.push({ id: vid, ...body, date: body.date || Date.now(), doctor: body.doctor || auth.session.username })
        return vid
      })
      return sendJson(200, { ok: true, visitId })
    }

    if (req.method === 'POST' && (m = url.match(/^\/api\/patients\/(\d+)\/recommendations$/))) {
      const auth = requireAuth(sessionToken(req), 'doctor')
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      const body = await readJson(req)
      if (!body || typeof body.scale_key !== 'string' || !body.scale_key) {
        return sendJson(400, { ok: false, error: 'scale_key (string) required' })
      }
      const d = getDb()
      const scaleInfo = d.constants?.scales?.[body.scale_key]
      if (!scaleInfo) return sendJson(400, { ok: false, error: `unknown scale_key: ${body.scale_key}` })
      const recId = await mutateDb((db) => {
        const rec = ensureRecord(id)
        const rid = maxId(rec.recommendations)
        rec.recommendations.push({
          id: rid,
          scale_key: body.scale_key,
          due_date: body.due_date || null,
          note: body.note || '',
          created_at: new Date().toISOString(),
          created_by_id: auth.session.userId,
          created_by: auth.session.username,
          done_at: null,
          result_id: null,
        })
        return rid
      })
      return sendJson(200, { ok: true, recId })
    }

    if (req.method === 'POST' && (m = url.match(/^\/api\/patients\/(\d+)\/recommendations\/(\d+)\/done$/))) {
      const auth = requireAuth(sessionToken(req))
      if (!auth.ok) return sendJson(auth.code || 401, { ok: false, error: auth.error })
      const id = Number(m[1])
      const recId = Number(m[2])
      if (auth.session.role === 'patient' && auth.session.userId !== id) {
        return sendJson(403, { ok: false, error: 'forbidden' })
      }
      const body = (await readJson(req)) || {}
      const result = await mutateDb((db) => {
        const rec = findRecord(id)
        const r = rec && (rec.recommendations || []).find((x) => x.id === recId)
        if (!r) return false
        r.done_at = new Date().toISOString()
        if (body.result_id) r.result_id = Number(body.result_id)
        return true
      })
      if (!result) return sendJson(404, { ok: false, error: 'recommendation not found' })
      return sendJson(200, { ok: true })
    }

    send(404, 'not found', 'text/plain')
  } catch (err) {
    console.error(`[server] Ошибка на ${req.method} ${url}:`, err)
    sendJson(500, { ok: false, error: err.message || 'internal error' })
  }
})

// ─── Старт ───
ensureDbFile()
await loadDb()
hookShutdown()

server.listen(PORT, () => {
  console.log(`[server] Бэкенд «МедиКабинета»: http://localhost:${PORT}`)
  console.log(`[server] settings.yaml: ${SETTINGS_FILE}`)
  console.log(`[server] db.yaml: ${path.join(ROOT, 'server/db.yaml')}`)
  console.log(`[server] Файл логов: ${logFilePath()}`)
})
