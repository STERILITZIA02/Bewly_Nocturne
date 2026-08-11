<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useRouteState } from '~/composables/useRouteState'
import { useTopBarStore } from '~/stores/topBarStore'
import { openLinkToNewTab } from '~/utils/main'
import type { NotificationConversationRoute, NotificationSection } from '~/utils/notificationRoute'
import {
  buildBewlyNotificationUrl,
  buildOriginalNotificationUrl,
  parseNotificationRoute,
} from '~/utils/notificationRoute'

import ConversationList from './components/ConversationList.vue'
import ConversationView from './components/ConversationView.vue'
import NotificationFeed from './components/NotificationFeed.vue'
import NotificationSettings from './components/NotificationSettings.vue'
import NotificationsOverview from './components/NotificationsOverview.vue'
import NotificationsRail from './components/NotificationsRail.vue'
import type { MessageSettingKey } from './composables/useMessageSettings'
import { useMessageSettings } from './composables/useMessageSettings'
import { useNotificationFeed } from './composables/useNotificationFeed'
import { usePrivateConversation } from './composables/usePrivateConversation'
import { usePrivateSessions } from './composables/usePrivateSessions'
import { createConversationKey } from './notificationTransforms'
import type {
  DisplayConversation,
  DisplayMessage,
  DisplayNotification,
  NotificationFeedSection,
  NotificationMode,
  NotificationModeKey,
  SimpleAutoReplyType,
} from './types'

const { t, locale } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()
const routeState = useRouteState()
const topBarStore = useTopBarStore()
const {
  pageScrollReachTop,
  handlePageBackToTop,
  handlePageRefresh,
  handleReachBottom,
} = useBewlyApp()

const rootRef = ref<HTMLElement | null>(null)
const currentSection = ref<NotificationSection>(parseNotificationRoute(routeState.href).section)
const lifecycleActive = ref(false)
const notificationBusyIds = ref<Set<string>>(new Set())
const conversationListScrollTop = ref(0)
const routeGeneration = ref(0)
const accountId = computed<string | null>(() => {
  const mid = topBarStore.userInfo.mid
  return topBarStore.isLogin && mid ? String(mid) : null
})

const feeds = useNotificationFeed(accountId)
const sessions = usePrivateSessions(accountId)
const privateConversation = usePrivateConversation(accountId)
const messageSettings = useMessageSettings(accountId)
const feedScrollPositions = new Map<NotificationFeedSection, number>()

const selectedConversation = computed(() => privateConversation.conversation.value)
const selectedConversationKey = computed(() => selectedConversation.value?.key || '')
const currentDraft = computed({
  get: () => selectedConversation.value
    ? privateConversation.getDraft(selectedConversation.value.key)
    : '',
  set: (value: string) => {
    if (selectedConversation.value)
      privateConversation.setDraft(selectedConversation.value.key, value)
  },
})

const unreadBySection = computed<Partial<Record<NotificationSection, number>>>(() => ({
  whisper: Math.max(0, Number(topBarStore.unReadDm.follow_unread || 0))
    + Math.max(0, Number(topBarStore.unReadDm.unfollow_unread || 0))
    + Math.max(0, Number(topBarStore.unReadDm.support_group_unread || 0)),
  reply: Math.max(0, Number(topBarStore.unReadMessage.reply || 0)),
  at: Math.max(0, Number(topBarStore.unReadMessage.at || 0)),
  love: Math.max(
    Math.max(0, Number(topBarStore.unReadMessage.like || 0)),
    Math.max(0, Number((topBarStore.unReadMessage as { recv_like?: number }).recv_like || 0)),
  ),
  system: Math.max(0, Number(topBarStore.unReadMessage.sys_msg || 0)),
}))

const isFeedSection = computed(() => (
  ['reply', 'at', 'love', 'system'] as NotificationSection[]
).includes(currentSection.value))
const activeFeedSection = computed<NotificationFeedSection>(() => (
  isFeedSection.value ? currentSection.value as NotificationFeedSection : 'reply'
))
const activeFeedState = computed(() => feeds.states[activeFeedSection.value])

