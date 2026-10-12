<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DatePicker from '~/contentScripts/views/SearchResults/components/DatePicker.vue'

import type { WatchLaterFilters } from './watchLaterFilters'
import { watchLaterAddedBounds } from './watchLaterFilters'
import WatchLaterFilterSection from './WatchLaterFilterSection.vue'

const props = defineProps<{ modelValue: WatchLaterFilters, disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: WatchLaterFilters): void }>()
const { t } = useI18n()
const progressOptions = ['all', 'unstarted'] as const
const durationOptions = ['all', 'short', 'medium', 'long', 'extraLong'] as const
const invalidRange = computed(() => watchLaterAddedBounds(props.modelValue) === null)

function update(patch: Partial<WatchLaterFilters>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
function updateDate(key: 'startDate' | 'endDate', value: string) {
  const next = { ...props.modelValue, [key]: value }
  update({ [key]: value, added: next.startDate || next.endDate ? 'custom' : 'all' })
}
</script>

<template>
  <section class="watch-later-advanced-filters" :aria-label="t('watch_later.filters.title')">
    <WatchLaterFilterSection :title="t('watch_later.filters.by_progress')">
      <div class="bew-segment-control bew-segment-control--static bew-segment-control--secondary watch-later-advanced-filters__options" role="group" :aria-label="t('library_tools.playback_state')">
        <button
          v-for="value in progressOptions" :key="value" type="button" class="bew-segment-control__item"
          :data-active="modelValue.progress === value ? 'true' : undefined" :aria-pressed="modelValue.progress === value" @click="update({ progress: value })"
        >
          {{ t(`watch_later.filters.progress_${value}`) }}
        </button>
      </div>
    </WatchLaterFilterSection>
    <WatchLaterFilterSection v-slot="{ expanded }" :title="t('watch_later.filters.by_date')">
      <div class="watch-later-advanced-filters__dates">
        <div class="watch-later-advanced-filters__range">
          <div v-for="key in (['startDate', 'endDate'] as const)" :key="key" class="watch-later-advanced-filters__date-field">
            <span>{{ t(`watch_later.filters.${key}`) }}</span>
            <DatePicker
              :model-value="modelValue[key]" :invalid="invalidRange" :label="t(`watch_later.filters.${key}`)"
              :placeholder="t('search.date_picker.date_placeholder')" :disabled="disabled" :active="expanded" embedded teleport
              :min="key === 'endDate' ? modelValue.startDate || undefined : undefined"
              :max="key === 'startDate' ? modelValue.endDate || undefined : undefined"
              @update:model-value="updateDate(key, $event)"
            />
          </div>
        </div>
        <p v-if="invalidRange" class="watch-later-advanced-filters__error" role="alert">
          {{ t('watch_later.filters.invalid_range') }}
        </p>
      </div>
    </WatchLaterFilterSection>
    <WatchLaterFilterSection :title="t('watch_later.filters.by_duration')">
      <div class="bew-segment-control bew-segment-control--static bew-segment-control--secondary watch-later-advanced-filters__options watch-later-advanced-filters__options--duration" role="group" :aria-label="t('library_tools.duration')">
        <button
          v-for="value in durationOptions" :key="value" type="button" class="bew-segment-control__item"
          :data-active="modelValue.duration === value ? 'true' : undefined" :aria-pressed="modelValue.duration === value" @click="update({ duration: value })"
        >
          {{ t(`watch_later.filters.duration_${value}`) }}
        </button>
      </div>
    </WatchLaterFilterSection>
  </section>
</template>

<style lang="scss" scoped>
.watch-later-advanced-filters {
  display: grid;
  gap: var(--bew-space-3);
  padding: var(--bew-library-filter-padding);
  min-width: 0;
  border-radius: var(--bew-library-filter-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-message-pinned-background);
  container-type: inline-size;
}
.watch-later-advanced-filters__options {
  --bew-control-item-radius: var(--bew-interactive-radius);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  height: auto;
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);

  .bew-segment-control__item {
    min-width: 0;
    padding-inline: var(--bew-space-1);
    corner-shape: var(--bew-corner-shape);
  }
}
.watch-later-advanced-filters__options--duration .bew-segment-control__item:first-child {
  grid-column: 1 / -1;
}
.watch-later-advanced-filters__dates {
  display: grid;
  gap: var(--bew-space-2);
}
.watch-later-advanced-filters__range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-2);
  .watch-later-advanced-filters__date-field {
    display: grid;
    min-width: 0;
    gap: var(--bew-space-1);
  }
  span {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}
.watch-later-advanced-filters__error {
  margin: 0;
  color: var(--bew-error-foreground);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
@container (max-width: 240px) {
  .watch-later-advanced-filters__range {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
