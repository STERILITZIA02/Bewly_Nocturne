<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LoadingRing from '~/components/LoadingRing.vue'
import TagRemoveButton from '~/components/TagRemoveButton.vue'
import { useLoadingRingPhase } from '~/composables/useLoadingRingPhase'
import FilterSection from '~/contentScripts/views/WatchLater/WatchLaterFilterSection.vue'

import type { FavoriteFilterQuery, FavoritePartitionOption, FavoriteUploaderOption } from './favoriteFilter'
import { FAVORITE_FILTER_KEYWORD_LENGTH, FAVORITE_FILTER_KEYWORD_LIMIT, isSameFavoriteFilter, normalizeFavoriteFilterKeyword, normalizeFavoriteFilterQuery } from './favoriteFilter'

const props = defineProps<{
  applied: FavoriteFilterQuery
  uploaders: FavoriteUploaderOption[]
  partitions: FavoritePartitionOption[]
  partitionsLoading: boolean
  partitionsFailed: boolean
  disabled?: boolean
  /** Search scope applies at once; the conditions below wait for "apply". */
  scope?: string
  scopeOptions?: ReadonlyArray<{ value: string, label: string }>
}>()
const emit = defineEmits<{
  apply: [query: FavoriteFilterQuery]
  loadPartitions: []
  retryPartitions: []
  scope: [value: string]
}>()

const { t } = useI18n()
// Reading partitions shows the ring until it has closed, then the result.
const partitionRing = ref<HTMLElement>()
const partitionPhase = useLoadingRingPhase(() => props.partitionsLoading && !props.partitions.length, () => partitionRing.value)
const draftMids = ref<number[]>([])
const draftTids = ref<number[]>([])
const draftKeywords = ref<string[]>([])
const keywordInput = ref('')
const knownUploaders = new Map<number, string>()

function syncDraft(query: FavoriteFilterQuery) {
  draftMids.value = [...query.mids]
  draftTids.value = [...query.tids]
  draftKeywords.value = [...query.keywords]
  keywordInput.value = ''
}
watch(() => props.applied, syncDraft, { immediate: true })
watch(() => props.uploaders, (options) => {
  for (const option of options)
    knownUploaders.set(option.mid, option.name)
}, { immediate: true })

const uploaderOptions = computed(() => {
  const listed = new Set(props.uploaders.map(option => option.mid))
  return [
    ...draftMids.value.filter(mid => !listed.has(mid)).map(mid => ({ mid, name: knownUploaders.get(mid) ?? String(mid), count: 0 })),
    ...props.uploaders,
  ]
})
const partitionOptions = computed(() => {
  const listed = new Set(props.partitions.map(option => option.tid))
  return [
    ...draftTids.value.filter(tid => !listed.has(tid)).map(tid => ({ tid, name: String(tid), count: 0 })),
    ...props.partitions,
  ]
})
const draft = computed(() => normalizeFavoriteFilterQuery({ mids: draftMids.value, tids: draftTids.value, keywords: draftKeywords.value }))
const changed = computed(() => !isSameFavoriteFilter(draft.value, props.applied) || Boolean(keywordInput.value.trim()))
const hasDraft = computed(() => draft.value.mids.length + draft.value.tids.length + draft.value.keywords.length > 0)
const hasApplied = computed(() => props.applied.mids.length + props.applied.tids.length + props.applied.keywords.length > 0)

function toggleValue(values: number[], value: number) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

function toggleMid(mid: number) {
  draftMids.value = toggleValue(draftMids.value, mid)
}

function toggleTid(tid: number) {
  draftTids.value = toggleValue(draftTids.value, tid)
}

function commitKeyword() {
  const keyword = normalizeFavoriteFilterKeyword(keywordInput.value).slice(0, FAVORITE_FILTER_KEYWORD_LENGTH)
  if (!keyword || draftKeywords.value.length >= FAVORITE_FILTER_KEYWORD_LIMIT) {
    keywordInput.value = keyword ? keywordInput.value : ''
    return
  }
  if (!draftKeywords.value.includes(keyword))
    draftKeywords.value = [...draftKeywords.value, keyword]
  keywordInput.value = ''
}

function handleKeywordKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter')
    return
  event.preventDefault()
  event.stopPropagation()
  commitKeyword()
}

function removeKeyword(keyword: string) {
  draftKeywords.value = draftKeywords.value.filter(item => item !== keyword)
}

function apply() {
  if (props.disabled)
    return
  commitKeyword()
  emit('apply', draft.value)
}

function clear() {
  if (props.disabled)
    return
  syncDraft(normalizeFavoriteFilterQuery(null))
  emit('apply', normalizeFavoriteFilterQuery(null))
}
</script>

