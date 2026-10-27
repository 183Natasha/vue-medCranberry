+<template>
  <div class="app" :class="{ 'app-collapsed': collapsed, 'app-no-sidebar': noSidebar, 'app-mobile-menu-open': mobileMenuOpen }">
    <!-- Backdrop мобильного меню: клик закрывает выдвижной сайдбар -->
    <div v-if="mobileMenuOpen && !noSidebar" class="mobile-menu-backdrop" @click="mobileMenuOpen = false"></div>
    <!-- Сайдбар: только после логина и не на странице входа -->
    <aside v-if="noSidebar === false" class="sidebar">
      <div class="sidebar-header">
        <!-- Логотип в сайдбаре: навигация на главную + счётчик пасхалки.
             В шапке Logo не дублируется — там он нужен только гостям (без сайдбара). -->
        <RouterLink to="/" class="sidebar-logo" @click="onEggClick">🏥 МедиКабинет</RouterLink>
        <button class="sidebar-collapse" title="Свернуть меню" @click="toggleCollapse">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.5" y="2.5" width="11" height="11" rx="2"/>
            <line x1="6.5" y1="2.5" x2="6.5" y2="13.5"/>
          </svg>
        </button>
      </div>

      <nav class="sidebar-nav">
        <RouterLink to="/" class="sidebar-link" data-tip="Главная">
          <span class="icon">🏠</span><span class="text">Главная</span>
        </RouterLink>
        <!-- Врач: список пациентов (главный дашборд) -->
        <RouterLink v-if="auth.hasRole('doctor')" to="/doctor" class="sidebar-link" data-tip="Пациенты"
          :class="{ active: route.path === '/doctor' }">
          <span class="icon">👥</span><span class="text">Пациенты</span>
        </RouterLink>
        <!-- Разделы формы приёма — доступны только на странице приёма -->
        <template v-if="auth.hasRole('doctor') && onVisitPage">
          <div class="sidebar-link sidebar-link-parent" :class="{ open: doctorMenuOpen }" title="Разделы приёма" @click="toggleDoctorMenu">
            <span class="icon">📋</span><span class="text">Разделы приёма</span>
            <span class="chev">▸</span>
          </div>
          <div class="sidebar-submenu" :class="{ open: doctorMenuOpen }">
            <!-- Пункт меню + иконка глаза (только в режиме настройки).
                 Скрытый раздел: перечёркнутый глаз + серая подсветка.
                 В режиме настройки показываются ВСЕ разделы (включая скрытые),
                 чтобы их можно было вернуть. -->
            <div
              v-for="item in displaySections"
              :key="item.id"
              class="sidebar-subitem"
              :class="{ 'subitem-hidden': hiddenSections.has(item.id), 'config-mode': configMode }"
            >
              <a class="sidebar-sublink" @click.prevent="gotoVisit(item.id)">{{ item.label }}</a>
              <!-- Раздел «Жалобы» — базовый, не скрывается (замок вместо глаза) -->
              <button
                v-if="configMode"
                type="button"
                class="eye-btn"
                :class="{ crossed: hiddenSections.has(item.id) }"
                :title="item.id === 'sec-complaints' ? 'Раздел «Жалобы» скрыть нельзя' : hiddenSections.has(item.id) ? 'Показать раздел' : 'Скрыть раздел'"
                :disabled="item.id === 'sec-complaints'"
                @click.stop="toggleSectionVisible(item.id)"
              >{{ item.id === 'sec-complaints' ? '🔒' : '👁' }}</button>
            </div>
            <!-- Вход/выход из режима настройки разделов -->
            <a class="sidebar-sublink sidebar-sublink-config" :class="{ 'config-active': configMode }" @click.prevent="toggleConfigMode">
              {{ configMode ? '✔ Готово' : '⚙ Настройка разделов…' }}
            </a>
          </div>
        </template>

        <RouterLink v-if="auth.hasRole('patient')" to="/patient" class="sidebar-link" data-tip="Моя карточка">
          <span class="icon">🪪</span><span class="text">Моя карточка</span>
        </RouterLink>
        <!-- Администратор: управление пользователями -->
        <RouterLink v-if="auth.hasRole('admin')" to="/admin/users" class="sidebar-link" data-tip="Пользователи">
          <span class="icon">👤</span><span class="text">Пользователи</span>
        </RouterLink>
      </nav>

      <!-- Раздел настроек (пациент и врач) -->
      <div class="sidebar-nav sidebar-nav-settings" v-if="showSettings">
        <RouterLink :to="settingsPath" class="sidebar-link" data-tip="Настройки">
          <span class="icon">⚙️</span><span class="text">Настройки</span>
        </RouterLink>
      </div>

      <div class="sidebar-footer" v-if="auth.user">
        <span class="sidebar-avatar">{{ initials(auth.user.fullName) }}</span>
        <div class="sidebar-user">
          <div class="name">{{ auth.user.fullName }}</div>
          <div class="role">{{ roleLabel }}</div>
        </div>
        <button class="btn btn-ghost" title="Выйти" @click="logout">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><path d="M10 10l4-4-4-4"/><path d="M14 6H6"/></svg>
        </button>
      </div>
    </aside>

    <!-- Пасхалка: модалка с копирайтом (5 быстрых кликов по логотипу в шапке) -->
    <Teleport to="body">
      <div v-if="eggVisible" class="egg-overlay" @click.self="eggVisible = false">
        <div class="egg-box">
          <button class="egg-close" title="Закрыть" @click="eggVisible = false">✕</button>
          <!-- Иконка «клюковка»: файл public/cranberry.png; если его нет — эмодзи-заглушка 🫐.
               3 быстрых клика по ней разблокируют тему «Клюковка» в настройках. -->
          <img
            v-if="!eggImgError"
            class="egg-icon egg-berry"
            :class="{ 'berry-unlocked': cranberryUnlocked }"
            :src="'/cranberry.png'"
            alt=""
            @error="eggImgError = true"
            @click="onBerryClick"
          />
          <span
            v-else
            class="egg-icon egg-icon-fallback egg-berry"
            :class="{ 'berry-unlocked': cranberryUnlocked }"
            @click="onBerryClick"
          >🫐</span>
          <h3 class="egg-title">МедиКабинет</h3>
          <!-- TODO: замените текст копирайта на нужный -->
          <p class="egg-text">© 2026 МедиКабинет — демо-приложение</p>
          <!-- Подтверждение разблокировки темы; скрыто если уже открыта -->
          <p v-if="berryJustUnlocked" class="egg-berry-hint">🫐 Тема «Клюковка» разблокирована — она появилась в настройках!</p>
        </div>
      </div>
    </Teleport>

    <!-- Контент: верхняя шапка + страницы -->
    <div class="app-body">
      <div class="app-content">
        <!-- Шапка: на логине не нужна; гостям — логотип и «Войти» -->
        <header v-if="!isLoginPage" class="header">
          <div class="container header-inner">
            <!-- Бургер: только на мобильных (ширина ≤760px, см. main.css), открывает сайдбар-шторку -->
            <button v-if="!noSidebar" class="btn btn-ghost nav-burger" title="Меню" aria-label="Открыть меню" @click="mobileMenuOpen = !mobileMenuOpen">☰</button>
            <!-- Логотип: для гостей (нет сайдбара) и когда сайдбар свёрнут —
                 там логотип скрыт, поэтому его место занимает шапка -->
            <RouterLink v-if="!auth.user || collapsed" to="/" class="logo" @click="onEggClick">🏥 <span>МедиКабинет</span></RouterLink>

            <div class="user-box" v-if="auth.user">
              <span class="user-name">{{ auth.user.fullName }}</span>
              <span class="badge" :class="auth.user.role">{{ roleLabel }}</span>
              <button class="btn btn-ghost" @click="logout">Выйти</button>
            </div>
          </div>
        </header>

        <main class="container main">
          <!-- Системные уведомления: единый блок на всех страницах (базовый шаблон) -->
          <SystemNotifBanner />
          <!-- key: страница пересоздаётся при смене параметров маршрута (напр. просмотр приёма → новый приём) -->
          <RouterView :key="route.fullPath" />
        </main>

        <footer class="footer">
          <div class="container">Демо-приложение. Данные хранятся локально в браузере.</div>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth, type Role } from './auth'