let activeScrollElement: HTMLElement | null = null
let scrollControllerElements: HTMLElement[] = []
let scrollFrame = 0
let activationGeneration = 0
let internalNavigationUrl = ''
let previousReachBottomHandler: (() => void) | undefined
let previousPageRefreshHandler: (() => void) | undefined
let previousPageBackToTopHandler: (() => void) | undefined
let previousPageScrollReachTop: boolean | null = null

interface MutationContext {
  account: string
  routeGeneration: number
}

function captureMutationContext(): MutationContext | null {
  const account = accountId.value
  return account
    ? { account, routeGeneration: routeGeneration.value }
    : null
}

function isMutationContextCurrent(context: MutationContext | null): context is MutationContext {
  return Boolean(
    context
    && accountId.value === context.account
    && routeGeneration.value === context.routeGeneration,
  )
}

function invalidateRouteContext() {
  routeGeneration.value += 1
  notificationBusyIds.value = new Set()
}

function updatePageTitle() {
  if (!lifecycleActive.value)
    return
  document.title = t('notifications.section_page_title', {
    section: t(`notifications.sections.${currentSection.value}`),
  })
}

function detachScrollController() {
  if (scrollFrame)
    cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
  scrollControllerElements.forEach((element) => {
    element.removeEventListener('scroll', handleScrollControllerActivity)
    element.removeEventListener('pointerdown', handleScrollControllerActivity)
    element.removeEventListener('focusin', handleScrollControllerActivity)
  })
  scrollControllerElements = []
  activeScrollElement = null
}

function updateReachTop() {
  scrollFrame = 0
  pageScrollReachTop.value = activeScrollElement ? activeScrollElement.scrollTop <= 1 : true
}

function scheduleReachTopUpdate() {
  if (!scrollFrame)
    scrollFrame = requestAnimationFrame(updateReachTop)
}

function handleScrollControllerActivity(event: Event) {
  activeScrollElement = event.currentTarget as HTMLElement
  scheduleReachTopUpdate()
}

async function connectScrollController() {
  await nextTick()
  detachScrollController()
  if (!lifecycleActive.value || !rootRef.value)
    return

  const selectors = currentSection.value === 'whisper'
    ? selectedConversation.value
      ? ['.conversation-view__scroll', '.conversation-list__scroll']
      : ['.conversation-list__scroll', '.notifications-overview']
    : currentSection.value === 'settings'
      ? ['.notification-settings__scroll']
      : ['.notification-feed__scroll']
  scrollControllerElements = selectors
    .map(selector => rootRef.value?.querySelector<HTMLElement>(selector) ?? null)
    .filter((element): element is HTMLElement => Boolean(element))
  activeScrollElement = scrollControllerElements[0] ?? null
  scrollControllerElements.forEach((element) => {
    element.addEventListener('scroll', handleScrollControllerActivity, { passive: true })
    element.addEventListener('pointerdown', handleScrollControllerActivity, { passive: true })
    element.addEventListener('focusin', handleScrollControllerActivity)
  })
  updateReachTop()
}

function navigateTo(section: NotificationSection, conversation?: NotificationConversationRoute) {
  invalidateRouteContext()
  const destination = buildBewlyNotificationUrl(section, conversation)
  if (destination !== window.location.href) {
    internalNavigationUrl = destination
    window.history.pushState({}, '', destination)
  }
  currentSection.value = section
}

async function selectConversation(item: DisplayConversation, updateRoute = true) {
  if (updateRoute) {
    navigateTo('whisper', {
      talker: item.talkerId,
      sessionType: item.sessionType,
    })
  }
  const context = captureMutationContext()
  currentSection.value = 'whisper'
  await privateConversation.select(item)
  if (!lifecycleActive.value) {
    privateConversation.stopSync()
    return
  }
  if (!isMutationContextCurrent(context))
    return
  await connectScrollController()
}

