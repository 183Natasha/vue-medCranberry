<template>
  <div class="admin-panel">
    <!-- 1. Настройки сервера (settings.yaml + локальные переопределения) -->
    <section class="card admin-sec" :class="{ closed: sec.server }">
      <div class="admin-sec-head" @click="sec.server = !sec.server">
        <h3>🛠 Сервер</h3>
        <span class="chev" aria-hidden="true">{{ sec.server ? '▸' : '▾' }}</span>
      </div>
      <div v-show="!sec.server" class="admin-sec-body">
      <label style="flex-direction: row; align-items: center; gap: 8px; margin-bottom: 10px; white-space: nowrap">
        Логирование событий
        <input type="checkbox" v-model="logsCfg.enabled" />
        <span class="muted">{{ logsCfg.enabled ? 'включено' : 'выключено' }}</span>
      </label>

      <label style="margin-bottom: 10px">Режим хранения журнала
        <select v-model="logsCfg.mode">
          <option value="localstorage">localstorage — в браузере</option>
          <option value="file">file — на сервере (Node-бэкенд)</option>
        </select>
      </label>

      <label style="margin-bottom: 10px">Путь к файлу логов (режим file / имя при экспорте)
        <input v-model="logsCfg.path" placeholder="logs/audit.log" />
      </label>

      <div style="display: flex; gap: 10px; flex-wrap: wrap">
        <button class="btn btn-primary" @click="saveCfg">Применить</button>
        <button class="btn" @click="resetCfg">Откатить к settings.yaml</button>
        <button class="btn" @click="exportLocalData" title="Скачать JSON с данными из localStorage (для миграции в db.yaml)">📦 Экспорт localStorage</button>
      </div>
      <p v-if="cfgMsg" class="muted" style="font-size: 13px; margin: 10px 0 0">{{ cfgMsg }}</p>
      <p class="muted" style="font-size: 12px; margin: 8px 0 0">
        Импорт в сервер: <code>node scripts/migrate-to-db.mjs medicabinet-&lt;дата&gt;.json</code> (на машине с бэкендом).
      </p>
      </div>
    </section>

    <!-- 2b. Системные уведомления (CRUD) -->
    <section class="card admin-sec" :class="{ closed: sec.notifs }">
      <div class="admin-sec-head" @click="sec.notifs = !sec.notifs">
        <h3>📢 Уведомления ({{ notifications.length }})</h3>
        <button class="btn btn-sm" title="Создать уведомление" @click.stop="openCreateNotif">＋</button>
      </div>
      <div v-show="!sec.notifs" class="admin-sec-body">
        <p v-if="notifsLoading" class="muted">Загрузка…</p>
        <p v-else-if="!notifications.length" class="muted">Уведомлений пока нет. Нажмите «＋», чтобы создать.</p>
        <div v-else class="patients-scroll">
          <table>
            <thead>
              <tr><th>Тип</th><th>Заголовок</th><th>Текст</th><th>Период</th><th>Статус</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="n in notifications" :key="n.id">
                <td><span class="badge" :class="severityClass(n.severity)">{{ SEVERITY_LABELS[n.severity] || n.severity }}</span></td>
                <td><b>{{ n.title }}</b></td>
                <td class="muted" style="max-width: 260px">{{ n.body }}</td>
                <td class="muted" style="white-space: nowrap">
                  {{ n.starts_at ? formatNotifDate(n.starts_at) + ' →' : '' }}
                  {{ n.ends_at ? formatNotifDate(n.ends_at) : 'по истечению' }}
                </td>
                <td><span :class="notifStatus(n).cls">{{ notifStatus(n).label }}</span></td>
                <td>
                  <button class="btn btn-sm btn-danger" @click="deleteNotif(n)">Удалить</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 2. Журнал событий (расширяемый: вход/выход и др.) -->
    <section class="card admin-sec" :class="{ closed: sec.log }">
      <div class="admin-sec-head" @click="sec.log = !sec.log">
        <h3>📝 Журнал событий ({{ events.length }})</h3>
        <span class="chev" aria-hidden="true">{{ sec.log ? '▸' : '▾' }}</span>
      </div>
      <div v-show="!sec.log" class="admin-sec-body">
      <p v-if="!events.length" class="muted">Записей пока нет.</p>
      <div v-else class="patients-scroll">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Событие</th>
              <th>Логин</th>
              <th>IP</th>
              <th>Роль</th>
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in events" :key="e.id">
              <td>{{ formatVisitTs(e.ts) }}</td>
              <td>
                <span class="badge" :class="eventClass(e.type)">{{ EVENT_LABELS[e.type] || e.type }}</span>
              </td>
              <td><b>{{ e.username }}</b></td>
              <td class="muted">{{ e.ip || '—' }}</td>
              <td>{{ e.role ? roleLabel(e.role as Role) : '—' }}</td>
              <td class="muted">{{ detailsOf(e) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 10px">
        <button class="btn" @click="exportLog">💾 Сохранить в файл</button>
        <button class="btn btn-danger" @click="clearLog">Очистить журнал</button>
        <label style="flex-direction: row; align-items: center; gap: 6px; white-space: nowrap">файл:
          <input v-model="logFile" style="width: 200px" placeholder="logs/audit.log" />
        </label>
      </div>
      </div>
    </section>

    <!-- Запросы на удаление приёмов (от врачей) — тоже административная функция -->
    <section v-if="requests.length" class="card admin-sec" :class="{ closed: sec.requests }">
      <div class="admin-sec-head" @click="sec.requests = !sec.requests">
        <h3>🗑 Запросы на удаление приёмов ({{ requests.length }})</h3>
        <span class="chev" aria-hidden="true">{{ sec.requests ? '▸' : '▾' }}</span>
      </div>
      <div v-show="!sec.requests" class="admin-sec-body">
      <table>
        <thead><tr><th>Дата запроса</th><th>Врач</th><th>Пациент</th><th>Приём</th><th>Причина</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in requests" :key="r.id">
            <td>{{ formatDate(r.date) }}</td>
            <td><b>{{ r.doctor }}</b></td>
            <td>{{ patientName(r.patientId) }}</td>
            <td>{{ visitInfo(r.patientId, r.visitId) }}</td>
            <td class="muted">{{ r.reason }}</td>
            <td>
              <button class="btn btn-sm btn-danger" @click="approve(r)">Удалить приём</button>
              <button class="btn btn-sm" @click="reject(r)">Отклонить</button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>

    <!-- Модалка: создание системного уведомления -->
    <Teleport to="body">
      <div v-if="notifOpen" class="admin-modal-overlay" @click.self="closeCreateNotif">
        <div class="admin-modal">
          <div class="admin-modal-head">
            <h3>📢 Создать уведомление</h3>
            <button class="admin-modal-close" title="Закрыть" @click="closeCreateNotif">✕</button>
          </div>
          <form class="form" @submit.prevent="createNotif">
            <label>Тип
              <select v-model="notifForm.severity">
                <option value="info">Инфо</option>
                <option value="warning">Внимание</option>
                <option value="critical">Критично</option>
              </select>
            </label>
            <label>Заголовок
              <input v-model="notifForm.title" placeholder="Например: плановое обновление системы" required />
            </label>
            <label>Текст
              <textarea v-model="notifForm.body" rows="3" placeholder="Подробности для пациентов…" required></textarea>
            </label>
            <div class="grid-2">
              <label>Действует с (необязательно)
                <input v-model="notifForm.startsAt" type="date" />
              </label>
              <label>По дату (необязательно)
                <input v-model="notifForm.endsAt" type="date" />
              </label>
            </div>
            <p class="muted" style="font-size: 12px; margin: 6px 0 0">
              Без периода — уведомление активно сразу и до тех пор, пока не будет удалено.
            </p>
            <div style="display: flex; gap: 10px; margin-top: 10px">
              <button class="btn btn-primary" type="submit" :disabled="notifSaving">
                {{ notifSaving ? 'Сохранение…' : 'Создать' }}
              </button>
              <button class="btn" type="button" @click="closeCreateNotif">Отмена</button>
            </div>
            <p v-if="notifError" class="error-text">{{ notifError }}</p>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { users, type Role } from '../auth'
import {
  apiListAllNotifications,
  apiCreateNotification,
  apiDeleteNotification,
  buildLocalExport,
  type SystemNotificationDto,
  type CreateNotificationInput,
} from '../services/backend'
import {
  deleteRequests,
  approveDeleteRequest,
  rejectDeleteRequest,
  getPatient,
  patientData,
  type DeleteRequest,
} from '../store'
import { formatVisitTs, formatDate, formatDateStr } from '../services/datetime'
import { auditEvents, clearAuditLog, exportAuditLog, auditFileName } from '../services/audit'
import { EVENT_LABELS, type AuditEvent, type AuditEventType } from '../domain/audit'
import { STORAGE_KEYS } from '../services/storage-keys'
import { appConfig, logSettings, resetLogOverrides, saveLogOverrides } from '../services/app-config'
import { MSG } from '../services/messages'

// ─── Сворачивание секций (как у спойлеров настроек интерфейса) ───
const sec = reactive({ server: false, log: false, requests: false, notifs: false })

// Имя файла для экспорта журнала: хранится в ui-settings (по умолчанию logs/audit.log).
// Браузер не пишет на диск сам — файл предлагается через «Сохранить как»,
// это значение подставляется как имя по умолчанию.
const logFile = ref(auditFileName())

function persistLogFile(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.uiSettings)
    const s = raw ? JSON.parse(raw) : {}
    s.auditLogFile = logFile.value.trim()
    localStorage.setItem(STORAGE_KEYS.uiSettings, JSON.stringify(s))
  } catch { /* битый JSON игнорируем */ }
}

