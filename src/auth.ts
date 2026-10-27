import { reactive, watch } from 'vue'
import { load } from './services/storage'
import { STORAGE_KEYS } from './services/storage-keys'
import { logEvent } from './services/audit'
import { MSG } from './services/messages'
import { apiLogin, setSessionToken, apiCreateUser, apiRemoveUser, apiUpdateUser, apiChangePassword } from './services/backend'

export const ROLES = {
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  PATIENT: 'patient',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export interface User {
  id: number
  username: string
  password: string
  role: Role
  fullName: string
  birthDate: string | null
  email: string | null
  /** Требовать смену пароля при первом входе (флаг в db.yaml) */
  mustChangePassword?: boolean
}

export interface SessionUser {
  id: number
  username: string
  role: Role
  fullName: string
  email: string | null
  /** true — пароль задан админом, требуется смена (первый вход) */
  mustChangePassword?: boolean
}

interface ActionResult<T = void> {
  ok: boolean
  error?: string
  user?: User
  removed?: User
  /** true, если действие выполнено локально (сервер недоступен) */
  offline?: boolean
}

// ---------- Хранилище пользователей (редактируется админом) ----------
// load<T> — общий сервис (src/services/storage.ts)

// Начальные пользователи. Пароли в демо-режиме хранятся как есть.
const DEFAULT_USERS: User[] = [
  { id: 1, username: 'admin', password: 'admin', role: ROLES.ADMIN, fullName: 'Администратор системы', birthDate: null, email: null },
  { id: 2, username: 'doctor', password: 'doctor', role: ROLES.DOCTOR, fullName: 'Др. Айболит', birthDate: null, email: null },
  { id: 3, username: 'patient', password: 'patient', role: ROLES.PATIENT, fullName: 'Пациен Пациентов', birthDate: '1990-05-14', email: null },
]

export const users = reactive<User[]>([]) as User[]

function saveUsers(): void {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users))
}

function initUsers(): void {
  const stored = load<User[] | null>(STORAGE_KEYS.users, null)
  const list = Array.isArray(stored) && stored.length ? stored : DEFAULT_USERS
  users.splice(0, users.length, ...list.map((u) => ({ ...u })))
}
initUsers()

let nextUserId = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1

export interface NewUserInput {
  username: string
  password: string
  role: Role
  fullName?: string
  birthDate?: string | null
  email?: string | null
  mustChangePassword?: boolean
}

/**
 * Создать пользователя: сервер — источник правды (hash+salt в db.yaml).
 * При успехе сервера — обновляем локальный каталог id от сервера.
 * При недоступности сервера — локально (offline) + флаг, чтобы UI мог предупредить.
 */
export async function addUser(input: NewUserInput): Promise<ActionResult<User>> {
  if (users.some((u) => u.username === input.username)) {
    return { ok: false, error: MSG.users.loginTaken }
  }
  const res = await apiCreateUser({
    username: input.username,
    password: input.password,
    role: input.role,
    fullName: input.fullName,
    birthDate: input.birthDate ?? null,
    email: input.email?.trim() || null,
    mustChangePassword: input.mustChangePassword ?? true,
  })
  if (res.ok && res.data) {
    const su = res.data.user
    const user: User = {
      id: su.id,
      username: su.username,
      password: input.password, // локальный каталог — только для offline-login
      role: su.role as Role,
      fullName: su.fullName || input.username,
      birthDate: su.birthDate ?? null,
      email: su.email ?? null,
      mustChangePassword: su.mustChangePassword ?? true,
    }
    users.push(user)
    saveUsers()
    return { ok: true, user }
  }
  if (res.code === 409) return { ok: false, error: MSG.users.loginTaken }
  // Сеть недоступна (code 0) — офлайн-создание с локальным id
  if (res.code === 0) {
    const user: User = {
      id: nextUserId++,
      username: input.username,
      password: input.password,
      role: input.role,
      fullName: input.fullName || input.username,
      birthDate: input.birthDate ?? null,
      email: input.email?.trim() || null,
      mustChangePassword: input.mustChangePassword ?? true,
    }
    users.push(user)
    saveUsers()
    return { ok: true, user, offline: true }
  }
  return { ok: false, error: res.error || MSG.users.notCreated }
}

