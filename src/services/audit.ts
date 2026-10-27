/**
 * Сервис аудит-лога: запись и чтение событий (вход/выход и др.).
 *
 * Поведение определяется settings.yaml (services/app-config.ts):
 *   logs.enabled — выключено → события не фиксируются
 *   logs.mode:
 *     localstorage — хранение в браузере (ключ auth-audit), как раньше
 *     file         — батчами отправляется на Node-сервер (POST /api/audit),
 *                    который дописывает их в logs.path. В памяти браузера
 *                    журнал также ведётся — для просмотра администратором.
 *
 * Расширение: новый тип события достаточно передать в logEvent()
 * (тип — из domain/audit.ts, AUDIT_EVENT_TYPES).
 */
import { reactive } from 'vue'
import { load, save } from './storage'
import { STORAGE_KEYS } from './storage-keys'
import { logSettings } from './app-config'
import type { AuditEvent, AuditEventType } from '../domain/audit'

/** Лимит записей в журнале: старые вытесняются (localStorage не резиновый) */
export const AUDIT_LOG_LIMIT = 500

let nextId = Date.now()
export const auditLog = reactive<AuditEvent[]>(
  load<AuditEvent[]>(STORAGE_KEYS.auditLog, [])
)

// ─── IP клиента ( берём у бэкенда: браузер свой адрес не знает ) ───
let cachedIp: string | null = null

/** Предзагрузить IP ( вызывается при старте приложения ); кэшируется */
export function preloadClientIp(): void {
  if (cachedIp !== null) return
  fetch('/api/ip')
    .then((r) => r.json())
    .then((d: { ip?: string }) => { if (d.ip) cachedIp = d.ip })
    .catch(() => { /* сервер недоступен — пишем без ip */ })
}

/** Записать событие в журнал. details — произвольные доп. данные. */
export function logEvent(
  type: AuditEventType,
  username: string,
  details?: Record<string, unknown>,
  role?: string
): void {
  const cfg = logSettings()
  // Логирование отключено в настройках — события не фиксируются
  if (!cfg.enabled) return

  const event: AuditEvent = {
    id: ++nextId,
    type,
    ts: Date.now(),
    username,
    role,
    ip: cachedIp ?? undefined,
    details,
  }

  // Журнал в памяти — всегда (просмотр администратором в UI)
  auditLog.push(event)
  // вытесняем самые старые, если превышен лимит
  if (auditLog.length > AUDIT_LOG_LIMIT) {
    auditLog.splice(0, auditLog.length - AUDIT_LOG_LIMIT)
  }

  if (cfg.mode === 'file') {
    // Файловый режим: копим батч и отправляем на сервер
    fileBuffer.push(event)
    if (fileBuffer.length >= cfg.flushEvery) flushToFile()
  } else {
    // Локальный режим: как раньше — persist в localStorage
    save(STORAGE_KEYS.auditLog, [...auditLog])
  }
}

// ─── Файловый режим: батч-отправка на Node-сервер ───
const fileBuffer: AuditEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

/** Отправить накопленные события на сервер (POST /api/audit) */
export function flushToFile(): Promise<void> {
  if (!fileBuffer.length) return Promise.resolve()
  const events = fileBuffer.splice(0, fileBuffer.length)
  return fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
    // keepalive — до 64КБ доставляется даже при закрытии вкладки
    keepalive: events.length <= 20,
  }).then(() => undefined).catch((err) => {
    // сервер недоступен — не теряем события молча, верём их в буфер
    console.warn('[audit] Не удалось отправить логи на сервер:', err)
    fileBuffer.unshift(...events)
  })
}

// Периодическая досылка (батч мог недобрать flushEvery, а вкладку закрыли)
if (typeof window !== 'undefined') {
  flushTimer = setInterval(() => { flushToFile() }, 10_000)
  window.addEventListener('beforeunload', () => {
    // навигация/закрытие: отправить то, что накопилось
    flushToFile()
    if (flushTimer) clearInterval(flushTimer)
  })
}

/** Записи журнал'а (новые — первыми) */
export function auditEvents(): AuditEvent[] {
  return [...auditLog].reverse()
}

/** Полная очистка журнала (для сброса настроек/демо-данных) */
export function clearAuditLog(): void {
  auditLog.splice(0, auditLog.length)
  save(STORAGE_KEYS.auditLog, [])
}

// ─── Экспорт журнал в файл ───
// Браузер не может писать на диск напрямую в произвольный путь —
// файл предлагается через «Сохранить как». Путь/имя по умолчанию —
// настраивается (логично держать рядом с остальными настройками интерфейса).

/** Имя файла по умолчанию (если в конфиге путь не задан) */
export const AUDIT_FILE_DEFAULT = 'logs/audit.log'

/** Имя файла по умолчанию для экспорта — из настроек логирования (settings.yaml + переопределения) */
export function auditFileName(): string {
  return logSettings().path || AUDIT_FILE_DEFAULT
}

/** Строки журнал'а в формате классического лога:
 *  2026-10-24 22:43 [LOGIN_SUCCESS] user=admin role=administrator */
export function auditLogText(): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = (ts: number) => {
    const x = new Date(ts)
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`
  }
  return [...auditLog]
    .map((e) => {
      const parts = [`user=${e.username}`]
      if (e.role) parts.push(`role=${e.role}`)
      if (e.details) parts.push(`details=${JSON.stringify(e.details)}`)
      return `${d(e.ts)} [${e.type.toUpperCase()}] ${parts.join(' ')}`
    })
    .join('\n')
}

/** Скачать журнал файлом (Blob → ссылка → клик). true — если было что сохранять */
export function exportAuditLog(): boolean {
  if (!auditLog.length) return false
  const blob = new Blob([auditLogText() + '\n'], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = auditFileName()
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return true
}
