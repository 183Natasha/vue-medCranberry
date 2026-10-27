<template>
  <section class="card login-card" style="max-width: 460px; margin-left: auto; margin-right: auto;">
    <!-- Заголовок + переключатель темы (💡) в правом углу формы -->
    <div class="login-head">
      <h2>🔐 Вход в систему</h2>
      <button
        type="button"
        class="theme-toggle"
        :title="themeIcon === '🫐' ? 'Сменить тему (Клюковка)' : themeIcon === '🌙' ? 'Сменить тему (тёмная)' : 'Сменить тему (светлая)'"
        :aria-label="'Сменить тему оформления'"
        @click="toggleTheme"
      >
        <!-- Иконки тем: 💡 / 🌙 — эмодзи (универсальны), 🫐 — inline-SVG,
             т.к. эмодзи «ягоды» (Unicode 13) не рендерится в Chrome без нового
             Noto Color Emoji (падает в пустой 'tofu'-квадрат). -->
        <svg v-if="themeIcon === '🫐'" class="theme-icon-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="13" r="8" fill="#f68084" />
          <!-- «шрамки» клюквы: тёмные точки -->
          <circle cx="9" cy="11" r="1" fill="rgba(0,0,0,0.35)" />
          <circle cx="14" cy="15" r="1" fill="rgba(0,0,0,0.35)" />
          <circle cx="15" cy="10" r="0.8" fill="rgba(0,0,0,0.3)" />
          <!-- блеск -->
          <circle cx="9" cy="8.5" r="1.4" fill="rgba(255,255,255,0.5)" />
          <!-- зелёная чашечка сверху -->
          <path d="M12 4 L10.5 2.2 A0.7 0.7 0 0 1 13.5 2.2 Z" fill="#6ee7b7" />
        </svg>
        <span v-else>{{ themeIcon }}</span>
      </button>
    </div>
    <form class="form login-form" @submit.prevent="submit">
      <p v-if="error" class="error-text">{{ MSG.auth.wrongCredentials }}</p>

      <label>Логин
        <input v-model="username" autocomplete="username" />
      </label>
      <label>Пароль
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <button class="btn btn-primary" type="submit">Войти</button>
    </form>
    <p class="muted" style="font-size: 13px">
      Демо-доступы: <code>admin/admin</code>, <code>doctor/doctor</code>, <code>patient/patient</code>
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '../auth'
import { MSG } from '../services/messages'
import { STORAGE_KEYS } from '../services/storage-keys'

const username = ref('')
const password = ref('')
const error = ref(false)

// ─── Переключатель темы (💡 в шапке формы) ───
// Работает с тем же ключом ui-settings, что и страница настроек.
// Цикл: светлая → тёмная → (Клюковка, если разблокирована пасхалкой) → светлая…
// «Клюковка» участвует в цикле, только если в этом браузере уже была
// активирована пасхалка (ключ cranberry-unlocked в localStorage).
type ThemeMode = 'light' | 'dark' | 'calculator'

function currentTheme(): ThemeMode {
  const r = document.documentElement
  if (r.classList.contains('theme-calc')) return 'calculator'
  if (r.classList.contains('theme-dark')) return 'dark'
  return 'light'
}

/** Полный цикл тем: с «Клюковкой», если она разблокирована пасхалкой. */
function themeCycle(): ThemeMode[] {
  const cranberryUnlocked = localStorage.getItem(STORAGE_KEYS.cranberryUnlocked) === '1'
    || currentTheme() === 'calculator' // уже применена — не теряем её в цикле
  return cranberryUnlocked
    ? ['light', 'dark', 'calculator']
    : ['light', 'dark']
}

/* Отображаемая иконка: 💡 (светлая), 🌙 (тёмная), 🫐 (Клюковка).
   Начальное значение — по классам на <html> (тему могли включить ранее). */
const themeIcon = ref(
  currentTheme() === 'calculator' ? '🫐' : currentTheme() === 'dark' ? '🌙' : '💡'
)

function applyTheme(mode: ThemeMode): void {
  const r = document.documentElement
  r.classList.toggle('theme-dark', mode === 'dark')
  r.classList.toggle('theme-calc', mode === 'calculator')
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.uiSettings)
    const s = raw ? JSON.parse(raw) : {}
    s.themeMode = mode
    s.darkMode = mode === 'dark'
    localStorage.setItem(STORAGE_KEYS.uiSettings, JSON.stringify(s))
  } catch {
    /* битый JSON — класс уже применён, сохранится при следующих настройках */
  }
}

function toggleTheme(): void {
  const cycle = themeCycle()
  const cur = currentTheme()
  const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length]
  applyTheme(next)
  themeIcon.value =
    next === 'calculator' ? '🫐' : next === 'dark' ? '🌙' : '💡'
}

const route = useRoute()
const router = useRouter()

async function submit(): Promise<void> {
  error.value = !(await auth.login(username.value, password.value))
  if (!error.value) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  }
}
</script>

<style scoped>
/* Заголовок и лампочка на одной линии: заголовок слева, кнопка справа */
.login-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.login-head h2 { margin: 0; flex: 1 1 auto; }
/* Круглая «тихая» кнопка в духе sidebar-collapse */
.theme-toggle {
  width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid var(--border); background: var(--field);
  font-size: 16px; line-height: 1; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background 0.15s, transform 0.1s;
}
.theme-toggle:hover { background: var(--bg); transform: scale(1.06); }
</style>
