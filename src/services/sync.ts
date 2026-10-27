/**
 * sync.ts — единая точка записи «локально + на сервер».
 *
 * Паттерн (offline-first):
 *   1. Сначала пишем в локальное reactive-хранилище (store.ts) — UI обновляется мгновенно.
 *   2. Затем отправляем на бэкенд (backend.ts).
 *   3. При ошибке сети/сервера — кладём операцию в очередь (localStorage),
 *      которая сбрасывается при следующем успешном обращении.
 *
 * Важно: store.ts остаётся без изменений — sync.ts вызывает его API (addTestResult и т.д.),
 * а views не знают про бэкенд.
 */
import { addTestResult, addVisit, type TestInput, type VisitInput } from '../store'
import {
  apiAddTest,
  apiAddVisit,
  apiAddRecommendation,
  type AddVisitInput,
  type AddRecommendationInput,
  type AddTestInput,
} from './backend'
import { load, save } from './storage'
import { tsToDateStr } from './datetime'

const PENDING_KEY = 'pending_sync'

interface PendingOp {
  id: number
  kind: 'test' | 'recommendation' | 'visit'
  patientId: number
  payload: Record<string, unknown>
  at: number
}

function queuePending(op: Omit<PendingOp, 'id' | 'at'>): void {
  const ops = load<PendingOp[]>(PENDING_KEY, [])
  const id = ops.length ? Math.max(...ops.map((o) => o.id)) + 1 : 1
  ops.push({ ...op, id, at: Date.now() })
  save(PENDING_KEY, ops)
}

function toPayload<T extends object>(input: T): Record<string, unknown> {
  return Object.assign({}, input) as Record<string, unknown>
}

export function pendingCount(): number {
  return load<PendingOp[]>(PENDING_KEY, []).length
}

export function clearPending(): void {
  save(PENDING_KEY, [])
}

/**
 * Записать результат теста: локально + на сервер.
 * Дата во внутреннем формате — timestamp; на сервер уходит строкой 'YYYY-MM-DD'
 * (wire-формат бэкенда). Возвращает true, если сервер подтвердил (или данные
 * уже были — нет сервера).
 */
export function syncTest(patientId: number, input: TestInput): boolean {
  // 1. Локально — мгновенно (как сейчас в views)
  addTestResult(patientId, input)
  // 2. На сервер — асинхронно; при ошибке — в очередь
  const wire: AddTestInput = {
    type: input.type,
    score: input.score,
    date: input.date !== undefined ? tsToDateStr(input.date) : undefined,
  }
  apiAddTest(patientId, wire)
    .then((r) => {
      if (r.ok) return
      queuePending({ kind: 'test', patientId, payload: toPayload(wire) })
    })
    .catch(() => {
      queuePending({ kind: 'test', patientId, payload: toPayload(wire) })
    })
  return true
}

/**
 * Создать рекомендацию: сначала на сервер (источник правды), локально — после подтверждения.
 * Рекомендация привязана к пациенту, а не к приёму, поэтому локальной копии нет —
 * PatientView подгрузит её из GET record при следующем обращении.
 */
export function syncAddRecommendation(patientId: number, input: AddRecommendationInput): boolean {
  apiAddRecommendation(patientId, input)
    .then((r) => {
      if (!r.ok) queuePending({ kind: 'recommendation', patientId, payload: toPayload(input) })
    })
    .catch(() => {
      queuePending({ kind: 'recommendation', patientId, payload: toPayload(input) })
    })
  return true
}

/**
 * Записать приём: локально (мгновенно) + на сервер (асинхронно, при ошибке — в очередь).
 * Приём — тяжёлый объект: локальная запись идёт первой (UI не блокируется),
 * ошибки сервера не меняют поведение — операция попадает в pending-очередь.
 */
export function syncAddVisit(patientId: number, input: VisitInput): boolean {
  // 1. Локально — мгновенно
  addVisit(patientId, input)
  // 2. На сервер — асинхронно; при ошибке — в очередь
  apiAddVisit(patientId, input as unknown as AddVisitInput)
    .then((r) => {
      if (!r.ok) queuePending({ kind: 'visit', patientId, payload: toPayload(input) })
    })
    .catch(() => {
      queuePending({ kind: 'visit', patientId, payload: toPayload(input) })
    })
  return true
}
