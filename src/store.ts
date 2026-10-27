import { reactive, watch } from 'vue'
import { load } from './services/storage'
import { STORAGE_KEYS } from './services/storage-keys'
import { hintOf } from './domain/test-interpretation'
import { nowTs, dateStrToTs, todayDateTs } from './services/datetime'

// ---------- Типы ----------
export type TestType = 'HADS_A' | 'HADS_D' | 'PHQ4' | 'PHQ9' | 'GAD7' | 'ISI'

export interface TestResult {
  id: number
  // Дата результата: timestamp (мс, локальная полночь). Отображение — formatDate/datetime.ts
  date: number
  type: TestType
  score: number
}

export type Condition = 'Улучшение' | 'Без изменений' | 'Ухудшение'

// Единый маппинг динамики состояния → CSS-класс (.cond-* в assets/main.css).
// Используется всеми ролями, чтобы цвет подсветки был одинаков везде.
export function conditionClass(c: Condition | string): string {
  if (c === 'Улучшение') return 'cond-up'
  if (c === 'Ухудшение') return 'cond-down'
  return 'cond-same'
}

export interface Visit {
  id: number
  // Дата-время приёма: Unix-timestamp (мс). Отображение — сервис services/datetime.ts
  date: number
  doctor: string
  condition: Condition
  notes: string
  // Жалобы: свободный текст + отмеченные критерии ГТР (нумерация «A1», «C3»…)
  complaints?: string
  criteria?: string[]
  // Анамнез заболевания: свободный текст + факторы (стресс, ПАВ, синкопы)
  anamnesis?: string
  anamnesisFactors?: string[]
  // Длительность симптомов (для алгоритма диагностики ГТР: критерий > 6 месяцев)
  // less_1m = менее 1 месяца, 1_6m = 1–6 месяцев, more_6m = более 6 месяцев
  symptomDuration?: string
  // Анамнез жизни: хронические заболевания (свободная форма) + группы чекбоксов
  chronicConditions?: string
  allergies?: string
  currentMeds?: string
  lifeFactors?: string[]
  // Операции и травмы в анамнезе (свободная форма)
  surgeriesTraumas?: string
  // Гемотрансфузии: факт + детали (годы, показания, осложнения)
  transfusions?: boolean
  transfusionsDetails?: string
  // Общий статус (осмотр): состояние, сознание, положение, поведение, АД, кожные покровы
  generalStatus?: Record<string, string>
  // Неврологический статус: краткий (для непрофильных) + развёрнутый (для невролога)
  neuroQuick?: Record<string, string>
  neuroDetailed?: Record<string, string>
  diagnosis?: string
  diagnosisCode?: string
  diagnosisReason?: string
  // Лечение ГТР (итеративный подбор терапии по схеме)
  // Текущее состояние курса и история завершённых циклов «лечение → оценка → корректировка»
  treatmentStage?: string
  treatmentDrug?: string
  treatmentDose?: string
  treatmentNote?: string
  // Дата назначения текущего препарата (отсчёт рекомендованного срока оценки эффекта) — timestamp
  treatmentStartDate?: number
  treatmentWeeks?: number
  treatmentEffect?: string
  treatmentHistory?: TreatmentCycle[]
  // Дообследование: назначенные исследования + клинические суждения о невозможности исключить патологию
  examStudies?: string[]
  examFlags?: Record<string, boolean>
  // Немедикаментозная терапия (выбранные методы)
  nonDrugTherapy?: string[]
  // Консультации специалистов: ключи специальностей (справочник — domain/treatment.ts);
  // для ключа 'other' — текст в consultOther
  consultSpecialties?: string[]
  consultOther?: string
  // Назначение авиандра (малитупердин) на этом приёме: чекбокс; дозировка — из справочника DRUG_INFO
  prescribeAviandr?: boolean
}

// Один завершённый цикл лечения: этап → препарат → длительность → эффект

// Один завершённый цикл лечения: этап → препарат → доза → длительность → эффект (+ примечание)
export interface TreatmentCycle {
  stage: string
  drug: string
  dose?: string
  note?: string
  weeks: number
  effect: string // full | partial | none
  date: number // дата фиксации оценки — timestamp (мс)
}

// Факторы анамнеза, влияющие на выбор терапии
export type AnamnesisFactor =
  | 'stress' // стрессовый фактор
  | 'substance' // употребление ПАВ
  | 'covid19' // COVID-19
  | 'gyn_pregnancy' // беременность
  | 'gyn_lactation' // лактация
  | 'gyn_postpartum' // послеродовой период

export interface PatientCard {
  diagnosis: string
  notes: string
}

export interface PatientRecord {
  card: PatientCard
  tests: TestResult[]
  visits: Visit[]
}

type PatientDataMap = Record<number, PatientRecord>

