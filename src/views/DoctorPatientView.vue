<template>
  <div v-if="patient">
    <!-- Шапка карточки пациента -->
    <section class="card patient-head">
      <div class="patient-head-row">
        <div>
          <h2>🪪 {{ patient.fullName }}</h2>
          <p class="muted" style="margin: 4px 0 0">
            логин: {{ patient.username }}<span v-if="patient.birthDate"> • дата рождения: {{ formatDateStr(patient.birthDate) }}</span>
          </p>
        </div>
        <div class="patient-head-nav">
          <RouterLink class="btn" to="/doctor">← Все пациенты</RouterLink>
          <RouterLink class="btn btn-primary" :to="`/doctor/patient/${patient.id}/visit/new`">
            ＋ Новый приём
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- История приёмов: клик по строке — просмотр приёма (readonly) -->
    <section class="card">
      <div class="dashboard-head">
        <h2>🩺 История приёмов</h2>
        <span class="badge">всего: {{ visits.length }}</span>
      </div>

      <p v-if="!visits.length" class="muted">
        Приёмов пока не было — начните <RouterLink :to="`/doctor/patient/${patient.id}/visit/new`">новый приём</RouterLink>.
      </p>
      <div v-else class="patients-scroll">
        <table class="patients-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Врач</th>
              <th>Состояние</th>
              <th>Диагноз</th>
              <th>Заметки</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in visits"
              :key="v.id"
              class="patient-row"
              title="Открыть приём (readonly)"
              @click="openVisit(v.id)"
            >
              <td><b>{{ formatVisitTs(v.date) }}</b></td>
              <td>{{ v.doctor }}</td>
              <td>
                <span :class="condClass(v.condition)">{{ v.condition }}</span>
              </td>
              <td>
                <span v-if="v.diagnosisCode || v.diagnosis">
                  <b v-if="v.diagnosisCode">{{ v.diagnosisCode }}</b> {{ v.diagnosis }}
                </span>
                <span v-else class="muted">—</span>
              </td>
              <td class="muted">{{ short(v.notes, 60) }}</td>
              <td>
                <span
                  v-if="pendingRequest(v.id)"
                  class="badge badge-warn"
                  :title="'Ожидает подтверждения администратором. Причина: ' + pendingRequest(v.id)!.reason"
                >⏳ на удалении</span>
                <button
                  v-else
                  class="btn btn-sm btn-danger"
                  title="Запросить удаление приёма"
                  @click.stop="openDeleteDialog(v)"
                >✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Рекомендации тестирования (с сервера) -->
    <section class="card">
      <div class="dashboard-head">
        <h2>📬 Рекомендации тестирования</h2>
        <button class="btn btn-primary" @click="openRecommendationForm">＋ Рекомендовать</button>
      </div>

      <p v-if="!recommendations.length" class="muted">
        Рекомендаций пока нет. Нажмите «Рекомендовать», чтобы назначить пациенту тест.
      </p>
      <div v-else class="patients-scroll">
        <table class="patients-table">
          <thead>
            <tr>
              <th>Тест</th>
              <th>Дедлайн</th>
              <th>Примечание</th>
              <th>Создана</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in recommendations" :key="r.id">
              <td><b>{{ r.scaleTitle }}</b></td>
              <td>{{ formatDateStr(r.due_date) }}</td>
              <td class="muted">{{ r.note || '—' }}</td>
              <td class="muted">{{ formatRecDate(r.created_at) }}</td>
              <td>
                <span v-if="r.done_at" class="badge badge-ok">✓ выполнено {{ formatRecDate(r.done_at) }}</span>
                <span v-else class="badge badge-warn">ожидается</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Модалка: новая рекомендация тестирования -->
    <div v-if="recForm.open" class="modal-overlay" @click.self="closeRecommendationForm">
      <div class="modal-box card">
        <h3>📬 Рекомендовать тестирование</h3>
        <p class="muted" style="margin: 4px 0 12px">
          Пациент увидит рекомендацию на своей странице и сможет пройти тест.
        </p>
        <label>Шкала
          <select v-model="recForm.scaleKey">
            <option v-for="s in SCALES" :key="s.key" :value="s.key">{{ s.title }}</option>
          </select>
        </label>
        <label>Дедлайн (необязательно)
          <input type="date" v-model="recForm.dueDate" />
        </label>
        <label>Примечание (необязательно)
          <input v-model="recForm.note" placeholder="Например: повторная оценка тревожности" maxlength="200" />
        </label>
        <p v-if="recForm.error" class="error-text">⚠️ {{ recForm.error }}</p>
        <div class="modal-actions">
          <button class="btn" @click="closeRecommendationForm">Отмена</button>
          <button class="btn btn-primary" :disabled="recForm.saving" @click="submitRecommendation">
            {{ recForm.saving ? 'Сохранение…' : 'Создать рекомендацию' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Модалка: причина удаления приёма -->
    <div v-if="deleteDialog.visit" class="modal-overlay" @click.self="closeDeleteDialog">
      <div class="modal-box card">
        <h3>🗑 Запросить удаление приёма</h3>
        <p class="muted" style="margin: 4px 0 12px">
          Приём от <b>{{ formatVisitTs(deleteDialog.visit.date) }}</b> (врач: {{ deleteDialog.visit.doctor }}).<br />
          Запрос будет отправлен администратору на подтверждение.
        </p>
        <label>
          Причина удаления:
          <select v-model="deleteDialog.reason">
            <option v-for="r in DELETE_REASONS" :key="r" :value="r">{{ r }}</option>
            <option value="__custom">Другая причина (указать свою)…</option>
          </select>
        </label>
        <label v-if="deleteDialog.reason === '__custom'">
          Своя причина:
          <input
            v-model="deleteDialog.customReason"
            placeholder="Например: приём создан по ошибке"
            maxlength="200"
          />
        </label>
        <p v-if="deleteDialog.error" class="error-text">{{ deleteDialog.error }}</p>
        <div class="modal-actions">
          <button class="btn" @click="closeDeleteDialog">Отмена</button>
          <button class="btn btn-primary" @click="submitDeleteRequest">Отправить запрос</button>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="card">
    <p class="muted">{{ MSG.visit.patientNotFound }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { onMounted, ref } from 'vue'
import { users, auth, type User } from '../auth'
import { conditionClass, getPatient, pendingDeleteRequest, requestVisitDeletion, type Visit } from '../store'
import { formatVisitTs, formatDateStr } from '../services/datetime'
import { MSG, DELETE_REASON_LIST } from '../services/messages'
import { SCALES } from '../scales'
import { apiGetPatient, apiAddRecommendation } from '../services/backend'

const route = useRoute()
const router = useRouter()

const patientId = computed(() => Number(route.params.id))
const patient = computed<User | undefined>(() =>
  users.find((u) => u.role === 'patient' && u.id === patientId.value)
)

// Свежие приёмы сверху
const visits = computed<Visit[]>(() => [...getPatient(patientId.value).visits].reverse())

function openVisit(visitId: number): void {
  router.push(`/doctor/patient/${patientId.value}/visit/${visitId}`)
}

// ── Запрос удаления приёма (подтверждает администратор) ──
// Тексты причин — в services/messages.ts ( MSG.deleteReasons )
const DELETE_REASONS = DELETE_REASON_LIST

const deleteDialog = reactive<{
  visit: Visit | null
  reason: string
  customReason: string
  error: string
}>({ visit: null, reason: DELETE_REASONS[0], customReason: '', error: '' })

function pendingRequest(visitId: number) {
  return pendingDeleteRequest(patientId.value, visitId)
}

function openDeleteDialog(v: Visit): void {
  deleteDialog.visit = v
  deleteDialog.reason = DELETE_REASONS[0]
  deleteDialog.customReason = ''
  deleteDialog.error = ''
}

function closeDeleteDialog(): void {
  deleteDialog.visit = null
}

function submitDeleteRequest(): void {
  const v = deleteDialog.visit
  if (!v) return
  const reason =
    deleteDialog.reason === '__custom'
      ? deleteDialog.customReason.trim()
      : deleteDialog.reason
  if (!reason) {
    deleteDialog.error = 'Укажите причину удаления'
    return
  }
  requestVisitDeletion(patientId.value, v.id, auth.user?.fullName || 'врач', reason)
  closeDeleteDialog()
}

function condClass(c: Visit['condition']): string {
  return conditionClass(c)
}

function short(s: string | undefined, n: number): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ---------- Рекомендации тестирования (с сервера — источник правды) ----------
interface RecRow {
  id: number
  scale_key: string
  due_date: string | null
  note: string
  created_at: string
  done_at: string | null
  scaleTitle: string
}

const recommendations = ref<RecRow[]>([])

async function loadRecommendations(): Promise<void> {
  const res = await apiGetPatient(patientId.value)
  if (res.ok && res.data) {
    const recs = res.data.record.recommendations || []
    recommendations.value = recs.map((r) => ({
      ...r,
      scaleTitle:
        SCALES[r.scale_key]?.title ||
        r.scale_key,
    })).sort((a, b) => {
      // Сначала активные (по дедлайну), затем выполненные (по дате)
      if (!a.done_at && !b.done_at) return (a.due_date || '').localeCompare(b.due_date || '')
      if (a.done_at !== b.done_at) return a.done_at ? 1 : -1
      return (b.done_at || '').localeCompare(a.done_at || '')
    })
  }
}

onMounted(() => {
  loadRecommendations()
})

/** Человекочитаемая дата рекомендации (created_at — ISO; формат — из настроек кабинета) */
function formatRecDate(iso: string | null): string {
  return formatDateStr(iso)
}

// Форма новой рекомендации
const recForm = reactive({
  open: false,
  saving: false,
  error: '',
  scaleKey: Object.keys(SCALES)[0],
  dueDate: '',
  note: '',
})

function openRecommendationForm(): void {
  recForm.open = true
  recForm.error = ''
  recForm.dueDate = ''
  recForm.note = ''
  recForm.scaleKey = Object.keys(SCALES)[0]
}

function closeRecommendationForm(): void {
  recForm.open = false
  recForm.error = ''
}

async function submitRecommendation(): Promise<void> {
  if (recForm.saving) return
  recForm.saving = true
  recForm.error = ''
  const res = await apiAddRecommendation(patientId.value, {
    scale_key: recForm.scaleKey,
    due_date: recForm.dueDate || null,
    note: recForm.note.trim(),
  })
  recForm.saving = false
  if (res.ok) {
    closeRecommendationForm()
    await loadRecommendations()
  } else {
    recForm.error = res.error || 'Не удалось создать рекомендацию'
  }
}
</script>

<style scoped>
/* Общие классы (.dashboard-head, .patients-table, .patients-scroll, .patient-row) — в main.css. */
.patient-head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.patient-head-row h2 {
  margin: 0;
}
.patient-head-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
/* Специфика: ограничиваем высоту скролл-области под историю приёмов */
.patients-scroll { max-height: 60vh; }
</style>
