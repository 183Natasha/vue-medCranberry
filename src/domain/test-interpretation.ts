// ─────────────────────────────────────────────────────────────
// Единый источник знаний о границах категорий тяжести шкал.
// Раньше пороги дублировались в трёх местах:
//   - store.ts (TEST_TYPES.hint — текст подсказки),
//   - chart-helpers.ts (interpret — правила интерпретации),
//   - chart-helpers.ts (alertClass/severityTier — пороги подсветки).
// Теперь все берут их отсюда.
// ─────────────────────────────────────────────────────────────
import type { TestType } from '../store'

/** Одна категория тяжести: score < limit → эта категория. */
export interface SeverityBand {
  /** верхняя граница (невключительно) */
  limit: number
  /** название категории */
  label: string
}

/**
 * Категории тяжести по шкалам (порядок = нарастание тяжести).
 * limit последней полосы — 99 («тяжёлая и выше»).
 */
export const SEVERITY_BANDS: Record<TestType, SeverityBand[]> = {
  HADS_A: [
    { limit: 8, label: 'норма' },
    { limit: 11, label: 'сомнительно' },
    { limit: 99, label: 'клинически выражено' },
  ],
  HADS_D: [
    { limit: 8, label: 'норма' },
    { limit: 11, label: 'сомнительно' },
    { limit: 99, label: 'клинически выражено' },
  ],
  PHQ4: [
    { limit: 3, label: 'норма' },
    { limit: 6, label: 'лёгкая' },
    { limit: 9, label: 'средняя' },
    { limit: 99, label: 'тяжёлая' },
  ],
  PHQ9: [
    { limit: 5, label: 'минимальная' },
    { limit: 10, label: 'лёгкая' },
    { limit: 15, label: 'умеренная' },
    { limit: 20, label: 'тяжёлая' },
    { limit: 99, label: 'очень тяжёлая' },
  ],
  GAD7: [
    { limit: 5, label: 'минимальная' },
    { limit: 10, label: 'лёгкая' },
    { limit: 15, label: 'средняя' },
    { limit: 99, label: 'тяжёлая' },
  ],
  ISI: [
    { limit: 8, label: 'норма' },
    { limit: 15, label: 'субклиническая' },
    { limit: 22, label: 'умеренная' },
    { limit: 99, label: 'тяжёлая инсомния' },
  ],
}

/** Полосы (без label) — для tier/подсветки. */
export function severityLimits(type: string): number[] {
  return (SEVERITY_BANDS[type as TestType] || []).map((b) => b.limit).filter((l) => l < 99)
}

/** Интерпретация балла по шкале (название категории). */
export function interpret(type: string, score: number): string {
  const t = type as TestType
  const band = SEVERITY_BANDS[t]?.find((b) => score < b.limit)
  return band ? band.label : '—'
}

/** Категория тяжести (0 = норма) — для определения смены категории. */
export function severityTier(type: string, score: number): number {
  return severityLimits(type as TestType).filter((v) => score >= v).length
}

/** Текстовая подсказка по шкале для формы ввода:
 *  «0–7 норма, 8–10 сомнительно, 11+ клинически выражено». */
export function hintOf(type: TestType): string {
  const bands = SEVERITY_BANDS[type]
  const parts: string[] = []
  let lower = 0
  for (const b of bands) {
    if (b.limit >= 99) {
      parts.push(`${lower}+ ${b.label}`)
    } else {
      parts.push(`${lower}–${b.limit - 1} ${b.label}`)
      lower = b.limit
    }
  }
  return parts.join(', ')
}