async function closeConversation(updateRoute = true) {
  if (updateRoute)
    navigateTo('whisper')
  await privateConversation.select(null)
  await connectScrollController()
  await nextTick()
  rootRef.value?.querySelector<HTMLElement>('.conversation-list__item[tabindex="0"]')?.focus({ preventScroll: true })
}

async function restoreRoute() {
  invalidateRouteContext()
  const generation = routeGeneration.value
  const route = parseNotificationRoute(routeState.href)
  stopRealtimeUpdates()
  currentSection.value = route.section
  if (!lifecycleActive.value || !accountId.value) {
    await connectScrollController()
    return
  }

  if (route.section !== 'whisper' || !route.conversation) {
    if (selectedConversation.value)
      await privateConversation.select(null)
    if (generation !== routeGeneration.value)
      return
    await ensureCurrentSectionLoaded()
    if (generation !== routeGeneration.value)
      return
    await connectScrollController()
    return
  }

  await ensureCurrentSectionLoaded()
  if (generation !== routeGeneration.value)
    return

  const key = createConversationKey(route.conversation.sessionType, route.conversation.talker)
  let target = sessions.items.value.find(item => item.key === key)
  if (!target) {
    try {
      target = await sessions.openConversation(route.conversation.talker, route.conversation.sessionType)
    }
    catch (error) {
      if (generation === routeGeneration.value) {
        await privateConversation.select(null)
        if (generation !== routeGeneration.value)
          return
        const destination = buildBewlyNotificationUrl('whisper')
        internalNavigationUrl = destination
        window.history.replaceState({}, '', destination)
        toast.error(error instanceof Error ? error.message : t('notifications.status.load_failed'))
        await connectScrollController()
      }
      return
    }
  }
  if (generation === routeGeneration.value)
    await selectConversation(target, false)
}

async function ensureCurrentSectionLoaded(force = false) {
  const context = captureMutationContext()
  if (!context || !lifecycleActive.value)
    return
  if (currentSection.value === 'whisper') {
    if (force || !sessions.loaded.value) {
      await sessions.refresh()
      if (!isMutationContextCurrent(context))
        return
    }
    if (!document.hidden)
      sessions.startSync()
  }
  else if (currentSection.value === 'settings') {
    if (force || !messageSettings.loaded.value) {
      await messageSettings.load()
      if (!isMutationContextCurrent(context))
        return
    }
  }
  else {
    const section = currentSection.value as NotificationFeedSection
    if (force || !feeds.states[section].loaded) {
      await feeds.refresh(section)
      if (!isMutationContextCurrent(context))
        return
    }
    if (section === 'system' && !document.hidden) {
      await feeds.markSystemRead().catch(() => {})
      if (!isMutationContextCurrent(context))
        return
    }
  }
  await topBarStore.syncUnreadMessageState().catch(() => {})
}

async function refreshCurrentSection() {
  const context = captureMutationContext()
  if (!context)
    return
  if (currentSection.value === 'whisper') {
    if (selectedConversation.value) {
      await privateConversation.refresh()
      if (!isMutationContextCurrent(context))
        return
    }
    await sessions.refresh()
  }
  else if (currentSection.value === 'settings') {
    await messageSettings.load()
  }
  else {
    await feeds.refresh(currentSection.value)
  }
  if (!isMutationContextCurrent(context))
    return
  await topBarStore.syncUnreadMessageState().catch(() => {})
}

function pageRefreshHandler() {
  void refreshCurrentSection()
}

function pageBackToTopHandler() {
  activeScrollElement?.scrollTo({ top: 0, behavior: 'smooth' })
}

function rememberFeedScrollPosition(section: NotificationFeedSection, top: number) {
  feedScrollPositions.set(section, top)
}

function installPageControllers() {
  previousReachBottomHandler = handleReachBottom.value
  previousPageRefreshHandler = handlePageRefresh.value
  previousPageBackToTopHandler = handlePageBackToTop.value
  previousPageScrollReachTop = pageScrollReachTop.value
  handleReachBottom.value = undefined
  handlePageRefresh.value = pageRefreshHandler
  handlePageBackToTop.value = pageBackToTopHandler
  void connectScrollController()
}

