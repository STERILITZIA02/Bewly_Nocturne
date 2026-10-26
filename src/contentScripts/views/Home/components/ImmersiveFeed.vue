<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

import CloseButton from '~/components/CloseButton.vue'
import IconButton from '~/components/IconButton.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabViewState } from '~/composables/useHomeTabState'
import { settings } from '~/logic'
import { parseDedeUserID } from '~/logic/loginStatus'
import { getRecommendationRequestIdentity } from '~/logic/recommendationMode'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'
import { DIALOG_FOCUS_OWNER, DIALOG_TELEPORT_TARGET, getDeepActiveElement, getTopDialog, moveDialogTabFocus, ownsDialogKeyboard, restoreOverlayFocus } from '~/utils/dialogFocus'
import { isBrowserFullscreenActive } from '~/utils/escapePriority'
import type { ImmersiveRailWindow } from '~/utils/immersivePlayback'
import { findImmersiveVideo, getImmersiveVideoUrl, getImmersiveWindow, IMMERSIVE_WINDOW_SIZE, isImmersiveInput } from '~/utils/immersiveRecommendation'
import { lockPageScroll, unlockPageScroll } from '~/utils/pageScrollLock'
import type { ScrollPositionClaim } from '~/utils/scrollIntent'
import { claimScrollPosition, ownsScrollPosition, scrollToPosition } from '~/utils/scrollIntent'

import ImmersiveVideoFrame from './ImmersiveVideoFrame.vue'

type Entry = VideoElement | AppVideoElement
const props = defineProps<{ items: Entry[], initialIndex: number, feedGeneration: number, pagingState: string, manualPaging: boolean, loading: boolean, noMoreContent: boolean, requestFailed: boolean, trigger?: HTMLElement, scrollClaim?: ScrollPositionClaim }>()
const emit = defineEmits<{ (event: 'close'): void, (event: 'loadMore', retry: boolean): void }>()
const app = useBewlyApp()
const tabOwner = useHomeTabViewState()
const page = app.activatedPage.value
const homeTab = app.homeActivatedPage.value
const requestIdentity = getRecommendationRequestIdentity()
const accountId = parseDedeUserID(document.cookie)
const viewport = app.scrollViewportRef.value
const scrollClaim = props.scrollClaim ?? (viewport ? claimScrollPosition(viewport) : undefined)
const focus = props.trigger ?? getDeepActiveElement(document)
const root = ref<HTMLElement | null>(null)
const visible = ref(!document.hidden)
const current = shallowRef(props.items[findImmersiveVideo(props.items, Math.max(0, props.initialIndex), 1)])
const index = computed(() => props.items.findIndex(item => item.uniqueId === current.value?.uniqueId))
let lastPosition = Math.max(0, index.value)
let successorKey = props.items[lastPosition + 1]?.uniqueId
let predecessorKey = props.items[lastPosition - 1]?.uniqueId
const windowStart = ref(lastPosition)
const pendingNext = ref<{ key: string, automatic: boolean, pages: number, length: number, state: 'loading' | 'continue' | 'filtered' | 'stalled' | 'failed' | 'ended' }>()
const externalTarget = ref('')
let disposed = false
let normalExit = false
let originCurrent = true
watch([app.activatedPage, app.homeActivatedPage, getRecommendationRequestIdentity, app.scrollViewportRef], () => {
  originCurrent = false
}, { flush: 'sync' })
function close() {
  normalExit = true
  emit('close')
}
const dialogId = useId()
provide(DIALOG_FOCUS_OWNER, dialogId)
provide(DIALOG_TELEPORT_TARGET, root)
const queuePosition = computed(() => {
  if (index.value >= 0)
    return index.value
  const successor = props.items.findIndex(item => item.uniqueId === successorKey)
  if (successor >= 0)
    return successor
  const predecessor = props.items.findIndex(item => item.uniqueId === predecessorKey)
  return predecessor >= 0 ? predecessor + 1 : Math.min(lastPosition, props.items.length)
})
const nextIndex = computed(() => findImmersiveVideo(props.items, queuePosition.value + (index.value >= 0 ? 1 : 0), 1))
const previousIndex = computed(() => findImmersiveVideo(props.items, queuePosition.value - 1, -1))
const windowItems = computed(() => getImmersiveWindow(props.items, windowStart.value))
let railRevision = 0
const railWindow = computed<ImmersiveRailWindow>(previous => !visible.value && previous
  ? previous
  : ({
      revision: ++railRevision,
      items: windowItems.value.map(entry => ({ uniqueId: entry.uniqueId, displayData: entry.displayData! })),
      currentKey: externalTarget.value ? '' : current.value?.uniqueId ?? '',
      loading: props.loading,
      hasMore: !props.noMoreContent || windowStart.value + IMMERSIVE_WINDOW_SIZE < props.items.length,
      failed: props.requestFailed,
    }))
