<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useRouteState } from '~/composables/useRouteState'
import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { AppPage } from '~/enums/appEnums'
import { localSettings, settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF } from '~/utils/main'
import { buildBewlyNotificationUrl, normalizeNotificationRoute } from '~/utils/notificationRoute'
import type { PrivateConversationRoute } from '~/utils/privateConversationRoute'
import {
  buildPrivateConversationUrl,
  clearPrivateConversationHistoryState,
  clearPrivateConversationRoute,
  createPrivateConversationHistoryState,
  isPrivateConversationHistoryState,
  isPrivateConversationSessionType,
  parsePrivateConversationRoute,
  PRIVATE_CONVERSATION_ROUTE_PARAMS,
} from '~/utils/privateConversationRoute'

import NativeNotificationFeed from './components/NativeNotificationFeed.vue'
import NotificationsPageHeader from './components/NotificationsPageHeader.vue'
import NotificationsPageSkeleton from './components/NotificationsPageSkeleton.vue'
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
import { useExperimentalPrivateMessageWrites } from './whisper/experimental/usePrivateMessageWrites'
import type { TransientPrivateRecipient } from './whisper/privateRecipientSearch'
import type { DisplayPrivateSession } from './whisper/privateSession'
import type { PrivateMessagesDependencies } from './whisper/usePrivateMessages'
import { usePrivateMessages } from './whisper/usePrivateMessages'
import { usePrivateRecipientSearch } from './whisper/usePrivateRecipientSearch'
import { usePrivateSessions } from './whisper/usePrivateSessions'
import WhisperWorkspace from './whisper/WhisperWorkspace.vue'

interface NativeNotificationFeedExposed {
  refresh: () => Promise<void>
}

interface WhisperWorkspaceExposed {
  refresh: () => Promise<void>
}

const { t } = useI18n()
const { activatedPage, handlePageRefresh, openSettingsAt, scrollViewportRef } = useBewlyApp()
const routeState = useRouteState()
const topBarStore = useTopBarStore()

const currentView = ref<NotificationView>('whisper')
const measuredNavigationWidth = ref<number | null>(null)
const routeReady = ref(false)
const nativeFeedRef = ref<NativeNotificationFeedExposed | null>(null)
const whisperWorkspaceRef = ref<WhisperWorkspaceExposed | null>(null)
const pendingPrivateConversationRoute = ref<PrivateConversationRoute | null>(null)
const transientPrivateRecipient = ref<TransientPrivateRecipient | null>(null)
const privateConversationRestoreAttempted = ref(false)
const currentMid = computed(() => topBarStore.userInfo.mid ? String(topBarStore.userInfo.mid) : '')
const accountState = computed(() => resolveNotificationAccountState(topBarStore.isLogin, currentMid.value))
const privateSessions = usePrivateSessions(currentMid, {
  fetchSessions: () => api.privateMessage.getPrivateSessions(),
  fetchOlderSessions: endTs => api.privateMessage.getOlderPrivateSessions({ endTs }),
  fetchNewSessions: beginTs => api.privateMessage.getNewPrivateSessions({ beginTs }),
  fetchUserCards: uids => api.privateMessage.getPrivateUserCards({ uids }),
  getFallbackName: talkerId => t('notifications.whisper.user_fallback', { talkerId }),
})
const privateRecipientSearch = usePrivateRecipientSearch(currentMid, {
  fetchFollowing: params => api.user.searchUserFollowings(params),
  fetchGlobal: params => api.search.searchUser({
    keyword: params.keyword,
    page: params.page,
    page_size: params.pagesize,
  }),
})
const activePrivateTalkerId = computed(() => (
  transientPrivateRecipient.value?.mid || privateSessions.selectedTalkerId.value
))
const privateMessageDependencies: PrivateMessagesDependencies = {
  fetchMessages: options => api.privateMessage.getPrivateMessages(options),
  ackSession: options => api.privateMessage.ackPrivateSession(options),
  getCsrf: getCSRF,
  getMaxCachedConversations: () => settings.value.maxCachedPrivateConversations,
  getMaxMessagesPerConversation: () => settings.value.maxPrivateMessagesPerConversation,
  markSessionRead: privateSessions.markSessionRead,
  syncUnread: () => topBarStore.syncUnreadMessageState(),
}
const privateMessages = usePrivateMessages(
  currentMid,
  activePrivateTalkerId,
  privateMessageDependencies,
)
const privateMessageWrites = useExperimentalPrivateMessageWrites(currentMid, activePrivateTalkerId, {
  fetchMessages: options => api.privateMessage.getPrivateMessages(options),
  ackSession: options => api.privateMessage.ackPrivateSession(options),
  getCsrf: getCSRF,
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
const fetchSystemNotificationPage = createSystemNotificationPageFetcher({
  fetchUnified: () => api.notification.getSystemUnifiedNotifications(),
  fetchUser: () => api.notification.getSystemUserNotifications(),
  fetchHistory: cursor => api.notification.getSystemNotificationHistory({ cursor }),
  markRead: cursor => api.notification.markSystemNotificationsRead({ cursor }),
})
const notificationFeeds = useNotificationFeeds(currentMid, {
  fetchPage: fetchNotificationPage,
})
const isBottomDock = computed(() => settings.value.dockPosition === 'bottom')
const currentSection = computed(() => NOTIFICATION_SECTION_BY_ID[currentView.value])
const nativeView = computed<NativeNotificationSection | null>(() => (
  isNativeNotificationSection(currentView.value) ? currentView.value : null
))
const isWhisperView = computed(() => isHybridNotificationView(currentView.value))
const usesWorkspaceLayout = computed(() => currentSection.value.layout === 'workspace')
const notificationsPageStyle = computed(() => measuredNavigationWidth.value === null
  ? undefined
  : { '--notifications-navigation-width': `${measuredNavigationWidth.value}px` })

const isPageActive = ref(false)

function updateNavigationWidth(width: number) {
  if (Number.isFinite(width) && width > 0)
    measuredNavigationWidth.value = Math.ceil(width)
}

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
    if (
      privateSessions.state.loaded
      && privateSessions.state.noMore
      && !privateSessions.state.loadingMore
    ) {
      pendingPrivateConversationRoute.value = null
      privateSessions.clearSelectedSession()
      replacePrivateConversationUrl(clearPrivateConversationRoute(window.location.href))
    }
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
    createPrivateConversationHistoryState(window.history.state),
    '',
    buildPrivateConversationUrl(route),
  )
}

