import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { auth } from './auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    roles?: string[]
  }
}

const routes: RouteRecordRaw[] = [
  // Главная — только для авторизованных: гость сразу попадает на /login
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { requiresAuth: true } },
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  // Принудительная смена пароля (первый вход после установки админом)
  { path: '/change-password', name: 'change-password', component: () => import('./views/ChangePasswordView.vue'), meta: { requiresAuth: true } },

  {
    // Настройки администратора: сервер (settings.yaml), журнал событий
    path: '/admin/settings',
    name: 'admin-settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { requiresAuth: true, roles: ['admin'] },
  },
  {
    // Управление пользователями: создание/редактирование/удаление (админ)
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('./views/UsersView.vue'),
    meta: { requiresAuth: true, roles: ['admin'] },
  },
  // Старая вкладка «Пользователи» — больше не существует, редирект для сохранённых закладок
  { path: '/admin', redirect: '/admin/settings' },
  {
    path: '/doctor',
    name: 'doctor-patients',
    component: () => import('./views/DoctorPatientsView.vue'),
    meta: { requiresAuth: true, roles: ['doctor'] },
  },
  {
    path: '/doctor/patient/:id',
    name: 'doctor-patient',
    component: () => import('./views/DoctorPatientView.vue'),
    meta: { requiresAuth: true, roles: ['doctor'] },
  },
  {
    // Новый приём: форма редактирования
    path: '/doctor/patient/:id/visit/new',
    name: 'doctor-visit-new',
    component: () => import('./views/DoctorView.vue'),
    meta: { requiresAuth: true, roles: ['doctor'] },
  },
  {
    // Просмотр сохранённого приёма: та же форма, но readonly (+ повторный экспорт)
    path: '/doctor/patient/:id/visit/:visitId',
    name: 'doctor-visit',
    component: () => import('./views/DoctorView.vue'),
    meta: { requiresAuth: true, roles: ['doctor'] },
  },
  {
    path: '/patient',
    name: 'patient',
    component: () => import('./views/PatientView.vue'),
    meta: { requiresAuth: true, roles: ['patient'] },
  },
  {
    path: '/patient/settings',
    name: 'patient-settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { requiresAuth: true, roles: ['patient'] },
  },
  {
    path: '/doctor/settings',
    name: 'doctor-settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { requiresAuth: true, roles: ['doctor'] },
  },

  { path: '/forbidden', name: 'forbidden', component: () => import('./views/ForbiddenView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Глобальный guard: проверка авторизации и роли
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.roles && auth.user && !to.meta.roles.includes(auth.user.role)) {
    return { name: 'forbidden' }
  }
  // Пароль установлен админом — пока не сменён, доступна только страница смены пароля
  if (auth.user?.mustChangePassword && to.name !== 'change-password') {
    return { name: 'change-password' }
  }
})

export default router