function exportLog(): void {
  persistLogFile()
  exportAuditLog()
}

// ─── Журнал событий ───
const events = computed<AuditEvent[]>(() => auditEvents())

function eventClass(t: AuditEventType): string {
  switch (t) {
    case 'login_success': return 'badge-ok'
    case 'login_failed':  return 'badge-danger'
    default:             return 'badge-warn'
  }
}

function detailsOf(e: AuditEvent): string {
  if (!e.details) return '—'
  // Простые значения-строки выводим как есть; сложные — JSON без обёрток
  const vals = Object.values(e.details)
  if (vals.length === 1 && typeof vals[0] === 'string') return vals[0]
  return JSON.stringify(e.details)
}

function clearLog(): void {
  if (confirm('Очистить журнал событий? Действие необратимо.')) {
    clearAuditLog()
  }
}

// ─── Настройки сервера (settings.yaml + переопределения) ───
const logsCfg = reactive({ ...logSettings() })
const cfgMsg = ref('')

function saveCfg(): void {
  saveLogOverrides({ ...logsCfg })
  cfgMsg.value = 'Сохранено ✓ (действует до отката к settings.yaml)'
  setTimeout(() => { cfgMsg.value = '' }, 3000)
}

function resetCfg(): void {
  if (!confirm('Вернуть значения из settings.yaml?')) return
  resetLogOverrides()
  Object.assign(logsCfg, logSettings())
  cfgMsg.value = 'Значения из settings.yaml восстановлены'
  setTimeout(() => { cfgMsg.value = '' }, 3000)
}

