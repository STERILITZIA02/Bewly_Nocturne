<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import LibrarySearchField from '~/components/LibrarySearchField.vue'
import { usePageViewState } from '~/composables/usePageViewState'

import ConversationListItem from './ConversationListItem.vue'
import ConversationListSkeleton from './ConversationListSkeleton.vue'
import type { TransientPrivateRecipient } from './privateRecipientSearch'
import { normalizePrivateRecipientQuery, resolvePrivateRecipientSelection } from './privateRecipientSearch'
import PrivateRecipientSearchResultItem from './PrivateRecipientSearchResultItem.vue'
import { PRIVATE_SEARCH_DEBOUNCE_MS } from './privateSearchPolicy'
import type {
  DisplayPrivateSession,
  PrivateSessionFilter,
  PrivateSessionTypeFilter,
} from './privateSession'
import { filterPrivateSessions, matchesPrivateSessionType } from './privateSession'
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
  selectedRecipient?: TransientPrivateRecipient | null
  showOfficialAssistants: boolean
  recipientSearch: PrivateRecipientSearchController
  searchMode?: 'people' | 'messages'
}>()

const emit = defineEmits<{
  (event: 'select', session: DisplayPrivateSession): void
  (event: 'selectRecipient', recipient: TransientPrivateRecipient): void
  (event: 'loadMore'): void
  (event: 'retryLoadMore'): void
  (event: 'searchMode', mode: 'people' | 'messages'): void
  (event: 'searchMessages', direction?: number): void
  (event: 'menu', session: DisplayPrivateSession, trigger: HTMLElement): void
}>()

const { t } = useI18n()
const viewState = usePageViewState('conversation-list-ui')
const filter = viewState.ref<PrivateSessionFilter>('filter', 'all')
const typeFilter = defineModel<PrivateSessionTypeFilter>('typeFilter', { default: 'all' })
const query = defineModel<string>('query', { default: '' })
const filters: PrivateSessionFilter[] = ['all', 'unread', 'pinned']
const typeFilters: PrivateSessionTypeFilter[] = ['all', 'user', 'official-assistant', 'other']
const itemsRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<InstanceType<typeof LibrarySearchField> | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let observerGeneration = 0

const visibleItems = computed(() => props.showOfficialAssistants
  ? props.items
  : props.items.filter(item => item.kind !== 'official-assistant'))
const filteredItems = computed(() => filterPrivateSessions(visibleItems.value, {
  filter: query.value.trim() ? 'all' : filter.value,
  typeFilter: typeFilter.value,
  query: query.value,
}))
const normalizedQuery = computed(() => normalizePrivateRecipientQuery(query.value))
const messageSearch = computed(() => props.searchMode === 'messages' && Boolean(normalizedQuery.value))
const recipientGroups = computed(() => {
  const groups = props.recipientSearch.state.groups
  const directSessions = new Map(props.items.filter(item => item.sessionType === 1).map(item => [item.talkerId, item]))
  const followed = new Set([
    ...groups.following.items.map(item => item.mid),
    ...groups.global.items.filter(item => item.followed).map(item => item.mid),
    ...props.items.filter(item => item.sessionType === 1 && item.followed).map(item => item.talkerId),
  ])
  const results = new Map<string, { key: string, recipient: TransientPrivateRecipient, session?: DisplayPrivateSession }>()
  for (const session of filteredItems.value) {
    results.set(session.key, { key: session.key, session, recipient: { mid: session.talkerId, name: session.name, avatar: session.avatar, source: 'global' } })
  }
  for (const recipient of [...groups.following.items, ...groups.global.items]) {
    const session = directSessions.get(recipient.mid)
    const key = session?.key ?? `recipient:${recipient.mid}`
    if (!results.has(key) && matchesPrivateSessionType(session?.kind ?? 'user', typeFilter.value)
      && (props.showOfficialAssistants || session?.kind !== 'official-assistant')) {
      results.set(key, { key, recipient, session })
    }
  }
  const rows = [...results.values()].map(row => ({ ...row, recipient: { ...row.recipient, source: followed.has(row.recipient.mid) ? 'following' as const : 'global' as const } }))
  return (['following', 'global'] as const).map(source => ({ source, items: rows.filter(row => row.recipient.source === source) }))
})
const hasPeopleResults = computed(() => recipientGroups.value.some(group => group.items.length))
const recipientErrors = computed(() => (['following', 'global'] as const).filter(source => props.recipientSearch.state.groups[source].errorKind))
const noPeopleResults = computed(() => Boolean(normalizedQuery.value) && props.recipientSearch.state.complete
  && !props.recipientSearch.state.loading && !props.recipientSearch.state.searching
  && !recipientErrors.value.length && !hasPeopleResults.value)