export interface EditUserInput {
  fullName?: string
  password?: string
  role?: Role
  birthDate?: string | null
  email?: string | null
  mustChangePassword?: boolean
}

/**
 * Редактировать пользователя (логин не меняется). Сервер — источник правды;
 * локальный каталог и текущая сессия (если редактируем себя) синхронизируются.
 */
export async function editUser(id: number, input: EditUserInput): Promise<ActionResult<User>> {
  const local = users.find((u) => u.id === id)
  if (!local) return { ok: false, error: MSG.users.notFound }

  const email = input.email !== undefined ? (input.email?.trim() || null) : local.email
  const res = await apiUpdateUser(id, {
    fullName: input.fullName?.trim() || local.fullName,
    password: input.password || undefined,
    role: input.role ?? local.role,
    birthDate: input.birthDate ?? local.birthDate,
    email,
    mustChangePassword: input.mustChangePassword,
  })

  const applyLocal = (fromServer: boolean): User => {
    local.fullName = input.fullName?.trim() || local.fullName
    local.role = input.role ?? local.role
    local.birthDate = input.birthDate ?? local.birthDate
    local.email = email
    if (input.password) local.password = input.password
    if (input.mustChangePassword !== undefined) local.mustChangePassword = input.mustChangePassword
    if (fromServer && res.data?.user) {
      // сверяем с сервером (источник правды; формат — см. users.serializer.mjs)
      const su = res.data.user
      local.role = su.role as Role
      local.fullName = su.fullName || local.fullName
      local.birthDate = su.birthDate ?? null
      local.email = su.email ?? null
      local.mustChangePassword = su.mustChangePassword ?? local.mustChangePassword
    }
    // редактируем себя — обновляем текущую сессию в UI (роль сервер менять не даст)
    if (auth.user && auth.user.id === id) {
      auth.user.fullName = local.fullName
      auth.user.email = local.email
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(auth.user))
    }
    saveUsers()
    return local
  }

  if (res.ok && res.data) {
    return { ok: true, user: applyLocal(true) }
  }
  // Сеть недоступна — локальное редактирование (offline)
  if (res.code === 0) {
    return { ok: true, user: applyLocal(false), offline: true }
  }
  return { ok: false, error: res.error || 'Не удалось сохранить изменения' }
}

/** Удалить пользователя: сначала с сервера, затем локально. */
export async function removeUser(id: number): Promise<ActionResult<User>> {
  const res = await apiRemoveUser(id)
  const i = users.findIndex((u) => u.id === id)
  if (i === -1) {
    // Уже нет локально — если сервер подтвердил 404, ок; иначе ошибка
    if (res.ok || res.code === 404) return { ok: true }
    return { ok: false, error: res.error || MSG.users.notFound }
  }
  const [removed] = users.splice(i, 1)
  saveUsers()
  if (!res.ok && res.code !== 0 && res.code !== 404) {
    // Локально удалён, но сервер вернул ошибку (не сеть, не 404) — сообщаем
    return { ok: false, error: res.error || MSG.users.notRemoved }
  }
  return { ok: true, removed }
}

watch(users, saveUsers, { deep: true })

// ---------- Текущая сессия ----------
interface AuthState {
  user: SessionUser | null
  /** true, если последний вход выполнен в офлайн-режиме (бэкенд недоступен, проверен локальный каталог) */
  offline: boolean
  /**
   * Вход: сначала — сервер (источник правды для паролей с hash+salt).
   * При недоступности сервера (code 0 — сеть) — фолбэк на локальный каталог
   * (offline-режим). Неверные креденшелы (401) — фолбэк НЕ применяется:
   * сервер уже подтвердил, что логин/пароль неверны.
   * @returns true — вход выполнен (online или offline), false — неверные креденшелы
   */
  login(username: string, password: string): Promise<boolean>
  /** Смена пароля текущим пользователем. @returns true при успехе */
  changePassword(oldPassword: string, newPassword: string): Promise<boolean>
  /** Текст ошибки последней смены пароля (для формы) */
  lastChangeError: string
  logout(): void
  hasRole(...roles: Role[]): boolean
}