import { openSection } from './ui-sections'
import { load, save } from './services/storage'
import { STORAGE_KEYS } from './services/storage-keys'
import SystemNotifBanner from './components/SystemNotifBanner.vue'

const router = useRouter()
const route = useRoute()

// Сайдбар показывается только авторизованным и не на странице входа
const noSidebar = computed(() => isLoginPage.value || !auth.user)

// ─── Пасхалка: 5 кликов по логотипу за 2 секунды → окно копирайта ───
const isLoginPage = computed(() => route.path === '/login')
const eggVisible = ref(false)
const eggImgError = ref(false)
const eggClicks = ref(0)
let eggTimer: ReturnType<typeof setTimeout> | null = null

function onEggClick(): void {
  eggClicks.value++
  if (eggClicks.value === 1 && eggTimer) clearTimeout(eggTimer)
  if (eggClicks.value === 1) {
    eggTimer = setTimeout(() => { eggClicks.value = 0 }, 2000)
  }
  if (eggClicks.value >= 5) {
    eggClicks.value = 0
    if (eggTimer) { clearTimeout(eggTimer); eggTimer = null }
    eggVisible.value = true
  }
}

// ─── Пасхалка-2: 3 клика по картинке cranberry → тема «Клюковка» ───
// Разблокировка бессрочная (localStorage), после неё тема появляется
// в настройках и участвует в цикле переключателя 💡 на странице входа.
const cranberryUnlocked = ref<boolean>(
  localStorage.getItem(STORAGE_KEYS.cranberryUnlocked) === '1'
)
const berryClicks = ref(0)
let berryTimer: ReturnType<typeof setTimeout> | null = null
// Короткая подсказка «Клюковка разблокирована!» в модалке
const berryJustUnlocked = ref(false)

