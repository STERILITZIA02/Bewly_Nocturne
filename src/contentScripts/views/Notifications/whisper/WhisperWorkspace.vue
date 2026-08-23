<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { NotificationAccountState } from '../notificationFeedPolicy'
import ConversationEmptyState from './ConversationEmptyState.vue'
import ConversationList from './ConversationList.vue'
import ConversationOriginalFallback from './ConversationOriginalFallback.vue'
import ConversationView from './ConversationView.vue'
import type { PrivateMessagesController as PrivateMessageWriteController } from './experimental/usePrivateMessageWrites'
import type { TransientPrivateRecipient } from './privateRecipientSearch'
import type { DisplayPrivateSession } from './privateSession'
import { usePrivateMessagePolling } from './usePrivateMessagePolling'
import type { PrivateMessagesController } from './usePrivateMessages'
import type { PrivateRecipientSearchController } from './usePrivateRecipientSearch'
import type { PrivateSessionsController } from './usePrivateSessions'

interface ConversationDetailExposed {
  focusHeading: () => void
  refresh?: () => Promise<void>
}

interface ConversationListExposed {
  focusSession: (sessionKey: string) => void
  getScrollTop: () => number
  restoreScrollTop: (scrollTop: number) => void
}

const props = defineProps<{
  accountState: NotificationAccountState
  active: boolean
  controller: PrivateSessionsController
  messagesController: PrivateMessagesController
  recipientSearch: PrivateRecipientSearchController
  transientRecipient: TransientPrivateRecipient | null
  writeController: PrivateMessageWriteController | null
}>()

const emit = defineEmits<{
  (event: 'closeConversation'): void
  (event: 'selectRecipient', recipient: TransientPrivateRecipient): void
  (event: 'selectSession', session: DisplayPrivateSession): void
  (event: 'transientSendConfirmed', talkerId: string): void
}>()

const { t } = useI18n()
const topBarStore = useTopBarStore()
const conversationListRef = ref<ConversationListExposed | null>(null)
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
let pendingDetailFocusKey = ''

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
  if (nativeSelectedSession.value || props.transientRecipient)
    await conversationDetailRef.value?.refresh?.()
}

function retry() {
  void props.controller.retryFailed()
}

function selectSession(session: DisplayPrivateSession) {
  props.controller.updateScrollTop(conversationListRef.value?.getScrollTop() ?? 0)
  pendingDetailFocusKey = session.key
  emit('selectSession', session)
}

