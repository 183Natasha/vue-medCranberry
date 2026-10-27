<template>
  <svg :viewBox="`0 0 ${w} ${h}`" class="line-chart" role="img" :aria-label="title">
    <!-- Сетка -->
    <g v-for="i in 5" :key="'grid-' + i">
      <line
        :x1="pad.l" :x2="w - pad.r"
        :y1="yFor(maxScore - ((i - 1) * maxScore) / 4)"
        :y2="yFor(maxScore - ((i - 1) * maxScore) / 4)"
        class="grid"
      />
      <text :x="pad.l - 6" :y="yFor(maxScore - ((i - 1) * maxScore) / 4) + 4" class="tick">
        {{ Math.round(maxScore - ((i - 1) * maxScore) / 4) }}
      </text>
    </g>

    <!-- Линии и точки по сериям -->
    <g v-for="(s, si) in series" :key="'ser-' + si">
      <polyline :points="pointsFor(si)" :class="['line', 'line-c' + si]" :style="s.color ? { stroke: s.color } : undefined" />
      <g v-for="(p, i) in ptsBySeries[si]" :key="si + '-' + i">
        <circle :cx="p.x" :cy="p.y" r="4" class="dot" :style="s.color ? { fill: s.color } : undefined" />
        <title>{{ s.name }} — {{ p.label }}: {{ p.value }}</title>
        <text v-if="si === 0 && showTick(i, ptsBySeries[si].length)" :x="p.x" :y="h - pad.b + 16" class="tick" text-anchor="middle">
          {{ p.short }}
        </text>
      </g>
    </g>

    <!-- Легенда (если серий больше одной) -->
    <g v-if="series.length > 1" class="legend">
      <g v-for="(s, si) in series" :key="'leg-' + si" :transform="`translate(${pad.l + si * 140}, 4)`">
        <line x1="0" y1="4" x2="16" y2="4" :class="['line', 'line-c' + si]" :style="s.color ? { stroke: s.color } : undefined" stroke-width="3" />
        <text x="22" y="8" class="tick">{{ s.name }}</text>
      </g>
    </g>

    <text v-if="!anyPts" :x="w / 2" :y="h / 2" text-anchor="middle" class="empty">
      Нет данных
    </text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatDateShort } from '../services/datetime'

export interface ChartItem {
  /** Дата — timestamp (мс, локальная полночь) */
  date: number
  score: number
}

export interface ChartSeries {
  name: string
  items: ChartItem[]
  color?: string
}

interface Props {
  items?: ChartItem[]
  series?: ChartSeries[]
  maxScore?: number
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  series: undefined,
  maxScore: 27,
  title: 'График',
})

const w = 640
const h = 260
const pad = { l: 36, r: 16, t: 28, b: 30 }

interface Pt {
  x: number
  y: number
  value: number
  /** Дата — timestamp (мс) */
  date: number
  short: string
  label: string
}

// Серии: явный prop series, либо одна серия из items
const series = computed<ChartSeries[]>(() =>
  props.series && props.series.length ? props.series : [{ name: props.title, items: props.items }]
)

function scale(s: ChartSeries, i: number): number {
  const n = s.items.length
  if (n === 1) return (w - pad.l - pad.r) / 2 + pad.l
  return pad.l + (i * (w - pad.l - pad.r)) / (n - 1)
}

function yFor(v: number): number {
  const usable = h - pad.t - pad.b
  return pad.t + usable - (v / props.maxScore) * usable
}

const ptsBySeries = computed<Pt[][]>(
  () =>
    series.value.map((s) =>
      s.items.map((it, i) => ({
        x: scale(s, i),
        y: yFor(it.score),
        value: it.score,
        date: it.date,
        short: formatDateShort(it.date), // без года
        label: formatDate(it.date),
      }))
    )
)
const anyPts = computed(() => ptsBySeries.value.some((p) => p.length > 0))

/** Шаг отображения меток дат на оси X: метка не уже ~56px в координатах viewBox,
    иначе даты («27.10», «01.11») слипаются на любом размере экрана. */
const tickStep = computed(() => {
  const n = Math.max(1, ...series.value.map((s) => s.items.length))
  return Math.ceil((pad.l + 30 * n) / (w - pad.l - pad.r))
})
function showTick(i: number, n: number): boolean {
  if (n <= 2) return true
  if (i === 0 || i === n - 1) return true // первая и последняя — всегда
  return i % tickStep.value === 0
}

function pointsFor(si: number): string {
  return ptsBySeries.value[si].map((p) => `${p.x},${p.y}`).join(' ')
}
</script>

<!-- Стили вынесены в src/assets/main.css (.line-chart) -->
