<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import { useReplyNotifications } from '../composables/useReplyNotifications'
import ReplyNotificationItem from './ReplyNotificationItem.vue'

const props = defineProps<{
  active: boolean
  mid: string
}>()

const { t } = useI18n()
const { scrollViewportRef } = useBewlyApp()
const topBarStore = useTopBarStore()
const sentinelRef = ref<HTMLElement | null>(null)
const currentMid = computed(() => props.mid)
const originalReplyUrl = buildOriginalNotificationUrl('reply')
const feed = useReplyNotifications(currentMid, {
  fetchPage: params => api.notification.getReplyNotifications(params),
})
const { state } = feed

const errorMessage = computed(() => state.errorKind
  ? t(`notifications.reply.errors.${state.errorKind}`)
  : '')

let observer: IntersectionObserver | null = null
let restoreFrame: number | undefined
let readSyncRequest: Promise<void> | null = null
let lifecycleActive = true

function clearRestoreFrame() {
  if (restoreFrame === undefined)
    return
  cancelAnimationFrame(restoreFrame)
  restoreFrame = undefined
}

function saveScrollPosition() {
  state.scrollTop = scrollViewportRef.value?.scrollTop ?? state.scrollTop
}

function restoreScrollPosition() {
  clearRestoreFrame()
  restoreFrame = requestAnimationFrame(() => {
    restoreFrame = undefined
    if (props.active)
      scrollViewportRef.value?.scrollTo({ top: state.scrollTop })
  })
}

function disconnectObserver() {
  observer?.disconnect()
  observer = null
}

async function connectObserver() {
  disconnectObserver()
  await nextTick()
  if (!props.active || !sentinelRef.value || !scrollViewportRef.value)
    return

  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && props.active)
      void feed.loadMore()
  }, {
    root: scrollViewportRef.value,
    rootMargin: '0px 0px 320px 0px',
    threshold: 0,
  })
  observer.observe(sentinelRef.value)
}

async function activateFeed() {
  if (!props.active || document.visibilityState !== 'visible')
    return

  restoreScrollPosition()
  await feed.ensureLoaded()
  if (props.active) {
    await connectObserver()
    void syncReadCandidate()
  }
}

function deactivateFeed() {
  saveScrollPosition()
  clearRestoreFrame()
  disconnectObserver()
}

async function refresh() {
  const viewport = scrollViewportRef.value
  state.scrollTop = 0
  viewport?.scrollTo({ top: 0 })
  await feed.refresh()
  if (props.active) {
    await connectObserver()
    void syncReadCandidate()
  }
}

function retry() {
  if (state.items.length > 0)
    void feed.loadMore()
  else
    void feed.loadInitial()
}

function isReadCandidateEligible(candidate = feed.readCandidate.value): boolean {
  return Boolean(
    candidate
    && lifecycleActive
    && props.active
    && document.visibilityState === 'visible'
    && candidate.mid === currentMid.value
    && candidate.generation === state.generation
    && candidate.marker !== state.lastReadMarker
    && feed.isReadCandidateCurrent(candidate),
  )
}

async function syncReadCandidate() {
  if (readSyncRequest)
    return

  await nextTick()
  const candidate = feed.readCandidate.value
  if (!candidate || !isReadCandidateEligible(candidate))
    return

  // The successful first-page GET is the current message site's real read
  // mutation. Only clear local dots after that response has rendered.
  if (!feed.markCandidateReadLocally(candidate))
    return

  const request = topBarStore.syncUnreadMessageState()
  readSyncRequest = request
  try {
    await request
    if (isReadCandidateEligible(candidate))
      feed.confirmReadCandidate(candidate)
  }
  catch {
    if (import.meta.env.DEV) {
      console.warn('[Notifications][Reply] Unread synchronization failed', {
        endpointName: 'syncUnreadMessageState',
        kind: 'network',
      })
    }
  }
  finally {
    readSyncRequest = null
    const nextCandidate = feed.readCandidate.value
    if (nextCandidate && nextCandidate.marker !== candidate.marker && isReadCandidateEligible(nextCandidate))
      void syncReadCandidate()
  }
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible' || !props.active)
    return

  if (state.loaded)
    void syncReadCandidate()
  else
    void activateFeed()
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

watch(currentMid, () => {
  if (props.active) {
    nextTick(() => {
      if (props.active)
        void activateFeed()
    })
  }
})

watch(() => feed.readCandidate.value?.marker, () => {
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
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

defineExpose({ refresh })
</script>

<template>
  <section
    class="reply-notification-feed"
    :aria-label="t('notifications.sections.reply.label')"
    :aria-busy="!state.loaded || state.loading || state.loadingMore"
  >
    <Loading v-if="!state.loaded && !state.errorKind" />

    <div v-else-if="state.errorKind && state.items.length === 0" class="reply-notification-feed__state">
      <Empty :description="errorMessage">
        <div class="reply-notification-feed__state-actions">
          <Button type="tertiary" @click="retry">
            {{ t('notifications.actions.retry') }}
          </Button>
          <ALink :href="originalReplyUrl" type="content" class="reply-notification-feed__original-link">
            {{ t('notifications.actions.open_original') }}
          </ALink>
        </div>
      </Empty>
    </div>

    <div v-else-if="state.loaded && state.items.length === 0" class="reply-notification-feed__state">
      <Empty :description="t('notifications.reply.empty')" />
    </div>

    <template v-else>
      <div class="reply-notification-feed__items">
        <ReplyNotificationItem v-for="item in state.items" :key="item.id" :item="item" />
      </div>

      <div v-if="state.errorKind" class="reply-notification-feed__pagination-state" role="status">
        <span>{{ errorMessage }}</span>
        <Button type="tertiary" size="small" @click="retry">
          {{ t('notifications.actions.retry') }}
        </Button>
      </div>
      <Loading v-else-if="state.loadingMore" />

      <div
        v-if="!state.noMore"
        ref="sentinelRef"
        class="reply-notification-feed__sentinel"
        aria-hidden="true"
      />
    </template>
  </section>
</template>

<style scoped lang="scss">
.reply-notification-feed {
  min-width: 0;
  min-height: 100%;
}

.reply-notification-feed__items {
  min-width: 0;
}

.reply-notification-feed__state {
  display: grid;
  min-height: calc(var(--bew-space-12) * 6);
  place-items: center;
}

.reply-notification-feed__state-actions,
.reply-notification-feed__pagination-state {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: center;
}

.reply-notification-feed__original-link {
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

.reply-notification-feed__original-link:hover {
  background: var(--bew-fill-1);
}

.reply-notification-feed__pagination-state {
  padding: var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.reply-notification-feed__sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}
</style>
