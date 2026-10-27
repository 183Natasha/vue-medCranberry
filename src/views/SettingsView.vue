<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { applySectionsDefault } from '../ui-sections'
import { load as loadFromStorage, save as saveToStorage } from '../services/storage'
import { STORAGE_KEYS } from '../services/storage-keys'
import { VISIT_FORMATS, formatVisitTs, nowTs, setVisitFormat, type VisitTimeFormat } from '../services/datetime'
import { auth } from '../auth'
import AdminPanel from '../components/AdminPanel.vue'

// ─────────────────────────────────────────────────────────────
// Настройки интерфейса (localStorage, ключ — STORAGE_KEYS.uiSettings):
// размер шрифта, плотность, ширина колонки, тема, режим ЦС.
// Применяется через CSS-переменные на :root и классы .theme-dark/.theme-calc/.cvd-*.
// ─────────────────────────────────────────────────────────────

type UiSettings = {
  fontScale: number      // 0.85 | 1 | 1.15
  density: 'compact' | 'normal'
  contentWidth: 'narrow' | 'normal' | 'wide'
  /** Тема оформления: светлая (по умолчанию) / тёмная / «Клюковка» (палитра #a6c0fe-#f68084) */
  themeMode: 'light' | 'dark' | 'calculator'
  /** Устаревшее поле (boolean) — мигрируете в themeMode */
  darkMode?: boolean
  sectionsDefault: 'open' | 'closed'
  /** Режим цветовой слепоты: выкл / протанопия / дейтеранопия / тританопия */
  colorBlind: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia'
  /** Формат даты и времени приёмов (история приёмов, шапка приёма) */
  visitTimeFormat: VisitTimeFormat
}

const DEFAULTS: UiSettings = {
  fontScale: 1,
  density: 'normal',
  contentWidth: 'normal',
  themeMode: 'light',
  darkMode: false,
  sectionsDefault: 'closed',
  colorBlind: 'off',
  visitTimeFormat: 'dmy-24',
}

function load(): UiSettings {
  const stored = loadFromStorage<Partial<UiSettings> | null>(STORAGE_KEYS.uiSettings, null)
  const merged: UiSettings = { ...DEFAULTS, ...(stored || {}) }
  // Миграция: если themeMode отсутствует (старые настройки с boolean darkMode),
  // вычисляем его из darkMode, чтобы переключатели на странице настроек были
  // синхронизированы с классами на <html> (App.vue применяет только theme-dark).
  if (!stored || stored.themeMode === undefined) {
    merged.themeMode = merged.darkMode ? 'dark' : 'light'
  }
  return merged
}

const s = reactive<UiSettings>(load())
// Держим реактивный формат сервиса в синхроне с настройками (живое применение)
setVisitFormat(s.visitTimeFormat)

// Администратору доступны дополнительные секции: сервер, пользователи, журнал
const isAdmin = !!auth.user && auth.hasRole('admin')

function persist() {
  saveToStorage(STORAGE_KEYS.uiSettings, s)
}

/** Применяет классы/переменные к <html> — работает без зависимости от persist. */
function apply() {
  const r = document.documentElement
  r.style.setProperty('--app-font-scale', String(s.fontScale))
  r.style.setProperty('--ui-content-max',
    s.contentWidth === 'narrow' ? '720px' : s.contentWidth === 'wide' ? '1360px' : '1140px')
  r.classList.toggle('density-compact', s.density === 'compact')
  // Темы: .theme-dark / .theme-calc (взаимоисключающие), светлая — без класса.
  // darkMode держим в sync для обратной совместимости (App.vue и LoginView
  // продолжают читать его, а LoginView-тоггл переключает light/dark).
  s.darkMode = s.themeMode === 'dark'
  r.classList.toggle('theme-dark', s.themeMode === 'dark')
  r.classList.toggle('theme-calc', s.themeMode === 'calculator')
  // Режим цветовой слепоты: класс на <html> переключает палитру (Okabe–Ito)
  r.classList.toggle('cvd-protanopia', s.colorBlind === 'protanopia')
  r.classList.toggle('cvd-deuteranopia', s.colorBlind === 'deuteranopia')
  r.classList.toggle('cvd-tritanopia', s.colorBlind === 'tritanopia')
}

