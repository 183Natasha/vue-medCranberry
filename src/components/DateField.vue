<template>
  <!-- Гибридное поле даты: текст в формате из настроек + системный календарь по кнопке 📅.
       Нативный type=date показывает дату в локали браузера и настройку игнорирует,
       поэтому он скрыт и используется только как пикер (значение сразу конвертируется). -->
  <span class="date-field">
    <input
      :value="modelValue"
      type="text"
      class="date-input"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onType"
    />
    <button
      type="button"
      class="date-cal-btn"
      title="Выбрать дату из календаря"
      :disabled="disabled"
      @click="openCalendar"
    >📅</button>
    <!-- Значение скрытого поля обновляем при открытии (чтобы календарь открылся на текущей дате) -->
    <input
      ref="hidden"
      type="date"
      class="date-hidden"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dateStrToDisplay, parseUserDate, userDatePlaceholder, tsToDateStr } from '../services/datetime'

const props = defineProps<{
  /** Отображаемый текст даты (в формате из настроек) */
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** Текст из поля (сырой) */
  (e: 'update:modelValue', v: string): void
  /** Успешно распознанная дата в wire-формате YYYY-MM-DD */
  (e: 'parsed', iso: string | null): void
}>()

const hidden = ref<HTMLInputElement | null>(null)
const placeholder = computed(() => userDatePlaceholder())

function openCalendar(): void {
  const el = hidden.value
  if (!el) return
  // Если в поле уже распознаваемая дата — откроем календарь на ней
  const iso = parseUserDate(props.modelValue)
  el.value = iso ?? tsToDateStr(Date.now())
  el.showPicker()
}

function onPick(e: Event): void {
  const v = (e.target as HTMLInputElement).value // 'YYYY-MM-DD'
  if (!v) return
  // Календарь вернул ISO — показываем пользователю в настроенном формате
  emit('update:modelValue', dateStrToDisplay(v))
  emit('parsed', v)
}

/** Ручной ввод: разбираем текст и сообщаем родителю результат парсинга */
function onType(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  emit('update:modelValue', v)
  emit('parsed', parseUserDate(v))
}
</script>

<style scoped>
.date-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.date-field .date-input {
  flex: 1;
  min-width: 0;
}
.date-cal-btn {
  flex: none;
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
  line-height: 1;
}
.date-cal-btn:hover { background: var(--row-hover, rgba(0, 0, 0, 0.06)); }
.date-cal-btn:disabled { opacity: 0.4; cursor: default; }
.date-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  border: none;
  padding: 0;
  pointer-events: none;
}
</style>
