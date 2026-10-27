/**
 * Базовый конфиг приложения (settings.yaml).
 *
 * Файл читается при запуске (GET /settings.yaml через Vite-прокси на
 * Node-сервер) и задаёт настройки ПО УМОЛЧАНИЮ. Изменения, которые
 * администратор делает в UI, хранятся локально (localStorage, ключ
 * из STORAGE_KEYS.appConfig) и действуют до отката к значениям файла.
 *
 * Расширение: новые секции settings.yaml автоматически попадают в
 * AppSettings — достаточно добавить поле в тип/дефолт при необходимости
 * типизации и (опционально) элемент управления в AdminView.
 */
import { reactive } from 'vue'
import { load as yamlLoad } from 'js-yaml'
import { load, save } from './storage'
import { STORAGE_KEYS } from './storage-keys'

/** Структура settings.yaml (дополняется по мере роста конфига) */
export interface AppSettings {
  superuser?: string
  theme?: { dark?: boolean }
  logs?: {
    enabled?: boolean
    /** localstorage — в браузере; file — на сервере (Node-бэкенд) */
    mode?: 'localstorage' | 'file'
    /** путь к файлу логов (режим file) / имя при экспорте */
    path?: string
    /** сколько событий копится перед отправкой на сервер */
    flushEvery?: number
  }
}

/** Режим хранения логов */
export type LogMode = 'localstorage' | 'file'

const DEFAULTS: AppSettings = {
  superuser: 'admin',
  theme: { dark: false },
  logs: { enabled: true, mode: 'localstorage', path: 'logs/audit.log', flushEvery: 5 },
}

/** Псевдонимы переопределяемых ключей, которые админ меняет в UI */
export type LogOverrides = {
  enabled?: boolean
  mode?: LogMode
  path?: string
  flushEvery?: number
}

interface AppConfigState {
  /** Загружен ли settings.yaml */
  loaded: boolean
  /** Значения из файла (источник по умолчанию) */
  file: AppSettings
  /** Локальные переопределения администратора (persist в localStorage) */
  overrides: LogOverrides
}

export const appConfig = reactive<AppConfigState>({
  loaded: false,
  file: { ...DEFAULTS },
  overrides: load<LogOverrides>(STORAGE_KEYS.appConfig, {}),
})

/** Эффективные настройки логирования: файл + переопределения админа */
export function logSettings(): { enabled: boolean; mode: LogMode; path: string; flushEvery: number } {
  const f = appConfig.file.logs || {}
  const o = appConfig.overrides
  return {
    enabled: o.enabled ?? f.enabled ?? DEFAULTS.logs!.enabled!,
    mode: o.mode ?? f.mode ?? DEFAULTS.logs!.mode!,
    path: o.path ?? f.path ?? DEFAULTS.logs!.path!,
    flushEvery: o.flushEvery ?? f.flushEvery ?? DEFAULTS.logs!.flushEvery!,
  }
}

/** Сохранить переопределения админа */
export function saveLogOverrides(o: LogOverrides): void {
  Object.assign(appConfig.overrides, o)
  save(STORAGE_KEYS.appConfig, { ...appConfig.overrides })
}

/** Сбросить переопределения — вернутся значения из settings.yaml */
export function resetLogOverrides(): void {
  appConfig.overrides = {}
  save(STORAGE_KEYS.appConfig, {})
}

/**
 * Загрузка settings.yaml при старте приложения.
 * Ошибки не аварийные: сервер может быть не запущен — работаем на дефолтах.
 */
export async function loadAppConfig(): Promise<void> {
  try {
    const res = await fetch('/settings.yaml', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const parsed = (yamlLoad(await res.text()) || {}) as AppSettings
    appConfig.file = { ...DEFAULTS, ...parsed } as AppSettings
  } catch {
    // конфиг-сервер недоступен (например, открыт только vite dev)
    console.warn('[app-config] settings.yaml недоступен — используются значения по умолчанию')
  } finally {
    appConfig.loaded = true
  }
}
