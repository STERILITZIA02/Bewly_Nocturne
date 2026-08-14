<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useRouteState } from '~/composables/useRouteState'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF } from '~/utils/main'
import { buildBewlyNotificationUrl, parseNotificationView } from '~/utils/notificationRoute'
import type { PrivateConversationRoute } from '~/utils/privateConversationRoute'
import {
  buildPrivateConversationUrl,
  clearPrivateConversationRoute,
  parsePrivateConversationRoute,
  PRIVATE_CONVERSATION_ROUTE_PARAMS,
} from '~/utils/privateConversationRoute'

import NativeNotificationFeed from './components/NativeNotificationFeed.vue'
import NotificationsNavigation from './components/NotificationsNavigation.vue'
import NotificationsPageHeader from './components/NotificationsPageHeader.vue'
import OriginalNotificationsFrame from './components/OriginalNotificationsFrame.vue'
import type { NotificationPageParams } from './composables/useNotificationFeed'
import { useNotificationFeeds } from './composables/useNotificationFeeds'
import { resolveNotificationAccountState } from './notificationFeedPolicy'
import type {
  NativeNotificationSection,
  NotificationView,
  OriginalNotificationView,
} from './notificationSections'
import {
  isHybridNotificationView,
  isNativeNotificationSection,
  isNotificationView,
  isOriginalOnlyNotificationView,
  NOTIFICATION_SECTION_BY_ID,
} from './notificationSections'
import type { DisplayPrivateSession } from './whisper/privateSession'
import type {
  PrivateMessagesDependencies,
  PrivateTextSendDiagnostic,
  PrivateTextSendOutcome,
} from './whisper/usePrivateMessages'
import { usePrivateMessages } from './whisper/usePrivateMessages'
import { usePrivateSessions } from './whisper/usePrivateSessions'
import WhisperWorkspace from './whisper/WhisperWorkspace.vue'

interface OriginalNotificationsFrameExposed {
  reload: () => void
}

interface NativeNotificationFeedExposed {
  refresh: () => Promise<void>
}

interface WhisperWorkspaceExposed {
  refresh: () => Promise<void>
}

const { t } = useI18n()
const { activatedPage, handlePageRefresh, scrollViewportRef } = useBewlyApp()
const routeState = useRouteState()
const topBarStore = useTopBarStore()

const currentView = ref<NotificationView>(parseNotificationView(routeState.href || window.location.href))
const originalFrameRef = ref<OriginalNotificationsFrameExposed | null>(null)
const nativeFeedRef = ref<NativeNotificationFeedExposed | null>(null)
const whisperWorkspaceRef = ref<WhisperWorkspaceExposed | null>(null)
const pendingPrivateConversationRoute = ref<PrivateConversationRoute | null>(null)
const currentMid = computed(() => topBarStore.userInfo.mid ? String(topBarStore.userInfo.mid) : '')
const accountState = computed(() => resolveNotificationAccountState(topBarStore.isLogin, currentMid.value))
const privateSessions = usePrivateSessions(currentMid, {
  fetchSessions: () => api.privateMessage.getPrivateSessions(),
  fetchOlderSessions: endTs => api.privateMessage.getOlderPrivateSessions({ endTs }),
  fetchNewSessions: beginTs => api.privateMessage.getNewPrivateSessions({ beginTs }),
  fetchUserCards: uids => api.privateMessage.getPrivateUserCards({ uids }),
  getFallbackName: talkerId => t('notifications.whisper.user_fallback', { talkerId }),
})
const privateMessageDependencies: PrivateMessagesDependencies = {
  fetchMessages: options => api.privateMessage.getPrivateMessages(options),
  ackSession: options => api.privateMessage.ackPrivateSession(options),
  getCsrf: getCSRF,
  markSessionRead: privateSessions.markSessionRead,
  syncUnread: () => topBarStore.syncUnreadMessageState(),
  ...(import.meta.env.DEV
    ? { sendMessage: options => api.privateMessage.sendPrivateMessage(options) }
    : {}),
}
const privateMessages = usePrivateMessages(
  currentMid,
  privateSessions.selectedTalkerId,
  privateMessageDependencies,
)
const notificationFeeds = useNotificationFeeds(currentMid, {
  fetchPage: fetchNotificationPage,
})
const isBottomDock = computed(() => settings.value.dockPosition === 'bottom')
const currentSection = computed(() => NOTIFICATION_SECTION_BY_ID[currentView.value])
const originalView = computed<OriginalNotificationView | null>(() => (
  isOriginalOnlyNotificationView(currentView.value)
    ? currentView.value
    : null
))
const nativeView = computed<NativeNotificationSection | null>(() => (
  isNativeNotificationSection(currentView.value) ? currentView.value : null
))
const isWhisperView = computed(() => isHybridNotificationView(currentView.value))
const usesWorkspaceLayout = computed(() => currentSection.value.layout === 'workspace')

