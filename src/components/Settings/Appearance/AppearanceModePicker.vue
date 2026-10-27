<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { useMotionValue } from '~/composables/useMotionValue'
import type { Settings } from '~/logic/storage'

const props = defineProps<{ modelValue: Settings['theme'], apply: (value: Settings['theme']) => Promise<void> }>()
const selected = useMotionValue(() => props.modelValue, value => props.apply(value))
const { t } = useI18n()
const modes = computed(() => [
  { value: 'auto' as const, label: t('settings.theme_opt.auto'), icon: 'i-tabler:device-desktop' },
  { value: 'light' as const, label: t('settings.theme_opt.light'), icon: 'i-tabler:sun' },
  { value: 'dark' as const, label: t('settings.theme_opt.dark'), icon: 'i-tabler:moon' },
  { value: 'scheduled' as const, label: t('settings.theme_opt.scheduled'), icon: 'i-tabler:clock' },
])
function onKey(event: KeyboardEvent, index: number) {
  if (event.isComposing)
    return
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key))
    return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? modes.value.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + modes.value.length) % modes.value.length
  selected.value = modes.value[next].value
  ;(event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
}
</script>

<template>
  <div class="appearance-modes bew-segment-control bew-segment-control--surface bew-segment-control--track bew-segment-control--rect" role="radiogroup" :aria-label="$t('settings.theme')">
    <LiquidSegmentIndicator :active-key="selected" />
    <button
      v-for="(mode, index) in modes" :key="mode.value" type="button" class="appearance-modes__option bew-segment-control__item"
      data-segment-item :data-active="selected === mode.value ? 'true' : undefined"
      role="radio" :aria-checked="selected === mode.value" :tabindex="selected === mode.value ? 0 : -1"
      @click="selected = mode.value" @keydown="onKey($event, index)"
    >
      <span class="appearance-modes__preview" :class="`appearance-modes__preview--${mode.value}`" aria-hidden="true">
        <span class="appearance-modes__rail"><i :class="mode.icon" /></span>
        <span class="appearance-modes__content"><span /><span /><span /></span>
      </span>
      <span>{{ mode.label }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.appearance-modes {
  --bew-control-radius: calc(var(--bew-surface-radius) + var(--bew-space-0-5));
  --bew-control-item-radius: var(--bew-surface-radius);
  display: grid;
  height: auto;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bew-space-2);
  width: calc(var(--bew-control-height) * 10);
  max-width: 100%;
}
.appearance-modes__option {
  display: grid;
  height: auto;
  min-width: 0;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  border-radius: var(--bew-control-item-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  cursor: pointer;
}
.appearance-modes__option:is(:hover, :focus-visible, [aria-checked="true"]) {
  color: var(--bew-text-1);
}
.appearance-modes__preview {
  --bew-preview-accent: var(--bew-appearance-preview-light-accent);
  display: flex;
  aspect-ratio: 4 / 3;
  width: 100%;
  overflow: hidden;
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-appearance-preview-light-bg);
  color: var(--bew-appearance-preview-light-fg);
}
.appearance-modes__preview--dark {
  --bew-preview-accent: var(--bew-appearance-preview-dark-accent);
  background: var(--bew-appearance-preview-dark-bg);
  color: var(--bew-appearance-preview-dark-fg);
}
.appearance-modes__preview--auto,
.appearance-modes__preview--scheduled {
  --bew-preview-accent: var(--bew-appearance-preview-dark-accent);
  background: linear-gradient(
    90deg,
    var(--bew-appearance-preview-light-bg) 30%,
    var(--bew-appearance-preview-dark-bg) 30%
  );
}
.appearance-modes__rail {
  display: grid;
  place-items: start center;
  padding-top: var(--bew-space-2);
  width: 30%;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.appearance-modes__rail i {
  width: var(--bew-icon-size-xs);
  height: var(--bew-icon-size-xs);
}
.appearance-modes__content {
  display: grid;
  align-content: center;
  gap: var(--bew-space-1);
  flex: 1;
  padding: var(--bew-space-2);
}
.appearance-modes__preview--auto .appearance-modes__content,
.appearance-modes__preview--scheduled .appearance-modes__content {
  color: var(--bew-appearance-preview-dark-fg);
}
.appearance-modes__content span {
  display: block;
  height: var(--bew-space-1);
  border-radius: var(--bew-radius-tiny);
  background: color-mix(in srgb, currentColor 24%, transparent);
}
.appearance-modes__content span:first-child {
  width: 65%;
  background: var(--bew-preview-accent);
}
.appearance-modes__content span:last-child {
  width: 80%;
}
@media (max-width: 480px) {
  .appearance-modes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
