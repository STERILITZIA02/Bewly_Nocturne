<script setup lang="ts">
import { GlassFilter, GlassMode } from '@wxperia/liquid-glass-vue'
import { computed, useId } from 'vue'

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
// GlassFilter's dimensions only size its SVG viewport; its optics use relative
// coordinates. CSS follows shell morphs without per-frame reactive size writes.
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
  <div class="bew-liquid-glass-surface" aria-hidden="true">
    <template v-if="tintOpacity < 100">
      <GlassFilter
        :id="filterId"
        :mode="mode"
        width="100%"
        height="100%"
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
