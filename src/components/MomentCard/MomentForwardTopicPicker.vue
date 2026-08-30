<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import api from '~/utils/api'

import type { MomentTopicSearchState, SelectedMomentTopic } from './momentForwardContent'
import {
  createMomentTopicSearchController,
  getMomentForwardResponseCode,
  getMomentForwardResponseMessage,
  normalizeMomentTopics,
} from './momentForwardContent'

const props = defineProps<{
  content: string
  searchPlaceholder: string
  emptyLabel: string
  retryLabel: string
  errorLabel: string
}>()

const emit = defineEmits<{
  select: [topic: SelectedMomentTopic]
  close: []
}>()

const query = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchState = reactive<MomentTopicSearchState>({
  results: [],
  loading: false,
})
const searchController = createMomentTopicSearchController({
  state: searchState,
  search: async (keywords, content) => {
    const response = await api.moment.searchMomentTopics({
      keywords,
      content,
      page_size: 10,
      page_num: 1,
      web_location: '333.1365',
    })
    if (getMomentForwardResponseCode(response) !== 0)
      throw new Error(getMomentForwardResponseMessage(response) || props.errorLabel)
    return normalizeMomentTopics(response)
  },
})
let searchTimer: ReturnType<typeof setTimeout> | undefined

function clearSearchTimer() {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer)
    searchTimer = undefined
  }
}

function scheduleSearch() {
  clearSearchTimer()
  searchController.invalidate()
  const keywords = query.value.trim()
  if (!keywords) {
    searchState.results = []
    return
  }
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    void searchController.search(keywords, props.content)
  }, 280)
}

watch([query, () => props.content], scheduleSearch)

onMounted(() => searchInputRef.value?.focus())
onBeforeUnmount(() => {
  searchController.invalidate()
  clearSearchTimer()
})
</script>

<template>
  <section
    class="moment-forward-topic-picker"
    role="dialog"
    :aria-label="searchPlaceholder"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <div class="moment-forward-topic-picker__search">
      <span i-tabler-search aria-hidden="true" />
      <input
        ref="searchInputRef"
        v-model="query"
        type="search"
        :placeholder="searchPlaceholder"
      >
    </div>
    <div v-if="searchState.loading" class="moment-forward-topic-picker__state" role="status">
      <span i-tabler-loader-2 class="bew-spinner" aria-hidden="true" />
    </div>
    <div v-else-if="searchState.error" class="moment-forward-topic-picker__state moment-forward-topic-picker__state--error" role="alert">
      <span>{{ searchState.error }}</span>
      <button type="button" @click="scheduleSearch">
        {{ retryLabel }}
      </button>
    </div>
    <div v-else-if="query.trim() && !searchState.results.length" class="moment-forward-topic-picker__state" role="status">
      {{ emptyLabel }}
    </div>
    <div v-else class="moment-forward-topic-picker__results">
      <button
        v-for="topic in searchState.results"
        :key="String(topic.id)"
        type="button"
        @click="emit('select', topic)"
      >
        <span>#{{ topic.name }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.moment-forward-topic-picker {
  display: flex;
  width: min(var(--bew-moment-forward-picker-width), calc(100cqw - var(--bew-space-8)));
  max-height: var(--bew-moment-forward-picker-max-height);
  flex-direction: column;
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-popover-radius);
  background: var(--bew-popover-surface-background-solid);
  box-shadow: var(--bew-popover-surface-shadow);
  corner-shape: var(--bew-corner-shape);
}
.moment-forward-topic-picker__search {
  display: flex;
  min-height: var(--bew-control-height-lg);
  align-items: center;
  gap: var(--bew-space-2);
  padding: 0 var(--bew-space-3);
  border-bottom: 1px solid var(--bew-border-color);
  color: var(--bew-text-3);
}
.moment-forward-topic-picker__search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--bew-text-1);
  background: transparent;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.moment-forward-topic-picker__results {
  display: flex;
  flex-direction: column;
  padding: var(--bew-space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.moment-forward-topic-picker__results button,
.moment-forward-topic-picker__state button {
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: transparent;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: left;
  cursor: pointer;
}
.moment-forward-topic-picker__results button:hover,
.moment-forward-topic-picker__state button:hover {
  background: var(--bew-fill-1);
}
.moment-forward-topic-picker__results button:focus-visible,
.moment-forward-topic-picker__state button:focus-visible,
.moment-forward-topic-picker__search input:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 1px;
}
.moment-forward-topic-picker__state {
  display: grid;
  min-height: var(--bew-moment-forward-picker-state-min-height);
  place-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}
.moment-forward-topic-picker__state--error {
  color: var(--bew-error-color);
}
</style>