function selectTransientPrivateRecipient(recipient: TransientPrivateRecipient) {
  if (!/^\d+$/.test(recipient.mid))
    return
  pendingPrivateConversationRoute.value = null
  privateSessions.clearSelectedSession()
  transientPrivateRecipient.value = recipient
  resetWorkspacePagePosition()
  const nextUrl = clearPrivateConversationRoute(window.location.href)
  window.history.replaceState(
    clearPrivateConversationHistoryState(window.history.state),
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
  if (isPrivateConversationHistoryState(window.history.state)) {
    window.history.back()
    return
  }
  replacePrivateConversationUrl(clearPrivateConversationRoute(window.location.href))
}

function syncViewFromRoute(href: string) {
  const normalizedRoute = normalizeNotificationRoute(href || window.location.href)
  const url = new URL(normalizedRoute.normalizedUrl)
  if (url.searchParams.get('page') !== AppPage.Notifications)
    return

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
    privateRecipientSearch.reset()
    privateSessions.clearSelectedSession()
  }
  window.history.pushState(
    clearPrivateConversationHistoryState(window.history.state),
    '',
    buildBewlyNotificationUrl(view),
  )
}

function resetOuterScrollForWorkspaceView(view: NotificationView) {
  if (NOTIFICATION_SECTION_BY_ID[view].layout !== 'workspace')
    return

  // Let the active Native Feed persist its own scrollTop before resetting the
  // shared outer viewport for the whisper workspace.
  void nextTick(() => {
    if (currentView.value === view)
      scrollViewportRef.value?.scrollTo({ top: 0 })
  })
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
  privateConversationRestoreAttempted.value = false
  syncViewFromRoute(window.location.href)
  registerRefreshHandler()
}

function deactivatePage() {
  if (!isPageActive.value)
    return

  isPageActive.value = false
  privateMessageWrites.releaseImages(activePrivateTalkerId.value || undefined)
  privateMessages.release()
  clearRefreshHandler()
  clearNotificationViewFromRoute()
}

watch(() => routeState.navigationId, () => syncViewFromRoute(routeState.href))
watch(currentView, resetOuterScrollForWorkspaceView)
watch(() => privateSessions.state.items, () => {
  applyPendingPrivateConversationRoute()
  maybeRestoreLastPrivateConversation()
})
watch(
  () => [
    settings.value.maxCachedPrivateConversations,
    settings.value.maxPrivateMessagesPerConversation,
  ] as const,
  () => privateMessages.enforceCacheLimits(),
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
  privateMessageWrites?.dispose()
  privateMessages.dispose()
  deactivatePage()
  clearRefreshHandler()
  clearNotificationViewFromRoute()
})
</script>

