<script setup lang="ts">
import { computed } from 'vue'

import { chartRungs } from '~/utils/chartScale'

const props = withDefaults(defineProps<{ value: number | null, unit: number, steps: number, horizontal?: boolean }>(), { horizontal: false })
const rungs = computed(() => chartRungs(props.value, props.unit, props.steps))
</script>

<template>
  <svg class="chart-rungs" :viewBox="horizontal ? '0 0 200 20' : '0 0 40 100'" preserveAspectRatio="none" aria-hidden="true">
    <template v-for="(fraction, index) in rungs" :key="index">
      <rect v-if="horizontal" :x="index / steps * 200" y="2" :width="fraction * 200 / steps * 0.5" height="16" />
      <rect v-else x="4" :y="100 - (index + fraction) / steps * 100" width="32" :height="fraction * 100 / steps * 0.2" />
    </template>
  </svg>
</template>

<style scoped>
.chart-rungs {
  display: block;
  width: 100%;
  height: 100%;
  fill: var(--bew-chart-primary);
}
</style>