// ─── Миграция: экспорт localStorage → JSON (для scripts/migrate-to-db.mjs) ───
function exportLocalData(): void {
  if (!users.length && !Object.keys(patientData).length) {
    cfgMsg.value = MSG.migration.noData
    setTimeout(() => { cfgMsg.value = '' }, 5000)
    return
  }
  const exportData = buildLocalExport({
    users: [...users],
    patientData: { ...patientData },
  })
  const dateTag = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `medicabinet-${dateTag}.json`
  a.click()
  URL.revokeObjectURL(url)
  cfgMsg.value = 'JSON скачан ✓ Далее: node scripts/migrate-to-db.mjs <файл> на сервере'
  setTimeout(() => { cfgMsg.value = '' }, 8000)
}

// ─── Запросы на удаление приёмов ───
const requests = computed<DeleteRequest[]>(() => [...deleteRequests])

const patientName = (id: number): string => users.find((u) => u.id === id)?.fullName ?? `id ${id}`

// Краткое описание удаляемого приёма (дата + диагноз)
function visitInfo(patientId: number, visitId: number): string {
  const v = getPatient(patientId).visits.find((x) => x.id === visitId)
  if (!v) return MSG.visit.notFound
  return formatVisitTs(v.date)
}

function approve(r: DeleteRequest): void {
  if (confirm(`Подтвердить удаление приёма от ${visitInfo(r.patientId, r.visitId)} у пациента «${patientName(r.patientId)}»? Действие необратимо.`)) {
    approveDeleteRequest(r.id)
  }
}

function reject(r: DeleteRequest): void {
  rejectDeleteRequest(r.id)
}

// ─── Пользователи ───
// Раздел управления пользователями перенесён: левое меню → «Пользователи» (/admin/users)
// Журнал использует users для имён пациентов (запросы на удаление приёмов)

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  patient: 'Пациент',
}

function roleLabel(r: Role): string {
  return ROLE_LABELS[r] ?? r
}
// ─── Системные уведомления (CRUD через бэкенд) ───
const notifications = ref<SystemNotificationDto[]>([])
const notifsLoading = ref(false)