function removePageControllers() {
  const ownsPageControllers = handlePageRefresh.value === pageRefreshHandler
    && handlePageBackToTop.value === pageBackToTopHandler
  if (handlePageRefresh.value === pageRefreshHandler)
    handlePageRefresh.value = previousPageRefreshHandler
  if (handlePageBackToTop.value === pageBackToTopHandler)
    handlePageBackToTop.value = previousPageBackToTopHandler
  if (ownsPageControllers) {
    if (handleReachBottom.value === undefined)
      handleReachBottom.value = previousReachBottomHandler
    pageScrollReachTop.value = previousPageScrollReachTop
  }
  previousReachBottomHandler = undefined
  previousPageRefreshHandler = undefined
  previousPageBackToTopHandler = undefined
  previousPageScrollReachTop = null
  detachScrollController()
}

function stopRealtimeUpdates() {
  sessions.stopSync()
  privateConversation.stopSync()
}

async function activatePage() {
  if (lifecycleActive.value)
    return
  lifecycleActive.value = true
  const generation = ++activationGeneration
  installPageControllers()
  updatePageTitle()
  await restoreRoute()
  if (generation !== activationGeneration || !lifecycleActive.value)
    return
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function deactivatePage() {
  if (!lifecycleActive.value)
    return
  lifecycleActive.value = false
  activationGeneration++
  invalidateRouteContext()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopRealtimeUpdates()
  removePageControllers()
}

function handleVisibilityChange() {
  if (!lifecycleActive.value)
    return
  if (document.hidden) {
    stopRealtimeUpdates()
    return
  }
  void ensureCurrentSectionLoaded()
  if (currentSection.value === 'whisper') {
    sessions.startSync()
    if (selectedConversation.value) {
      privateConversation.startSync()
      void acknowledgeConversation()
    }
  }
}

async function handleSectionSelect(section: NotificationSection) {
  stopRealtimeUpdates()
  navigateTo(section)
  const generation = routeGeneration.value
  if (selectedConversation.value)
    await privateConversation.select(null)
  if (generation !== routeGeneration.value)
    return
  await ensureCurrentSectionLoaded(true)
  if (generation !== routeGeneration.value)
    return
  await connectScrollController()
}

async function handleSessionMutation(action: () => Promise<void>, successKey: string): Promise<boolean> {
  const context = captureMutationContext()
  if (!context)
    return false
  try {
    await action()
    if (!isMutationContextCurrent(context))
      return false
    toast.success(t(successKey))
    await topBarStore.syncUnreadMessageState().catch(() => {})
    return isMutationContextCurrent(context)
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.operation_failed'))
    return false
  }
}

function handleSessionPin(item: DisplayConversation, pinned: boolean) {
  void handleSessionMutation(
    () => sessions.setPinned(item, pinned),
    pinned ? 'notifications.status.pinned_success' : 'notifications.status.unpinned_success',
  )
}

function handleSessionMute(item: DisplayConversation) {
  const account = accountId.value
  if (!account)
    return
  void handleSessionMutation(
    () => sessions.setMuted(item, account, !item.isMuted),
    item.isMuted ? 'notifications.status.unmuted_success' : 'notifications.status.muted_success',
  )
}

function handleSessionRead(item: DisplayConversation) {
  void handleSessionMutation(() => sessions.markRead(item), 'notifications.status.marked_read')
}

async function handleSessionRemove(item: DisplayConversation) {
  const context = captureMutationContext()
  if (!context)
    return
  const name = item.isSupportGroup
    ? t('notifications.conversations.support_group')
    : item.name || t('notifications.conversations.unknown_user')
  const confirmed = await showConfirmDialog(t('notifications.conversations.delete_confirm', { name }))
  if (!confirmed || !isMutationContextCurrent(context))
    return
  const removed = await handleSessionMutation(
    () => sessions.remove(item),
    'notifications.status.conversation_deleted',
  )
  if (removed && selectedConversation.value?.key === item.key)
    await closeConversation()
}

function openOriginalConversation(item: DisplayConversation) {
  openLinkToNewTab(buildOriginalNotificationUrl('whisper', {
    talker: item.talkerId,
    sessionType: item.sessionType,
  }))
}

function openConversationProfile(item: DisplayConversation) {
  openLinkToNewTab(`https://space.bilibili.com/${encodeURIComponent(item.talkerId)}`)
}

async function handleNotificationDelete(item: DisplayNotification) {
  if (notificationBusyIds.value.has(item.id))
    return
  const context = captureMutationContext()
  if (!context)
    return
  const confirmed = await showConfirmDialog(t('notifications.feed.delete_confirm'))
  if (!confirmed || !isMutationContextCurrent(context))
    return
  notificationBusyIds.value = new Set([...notificationBusyIds.value, item.id])
  try {
    await feeds.deleteNotification(item.section, item)
    if (!isMutationContextCurrent(context))
      return
    toast.success(t('notifications.status.deleted'))
    await topBarStore.syncUnreadMessageState().catch(() => {})
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.operation_failed'))
  }
  finally {
    if (isMutationContextCurrent(context)) {
      const next = new Set(notificationBusyIds.value)
      next.delete(item.id)
      notificationBusyIds.value = next
    }
  }
}

async function handleNotificationLike(item: DisplayNotification) {
  if (notificationBusyIds.value.has(item.id))
    return
  const context = captureMutationContext()
  if (!context)
    return
  notificationBusyIds.value = new Set([...notificationBusyIds.value, item.id])
  try {
    await feeds.toggleReplyLike(item)
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.operation_failed'))
  }
  finally {
    if (isMutationContextCurrent(context)) {
      const next = new Set(notificationBusyIds.value)
      next.delete(item.id)
      notificationBusyIds.value = next
    }
  }
}

async function handleNotificationReply(item: DisplayNotification, message: string, done: (success: boolean) => void) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await feeds.replyToNotification(item, message)
    if (!isMutationContextCurrent(context))
      return
    toast.success(t('notifications.status.reply_sent'))
    done(true)
  }
  catch (error) {
    if (isMutationContextCurrent(context)) {
      toast.error(error instanceof Error ? error.message : t('notifications.status.send_failed'))
      done(false)
    }
  }
}