const isPageActive = ref(false)

const DEV_TEXT_SEND_CONFIRMATION = 'I_CONFIRM_ONE_PRIVATE_TEXT_SEND'
const DEV_TEXT_SEND_VALUE = 'test-test'
const DEV_TEXT_SEND_GATE_KEY = '__BEWLY_PRIVATE_TEXT_SEND_PROTOCOL_GATE__'

interface DevPrivateTextSendGateInput {
  confirmation: string
  talkerId: string
  text: string
}

interface DevPrivateTextSendGateResult {
  status: PrivateTextSendOutcome | 'blocked'
  diagnostic: PrivateTextSendDiagnostic | null
}

type DevPrivateTextSendGlobal = typeof globalThis & {
  [DEV_TEXT_SEND_GATE_KEY]?: (
    input: DevPrivateTextSendGateInput,
  ) => Promise<DevPrivateTextSendGateResult>
}

const devTextSendGateUsed = ref(false)
const devTextSendGateResult = ref<DevPrivateTextSendGateResult | null>(null)

const devTextSendSession = computed(() => privateSessions.state.items.find(
  item => item.key === privateSessions.selectedSessionKey.value,
))
const devTextSendGateAvailable = computed(() => (
  import.meta.env.DEV
    && !devTextSendGateUsed.value
    && devTextSendSession.value?.kind === 'user'
    && isPageActive.value
    && currentView.value === 'whisper'
    && accountState.value === 'ready'
))

async function runDevPrivateTextSendGate(
  input: DevPrivateTextSendGateInput,
): Promise<DevPrivateTextSendGateResult> {
  const session = devTextSendSession.value
  if (
    !devTextSendGateAvailable.value
    || input?.confirmation !== DEV_TEXT_SEND_CONFIRMATION
    || input?.text !== DEV_TEXT_SEND_VALUE
    || !/^\d+$/.test(input?.talkerId ?? '')
    || input.talkerId !== session?.talkerId
  ) {
    return { status: 'blocked', diagnostic: null }
  }

  devTextSendGateUsed.value = true
  privateMessages.setDraft(session.talkerId, input.text)
  await privateMessages.sendDraft(session.talkerId)
  const state = privateMessages.getState(session.talkerId)
  const result: DevPrivateTextSendGateResult = {
    status: state.lastTextSendOutcome ?? 'failed',
    diagnostic: state.lastTextSendDiagnostic,
  }
  devTextSendGateResult.value = result
  return result
}

function installDevPrivateTextSendGate() {
  if (!import.meta.env.DEV)
    return
  const devGlobal = globalThis as DevPrivateTextSendGlobal
  devGlobal[DEV_TEXT_SEND_GATE_KEY] = runDevPrivateTextSendGate
}

