<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import Empty from '~/components/Empty.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { usePageViewState } from '~/composables/usePageViewState'
import { useReadyPageTransition } from '~/composables/useReadyPageTransition'
import { useSidebarRail } from '~/composables/useSidebarHost'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { SIDEBAR_HEADING_MOTION } from '~/utils/motionPriority'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { MarkAllMessagesReadController } from '../composables/useMarkAllMessagesRead'
import type { NotificationAccountState } from '../notificationFeedPolicy'
import type { NotificationView } from '../notificationSections'
import ConversationDetailSkeleton from './ConversationDetailSkeleton.vue'
import ConversationEmptyState from './ConversationEmptyState.vue'
import ConversationInsights from './ConversationInsights.vue'
import ConversationList from './ConversationList.vue'
import ConversationListSkeleton from './ConversationListSkeleton.vue'
import ConversationOriginalFallback from './ConversationOriginalFallback.vue'
import ConversationView from './ConversationView.vue'
import type { PrivateMessageWritesController as PrivateMessageWriteController } from './experimental/privateMessageWriteTypes'
import PrivateConversationMenu from './PrivateConversationMenu.vue'
import PrivateHistorySearchResults from './PrivateHistorySearchResults.vue'
import type { TransientPrivateRecipient } from './privateRecipientSearch'
import { PRIVATE_SEARCH_DEBOUNCE_MS } from './privateSearchPolicy'
import type { DisplayPrivateSession, PrivateSessionTypeFilter } from './privateSession'
import type { PrivateEmotePanelController } from './usePrivateEmotePanel'
import type { PrivateHistorySearchController } from './usePrivateHistorySearch'
import { usePrivateMessagePolling } from './usePrivateMessagePolling'
import type { PrivateMessagesController } from './usePrivateMessages'
import type { PrivateRecipientSearchController } from './usePrivateRecipientSearch'
import { privateSessionActionsKey } from './usePrivateSessionActions'
import type { PrivateSessionsController } from './usePrivateSessions'

const props = defineProps<{
  accountState: NotificationAccountState
  active: boolean
  view: NotificationView
  controller: PrivateSessionsController
  messagesController: PrivateMessagesController
  emoteController: PrivateEmotePanelController
  recipientSearch: PrivateRecipientSearchController
  historySearch?: PrivateHistorySearchController
  transientRecipient: TransientPrivateRecipient | null
  targetState?: { loading: boolean, failed: boolean }
  writeController: PrivateMessageWriteController | null
  readAll?: MarkAllMessagesReadController
}>()

const emit = defineEmits<{
  (event: 'closeConversation'): void
  (event: 'selectView', view: NotificationView): void
  (event: 'selectRecipient', recipient: TransientPrivateRecipient): void
  (event: 'selectSession', session: DisplayPrivateSession): void
  (event: 'transientSendConfirmed', talkerId: string): void
  (event: 'retryTarget'): void
}>()

const sidebarHost = useSidebarRail()

interface ConversationDetailExposed {
  focusHeading: () => void
  refresh?: () => Promise<void>
}

interface ConversationListExposed {
  focusSearch?: () => void
  focusSession: (sessionKey: string) => void
  getScrollTop: () => number
  restoreScrollTop: (scrollTop: number) => void
}

