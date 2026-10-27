// Общие хелперы для отображения динамики тестов — используются
// и страницей врача (DoctorView), и страницей пациента (PatientView),
// чтобы графики, бейджи и интерпретации выглядели одинаково.
import type { TestType } from './store'
import { TEST_TYPES } from './store'
import { interpret, severityTier } from './domain/test-interpretation'
import { formatDate } from './services/datetime'

// interpret/severityTier теперь живут в src/domain/test-interpretation.ts —
// переэкспортируем для совместимости с существующими импортами.
export { interpret, severityTier } from './domain/test-interpretation'

export interface ChartPoint {
  /** Дата результата — timestamp (мс, локальная полночь) */
  date: number
  score: number
  id: number
}

export type TestsByType = Record<string, ChartPoint[]>

// ---------- Хелперы для бейджей ----------

export function lastScore(testsByType: TestsByType, type: string): number {
  const arr = testsByType[type] || []
  return arr.length ? arr[arr.length - 1].score : 0
}

export function lastOf(testsByType: TestsByType, type: string): string {
  const arr = testsByType[type] || []
  return arr.length ? String(arr[arr.length - 1].score) : '—'
}

// Тренд: разница последнего и предпоследнего результата (отрицательный = улучшение)
export function trend(testsByType: TestsByType, type: string): number {
  const arr = testsByType[type] || []
  if (arr.length < 2) return 0
  return arr[arr.length - 1].score - arr[arr.length - 2].score
}

// Класс подсветки по тяжести: норма — ок, выше — нарастающая опасность.
// Пороги — из единого источника src/domain/test-interpretation.ts.
export function alertClass(testsByType: TestsByType, type: string, score: number): string {
  if (score === 0 && !((testsByType[type] || []).length)) return ''
  const idx = severityTier(type as TestType, score) // 0 = норма
  return ['', 'badge-ok', 'badge-warn', 'badge-danger', 'badge-danger'][Math.min(idx, 4)] ?? ''
}

// ---------- Значимые изменения в динамике ----------

// Порог значимости по типу шкалы (в баллах между двумя последовательными результатами)
export const SIGNIFICANT_DELTA: Partial<Record<TestType, number>> = {
  HADS_A: 4,
  HADS_D: 4,
  PHQ4: 3,
  PHQ9: 5,
  GAD7: 5,
  ISI: 6,
}

// Категория тяжести (0 = норма) — для определения смены категории:
// severityTier больше не дублируется здесь, см. domain/test-interpretation.ts

// Перечень предупреждений о значимых изменениях по всем шкалам
export function buildSignificantWarnings(testsByType: TestsByType): string[] {
  const out: string[] = []
  for (const [type, def] of Object.entries(TEST_TYPES).filter(([t]) => t !== 'HADS_D')) {
    const t = type as TestType
    const arr = testsByType[type] || []
    if (arr.length < 2) continue
    const prev = arr[arr.length - 2]
    const last = arr[arr.length - 1]
    const delta = last.score - prev.score
    const threshold = SIGNIFICANT_DELTA[t]
    const tierPrev = severityTier(t, prev.score)
    const tierLast = severityTier(t, last.score)
    if (threshold !== undefined && Math.abs(delta) >= threshold) {
      out.push(
        `${def.name}: изменение на ${delta > 0 ? '+' : ''}${delta} балл(ов) (${prev.score} → ${last.score}, ${formatDate(prev.date)} → ${formatDate(last.date)}) — ${delta > 0 ? 'ухудшение' : 'улучшение'}`
      )
    } else if (tierLast !== tierPrev) {
      out.push(
        `${def.name}: смена категории тяжести («${interpret(t, prev.score)}» → «${interpret(t, last.score)}», ${formatDate(last.date)}) — ${tierLast > tierPrev ? 'ухудшение' : 'улучшение'}`
      )
    }
  }
  // HADS: одновременный рост тревоги и депрессии
  const a = testsByType.HADS_A || []
  const d = testsByType.HADS_D || []
  if (a.length >= 2 && d.length >= 2) {
    const dA = a[a.length - 1].score - a[a.length - 2].score
    const dD = d[d.length - 1].score - d[d.length - 2].score
    if (dA >= 4 && dD >= 4) {
      out.push(`HADS: одновременный рост тревоги (+${dA}) и депрессии (+${dD}) — рекомендуем обсудить это с врачом`)
    }
  }
  return out
}

// ---------- HADS: серии и таблица ----------

export interface HadsSeries {
  name: string
  items: ChartPoint[]
  color: string
}

export function hadsSeriesOf(testsByType: TestsByType): HadsSeries[] {
  return [
    // Цвета — CSS-переменные: резолвятся в inline SVG и переключаются
    // в режиме цветовой слепоты (Okabe–Ito) вместе с остальной палитрой
    { name: 'Тревога (HADS-A)', items: testsByType.HADS_A || [], color: 'var(--chart-a)' },
    { name: 'Депрессия (HADS-D)', items: testsByType.HADS_D || [], color: 'var(--chart-b)' },
  ]
}

export interface HadsRow {
  /** Дата — timestamp (мс, локальная полночь); отображение — formatDate */
  date: number
  a: number | null
  d: number | null
}

export function hadsTableOf(testsByType: TestsByType): HadsRow[] {
  const byDate = new Map<number, { a: number | null; d: number | null }>()
  for (const r of testsByType.HADS_A || []) byDate.set(r.date, { a: r.score, d: byDate.get(r.date)?.d ?? null })
  for (const r of testsByType.HADS_D || []) {
    const row = byDate.get(r.date) || { a: null, d: null }
    row.d = r.score
    byDate.set(r.date, row)
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((x, y) => y.date - x.date)
}