<template>
  <main
    class="notifications-page"
    :class="{
      'notifications-page--workspace': usesWorkspaceLayout,
      'notifications-page--document': !usesWorkspaceLayout,
      'notifications-page--dock-bottom': isBottomDock,
    }"
    :style="notificationsPageStyle"
  >
    <div v-if="!routeReady" class="notifications-page__route-loading" aria-busy="true">
      <NotificationsPageSkeleton :label="t('common.loading')" />
    </div>

    <template v-else>
      <div class="notifications-page__workspace">
        <NotificationsPageHeader
          :view="currentView"
          @navigation-width-change="updateNavigationWidth"
          @select="selectView"
        />

        <section class="notifications-page__outlet">
          <WhisperWorkspace
            v-if="isWhisperView"
            ref="whisperWorkspaceRef"
            :account-state="accountState"
            :active="isPageActive"
            :controller="privateSessions"
            :messages-controller="privateMessages"
            :recipient-search="privateRecipientSearch"
            :transient-recipient="transientPrivateRecipient"
            :write-controller="privateMessageWrites"
            @close-conversation="closePrivateConversation"
            @select-session="selectPrivateConversation"
            @select-recipient="selectTransientPrivateRecipient"
            @transient-send-confirmed="resolveTransientPrivateRecipientAfterSend"
          />
          <NativeNotificationFeed
            v-if="nativeView"
            :key="nativeView"
            ref="nativeFeedRef"
            :account-state="accountState"
            :active="isPageActive"
            :controller="notificationFeeds"
            :section="nativeView"
          />
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped lang="scss">
@use "../../../styles/breakpoints";

.notifications-page {
  --notifications-conversation-list-max-width: calc(var(--bew-space-12) * 9);
  --notifications-conversation-list-width: min(
    var(--notifications-navigation-width, var(--notifications-conversation-list-max-width)),
    var(--notifications-conversation-list-max-width)
  );

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
  height: calc(100dvh - var(--bew-top-bar-height) - var(--bew-space-3));
  overflow: visible;
}

:global(.bewly-scroll-viewport:has(.notifications-page--workspace)) {
  overflow-y: hidden;
}

.notifications-page__route-loading {
  width: 100%;
  height: 100%;
  min-height: 100%;
  background: transparent;
}

.notifications-page--document {
  min-height: calc(100dvh - var(--bew-top-bar-height) - var(--bew-space-3));
}

.notifications-page--workspace.notifications-page--dock-bottom {
  height: calc(
    100dvh - var(--bew-top-bar-height) - var(--bew-space-3) - var(--bew-dock-control-size) - var(--bew-space-8)
  );
}

.notifications-page--document.notifications-page--dock-bottom {
  min-height: calc(
    100dvh - var(--bew-top-bar-height) - var(--bew-space-3) - var(--bew-dock-control-size) - var(--bew-space-8)
  );
}

.notifications-page__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--bew-space-4);
  min-width: 0;
  min-height: 0;
}

.notifications-page--workspace .notifications-page__workspace {
  height: 100%;
}

.notifications-page--document .notifications-page__workspace {
  grid-template-rows: auto auto;
}

.notifications-page__outlet {
  min-width: 0;
  min-height: 0;
}

.notifications-page--workspace .notifications-page__outlet {
  height: 100%;
  overflow: visible;
}

@media (max-width: breakpoints.$mobile-max) {
  .notifications-page {
    --notifications-conversation-list-width: 100%;
  }

  .notifications-page__workspace {
    gap: var(--bew-space-3);
  }
}

@media (min-width: breakpoints.$grid-md) and (max-width: breakpoints.$compact-max) {
  .notifications-page {
    --notifications-conversation-list-max-width: calc(var(--bew-space-12) * 8);
  }
}

@media (min-width: breakpoints.$grid-lg) {
  .notifications-page--workspace.notifications-page--dock-bottom {
    height: calc(
      100dvh - var(--bew-top-bar-height) - var(--bew-space-3) - var(--bew-dock-control-size-lg) - var(--bew-space-8)
    );
  }

  .notifications-page--document.notifications-page--dock-bottom {
    min-height: calc(
      100dvh - var(--bew-top-bar-height) - var(--bew-space-3) - var(--bew-dock-control-size-lg) - var(--bew-space-8)
    );
  }
}
</style>