const { t } = useI18n()
const topBarStore = useTopBarStore()
const viewState = usePageViewState('notification-search-ui')
let pendingDetailFocusKey = ''
const conversationListRef = ref<ConversationListExposed | null>(null)
const searchQuery = viewState.ref('query', '')
const searchMode = viewState.ref<'people' | 'messages'>('mode', 'people')
const searchTypeFilter = viewState.ref<PrivateSessionTypeFilter>('type', 'all')
const historyWasRunning = viewState.ref('historyWasRunning', false)
// The view swap waits only for the sidebar heading's wheel.
const outletTransition = useReadyPageTransition(() => props.view, async () => {}, { motion: SIDEBAR_HEADING_MOTION })
const sessionActions = inject(privateSessionActionsKey, undefined)
const menuOpen = ref(false)
const menuTrigger = ref<HTMLElement | null>(null)
const menuAnchor = ref({ x: 0, y: 0 })
async function openSessionMenu(session: DisplayPrivateSession, trigger: HTMLElement) {
  if (!sessionActions || sessionActions.state.busy)
    return
  menuTrigger.value = trigger
  const rect = trigger.getBoundingClientRect()
  menuAnchor.value = { x: rect.right, y: rect.bottom }
  menuOpen.value = true
  await sessionActions.open(session)
}
function closeSessionMenu() {
  menuOpen.value = false
  sessionActions?.close()
}
onBeforeUnmount(closeSessionMenu)
watch(searchTypeFilter, filter => props.historySearch?.setTypeFilter(filter), { flush: 'sync', immediate: true })
const messageSearchActive = computed(() => searchMode.value === 'messages' && Boolean(searchQuery.value.trim()))
let resumeHistoryOnReturn = false
watch(searchQuery, () => {
  pendingDetailFocusKey = ''
  resumeHistoryOnReturn = false
  if (!searchQuery.value.trim())
    searchMode.value = 'people'
  if (messageSearchActive.value && props.active)
    void props.historySearch?.search(searchQuery.value, PRIVATE_SEARCH_DEBOUNCE_MS)
  else
    props.historySearch?.reset()
})
watch(() => topBarStore.userInfo.mid, () => {
  searchQuery.value = ''
  searchTypeFilter.value = 'all'
  historyWasRunning.value = false
  props.historySearch?.reset()
})
watch(() => props.historySearch?.state.running, (running) => {
  if (props.active && props.historySearch?.state.query === searchQuery.value.normalize('NFKC').trim())
    historyWasRunning.value = running === true
}, { flush: 'sync' })
watch(() => [props.active, props.accountState] as const, ([active, accountState]) => {
  if (!active) {
    props.historySearch?.suspend()
    return
  }
  if (accountState !== 'ready' || !messageSearchActive.value || !props.historySearch)
    return
  const resume = historyWasRunning.value
  if (props.historySearch.state.query !== searchQuery.value.normalize('NFKC').trim()) {
    // Restore only the query/UI. Private result bodies remain owned by the
    // current message page and are discarded when it is left.
    void props.historySearch.search(searchQuery.value, PRIVATE_SEARCH_DEBOUNCE_MS)
    if (!resume)
      props.historySearch.stop()
  }
  else if (resume) {
    void props.historySearch.resume()
  }
}, { immediate: true })
function searchMessages(direction?: number) {
  if (direction && props.historySearch?.state.query === searchQuery.value.normalize('NFKC').trim() && props.historySearch.filteredResults.value.length) {
    selectSearchMatch(props.historySearch.nextKey(direction), false)
    return
  }
  if (props.historySearch?.state.query === searchQuery.value.normalize('NFKC').trim())
    void props.historySearch.resume()
  else
    void props.historySearch?.search(searchQuery.value)
}
function changeSearchMode(mode: 'people' | 'messages') {
  if (mode === searchMode.value)
    return
  if (searchMode.value === 'messages') {
    resumeHistoryOnReturn = props.historySearch?.state.running ?? false
    props.historySearch?.suspend()
  }
  searchMode.value = mode
  if (mode === 'messages') {
    if (props.historySearch?.state.query === searchQuery.value.normalize('NFKC').trim()) {
      if (resumeHistoryOnReturn)
        void props.historySearch.resume()
    }
    else {
      searchMessages()
    }
  }
}
async function closeSearch() {
  searchQuery.value = ''
  await nextTick()
  conversationListRef.value?.focusSearch?.()
}
function selectSearchMatch(key: string, focusDetail = true) {
  const result = props.historySearch?.filteredResults.value.find(item => item.key === key)
  if (!result)
    return
  props.historySearch?.choose(key)
  if (props.controller.selectedSessionKey.value !== result.session.key || props.view !== 'whisper') {
    pendingDetailFocusKey = focusDetail ? result.session.key : ''
    emit('selectSession', result.session)
  }
}
const conversationDetailRef = ref<ConversationDetailExposed | null>(null)
const originalUrl = buildOriginalNotificationUrl('whisper')
const selectedSession = computed(() => props.controller.state.items.find(
  item => item.key === props.controller.selectedSessionKey.value,
))
const nativeSelectedSession = computed(() => (
  selectedSession.value?.capabilities.canReadNative
    ? selectedSession.value
    : null
))
const selectedDetailKey = computed(() => selectedSession.value?.key
  ?? (props.transientRecipient ? `transient:${props.transientRecipient.mid}` : ''))