const lastSectionsDefault = ref<'open' | 'closed' | null>(null)

// Применяем при каждом изменении: persist + apply; смену режима секций
// применяем к текущему состоянию сразу (не только при следующем входе)
watch(s, () => {
  persist()
  apply()
  setVisitFormat(s.visitTimeFormat)
  if (s.sectionsDefault !== lastSectionsDefault.value) {
    applySectionsDefault(s.sectionsDefault)
    lastSectionsDefault.value = s.sectionsDefault
  }
}, { deep: true })

// Применяем при загрузке страницы (тёмная тема, масштаб, плотность, ширина)
onMounted(() => {
  apply()
  lastSectionsDefault.value = s.sectionsDefault
})

function setSectionsDefault(v: 'open' | 'closed') {
  s.sectionsDefault = v
}
function setWidth(v: 'narrow' | 'normal' | 'wide') {
  s.contentWidth = v
}
function setDensity(v: 'compact' | 'normal') {
  s.density = v
}
function setFontScale(v: number) {
  s.fontScale = v
}
const THEMES = [
  { v: 'light', label: 'Светлая' },
  { v: 'dark', label: 'Тёмная' },
  { v: 'calculator', label: 'Клюковка', locked: true },
] as const

// Тема «Клюковка» — пасхалка: разблокируется 3 кликами по cranberry
// в модалке копирайта (сама модалка — 5 кликов по логотипу).
// После разблокировки тема доступна и в настройках, и в цикле
// переключателя 💡 на странице входа. Уже применённую тему не прячем.
const cranberryUnlocked = ref(
  localStorage.getItem(STORAGE_KEYS.cranberryUnlocked) === '1'
    || load().themeMode === 'calculator'
)
// Подхватываем разблокировку «на лету» (если открыли в другом окне/вкладке)
function syncUnlock() {
  cranberryUnlocked.value =
    localStorage.getItem(STORAGE_KEYS.cranberryUnlocked) === '1'
    || s.themeMode === 'calculator'
}
window.addEventListener('focus', syncUnlock)
window.addEventListener('storage', syncUnlock)
onBeforeUnmount(() => {
  window.removeEventListener('focus', syncUnlock)
  window.removeEventListener('storage', syncUnlock)
})

// Доступные темы: светлая и тёмная — всегда; «Клюковка» — после разблокировки
const visibleThemes = computed(() =>
  THEMES.filter((t) => !('locked' in t && t.locked) || cranberryUnlocked.value)
)

function setThemeMode(v: UiSettings['themeMode']) {
  s.themeMode = v
}
const WIDTHS = [
  { v: 'narrow', label: 'Узкая' },
  { v: 'normal', label: 'Обычная' },
  { v: 'wide', label: 'Широкая' },
] as const
const SCALES = [
  { v: 0.85, label: 'Мелкий' },
  { v: 1, label: 'Обычный' },
  { v: 1.15, label: 'Крупный' },
] as const
const CVD_MODES = [
  { v: 'off', label: 'Выкл' },
  { v: 'protanopia', label: 'Протанопия' },
  { v: 'deuteranopia', label: 'Дейтеранопия' },
  { v: 'tritanopia', label: 'Тританопия' },
] as const

function setColorBlind(v: UiSettings['colorBlind']) {
  s.colorBlind = v
}

function setVisitTimeFormat(v: VisitTimeFormat) {
  s.visitTimeFormat = v
}

// Демонстрация текущей семантической палитры (для карточки настройки)
const CVD_SWATCHES = [
  { label: 'успех', cls: 'cvd-swatch cvd-swatch-ok' },
  { label: 'внимание', cls: 'cvd-swatch cvd-swatch-warn' },
  { label: 'опасность', cls: 'cvd-swatch cvd-swatch-danger' },
  { label: 'график A / B', cls: 'cvd-swatch cvd-swatch-chart' },
] as const

