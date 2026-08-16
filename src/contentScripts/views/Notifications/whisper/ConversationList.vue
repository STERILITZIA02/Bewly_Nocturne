<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ConversationListItem from './ConversationListItem.vue'
import type { TransientPrivateRecipient } from './privateRecipientSearch'
import { canSearchPrivateRecipients, normalizePrivateRecipientQuery } from './privateRecipientSearch'
import PrivateRecipientSearchResultItem from './PrivateRecipientSearchResultItem.vue'
import type {
  DisplayPrivateSession,
  PrivateSessionFilter,
  PrivateSessionTypeFilter,
} from './privateSession'
import { filterPrivateSessions } from './privateSession'
import type { PrivateRecipientSearchController } from './usePrivateRecipientSearch'

const props = defineProps<{
  active: boolean
  compact: boolean
  items: DisplayPrivateSession[]
  loadingMore: boolean
  noMore: boolean
  paginationStalled: boolean
  loadMoreFailed: boolean
  selectedSessionKey: string
  showOfficialAssistants: boolean
  recipientSearch: PrivateRecipientSearchController
}>()

const emit = defineEmits<{
  (event: 'select', session: DisplayPrivateSession): void
  (event: 'selectRecipient', recipient: TransientPrivateRecipient): void
  (event: 'loadMore'): void
  (event: 'retryLoadMore'): void
}>()

const { t } = useI18n()
const filter = ref<PrivateSessionFilter>('all')
const typeFilter = ref<PrivateSessionTypeFilter>('all')
const query = ref('')
const filters: PrivateSessionFilter[] = ['all', 'unread', 'pinned']
const typeFilters: PrivateSessionTypeFilter[] = ['all', 'user', 'official-assistant', 'other']
const itemsRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let observerGeneration = 0

const visibleItems = computed(() => props.showOfficialAssistants
  ? props.items
  : props.items.filter(item => item.kind !== 'official-assistant'))
const filteredItems = computed(() => filterPrivateSessions(visibleItems.value, {
  filter: filter.value,
  typeFilter: typeFilter.value,
  query: query.value,
}))
const normalizedQuery = computed(() => normalizePrivateRecipientQuery(query.value))
const localSearchMatches = computed(() => {
  const normalized = normalizedQuery.value.toLocaleLowerCase()
  return normalized
    ? visibleItems.value.filter(item => item.name.toLocaleLowerCase().includes(normalized))
    : visibleItems.value
})
const canOfferRemoteSearch = computed(() => (
  localSearchMatches.value.length === 0
  && canSearchPrivateRecipients(normalizedQuery.value)
))

const canAutoLoad = computed(() => (
  props.active
  && filter.value === 'all'
  && typeFilter.value === 'all'
  && !query.value.trim()
  && !props.loadingMore
  && !props.noMore
  && !props.paginationStalled
  && !props.loadMoreFailed
))

function disconnectObserver() {
  observerGeneration++
  observer?.disconnect()
  observer = null
}

function getScrollTop(): number {
  return itemsRef.value?.scrollTop ?? 0
}

function restoreScrollTop(scrollTop: number) {
  if (itemsRef.value)
    itemsRef.value.scrollTop = Math.max(0, scrollTop)
}

function focusSession(sessionKey: string) {
  const sessionItems = itemsRef.value?.querySelectorAll<HTMLElement>('[data-session-key]')
  const sessionItem = sessionItems
    ? Array.from(sessionItems).find(element => element.dataset.sessionKey === sessionKey)
    : undefined
  sessionItem?.focus({ preventScroll: true })
}

function handleListKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
    return
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('[data-session-key]')
    : null
  if (!target || !itemsRef.value?.contains(target))
    return

  const sessionItems = Array.from(
    itemsRef.value.querySelectorAll<HTMLElement>('[data-session-key]'),
  )
  const currentIndex = sessionItems.indexOf(target)
  if (currentIndex < 0)
    return
  const direction = event.key === 'ArrowDown' ? 1 : -1
  const nextIndex = Math.min(sessionItems.length - 1, Math.max(0, currentIndex + direction))
  if (nextIndex === currentIndex)
    return
  event.preventDefault()
  sessionItems[nextIndex]?.focus()
}

