<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { GlassFilter, GlassMode } from '@wxperia/liquid-glass-vue'
import { computed, onMounted, ref, useId } from 'vue'

import type { LiquidGlassMode } from '~/constants/liquidGlass'

/** A single optical layer; its owner supplies geometry, border, shadow and interaction. */
const props = defineProps<{
  mode: LiquidGlassMode
  refraction: number
  blur: number
  dispersion: number
  saturation: number
  tintColor: string
  tintOpacity: number
  filterId?: string
}>()
const surfaceRef = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
useResizeObserver(surfaceRef, ([entry]) => {
  width.value = entry.contentRect.width
  height.value = entry.contentRect.height
})
onMounted(() => {
  if (!surfaceRef.value)
    return
  // Imperative roots may mount after layout. Seed the size once without the
  // target-ref reset that can race the first ResizeObserver delivery.
  const style = getComputedStyle(surfaceRef.value)
  const initialWidth = Number.parseFloat(style.width)
  const initialHeight = Number.parseFloat(style.height)
  if (initialWidth > 0 && initialHeight > 0) {
    width.value = initialWidth
    height.value = initialHeight
  }
})
const filterId = props.filterId ?? `bew-liquid-glass-${useId()}`
const mode = computed(() => GlassMode[props.mode])
const warpStyle = computed(() => ({
  filter: `url(#${filterId})`,
  backdropFilter: `blur(${props.blur}px) saturate(${props.saturation}%)`,
}))
const tintStyle = computed(() => ({
  '--bew-liquid-tint-opacity': props.tintOpacity / 100,
  backgroundColor: props.tintColor,
  opacity: props.tintOpacity / 100,
}))
</script>

<template>
  <div ref="surfaceRef" class="bew-liquid-glass-surface" aria-hidden="true">
    <template v-if="width > 0 && height > 0 && tintOpacity < 100">
      <GlassFilter
        :id="filterId"
        :mode="mode"
        :width="width"
        :height="height"
        :displacement-scale="refraction"
        :aberration-intensity="dispersion"
      />
      <span class="bew-liquid-glass-surface__warp" :style="warpStyle" />
    </template>
    <!-- Tint covers the full outline; displacing it produces detached color patches. -->
    <span class="bew-liquid-glass-surface__tint" :style="tintStyle" />
  </div>
</template>

<style lang="scss">
@use "../styles/liquidGlass";
</style>
