<template>
  <!-- PHQ-4: экспресс-скрининг и рекомендации по выбору шкалы -->
  <fieldset class="visit-section collapsible-sec" id="sec-phq4" :class="{ closed: !openSections['sec-phq4'] }" :disabled="disabled">
    <legend class="collapsible-legend" role="button" @click="toggleSection('sec-phq4')">
      <span class="collapsible-chev" :class="{ closed: !openSections['sec-phq4'] }">▾</span>
      🎯 PHQ-4 — экспресс-скрининг тревоги и депрессии
      <span class="legend-badges">
        <span class="badge" :class="complete ? (noAnxietyDepression ? 'badge-ok' : 'badge-warn') : ''">
          {{ complete ? (noAnxietyDepression ? 'без тревоги/депрессии' : 'тревога: ' + anxiety + ', депрессия: ' + depression) : 'заполнено: ' + answered + ' / 4' }}
        </span>
      </span>
    </legend>

    <div v-for="(q, qi) in PHQ4_QUESTIONS" :key="qi" class="question">
      <p class="question-text">{{ qi + 1 }}. {{ q }}</p>
      <div class="options">
        <label v-for="(opt, oi) in FREQ_OPTIONS" :key="oi" class="radio">
          <input
            type="radio"
            :name="'phq4q' + qi"
            :value="oi"
            :checked="answers[qi] === oi"
            @change="answers[qi] = oi"
          />
          <span>{{ opt }}</span>
        </label>
      </div>
    </div>
    <p v-if="!complete" class="muted">Ответьте на все вопросы — {{ answered }} / 4</p>
    <div v-else class="scale-result">
      <p><b>Тревога (GAD-2):</b> {{ anxiety }} балл(ов) — {{ phq4Level(anxiety) }}</p>
      <p><b>Депрессия (PHQ-2):</b> {{ depression }} балл(ов) — {{ phq4Level(depression) }}</p>
      <div class="scale-recommendations">
        <template v-if="noAnxietyDepression">
          <p class="ok-text">✅ Данных за тревожно-депрессивную симптоматику не выявлено: развёрнутые шкалы скрининга (HADS, PHQ-9, GAD-7) не показаны. При появлении жалоб — повторить скрининг.</p>
        </template>
        <template v-else>
          <p class="criteria-title">Рекомендации по выбору шкалы:</p>
          <p v-if="sleepComplaint" class="warning-text">😴 Нарушение сна в жалобах — показана шкала <b>ISI</b> (индекс тяжести инсомнии)</p>
          <p v-if="somaticCriteria" class="warning-text">🩺 Отмечены соматические жалобы из пунктов ГТР — предпочтительна <b>HADS</b> (не завышает баллы при соматической патологии; HADS-A — тревога, HADS-D — депрессия)</p>
          <p v-if="anxietyPredominates" class="warning-text">😰 Преобладание тревоги в PHQ-4 — показана <b>GAD-7</b> (оценка тяжести генерализованной тревоги)</p>
          <p v-if="depressionPredominates" class="warning-text">😔 Преобладание депрессии в PHQ-4 — показан <b>PHQ-9</b> (оценка тяжести депрессивного эпизода; при соматических жалобах — HADS-D)</p>
          <p v-if="equal" class="warning-text">⚖️ Тревога и депрессия выражены одинаково — предпочтительна <b>HADS</b> (оценивает обе подшкалы одновременно)</p>
          <p class="muted">Итоговый выбор шкалы остаётся за врачом (раздел «Прохождение шкал» ниже).</p>
        </template>
      </div>
      <button class="btn btn-primary" type="button" @click="emit('save')" :disabled="saved">
        {{ saved ? 'Результат сохранён ✓' : 'Сохранить результат PHQ-4' }}
      </button>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// Виджет PHQ-4: вопросы, подсчёт подшкал и рекомендации
// по выбору развёрнутой шкалы. Логика подсчёта — domain/phq4.ts,
// справочники — domain/visit-status.ts.
// Родитель (DoctorView) владеет состоянием ответов и сохраняет
// результат; сюда передаются только признаки жалоб пациента.
// ─────────────────────────────────────────────────────────────
import { computed } from 'vue'
import { PHQ4_QUESTIONS, FREQ_OPTIONS } from '../domain/visit-status'
import { phq4Subscores, phq4Level } from '../domain/phq4'
import { openSections, toggleSection } from '../ui-sections'

const props = defineProps<{
  /** Нарушение сна в жалобах пациента */
  sleepComplaint: boolean
  /** Соматические жалобы из пунктов ГТР (группа B) */
  somaticCriteria: boolean
  /** Переводит поля в readonly (режим просмотра приёма) */
  disabled?: boolean
}>()

const answers = defineModel<number[]>('answers', { required: true })
const saved = defineModel<boolean>('saved', { required: true })
const emit = defineEmits<{ save: [] }>()

const subscores = computed(() => phq4Subscores(answers.value))
const answered = computed(() => subscores.value.answered)
const complete = computed(() => answered.value === 4)
const anxiety = computed(() => subscores.value.anxiety)
const depression = computed(() => subscores.value.depression)
// клинически значимый уровень подшкалы: порог GAD-2 / PHQ-2 = 3 балла
const noAnxietyDepression = computed(() => complete.value && anxiety.value < 3 && depression.value < 3)
const anxietyPredominates = computed(() => complete.value && anxiety.value >= 3 && anxiety.value > depression.value)
const depressionPredominates = computed(() => complete.value && depression.value >= 3 && depression.value > anxiety.value)
const equal = computed(() => complete.value && anxiety.value >= 3 && anxiety.value === depression.value)
</script>