async function observeSentinel() {
  const generation = ++observerGeneration
  observer?.disconnect()
  observer = null
  await nextTick()
  if (generation !== observerGeneration)
    return
  if (!canAutoLoad.value || !itemsRef.value || !sentinelRef.value)
    return
  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && canAutoLoad.value)
      emit('loadMore')
  }, {
    root: itemsRef.value,
    rootMargin: '0px 0px 160px 0px',
    threshold: 0,
  })
  observer.observe(sentinelRef.value)
}

watch(
  () => [
    filteredItems.value.length,
    canAutoLoad.value,
    props.loadingMore,
    props.noMore,
    props.paginationStalled,
    props.loadMoreFailed,
  ] as const,
  () => void observeSentinel(),
  { immediate: true },
)

onBeforeUnmount(disconnectObserver)

watch(query, value => props.recipientSearch.setQuery(value), { immediate: true })

function findServerSession(talkerId: string): DisplayPrivateSession | undefined {
  return props.items.find(item => item.sessionType === 1 && item.talkerId === talkerId)
}

function selectSearchResult(recipient: TransientPrivateRecipient) {
  const session = findServerSession(recipient.mid)
  if (session)
    emit('select', session)
  else
    emit('selectRecipient', recipient)
}

defineExpose({ focusSession, getScrollTop, restoreScrollTop })
</script>

<template>
  <section
    class="conversation-list"
    :class="{ 'conversation-list--compact': compact }"
    :aria-label="t('notifications.whisper.list_aria')"
  >
    <div class="conversation-list__tools">
      <div class="conversation-list__search">
        <i i-mingcute:search-line aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          :aria-label="t('notifications.whisper.search_aria')"
          :placeholder="t('notifications.whisper.search_placeholder')"
        >
        <Tooltip v-if="query" :content="t('notifications.whisper.clear_search')" placement="bottom">
          <IconButton
            class="conversation-list__clear"
            shape="circle"
            :label="t('notifications.whisper.clear_search')"
            @click="query = ''"
          >
            <i i-mingcute:close-line />
          </IconButton>
        </Tooltip>
      </div>
      <div class="bew-segment-control bew-segment-control--static conversation-list__filters">
        <button
          v-for="filterId in filters"
          :key="filterId"
          type="button"
          class="bew-segment-control__item"
          :data-active="filter === filterId ? 'true' : undefined"
          :aria-pressed="filter === filterId"
          @click="filter = filterId"
        >
          {{ t(`notifications.whisper.filters.${filterId}`) }}
        </button>
      </div>

      <label class="conversation-list__type-filter">
        <span>{{ t('notifications.whisper.type_filter_label') }}</span>
        <span class="conversation-list__type-select">
          <select v-model="typeFilter">
            <option v-for="typeFilterId in typeFilters" :key="typeFilterId" :value="typeFilterId">
              {{ t(`notifications.whisper.type_filters.${typeFilterId}`) }}
            </option>
          </select>
          <i i-mingcute:down-line aria-hidden="true" />
        </span>
      </label>
    </div>

    <div
      v-if="filteredItems.length"
      ref="itemsRef"
      class="conversation-list__items"
      @keydown="handleListKeydown"
    >
      <ConversationListItem
        v-for="session in filteredItems"
        :key="session.key"
        :compact="compact"
        :session="session"
        :selected="selectedSessionKey === session.key"
        @select="emit('select', $event)"
      />
      <div ref="sentinelRef" class="conversation-list__sentinel" role="status">
        <template v-if="loadingMore">
          <span>{{ t('notifications.whisper.loading_more_sessions') }}</span>
        </template>
        <span v-else-if="noMore">{{ t('notifications.whisper.earliest_session') }}</span>
        <template v-else-if="paginationStalled || loadMoreFailed">
          <span>{{ t('notifications.whisper.load_more_failed') }}</span>
          <Button type="tertiary" @click="emit('retryLoadMore')">
            {{ t('notifications.actions.retry') }}
          </Button>
        </template>
      </div>
    </div>
    <div v-else class="conversation-list__empty">
      <div v-if="canOfferRemoteSearch" class="conversation-list__remote-search">
        <template v-if="recipientSearch.state.loading">
          <Loading />
          <span>{{ t('notifications.whisper.recipient_search.loading') }}</span>
        </template>

        <template v-else-if="recipientSearch.state.source && recipientSearch.state.items.length">
          <div class="conversation-list__remote-results">
            <PrivateRecipientSearchResultItem
              v-for="recipient in recipientSearch.state.items"
              :key="recipient.mid"
              :recipient="recipient"
              @select="selectSearchResult"
            />
          </div>
          <Button
            v-if="recipientSearch.state.hasMore"
            type="tertiary"
            @click="recipientSearch.loadMore()"
          >
            {{ t('notifications.whisper.recipient_search.more') }}
          </Button>
        </template>

        <template v-else-if="recipientSearch.state.source === 'following'">
          <Empty :description="t('notifications.whisper.recipient_search.following_empty')" />
          <Button type="tertiary" @click="recipientSearch.searchGlobal()">
            {{ t('notifications.whisper.recipient_search.search_global') }}
          </Button>
        </template>

        <template v-else-if="recipientSearch.state.source === 'global'">
          <Empty :description="t('notifications.whisper.recipient_search.global_empty')" />
        </template>

        <template v-else>
          <Empty :description="t('notifications.whisper.empty_filtered')" />
          <Button type="tertiary" @click="recipientSearch.searchFollowing()">
            {{ t('notifications.whisper.recipient_search.search_following') }}
          </Button>
        </template>

        <span v-if="recipientSearch.state.errorKind" class="conversation-list__remote-error" role="status">
          {{ t('notifications.whisper.recipient_search.error') }}
        </span>
      </div>
      <Empty v-else :description="visibleItems.length ? t('notifications.whisper.empty_filtered') : t('notifications.whisper.empty')" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.conversation-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.conversation-list__tools {
  display: grid;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
  border-bottom: 1px solid var(--bew-border-color);
}

