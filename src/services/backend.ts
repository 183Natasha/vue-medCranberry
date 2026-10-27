/**
 * backend.ts — API-клиент «МедиКабинета».
 *
 * Единая обёртка над fetch для всех маршрутов node-бэкенда (server/server.mjs).
 * Хранит sessionToken в localStorage (ключ STORAGE_KEYS.sessionToken).
 * При 401/403/сети-ошибке — возвращает { ok: false, error, code? } без исключения,
 * чтобы UI мог отобразить фолбэк (offline-режим и т.п.).
 *
 * Маршруты см. server/server.mjs.
 */
import { STORAGE_KEYS } from './storage-keys'
import type { User } from '../auth'

// ---------- Session token ----------
export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.sessionToken) || null
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEYS.sessionToken, token)
    else localStorage.removeItem(STORAGE_KEYS.sessionToken)
  } catch {
    /* noop */
  }
}

// ---------- Типы ответов ----------
export interface ApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  code?: number
}

/**
 * ЕДИНЫЙ формат пользователя на всех ручках (login, session, POST/PUT /api/users).
 * Зеркало серверного сериализатора server/users.serializer.mjs:
 * новое поле добавляется здесь + там — больше нигде.
 */
export interface ApiUserDto {
  id: number
  username: string
  role: string
  fullName?: string
  birthDate?: string | null
  email?: string | null
  /** true — пароль требует смены при первом входе */
  mustChangePassword?: boolean
}

/** Синоним: пользователь сессии — тот же формат */
export type SessionUserDto = ApiUserDto

export interface SystemNotificationDto {
  id: number
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  created_at: string
  created_by: string
  starts_at: string | null
  ends_at: string | null
  expires_at: string | string
  seen_by: number[]
}

export interface PatientRecordDto {
  id: number
  card: { diagnosis: string; notes: string }
  tests: Array<{ id: number; date: string; type: string; score: number }>
  visits: Array<Record<string, unknown>>
  recommendations: Array<{
    id: number
    scale_key: string
    due_date: string | null
    note: string
    created_at: string
    created_by_id: number
    created_by: string
    done_at: string | null
    result_id: number | null
  }>
}

// ---------- Базовый fetch ----------
async function request<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  auth: boolean = true,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const tok = getSessionToken()
    if (tok) headers['X-Session-Token'] = tok
  }
  let resp: Response
  try {
    resp = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    // Сеть недоступна (бэкенд не запущен / офлайн)
    return { ok: false, error: 'network: ' + (e instanceof Error ? e.message : String(e)), code: 0 }
  }
  let json: any = null
  const text = await resp.text()
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { ok: false, error: 'bad response' }
    }
  }
  if (!resp.ok) {
    return { ok: false, error: (json && json.error) || 'http_' + resp.status, code: resp.status, data: json }
  }
  return { ok: true, data: json as T, code: resp.status }
}

// ---------- AUTH ----------
export async function apiLogin(username: string, password: string): Promise<ApiResult<{ user: SessionUserDto; sessionToken: string }>> {
  const r = await request<{ ok: boolean; user?: SessionUserDto; sessionToken?: string }>(
    'POST',
    '/api/auth/login',
    { username, password },
    false,
  )
  if (!r.ok || !r.data) return { ok: false, error: r.error, code: r.code }
  const data = r.data
  if (!data.user || !data.sessionToken) {
    return { ok: false, error: 'malformed login response', code: r.code }
  }
  setSessionToken(data.sessionToken)
  return { ok: true, data: { user: data.user, sessionToken: data.sessionToken } }
}

export async function apiLogout(): Promise<ApiResult> {
  const r = await request('POST', '/api/auth/logout')
  setSessionToken(null)
  return r
}

export async function apiSession(): Promise<ApiResult<{ user: SessionUserDto | null }>> {
  return request<{ user: SessionUserDto | null }>('GET', '/api/auth/session', undefined, false)
}

/** Смена пароля самим пользователем (при первом входе или из настроек). */
export async function apiChangePassword(oldPassword: string, newPassword: string): Promise<ApiResult> {
  return request('POST', '/api/auth/change-password', { oldPassword, newPassword })
}

// ---------- NOTIFICATIONS ----------
export async function apiGetNotifications(): Promise<
  ApiResult<{ system: SystemNotificationDto[]; personal: unknown[] }>
> {
  return request<{ system: SystemNotificationDto[]; personal: unknown[] }>('GET', '/api/notifications')
}

/** Админ: список всех уведомлений (без фильтра по активности) — для CRUD. */
export async function apiListAllNotifications(): Promise<
  ApiResult<{ notifications: SystemNotificationDto[] }>
> {
  return request<{ notifications: SystemNotificationDto[] }>('GET', '/api/admin/notifications')
}

export interface CreateNotificationInput {
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  starts_at?: string | null
  ends_at?: string | null
  expires_at?: string | null
}

