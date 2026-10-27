<template>
  <div>
    <!-- Карточка пациента -->
    <section class="card">
      <h2>🪪 Моя карточка</h2>
      <div class="grid-2">
        <div>
          <p><span class="muted">ФИО:</span> <b>{{ auth.user?.fullName }}</b></p>
          <p><span class="muted">Email:</span> {{ auth.user?.email || '—' }}</p>
          <p><span class="muted">Дата рождения:</span> {{ birthDate }}</p>
          <p><span class="muted">Диагноз:</span> {{ card.diagnosis }}</p>
        </div>
        <div>
          <p class="muted">Замечания врача:</p>
          <p>{{ card.notes || '—' }}</p>
        </div>
      </div>
    </section>

    <!-- Динамика тестов (сворачиваемый, как у врача) -->
    <section class="card">
      <!-- Предупреждение о значимых изменениях — видно даже при свёрнутом блоке -->
      <div v-if="significantWarnings.length" class="sig-warning-box">
        <p v-for="w in significantWarnings" :key="w" class="warning-text">⚠️ {{ w }}</p>
      </div>
      <CollapsibleBox>
        <template #title>📈 Динамика тестов</template>
        <template #badges>
          <span v-if="significantWarnings.length" class="badge badge-danger">⚠ значимые изменения: {{ significantWarnings.length }}</span>
        </template>
        <p v-if="!anyTests" class="muted">Результатов тестов пока нет.</p>

        <template v-if="hasHads">
          <CollapsibleBox title="HADS (тревога и депрессия)">
            <template #badges>
              <span class="badge" :class="alertClass('HADS_A', lastScore('HADS_A'))">
                🔴 тревога: {{ lastOf('HADS_A') }} / 21 — {{ interpret('HADS_A', lastScore('HADS_A')) }}
              </span>
              <span v-if="trend('HADS_A') !== 0" class="badge" :class="trend('HADS_A') < 0 ? 'badge-ok' : 'badge-danger'">
                {{ trend('HADS_A') < 0 ? '↓' : '↑' }}
              </span>
              <span class="badge" :class="alertClass('HADS_D', lastScore('HADS_D'))">
                🔵 депрессия: {{ lastOf('HADS_D') }} / 21 — {{ interpret('HADS_D', lastScore('HADS_D')) }}
              </span>
              <span v-if="trend('HADS_D') !== 0" class="badge" :class="trend('HADS_D') < 0 ? 'badge-ok' : 'badge-danger'">
                {{ trend('HADS_D') < 0 ? '↓' : '↑' }}
              </span>
            </template>
            <p class="muted chart-hint">{{ TEST_TYPES.HADS_A.hint }}</p>
            <div class="chart-block">
              <LineChart :series="hadsSeries" :max-score="21" title="HADS" />
            </div>
            <div class="grid-2">
              <div>
                <p class="criteria-title">🔴 HADS-A (тревога), {{ (testsByType.HADS_A || []).length }} изм.</p>
                <div class="chart-block">
                  <LineChart :items="testsByType.HADS_A || []" :max-score="21" title="HADS-A" />
                </div>
              </div>
              <div>
                <p class="criteria-title">🔵 HADS-D (депрессия), {{ (testsByType.HADS_D || []).length }} изм.</p>
                <div class="chart-block">
                  <LineChart :items="testsByType.HADS_D || []" :max-score="21" title="HADS-D" />
                </div>
              </div>
            </div>
            <table v-if="hadsTable.length">
              <thead><tr><th>Дата</th><th>Тревога (A)</th><th>Депрессия (D)</th></tr></thead>
              <tbody>
                <tr v-for="row in hadsTable" :key="row.date">
                  <td>{{ formatDate(row.date) }}</td>
                  <td :class="row.a !== null ? alertClass('HADS_A', row.a) : ''">{{ row.a ?? '—' }}</td>
                  <td :class="row.d !== null ? alertClass('HADS_D', row.d) : ''">{{ row.d ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </CollapsibleBox>
        </template>

        <CollapsibleBox
          v-for="(t, type) in TEST_TYPES"
          :key="type"
          v-show="type !== 'HADS_A' && type !== 'HADS_D' && (testsByType[type] || []).length"
          :title="t.name"
        >
          <template #badges>
            <span class="badge">{{ lastOf(type) }} / {{ t.max }}</span>
            <span class="badge" :class="alertClass(type, lastScore(type))">{{ interpret(type, lastScore(type)) }}</span>
            <span v-if="trend(type) !== 0" class="badge" :class="trend(type) < 0 ? 'badge-ok' : 'badge-danger'">
              {{ trend(type) < 0 ? '↓ улучшение' : '↑ ухудшение' }}
            </span>
          </template>
          <p class="muted chart-hint">{{ t.hint }}</p>
          <div class="chart-block">
            <LineChart :items="testsByType[type] || []" :max-score="t.max" :title="t.name" />
          </div>
          <table>
            <thead><tr><th>Дата</th><th>Балл</th><th>Интерпретация</th></tr></thead>
            <tbody>
              <tr v-for="r in [...(testsByType[type] || [])].reverse()" :key="r.id">
                <td>{{ formatDate(r.date) }}</td>
                <td><b>{{ r.score }}</b> / {{ t.max }}</td>
                <td :class="alertClass(type, r.score)">{{ interpret(type, r.score) }}</td>
              </tr>
            </tbody>
          </table>
        </CollapsibleBox>
      </CollapsibleBox>
    </section>

    <!-- Системные уведомления перенесены в базовый шаблон (App.vue → SystemNotifBanner) -->

    <!-- Рекомендации врача: пройти тест до дедлайна -->
    <section v-if="activeRecommendations.length" class="card">
      <h2>📬 Рекомендации врача</h2>
      <p class="muted">Врач рекомендовал(а) пройти следующие тесты. Нажмите «Пройти» — опросник откроется в окне.</p>
      <table>
        <thead><tr><th>Тест</th><th>Дедлайн</th><th>Примечание</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in activeRecommendations" :key="r.id" class="rec-row">
            <td><b>{{ r.scaleTitle || r.scale_key }}</b></td>
            <td>{{ formatDateStr(r.due_date) }}</td>
            <td class="muted">{{ r.note || '—' }}</td>
            <td>
              <button class="btn btn-sm btn-primary" @click="openScaleForm(r)">Пройти</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- История приёмов (только для чтения) -->
    <section class="card">
      <h2>🩺 История приёмов</h2>
      <p v-if="!visits.length" class="muted">Приёмов пока не было.</p>
      <table v-else>
        <thead><tr><th>Дата</th><th>Врач</th><th>Состояние</th><th>Заметки</th></tr></thead>
        <tbody>
          <tr v-for="v in visits" :key="v.id">
            <td>{{ formatVisitTs(v.date) }}</td>
            <td>{{ v.doctor }}</td>
            <td><span :class="conditionClass(v.condition)">{{ v.condition }}</span></td>
            <td class="muted">{{ v.notes }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Модальное окно: прохождение рекомендованного теста -->
    <div v-if="activeRec && activeScaleDef" class="modal-overlay" @click.self="closeScaleForm">
      <div class="modal-box card scale-modal-box">
        <ScaleForm
          :scale="activeScaleDef"
          :patient-id="patientId"
          :rec-id="activeRec.id"
          :due-date="activeRec.due_date"
          :rec-note="activeRec.note"
          @saved="onScaleSaved"
          @cancel="closeScaleForm"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeMount, onMounted, ref } from 'vue'
import { auth, users } from '../auth'
import { TEST_TYPES, conditionClass, getPatient } from '../store'
import { formatVisitTs, formatDate, formatDateStr } from '../services/datetime'
import { GAD_CRITERIA_TOTAL, SCALES } from '../scales'
import type { ScaleDef } from '../scales'
import { apiGetPatient, type PatientRecordDto } from '../services/backend'
import ScaleForm from '../components/ScaleForm.vue'
import {
  lastScore as lastScoreOf,
  lastOf as lastOfIn,
  trend as trendOf,
  interpret as interpretScore,
  alertClass as alertClassOf,
  buildSignificantWarnings,
  hadsSeriesOf,
  hadsTableOf,
  type ChartPoint,
} from '../chart-helpers'
import LineChart from '../components/LineChart.vue'
import CollapsibleBox from '../components/CollapsibleBox.vue'

const data = getPatient(auth.user!.id)
const card = computed(() => data.card)
const visits = computed(() => data.visits)

// Дата рождения берём из профиля пользователя
const me = computed(() => users.find((u) => u.id === auth.user!.id))
const birthDate = computed(() => formatDateStr(me.value?.birthDate))

// Группируем результаты тестов по типу
const testsByType = computed<Record<string, ChartPoint[]>>(() => {
  const map: Record<string, ChartPoint[]> = {}
  for (const r of data.tests) {
    ;(map[r.type] ||= []).push({ date: r.date, score: r.score, id: r.id })
  }
  return map
})

const anyTests = computed(() => data.tests.length > 0)
const hasHads = computed(() => (testsByType.value.HADS_A || []).length > 0 || (testsByType.value.HADS_D || []).length > 0)

// HADS: серии и таблица — общий построитель с врачом
const hadsSeries = computed(() => hadsSeriesOf(testsByType.value))
const hadsTable = computed(() => hadsTableOf(testsByType.value))

// Предупреждения о значимых изменениях — общий построитель с врачом
const significantWarnings = computed<string[]>(() => buildSignificantWarnings(testsByType.value))

// ---------- Хелперы для бейджей (обёртки над общим модулем) ----------
const T = () => testsByType.value
function lastScore(type: string): number {
  return lastScoreOf(T(), type)
}
function lastOf(type: string): string {
  return lastOfIn(T(), type)
}
function trend(type: string): number {
  return trendOf(T(), type)
}
function interpret(type: string, score: number): string {
  return interpretScore(type, score)
}
function alertClass(type: string, score: number): string {
  return alertClassOf(T(), type, score)
}

// ---------- Рекомендации и уведомления (с бэкенда) ----------
const patientId = auth.user!.id

interface RecRow {
  id: number
  scale_key: string
  due_date: string | null
  note: string
  scaleTitle: string
}

const activeRecommendations = ref<RecRow[]>([])
// Системные уведомления перенесены в базовый шаблон (SystemNotifBanner в App.vue)

// Модалка: какая рекомендация открыта
const activeRec = ref<RecRow | null>(null)
const activeScaleDef = computed<ScaleDef | null>(() =>
  activeRec.value ? (SCALES[activeRec.value.scale_key] ?? null) : null,
)

async function loadPatientBackend(): Promise<void> {
  const recRes = await apiGetPatient(patientId)
  if (recRes.ok && recRes.data) {
    const recs = recRes.data.record.recommendations || []
    activeRecommendations.value = recs
      .filter((r) => !r.done_at)
      .map((r) => ({
        id: r.id,
        scale_key: r.scale_key,
        due_date: r.due_date,
        note: r.note,
        scaleTitle: SCALES[r.scale_key]?.title || TEST_TYPES[r.scale_key as keyof typeof TEST_TYPES]?.name || r.scale_key,
      }))
  }
}

onMounted(() => {
  loadPatientBackend()
})

function openScaleForm(r: RecRow): void {
  activeRec.value = r
}

function closeScaleForm(): void {
  activeRec.value = null
  // Перезагрузить список (рекомендация помечена выполненной на сервере)
  loadPatientBackend()
}

function onScaleSaved(): void {
  closeScaleForm()
}
</script>

<style scoped>
/* Модалка с ScaleForm: широкая (до 14 вопросов), скролл по высоте */
.scale-modal-box { max-width: 640px; max-height: 85vh; overflow-y: auto; }
/* На мобильном (брейкпоинт совпадает с main.css 760px) модалка — на весь экран.
   Scoped-override обязателен: иначе data-attrib scoped-стиля (`.scale-modal-box[data-v-xxx]`)
   перекрывал бы глобальное `@media (max-width: 760px) { .scale-modal-box { max-width: none } }`
   из main.css и окно оставалось бы 640px шириной, вылезая за вьюпорт. */
@media (max-width: 760px) {
  .scale-modal-box { max-width: none; max-height: 92vh; }
}
</style>