function triggerDevPrivateTextSendGate() {
  const talkerId = devTextSendSession.value?.talkerId
  if (!talkerId)
    return
  void runDevPrivateTextSendGate({
    confirmation: DEV_TEXT_SEND_CONFIRMATION,
    talkerId,
    text: DEV_TEXT_SEND_VALUE,
  })
}

function removeDevPrivateTextSendGate() {
  if (!import.meta.env.DEV)
    return
  const devGlobal = globalThis as DevPrivateTextSendGlobal
  delete devGlobal[DEV_TEXT_SEND_GATE_KEY]
}

function hasPrivateConversationRouteParams(url: URL): boolean {
  return Object.values(PRIVATE_CONVERSATION_ROUTE_PARAMS).some(param => url.searchParams.has(param))
}

function replacePrivateConversationUrl(url: string) {
  if (window.location.href !== url)
    window.history.replaceState(window.history.state, '', url)
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
  if (!session.capabilities.canReadNative) {
    pendingPrivateConversationRoute.value = null
    privateSessions.clearSelectedSession()
    replacePrivateConversationUrl(clearPrivateConversationRoute(window.location.href))
    return
  }
  privateSessions.selectSession(session)
}

function syncPrivateConversationFromRoute(url: URL, view: NotificationView) {
  if (view !== 'whisper') {
    pendingPrivateConversationRoute.value = null
    privateSessions.clearSelectedSession()
    return
  }

  const route = parsePrivateConversationRoute(url)
  if (!route) {
    pendingPrivateConversationRoute.value = null
    privateSessions.clearSelectedSession()
    if (hasPrivateConversationRouteParams(url))
      replacePrivateConversationUrl(clearPrivateConversationRoute(url))
    return
  }

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

function selectPrivateConversation(session: DisplayPrivateSession) {
  if (!session.capabilities.canReadNative || session.sessionType !== 1)
    return

  const route: PrivateConversationRoute = {
    talkerId: session.talkerId,
    sessionType: 1,
  }
  const currentRoute = parsePrivateConversationRoute(window.location.href)
  const isCurrentSelection = privateSessions.selectedSessionKey.value === session.key
  pendingPrivateConversationRoute.value = route
  privateSessions.selectSession(session)
  if (
    isCurrentSelection
    && currentRoute?.talkerId === route.talkerId
    && currentRoute.sessionType === route.sessionType
  ) {
    return
  }
  window.history.pushState(window.history.state, '', buildPrivateConversationUrl(route))
}

function closePrivateConversation() {
  pendingPrivateConversationRoute.value = null
  privateSessions.clearSelectedSession()
  replacePrivateConversationUrl(clearPrivateConversationRoute(window.location.href))
}

function replaceNotificationRoute(view: NotificationView) {
  const targetUrl = buildBewlyNotificationUrl(view)
  if (window.location.href !== targetUrl)
    window.history.replaceState(window.history.state, '', targetUrl)
}

function syncViewFromRoute(href: string) {
  let url: URL
  try {
    url = new URL(href || window.location.href)
  }
  catch {
    currentView.value = 'whisper'
    pendingPrivateConversationRoute.value = null
    privateSessions.clearSelectedSession()
    replaceNotificationRoute('whisper')
    return
  }
  if (url.searchParams.get('page') !== AppPage.Notifications)
    return

  const requestedView = url.searchParams.get('notificationView')
  const nextView = parseNotificationView(url)
  currentView.value = nextView
  if (!isNotificationView(requestedView)) {
    pendingPrivateConversationRoute.value = null
    privateSessions.clearSelectedSession()
    replaceNotificationRoute(nextView)
    return
  }
  syncPrivateConversationFromRoute(url, nextView)
}

function selectView(view: NotificationView) {
  if (view === currentView.value)
    return

  currentView.value = view
  window.history.pushState(window.history.state, '', buildBewlyNotificationUrl(view))
}

function resetOuterScrollForWorkspaceView(view: NotificationView) {
  if (NOTIFICATION_SECTION_BY_ID[view].layout !== 'workspace')
    return

  // Let the active Native Feed persist its own scrollTop before resetting the
  // shared outer viewport for an iframe category.
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
  else
    originalFrameRef.value?.reload()
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
  return api.notification.getLikeNotifications({
    id: params?.id,
    like_time: params?.like_time,
  })
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
  syncViewFromRoute(window.location.href)
  registerRefreshHandler()
}

function deactivatePage() {
  if (!isPageActive.value)
    return

  isPageActive.value = false
  clearRefreshHandler()
  clearNotificationViewFromRoute()
}

watch(() => routeState.navigationId, () => syncViewFromRoute(routeState.href))
watch(currentView, resetOuterScrollForWorkspaceView)
watch(() => privateSessions.state.items, applyPendingPrivateConversationRoute)
watch(currentMid, (nextMid, previousMid) => {
  if (!previousMid || nextMid === previousMid)
    return
  pendingPrivateConversationRoute.value = null
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
  installDevPrivateTextSendGate()
})
onActivated(activatePage)
onDeactivated(deactivatePage)
onBeforeUnmount(() => {
  removeDevPrivateTextSendGate()
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
  >
    <NotificationsPageHeader :view="currentView" @refresh="refreshCurrentView" />

    <button
      v-if="devTextSendGateAvailable"
      data-testid="private-text-send-protocol-gate"
      type="button"
      class="notifications-page__dev-text-send-gate"
      @click="triggerDevPrivateTextSendGate"
    >
      DEV · send test-test once
    </button>
    <output
      v-if="devTextSendGateResult"
      hidden
      data-testid="private-text-send-protocol-result"
      :data-status="devTextSendGateResult.status"
      :data-error-kind="devTextSendGateResult.diagnostic?.kind ?? ''"
      :data-http-status="devTextSendGateResult.diagnostic?.httpStatus ?? ''"
      :data-api-code="devTextSendGateResult.diagnostic?.apiCode ?? ''"
      :data-final-host="devTextSendGateResult.diagnostic?.finalHost ?? ''"
    />

    <div class="notifications-page__workspace">
      <NotificationsNavigation :model-value="currentView" @update:model-value="selectView" />

      <section class="notifications-page__outlet">
        <WhisperWorkspace
          v-if="isWhisperView"
          ref="whisperWorkspaceRef"
          :account-state="accountState"
          :active="isPageActive"
          :controller="privateSessions"
          :messages-controller="privateMessages"
          @close-conversation="closePrivateConversation"
          @select-session="selectPrivateConversation"
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
        <OriginalNotificationsFrame
          v-if="originalView"
          ref="originalFrameRef"
          :view="originalView"
        />
      </section>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use "../../../styles/breakpoints";

.notifications-page {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.notifications-page__dev-text-send-gate {
  position: fixed;
  right: var(--bew-space-4);
  bottom: var(--bew-space-4);
  z-index: var(--bew-z-popover);
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-on-theme-color);
  font: inherit;
  cursor: pointer;
  background: var(--bew-theme-color);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.notifications-page--workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: calc(100dvh - var(--bew-top-bar-height) - var(--bew-space-3));
  overflow: hidden;
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
  grid-template-columns: calc(var(--bew-space-10) * 5) minmax(0, 1fr);
  gap: var(--bew-space-4);
  min-width: 0;
  min-height: 0;
  padding-top: var(--bew-space-4);
}

.notifications-page__outlet {
  min-width: 0;
  min-height: 0;
}

.notifications-page--workspace .notifications-page__outlet {
  height: 100%;
  overflow: hidden;
}

@media (min-width: breakpoints.$grid-md) and (max-width: breakpoints.$compact-max) {
  .notifications-page__workspace {
    grid-template-columns: calc(var(--bew-space-8) * 2) minmax(0, 1fr);
    gap: var(--bew-space-2);
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .notifications-page__workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--bew-space-3);
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
