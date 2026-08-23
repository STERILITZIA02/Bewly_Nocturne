<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useTopBarStore } from '~/stores/topBarStore'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { NotificationFeedsController } from '../composables/useNotificationFeeds'
import type { NotificationAccountState, RefreshNotificationFeedOptions } from '../notificationFeedPolicy'
import { shouldReconcileUnreadBadge } from '../notificationFeedPolicy'
import type { NotificationBadgeReconcileResult } from '../notificationReadReconciliation'
import { reconcileNotificationBadge } from '../notificationReadReconciliation'
import type { NativeNotificationSection } from '../notificationSections'
import { NOTIFICATION_BADGE_RETRY_DELAYS_MS } from '../notificationTimings'
import NativeNotificationItem from './NativeNotificationItem.vue'
import NativeSystemNotificationItem from './NativeSystemNotificationItem.vue'

const props = defineProps<{
  accountState: NotificationAccountState
  active: boolean
  controller: NotificationFeedsController
  section: NativeNotificationSection
}>()

const { t } = useI18n()
const { scrollViewportRef } = useBewlyApp()
const topBarStore = useTopBarStore()
const feedRootRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
const state = props.controller.states[props.section]
const originalNotificationUrl = computed(() => buildOriginalNotificationUrl(props.section))
const authoritativeUnreadCount = computed(() => {
  if (props.section === 'reply')
    return topBarStore.unReadMessage.reply || 0
  if (props.section === 'at')
    return topBarStore.unReadMessage.at || 0
  if (props.section === 'system')
    return topBarStore.unReadMessage.sys_msg || 0
  return Math.max(
    topBarStore.unReadMessage.like || 0,
    (topBarStore.unReadMessage as { recv_like?: number }).recv_like || 0,
  )
})

const errorMessage = computed(() => state.errorKind
  ? t(`notifications.native.errors.${state.errorKind}`)
  : '')
const feedAriaLabel = computed(() => state.loading && !state.loaded
  ? t(`notifications.native.loading.${props.section}`)
  : t(`notifications.sections.${props.section}.label`))

let observer: IntersectionObserver | null = null
let restoreFrame: number | undefined
let resolveRestoreFrame: (() => void) | null = null
let readSyncRequest: Promise<void> | null = null
let badgeRetryTimer: ReturnType<typeof setTimeout> | null = null
let resolveBadgeRetry: ((shouldContinue: boolean) => void) | null = null
let lifecycleActive = true

const AUTO_REFRESH_TOP_THRESHOLD_PX = 32

interface NotificationScrollAnchor {
  atTop: boolean
  id: string
  offset: number
  scrollHeight: number
  scrollTop: number
}

function clearRestoreFrame() {
  if (restoreFrame === undefined)
    return
  cancelAnimationFrame(restoreFrame)
  restoreFrame = undefined
  const resolve = resolveRestoreFrame
  resolveRestoreFrame = null
  resolve?.()
}

function saveScrollPosition() {
  state.scrollTop = scrollViewportRef.value?.scrollTop ?? state.scrollTop
}

function restoreScrollPosition(): Promise<void> {
  clearRestoreFrame()
  return new Promise((resolve) => {
    resolveRestoreFrame = resolve
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = undefined
      resolveRestoreFrame = null
      if (props.active)
        scrollViewportRef.value?.scrollTo({ top: state.scrollTop })
      resolve()
    })
  })
}

function captureScrollAnchor(): NotificationScrollAnchor | null {
  const viewport = scrollViewportRef.value
  const feed = feedRootRef.value
  if (!viewport || !feed)
    return null

  const viewportRect = viewport.getBoundingClientRect()
  const firstVisible = Array.from(feed.querySelectorAll<HTMLElement>('[data-notification-id]'))
    .find((element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > viewportRect.top && rect.top < viewportRect.bottom
    })
  return {
    atTop: viewport.scrollTop <= AUTO_REFRESH_TOP_THRESHOLD_PX,
    id: firstVisible?.dataset.notificationId ?? '',
    offset: firstVisible ? firstVisible.getBoundingClientRect().top - viewportRect.top : 0,
    scrollHeight: viewport.scrollHeight,
    scrollTop: viewport.scrollTop,
  }
}

async function restoreScrollAnchor(anchor: NotificationScrollAnchor | null) {
  if (!anchor || !props.active)
    return

  await nextTick()
  const viewport = scrollViewportRef.value
  const feed = feedRootRef.value
  if (!viewport || !feed || !props.active)
    return

  if (anchor.atTop) {
    state.scrollTop = 0
    viewport.scrollTo({ top: 0 })
    return
  }

  const viewportTop = viewport.getBoundingClientRect().top
  const anchoredElement = Array.from(feed.querySelectorAll<HTMLElement>('[data-notification-id]'))
    .find(element => element.dataset.notificationId === anchor.id)
  const nextScrollTop = anchoredElement
    ? viewport.scrollTop + (anchoredElement.getBoundingClientRect().top - viewportTop - anchor.offset)
    : anchor.scrollTop + (viewport.scrollHeight - anchor.scrollHeight)
  state.scrollTop = Math.max(0, nextScrollTop)
  viewport.scrollTo({ top: state.scrollTop })
}

