<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DatePicker from '~/contentScripts/views/SearchResults/components/DatePicker.vue'
import FilterSection from '~/contentScripts/views/WatchLater/WatchLaterFilterSection.vue'

import type { HistoryFilters } from './historyFilters'
import { historyRangeBounds } from './historyFilters'

const props = defineProps<{ modelValue: HistoryFilters, disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: HistoryFilters): void }>()
const { t } = useI18n()
const durations = ['all', 'short', 'medium', 'long', 'extraLong'] as const
const periods = ['all', 'today', 'yesterday', 'week'] as const
const devices = ['all', 'pc', 'phone', 'tablet', 'tv'] as const
const deviceIcons: Record<HistoryFilters['device'], string> = {
  all: 'i-tabler:devices',
  pc: 'i-tabler:device-desktop',
  phone: 'i-tabler:device-mobile',
  tablet: 'i-tabler:device-tablet',
  tv: 'i-tabler:device-tv',
}
const invalidRange = computed(() => historyRangeBounds(props.modelValue) === null)
function update(patch: Partial<HistoryFilters>) {
  if (!props.disabled)
    emit('update:modelValue', { ...props.modelValue, ...patch })
}
function updateDate(key: 'startDate' | 'endDate', value: string) {
  const next = { ...props.modelValue, [key]: value }
  update({ [key]: value, period: next.startDate || next.endDate ? 'custom' : 'all' })
}
</script>

<template>
  <section class="history-advanced-filters" :aria-label="t('history.filters.title')">
    <FilterSection :title="t('watch_later.filters.by_duration')">
      <div class="bew-segment-control bew-segment-control--static bew-segment-control--secondary history-advanced-filters__options history-advanced-filters__options--wide-first" role="group" :aria-label="t('library_tools.duration')">
        <button
          v-for="value in durations" :key="value" type="button" class="bew-segment-control__item" :disabled="disabled"
          :data-active="modelValue.duration === value ? 'true' : undefined" :aria-pressed="modelValue.duration === value" @click="update({ duration: value })"
        >
          {{ t(`watch_later.filters.duration_${value}`) }}
        </button>
      </div>
    </FilterSection>
    <FilterSection v-slot="{ expanded }" :title="t('watch_later.filters.by_date')">
      <div class="history-advanced-filters__dates">
        <div class="bew-segment-control bew-segment-control--static bew-segment-control--secondary history-advanced-filters__options" role="group" :aria-label="t('history.filters.period')">
          <button
            v-for="value in periods" :key="value" type="button" class="bew-segment-control__item" :disabled="disabled"
            :data-active="modelValue.period === value ? 'true' : undefined" :aria-pressed="modelValue.period === value" @click="update({ period: value, startDate: '', endDate: '' })"
          >
            {{ t(`history.filters.period_${value}`) }}
          </button>
        </div>
        <div class="history-advanced-filters__range">
          <div v-for="key in (['startDate', 'endDate'] as const)" :key="key" class="history-advanced-filters__date-field">
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
        <p v-if="invalidRange" class="history-advanced-filters__error" role="alert">
          {{ t('watch_later.filters.invalid_range') }}
        </p>
      </div>
    </FilterSection>
    <FilterSection :title="t('history.filters.by_device')">
      <div class="bew-segment-control bew-segment-control--static bew-segment-control--secondary history-advanced-filters__options history-advanced-filters__options--wide-first" role="group" :aria-label="t('history.filters.by_device')">
        <button
          v-for="value in devices" :key="value" type="button" class="bew-segment-control__item" :disabled="disabled"
          :data-active="modelValue.device === value ? 'true' : undefined" :aria-pressed="modelValue.device === value" @click="update({ device: value })"
        >
          <i :class="deviceIcons[value]" class="history-advanced-filters__device-icon" aria-hidden="true" />
          {{ t(`history.filters.device_${value}`) }}
        </button>
      </div>
    </FilterSection>
  </section>
</template>

<style scoped lang="scss">
.history-advanced-filters {
  display: grid;
  gap: var(--bew-space-3);
  padding: var(--bew-library-filter-padding);
  min-width: 0;
  border-radius: var(--bew-library-filter-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-message-pinned-background);
  container-type: inline-size;
}
.history-advanced-filters__options {
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
.history-advanced-filters__options--wide-first .bew-segment-control__item:first-child {
  grid-column: 1 / -1;
}
.history-advanced-filters__device-icon {
  flex: none;
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  font-size: var(--bew-control-icon-size);
  color: currentColor;
}
.history-advanced-filters__dates {
  display: grid;
  gap: var(--bew-space-2);
}
.history-advanced-filters__range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-2);
}
.history-advanced-filters__date-field {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-1);
  span {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}
.history-advanced-filters__error {
  margin: 0;
  color: var(--bew-error-foreground);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
@container (max-width: 240px) {
  .history-advanced-filters__range {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