function localLogin(username: string, password: string): boolean {
  const u = users.find((x) => x.username === username && x.password === password)
  if (!u) {
    logEvent('login_failed', username, { reason: MSG.auth.wrongCredentials })
    return false
  }
  return true
}

export const auth = reactive<AuthState>({
  user: load<SessionUser | null>(STORAGE_KEYS.session, null),
  offline: false,
  lastChangeError: '',

  async login(username, password) {
    const online = await apiLogin(username, password)
    if (online.ok && online.data?.user) {
      // Online-вход: пользователь с сервера; локальный каталог для UI — сверяем по id
      const su = online.data.user
      const local = users.find((u) => u.id === su.id)
      this.user = {
        id: su.id,
        username: su.username,
        role: su.role as Role,
        fullName: local?.fullName || su.fullName || su.username,
        email: su.email ?? local?.email ?? null,
        mustChangePassword: !!su.mustChangePassword,
      }
      this.offline = false
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(this.user))
      logEvent('login_success', su.username, undefined, su.role)
      // Аудит: пароль ещё не сменён — фиксируем требование смены при этом входе
      if (su.mustChangePassword) {
        logEvent('password_change_required', su.username, { reason: 'пароль установлен администратором' }, su.role)
      }
      return true
    }
    if (online.code === 401) {
      // Сервер ответил: креденшелы неверны (не фолбэк)
      logEvent('login_failed', username, { reason: MSG.auth.wrongCredentials })
      return false
    }
    // Сервер недоступен (сеть) — офлайн-режим по локальному каталогу
    if (!localLogin(username, password)) return false
    const u = users.find((x) => x.username === username && x.password === password)!
    this.user = {
      id: u.id,
      username: u.username,
      role: u.role,
      fullName: u.fullName,
      email: u.email ?? null,
      mustChangePassword: u.mustChangePassword ?? true,
    }
    this.offline = true
    setSessionToken(null)
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(this.user))
    logEvent('login_offline', username, { reason: online.error }, u.role)
    if (u.mustChangePassword ?? true) {
      logEvent('password_change_required', username, { reason: 'пароль установлен администратором (офлайн-вход)' }, u.role)
    }
    return true
  },

  async changePassword(oldPassword, newPassword) {
    this.lastChangeError = ''
    const res = await apiChangePassword(oldPassword, newPassword)
    if (!res.ok) {
      this.lastChangeError =
        res.code === 400 && res.error === 'wrong_old_password'
        ? MSG.auth.wrongOldPassword
        : res.code === 400 && res.error === 'too_short'
        ? MSG.auth.passwordTooShort
        : res.code === 400 && res.error === 'same_password'
        ? MSG.auth.passwordSame
        : MSG.auth.changeUnavailable
      logEvent('password_change_failed', this.user?.username ?? 'unknown', { reason: res.error || 'network' })
      return false
    }
    if (this.user) {
      this.user.mustChangePassword = false
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(this.user))
    }
    logEvent('password_changed', this.user?.username ?? 'unknown', undefined, this.user?.role)
    return true
  },

  logout() {
    // Аудит: выход (пользователь ещё известен в this.user)
    if (this.user) logEvent('logout', this.user.username, undefined, this.user.role)
    this.user = null
    this.offline = false
    setSessionToken(null)
    localStorage.removeItem(STORAGE_KEYS.session)
  },

  hasRole(...roles) {
    return this.user !== null && roles.includes(this.user.role)
  },
})
