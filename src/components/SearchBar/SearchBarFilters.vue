<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'
import type { SearchScope, SearchVideoFilters } from '~/utils/searchUrl'
import { hasSearchVideoFilters, SEARCH_SCOPES } from '~/utils/searchUrl'

/**
 * The search panel's scope tabs and video pre-filters (Bilibili's own
 * categories and filters). The bar keeps focus in its input: every control
 * here skips focus on press, and Tab in the input moves the scope.
 */
const scope = defineModel<SearchScope>('scope', { required: true })
const filters = defineModel<SearchVideoFilters>('filters', { required: true })
const { t } = useI18n()

// Partitions (`tids`) are carried through the URL but get no row while Bilibili rebuilds that filter.
const filterRows = computed(() => [
  {
    key: 'order' as const,
    label: t('search.filters.order'),
    options: [
      { value: '', label: t('search.filters.order_relevance') },
      { value: 'click', label: t('search.filters.order_most_played') },
      { value: 'pubdate', label: t('search.filters.order_latest') },
      { value: 'dm', label: t('search.filters.order_most_danmaku') },
      { value: 'stow', label: t('search.filters.order_most_favorited') },
    ],
  },
  {
    key: 'timeRange' as const,
    label: t('search.filters.date'),
    options: [
      { value: 'all', label: t('search.filters.date_all') },
      { value: 'day', label: t('search.filters.date_day') },
      { value: 'week', label: t('search.filters.date_week') },
      { value: 'halfyear', label: t('search.filters.date_halfyear') },
    ],
  },
  {
    key: 'duration' as const,
    label: t('search.filters.duration'),
    options: [
      { value: 0, label: t('search.filters.duration_all') },
      { value: 1, label: t('search.filters.duration_under_10') },
      { value: 2, label: t('search.filters.duration_10_30') },
      { value: 3, label: t('search.filters.duration_30_60') },
      { value: 4, label: t('search.filters.duration_over_60') },
    ],
  },
])

const filterable = computed(() => scope.value === 'all' || scope.value === 'video')
const filtersActive = computed(() => hasSearchVideoFilters(filters.value))
const expanded = ref(filtersActive.value)
const open = computed(() => filterable.value && expanded.value)
const rendered = ref(open.value)
watch(open, (value) => {
  if (value)
    rendered.value = true
})
const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const { height, onTransitionEnd } = useMeasuredDisclosure(outer, inner, open, () => rendered.value = false, () => {})

function selectFilter(key: 'order' | 'timeRange' | 'duration', value: string | number) {
  filters.value = { ...filters.value, [key]: value, ...(key === 'timeRange' ? { customStartDate: '', customEndDate: '' } : {}) }
}
</script>

<template>
  <div class="search-bar-filters">
    <div class="search-bar-filters__bar">
      <div class="search-bar-filters__scroll">
        <div
          class="bew-segment-control bew-segment-control--surface bew-segment-control--track"
          role="group" :aria-label="t('search_bar.scope_label')"
        >
          <LiquidSegmentIndicator :active-key="scope" />
          <button
            v-for="value in SEARCH_SCOPES" :key="value"
            type="button" tabindex="-1"
            class="bew-segment-control__item" data-segment-item
            :data-active="scope === value ? 'true' : undefined"
            :aria-pressed="scope === value"
            @mousedown.prevent
            @click="scope = value"
          >
            {{ t(`search.categories.${value}`) }}
          </button>
        </div>
      </div>
      <Tooltip v-if="filterable" :content="t('library_tools.filters')" placement="bottom" teleport>
        <button
          type="button" tabindex="-1"
          class="bew-popover__action search-bar-filters__toggle"
          :class="{ 'search-bar-filters__toggle--active': filtersActive }"
          :aria-label="t('library_tools.filters')"
          :aria-expanded="open"
          @mousedown.prevent
          @click="expanded = !expanded"
        >
          <span :class="filtersActive ? 'i-tabler:filter-filled' : 'i-tabler:filter'" aria-hidden="true" />
        </button>
      </Tooltip>
    </div>

    <div
      v-if="rendered" ref="outer" class="search-bar-filters__disclosure"
      :style="{ height: height === undefined ? undefined : `${height}px` }" :inert="open ? undefined : true"
      @transitionend="onTransitionEnd"
    >
      <div ref="inner" class="search-bar-filters__rows">
        <div v-for="row in filterRows" :key="row.key" class="search-bar-filters__row">
          <span class="search-bar-filters__label">{{ row.label }}</span>
          <div class="search-bar-filters__scroll">
            <div
              class="bew-segment-control bew-segment-control--surface bew-segment-control--track"
              role="group" :aria-label="row.label"
            >
              <LiquidSegmentIndicator :active-key="filters[row.key]" />
              <button
                v-for="option in row.options" :key="option.value"
                type="button" tabindex="-1"
                class="bew-segment-control__item" data-segment-item
                :data-active="filters[row.key] === option.value ? 'true' : undefined"
                :aria-pressed="filters[row.key] === option.value"
                @mousedown.prevent
                @click="selectFilter(row.key, option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.search-bar-filters__bar {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
}

// A row wider than the panel scrolls sideways instead of wrapping.
.search-bar-filters__scroll {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.search-bar-filters__toggle {
  flex: 0 0 auto;
}

.search-bar-filters__toggle--active {
  color: var(--bew-text-1);
}

.search-bar-filters__disclosure {
  overflow: hidden;
  transition: height var(--bew-duration-normal) var(--bew-ease-standard);
}

.search-bar-filters__rows {
  display: grid;
  gap: var(--bew-space-2);
  padding: 0 var(--bew-space-2) var(--bew-space-2);
}

.search-bar-filters__row {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-width: 0;
}

// Labels start on the rows' content line below.
.search-bar-filters__label {
  flex: 0 0 auto;
  min-width: calc(var(--bew-space-8) + var(--bew-space-1));
  padding-inline-start: calc(var(--bew-popover-inset) - var(--bew-space-2));
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
}

@media (prefers-reduced-motion: reduce) {
  .search-bar-filters__disclosure {
    transition: none;
  }
}
</style>