<template>
  <section class="favorite-filter" :aria-label="t('favorites.filter_title')">
    <FilterSection v-if="scopeOptions?.length" memory-key="favorites:scope" :title="t('library_tools.search_scope')">
      <div class="bew-segment-control bew-segment-control--static bew-segment-control--secondary favorite-filter__options" role="group" :aria-label="t('library_tools.search_scope')">
        <button
          v-for="option in scopeOptions" :key="option.value" type="button" class="bew-segment-control__item" :disabled="disabled"
          :data-active="scope === option.value ? 'true' : undefined" :aria-pressed="scope === option.value"
          @click="scope !== option.value && emit('scope', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </FilterSection>

    <FilterSection memory-key="favorites:uploader" :title="t('favorites.filter_uploader')">
      <div v-if="uploaderOptions.length" class="favorite-filter__chips" role="group" :aria-label="t('favorites.filter_uploader')">
        <button
          v-for="option in uploaderOptions" :key="option.mid" type="button" class="favorite-filter__chip"
          :aria-pressed="draftMids.includes(option.mid)" :disabled="disabled" @click="toggleMid(option.mid)"
        >
          <!-- No count: it would only cover the pages read so far. -->
          <span class="favorite-filter__chip-label">{{ option.name }}</span>
        </button>
      </div>
      <p v-else class="bew-help">
        {{ t('favorites.filter_uploader_empty') }}
      </p>
    </FilterSection>

    <FilterSection memory-key="favorites:partition" :title="t('favorites.filter_partition')" @expanded="$event && emit('loadPartitions')">
      <div class="favorite-filter__group">
        <div v-if="partitionOptions.length" class="favorite-filter__chips" role="group" :aria-label="t('favorites.filter_partition')">
          <button
            v-for="option in partitionOptions" :key="option.tid" type="button" class="favorite-filter__chip"
            :aria-pressed="draftTids.includes(option.tid)" :disabled="disabled" @click="toggleTid(option.tid)"
          >
            <span class="favorite-filter__chip-label">{{ option.name }}</span>
            <span v-if="option.count" class="favorite-filter__chip-count">{{ option.count }}</span>
          </button>
        </div>
        <div v-else-if="partitionPhase !== 'idle'" ref="partitionRing" class="favorite-filter__loading" role="status" :aria-label="partitionsLoading ? t('common.loading') : undefined">
          <LoadingRing :loading="partitionsLoading" size="var(--bew-icon-size-md)" />
        </div>
        <p v-else class="bew-help">
          {{ t('favorites.filter_partition_empty') }}
        </p>
        <button v-if="partitionsFailed && !partitionsLoading" type="button" class="favorite-filter__link" @click="emit('retryPartitions')">
          {{ t('favorites.filter_partition_retry') }}
        </button>
      </div>
    </FilterSection>

    <FilterSection memory-key="favorites:keywords" :title="t('favorites.filter_keywords')">
      <div class="favorite-filter__group">
        <input
          v-model="keywordInput" class="favorite-filter__input" type="text" :maxlength="FAVORITE_FILTER_KEYWORD_LENGTH"
          :placeholder="t('favorites.filter_keywords_placeholder')" :aria-label="t('favorites.filter_keywords')"
          :disabled="disabled || draftKeywords.length >= FAVORITE_FILTER_KEYWORD_LIMIT"
          @keydown="handleKeywordKeydown"
        >
        <div v-if="draftKeywords.length" class="favorite-filter__chips">
          <span v-for="keyword in draftKeywords" :key="keyword" class="favorite-filter__chip favorite-filter__chip--static">
            <span class="favorite-filter__chip-label">{{ keyword }}</span>
            <TagRemoveButton :label="t('favorites.filter_keyword_remove', { keyword })" @click="removeKeyword(keyword)" />
          </span>
        </div>
      </div>
    </FilterSection>

    <!-- Conditions start a folder scan, so they wait for an explicit apply. -->
    <div v-if="changed || hasApplied" class="favorite-filter__actions">
      <button type="button" class="favorite-filter__button" :disabled="disabled || (!hasDraft && !hasApplied)" @click="clear">
        {{ t('favorites.filter_reset') }}
      </button>
      <button type="button" class="favorite-filter__button favorite-filter__button--primary" :disabled="disabled || !changed" @click="apply">
        {{ t('favorites.filter_apply') }}
      </button>
    </div>
  </section>
</template>

<style lang="scss" scoped>
@use "../../../styles/truncateFade";
@use "../../../styles/scrollEdgeFade";
@use "../../../styles/railSection";

// Laid flat on the rail between edge-to-edge hairlines, no backing plate.
.favorite-filter {
  @include railSection.flat;
  display: grid;
  gap: var(--bew-space-3);
}

// Matches the History / Watch Later two-column choice rows.
.favorite-filter__options {
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

.favorite-filter__group {
  display: grid;
  gap: var(--bew-space-2);
  min-width: 0;
}

.favorite-filter__chips {
  // A rail never fades (its section's clip keeps the lines to its own width).
  @include scrollEdgeFade.lines;
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
  max-height: 160px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.favorite-filter__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  max-width: 100%;
  min-height: var(--bew-control-item-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-2);
  background: transparent;
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover:not(:disabled) {
    background: var(--bew-hover-bg);
  }

  &[aria-pressed="true"] {
    color: var(--bew-text-1);
    background: var(--bew-selected-bg);
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.favorite-filter__chip--static {
  padding-right: var(--bew-space-1);
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
  cursor: default;
}

.favorite-filter__chip-label {
  min-width: 0;
  @include truncateFade.line;
}

.favorite-filter__loading {
  display: grid;
  place-items: center;
  min-height: var(--bew-control-height);
  color: var(--bew-text-2);
}
.favorite-filter__chip-count {
  color: var(--bew-text-3);
  font-variant-numeric: tabular-nums;
}

.favorite-filter__input {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--bew-control-item-height);
  padding: 0 var(--bew-space-3);
  border: 1px solid var(--bew-field-edge-color);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-1);
  background: transparent;
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  &::placeholder {
    color: var(--bew-text-3);
  }

  &:focus-visible {
    outline: var(--bew-focus-ring);
    outline-offset: 0;
  }
}

.favorite-filter__link {
  justify-self: start;
  padding: 0;
  border: 0;
  color: var(--bew-theme-foreground);
  background: transparent;
  font: inherit;
  font-size: var(--bew-font-size-control);
  cursor: pointer;
}

.favorite-filter__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bew-space-2);
}

.favorite-filter__button {
  min-height: var(--bew-control-item-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-2);
  background: var(--bew-hover-bg);
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.favorite-filter__button--primary {
  color: var(--bew-on-accent-solid);
  background: var(--bew-accent-solid);
}
</style>
