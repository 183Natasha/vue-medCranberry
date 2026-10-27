/**
 * Дата и время приёмов.
 *
 * Хранение: дата приёма — Unix-timestamp в миллисекундах (число).
 * Отображение: системная локаль, дата + часы:минуты.
 *
 * Формат настраивается в «Настройках кабинета» (ключ ui-settings,
 * поле visitTimeFormat) и применяется ко всем спискам приёмов.
 */
import { ref } from 'vue'
import { STORAGE_KEYS } from './storage-keys'

// ---------- Форматы (настройка) ----------

export type VisitTimeFormat = 'dmy-24' | 'dmy-12' | 'ymd-24' | 'text'

export const VISIT_FORMATS: { v: VisitTimeFormat; label: string; sample: string }[] = [
  { v: 'dmy-24', label: 'День.Месяц.Год, 24 ч', sample: '24.10.2026 14:05' },
  { v: 'dmy-12', label: 'День.Месяц.Год, 12 ч', sample: '24.10.2026 2:05 PM' },
  { v: 'ymd-24', label: 'Год-Месяц-День, 24 ч', sample: '2026-10-24 14:05' },
  { v: 'text', label: 'Текстом (месяц словом)', sample: '24 октября 2026, 14:05' },
]

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function loadFormat(): VisitTimeFormat {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.uiSettings)
    if (!raw) return 'dmy-24'
    const s = JSON.parse(raw)
    if (typeof s.visitTimeFormat === 'string' && VISIT_FORMATS.some((f) => f.v === s.visitTimeFormat)) {
      return s.visitTimeFormat
    }
  } catch { /* битый JSON — значение по умолчанию */ }
  return 'dmy-24'
}

/** Реактивный текущий формат: обновляется из настроек (и из соседней вкладки). */
export const visitFormat = ref<VisitTimeFormat>(loadFormat())

export function setVisitFormat(v: VisitTimeFormat): void {
  visitFormat.value = v
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => { visitFormat.value = loadFormat() })
}

// ---------- Конвертация ----------

export const nowTs = (): number => Date.now()

/** Timestamp сегодняшней даты (локальная полночь) — для полей «только дата» */
export const todayDateTs = (): number => new Date().setHours(0, 0, 0, 0)

/** 'YYYY-MM-DD' → timestamp (день в местной временной зоне) */
export function dateStrToTs(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).getTime()
}