const unreadCount = computed(() => (
  (topBarStore.unReadDm.follow_unread || 0)
  + (topBarStore.unReadDm.unfollow_unread || 0)
))

const errorMessage = computed(() => {
  const kind = props.controller.state.errorKind
  if (!kind)
    return ''
  return t(`notifications.whisper.errors.${kind}`)
})

function getActivePollingConversation() {
  if (props.view !== 'whisper' || messageSearchActive.value)
    return null
  if (selectedSession.value) {
    return {
      canReadNative: selectedSession.value.capabilities.canReadNative,
      maxSeqno: selectedSession.value.maxSeqno,
      talkerId: selectedSession.value.talkerId,
    }
  }
  if (props.transientRecipient) {
    return {
      canReadNative: true,
      maxSeqno: '',
      talkerId: props.transientRecipient.mid,
    }
  }
  return null
}

const messagePolling = usePrivateMessagePolling({
  getActiveConversation: getActivePollingConversation,
  getConversationStatus: (talkerId) => {
    const state = props.messagesController.getState(talkerId)
    return {
      errorKind: state.errorKind,
      failedOperation: state.failedOperation,
      loading: state.loadingInitial || state.refreshing,
      loadedAt: state.loadedAt,
    }
  },
  getCurrentMid: () => topBarStore.userInfo.mid ? String(topBarStore.userInfo.mid) : '',
  getSessionRefreshError: () => (
    props.controller.state.failedOperation === 'load-more'
      ? null
      : props.controller.state.errorKind
  ),
  invalidatePendingRequests: () => {
    props.controller.invalidatePendingRequests()
    props.messagesController.invalidatePendingRequests()
  },
  isEligible: () => (
    props.active
    && props.accountState === 'ready'
    && document.visibilityState === 'visible'
  ),
  refreshConversation: async (talkerId) => {
    if (getActivePollingConversation()?.talkerId === talkerId)
      await conversationDetailRef.value?.refresh?.()
  },
  refreshSessions: () => props.controller.refreshNew(),
  shouldObserveVisibility: () => props.active && props.accountState === 'ready',
})

function ensureLoaded() {
  if (props.active && props.accountState === 'ready')
    void props.controller.activate(unreadCount.value)
}

async function refresh() {
  if (props.accountState === 'ready')
    await props.controller.refresh()
  await nextTick()
  if (props.view === 'whisper' && (nativeSelectedSession.value || props.transientRecipient))
    await conversationDetailRef.value?.refresh?.()
}

function retry() {
  void props.controller.retryFailed()
}

function selectSession(session: DisplayPrivateSession) {
  props.controller.updateScrollTop(conversationListRef.value?.getScrollTop() ?? 0)
  if (selectedDetailKey.value === session.key) {
    pendingDetailFocusKey = ''
    emit('closeConversation')
    return
  }
  pendingDetailFocusKey = session.key
  emit('selectSession', session)
}

function selectRecipient(recipient: TransientPrivateRecipient) {
  props.controller.updateScrollTop(conversationListRef.value?.getScrollTop() ?? 0)
  if (selectedDetailKey.value === `transient:${recipient.mid}`) {
    pendingDetailFocusKey = ''
    emit('closeConversation')
    return
  }
  pendingDetailFocusKey = `transient:${recipient.mid}`
  emit('selectRecipient', recipient)
}

watch(
  () => [props.active, props.accountState, props.controller.state.generation] as const,
  ensureLoaded,
  { immediate: true },
)

