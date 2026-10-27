// ─────────────────────────────────────────────────────────────
// Все ключи localStorage приложения в одном месте.
// Раньше строки-ключи были размазаны по auth.ts / store.ts /
// App.vue / SettingsView.vue / ui-sections.ts / DoctorView.vue.
// ─────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** Каталог пользователей (редактируется админом) */
  users: 'app_users',
  /** Текущая сессия (SessionUser) */
  session: 'session_user',
  /** Токен бэкенд-сессии (X-Session-Token) */
  sessionToken: 'session_token',
  /** Медицинские данные пациентов (карточка/тесты/приёмы) */
  patientData: 'patient_data',
  /** Запросы врачей на удаление приёмов */
  deleteRequests: 'delete_requests',
  /** Общие настройки интерфейса (шрифт/плотность/тема/CVD) */
  uiSettings: 'ui-settings',
  /** Свёрнутость сайдбара */
  sidebarCollapsed: 'sidebar-collapsed',
  /** Раскрытость подменю «Разделы приёма» */
  doctorMenuOpen: 'doctor-menu-open',
  /** Скрытые врачом пункты разделов приёма */
  doctorMenuHidden: 'doctor-menu-hidden',
  /** Сохранённые размеры текстовых полей формы приёма */
  textareaSizes: 'doctor-textarea-sizes',
  /** Пасхалка: разблокирована ли тема «Клюковка» (3 клика по cranberry в модалке) */
  cranberryUnlocked: 'cranberry-unlocked',
  /** Аудит-лог: вход/выход и другие события */
  auditLog: 'auth-audit',
  /** Локальные переопределения администратора поверх settings.yaml */
  appConfig: 'app-config',
} as const
