<template>
  <!-- Системные уведомления (broadcast от админа): единый блок в базовом шаблоне,
       отображается одинаково на всех страницах для всех авторизованных ролей.
       Оформление: вариант A — цветная полоса слева + мягкий фон (как sig-warning-box). -->
  <section v-if="visible.length" class="notif-banner" role="region" aria-label="Системные уведомления">
    <div
      v-for="n in visible"
      :key="n.id"
      class="notif-item"
      :class="'notif-' + n.severity"
    >
      <span class="notif-icon" aria-hidden="true">
        {{ n.severity === 'critical' ? '🚨' : n.severity === 'warning' ? '⚠️' : 'ℹ️' }}
      </span>
      <div class="notif-body">
        <b class="notif-title">{{ n.title }}</b>
        <p class="notif-text">{{ n.body }}</p>
        <p class="notif-meta muted">— {{ n.created_by }}, {{ formatDateStr(n.created_at) }}</p>
        <p v-if="periodOf(n)" class="notif-meta muted">{{ periodOf(n) }}</p>
      </div>
      <button
        type="button"
        class="notif-hide-btn"
        title="Скрыть уведомление"
        aria-label="Скрыть уведомление"
        @click="dismiss(n.id)"
      >✕</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { auth } from '../auth'
import { apiGetNotifications, apiMarkNotificationRead, type SystemNotificationDto } from '../services/backend'
import { formatDateStr } from '../services/datetime'

const notifications = ref<SystemNotificationDto[]>([])

/** Локально скрытые в этой сессии (мгновенный отклик до ответа сервера) */
const dismissed = ref<Set<number>>(new Set())

/** Не показывать уже просмотренные текущим пользователем (как было в карточке пациента) */
const visible = computed<SystemNotificationDto[]>(() => {
  const uid = auth.user?.id
  if (uid === undefined) return []
  return notifications.value.filter(
    (n) => !dismissed.value.has(n.id) && (!n.seen_by || !n.seen_by.includes(uid)),
  )
})

/** Подпись периода действия, если задан */
function periodOf(n: SystemNotificationDto): string {
  const s = n.starts_at ? formatDateStr(n.starts_at) : null
  const e = n.ends_at ? formatDateStr(n.ends_at) : null
  if (!s && !e) return ''
  if (s && e) return `Период: ${s} → ${e}`
  if (s) return `Действует с ${s}`
  return `До ${e}`
}

onMounted(async () => {
  if (!auth.user) return
  const res = await apiGetNotifications()
  if (res.ok && res.data) {
    notifications.value = res.data.system || []
  }
  // Сервер недоступен — блок просто не отрисовывается (не мешаем странице)
})

/** Скрыть уведомление: локально сразу, на сервере — пометить прочитанным (seen_by) */
async function dismiss(id: number): Promise<void> {
  dismissed.value = new Set(dismissed.value).add(id)
  try {
    await apiMarkNotificationRead(id)
  } catch {
    // Сервер недоступен — уведомление скрыто до перезагрузки страницы (локальная сессия)
  }
}
</script>