function reset() {
  Object.assign(s, DEFAULTS)
  persist()
  apply()
  applySectionsDefault(DEFAULTS.sectionsDefault)
  lastSectionsDefault.value = DEFAULTS.sectionsDefault
}
</script>

<template>
  <div class="settings-page">
    <!-- Административные секции: сервер (settings.yaml), пользователи, журнал событий -->
    <AdminPanel v-if="isAdmin" style="margin-bottom: 18px" />

    <div class="settings-grid">

      <!-- Размер шрифта -->
      <section class="card">
        <h3>🔤 Размер шрифта</h3>
        <div class="seg" role="group" aria-label="Размер шрифта">
          <button v-for="opt in SCALES" :key="opt.v" type="button"
                  :class="{ active: s.fontScale === opt.v }"
                  @click="setFontScale(opt.v)">{{ opt.label }}</button>
        </div>
        <p class="hint">Влияет на базовый кегль интерфейса.</p>
      </section>

      <!-- Плотность -->
      <section class="card">
        <h3>📏 Плотность</h3>
        <div class="seg" role="group" aria-label="Плотность">
          <button type="button" :class="{ active: s.density === 'normal' }" @click="setDensity('normal')">Обычная</button>
          <button type="button" :class="{ active: s.density === 'compact' }" @click="setDensity('compact')">Компактная</button>
        </div>
        <p class="hint">Компактное уменьшает отступы карточек и таблиц.</p>
      </section>

      <!-- Ширина контента -->
      <section class="card">
        <h3>↔️ Ширина контента</h3>
        <div class="seg" role="group" aria-label="Ширина контента">
          <button v-for="w in WIDTHS" :key="w.v" type="button"
                  :class="{ active: s.contentWidth === w.v }"
                  @click="setWidth(w.v)">{{ w.label }}</button>
        </div>
        <p class="hint">Максимальная ширина центральной колонки.</p>
      </section>

      <!-- Спойлеры (секции форм) по умолчанию -->
      <section class="card">
        <h3>📦 Секции форм по умолчанию</h3>
        <div class="seg" role="group" aria-label="Состояние спойлеров">
          <button type="button" :class="{ active: s.sectionsDefault === 'closed' }" @click="setSectionsDefault('closed')">Свёрнуты</button>
          <button type="button" :class="{ active: s.sectionsDefault === 'open' }" @click="setSectionsDefault('open')">Развёрнуты</button>
        </div>
        <p class="hint">Состояние блоков «Жалобы», «Анамнез», «Лечение» и других при открытии страницы. Индивидуально раскрытые секции действуют до перезагрузки.</p>
      </section>

      <!-- Формат даты и времени приёмов -->
      <section class="card">
        <h3>🗓 Формат даты и времени приёмов</h3>
        <div class="seg seg-date-format" role="group" aria-label="Формат даты и времени">
          <button v-for="opt in VISIT_FORMATS" :key="opt.v" type="button"
                  :class="{ active: s.visitTimeFormat === opt.v }"
                  :title="opt.sample"
                  @click="setVisitTimeFormat(opt.v)">{{ opt.label }}</button>
        </div>
        <p class="hint">Так отображаются даты в истории приёмов. Сейчас: <b>{{ formatVisitTs(nowTs()) }}</b></p>
      </section>

      <!-- Тема оформления -->
      <section class="card">
        <h3>🌙 Тема оформления</h3>
        <div class="seg" role="group" aria-label="Тема оформления">
          <button v-for="opt in visibleThemes" :key="opt.v" type="button"
                  :class="{ active: s.themeMode === opt.v }"
                  @click="setThemeMode(opt.v)">{{ opt.label }}</button>
        </div>
        <div class="theme-calc-preview" aria-hidden="true">
          <span class="theme-calc-swatch s-a"></span>
          <span class="theme-calc-swatch s-b"></span>
        </div>
        <p class="hint">
          «Клюковка» — палитра голубого и розового:
          градиентный фон #a6c0fe → #f68084, подложки #333131,
          серые кнопки с розовым hover.
        </p>
      </section>

      <!-- Цветовая слепота -->
      <section class="card">
        <h3>🎨 Режим цветовой слепоты</h3>
        <div class="seg seg-wrap" role="group" aria-label="Режим цветовой слепоты">
          <button v-for="opt in CVD_MODES" :key="opt.v" type="button"
                  :class="{ active: s.colorBlind === opt.v }"
                  @click="setColorBlind(opt.v)">{{ opt.label }}</button>
        </div>
        <div class="cvd-demo">
          <span v-for="sw in CVD_SWATCHES" :key="sw.label" class="cvd-demo-item">
            <span :class="sw.cls"></span>
            <span class="muted">{{ sw.label }}</span>
          </span>
        </div>
        <p class="hint">
          Палитра Okabe–Ito: семантические цвета (успех / внимание / опасность),
          бейджи и линии графиков переключаются на различимые при выбранном типе
          цветовой слепоты. Для идеального различения красного/зелёного
          основные статусы продублированы значками и текстом.
        </p>
      </section>

      <!-- Сброс -->
      <section class="card">
        <h3>♻️ Сброс</h3>
        <p class="muted" style="font-size: 13px; margin: 0 0 10px">
          Возвращает значения по умолчанию.
        </p>
        <button class="btn btn-danger" @click="reset">Сбросить настройки</button>
      </section>

    </div>
  </div>