watch(unreadCount, async (next, previous) => {
  if (
    props.active
    && props.accountState === 'ready'
    && next !== previous
  ) {
    await Promise.all([
      props.controller.observeUnreadCount(next),
      messagePolling.triggerNow(),
    ])
  }
})

async function focusPendingDetail() {
  const detail = conversationDetailRef.value
  const key = selectedDetailKey.value
  if (!detail || !key || pendingDetailFocusKey !== key)
    return
  await nextTick()
  if (props.active && detail === conversationDetailRef.value && key === selectedDetailKey.value && key === pendingDetailFocusKey) {
    pendingDetailFocusKey = ''
    detail.focusHeading()
  }
}

function beginDetailLeave(element: Element) {
  // Vue retains the outgoing DOM until its fade completes, while its component
  // is already disposed. Keep that snapshot out of pointer/keyboard interaction.
  if (element instanceof HTMLElement)
    element.inert = true
}

watch(conversationDetailRef, () => void focusPendingDetail(), { flush: 'post' })
watch(selectedDetailKey, async (nextSessionKey, previousSessionKey) => {
  if (nextSessionKey !== pendingDetailFocusKey)
    pendingDetailFocusKey = ''
  if (nextSessionKey && !previousSessionKey) {
    props.controller.updateScrollTop(
      conversationListRef.value?.getScrollTop() ?? props.controller.state.scrollTop,
    )
  }
  await nextTick()
  if (nextSessionKey)
    void focusPendingDetail()
  if (!nextSessionKey && previousSessionKey && props.active && selectedDetailKey.value === '') {
    conversationListRef.value?.restoreScrollTop(props.controller.state.scrollTop)
    conversationListRef.value?.focusSession(previousSessionKey)
  }
})

defineExpose({ refresh })
</script>

