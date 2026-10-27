import { reactive } from 'vue'
import { load } from './services/storage'
import { STORAGE_KEYS } from './services/storage-keys'

// ─────────────────────────────────────────────────────────────
// Общее состояние раскрытия секций формы приёма (врач).
// Ключи совпадают с id-якорями разделов в DoctorView.vue,
// чтобы пункт подменю в сайдбаре (App.vue) мог не только
// проскроллить к секции, но и раскрыть её.
// ─────────────────────────────────────────────────────────────
export const SECTION_DEFAULTS: Record<string, boolean> = {
  'sec-complaints': true,
  'sec-anamnesis': true,
  'sec-lifeanamnesis': false,
  'sec-status': false,
  'sec-neuro': false,
  'sec-phq4': false,
  'sec-scales': false,
  'sec-diagnosis': false,
  'sec-exam': false,
  'sec-treatment': false,
  'sec-history': false,
}

export const openSections = reactive<Record<string, boolean>>({ ...SECTION_DEFAULTS })

// Применяем сохранённый режим секций по умолчанию сразу при загрузке модуля
{
  const mode = readSectionsDefault()
  if (mode === 'open') {
    for (const k in openSections) openSections[k] = true
  } else {
    for (const k in openSections) openSections[k] = false
  }
}

/**
 * Режим секций по умолчанию из настроек интерфейса (localStorage `ui-settings`).
 * 'open' — все секции формы приёма развёрнуты, 'closed' — свёрнуты.
 * Читаем при старте, чтобы применить до первой отрисовки.
 */
export function readSectionsDefault(): 'open' | 'closed' {
  const s = load<{ sectionsDefault?: string } | null>(STORAGE_KEYS.uiSettings, null)
  if (s && (s.sectionsDefault === 'open' || s.sectionsDefault === 'closed')) {
    return s.sectionsDefault
  }
  return 'closed'
}

/** Применить режим секций по умолчанию: развернуть/свернуть все секции. */
export function applySectionsDefault(mode: 'open' | 'closed') {
  for (const k in openSections) openSections[k] = mode === 'open'
}

/** Клик по заголовку секции: раскрыть/свернуть. */
export function toggleSection(id: string) {
  if (id in openSections) openSections[id] = !openSections[id]
}

/** Переход из подменю: гарантированно раскрыть секцию. */
export function openSection(id: string) {
  if (id in openSections) openSections[id] = true
}