async function handleSettingUpdate(key: MessageSettingKey, value: boolean) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await messageSettings.update(key, value)
    if (!isMutationContextCurrent(context))
      return
    toast.success(t('notifications.status.saved'))
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.save_failed'))
  }
}

async function handleNotificationModeUpdate(key: NotificationModeKey, mode: NotificationMode) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await messageSettings.updateNotificationMode(key, mode)
    if (isMutationContextCurrent(context))
      toast.success(t('notifications.status.saved'))
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.save_failed'))
  }
}

async function handleAntiDisturbUpdate(id: number, isOpen: boolean) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await messageSettings.updateAntiDisturb(id, isOpen)
    if (isMutationContextCurrent(context))
      toast.success(t('notifications.status.saved'))
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.save_failed'))
  }
}

async function handleAutoReplyTextSave(type: SimpleAutoReplyType, reply: string) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await messageSettings.saveSimpleAutoReplyText(type, reply)
    if (isMutationContextCurrent(context))
      toast.success(t('notifications.status.saved'))
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.save_failed'))
  }
}

async function handleBlockWordAdd(word: string) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await messageSettings.addBlockWord(word)
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.save_failed'))
  }
}

async function handleBlockWordRemove(word: string) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await messageSettings.removeBlockWord(word)
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.save_failed'))
  }
}

async function handleMessageRetract(message: DisplayMessage) {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    await privateConversation.retract(message)
    if (!isMutationContextCurrent(context))
      return
    if (message.content.kind === 'withdrawn')
      toast.success(t('notifications.message_types.withdrawn'))
    else
      toast.error(t('notifications.status.operation_failed'))
  }
  catch (error) {
    if (isMutationContextCurrent(context))
      toast.error(error instanceof Error ? error.message : t('notifications.status.operation_failed'))
  }
}

