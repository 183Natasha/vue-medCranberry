<template>
  <div>
    <!-- Список пользователей: создание «＋», редактирование (логин только для чтения) -->
    <section class="card">
      <div class="admin-sec-head">
        <h2 style="margin: 0">👤 Пользователи ({{ users.length }})</h2>
        <button class="btn btn-sm" title="Создать пользователя" @click="openCreateUser">＋ Создать</button>
      </div>

      <table style="margin-top: 12px">
        <thead><tr><th>ФИО</th><th>Логин</th><th>Email</th><th>Роль</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td><b>{{ u.fullName }}</b></td>
            <td class="muted">{{ u.username }}</td>
            <td class="muted">{{ u.email || '—' }}</td>
            <td><span class="badge" :class="u.role">{{ roleLabel(u.role) }}</span></td>
            <td style="white-space: nowrap">
              <button class="btn btn-sm" @click="openEditUser(u)">Изменить</button>
              <button
                v-if="auth.user && u.id !== auth.user.id"
                class="btn btn-sm btn-danger"
                style="margin-left: 6px"
                @click="askRemove(u)"
              >
                Удалить
              </button>
              <span v-else class="muted" style="font-size: 12px; margin-left: 6px">это вы</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Модалка: создание пользователя -->
    <Teleport to="body">
      <div v-if="createOpen" class="admin-modal-overlay" @click.self="closeCreateUser">
        <div class="admin-modal">
          <div class="admin-modal-head">
            <h3>＋ Создать пользователя</h3>
            <button class="admin-modal-close" title="Закрыть" @click="closeCreateUser">✕</button>
          </div>
          <form class="form" @submit.prevent="createUser">
            <label>ФИО
              <input v-model="createForm.fullName" placeholder="Иванов Иван" required />
            </label>
            <div class="grid-2">
              <label>Логин
                <input v-model="createForm.username" placeholder="login" required />
              </label>
              <label>Пароль
                <input v-model="createForm.password" type="password" minlength="3" required />
              </label>
            </div>
            <div class="grid-2">
              <label>Роль
                <select v-model="createForm.role" required>
                  <option value="patient">Пациент</option>
                  <option value="doctor">Врач</option>
                  <option value="admin">Администратор</option>
                </select>
              </label>
              <label>Дата рождения (для пациента)
                <!-- Текст в формате из настроек + выбор через календарь (кнопка 📅) -->
                <DateField
                  v-model="createBirthText"
                  @parsed="createForm.birthDate = $event ?? ''"
                />
                <span v-if="birthError" class="error-text">{{ birthError }}</span>
              </label>
            </div>
            <label>Email
              <input v-model="createForm.email" type="email" placeholder="ivanov@example.com" />
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="createForm.mustChangePassword" />
              <span>Сменить пароль</span>
            </label>
            <div style="display: flex; gap: 10px; margin-top: 4px">
              <button class="btn btn-primary" type="submit">Создать</button>
              <button class="btn" type="button" @click="closeCreateUser">Отмена</button>
            </div>
            <p v-if="createError" class="error-text">{{ createError }}</p>
            <p v-if="createOfflineMsg" class="muted" style="font-size: 13px">{{ createOfflineMsg }}</p>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Модалка: редактирование пользователя (логин не редактируется) -->
    <Teleport to="body">
      <div v-if="editOpen" class="admin-modal-overlay" @click.self="closeEditUser">
        <div class="admin-modal">
          <div class="admin-modal-head">
            <h3>✏️ Изменить пользователя</h3>
            <button class="admin-modal-close" title="Закрыть" @click="closeEditUser">✕</button>
          </div>
          <form class="form" @submit.prevent="saveEditUser">
            <!-- Логин: только для чтения -->
            <label>Логин (изменить нельзя)
              <input :value="editForm.username" disabled class="muted" />
            </label>
            <label>ФИО
              <input v-model="editForm.fullName" placeholder="Иванов Иван" required />
            </label>
            <div class="grid-2">
              <label>Роль
                <!-- Свою роль менять нельзя (сервер отклонит) -->
                <select v-model="editForm.role" required :disabled="isSelf">
                  <option value="patient">Пациент</option>
                  <option value="doctor">Врач</option>
                  <option value="admin">Администратор</option>
                </select>
              </label>
              <label>Дата рождения (для пациента)
                <!-- Текст в формате из настроек + выбор через календарь (кнопка 📅) -->
                <DateField
                  v-model="editBirthText"
                  @parsed="editForm.birthDate = $event ?? ''"
                />
                <span v-if="birthError" class="error-text">{{ birthError }}</span>
              </label>
            </div>
            <label>Email
              <input v-model="editForm.email" type="email" placeholder="ivanov@example.com" />
            </label>
            <label>Новый пароль (оставьте пустым, чтобы не менять)
              <input v-model="editForm.password" type="password" minlength="3" placeholder="•••" />
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="editForm.mustChangePassword" />
              <span>Сменить пароль</span>
            </label>
            <div style="display: flex; gap: 10px; margin-top: 4px">
              <button class="btn btn-primary" type="submit" :disabled="editSaving">Сохранить</button>
              <button class="btn" type="button" @click="closeEditUser">Отмена</button>
            </div>
            <p v-if="editError" class="error-text">{{ editError }}</p>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { auth, users, addUser, removeUser, editUser, type Role, type User } from '../auth'