function select(entry: Entry) {
  if (getImmersiveVideoUrl(entry)) {
    pendingNext.value = undefined
    current.value = entry
    externalTarget.value = ''
    lastPosition = Math.max(0, props.items.findIndex(item => item.uniqueId === entry.uniqueId))
    windowStart.value = lastPosition
  }
}
function requestMore(forQueue = false, retry = false) {
  if (disposed || (!forQueue && !visible.value))
    return
  if (!forQueue && windowStart.value + IMMERSIVE_WINDOW_SIZE < props.items.length) {
    windowStart.value += Math.floor(IMMERSIVE_WINDOW_SIZE * 2 / 3)
    return
  }
  if (!props.loading && (!props.noMoreContent || (retry && props.requestFailed)) && (!props.requestFailed || retry))
    emit('loadMore', retry)
}
function next(automatic = false) {
  if (nextIndex.value >= 0) {
    pendingNext.value = undefined
    select(props.items[nextIndex.value])
  }
  else if (current.value) {
    pendingNext.value = { key: current.value.uniqueId, automatic, pages: 0, length: props.items.length, state: props.requestFailed ? 'failed' : props.noMoreContent ? 'ended' : 'loading' }
    requestMore(true)
  }
}
function previous() {
  pendingNext.value = undefined
  if (previousIndex.value >= 0)
    select(props.items[previousIndex.value])
}
function action(key: string, value: string) {
  if (disposed || current.value?.uniqueId !== key)
    return
  if (value === 'next' || (value === 'ended' && settings.value.immersiveAutoNext))
    next(value === 'ended')
  else if (value === 'previous')
    previous()
  else if (value === 'close')
    close()
}
watch([() => props.items, () => props.loading], () => {
  if (!pendingNext.value || pendingNext.value.key !== current.value?.uniqueId || props.loading
    || (pendingNext.value.automatic && !settings.value.immersiveAutoNext)) {
    return
  }
  if (nextIndex.value >= 0) {
    pendingNext.value = undefined
    select(props.items[nextIndex.value])
  }
  else {
    const pending = pendingNext.value
    pending.pages++
    pending.state = props.requestFailed
      ? 'failed'
      : props.noMoreContent
        ? 'ended'
        : props.manualPaging || props.pagingState === 'filtered-empty' ? 'filtered' : props.items.length === pending.length ? 'stalled' : 'continue'
    pending.length = props.items.length
    if (pending.state === 'continue' && pending.pages < 3 && !props.manualPaging) {
      pending.state = 'loading'
      requestMore(true)
    }
  }
}, { flush: 'post' })
watch(() => settings.value.immersiveAutoNext, (enabled) => {
  if (!enabled && pendingNext.value?.automatic)
    pendingNext.value = undefined
})
watch([index, () => props.items], ([position, items]) => {
  if (position >= 0) {
    lastPosition = position
    successorKey = items[position + 1]?.uniqueId
    predecessorKey = items[position - 1]?.uniqueId
  }
}, { flush: 'sync' })
watch(() => props.feedGeneration, () => emit('close'), { flush: 'sync' })
function railAction(value: { action: string, key?: string, revision?: number }) {
  if (value.revision !== railWindow.value.revision)
    return
  if (value.action === 'select') {
    const entry = props.items.find(item => item.uniqueId === value.key)
    if (entry)
      select(entry)
  }
  else if (value.action === 'more') {
    requestMore(false, true)
  }
}
function continueNext() {
  if (pendingNext.value) {
    pendingNext.value.pages = 0
    pendingNext.value.state = 'loading'
    requestMore(true, true)
  }
}
function keyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || !root.value || !ownsDialogKeyboard(root.value, event))
    return
  if (event.key === 'Tab' && root.value) {
    moveDialogTabFocus(root.value, root.value, event)
    return
  }
  const toolbarButton = event.target instanceof Element && event.target.closest('.immersive-feed__toolbar button')
  if ((isImmersiveInput(event) && !(event.key === 'Escape' && toolbarButton)) || isBrowserFullscreenActive())
    return
  if (event.key === 'Escape') {
    if (!event.repeat)
      close()
  }
  else if (settings.value.immersiveKeyboardSwitch && ['ArrowUp', 'PageUp', 'w', 'W', 'ArrowDown', 'PageDown', 's', 'S'].includes(event.key)) {
    if (!event.repeat) {
      if (['ArrowUp', 'PageUp', 'w', 'W'].includes(event.key))
        previous()
      else next()
    }
  }
  else {
    return
  }
  event.preventDefault()
  event.stopPropagation()
}
useEventListener(document, 'visibilitychange', () => visible.value = !document.hidden)
onMounted(() => {
  lockPageScroll()
  root.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  disposed = true
  pendingNext.value = undefined
  const overlay = root.value
  const active = getDeepActiveElement(document)
  const ownedFocus = !active || active === document.body || !!overlay?.contains(active)
  unlockPageScroll()
  void nextTick(() => {
    if (!normalExit || !originCurrent || (tabOwner && !tabOwner.isActiveTab()) || app.activatedPage.value !== page || app.homeActivatedPage.value !== homeTab
      || requestIdentity !== getRecommendationRequestIdentity() || accountId !== parseDedeUserID(document.cookie) || app.scrollViewportRef.value !== viewport
      || !ownedFocus || (viewport && scrollClaim && !ownsScrollPosition(viewport, scrollClaim))) {
      return
    }
    const active = getDeepActiveElement(document)
    if ((active && active !== document.body && active !== document.documentElement && active.isConnected && !overlay?.contains(active))
      || (app.mainAppRef.value && getTopDialog(app.mainAppRef.value))) {
      return
    }
    if (viewport?.isConnected && scrollClaim)
      scrollToPosition(viewport, scrollClaim.top)
    if (focus instanceof HTMLElement && focus.isConnected)
      restoreOverlayFocus(overlay, focus, false)
  })
})
</script>

