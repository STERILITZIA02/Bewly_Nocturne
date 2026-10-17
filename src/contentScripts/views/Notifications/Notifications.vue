<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { DrawerType, useBewlyApp } from '~/composables/useAppProvider'
import { useRouteState } from '~/composables/useRouteState'
import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { AppPage } from '~/enums/appEnums'
import { localSettings, settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'
import { buildBewlyNotificationUrl, normalizeNotificationRoute } from '~/utils/notificationRoute'
import type { PrivateConversationRoute } from '~/utils/privateConversationRoute'
import {
  buildPrivateConversationUrl,
  clearPrivateConversationRoute,
  isPrivateConversationSessionType,
  parsePrivateConversationRoute,
  PRIVATE_CONVERSATION_ROUTE_PARAMS,
} from '~/utils/privateConversationRoute'
import { changeUserRelation } from '~/utils/userRelation'

import NativeNotificationFeed from './components/NativeNotificationFeed.vue'
import NotificationsPageHeader from './components/NotificationsPageHeader.vue'
import NotificationsPageSkeleton from './components/NotificationsPageSkeleton.vue'
import { useMarkAllMessagesRead } from './composables/useMarkAllMessagesRead'
import type { NotificationPageParams } from './composables/useNotificationFeed'
import { useNotificationFeeds } from './composables/useNotificationFeeds'
import { resolveNotificationAccountState } from './notificationFeedPolicy'
import type {
  NativeNotificationSection,
  NotificationView,
} from './notificationSections'
import {
  isHybridNotificationView,
  isNativeNotificationSection,
  NOTIFICATION_SECTION_BY_ID,
} from './notificationSections'
import { createSystemNotificationPageFetcher } from './systemNotificationFeed'
import { getMessageInsights } from './whisper/messageInsights'
import type { TransientPrivateRecipient } from './whisper/privateRecipientSearch'
import type { DisplayPrivateSession } from './whisper/privateSession'
import { usePrivateConversationTarget } from './whisper/usePrivateConversationTarget'
import { usePrivateEmotePanel } from './whisper/usePrivateEmotePanel'
import { usePrivateHistorySearch } from './whisper/usePrivateHistorySearch'
import { usePrivateMessageWorkspace } from './whisper/usePrivateMessageWorkspace'
import { usePrivateRecipientSearch } from './whisper/usePrivateRecipientSearch'
import { privateSessionActionsKey, usePrivateSessionActions } from './whisper/usePrivateSessionActions'
import { usePrivateSessions } from './whisper/usePrivateSessions'
import WhisperWorkspace from './whisper/WhisperWorkspace.vue'

interface NativeNotificationFeedExposed {
  refresh: () => Promise<void>
}

interface WhisperWorkspaceExposed {
  refresh: () => Promise<void>
}

const { t } = useI18n()
const { activatedPage, handlePageRefresh, openSettingsAt, scrollViewportRef, activeDrawer } = useBewlyApp()
const routeState = useRouteState()
const topBarStore = useTopBarStore()

const currentView = ref<NotificationView>('whisper')
const routeReady = ref(false)
const nativeFeedRef = ref<NativeNotificationFeedExposed | null>(null)
const whisperWorkspaceRef = ref<WhisperWorkspaceExposed | null>(null)
const pendingPrivateConversationRoute = ref<PrivateConversationRoute | null>(null)
const transientPrivateRecipient = ref<TransientPrivateRecipient | null>(null)
const privateConversationRestoreAttempted = ref(false)
const currentMid = computed(() => topBarStore.userInfo.mid ? String(topBarStore.userInfo.mid) : '')
const accountState = computed(() => resolveNotificationAccountState(topBarStore.isLogin, currentMid.value))
const isPageActive = ref(false)
const isContentActive = computed(() => isPageActive.value && activeDrawer?.value !== DrawerType.IframeDrawer)
const privateEmotes = usePrivateEmotePanel(currentMid, () => api.moment.getMomentEmotes({ business: 'reply' }))
const privateSessions = usePrivateSessions(currentMid, {
  fetchSessions: () => api.privateMessage.getPrivateSessions(),
  fetchOlderSessions: endTs => api.privateMessage.getOlderPrivateSessions({ endTs }),
  fetchNewSessions: beginTs => api.privateMessage.getNewPrivateSessions({ beginTs }),
  fetchUserCards: uids => api.privateMessage.getPrivateUserCards({ uids }),
  getFallbackName: talkerId => t('notifications.whisper.user_fallback', { talkerId }),
})
const privateConversationTarget = usePrivateConversationTarget({
  account: currentMid,
  route: pendingPrivateConversationRoute,
  active: () => isContentActive.value && accountState.value === 'ready' && currentView.value === 'whisper' && String(getUserID() ?? '') === currentMid.value,
  sessions: privateSessions,
  fetchTarget: route => api.privateMessage.getPrivateConversationTarget(route),
  fetchCards: uids => api.privateMessage.getPrivateUserCards({ uids }),
  selectRecipient: recipient => transientPrivateRecipient.value = recipient,
})
const privateRecipientSearch = usePrivateRecipientSearch(currentMid, {
  fetchFollowing: params => api.user.searchUserFollowings(params),
  fetchGlobal: params => api.search.searchUser({
    keyword: params.keyword,
    page: params.page,
    page_size: params.pagesize,
  }),
})
const privateHistorySearch = usePrivateHistorySearch(currentMid, {
  sessions: privateSessions,
  active: () => isContentActive.value && accountState.value === 'ready',
  fetchMessages: options => api.privateMessage.getPrivateMessages(options),
})
const privateSessionActions = usePrivateSessionActions(currentMid, {
  active: () => isContentActive.value && accountState.value === 'ready' && String(getUserID() ?? '') === currentMid.value,
  getCsrf: getCSRF,
  detail: target => api.privateMessage.getPrivateSessionDetail(target),
  settings: target => api.privateMessage.getPrivateSessionSettings(target),
  relation: id => api.user.getRelations({ fids: id }),
  mutate: (action, input) => action === 'top'
    ? api.privateMessage.setPrivateSessionTop(input)
    : action === 'dnd' ? api.privateMessage.setPrivateSessionDnd(input) : api.privateMessage.setPrivateSessionPush(input),
  block: (account, id) => Number.isSafeInteger(Number(account)) && Number.isSafeInteger(Number(id))
    ? changeUserRelation(Number(account), Number(id), 5)
    : Promise.resolve({ code: -101 }),
  report: input => api.privateMessage.reportPrivateUser(input),
  messages: talkerId => api.privateMessage.getPrivateMessages({ talkerId, size: 20 }),
  reconcile: privateSessions.reconcileSessionSettings,
  blocked: (session) => {
    if (privateSessions.selectedSessionKey.value === session.key)
      closePrivateConversation()
    privateSessions.removeSession(session.key)
  },
})
provide(privateSessionActionsKey, privateSessionActions)
const activePrivateTalkerId = computed(() => (
  transientPrivateRecipient.value?.mid || privateSessions.selectedTalkerId.value
))
const privateMessageWorkspace = usePrivateMessageWorkspace(currentMid, activePrivateTalkerId, {
  fetchMessages: options => api.privateMessage.getPrivateMessages(options),
  ackSession: options => api.privateMessage.ackPrivateSession(options),
  getCsrf: getCSRF,
  getMaxCachedConversations: () => settings.value.maxCachedPrivateConversations,
  getMaxMessagesPerConversation: () => settings.value.maxPrivateMessagesPerConversation,
  markSessionRead: privateSessions.markSessionRead,
  syncUnread: () => topBarStore.syncUnreadMessageState(),
  sendMessage: options => api.privateMessage.sendPrivateMessage(options),
  uploadImage: options => api.privateMessage.uploadPrivateImage(options),
  cancelImageUpload: requestId => api.privateMessage.cancelPrivateImageUpload({ requestId }),
  sendImageMessage: options => api.privateMessage.sendPrivateImageMessage(options),
  getImageSummary: () => t('notifications.whisper.messages.image_summary'),
  markSessionSent: privateSessions.markSessionSent,
  refreshSessions: privateSessions.refresh,
})
const { messages: privateMessages, writes: privateMessageWrites } = privateMessageWorkspace
const fetchSystemNotificationPage = createSystemNotificationPageFetcher({
  getAccount: () => String(getUserID() ?? ''),
  isActive: () => isContentActive.value,
  fetchUnified: () => api.notification.getSystemUnifiedNotifications(),
  fetchUser: () => api.notification.getSystemUserNotifications(),
  fetchHistory: cursor => api.notification.getSystemNotificationHistory({ cursor }),
  markRead: cursor => api.notification.markSystemNotificationsRead({ cursor }),
})
const notificationFeeds = useNotificationFeeds(currentMid, {
  fetchPage: fetchNotificationPage,
})
const markAllMessagesRead = useMarkAllMessagesRead(currentMid, {
  active: () => isContentActive.value && accountState.value === 'ready',
  currentAccount: () => String(getUserID() ?? ''),
  fetchSessions: endTs => endTs === undefined
    ? api.privateMessage.getPrivateSessions()
    : api.privateMessage.getOlderPrivateSessions({ endTs }),
  ackSession: session => api.privateMessage.ackPrivateSession({ talkerId: session.talker_id, ackSeqno: session.max_seqno, csrf: getCSRF() }),
  sessionRead: session => privateSessions.markSessionRead(session.talker_id, session.max_seqno),
  markNotification: async (section) => {
    const counts = getMessageInsights([], topBarStore.unReadMessage, topBarStore.unReadDm)
    if (counts.notifications.find(item => item.key === section)?.count === 0)
      return true
    await notificationFeeds.loadInitial(section, { applyMode: 'merge-head' })
    const candidate = notificationFeeds.getReadCandidate(section)
    return Boolean(candidate && notificationFeeds.markCandidateReadLocally(section, candidate))
  },
  syncUnread: () => topBarStore.syncUnreadMessageState(),
})
const isBottomDock = computed(() => settings.value.dockPosition === 'bottom')
const currentSection = computed(() => NOTIFICATION_SECTION_BY_ID[currentView.value])
const nativeView = computed<NativeNotificationSection | null>(() => (
  isNativeNotificationSection(currentView.value) ? currentView.value : null
))
const isWhisperView = computed(() => isHybridNotificationView(currentView.value))

function hasPrivateConversationRouteParams(url: URL): boolean {
  return Object.values(PRIVATE_CONVERSATION_ROUTE_PARAMS).some(param => url.searchParams.has(param))
}

function replacePrivateConversationUrl(url: string) {
  if (window.location.href !== url)
    window.history.replaceState(window.history.state, '', url)
}

function isMobileWhisperLayout(): boolean {
  return window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`).matches
}

function rememberPrivateConversation(route: PrivateConversationRoute) {
  if (!currentMid.value)
    return
  localSettings.value.lastPrivateConversationRoute = {
    mid: currentMid.value,
    talkerId: route.talkerId,
    sessionType: route.sessionType,
  }
}

function maybeRestoreLastPrivateConversation() {
  if (
    privateConversationRestoreAttempted.value
    || currentView.value !== 'whisper'
    || accountState.value !== 'ready'
    || !privateSessions.state.loaded
  ) {
    return
  }

  if (
    settings.value.privateMessageMobileOpenMode !== 'last-conversation'
    || !isMobileWhisperLayout()
  ) {
    privateConversationRestoreAttempted.value = true
    return
  }

  const savedRoute = localSettings.value.lastPrivateConversationRoute
  if (!savedRoute || savedRoute.mid !== currentMid.value) {
    privateConversationRestoreAttempted.value = true
    return
  }

  const sessionKey = `${savedRoute.sessionType}:${savedRoute.talkerId}`
  const session = privateSessions.state.items.find(item => item.key === sessionKey)
  if (!session || !isPrivateConversationSessionType(session.sessionType)) {
    if (privateSessions.state.noMore)
      privateConversationRestoreAttempted.value = true
    return
  }

  privateConversationRestoreAttempted.value = true
  const route: PrivateConversationRoute = {
    talkerId: session.talkerId,
    sessionType: session.sessionType,
  }
  pendingPrivateConversationRoute.value = route
  privateSessions.selectSession(session)
  replacePrivateConversationUrl(buildPrivateConversationUrl(route))
}

function applyPendingPrivateConversationRoute() {
  const route = pendingPrivateConversationRoute.value
  if (!route || currentView.value !== 'whisper')
    return

  const expectedSessionKey = `${route.sessionType}:${route.talkerId}`
  const session = privateSessions.state.items.find(
    item => item.key === expectedSessionKey,
  )
  if (!session) {
    void privateConversationTarget.resolve()
    return
  }
  transientPrivateRecipient.value = null
  privateSessions.selectSession(session)
}

function syncPrivateConversationFromRoute(url: URL, view: NotificationView) {
  if (view !== 'whisper') {
    pendingPrivateConversationRoute.value = null
    transientPrivateRecipient.value = null
    privateSessions.clearSelectedSession()
    return
  }

  const route = parsePrivateConversationRoute(url)
  if (!route) {
    pendingPrivateConversationRoute.value = null
    transientPrivateRecipient.value = null
    privateSessions.clearSelectedSession()
    if (hasPrivateConversationRouteParams(url))
      replacePrivateConversationUrl(clearPrivateConversationRoute(url))
    void nextTick(maybeRestoreLastPrivateConversation)
    return
  }

  transientPrivateRecipient.value = null
  privateConversationRestoreAttempted.value = true

  const expectedSessionKey = `${route.sessionType}:${route.talkerId}`
  if (
    privateSessions.selectedSessionKey.value
    && privateSessions.selectedSessionKey.value !== expectedSessionKey
  ) {
    privateSessions.clearSelectedSession()
  }
  pendingPrivateConversationRoute.value = route
  applyPendingPrivateConversationRoute()
}

function resetWorkspacePagePosition() {
  void nextTick(() => scrollViewportRef.value?.scrollTo({ top: 0 }))
}

function selectPrivateConversation(session: DisplayPrivateSession) {
  if (!/^\d+$/.test(session.talkerId) || !isPrivateConversationSessionType(session.sessionType))
    return

  const route: PrivateConversationRoute = {
    talkerId: session.talkerId,
    sessionType: session.sessionType,
  }
  const currentRoute = parsePrivateConversationRoute(window.location.href)
  const isCurrentSelection = privateSessions.selectedSessionKey.value === session.key
  currentView.value = 'whisper'
  transientPrivateRecipient.value = null
  pendingPrivateConversationRoute.value = route
  privateSessions.selectSession(session)
  rememberPrivateConversation(route)
  resetWorkspacePagePosition()
  if (
    isCurrentSelection
    && currentRoute?.talkerId === route.talkerId
    && currentRoute.sessionType === route.sessionType
  ) {
    return
  }
  window.history.pushState(
    window.history.state,
    '',
    buildPrivateConversationUrl(route),
  )
}

function selectTransientPrivateRecipient(recipient: TransientPrivateRecipient) {
  if (!/^\d+$/.test(recipient.mid))
    return
  currentView.value = 'whisper'
  pendingPrivateConversationRoute.value = null
  privateSessions.clearSelectedSession()
  transientPrivateRecipient.value = recipient
  resetWorkspacePagePosition()
  const nextUrl = buildBewlyNotificationUrl('whisper')
  window.history.replaceState(
    window.history.state,
    '',
    nextUrl,
  )
}

function resolveTransientPrivateRecipientAfterSend(talkerId: string) {
  if (transientPrivateRecipient.value?.mid !== talkerId)
    return
  const session = privateSessions.state.items.find(
    item => item.sessionType === 1 && item.talkerId === talkerId,
  )
  if (!session)
    return
  transientPrivateRecipient.value = null
  selectPrivateConversation(session)
}

function closePrivateConversation() {
  pendingPrivateConversationRoute.value = null
  transientPrivateRecipient.value = null
  privateSessions.clearSelectedSession()
  resetWorkspacePagePosition()
  replacePrivateConversationUrl(clearPrivateConversationRoute(window.location.href))
}

function syncViewFromRoute(href: string) {
  const sourceUrl = new URL(href || window.location.href)
  // The outgoing page can still observe navigation during its leave transition.
  // Only normalize routes that belong to Notifications, before applying defaults.
  if (sourceUrl.searchParams.get('page') !== AppPage.Notifications)
    return

  const normalizedRoute = normalizeNotificationRoute(sourceUrl)
  const url = new URL(normalizedRoute.normalizedUrl)
  if (window.location.href !== normalizedRoute.normalizedUrl)
    replacePrivateConversationUrl(normalizedRoute.normalizedUrl)

  const nextView = normalizedRoute.view
  currentView.value = nextView
  syncPrivateConversationFromRoute(url, nextView)
  if (normalizedRoute.openMessageSettings)
    openSettingsAt({ category: 'bewly-pages', page: 'messages' })
  routeReady.value = true
}

function selectView(view: NotificationView) {
  if (view === currentView.value)
    return

  currentView.value = view
  if (view === 'whisper') {
    privateConversationRestoreAttempted.value = false
  }
  else {
    pendingPrivateConversationRoute.value = null
    transientPrivateRecipient.value = null
    privateSessions.clearSelectedSession()
  }
  window.history.pushState(
    window.history.state,
    '',
    buildBewlyNotificationUrl(view),
  )
}

function refreshCurrentView() {
  if (isWhisperView.value)
    void whisperWorkspaceRef.value?.refresh()
  else if (nativeView.value)
    void nativeFeedRef.value?.refresh()
}

function fetchNotificationPage(
  section: NativeNotificationSection,
  params?: NotificationPageParams,
): Promise<unknown> {
  if (section === 'reply') {
    return api.notification.getReplyNotifications({
      id: params?.id,
      reply_time: params?.reply_time,
    })
  }
  if (section === 'at') {
    return api.notification.getAtNotifications({
      id: params?.id,
      at_time: params?.at_time,
    })
  }
  if (section === 'love') {
    return api.notification.getLikeNotifications({
      id: params?.id,
      like_time: params?.like_time,
    })
  }
  return fetchSystemNotificationPage(params)
}

function registerRefreshHandler() {
  handlePageRefresh.value = refreshCurrentView
}

function clearRefreshHandler() {
  if (handlePageRefresh.value === refreshCurrentView)
    handlePageRefresh.value = undefined
}

function clearNotificationViewFromRoute() {
  if (activatedPage.value === AppPage.Notifications)
    return

  const currentUrl = new URL(window.location.href)
  const url = new URL(clearPrivateConversationRoute(currentUrl))
  const hasNotificationView = url.searchParams.has('notificationView')
  if (!hasNotificationView && url.href === currentUrl.href)
    return

  url.searchParams.delete('notificationView')
  replacePrivateConversationUrl(url.href)
}

function activatePage() {
  if (isPageActive.value)
    return

  isPageActive.value = true
  routeReady.value = false
  resetWorkspacePagePosition()
  privateConversationRestoreAttempted.value = false
  syncViewFromRoute(window.location.href)
  registerRefreshHandler()
}

function deactivatePage() {
  if (!isPageActive.value)
    return

  isPageActive.value = false
  privateMessageWorkspace.release()
  privateEmotes.release()
  clearRefreshHandler()
  clearNotificationViewFromRoute()
}

watch(() => routeState.navigationId, () => syncViewFromRoute(routeState.href))
watch(isContentActive, (active) => {
  if (!active) {
    privateMessageWorkspace.release()
    privateHistorySearch.suspend()
    privateRecipientSearch.pause()
  }
}, { flush: 'sync' })
watch(() => privateSessions.state.items, () => {
  applyPendingPrivateConversationRoute()
  maybeRestoreLastPrivateConversation()
})
watch(
  () => [
    settings.value.maxCachedPrivateConversations,
    settings.value.maxPrivateMessagesPerConversation,
  ] as const,
  () => {
    privateMessageWorkspace.enforceCacheLimits()
  },
)
watch(currentMid, (nextMid, previousMid) => {
  if (!previousMid || nextMid === previousMid)
    return
  pendingPrivateConversationRoute.value = null
  transientPrivateRecipient.value = null
  privateRecipientSearch.reset()
  privateConversationRestoreAttempted.value = false
  privateSessions.clearSelectedSession()
  if (currentView.value === 'whisper')
    replacePrivateConversationUrl(clearPrivateConversationRoute(window.location.href))
})

watchEffect(() => {
  if (isPageActive.value) {
    document.title = t('notifications.document_title', {
      section: t(currentSection.value.labelKey),
    })
  }
})

onMounted(() => {
  activatePage()
})
onActivated(activatePage)
onDeactivated(deactivatePage)
onBeforeUnmount(() => {
  privateMessageWorkspace.dispose()
  deactivatePage()
  clearRefreshHandler()
  clearNotificationViewFromRoute()
})
</script>

<template>
  <main
    class="notifications-page notifications-page--workspace"
    :class="{
      'notifications-page--dock-bottom': isBottomDock,
    }"
  >
    <div v-if="!routeReady" class="notifications-page__route-loading" aria-busy="true">
      <NotificationsPageSkeleton :label="t('common.loading')" :view="currentView" />
    </div>

    <template v-else>
      <div class="notifications-page__workspace">
        <WhisperWorkspace
          ref="whisperWorkspaceRef"
          :read-all="markAllMessagesRead"
          :view="currentView"
          :account-state="accountState"
          :active="isContentActive"
          :controller="privateSessions"
          :messages-controller="privateMessages"
          :emote-controller="privateEmotes"
          :recipient-search="privateRecipientSearch"
          :history-search="privateHistorySearch"
          :transient-recipient="transientPrivateRecipient"
          :target-state="privateConversationTarget.state"
          :write-controller="privateMessageWrites"
          @retry-target="privateConversationTarget.retry()"
          @select-view="selectView"
          @close-conversation="closePrivateConversation"
          @select-session="selectPrivateConversation"
          @select-recipient="selectTransientPrivateRecipient"
          @transient-send-confirmed="resolveTransientPrivateRecipientAfterSend"
        >
          <template #navigation>
            <NotificationsPageHeader :view="currentView" @select="selectView" />
          </template>
          <NativeNotificationFeed
            v-if="nativeView"
            :key="nativeView"
            ref="nativeFeedRef"
            :account-state="accountState"
            :active="isContentActive"
            :controller="notificationFeeds"
            :section="nativeView"
          />
        </WhisperWorkspace>
      </div>
    </template>
  </main>
</template>

<style scoped lang="scss">
@use "../../../styles/breakpoints";

.notifications-page {
  --notifications-conversation-list-width: var(--bew-messages-sidebar-width);
  --notifications-detail-bottom-space: var(--bew-space-3);

  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.notifications-page--workspace {
  height: 100dvh;
  overflow: visible;
}

:global(.bewly-scroll-viewport:has(.notifications-page--workspace)) {
  overflow-y: hidden;
  scrollbar-gutter: auto;
}

.notifications-page__route-loading {
  width: 100%;
  height: 100%;
  min-height: 100%;
  background: transparent;
}

.notifications-page--workspace.notifications-page--dock-bottom {
  --notifications-composer-dock-shift: var(--bew-dock-bottom-shift, 0px);
  --notifications-detail-bottom-space: calc(var(--bew-dock-control-size) + var(--bew-space-8));
}

.notifications-page__workspace {
  height: 100%;
  min-width: 0;
  min-height: 0;
}

@media (min-width: breakpoints.$grid-lg) {
  .notifications-page--workspace.notifications-page--dock-bottom {
    --notifications-detail-bottom-space: calc(var(--bew-dock-control-size-lg) + var(--bew-space-8));
  }
}
</style>
