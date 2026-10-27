<!--
  ScaleForm.vue — переиспользуемая форма прохождения шкалы (опросник).
  Рендерит вопросы шкалы (ScaleDef), считает баллы, при сохранении
  пишет результат через syncTest (локально + сервер) и при наличии
  recId помечает рекомендацию выполненной.

  Props:
    scale      — ScaleDef из SCALES
    patientId  — id пациента
    recId      — id рекомендации (если прохождение по ней)
    dueDate    — крайний срок рекомендации (для подсказки)
  Events:
    saved  — результат сохранён (после показа сообщения)
    cancel — отмена
-->
<template>
  <div class="scale-form">
    <h3>{{ scale.title }}</h3>
    <p class="muted">{{ scale.description }}</p>

    <div v-if="recId" class="rec-hint">
      <p v-if="dueDate" class="warning-text">📅 По рекомендации врача: пройти до <b>{{ dueDate }}</b></p>
      <p v-else class="warning-text">📅 По рекомендации врача</p>
      <p v-if="recNote" class="muted">{{ recNote }}</p>
    </div>

    <div class="form">
      <div v-for="(q, qi) in scale.questions" :key="qi" class="question">
        <p class="question-text">{{ qi + 1 }}. {{ q.text }}</p>
        <div class="options">
          <label v-for="(opt, oi) in q.options" :key="oi" class="radio">
            <input
              type="radio"
              :name="'sfq' + qi"
              :value="opt.score"
              :checked="answers[qi] === opt.score"
              @change="answers[qi] = opt.score"
            />
            <span>{{ opt.label }}</span>
          </label>
        </div>
      </div>

      <div v-if="scaleComplete" class="scale-result">
        <p v-for="r in scale.results" :key="r.type">
          <b>{{ r.title }}:</b> {{ r.pick(answers) }} балл(ов)
        </p>
      </div>
      <p v-else class="muted">Ответьте на все вопросы — {{ answered }} / {{ scale.questions.length }}</p>

      <div class="form-actions">
        <button class="btn btn-primary" type="button" :disabled="!scaleComplete || saved" @click="save">
          {{ saved ? 'Сохранено ✓' : 'Сохранить результаты' }}
        </button>
        <button class="btn" type="button" @click="emit('cancel')">Отмена</button>
      </div>
      <p v-if="errorMessage" class="warning-text">⚠️ {{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ScaleDef } from '../scales'
import { syncTest } from '../services/sync'
import { apiMarkRecommendationDone } from '../services/backend'

const props = withDefaults(
  defineProps<{
    scale: ScaleDef
    patientId: number
    recId?: number | null
    dueDate?: string | null
    recNote?: string
  }>(),
  {
    recId: null,
    dueDate: null,
    recNote: '',
  },
)

const emit = defineEmits<{ saved: [result: { type: string; score: number }[]]; cancel: [] }>()

const answers = ref<number[]>(new Array(props.scale.questions.length).fill(-1))
const saved = ref(false)
const errorMessage = ref('')

const answered = computed(() => answers.value.filter((v) => v >= 0).length)
const scaleComplete = computed(() => answered.value === props.scale.questions.length)

function save(): void {
  if (!scaleComplete.value || saved.value) return
  const results: { type: string; score: number }[] = []
  for (const r of props.scale.results) {
    const score = r.pick(answers.value)
    results.push({ type: r.type, score })
    syncTest(props.patientId, { type: r.type, score })
  }
  // Пометить рекомендацию выполненной (не блокируем сохранение результатом запроса)
  if (props.recId) {
    apiMarkRecommendationDone(props.patientId, props.recId)
      .then((res) => {
        if (!res.ok) errorMessage.value = 'Результат сохранён, но рекомендацию не удалось пометить выполненной. Попробуйте обновить страницу.'
      })
      .catch(() => {
        errorMessage.value = 'Результат сохранён локально. Сервер недоступен — рекомендация будет синхронизирована позже.'
      })
  }
  saved.value = true
  emit('saved', results)
}
</script>

<style scoped>
.rec-hint {
  margin: 10px 0;
  padding: 8px 12px;
  background: var(--badge-bg, #f8f9fa);
  border-radius: 6px;
  font-size: 13px;
}
.scale-form h3 { margin: 0 0 6px; font-size: 16px; }
.scale-form h3 + p { margin-top: 0; }
</style>