<template>
  <Teleport :to="app.mainAppRef.value" :disabled="!app.mainAppRef.value">
    <section
      ref="root"
      class="immersive-feed"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('settings.immersive_mode')"
      :data-bewly-dialog-active="dialogId"
      tabindex="-1"
      @keydown="keyboard"
    >
      <header class="immersive-feed__toolbar">
        <span class="bew-subheading" :title="$t('settings.immersive_scope')">{{ $t('settings.immersive_mode') }}</span>
        <IconButton :label="$t('settings.immersive_previous')" :disabled="previousIndex < 0" class="immersive-feed__button" @click="previous">
          <span class="i-tabler:player-skip-back" aria-hidden="true" />
        </IconButton>
        <IconButton :label="$t('settings.immersive_next')" :disabled="nextIndex < 0 && noMoreContent" class="immersive-feed__button" @click="next()">
          <span class="i-tabler:player-skip-forward" aria-hidden="true" />
        </IconButton>
        <CloseButton :label="$t('common.close')" @click="close" />
      </header>
      <div class="immersive-feed__body">
        <div class="immersive-feed__stage">
          <ImmersiveVideoFrame
            v-if="current" :key="current.uniqueId"
            :url="getImmersiveVideoUrl(current)!"
            :item-key="current.uniqueId"
            :title="current.displayData?.title || ''"
            :active="true"
            :ui-visible="visible"
            :recommendations="railWindow"
            @action="action($event.key, $event.action)"
            @rail-action="railAction"
            @navigation="externalTarget = $event"
          />
          <p v-if="!current" class="bew-help">
            {{ $t('common.no_data') }}
          </p>
        </div>
      </div>
      <div v-if="pendingNext" class="immersive-feed__pending" role="status">
        <span>{{ $t(`settings.immersive_queue_${pendingNext.state}`) }}</span>
        <button v-if="!['loading', 'ended'].includes(pendingNext.state)" type="button" @click="continueNext">
          {{ $t('common.load_more') }}
        </button>
      </div>
      <LazyPicture v-if="settings.immersivePreloadNext && visible && nextIndex >= 0" class="immersive-feed__poster-preload" :src="items[nextIndex].displayData?.cover || ''" alt="" />
    </section>
  </Teleport>
</template>

<style scoped lang="scss">
.immersive-feed {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-immersive-feed);
  display: flex;
  flex-direction: column;
  background: var(--bew-bg);
  color: var(--bew-text-1);
  overscroll-behavior: contain;
}

.immersive-feed__toolbar {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-4);
  background: var(--bew-elevated-solid);
  border-bottom: var(--bew-hairline) solid var(--bew-separator-color);

  .bew-subheading {
    flex: 1;
  }
}

.immersive-feed__button {
  width: var(--bew-control-height);
  height: var(--bew-control-height);

  > span {
    width: var(--bew-icon-size-lg);
    height: var(--bew-icon-size-lg);
  }
}

.immersive-feed__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.immersive-feed__stage {
  position: relative;
  flex: 1;
  min-width: 0;
}

.immersive-feed__pending {
  display: flex;
  justify-content: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-2);
  font-size: var(--bew-font-size-callout);
}
.immersive-feed__poster-preload {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