function selectRecipient(recipient: TransientPrivateRecipient) {
  props.controller.updateScrollTop(conversationListRef.value?.getScrollTop() ?? 0)
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

watch(selectedDetailKey, async (nextSessionKey, previousSessionKey) => {
  const shouldFocusHeading = nextSessionKey !== '' && nextSessionKey === pendingDetailFocusKey
  pendingDetailFocusKey = ''
  if (nextSessionKey && !previousSessionKey) {
    props.controller.updateScrollTop(
      conversationListRef.value?.getScrollTop() ?? props.controller.state.scrollTop,
    )
  }
  await nextTick()
  if (shouldFocusHeading) {
    conversationDetailRef.value?.focusHeading()
  }
  else if (previousSessionKey) {
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
    <aside class="whisper-workspace__sessions conversation-list-card">
      <div v-if="accountState === 'profile-pending'" class="whisper-workspace__state" aria-busy="true">
        <Loading />
        <span>{{ t('notifications.whisper.profile_pending') }}</span>
      </div>

      <div v-else-if="accountState === 'logged-out'" class="whisper-workspace__state">
        <Empty :description="t('notifications.whisper.errors.login-required')">
          <ALink :href="originalUrl" type="content" class="whisper-workspace__original-link">
            {{ t('notifications.actions.open_original') }}
          </ALink>
        </Empty>
      </div>

      <div
        v-else-if="controller.state.loading && !controller.state.loaded"
        class="whisper-workspace__state"
        aria-busy="true"
      >
        <Loading />
        <span>{{ t('notifications.whisper.loading') }}</span>
      </div>

      <div
        v-else-if="controller.state.errorKind && !controller.state.items.length"
        class="whisper-workspace__state"
      >
        <Empty :description="errorMessage">
          <div class="whisper-workspace__state-actions">
            <Button type="tertiary" @click="retry">
              {{ t('notifications.actions.retry') }}
            </Button>
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
        <ConversationList
          ref="conversationListRef"
          :active="active"
          :compact="settings.privateMessageDensity === 'compact'"
          :items="controller.state.items"
          :loading-more="controller.state.loadingMore"
          :no-more="controller.state.noMore"
          :pagination-stalled="controller.state.paginationStalled"
          :recipient-search="recipientSearch"
          :load-more-failed="controller.state.failedOperation === 'load-more'"
          :selected-session-key="controller.selectedSessionKey.value"
          :show-official-assistants="settings.showOfficialPrivateAssistants"
          @load-more="controller.loadMore()"
          @retry-load-more="controller.loadMore({ retry: true })"
          @select-recipient="selectRecipient"
          @select="selectSession"
        />
      </template>
    </aside>

    <div
      class="whisper-workspace__detail"
      :class="{
        'whisper-workspace__detail--fallback-card': selectedSession && !nativeSelectedSession && !transientRecipient,
      }"
    >
      <ConversationEmptyState v-if="!selectedSession && !transientRecipient" />
      <ConversationView
        v-else-if="nativeSelectedSession || transientRecipient"
        :key="nativeSelectedSession?.talkerId ?? `transient:${transientRecipient?.mid}`"
        ref="conversationDetailRef"
        :active="active"
        :controller="messagesController"
        :session="nativeSelectedSession"
        :recipient="transientRecipient"
        :write-controller="writeController"
        @back="emit('closeConversation')"
        @send-confirmed="emit('transientSendConfirmed', $event)"
      />
      <ConversationOriginalFallback
        v-else-if="selectedSession"
        :key="selectedSession.key"
        ref="conversationDetailRef"
        :session="selectedSession"
        @back="emit('closeConversation')"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.whisper-workspace {
  display: grid;
  grid-template-columns: minmax(0, var(--notifications-conversation-list-width)) minmax(0, 1fr);
  gap: var(--bew-space-4);
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

.whisper-workspace__sessions,
.whisper-workspace__detail--fallback-card {
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
}

.whisper-workspace__sessions {
  display: flex;
  height: 100%;
  overflow: hidden;
  flex-direction: column;
}

.whisper-workspace__detail {
  height: 100%;
  overflow: visible;
  background: transparent;
}

.whisper-workspace__detail--fallback-card {
  overflow: hidden;
}

.whisper-workspace--solid .whisper-workspace__sessions,
.whisper-workspace--solid .whisper-workspace__detail--fallback-card {
  background: var(--bew-elevated-alt-solid);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
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
  font-weight: var(--bew-font-weight-semibold);
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
    gap: var(--bew-space-3);
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .whisper-workspace {
    position: relative;
    display: block;
    overflow: hidden;
  }

  .whisper-workspace__sessions,
  .whisper-workspace__detail {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    transition:
      opacity var(--bew-duration-normal) var(--bew-ease-standard),
      transform var(--bew-duration-normal) var(--bew-ease-standard),
      visibility 0s linear var(--bew-duration-normal);
  }

  .whisper-workspace__sessions {
    visibility: visible;
    opacity: 1;
    transform: translateX(0);
    transition-delay: 0s;
  }

  .whisper-workspace__detail {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateX(100%);
  }

  .whisper-workspace--detail .whisper-workspace__sessions {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateX(-100%);
    transition-delay: 0s, var(--bew-duration-normal);
  }

  .whisper-workspace--detail .whisper-workspace__detail {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
    transition-delay: 0s;
  }
}

@media (prefers-reduced-motion: reduce) {
  .whisper-workspace__sessions,
  .whisper-workspace__detail {
    transition: none;
  }
}
</style>