export interface TestTypeDef {
  name: string
  max: number
  /** Подсказка о категориях тяжести — генерируется из SEVERITY_BANDS (domain/test-interpretation.ts) */
  hint: string
}

// ---------- Хранилище ----------
// load<T> — общий сервис (src/services/storage.ts)

const DEFAULT_DATA: PatientDataMap = {}

export const patientData = reactive<PatientDataMap>(migrateDates(migrateVisitDates(load(STORAGE_KEYS.patientData, DEFAULT_DATA))))

/** Старые записи хранили дату строкой 'YYYY-MM-DD' — переводим на timestamp разово при загрузке.
 *  Мутация происходит до реактивной обёртки (watch её не увидит), поэтому
 *  при изменениях сразу пересохраняем localStorage вручную. */
function migrateVisitDates(data: PatientDataMap): PatientDataMap {
  let changed = false
  for (const rec of Object.values(data)) {
    for (const v of rec.visits) {
      if (typeof v.date === 'string') { v.date = dateStrToTs(v.date); changed = true }
      if (typeof v.treatmentStartDate === 'string') {
        v.treatmentStartDate = v.treatmentStartDate ? dateStrToTs(v.treatmentStartDate) : undefined
        changed = true
      }
    }
  }
  if (changed) localStorage.setItem(STORAGE_KEYS.patientData, JSON.stringify(data))
  return data
}

/** Даты результатов тестов и циклов лечения исторически хранились строками
 *  'YYYY-MM-DD' — переводим на timestamp (локальная полночь) разово при загрузке. */
function migrateDates(data: PatientDataMap): PatientDataMap {
  let changed = false
  const toDate = (d: unknown): number => {
    if (typeof d === 'string') { changed = true; return dateStrToTs(d) }
    if (typeof d === 'number' && !Number.isNaN(d)) return d
    return 0
  }
  for (const rec of Object.values(data)) {
    for (const t of rec.tests) t.date = toDate(t.date)
    for (const v of rec.visits) {
      for (const c of v.treatmentHistory || []) c.date = toDate(c.date)
    }
  }
  if (changed) localStorage.setItem(STORAGE_KEYS.patientData, JSON.stringify(data))
  return data
}

watch(
  patientData,
  (val) => localStorage.setItem(STORAGE_KEYS.patientData, JSON.stringify(val)),
  { deep: true }
)

function ensurePatient(id: number): PatientRecord {
  if (!patientData[id]) {
    patientData[id] = { card: { diagnosis: '—', notes: '' }, tests: [], visits: [] }
  }
  return patientData[id]
}

// ---------- Шкалы ----------
export const TEST_TYPES: Record<TestType, TestTypeDef> = {
  // hint генерируется из единого источника порогов — domain/test-interpretation.ts
  HADS_A: { name: 'HADS-A (тревога)', max: 21, hint: hintOf('HADS_A') },
  HADS_D: { name: 'HADS-D (депрессия)', max: 21, hint: hintOf('HADS_D') },
  PHQ4: { name: 'PHQ-4 (скрининг)', max: 12, hint: hintOf('PHQ4') },
  PHQ9: { name: 'PHQ-9 (депрессия)', max: 27, hint: hintOf('PHQ9') },
  GAD7: { name: 'GAD-7 (тревога)', max: 21, hint: hintOf('GAD7') },
  ISI: { name: 'ISI (инсомния)', max: 28, hint: hintOf('ISI') },
}

let nextId = Date.now()
export const genId = (): number => ++nextId

export interface TestInput {
  type: TestType
  score: number
  date?: number
}

export function addTestResult(patientId: number, input: TestInput): void {
  const p = ensurePatient(patientId)
  p.tests.push({ id: genId(), type: input.type, score: Number(input.score), date: input.date ?? todayDateTs() })
  p.tests.sort((a, b) => a.date - b.date)
}

export interface VisitInput {
  doctor: string
  condition: Condition
  notes: string
  complaints?: string
  criteria?: string[]
  anamnesis?: string
  anamnesisFactors?: string[]
  symptomDuration?: string
  chronicConditions?: string
  allergies?: string
  currentMeds?: string
  lifeFactors?: string[]
  surgeriesTraumas?: string
  transfusions?: boolean
  transfusionsDetails?: string
  generalStatus?: Record<string, string>
  neuroQuick?: Record<string, string>
  neuroDetailed?: Record<string, string>
  diagnosis?: string
  diagnosisCode?: string
  diagnosisReason?: string
  treatmentStage?: string
  treatmentDrug?: string
  treatmentDose?: string
  treatmentNote?: string
  treatmentStartDate?: number
  treatmentWeeks?: number
  treatmentEffect?: string
  treatmentHistory?: TreatmentCycle[]
  examStudies?: string[]
  examFlags?: Record<string, boolean>
  nonDrugTherapy?: string[]
  consultSpecialties?: string[]
  consultOther?: string
  prescribeAviandr?: boolean
  date?: number
}

