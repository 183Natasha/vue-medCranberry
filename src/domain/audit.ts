/**
 * Аудит-лог: журнал событий приложения (вход/выход и др.).
 *
 * Расширяемость: новые типы событий добавляются в union AUDIT_EVENT_TYPES
 * и в описания EVENT_LABELS — остальное (запись, хранение, просмотр)
 * не требует изменений.
 */

/** Типы событий аудита — добавляйте сюда новые виды записей */
export const AUDIT_EVENT_TYPES = [
  'login_success',   // успешный вход
  'login_failed',    // неуспешная попытка входа
  'login_offline',   // вход в офлайн-режиме (сервер недоступен)
  'logout',          // выход (явный или по окончании сессии)
  'password_changed',      // смена пароля пользователем
  'password_change_failed', // неуспешная попытка смены пароля
  'password_change_required', // вход с требованием сменить пароль (флаг админа)
] as const

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]

export interface AuditEvent {
  /** Уникальный id записи */
  id: number
  /** Тип события (см. AUDIT_EVENT_TYPES) */
  type: AuditEventType
  /** Дата-время события: Unix-timestamp (мс) */
  ts: number
  /** Логин пользователя, о котором событие (в т.ч. при неудачном входе) */
  username: string
  /** Роль пользователя на момент события ( если известна ) */
  role?: string
  /** IP-адрес клиента ( узнаётся у бэкенда через GET /api/ip; может отсутствовать, если сервер недоступен ) */
  ip?: string
  /** Доп. данные события ( причина, источник и т.п. ) — произвольный JSON */
  details?: Record<string, unknown>
}

/** Человекочитаемые названия для просмотра в интерфейсе */
export const EVENT_LABELS: Record<AuditEventType, string> = {
  login_success: 'Успешный вход',
  login_failed: 'Неудачный вход',
  login_offline: 'Вход (офлайн)',
  logout: 'Выход',
  password_changed: 'Смена пароля',
  password_change_failed: 'Неудачная смена пароля',
  password_change_required: 'Требуется смена пароля',
}
