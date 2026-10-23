<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { normalizeIntlLocale } from '~/utils/locale'

import type { MessageActivityDay } from './messageInsights'

const props = defineProps<{ days: MessageActivityDay[] }>()
const { locale, t } = useI18n()
const active = ref<number | null>(null)
const dateFormat = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { month: 'numeric', day: 'numeric' }))
const numberFormat = computed(() => new Intl.NumberFormat(normalizeIntlLocale(locale.value)))
const max = computed(() => Math.max(1, ...props.days.flatMap(day => [day.followed, day.unfollowed])))
// SVG coordinates are chart geometry, independent of page dimensions.
const plot = { width: 560, top: 16, height: 144 }
const x = (index: number) => (index + 0.5) / Math.max(1, props.days.length) * plot.width
const y = (value: number) => plot.top + plot.height * (1 - value / max.value)
const points = (key: 'followed' | 'unfollowed') => props.days.map((day, index) => `${x(index)},${y(day[key])}`).join(' ')
const selected = computed(() => props.days[active.value ?? props.days.length - 1])
const dayLabel = (day: MessageActivityDay) => `${dateFormat.value.format(day.timestamp)} · ${t('notifications.insights.followed')} ${numberFormat.value.format(day.followed)} · ${t('notifications.insights.unfollowed')} ${numberFormat.value.format(day.unfollowed)}`
</script>

<template>
  <div class="message-activity-chart">
    <div class="message-activity-chart__legend">
      <span><i class="message-activity-chart__dot" />{{ t('notifications.insights.followed') }}</span>
      <span><i class="message-activity-chart__dot message-activity-chart__dot--secondary" />{{ t('notifications.insights.unfollowed') }}</span>
    </div>
    <div class="message-activity-chart__plot">
      <svg viewBox="0 0 560 176" preserveAspectRatio="none" aria-hidden="true">
        <path class="message-activity-chart__guide" d="M0 16H560M0 88H560M0 160H560" />
        <path v-for="(day, index) in days" :key="`tick-${day.timestamp}`" class="message-activity-chart__guide" :d="`M${x(index)} 160v8`" />
        <polyline class="message-activity-chart__line message-activity-chart__line--secondary" :points="points('unfollowed')" />
        <polyline class="message-activity-chart__line" :points="points('followed')" />
        <template v-for="(day, index) in days" :key="day.timestamp">
          <circle class="message-activity-chart__sample message-activity-chart__sample--secondary" :cx="x(index)" :cy="y(day.unfollowed)" r="3.5" />
          <circle class="message-activity-chart__sample" :cx="x(index)" :cy="y(day.followed)" r="2.5" />
        </template>
        <template v-if="active !== null && days[active]">
          <path class="message-activity-chart__guide" :d="`M${x(active)} 16V160`" />
          <circle class="message-activity-chart__point--secondary" :cx="x(active)" :cy="y(days[active].unfollowed)" r="4" />
          <circle class="message-activity-chart__point" :cx="x(active)" :cy="y(days[active].followed)" r="4" />
        </template>
      </svg>
      <div class="message-activity-chart__targets">
        <button
          v-for="(day, index) in days" :key="day.timestamp" type="button"
          :aria-label="dayLabel(day)" :aria-pressed="active === index"
          @mouseenter="active = index" @mouseleave="active = null"
          @focus="active = index" @blur="active = null" @click="active = index" @keydown.esc="active = null"
        >
          {{ dateFormat.format(day.timestamp) }}
        </button>
      </div>
      <span class="message-activity-chart__scale" aria-hidden="true">{{ numberFormat.format(max) }}</span>
      <span class="message-activity-chart__scale message-activity-chart__scale--zero" aria-hidden="true">0</span>
    </div>
    <span v-if="selected" class="message-activity-chart__detail">{{ dayLabel(selected) }}</span>
  </div>
</template>

<style scoped lang="scss">
@use "../../../../styles/dataChart";
.message-activity-chart {
  display: grid;
  gap: var(--bew-space-3);
  min-width: 0;
}
.message-activity-chart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.message-activity-chart__legend > span {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}
.message-activity-chart__dot {
  width: var(--bew-space-2);
  height: var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  background: var(--bew-chart-primary);
}
.message-activity-chart__dot--secondary {
  box-sizing: border-box;
  border: 1px solid var(--bew-chart-secondary);
  background: transparent;
}
.message-activity-chart__plot {
  position: relative;
  height: var(--bew-insights-chart-height);
  min-width: 0;
}
.message-activity-chart__plot svg {
  width: 100%;
  height: calc(100% - var(--bew-space-6));
  overflow: visible;
}
.message-activity-chart__guide {
  @include dataChart.guide;
}
.message-activity-chart__line {
  @include dataChart.line;
}
.message-activity-chart__line--secondary {
  stroke: var(--bew-chart-secondary);
  stroke-dasharray: 3 4;
}
.message-activity-chart__sample {
  fill: var(--bew-chart-primary);
  stroke: var(--bew-chart-primary);
  vector-effect: non-scaling-stroke;
}
.message-activity-chart__sample--secondary {
  fill: var(--bew-chart-surface);
  stroke: var(--bew-chart-secondary);
}
.message-activity-chart__point,
.message-activity-chart__point--secondary {
  fill: var(--bew-chart-accent);
  stroke: var(--bew-chart-accent);
  vector-effect: non-scaling-stroke;
}
.message-activity-chart__point--secondary {
  fill: var(--bew-chart-surface);
}
.message-activity-chart__targets {
  position: absolute;
  inset: 0;
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
}
.message-activity-chart__targets button {
  display: flex;
  align-items: end;
  justify-content: center;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  cursor: pointer;
}
.message-activity-chart__targets button:is(:hover, :focus-visible) {
  color: var(--bew-text-1);
}
.message-activity-chart__detail {
  min-height: var(--bew-line-height-caption);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  font-variant-numeric: tabular-nums;
}
.message-activity-chart__scale {
  position: absolute;
  inset: 0 auto auto 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  pointer-events: none;
}
.message-activity-chart__scale--zero {
  inset: auto auto var(--bew-space-6) 0;
}
</style>