import { MSG } from '../services/messages'
import { userDatePlaceholder, dateStrToDisplay, parseUserDate } from '../services/datetime'
import DateField from '../components/DateField.vue'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  patient: 'Пациент',
}

function roleLabel(r: Role): string {
  return ROLE_LABELS[r] ?? r
}

// Подсказка формата — из настройки «Формат дат» (реагирует на смену настройки)
const datePlaceholder = computed(() => userDatePlaceholder())

// ─── Создание ───
interface CreateForm {
  fullName: string
  username: string
  password: string
  role: Role
  birthDate: string
  email: string
  mustChangePassword: boolean
}

const emptyCreateForm = (): CreateForm => ({ fullName: '', username: '', password: '', role: 'patient', birthDate: '', email: '', mustChangePassword: true })
const createForm = reactive<CreateForm>(emptyCreateForm())
const createOpen = ref(false)
const createError = ref('')
const createOfflineMsg = ref('')
// Дата рождения: текст в настроенном формате (парсится в birthDate при вводе)
const createBirthText = ref('')
const birthError = ref('')

function openCreateUser(): void {
  Object.assign(createForm, emptyCreateForm())
  createError.value = ''
  createOfflineMsg.value = ''
  createBirthText.value = ''
  birthError.value = ''
  createOpen.value = true
}

function closeCreateUser(): void {
  createOpen.value = false
}

async function createUser(): Promise<void> {
  createError.value = ''
  createOfflineMsg.value = ''
  // Дата: непустой, но не разбираемый текст — ошибка (не создаём молча с пустой датой)
  if (createBirthText.value.trim() && !createForm.birthDate) {
    birthError.value = `Дата не распознана. Ожидается: ${datePlaceholder.value}`
    return
  }
  birthError.value = ''
  const res = await addUser({ ...createForm })
  if (res.ok && res.user) {
    createOpen.value = false
    if (res.offline) {
      createOfflineMsg.value = MSG.users.createdOffline
      setTimeout(() => { createOfflineMsg.value = '' }, 5000)
    }
  } else {
    createError.value = res.error ?? MSG.users.notCreated
  }
}

// ─── Редактирование (логин не меняется) ───
interface EditForm {
  id: number
  username: string
  fullName: string
  password: string
  role: Role
  birthDate: string
  email: string
  mustChangePassword: boolean
}

const editForm = reactive<EditForm>({ id: 0, username: '', fullName: '', password: '', role: 'patient', birthDate: '', email: '', mustChangePassword: true })
const editOpen = ref(false)
const editError = ref('')
const editSaving = ref(false)
// Дата рождения: текст в настроенном формате (парсится в birthDate при вводе)
const editBirthText = ref('')

const isSelf = computed(() => auth.user?.id === editForm.id)

function openEditUser(u: User): void {
  Object.assign(editForm, {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    password: '',
    role: u.role,
    birthDate: u.birthDate ?? '',
    email: u.email ?? '',
    // Флаг из каталога (по умолчанию true — «сменить пароль»)
    mustChangePassword: u.mustChangePassword ?? true,
  })
  editError.value = ''
  birthError.value = ''
  // Существующая дата — показываем в настроенном формате
  editBirthText.value = dateStrToDisplay(u.birthDate)
  editOpen.value = true
}

function closeEditUser(): void {
  editOpen.value = false
}

async function saveEditUser(): Promise<void> {
  if (editSaving.value) return
  editError.value = ''
  // Дата: непустой, но не разбираемый текст — ошибка
  if (editBirthText.value.trim() && !editForm.birthDate) {
    birthError.value = `Дата не распознана. Ожидается: ${datePlaceholder.value}`
    return
  }
  birthError.value = ''
  editSaving.value = true
  const res = await editUser(editForm.id, {
    fullName: editForm.fullName,
    password: editForm.password || undefined,
    role: editForm.role,
    birthDate: editForm.birthDate || null,
    email: editForm.email,
    mustChangePassword: editForm.mustChangePassword,
  })
  editSaving.value = false
  if (res.ok) {
    editOpen.value = false
    if (res.offline) {
      // офлайн: сохранено только локально, предупредим
      editError.value = ''
      alert('Сохранено локально (сервер недоступен). Изменения применятся в каталоге браузера.')
    }
  } else {
    editError.value = res.error ?? 'Не удалось сохранить изменения'
  }
}

// ─── Удаление ───
async function askRemove(u: User): Promise<void> {
  if (!confirm(`Удалить пользователя «${u.fullName}» (${u.username})? Действие необратимо.`)) return
  await removeUser(u.id)
}
</script>

<style scoped>
/* Чекбокс «Сменить пароль» в модалках создания/редактирования */
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.checkbox-label input { width: auto; margin: 0; }
</style>