function handleImageRejected(reason: 'image_too_large' | 'gif_too_large') {
  toast.error(t(`notifications.status.${reason}`))
}

async function acknowledgeConversation() {
  const context = captureMutationContext()
  if (!context)
    return
  try {
    const acknowledged = await privateConversation.acknowledge()
    if (!acknowledged || !isMutationContextCurrent(context))
      return
    sessions.markReadLocally(selectedConversationKey.value)
    await topBarStore.syncUnreadMessageState()
  }
  catch {
    // A transient ACK failure is retried by the next visible sync/scroll event.
  }
}

function handleLocalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !selectedConversation.value)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('[role="dialog"]'))
    return
  event.preventDefault()
  void closeConversation()
}

watch(() => routeState.href, () => {
  if (!lifecycleActive.value)
    return
  if (routeState.href === internalNavigationUrl) {
    internalNavigationUrl = ''
    return
  }
  internalNavigationUrl = ''
  void restoreRoute()
})
watch([currentSection, locale], updatePageTitle)
watch([currentSection, selectedConversationKey], () => void connectScrollController())
watch(accountId, async (next, previous) => {
  if (next === previous)
    return
  invalidateRouteContext()
  stopRealtimeUpdates()
  feeds.resetAll()
  sessions.reset()
  privateConversation.reset()
  messageSettings.reset()
  feedScrollPositions.clear()
  conversationListScrollTop.value = 0
  if (next && lifecycleActive.value)
    await restoreRoute()
}, { immediate: true })

onMounted(activatePage)
onActivated(activatePage)
onDeactivated(deactivatePage)
onBeforeUnmount(deactivatePage)
</script>

