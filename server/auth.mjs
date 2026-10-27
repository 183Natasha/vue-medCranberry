/**
 * auth.mjs — аутентификация и сессии «МедиКабинета».
 *
 * Пароли: только sha256(password + '|' + salt). Plaintext в db.yaml не хранится.
 * Сессии: in-memory Map<token, {userId, username, role, full_name, createdAt, expiresAt}>.
 *   - при рестарте сервера все сессии теряются (для демо — ок; в проде — cookie+redis)
 *   - TTL: 7 дней
 *
 * API:
 *   hashPassword(pw, salt) → 'sha256:hex'
 *   verifyPassword(pw, user) → boolean
 *   createSession(user) → token (string)
 *   getSession(token) → session | null
 *   destroySession(token) → void
 *   login(username, password) → { ok, user?, sessionToken?, error? }
 *   logout(token) → { ok }
 *   requireAuth(token, ...roles) → session | { error }
 */
import crypto from 'node:crypto'
import { mutateDb, getDb } from './database.mjs'
import { toApiUser } from './users.serializer.mjs'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 дней

// В-memory сессии: token → { userId, username, role, full_name, createdAt, expiresAt }
const sessions = new Map()

// ---------- Пароли ----------
export function hashPassword(password, salt) {
  return 'sha256:' + crypto.createHash('sha256').update(password + '|' + salt).digest('hex')
}