const outsideSelection = computed(() => {
  const rendered = normalizedQuery.value
    ? recipientGroups.value.flatMap(group => group.items.map(row => row.session?.key))
    : filteredItems.value.map(item => item.key)
  return props.items.find(item => item.key === props.selectedSessionKey && !rendered.includes(item.key))
})
watch(() => [props.active, props.selectedSessionKey, props.selectedRecipient?.mid], async () => {
  if (!props.active)
    return
  await nextTick()
  const selected = Array.from(itemsRef.value?.querySelectorAll<HTMLElement>('[data-session-key], [data-recipient-mid]') ?? [])
    .find(element => element.dataset.sessionKey === props.selectedSessionKey || (props.selectedRecipient && element.dataset.recipientMid === props.selectedRecipient.mid))
  selected?.scrollIntoView?.({ block: 'nearest' })
}, { immediate: true })
let searchTimer: ReturnType<typeof setTimeout> | undefined
let normalScrollTop = 0
watch(() => Boolean(normalizedQuery.value), async (searching) => {
  if (searching) {
    normalScrollTop = itemsRef.value?.scrollTop ?? 0
  }
  else {
    await nextTick()
    restoreScrollTop(normalScrollTop)
  }
})

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
  return normalizedQuery.value ? normalScrollTop : itemsRef.value?.scrollTop ?? 0
}

function restoreScrollTop(scrollTop: number) {
  if (normalizedQuery.value) {
    normalScrollTop = scrollTop
    return
  }
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

watch(() => [query.value, props.active, props.searchMode] as const, () => {
  clearTimeout(searchTimer)
  props.recipientSearch.setQuery(props.active ? query.value : '')
  if (props.active && normalizedQuery.value && !messageSearch.value) {
    searchTimer = setTimeout(() => {
      if (!document.hidden && props.active)
        void props.recipientSearch.resume()
    }, PRIVATE_SEARCH_DEBOUNCE_MS)
  }
  else {
    props.recipientSearch.pause()
  }
}, { immediate: true })
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  props.recipientSearch.pause()
})

function submitSearch(direction?: number) {
  clearTimeout(searchTimer)
  if (messageSearch.value)
    emit('searchMessages', direction)
  else
    void props.recipientSearch.resume()
}

function selectSearchResult(recipient: TransientPrivateRecipient) {
  const selection = resolvePrivateRecipientSelection(recipient, props.items)
  if ('session' in selection)
    emit('select', selection.session)
  else
    emit('selectRecipient', recipient)
}

defineExpose({ focusSession, getScrollTop, restoreScrollTop, focusSearch: () => searchInputRef.value?.focus() })
</script>