export async function apiCreateNotification(input: CreateNotificationInput): Promise<ApiResult<{ id: number }>> {
  return request<{ id: number }>('POST', '/api/notifications', input)
}

export async function apiDeleteNotification(id: number): Promise<ApiResult> {
  return request('DELETE', `/api/notifications/${id}`)
}

export async function apiMarkNotificationRead(id: number): Promise<ApiResult> {
  return request('POST', `/api/notifications/${id}/read`)
}

// ---------- USERS (admin) ----------
export interface NewUserDto {
  username: string
  password: string
  role: 'admin' | 'doctor' | 'patient'
  fullName?: string
  birthDate?: string | null
  email?: string | null
  /** Требовать смену пароля при первом входе (чекбокс админа, по умолчанию true) */
  mustChangePassword?: boolean
}

/** Ответ ручек создания/редактирования — тот же единый формат */
export type UserDto = ApiUserDto

export async function apiCreateUser(input: NewUserDto): Promise<ApiResult<{ user: UserDto }>> {
  return request<{ user: UserDto }>('POST', '/api/users', input)
}

export interface UpdateUserDto {
  fullName?: string
  password?: string
  role?: 'admin' | 'doctor' | 'patient'
  birthDate?: string | null
  email?: string | null
  /** Требовать смену пароля (чекбокс админа); undefined — не менять текущее значение */
  mustChangePassword?: boolean
}

export async function apiUpdateUser(id: number, input: UpdateUserDto): Promise<ApiResult<{ user: UserDto }>> {
  return request<{ user: UserDto }>('PUT', `/api/users/${id}`, input)
}

export async function apiRemoveUser(id: number): Promise<ApiResult> {
  return request('DELETE', `/api/users/${id}`)
}

// ---------- PATIENT RECORDS ----------
export async function apiListPatients(): Promise<ApiResult<{ records: PatientRecordDto[] }>> {
  return request<{ records: PatientRecordDto[] }>('GET', '/api/patients')
}

export async function apiGetPatient(id: number): Promise<ApiResult<{ record: PatientRecordDto }>> {
  return request<{ record: PatientRecordDto }>('GET', `/api/patients/${id}`)
}

export async function apiPutPatient(id: number, patch: Partial<PatientRecordDto>): Promise<ApiResult> {
  return request('PUT', `/api/patients/${id}`, patch)
}

export interface AddTestInput {
  type: string
  score: number
  /** wire-формат сервера: 'YYYY-MM-DD' (на фронте даты — timestamp, конвертация в sync.ts) */
  date?: string
}

export async function apiAddTest(patientId: number, input: AddTestInput): Promise<ApiResult<{ testId: number }>> {
  return request<{ testId: number }>('POST', `/api/patients/${patientId}/tests`, input)
}

export interface AddVisitInput extends Record<string, unknown> {
  condition?: string
  notes?: string
}

export async function apiAddVisit(patientId: number, input: AddVisitInput): Promise<ApiResult<{ visitId: number }>> {
  return request<{ visitId: number }>('POST', `/api/patients/${patientId}/visits`, input)
}

export interface AddRecommendationInput {
  scale_key: string
  due_date?: string | null
  note?: string
}

export async function apiAddRecommendation(patientId: number, input: AddRecommendationInput): Promise<ApiResult<{ recId: number }>> {
  return request<{ recId: number }>('POST', `/api/patients/${patientId}/recommendations`, input)
}

export async function apiMarkRecommendationDone(patientId: number, recId: number, resultId?: number): Promise<ApiResult> {
  return request('POST', `/api/patients/${patientId}/recommendations/${recId}/done`, { result_id: resultId ?? null })
}

// ---------- Диагностика ----------
export async function apiServerCheck(): Promise<ApiResult<{ ip: string }>> {
  return request<{ ip: string }>('GET', '/api/ip', undefined, false)
}

// ---------- Миграция localStorage → db.yaml ----------
// Собирает «медицинские» данные из localStorage в JSON-объект.
// Кнопка «Экспорт» в AdminPanel скачивает этот JSON; серверную сторону
// (запись в db.yaml) делает scripts/migrate-to-db.mjs.
// Важно: пароли в localStorage хранятся в plaintext (офлайн-каталог),
// но в db.yaml их не переносим — на сервере пароли живут как hash+salt.

export interface LocalExport {
  exported_at: string
  source: 'medicabinet_localstorage'
  users: Array<Pick<User, 'id' | 'username' | 'role' | 'fullName' | 'birthDate'>>
  patientData: Record<string, unknown>
  /** Локальные notifications, если они были (до бэкенда) */
  notes?: string
}

export function buildLocalExport(data: {
  users: User[]
  patientData: Record<string, unknown>
}): LocalExport {
  return {
    exported_at: new Date().toISOString(),
    source: 'medicabinet_localstorage',
    users: data.users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      fullName: u.fullName,
      birthDate: u.birthDate ?? null,
    })),
    patientData: data.patientData || {},
    notes: 'Пароли намеренно не включены — на сервере они хранятся как hash+salt.',
  }
}