/** timestamp → 'YYYY-MM-DD' (местная зона) */
export function tsToDateStr(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** timestamp → значение для <input type="datetime-local"> ('YYYY-MM-DDTHH:mm') */
export function tsToDateTimeLocal(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** значение <input type="datetime-local"> → timestamp */
export function dateTimeLocalToTs(s: string): number {
  if (!s) return nowTs()
  const ts = new Date(s).getTime()
  return Number.isNaN(ts) ? nowTs() : ts
}

// ---------- Отображение ----------

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Timestamp → строка «дата + время» в настроенном формате.
 * Используется во всех списках приёмов (врач / пациент / админ).
 */
export function formatVisitTs(ts: number): string {
  if (typeof ts !== 'number' || Number.isNaN(ts)) return '—'
  const d = new Date(ts)
  const hh24 = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const dd = pad(d.getDate())
  const mo = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()

  switch (visitFormat.value) {
    case 'dmy-12': {
      const h12 = d.getHours() % 12 || 12
      const ampm = d.getHours() < 12 ? 'AM' : 'PM'
      return `${dd}.${mo}.${yyyy} ${h12}:${mm} ${ampm}`
    }
    case 'ymd-24':
      return `${yyyy}-${mo}-${dd} ${hh24}:${mm}`
    case 'text':
      return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${yyyy}, ${hh24}:${mm}`
    case 'dmy-24':
    default:
      return `${dd}.${mo}.${yyyy} ${hh24}:${mm}`
  }
}

/**
 * Timestamp → только дата (без времени) в формате, производном от настроенного
 * visitTimeFormat. Для полей «только дата»: дата рождения, даты тестов,
 * циклов лечения, дедлайны и т.п.
 */
export function formatDate(ts: number): string {
  if (typeof ts !== 'number' || Number.isNaN(ts)) return '—'
  const d = new Date(ts)
  const dd = pad(d.getDate())
  const mo = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  switch (visitFormat.value) {
    case 'ymd-24':
      return `${yyyy}-${mo}-${dd}`
    case 'text':
      return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${yyyy}`
    case 'dmy-12':
    case 'dmy-24':
    default:
      return `${dd}.${mo}.${yyyy}`
  }
}

/** Timestamp → короткая подпись для оси графика (без года) в производном формате */
export function formatDateShort(ts: number): string {
  const d = new Date(ts)
  const dd = pad(d.getDate())
  const mo = pad(d.getMonth() + 1)
  switch (visitFormat.value) {
    case 'ymd-24':
      return `${mo}-${dd}`
    case 'text':
    case 'dmy-12':
    case 'dmy-24':
    default:
      return `${dd}.${mo}`
  }
}

/** Серверная строка даты ('YYYY-MM-DD' или ISO) → дата в настроенном формате.
 *  Для wire-полей бэкенда (birthDate, due_date, starts_at/ends_at…). */
export function formatDateStr(s: string | null | undefined): string {
  if (!s) return '—'
  const ts = dateStrToTs(s.slice(0, 10))
  return Number.isNaN(ts) ? '—' : formatDate(ts)
}

// ---------- Ручной ввод дат (в настроенном формате) ----------
// Для текстовых полей вместо <input type="date"> (нативный инпут показывает
// дату в локали браузера и игнорирует настройку visitTimeFormat).

/** Подсказка-плейсхолдер для поля ручного ввода даты (по настроенному формату) */
export function userDatePlaceholder(): string {
  switch (visitFormat.value) {
    case 'ymd-24':
      return 'ГГГГ-ММ-ДД, напр. 2026-10-24'
    case 'text':
      return '24 октября 2026 или 24.10.2026'
    case 'dmy-12':
    case 'dmy-24':
    default:
      return 'ДД.ММ.ГГГГ, напр. 24.10.2026'
  }
}

/** 'YYYY-MM-DD' → строка в настроенном формате (для показа в текстовом поле) */
export function dateStrToDisplay(s: string | null | undefined): string {
  if (!s) return ''
  const ts = dateStrToTs(s.slice(0, 10))
  if (Number.isNaN(ts)) return ''
  const d = new Date(ts)
  const dd = pad(d.getDate())
  const mo = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  switch (visitFormat.value) {
    case 'ymd-24':
      return `${yyyy}-${mo}-${dd}`
    case 'text':
      return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${yyyy}`
    case 'dmy-12':
    case 'dmy-24':
    default:
      return `${dd}.${mo}.${yyyy}`
  }
}

/** Проверка корректности (y, m, d) и сборка 'YYYY-MM-DD' | null */
function mkDateStr(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  if (y < 1900 || y > 2100) return null
  const dt = new Date(y, m - 1, d)
  // защита от «33 марта» → апрель: компоненты должны совпадать
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(m)}-${p(d)}`
}

/**
 * Разбор даты, введённой вручную: 'ГГГГ-ММ-ДД', 'ДД.ММ.ГГГГ' (или с '/'),
 * либо 'D месяц ГГГГ' (текстовый формат, регистр не важен).
 * @returns 'YYYY-MM-DD' | null (пустая строка → null)
 */
export function parseUserDate(input: string): string | null {
  const s = input.trim().replace(/\s+/g, ' ')
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return mkDateStr(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) return mkDateStr(+m[3], +m[2], +m[1])
  m = s.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/i)
  if (m) {
    const stem = m[2].toLowerCase().slice(0, 3)
    const idx = MONTHS_GEN.findIndex((name) => name.startsWith(stem))
    if (idx !== -1) return mkDateStr(+m[3], idx + 1, +m[1])
  }
  return null
}