<template>
  <section
    class="conversation-list"
    :class="{ 'conversation-list--compact': compact }"
    :aria-label="t('notifications.whisper.list_aria')"
  >
    <div class="conversation-list__tools" :class="{ 'conversation-list__tools--pinned': filteredItems.some(session => session.pinned) }">
      <LibrarySearchField
        ref="searchInputRef" v-model="query" :label="t('notifications.whisper.search_aria')"
        clear-on-escape :filter-active="typeFilter !== 'all'"
        @submit="event => submitSearch(event ? (event.shiftKey ? -1 : 1) : undefined)"
      >
        <template #filter>
          <select v-model="typeFilter" name="conversation-type" :aria-label="t('notifications.whisper.type_filter_label')">
            <option v-for="typeFilterId in typeFilters" :key="typeFilterId" :value="typeFilterId">
              {{ t(`notifications.whisper.type_filters.${typeFilterId}`) }}
            </option>
          </select>
        </template>
      </LibrarySearchField>
      <div v-if="normalizedQuery" class="bew-segment-control bew-segment-control--static bew-segment-control--secondary conversation-list__filters">
        <button
          v-for="mode in (['people', 'messages'] as const)" :key="mode" type="button" class="bew-segment-control__item" :data-active="(searchMode ?? 'people') === mode ? 'true' : undefined"
          :aria-pressed="(searchMode ?? 'people') === mode" @click="emit('searchMode', mode)"
        >
          {{ t(`notifications.whisper.search.${mode}`) }}
        </button>
      </div>
      <div v-else class="bew-segment-control bew-segment-control--static bew-segment-control--secondary conversation-list__filters">
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
    </div>

    <div v-if="messageSearch" class="conversation-list__items conversation-list__history-results">
      <slot name="message-results" />
    </div>
    <div
      v-else
      ref="itemsRef"
      class="conversation-list__items"
      :class="{ 'conversation-list__items--empty': !selectedRecipient && !outsideSelection && ((!normalizedQuery && !filteredItems.length) || noPeopleResults) }"
      @keydown="handleListKeydown"
    >
      <PrivateRecipientSearchResultItem v-if="selectedRecipient" :recipient="selectedRecipient" selected @select="emit('selectRecipient', $event)" />
      <ConversationListItem
        v-if="outsideSelection" :session="outsideSelection" :compact="compact" selected @select="emit('select', $event)"
        @menu="(session, trigger) => emit('menu', session, trigger)"
      />
      <template v-if="!normalizedQuery">
        <ConversationListItem
          v-for="session in filteredItems"
          :key="session.key"
          :compact="compact"
          :session="session"
          :selected="selectedSessionKey === session.key"
          @select="emit('select', $event)"
          @menu="(session, trigger) => emit('menu', session, trigger)"
        />
      </template>
      <template v-if="normalizedQuery">
        <template v-for="group in recipientGroups" :key="group.source">
          <section v-if="group.items.length" :aria-label="t(`notifications.whisper.search.${group.source}`)">
            <p class="conversation-list__search-heading">
              {{ t(`notifications.whisper.search.${group.source}`) }}
            </p>
            <template v-for="row in group.items" :key="row.key">
              <ConversationListItem
                v-if="row.session" :session="row.session" :compact="compact" :selected="selectedSessionKey === row.session.key" @select="emit('select', $event)"
                @menu="(session, trigger) => emit('menu', session, trigger)"
              />
              <PrivateRecipientSearchResultItem v-else :recipient="row.recipient" @select="selectSearchResult" />
            </template>
          </section>
        </template>
        <ConversationListSkeleton v-if="recipientSearch.state.loading || recipientSearch.state.searching" :compact="compact" :count="2" :label="t('notifications.whisper.recipient_search.loading')" :show-tools="false" />
        <div v-else-if="recipientSearch.state.groups.global.hasMore && hasPeopleResults" class="conversation-list__more">
          <button type="button" class="bew-message-search-pill" @click="recipientSearch.loadMore('global')">
            {{ t('notifications.whisper.recipient_search.more') }}
          </button>
        </div>
        <p v-for="source in recipientErrors" :key="source" class="conversation-list__remote-error" role="status">
          {{ t(`notifications.whisper.search.${source}`) }} · {{ t('notifications.whisper.recipient_search.error') }}
          <button type="button" @click="submitSearch()">
            {{ t('notifications.actions.retry') }}
          </button>
        </p>
        <p v-if="noPeopleResults" class="conversation-list__empty" role="status">
          {{ t('notifications.whisper.search.users_empty') }}
        </p>
      </template>
      <p v-else-if="!filteredItems.length && !selectedRecipient && !outsideSelection" class="conversation-list__empty" role="status">
        {{ visibleItems.length ? t('notifications.whisper.empty_filtered') : t('notifications.whisper.empty') }}
      </p>
      <div
        v-if="!normalizedQuery && (filteredItems.length || canAutoLoad || loadingMore || paginationStalled || loadMoreFailed)"
        ref="sentinelRef"
        class="conversation-list__sentinel"
        :class="{ 'conversation-list__sentinel--loading': loadingMore }"
        :role="loadingMore ? undefined : 'status'"
      >
        <ConversationListSkeleton
          v-if="loadingMore"
          :compact="compact"
          :count="2"
          :label="t('notifications.whisper.loading_more_sessions')"
          :show-tools="false"
        />
        <span v-else-if="noMore && filteredItems.length">{{ t('notifications.whisper.earliest_session') }}</span>
        <template v-else-if="paginationStalled || loadMoreFailed">
          <span>{{ t('notifications.whisper.load_more_failed') }}</span>
          <Button type="tertiary" @click="emit('retryLoadMore')">
            {{ t('notifications.actions.retry') }}
          </Button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";
@use "../../../../styles/sidebarSurface";

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

.conversation-list__tools--pinned {
  border-bottom-color: transparent;
}

.conversation-list__search-heading,
.conversation-list__history-results {
  padding: var(--bew-space-3);
}
.conversation-list__search-heading {
  margin: 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-list__items {
  @include sidebarSurface.vertical-scroll;
  animation: conversation-results-enter var(--bew-duration-fast) var(--bew-ease-standard);
}
@keyframes conversation-results-enter {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-list__items {
    animation: none;
  }
}

.conversation-list__filters {
  --bew-control-radius: var(--bew-radius-full);
  --bew-control-item-radius: var(--bew-radius-full);
  width: 100%;
}

.conversation-list__filters .bew-segment-control__item {
  flex: 1 1 0;
  min-width: 0;
}

.conversation-list__more {
  display: flex;
  justify-content: center;
  margin-block: var(--bew-space-4);
}

.conversation-list__items {
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--bew-space-1);
}

.conversation-list__items--empty {
  position: relative;
  display: flex;
  flex-direction: column;
}

.conversation-list__empty {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  margin: 0;
  padding: var(--bew-space-4);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: center;
}

.conversation-list__items--empty .conversation-list__sentinel {
  flex: none;
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

.conversation-list__sentinel--loading {
  display: block;
  min-height: 0;
  padding: 0;
}

.conversation-list__remote-error {
  color: var(--bew-warning-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-list__tools {
    padding: var(--bew-space-2);
  }

  .conversation-list__filters .bew-segment-control__item {
    padding-inline: var(--bew-space-1);
  }
}
</style>