.conversation-list__search {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  min-width: 0;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-3);
  background: var(--bew-fill-1);
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.conversation-list__search:focus-within {
  border-color: var(--bew-theme-focus-ring);
}

.conversation-list__search input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  color: var(--bew-text-1);
  font: inherit;
  background: transparent;
  border: 0;
  outline: none;
}

.conversation-list__clear {
  width: var(--bew-control-height-sm);
  height: var(--bew-control-height-sm);
}

.conversation-list__filters {
  width: 100%;
}

.conversation-list__filters .bew-segment-control__item {
  flex: 1 1 0;
  min-width: 0;
}

.conversation-list__type-filter {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  min-width: 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-list__type-filter > span:first-child {
  flex: 0 0 auto;
}

.conversation-list__type-select {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
}

.conversation-list__type-select select {
  width: 100%;
  min-width: 0;
  height: var(--bew-control-height-sm);
  padding: 0 var(--bew-space-8) 0 var(--bew-space-2);
  overflow: hidden;
  color: var(--bew-text-2);
  font: inherit;
  text-overflow: ellipsis;
  appearance: none;
  cursor: pointer;
  background: var(--bew-fill-1);
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.conversation-list__type-select select:focus-visible {
  border-color: var(--bew-theme-focus-ring);
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.conversation-list__type-select i {
  position: absolute;
  right: var(--bew-space-2);
  color: var(--bew-text-3);
  pointer-events: none;
}

.conversation-list__items {
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--bew-space-1);
  overflow: auto;
  overscroll-behavior: contain;
}

.conversation-list__sentinel {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: center;
  min-height: var(--bew-control-height);
  padding: var(--bew-space-3);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}

.conversation-list__empty {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  min-height: 0;
  padding: var(--bew-space-4);
  overflow: auto;
}

.conversation-list__remote-search {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-3);
  align-items: center;
}

.conversation-list__remote-results {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: var(--bew-space-1);
}

.conversation-list__remote-error {
  color: var(--bew-warning-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