function onBerryClick(): void {
  // Уже разблокировано — клики ничего не меняют
  if (cranberryUnlocked.value) return
  berryClicks.value++
  if (berryClicks.value === 1 && berryTimer) clearTimeout(berryTimer)
  if (berryClicks.value === 1) {
    berryTimer = setTimeout(() => { berryClicks.value = 0 }, 2000)
  }
  if (berryClicks.value >= 3) {
    berryClicks.value = 0
    if (berryTimer) { clearTimeout(berryTimer); berryTimer = null }
    cranberryUnlocked.value = true
    localStorage.setItem(STORAGE_KEYS.cranberryUnlocked, '1')
    berryJustUnlocked.value = true
  }
}

// ─── Общие настройки интерфейса (localStorage `ui-settings`) ───
function applyUiSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.uiSettings)
    if (!raw) return
    const s = JSON.parse(raw)
    const r = document.documentElement
    if (typeof s.fontScale === 'number' && s.fontScale !== 1) {
      r.style.setProperty('--app-font-scale', String(s.fontScale))
    } else {
      r.style.removeProperty('--app-font-scale')
    }
    // Темы: .theme-dark / .theme-calc (взаимоисключающие). light — без класса.
    // theme-calc берём из схранённых настроек, darkMode — сохранили ради
    // обратной совместимости (LoginView-тоггл по-прежнему его переключает).
    r.classList.toggle('theme-dark', s.themeMode === 'dark' || (!s.themeMode && s.darkMode))
    r.classList.toggle('theme-calc', s.themeMode === 'calculator')
    r.classList.toggle('density-compact', s.density === 'compact')
    // Режим цветовой слепоты: классы на <html> переключают палитру (Okabe–Ito)
    r.classList.toggle('cvd-protanopia', s.colorBlind === 'protanopia')
    r.classList.toggle('cvd-deuteranopia', s.colorBlind === 'deuteranopia')
    r.classList.toggle('cvd-tritanopia', s.colorBlind === 'tritanopia')
  } catch {
    /* игнорируем битый JSON */
  }
}
onMounted(() => {
  applyUiSettings()
  // Перечитываем при смене вкладки (например, настройки менялись в другом окне)
  window.addEventListener('storage', applyUiSettings)
})

// ─── Состояние сайдбара ───────────────────────────────────────
// Свёрнуто (можно запомнить в localStorage)
const collapsed = ref<boolean>(localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === '1')

function toggleCollapse() {
  collapsed.value = !collapsed.value
  localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, collapsed.value ? '1' : '0')
}

// ─── Мобильное меню (сайдбар-шторка, ≤760px) ──────────────────
const mobileMenuOpen = ref(false)
// Переход по любой ссылке сайдбара закрывает шторку
watch(() => route.fullPath, () => { mobileMenuOpen.value = false })

// Закрытие пасхалки и мобильного меню по Esc
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    eggVisible.value = false
    mobileMenuOpen.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ─── Роли / логика ────────────────────────────────────────────
const ROLE_LABELS: Record<Role, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  patient: 'Пациент',
}

