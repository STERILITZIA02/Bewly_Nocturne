<script setup lang="ts">
import type { AppearanceThemePalette } from '~/utils/appearancePresets'

defineProps<{ label: string, originalName?: string, palette?: AppearanceThemePalette }>()
</script>

<template>
  <span class="appearance-theme-sample">
    <span
      class="appearance-theme-sample__swatch" aria-hidden="true"
      :style="{ background: palette?.background ?? 'var(--bew-content-solid)', color: palette?.accent === 'neutral' ? palette.foreground ?? 'var(--bew-text-1)' : palette?.accent }"
    >Aa</span>
    <span class="appearance-theme-sample__labels">
      <span class="keep-one-line">{{ label }}</span>
      <span v-if="originalName && originalName !== label" class="appearance-theme-sample__original keep-one-line">{{ originalName }}</span>
    </span>
  </span>
</template>

<style scoped lang="scss">
.appearance-theme-sample {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
}
.appearance-theme-sample__swatch {
  display: grid;
  place-items: center;
  flex: 0 0 var(--bew-control-height-sm);
  height: var(--bew-control-height-sm);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  font-size: var(--bew-font-size-control);
}
.appearance-theme-sample__labels {
  display: grid;
  min-width: 0;
  text-align: start;
}
.appearance-theme-sample__original {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