const SEVERITY_LABELS: Record<string, string> = {
  info: 'Инфо',
  warning: 'Внимание',
  critical: 'Критично',
}

function severityClass(s: string): string {
  return s === 'critical' ? 'badge-danger' : s === 'warning' ? 'badge-warn' : 'badge-ok'
}

async function loadNotifications(): Promise<void> {
  notifsLoading.value = true
  const res = await apiListAllNotifications()
  notifsLoading.value = false
  if (res.ok && res.data) {
    notifications.value = res.data.notifications
  } else if (res.code === 0) {
    // сервер недоступен — оставляем пустой (админка требует онлайн)
  }
}

function formatNotifDate(iso: string | null): string {
  return formatDateStr(iso)
}

function notifStatus(n: SystemNotificationDto): { label: string; cls: string } {
  const now = Date.now()
  const start = n.starts_at ? new Date(n.starts_at).getTime() : null
  const end = n.ends_at ? new Date(n.ends_at).getTime() : null
  if (start && start > now) return { label: 'ещё не началось', cls: 'muted' }
  if (end && end < now) return { label: 'завершено', cls: 'muted' }
  return { label: 'активно', cls: 'badge-ok' }
}

// Модалка создания
const notifOpen = ref(false)
const notifSaving = ref(false)
const notifError = ref('')
const notifForm = reactive({
  severity: 'info' as 'info' | 'warning' | 'critical',
  title: '',
  body: '',
  startsAt: '',
  endsAt: '',
})

function openCreateNotif(): void {
  notifOpen.value = true
  notifError.value = ''
  Object.assign(notifForm, { severity: 'info', title: '', body: '', startsAt: '', endsAt: '' })
}

function closeCreateNotif(): void {
  notifOpen.value = false
}

async function createNotif(): Promise<void> {
  if (notifSaving.value) return
  if (!notifForm.title.trim() || !notifForm.body.trim()) {
    notifError.value = 'Заполните заголовок и текст'
    return
  }
  notifSaving.value = true
  notifError.value = ''
  const input: CreateNotificationInput = {
    severity: notifForm.severity,
    title: notifForm.title.trim(),
    body: notifForm.body.trim(),
    starts_at: notifForm.startsAt ? new Date(notifForm.startsAt + 'T00:00:00').toISOString() : null,
    ends_at: notifForm.endsAt ? new Date(notifForm.endsAt + 'T23:59:59').toISOString() : null,
  }
  const res = await apiCreateNotification(input)
  notifSaving.value = false
  if (res.ok) {
    closeCreateNotif()
    await loadNotifications()
  } else {
    notifError.value = res.code === 0 ? MSG.notifications.serverUnavailable : (res.error || MSG.notifications.notCreated)
  }
}

async function deleteNotif(n: SystemNotificationDto): Promise<void> {
  if (!confirm(`Удалить уведомление «${n.title}»? Пациенты перестанут его видеть.`)) return
  const res = await apiDeleteNotification(n.id)
  if (res.ok) {
    notifications.value = notifications.value.filter((x) => x.id !== n.id)
  } else if (res.code !== 0) {
    alert(MSG.notifications.notRemoved)
  }
}

onMounted(() => {
  loadNotifications()
})
</script>

<style scoped>
/* Заголовки секций — тот же размер шрифта, что у карточек настроек интерфейса */
/* Ширина/рамка/поля — как у секций формы приёма (visit-section) */
/* Стили модалок (.admin-modal*) вынесены в main.css — используются и в UsersView */
.admin-panel { display: grid; gap: var(--margin-block, 18px); }
.admin-panel .card { margin-bottom: 0; padding: 8px 16px; box-shadow: none; }
.card h3 { margin: 0; font-size: 15px; }

/* Сворачиваемые секции */
/* Единая высота строки заголовка для всех секций: подгоняется под самую высокую
   (заголовок с кнопкой «＋»), шеврон получает такой же хитбокс */
.admin-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  min-height: var(--sec-head-h, 40px);
}
.admin-sec-head .chev {
  width: var(--sec-head-h, 40px);
  height: var(--sec-head-h, 40px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted, #888);
  font-size: 12px;
  border-radius: 8px;
  transition: transform 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
}
.admin-sec-head .chev:hover { background: var(--row-hover, rgba(0, 0, 0, 0.06)); }
.admin-sec-head .btn-sm { flex-shrink: 0; }
.admin-sec.closed .chev { transform: rotate(-90deg); }
</style>