const roleLabel = computed(() =>
  auth.user ? ROLE_LABELS[auth.user.role as Role] ?? auth.user.role : ''
)

// Раздел «Настройки» виден всем авторизованным (у админа — расширенные секции)
const showSettings = computed(() => !!auth.user)
const settingsPath = computed(() =>
  auth.user && auth.hasRole('admin') ? '/admin/settings'
    : auth.user && auth.hasRole('doctor') ? '/doctor/settings'
    : '/patient/settings'
)

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => (p[0] || '').toUpperCase())
    .join('')
}

function logout() {
  auth.logout()
  // После выхода сессии нет: корень теперь только для авторизованных,
  // поэтому уходим на страницу входа (replace — чтобы «Назад» не возвращал в закрытую зону)
  router.replace('/login')
}

// ─── Подменю врача: разделы формы приёма + настройка видимости ────
// …/visit/new и …/visit/:visitId — страницы формы приёма (разделы есть только там)
const onVisitPage = computed(() => /^\/doctor\/patient\/\d+\/visit\//.test(route.path))

const doctorMenuOpen = ref(
  localStorage.getItem(STORAGE_KEYS.doctorMenuOpen) === '1' || onVisitPage.value
)

function toggleDoctorMenu() {
  doctorMenuOpen.value = !doctorMenuOpen.value
  localStorage.setItem(STORAGE_KEYS.doctorMenuOpen, doctorMenuOpen.value ? '1' : '0')
}

// Разделы формы приёма (порядок = порядок на странице)
const DOCTOR_SECTIONS = [
  { id: 'sec-complaints', label: 'Жалобы' },
  { id: 'sec-anamnesis', label: 'Анамнез заболевания' },
  { id: 'sec-lifeanamnesis', label: 'Анамнез жизни' },
  { id: 'sec-status', label: 'Общий статус' },
  { id: 'sec-neuro', label: 'Неврологический статус' },
  { id: 'sec-phq4', label: 'PHQ-4 (скрининг)' },
  { id: 'sec-scales', label: 'Тестирование' },
  { id: 'sec-diagnosis', label: 'Диагноз' },
  { id: 'sec-exam', label: 'Дообследование' },
  { id: 'sec-treatment', label: 'Лечение' },
] as const

// Пользователь может скрыть любые пункты разделов — выбор хранится в localStorage
// Идентификаторы разделов, которые скрывать нельзя (минимум один должен остаться)
const LOCKED_SECTIONS = new Set<string>(['sec-complaints'])

function loadHiddenSections(): Set<string> {
  const arr = load<string[]>(STORAGE_KEYS.doctorMenuHidden, [])
  // Нескрываемые разделы — всегда включены (даже если попали в localStorage раньше)
  return new Set<string>(arr.filter((id) => !LOCKED_SECTIONS.has(id)))
}

const hiddenSections = ref<Set<string>>(loadHiddenSections())

// Режим настройки: показываем все разделы с «глазами».
// Выйдя из режима, скрытые (перечёркнутый глаз) разделы исчезают из меню.
const configMode = ref(false)

function toggleConfigMode() {
  configMode.value = !configMode.value
}

function toggleSectionVisible(id: string) {
  if (LOCKED_SECTIONS.has(id)) return
  hiddenSections.value = new Set(hiddenSections.value) // новая ссылка для реактивности
  const s = hiddenSections.value
  if (s.has(id)) s.delete(id)
  else s.add(id)
  save(STORAGE_KEYS.doctorMenuHidden, [...s])
}

// В режиме настройки показываем все разделы, иначе — только видимые
const displaySections = computed(() =>
  configMode.value ? DOCTOR_SECTIONS : DOCTOR_SECTIONS.filter((s) => !hiddenSections.value.has(s.id))
)

/**
 * Прокрутка к разделу формы приёма (пункты меню показываются только
 * на странице приёма, поэтому переход по маршруту не нужен).
 */
function gotoVisit(anchorId: string) {
  // Раскрываем целевую секцию (если она была свёрнута)
  openSection(anchorId)
  const el = document.getElementById(anchorId)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Раздел «Лечение» доступен только если у выбранного пациента диагноз GAD /
// астено-вегетативный синдром / постковид. В App.vue не знаем выбор — показываем
// пункт всегда, но с пометкой «по показаниям».
const treatmentAvailable = computed(() => true)
</script>

<!-- Стили вынесены в src/assets/main.css -->