<template>
  <section
    class="whisper-workspace"
    :class="{
      'whisper-workspace--detail': Boolean(selectedSession || transientRecipient),
      'whisper-workspace--solid': settings.disableFrostedGlass,
    }"
  >
    <div v-if="sidebarHost" aria-hidden="true" />
    <Teleport :to="sidebarHost?.rail.value ?? 'body'" :disabled="!sidebarHost?.rail.value">
      <aside
        class="whisper-workspace__sessions conversation-list-card"
        :class="{ 'bew-sidebar-hosted': sidebarHost }"
        :aria-busy="accountState === 'profile-pending' || (controller.state.loading && !controller.state.loaded)"
      >
        <slot name="navigation" />
        <div :key="topBarStore.userInfo.mid" class="whisper-workspace__list-body">
          <ConversationListSkeleton
            v-if="accountState === 'profile-pending'"
            :compact="settings.privateMessageDensity === 'compact'"
            :label="t('notifications.whisper.profile_pending')"
          />

          <div v-else-if="accountState === 'logged-out'" class="whisper-workspace__state">
            <Empty text-only :description="t('notifications.whisper.errors.login-required')">
              <ALink :href="originalUrl" type="content" class="whisper-workspace__original-link">
                {{ t('notifications.actions.open_original') }}
              </ALink>
            </Empty>
          </div>

          <ConversationListSkeleton
            v-else-if="controller.state.loading && !controller.state.loaded"
            :compact="settings.privateMessageDensity === 'compact'"
            :label="t('notifications.whisper.loading')"
          />

          <div
            v-else-if="controller.state.errorKind && !controller.state.items.length"
            class="whisper-workspace__state"
          >
            <Empty text-only :description="errorMessage" :action-label="t('notifications.actions.retry')" @action="retry">
              <div class="whisper-workspace__state-actions">
                <ALink :href="originalUrl" type="content" class="whisper-workspace__original-link">
                  {{ t('notifications.actions.open_original') }}
                </ALink>
              </div>
            </Empty>
          </div>

          <template v-else>
            <div
              v-if="controller.state.errorKind && controller.state.failedOperation !== 'load-more'"
              class="whisper-workspace__inline-error"
              role="status"
            >
              <span>{{ errorMessage }}</span>
              <button type="button" @click="retry">
                {{ t('notifications.actions.retry') }}
              </button>
            </div>
            <div v-if="targetState?.loading || targetState?.failed" class="whisper-workspace__inline-error" role="status" :aria-label="targetState.loading ? t('common.loading') : undefined">
              <SkeletonBlock v-if="targetState.loading" width="70%" height="var(--bew-line-height-control)" />
              <template v-else>
                <span>{{ t('common.load_failed') }}</span>
                <button type="button" @click="emit('retryTarget')">
                  {{ t('notifications.actions.retry') }}
                </button>
              </template>
            </div>
            <ConversationList
              ref="conversationListRef"
              v-model:query="searchQuery"
              v-model:type-filter="searchTypeFilter"
              :search-mode="searchMode"
              :active="active"
              :compact="settings.privateMessageDensity === 'compact'"
              :items="controller.state.items"
              :loading-more="controller.state.loadingMore"
              :no-more="controller.state.noMore"
              :pagination-stalled="controller.state.paginationStalled"
              :recipient-search="recipientSearch"
              :load-more-failed="controller.state.failedOperation === 'load-more'"
              :selected-session-key="controller.selectedSessionKey.value"
              :selected-recipient="transientRecipient"
              :show-official-assistants="settings.showOfficialPrivateAssistants"
              @search-mode="changeSearchMode"
              @search-messages="searchMessages"
              @load-more="controller.loadMore()"
              @retry-load-more="controller.loadMore({ retry: true })"
              @select-recipient="selectRecipient"
              @select="selectSession"
              @menu="openSessionMenu"
            >
              <template #message-results>
                <PrivateHistorySearchResults
                  v-if="historySearch" :controller="historySearch" :query="searchQuery"
                  @search="searchMessages()" @select="selectSearchMatch"
                />
              </template>
            </ConversationList>
          </template>
        </div>
      </aside>
    </Teleport>

    <div
      id="notifications-outlet"
      class="whisper-workspace__detail"
      :class="{ 'whisper-workspace__detail--feed': view !== 'whisper' }"
      role="tabpanel"
      tabindex="0"
      :aria-label="t(`notifications.sections.${view}.label`)"
    >
      <Transition mode="out-in" v-bind="outletTransition">
        <div :key="view" class="whisper-workspace__outlet-page">
          <slot v-if="view !== 'whisper'" />
          <Transition
            v-else
            :key="`${topBarStore.userInfo.mid}:${accountState}`" name="whisper-detail" mode="out-in"
            @before-leave="beginDetailLeave"
          >
            <ConversationDetailSkeleton
              v-if="accountState === 'profile-pending' || (controller.state.loading && !controller.state.loaded)"
              :compact="settings.privateMessageDensity === 'compact'"
              :label="accountState === 'profile-pending'
                ? t('notifications.whisper.profile_pending')
                : t('notifications.whisper.loading')"
            />
            <ConversationInsights
              v-else-if="!selectedSession && !transientRecipient && accountState === 'ready'"
              :sessions="controller.state.items" :loaded="controller.state.loaded"
              :read-all="readAll"
              @select-session="selectSession" @select-view="emit('selectView', $event)"
            />
            <ConversationEmptyState v-else-if="!selectedSession && !transientRecipient" />
            <ConversationView
              v-else-if="nativeSelectedSession || transientRecipient"
              ref="conversationDetailRef"
              :active="active"
              :controller="messagesController"
              :emote-controller="emoteController"
              :session="nativeSelectedSession"
              :recipient="transientRecipient"
              :write-controller="writeController"
              :search-mode="messageSearchActive"
              :history-search="historySearch"
              @move-search="selectSearchMatch(historySearch?.nextKey($event) ?? '', false)"
              @close-search="closeSearch"
              @back="emit('closeConversation')"
              @send-confirmed="emit('transientSendConfirmed', $event)"
            />
            <ConversationOriginalFallback
              v-else-if="selectedSession"
              :key="selectedSession.key"
              ref="conversationDetailRef"
              class="whisper-workspace__fallback"
              :session="selectedSession"
              @back="emit('closeConversation')"
            />
          </Transition>
        </div>
      </Transition>
    </div>
    <PrivateConversationMenu v-if="menuOpen" :anchor="menuAnchor" :trigger="menuTrigger" @close="closeSessionMenu" />
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";
@use "../../../../styles/sidebarSurface";

