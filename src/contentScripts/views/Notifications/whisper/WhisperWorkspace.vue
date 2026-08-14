<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useTopBarStore } from '~/stores/topBarStore'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import OriginalNotificationsFrame from '../components/OriginalNotificationsFrame.vue'
import type { NotificationAccountState } from '../notificationFeedPolicy'
import ConversationList from './ConversationList.vue'
import ConversationView from './ConversationView.vue'
import type { PrivateMessagesController } from './usePrivateMessages'
import type { PrivateSessionsController } from './usePrivateSessions'

interface OriginalNotificationsFrameExposed {
  reload: () => void
}

interface ConversationViewExposed {
  refresh: () => Promise<void>
}

const props = defineProps<{
  accountState: NotificationAccountState
  active: boolean
  controller: PrivateSessionsController
  messagesController: PrivateMessagesController
}>()

const { t } = useI18n()
const topBarStore = useTopBarStore()
const originalFrameRef = ref<OriginalNotificationsFrameExposed | null>(null)
const conversationViewRef = ref<ConversationViewExposed | null>(null)
const originalUrl = buildOriginalNotificationUrl('whisper')
const selectedSession = computed(() => props.controller.state.items.find(
  item => item.talkerId === props.controller.selectedTalkerId.value,
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

onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', handleVisibilityChange))

defineExpose({ refresh })
</script>

<template>
  <section class="whisper-workspace">
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
          :items="controller.state.items"
          :loading-more="controller.state.loadingMore"
          :no-more="controller.state.noMore"
          :pagination-stalled="controller.state.paginationStalled"
          :load-more-failed="controller.state.failedOperation === 'load-more'"
          :selected-talker-id="controller.selectedTalkerId.value"
          @load-more="controller.loadMore()"
          @retry-load-more="controller.loadMore({ retry: true })"
          @select="controller.selectSession"
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
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(calc(var(--bew-space-12) * 4), 1fr) minmax(calc(var(--bew-space-12) * 5), 2fr);
  }

  .whisper-workspace__sessions {
    border-right: 0;
    border-bottom: 1px solid var(--bew-border-color);
  }
}
</style>