<template>
  <section
    ref="rootRef"
    class="notifications-page"
    :class="{ 'has-conversation': Boolean(selectedConversation) }"
    tabindex="-1"
    @keydown="handleLocalKeydown"
  >
    <div v-if="topBarStore.isLogin && !accountId" class="notifications-page__account-state" role="status">
      <i i-svg-spinners-180-ring-with-bg aria-hidden="true" />
      <p>{{ t('notifications.status.loading_account') }}</p>
    </div>

    <div v-else-if="!accountId" class="notifications-page__account-state" role="status">
      <i i-tabler-message-circle-off aria-hidden="true" />
      <h1>{{ t('notifications.empty.login_title') }}</h1>
      <p>{{ t('notifications.empty.login_description') }}</p>
      <ALink href="https://passport.bilibili.com/login" open-mode="newTab">
        <Button type="primary">
          {{ t('common.please_log_in_first') }}
        </Button>
      </ALink>
    </div>

    <div v-else class="notifications-page__workspace">
      <NotificationsRail
        :section="currentSection"
        :unread="unreadBySection"
        @select="handleSectionSelect"
      />

      <div class="notifications-page__main">
        <template v-if="currentSection === 'whisper'">
          <ConversationList
            :items="sessions.filteredItems.value"
            :selected-key="selectedConversationKey"
            :loading="sessions.loading.value"
            :loaded="sessions.loaded.value"
            :no-more="sessions.noMore.value"
            :error="sessions.error.value"
            :search="sessions.search.value"
            :filter="sessions.filter.value"
            :initial-scroll-top="conversationListScrollTop"
            @select="selectConversation"
            @load-more="sessions.loadMore"
            @retry="sessions.refresh"
            @pin="handleSessionPin"
            @mute="handleSessionMute"
            @read="handleSessionRead"
            @remove="handleSessionRemove"
            @open-profile="openConversationProfile"
            @open-original="openOriginalConversation"
            @update:search="sessions.search.value = $event"
            @update:filter="sessions.filter.value = $event"
            @scroll-position="conversationListScrollTop = $event"
          />

          <ConversationView
            v-if="selectedConversation"
            :key="selectedConversation.key"
            :conversation="selectedConversation"
            :messages="privateConversation.messages.value"
            :loading="privateConversation.loading.value"
            :loading-older="privateConversation.loadingOlder.value"
            :no-more="privateConversation.noMore.value"
            :sending="privateConversation.sending.value"
            :uploading="privateConversation.uploading.value"
            :error="privateConversation.error.value"
            :draft="currentDraft"
            @back="closeConversation"
            @load-older="privateConversation.loadOlder"
            @refresh="privateConversation.refresh"
            @send-text="privateConversation.sendText"
            @send-image="privateConversation.sendImage"
            @image-rejected="handleImageRejected"
            @retry="privateConversation.retry"
            @retract="handleMessageRetract"
            @acknowledge="acknowledgeConversation"
            @pin="handleSessionPin(selectedConversation, $event)"
            @mute="handleSessionMute(selectedConversation)"
            @open-original="openOriginalConversation(selectedConversation)"
            @update:draft="currentDraft = $event"
          />
          <NotificationsOverview
            v-else
            :unread="unreadBySection"
            :recent="sessions.items.value"
            @section="handleSectionSelect"
            @conversation="selectConversation"
          />
        </template>

        <NotificationSettings
          v-else-if="currentSection === 'settings'"
          :key="`settings:${accountId}`"
          :state="messageSettings.state.value"
          :loading="messageSettings.loading.value"
          :loaded="messageSettings.loaded.value"
          :error="messageSettings.error.value"
          :saving="messageSettings.saving.value"
          :notification-mode-saving="messageSettings.notificationModeSaving.value"
          :anti-disturb-busy="messageSettings.antiDisturbBusy.value"
          :auto-reply-saving="messageSettings.autoReplySaving.value"
          :block-word-busy="messageSettings.blockWordBusy.value"
          @refresh="messageSettings.load"
          @update="handleSettingUpdate"
          @update-notification-mode="handleNotificationModeUpdate"
          @update-anti-disturb="handleAntiDisturbUpdate"
          @save-auto-reply-text="handleAutoReplyTextSave"
          @add-block-word="handleBlockWordAdd"
          @remove-block-word="handleBlockWordRemove"
        />

        <NotificationFeed
          v-else
          :key="accountId"
          :section="activeFeedSection"
          :items="activeFeedState.items"
          :loading="activeFeedState.loading"
          :loaded="activeFeedState.loaded"
          :no-more="activeFeedState.noMore"
          :error="activeFeedState.error"
          :busy-ids="notificationBusyIds"
          :initial-scroll-top="feedScrollPositions.get(activeFeedSection) ?? 0"
          @load-more="feeds.loadMore(activeFeedSection)"
          @refresh="feeds.refresh(activeFeedSection)"
          @delete="handleNotificationDelete"
          @like="handleNotificationLike"
          @reply="handleNotificationReply"
          @scroll-position="rememberFeedScrollPosition"
        />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../styles/breakpoints";

.notifications-page {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--bew-text-1);
  outline: none;
}

.notifications-page__workspace {
  display: flex;
  width: min(100%, var(--bew-notifications-workspace-max-width));
  height: 100%;
  min-width: 0;
  min-height: 0;
  margin-inline: auto;
  overflow: hidden;
  background: var(--bew-elevated-alt);
  box-sizing: border-box;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-modal-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-2);
  animation: notifications-enter var(--bew-duration-normal) var(--bew-ease-standard) both;
}

.notifications-page__main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.notifications-page__account-state {
  display: flex;
  width: min(100%, 520px);
  min-height: 360px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--bew-space-3);
  margin: var(--bew-space-12) auto;
  padding: var(--bew-space-8);
  color: var(--bew-text-3);
  text-align: center;
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-modal-radius);
  corner-shape: var(--bew-corner-shape);

  h1,
  p {
    margin: 0;
  }

  h1 {
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-heading);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-heading);
  }

  > i {
    width: 96px;
    height: 96px;
    color: var(--bew-theme-color);
  }
}

@keyframes notifications-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (width < breakpoints.$grid-md) {
  .notifications-page__workspace {
    flex-direction: column;
  }

  .notifications-page__main {
    position: relative;
  }

  .notifications-page.has-conversation :deep(.conversation-list) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notifications-page__workspace {
    animation-duration: 1ms;
    transform: none;
  }
}
</style>
