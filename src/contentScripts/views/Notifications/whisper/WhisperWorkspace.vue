<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useTopBarStore } from '~/stores/topBarStore'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import OriginalNotificationsFrame from '../components/OriginalNotificationsFrame.vue'
import type { NotificationAccountState } from '../notificationFeedPolicy'
import ConversationList from './ConversationList.vue'
import ConversationView from './ConversationView.vue'
import type { DisplayPrivateSession } from './privateSession'
import type { PrivateMessagesController } from './usePrivateMessages'
import type { PrivateSessionsController } from './usePrivateSessions'

interface OriginalNotificationsFrameExposed {
  reload: () => void
}

interface ConversationViewExposed {
  focusHeading: () => void
  refresh: () => Promise<void>
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
}>()

const emit = defineEmits<{
  (event: 'closeConversation'): void
  (event: 'selectSession', session: DisplayPrivateSession): void
}>()

const { t } = useI18n()
const topBarStore = useTopBarStore()
const conversationListRef = ref<ConversationListExposed | null>(null)
const originalFrameRef = ref<OriginalNotificationsFrameExposed | null>(null)
const conversationViewRef = ref<ConversationViewExposed | null>(null)
const originalUrl = buildOriginalNotificationUrl('whisper')
const selectedSession = computed(() => props.controller.state.items.find(
  item => item.key === props.controller.selectedSessionKey.value,
))
const nativeSelectedSession = computed(() => (
  selectedSession.value?.capabilities.canReadNative
    ? selectedSession.value
    : null
))

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

function ensureLoaded() {
  if (props.active && props.accountState === 'ready')
    void props.controller.activate(unreadCount.value)
}

async function refresh() {
  if (props.accountState === 'ready')
    await props.controller.refresh()
  await nextTick()
  if (nativeSelectedSession.value)
    await conversationViewRef.value?.refresh()
  else
    originalFrameRef.value?.reload()
}

function retry() {
  void props.controller.retryFailed()
}

function selectSession(session: DisplayPrivateSession) {
  props.controller.updateScrollTop(conversationListRef.value?.getScrollTop() ?? 0)
  emit('selectSession', session)
}

function handleVisibilityChange() {
  if (
    document.visibilityState === 'visible'
    && props.active
    && props.accountState === 'ready'
  ) {
    void props.controller.refreshIfStale()
  }
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
    await props.controller.observeUnreadCount(next)
    if (next > previous)
      await conversationViewRef.value?.refresh()
  }
})

watch(() => props.controller.selectedSessionKey.value, async (nextSessionKey, previousSessionKey) => {
  if (nextSessionKey && !previousSessionKey) {
    props.controller.updateScrollTop(
      conversationListRef.value?.getScrollTop() ?? props.controller.state.scrollTop,
    )
  }
  await nextTick()
  if (nextSessionKey) {
    conversationViewRef.value?.focusHeading()
  }
  else if (previousSessionKey) {
    conversationListRef.value?.restoreScrollTop(props.controller.state.scrollTop)
    conversationListRef.value?.focusSession(previousSessionKey)
  }
})

onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', handleVisibilityChange))

defineExpose({ refresh })
</script>

<template>
  <section
    class="whisper-workspace"
    :class="{ 'whisper-workspace--detail': Boolean(nativeSelectedSession) }"
  >
    <aside class="whisper-workspace__sessions">
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
          :items="controller.state.items"
          :loading-more="controller.state.loadingMore"
          :no-more="controller.state.noMore"
          :pagination-stalled="controller.state.paginationStalled"
          :load-more-failed="controller.state.failedOperation === 'load-more'"
          :selected-session-key="controller.selectedSessionKey.value"
          @load-more="controller.loadMore()"
          @retry-load-more="controller.loadMore({ retry: true })"
          @select="selectSession"
        />
      </template>
    </aside>

    <div class="whisper-workspace__detail">
      <ConversationView
        v-if="nativeSelectedSession"
        :key="nativeSelectedSession.talkerId"
        ref="conversationViewRef"
        :active="active"
        :controller="messagesController"
        :session="nativeSelectedSession"
        @back="emit('closeConversation')"
      />
      <OriginalNotificationsFrame v-else ref="originalFrameRef" view="whisper" />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.whisper-workspace {
  display: grid;
  grid-template-columns: minmax(calc(var(--bew-space-12) * 5), calc(var(--bew-space-12) * 7)) minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.whisper-workspace__sessions,
.whisper-workspace__detail {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.whisper-workspace__sessions {
  display: flex;
  flex-direction: column;
  background: var(--bew-content);
  border-right: 1px solid var(--bew-border-color);
}

.whisper-workspace__detail {
  background: var(--bew-homepage-bg);
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
  border-bottom: 1px solid var(--bew-border-color);
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
    grid-template-columns: minmax(calc(var(--bew-space-12) * 4), calc(var(--bew-space-12) * 5)) minmax(0, 1fr);
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .whisper-workspace {
    position: relative;
    display: block;
  }

  .whisper-workspace__sessions,
  .whisper-workspace__detail {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition:
      opacity var(--bew-duration-normal) var(--bew-ease-standard),
      transform var(--bew-duration-normal) var(--bew-ease-standard),
      visibility 0s linear var(--bew-duration-normal);
  }

  .whisper-workspace__sessions {
    visibility: visible;
    opacity: 1;
    transform: translateX(0);
    border-right: 0;
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
