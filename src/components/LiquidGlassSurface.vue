<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { GlassFilter, GlassMode } from '@wxperia/liquid-glass-vue'
import { computed, ref, useId } from 'vue'

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
}>()
const surfaceRef = ref<HTMLElement | null>(null)
const { width, height } = useElementSize(surfaceRef)
const filterId = `bew-liquid-glass-${useId()}`
const mode = computed(() => GlassMode[props.mode])
const warpStyle = computed(() => ({
  filter: `url(#${filterId})`,
  backdropFilter: `blur(${props.blur}px) saturate(${props.saturation}%)`,
}))
const tintStyle = computed(() => ({
  backgroundColor: props.tintColor,
  opacity: props.tintOpacity / 100,
}))
</script>

<template>
  <div ref="surfaceRef" class="bew-liquid-glass-surface" aria-hidden="true">
    <template v-if="width > 0 && height > 0">
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

<style lang="scss" scoped>
.bew-liquid-glass-surface {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

.bew-liquid-glass-surface__warp,
.bew-liquid-glass-surface__tint {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  corner-shape: inherit;
}
</style>