export function verifyPassword(password, user) {
  if (!user || !user.salt || !user.password_hash) return false
  const expected = user.password_hash
  const actual = hashPassword(password, user.salt)
  // timing-safe comparison
  const a = Buffer.from(expected)
  const b = Buffer.from(actual)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ---------- Сессии ----------
function makeToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function createSession(user) {
  const token = makeToken()
  const now = Date.now()
  sessions.set(token, {
    userId: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    birth_date: user.birth_date ?? null,
    email: user.email ?? null,
    // Флаг «пароль установлен админом — пользователь обязан сменить его при первом входе»
    must_change_password: !!user.must_change_password,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  })
  // Периодическая чистка протухших (каждые 10 мин)
  maybeScheduleCleanup()
  return token
}

const cleanupTimer = { handle: null }
function maybeScheduleCleanup() {
  if (cleanupTimer.handle) return
  cleanupTimer.handle = setInterval(() => {
    const now = Date.now()
    for (const [tok, s] of sessions) {
      if (s.expiresAt < now) sessions.delete(tok)
    }
    if (sessions.size === 0) {
      clearInterval(cleanupTimer.handle)
      cleanupTimer.handle = null
    }
  }, 10 * 60 * 1000)
  cleanupTimer.handle.unref?.()
}

export function getSession(token) {
  if (!token) return null
  const s = sessions.get(token)
  if (!s) return null
  if (s.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return s
}

export function destroySession(token) {
  if (token) sessions.delete(token)
}

// ---------- Хранение user из db → session payload ----------
// db user: { id, username, password_hash, salt, role, full_name, birth_date, email, must_change_password }
// API user: единый формат (см. users.serializer.mjs) — без секретных полей
function toSessionUser(dbUser) {
  return toApiUser(dbUser)
}

export function login(username, password, lookupUser) {
  const user = lookupUser ? lookupUser(username) : null
  if (!user) return { ok: false, error: 'wrong_credentials' }
  if (!verifyPassword(password, user)) return { ok: false, error: 'wrong_credentials' }
  const token = createSession(user)
  return { ok: true, sessionToken: token, user: toSessionUser(user) }
}

export function logout(token) {
  destroySession(token)
  return { ok: true }
}

/**
 * Требовать авторизованную сессию, опционально — ролей.
 * @returns {ok:true, session} | {ok:false, error, code}
 */
export function requireAuth(token, ...roles) {
  const session = getSession(token)
  if (!session) return { ok: false, error: 'unauthorized', code: 401 }
  if (roles.length && !roles.includes(session.role)) {
    return { ok: false, error: 'forbidden', code: 403 }
  }
  return { ok: true, session }
}

/** Диагностика: сколько активных сессий (для логов/админки) */
export function activeSessionCount() {
  return sessions.size
}

// ---------- Создание/удаление пользователей ----------
/** Создать пользователя в db.yaml (с hashing). Return: { ok, user? | error } */
export async function createUser(input) {
  const db = getDb()
  const { username, password, role, full_name, birth_date, email, must_change_password } = input

  if (db.users.some((u) => u.username === username.trim())) {
    return { ok: false, error: 'login_taken' }
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const password_hash = hashPassword(password, salt)
  const id = (db.users.length ? Math.max(...db.users.map((u) => Number(u.id) || 0)) : 0) + 1

  const record = {
    id,
    username: username.trim(),
    password_hash,
    salt,
    role: role || 'patient',
    full_name: full_name || username.trim(),
    birth_date: birth_date || null,
    email: email || null,
    // Чекбокс «сменить пароль» (undefined — по умолчанию true)
    must_change_password: must_change_password !== undefined ? !!must_change_password : true,
  }
  await mutateDb((d) => {
    d.users.push(record)
  })

  return { ok: true, user: toApiUser(record) }
}

/** Удалить пользователя из db.yaml + закрыть его сессии. */
export async function removeUser(id) {
  let removed = null
  await mutateDb((d) => {
    const i = d.users.findIndex((u) => Number(u.id) === Number(id))
    if (i !== -1) removed = d.users.splice(i, 1)[0]
  })
  if (removed) {
    for (const [token, s] of sessions) {
      if (s.userId === Number(id)) sessions.delete(token)
    }
  }
  if (!removed) return { ok: false, error: 'not_found' }
  return { ok: true, removed: { id: removed.id, username: removed.username } }
}

/**
 * Обновить пользователя в db.yaml (логин username не меняется).
 * Пароль optional: если передан — перевыдатся hash+salt.
 * Активные сессии пользователя обновляются на лету (role/full_name/email).
 * Return: { ok, user? | error }
 */
export async function updateUser(id, input) {
  const db = getDb()
  const { full_name, role, birth_date, email, password, must_change_password } = input
  const u = db.users.find((x) => Number(x.id) === Number(id))
  if (!u) return { ok: false, error: 'not_found' }

  let password_hash = null
  let salt = null
  if (password) {
    salt = crypto.randomBytes(16).toString('hex')
    password_hash = hashPassword(password, salt)
  }
  // Флаг требования смены пароля: явный из запроса админа (чекбокс);
  // при установке нового пароля без явного флага — по умолчанию требуем смену
  let newFlag = null
  if (must_change_password !== undefined) newFlag = !!must_change_password
  else if (password) newFlag = true

  await mutateDb((d) => {
    const uu = d.users.find((x) => Number(x.id) === Number(id))
    if (!uu) return
    if (full_name) uu.full_name = full_name
    if (role) uu.role = role
    uu.birth_date = birth_date || null
    uu.email = email || null
    if (password_hash) {
      uu.password_hash = password_hash
      uu.salt = salt
    }
    if (newFlag !== null) uu.must_change_password = newFlag
  })

  // Обновляем активные сессии пользователя (role/имя/email действуют сразу;
  // при сбросе пароля и/или требовании смены — синхронизируем флаг)
  for (const s of sessions.values()) {
    if (s.userId === Number(id)) {
      if (full_name) s.full_name = full_name
      if (role) s.role = role
      s.email = email || null
      if (newFlag !== null) s.must_change_password = newFlag
    }
  }

  const updated = db.users.find((x) => Number(x.id) === Number(id))
  return { ok: true, user: toApiUser(updated) }
}

/**
 * Смена пароля самим пользователем (при первом входе / по желанию).
 * Проверяет старый пароль, перевыдаёт hash+salt, снимает флаг must_change_password.
 * @param {string} token — session token (для обновления сессии)
 * @returns {ok:true} | {ok:false, error:'wrong_old_password'|'too_short'}
 */
export async function changePassword(userId, oldPassword, newPassword, token) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 3) {
    return { ok: false, error: 'too_short' }
  }
  if (oldPassword === newPassword) {
    return { ok: false, error: 'same_password' }
  }
  const db = getDb()
  const u = db.users.find((x) => Number(x.id) === Number(userId))
  if (!u) return { ok: false, error: 'not_found' }
  if (!verifyPassword(oldPassword, u)) return { ok: false, error: 'wrong_old_password' }

  const salt = crypto.randomBytes(16).toString('hex')
  const password_hash = hashPassword(newPassword, salt)
  await mutateDb((d) => {
    const uu = d.users.find((x) => Number(x.id) === Number(userId))
    if (!uu) return
    uu.password_hash = password_hash
    uu.salt = salt
    uu.must_change_password = false
  })

  // Снимаем флаг в активной сессии пользователя (сама сессия остаётся валидной)
  for (const s of sessions.values()) {
    if (s.userId === Number(userId)) s.must_change_password = false
  }
  return { ok: true }
}