export function addVisit(patientId: number, input: VisitInput): void {
  const p = ensurePatient(patientId)
  p.visits.push({ id: genId(), ...input, date: input.date ?? nowTs() })
  p.visits.sort((a, b) => b.date - a.date)
}

// ---------- Запросы на удаление приёмов ----------
// Врач помечает приём к удалению (с причиной) → администратор подтверждает или отклоняет.
// Актуален только один запрос на приём: повторный запрос заменяет предыдущий.
export interface DeleteRequest {
  id: number
  patientId: number
  visitId: number
  doctor: string // ФИО врача, запросившего удаление
  reason: string
  date: number // дата запроса — timestamp (мс)
}

// Разовая миграция: старые записи хранили дату строкой 'YYYY-MM-DD'
function migrateDeleteRequestDates(): void {
  let changed = false
  for (const r of deleteRequests) {
    if (typeof r.date === 'string') { r.date = dateStrToTs(r.date); changed = true }
  }
  if (changed) localStorage.setItem(STORAGE_KEYS.deleteRequests, JSON.stringify(deleteRequests))
}

export const deleteRequests = reactive<DeleteRequest[]>(
  load<DeleteRequest[]>(STORAGE_KEYS.deleteRequests, [])
)
migrateDeleteRequestDates()

watch(
  deleteRequests,
  (val) => localStorage.setItem(STORAGE_KEYS.deleteRequests, JSON.stringify(val)),
  { deep: true }
)

/** Врач: запросить удаление приёма (по ошибке созданная запись и т.п.). */
export function requestVisitDeletion(patientId: number, visitId: number, doctor: string, reason: string): void {
  const i = deleteRequests.findIndex((r) => r.patientId === patientId && r.visitId === visitId)
  const req: DeleteRequest = {
    id: i !== -1 ? deleteRequests[i].id : genId(),
    patientId,
    visitId,
    doctor,
    reason,
    date: todayDateTs(),
  }
  if (i !== -1) deleteRequests[i] = req
  else deleteRequests.push(req)
}

/** Есть ли ожидающий запрос на удаление данного приёма. */
export function pendingDeleteRequest(patientId: number, visitId: number): DeleteRequest | undefined {
  return deleteRequests.find((r) => r.patientId === patientId && r.visitId === visitId)
}

/** Администратор: подтвердить удаление — приём удаляется, запрос снимается. */
export function approveDeleteRequest(requestId: number): boolean {
  const i = deleteRequests.findIndex((r) => r.id === requestId)
  if (i === -1) return false
  const { patientId, visitId } = deleteRequests[i]
  const p = patientData[patientId]
  if (p) {
    const vi = p.visits.findIndex((v) => v.id === visitId)
    if (vi !== -1) p.visits.splice(vi, 1)
  }
  deleteRequests.splice(i, 1)
  return true
}

/** Администратор: отклонить запрос — приём остаётся, запрос снимается. */
export function rejectDeleteRequest(requestId: number): boolean {
  const i = deleteRequests.findIndex((r) => r.id === requestId)
  if (i === -1) return false
  deleteRequests.splice(i, 1)
  return true
}

export function updateCard(patientId: number, card: Partial<PatientCard>): void {
  const p = ensurePatient(patientId)
  p.card = { ...p.card, ...card }
}

export function getPatient(id: number): PatientRecord {
  return ensurePatient(id)
}

// Демо-данные для пациента с id=3 (patient/patient), если данных ещё нет
const DEMO_PATIENT_ID = 3
if (ensurePatient(DEMO_PATIENT_ID).tests.length === 0) {
  ensurePatient(DEMO_PATIENT_ID).card = {
    diagnosis: 'Тревожное расстройство, лёгкой степени',
    notes: 'Наблюдается с 2024 года.',
  }
  const demo: Array<[string, TestType, number]> = [
    ['2025-06-01', 'HADS_A', 13],
    ['2025-06-01', 'HADS_D', 11],
    ['2025-06-01', 'PHQ9', 16],
    ['2025-07-01', 'HADS_A', 11],
    ['2025-07-01', 'HADS_D', 9],
    ['2025-07-01', 'PHQ9', 13],
    ['2025-08-01', 'PHQ4', 7],
    ['2025-08-01', 'GAD7', 12],
    ['2025-09-01', 'HADS_A', 8],
    ['2025-09-01', 'HADS_D', 6],
    ['2025-09-01', 'PHQ9', 10],
    ['2025-10-01', 'PHQ4', 4],
    ['2025-10-01', 'GAD7', 7],
  ]
  demo.forEach(([date, type, score]) => {
    ensurePatient(DEMO_PATIENT_ID).tests.push({ id: genId(), date: dateStrToTs(date), type, score })
  })
}