</template>

<style scoped>
.settings-page { max-width: 860px; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 720px) { .settings-grid { grid-template-columns: 1fr; } }
.card { margin-bottom: 0; }
.card h3 { margin: 0 0 12px; font-size: 15px; }
.hint { margin: 10px 0 0; font-size: 12px; color: var(--muted); }

.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--field); }
/* Цветовая слепота: сетка 2×2 (как у формата даты) — кнопки не «переносятся»
   с пустым местом, а равномерно делят ширину карточки */
.seg-wrap {
  display: grid; grid-template-columns: 1fr 1fr; width: 100%;
}
.seg-wrap button { text-align: center; }
/* Формат даты: сетка 2×2 на всю ширину карточки — без пустого места справа */
.seg-date-format {
  display: grid; grid-template-columns: 1fr 1fr; width: 100%;
}
.seg-date-format button { text-align: center; padding: 10px 8px; }
.seg button {
  appearance: none; border: none; background: transparent; cursor: pointer;
  padding: 8px 14px; font-size: 13px; color: var(--muted); border-right: 1px solid var(--border);
  transition: background 0.15s, color 0.15s;
}
.seg button:last-child { border-right: none; }
.seg button:hover { background: var(--bg); color: var(--text); }
.seg button.active { background: var(--primary); color: #fff; font-weight: 600; }

/* Превью-свотчи палитры «Клюковки» (голубой и розовый акценты) */
.theme-calc-preview { display: flex; gap: 8px; margin-top: 12px; }
.theme-calc-swatch { width: 26px; height: 14px; border-radius: 4px; border: 1px solid var(--border); }
.theme-calc-swatch.s-a { background: #a6c0fe; }
.theme-calc-swatch.s-b { background: #f68084; }

/* Демонстрация палитры: образцы семантических цветов */
.cvd-demo { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 12px; }
.cvd-demo-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.cvd-swatch { display: inline-block; width: 26px; height: 14px; border-radius: 4px; border: 1px solid var(--border); }
.cvd-swatch-ok { background: var(--ok); }
.cvd-swatch-warn { background: var(--warn); }
.cvd-swatch-danger { background: var(--danger); }
.cvd-swatch-chart {
  background: linear-gradient(90deg, var(--chart-a) 0 50%, var(--chart-b) 50% 100%);
}

/* Toggле-switch */
.switch { position: relative; display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
.switch input { position: absolute; opacity: 0; pointer-events: none; }
.switch .slider {
  width: 42px; height: 24px; border-radius: 999px; background: var(--badge-bg); position: relative;
  transition: background 0.18s;
}
.switch .slider::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; transition: transform 0.18s; box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
}
:root.theme-dark .switch .slider::after { background: #e2e8f0; }
.switch input:checked + .slider { background: var(--primary); }
.switch input:checked + .slider::after { transform: translateX(18px); }
.switch .label { font-size: 13px; color: var(--muted); }

</style>