function disconnectObserver() {
  observer?.disconnect()
  observer = null
}

function cancelBadgeRetry() {
  if (badgeRetryTimer) {
    clearTimeout(badgeRetryTimer)
    badgeRetryTimer = null
  }
  const resolve = resolveBadgeRetry
  resolveBadgeRetry = null
  resolve?.(false)
}

function waitForBadgeRetry(delay: number): Promise<boolean> {
  cancelBadgeRetry()
  return new Promise((resolve) => {
    resolveBadgeRetry = resolve
    badgeRetryTimer = setTimeout(() => {
      badgeRetryTimer = null
      resolveBadgeRetry = null
      resolve(true)
    }, delay)
  })
}

async function connectObserver() {
  disconnectObserver()
  await nextTick()
  if (!props.active || !sentinelRef.value || !scrollViewportRef.value)
    return

  observer = new IntersectionObserver(([entry]) => {
    if (
      entry.isIntersecting
      && props.active
      && !state.paginationStalled
      && state.errorKind === null
    ) {
      void props.controller.loadMore(props.section)
    }
  }, {
    root: scrollViewportRef.value,
    rootMargin: '0px 0px 320px 0px',
    threshold: 0,
  })
  observer.observe(sentinelRef.value)
}

async function refreshAutomatically(reason: Exclude<RefreshNotificationFeedOptions['reason'], 'manual'>) {
  const anchor = captureScrollAnchor()
  await props.controller.refreshIfStale(props.section, {
    reason,
    unreadCount: authoritativeUnreadCount.value,
  })
  await restoreScrollAnchor(anchor)
}

async function activateFeed(reason: 'activate' | 'visibility' = 'activate') {
  if (
    !props.active
    || props.accountState !== 'ready'
    || document.visibilityState !== 'visible'
  ) {
    return
  }

  if (reason === 'activate')
    await restoreScrollPosition()
  await refreshAutomatically(reason)
  if (props.active) {
    await connectObserver()
    void syncReadCandidate()
  }
}

function deactivateFeed() {
  saveScrollPosition()
  clearRestoreFrame()
  disconnectObserver()
  cancelBadgeRetry()
}

async function refresh() {
  if (props.accountState !== 'ready')
    return

  const viewport = scrollViewportRef.value
  state.scrollTop = 0
  viewport?.scrollTo({ top: 0 })
  await props.controller.refresh(props.section, authoritativeUnreadCount.value)
  if (props.active) {
    await connectObserver()
    void syncReadCandidate()
  }
}

async function retry() {
  if (props.accountState !== 'ready')
    return

  await props.controller.retryFailedOperation(props.section, authoritativeUnreadCount.value)
  if (props.active) {
    await connectObserver()
    void syncReadCandidate()
  }
}

function isReadCandidateEligible(candidate = props.controller.getReadCandidate(props.section)): boolean {
  return lifecycleActive
    && shouldReconcileUnreadBadge({
      active: props.active,
      visible: document.visibilityState === 'visible',
      accountMid: props.controller.accountMid.value,
      currentSection: props.section,
      currentGeneration: state.generation,
      currentReadCommitId: state.currentReadCommitId,
      badgeReconciled: state.badgeReconciled,
      candidate,
    })
    && candidate !== null
    && props.controller.isReadCandidateCurrent(props.section, candidate)
}

async function syncReadCandidate() {
  if (readSyncRequest)
    return

  await nextTick()
  if (readSyncRequest)
    return

  const candidate = props.controller.getReadCandidate(props.section)
  if (!candidate || !isReadCandidateEligible(candidate))
    return

  // The section adapter only publishes a first page after its verified server
  // read mutation has succeeded. Clear local dots after that page has rendered.
  if (!props.controller.markCandidateReadLocally(props.section, candidate))
    return

  let reconcileResult: NotificationBadgeReconcileResult = 'cancelled'
  const request = (async () => {
    reconcileResult = await reconcileNotificationBadge({
      getUnreadCount: () => authoritativeUnreadCount.value,
      isCurrent: () => isReadCandidateEligible(candidate),
      retryDelays: NOTIFICATION_BADGE_RETRY_DELAYS_MS,
      sync: () => topBarStore.syncUnreadMessageState(),
      wait: waitForBadgeRetry,
    })

    if (reconcileResult === 'reconciled' && isReadCandidateEligible(candidate)) {
      props.controller.confirmReadCandidate(props.section, candidate)
    }
    else if (reconcileResult === 'failed' && import.meta.env.DEV) {
      console.warn('[Notifications][NativeFeed] Unread synchronization failed', {
        section: props.section,
        endpointName: 'syncUnreadMessageState',
        kind: 'network',
      })
    }
  })()
  readSyncRequest = request
  try {
    await request
  }
  finally {
    cancelBadgeRetry()
    readSyncRequest = null
    const nextCandidate = props.controller.getReadCandidate(props.section)
    if (
      nextCandidate
      && isReadCandidateEligible(nextCandidate)
      && (
        nextCandidate.readCommitId !== candidate.readCommitId
        || reconcileResult === 'cancelled'
      )
    ) {
      void syncReadCandidate()
    }
  }
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') {
    cancelBadgeRetry()
    return
  }
  if (!props.active)
    return

  void activateFeed('visibility')
}

