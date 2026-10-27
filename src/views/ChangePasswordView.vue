<template>
  <section class="card login-card" style="max-width: 460px; margin-left: auto; margin-right: auto;">
    <h2>🔑 Смена пароля</h2>
    <p class="muted" v-if="auth.user?.mustChangePassword">
      Администратор задал вам временный пароль. Придумайте собственный — без этого доступ в систему ограничен.
    </p>
    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="success" class="success-text">{{ MSG.auth.passwordChanged }}</p>
    <form class="form" @submit.prevent="submit">
      <label>Текущий пароль
        <input v-model="oldPassword" type="password" autocomplete="current-password" required />
      </label>
      <label>Новый пароль
        <input v-model="newPassword" type="password" autocomplete="new-password" required minlength="3" />
      </label>
      <label>Повторите новый пароль
        <input v-model="confirmPassword" type="password" autocomplete="new-password" required minlength="3" />
      </label>
      <button class="btn btn-primary" type="submit" :disabled="loading">
        {{ loading ? 'Сохранение…' : 'Сменить пароль' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../auth'
import { MSG } from '../services/messages'

const router = useRouter()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  success.value = false
  if (newPassword.value !== confirmPassword.value) {
    error.value = MSG.auth.passwordMismatch
    return
  }
  if (newPassword.value.length < 3) {
    error.value = MSG.auth.passwordTooShort
    return
  }
  loading.value = true
  const ok = await auth.changePassword(oldPassword.value, newPassword.value)
  loading.value = false
  if (!ok) {
    error.value = auth.lastChangeError || MSG.auth.changeUnavailable
    return
  }
  success.value = true
  setTimeout(() => router.push('/'), 600)
}
</script>
