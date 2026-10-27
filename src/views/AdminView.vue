<template>
  <div>
    <!-- Запросы на удаление приёмов (от врачей) -->
    <section v-if="requests.length" class="card">
      <h2>🗑 Запросы на удаление приёмов ({{ requests.length }})</h2>
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
    </section>

    <!-- Добавление пользователя -->
    <section class="card">
      <h2>＋ Добавить пользователя</h2>
      <form class="form" @submit.prevent="createUser">
        <label>ФИО
          <input v-model="form.fullName" placeholder="Иванов Иван" required />
        </label>
        <div class="grid-2">
          <label>Логин
            <input v-model="form.username" placeholder="login" required />
          </label>
          <label>Пароль
            <input v-model="form.password" type="password" minlength="3" required />
          </label>
        </div>
        <div class="grid-2">
          <label>Роль
            <select v-model="form.role" required>
              <option value="patient">Пациент</option>
              <option value="doctor">Врач</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
          <label>Дата рождения (для пациента)
            <input v-model="form.birthDate" type="date" />
          </label>
        </div>
        <label>Email
          <input v-model="form.email" type="email" placeholder="ivanov@example.com" />
        </label>
        <button class="btn btn-primary" type="submit">Создать</button>
        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>
        <p v-if="successMsg" class="success-text">{{ successMsg }}</p>
      </form>
    </section>

    <!-- Список пользователей -->
    <section class="card">
      <h2>👤 Пользователи ({{ users.length }})</h2>
      <table>
        <thead><tr><th>ФИО</th><th>Логин</th><th>Роль</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td><b>{{ u.fullName }}</b></td>
            <td class="muted">{{ u.username }}</td>
            <td><span class="badge" :class="u.role">{{ roleLabel(u.role) }}</span></td>
            <td>
              <button
                v-if="auth.user && u.id !== auth.user.id"
                class="btn btn-sm btn-danger"
                @click="askRemove(u)"
              >
                Удалить
              </button>
              <span v-else class="muted" style="font-size: 12px">это вы</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Настройки сервера: значения из settings.yaml + локальные переопределения -->
    <section class="card">
      <h2>🛠 Настройки сервера (settings.yaml)</h2>
      <p class="muted" style="font-size: 13px; margin: 0 0 12px">
        Базовые значения задаются файлом settings.yaml; изменения ниже хранятся локально
        (до отката). Конфиг-сервер: <b>{{ appConfig.loaded ? 'подключен' : 'недоступен — дефолты' }}</b>.
      </p>

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
      </div>
      <p v-if="cfgMsg" class="muted" style="font-size: 13px; margin: 10px 0 0">{{ cfgMsg }}</p>
    </section>

    <!-- Аудит входа/выхода (журнал событий, расширяемый) -->
    <section class="card">
      <h2>📝 Журнал входа/выхода ({{ events.length }})</h2>
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
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { auth, users, addUser, removeUser, type Role, type User } from '../auth'
import {
  deleteRequests,
  approveDeleteRequest,
  rejectDeleteRequest,
  getPatient,
  type DeleteRequest,
} from '../store'
import { formatVisitTs, formatDate } from '../services/datetime'
import { auditEvents, clearAuditLog, exportAuditLog, auditFileName } from '../services/audit'
import { EVENT_LABELS, type AuditEvent, type AuditEventType } from '../domain/audit'
import { STORAGE_KEYS } from '../services/storage-keys'
import { appConfig, logSettings, resetLogOverrides, saveLogOverrides } from '../services/app-config'
import { MSG } from '../services/messages'

// Имя файла для экспорта журнал: хранится в ui-settings (по умолчанию logs/audit.log).
// Браузер не пишет на диск сам — файл предлагается через «Сохранить как»,
// это значение подставляется как имя по умолчанию.
const logFile = ref(auditFileName())

function persistLogFile(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.uiSettings)
    const s = raw ? JSON.parse(raw) : {}
    s.auditLogFile = logFile.value.trim()
    localStorage.setItem(STORAGE_KEYS.uiSettings, JSON.stringify(s))
  } catch { /* битый JSON ignorируем */ }
}

function exportLog(): void {
  persistLogFile()
  exportAuditLog()
}

// ─── Аудит-лог (вход/выход) ───
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
  if (confirm('Очистить журнал входа/выхода? Действие необратимо.')) {
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

interface AdminForm {
  fullName: string
  username: string
  password: string
  role: Role
  birthDate: string
  email: string
}

const emptyForm = (): AdminForm => ({ fullName: '', username: '', password: '', role: 'patient', birthDate: '', email: '' })
const form = reactive<AdminForm>(emptyForm())
const errorMsg = ref('')
const successMsg = ref('')

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  patient: 'Пациент',
}

function roleLabel(r: Role): string {
  return ROLE_LABELS[r] ?? r
}

async function createUser(): Promise<void> {
  errorMsg.value = ''
  successMsg.value = ''
  const res = await addUser({ ...form })
  if (res.ok && res.user) {
    Object.assign(form, emptyForm())
    successMsg.value = res.offline
      ? MSG.users.createdOffline
      : `Пользователь «${res.user.fullName}» создан ✓`
  } else {
    errorMsg.value = res.error ?? MSG.users.notCreated
  }
}

async function askRemove(u: User): Promise<void> {
  if (!confirm(`Удалить пользователя «${u.fullName}» (${u.username})? Действие необратимо.`)) return
  await removeUser(u.id)
}
</script>