.whisper-workspace__outlet-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.whisper-workspace {
  --notifications-workspace-gap: var(--bew-space-4);

  display: grid;
  grid-template-columns: minmax(0, var(--notifications-conversation-list-width)) minmax(0, 1fr);
  gap: var(--notifications-workspace-gap);
  align-items: start;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: visible;
  background: transparent;
}

.whisper-workspace__sessions,
.whisper-workspace__detail {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
}

.whisper-workspace .whisper-workspace__fallback {
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bew-glass-tint);
  border: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-2);
  backdrop-filter: var(--bew-filter-glass-1);
}

.whisper-workspace__sessions {
  @include sidebarSurface.rail;
  position: relative;
  // Above the top-bar's decorative edge, below its controls and popovers.
  z-index: var(--bew-z-base-overlay);
  display: flex;
  height: 100%;
  overflow: hidden;
  flex-direction: column;
  padding-top: var(--bew-top-bar-height);
  border: 0;
  border-inline-end: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: 0;
}

.whisper-workspace__list-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.whisper-workspace--solid .whisper-workspace__sessions:not(.bew-sidebar-hosted) {
  @include sidebarSurface.solid;
}

.whisper-workspace__detail {
  height: 100%;
  padding: calc(var(--bew-top-bar-height) + var(--bew-space-3)) var(--bew-space-4)
    var(--notifications-detail-bottom-space, var(--bew-space-3)) 0;
  overflow: visible;
  background: transparent;
  outline: none;
}

.whisper-workspace__detail:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: calc(-1 * var(--bew-space-0-5));
  border-radius: var(--bew-surface-radius);
}

// Feed padding belongs inside the scrolling viewport, so cards travel all the
// way beneath the screen edges instead of stopping at the toolbar/Dock inset.
// Vue retains the outgoing overview while it fades. Follow that actual DOM,
// not the new selection, so its width/padding stay fixed until it is gone.
.whisper-workspace:has(> .whisper-workspace__detail--feed),
.whisper-workspace:has(> .whisper-workspace__detail > .conversation-insights) {
  column-gap: 0;
}

.whisper-workspace__detail--feed,
.whisper-workspace__detail:has(> .conversation-insights) {
  padding: 0;
}

.whisper-workspace--solid .whisper-workspace__fallback {
  background: var(--bew-elevated-alt-solid);
  backdrop-filter: none;
}

.whisper-detail-enter-active,
.whisper-detail-leave-active {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.whisper-detail-enter-from,
.whisper-detail-leave-to {
  opacity: 0;
}

.whisper-detail-leave-active {
  pointer-events: none;
}

// A translucent ancestor would change the composer's glass sampling boundary.
// The prepared composer owns its small entrance instead of fading the shell.
.conversation-view.whisper-detail-enter-active {
  transition: none;
}

.conversation-view.whisper-detail-enter-from {
  opacity: 1;
}

.whisper-workspace__state {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-3);
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  text-align: center;
}

.whisper-workspace__state-actions {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
}

.whisper-workspace__original-link,
.whisper-workspace__inline-error button {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
}

.whisper-workspace__inline-error {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  background: var(--bew-fill-1);
}

.whisper-workspace__inline-error button {
  flex: 0 0 auto;
  padding: 0;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
}

@media (max-width: breakpoints.$compact-max) {
  .whisper-workspace {
    --notifications-workspace-gap: var(--bew-space-3);
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .whisper-workspace {
    --notifications-workspace-gap: var(--bew-space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .whisper-workspace__sessions,
  .whisper-workspace__detail,
  .whisper-detail-enter-active,
  .whisper-detail-leave-active {
    transition: none;
  }
}
</style>
