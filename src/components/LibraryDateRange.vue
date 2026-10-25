<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'
import DatePicker from '~/contentScripts/views/SearchResults/components/DatePicker.vue'

/**
 * The custom date range a library filter menu opens into: laid flat on the
 * rail and unfolded (a measured disclosure) while the menu's date group is
 * set to "custom"; it folds away before it unmounts.
 */
const props = defineProps<{ open: boolean, start: string, end: string, invalid: boolean, disabled?: boolean, title: string }>()
const emit = defineEmits<{ (event: 'update', key: 'startDate' | 'endDate', value: string): void }>()
const { t } = useI18n()

const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const rendered = ref(props.open)
watch(() => props.open, (open) => {
  if (open)
    rendered.value = true
})
const { height, onTransitionEnd } = useMeasuredDisclosure(outer, inner, computed(() => props.open), () => rendered.value = false, () => {})
</script>

<template>
  <div
    v-if="rendered" ref="outer" class="library-date-range" :class="{ 'is-open': open }"
    :style="{ height: height === undefined ? undefined : `${height}px` }" :inert="open ? undefined : true" @transitionend="onTransitionEnd"
  >
    <div ref="inner" class="library-date-range__inner">
      <section class="library-date-range__section" :aria-label="title">
        <span class="library-date-range__title">{{ title }}</span>
        <div class="library-date-range__fields">
          <div v-for="key in (['startDate', 'endDate'] as const)" :key="key" class="library-date-range__field">
            <span>{{ t(`watch_later.filters.${key}`) }}</span>
            <DatePicker
              :model-value="key === 'startDate' ? start : end" :invalid="invalid" :label="t(`watch_later.filters.${key}`)"
              :placeholder="t('search.date_picker.date_placeholder')" :disabled="disabled" active embedded teleport
              :min="key === 'endDate' ? start || undefined : undefined"
              :max="key === 'startDate' ? end || undefined : undefined"
              @update:model-value="emit('update', key, $event)"
            />
          </div>
        </div>
        <p v-if="invalid" class="library-date-range__error" role="alert">
          {{ t('watch_later.filters.invalid_range') }}
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/railSection";

// The clip spans the rail edge to edge (the section's hairlines do) and pulls
// back over the rail gap before it, which it carries inside instead: folded,
// it takes no space, so unmounting after the fold does not move anything.
.library-date-range {
  display: block;
  // Wider than the rail's content box by its bleed (no 100% cap).
  max-width: none;
  height: 0;
  margin-top: calc(-1 * var(--bew-sidebar-section-gap));
  margin-inline: calc(-1 * var(--bew-sidebar-inline-padding));
  overflow: clip;
  transition: height var(--bew-duration-normal) var(--bew-ease-standard);
  &.is-open {
    height: auto;
  }
}
.library-date-range__inner {
  display: flow-root;
  padding-top: var(--bew-sidebar-section-gap);
}
.library-date-range__section {
  // It follows the rail tools' hairline, so it needs only its bottom one.
  @include railSection.flat($top: false);
  display: grid;
  gap: var(--bew-space-2);
  margin-inline: 0;
  container-type: inline-size;
}
.library-date-range__title {
  padding-inline: var(--bew-sidebar-label-inset);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.library-date-range__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-2);
}
.library-date-range__field {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-1);
  > span {
    padding-inline: var(--bew-sidebar-label-inset);
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}
.library-date-range__error {
  margin: 0;
  padding-inline: var(--bew-sidebar-label-inset);
  color: var(--bew-error-foreground);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
@container (max-width: 240px) {
  .library-date-range__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .library-date-range {
    transition: none;
  }
}
</style>
