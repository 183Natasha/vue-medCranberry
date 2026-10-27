<template>
  <div>
    <!-- Главный дашборд врача: только список пациентов -->
    <section class="card">
      <div class="dashboard-head">
        <h2>👥 Пациенты</h2>
        <span class="muted">всего: {{ patients.length }}</span>
      </div>

      <p v-if="!patients.length" class="muted">Пациентов пока нет.</p>
      <div v-else class="patients-scroll">
        <table class="patients-table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Логин</th>
              <th>Дата рождения</th>
              <th>Приёмов</th>
              <th>Тестов</th>
              <th>Последний приём</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in patients"
              :key="p.id"
              class="patient-row"
              title="Открыть карточку пациента"
              @click="open(p.id)"
            >
              <td><b>{{ p.fullName }}</b></td>
              <td class="muted">{{ p.username }}</td>
              <td class="muted">{{ formatDateStr(p.birthDate) }}</td>
              <td>{{ getPatient(p.id).visits.length }}</td>
              <td>{{ getPatient(p.id).tests.length }}</td>
              <td>{{ lastVisitDate(p.id) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { users, type User } from '../auth'
import { getPatient } from '../store'
import { formatVisitTs, formatDateStr } from '../services/datetime'

const router = useRouter()

const patients = computed<User[]>(() => users.filter((u) => u.role === 'patient'))

function open(id: number): void {
  router.push(`/doctor/patient/${id}`)
}

// Дата последнего приёма пациента (или «—»); список отсортирован по убыванию даты
function lastVisitDate(id: number): string {
  const visits = getPatient(id).visits
  if (!visits.length) return '—'
  return formatVisitTs(visits[0].date)
}
</script>

<style scoped>
/* Общие классы (.dashboard-head, .patients-table, .patients-scroll, .patient-row) — в main.css.
   Здесь только специфика дашборда: ограничиваем высоту скролл-области под список пациентов. */
.patients-scroll { max-height: 66vh; }
</style>