watch(() => props.active, (active) => {
  if (active) {
    lifecycleActive = true
    void activateFeed()
  }
  else {
    deactivateFeed()
  }
}, { immediate: true })

watch([
  () => props.accountState,
  () => props.controller.accountMid.value,
], () => {
  cancelBadgeRetry()
  if (props.active && props.accountState === 'ready') {
    nextTick(() => {
      if (props.active && props.accountState === 'ready')
        void activateFeed()
    })
  }
  else {
    disconnectObserver()
  }
})

watch(authoritativeUnreadCount, (unreadCount) => {
  if (
    props.active
    && props.accountState === 'ready'
    && document.visibilityState === 'visible'
  ) {
    void refreshAutomatically('unread-change').then(() => syncReadCandidate())
  }
  else if (unreadCount === 0) {
    // Preserve the zero-to-positive edge until this category is mounted again.
    state.lastObservedUnreadCount = 0
  }
})

watch(() => props.controller.getReadCandidate(props.section)?.readCommitId, () => {
  cancelBadgeRetry()
  if (props.active)
    void syncReadCandidate()
})

onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
onActivated(() => {
  lifecycleActive = true
  if (props.active)
    void activateFeed()
})
onDeactivated(() => {
  lifecycleActive = false
  deactivateFeed()
})
onBeforeUnmount(() => {
  lifecycleActive = false
  deactivateFeed()
  cancelBadgeRetry()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

defineExpose({ refresh })
</script>

<template>
  <section
    ref="feedRootRef"
    class="native-notification-feed"
    :aria-label="feedAriaLabel"
    :aria-busy="accountState === 'profile-pending' || (accountState === 'ready' && (!state.loaded || state.loading || state.loadingMore))"
  >
    <Loading v-if="accountState === 'profile-pending'" />

    <div v-else-if="accountState === 'logged-out'" class="native-notification-feed__state">
      <Empty :description="t('notifications.native.errors.login-required')">
        <ALink :href="originalNotificationUrl" type="content" class="native-notification-feed__original-link">
          {{ t('notifications.actions.open_original') }}
        </ALink>
      </Empty>
    </div>

    <Loading v-else-if="!state.loaded && !state.errorKind" />

    <div v-else-if="state.errorKind && state.items.length === 0" class="native-notification-feed__state">
      <Empty :description="errorMessage">
        <div class="native-notification-feed__state-actions">
          <Button type="tertiary" @click="retry">
            {{ t('notifications.actions.retry') }}
          </Button>
          <ALink :href="originalNotificationUrl" type="content" class="native-notification-feed__original-link">
            {{ t('notifications.actions.open_original') }}
          </ALink>
        </div>
      </Empty>
    </div>

    <div v-else-if="state.loaded && state.items.length === 0" class="native-notification-feed__state">
      <Empty :description="t(`notifications.native.empty.${section}`)" />
    </div>

    <template v-else>
      <div class="native-notification-feed__items">
        <template v-for="item in state.items" :key="item.id">
          <NativeSystemNotificationItem v-if="item.kind === 'system'" :item="item" />
          <NativeNotificationItem v-else :item="item" />
        </template>
      </div>

      <div v-if="state.errorKind" class="native-notification-feed__pagination-state" role="status">
        <span>{{ errorMessage }}</span>
        <Button type="tertiary" size="small" @click="retry">
          {{ t('notifications.actions.retry') }}
        </Button>
      </div>
      <Loading v-else-if="state.loadingMore" />

      <div
        v-if="!state.noMore && !state.paginationStalled"
        ref="sentinelRef"
        class="native-notification-feed__sentinel"
        aria-hidden="true"
      />
    </template>
  </section>
</template>

<style scoped lang="scss">
.native-notification-feed {
  min-width: 0;
  min-height: 100%;
}

.native-notification-feed__items {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-3);
}

.native-notification-feed__items :deep(.native-notification-surface) {
  box-sizing: border-box;
  isolation: isolate;
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
  transition:
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    border-color var(--bew-duration-fast) var(--bew-ease-standard),
    box-shadow var(--bew-duration-fast) var(--bew-ease-standard);
}

.native-notification-feed__items :deep(.native-notification-surface:hover) {
  background: var(--bew-elevated-alt-hover);
  box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
}

.native-notification-feed__state {
  display: grid;
  min-height: calc(var(--bew-space-12) * 6);
  place-items: center;
}

.native-notification-feed__state-actions,
.native-notification-feed__pagination-state {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: center;
}

.native-notification-feed__original-link {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
  background: var(--bew-content-solid);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.native-notification-feed__original-link:hover {
  background: var(--bew-fill-1);
}

.native-notification-feed__pagination-state {
  padding: var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.native-notification-feed__sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}
</style>
