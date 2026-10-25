<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

import CloseButton from '~/components/CloseButton.vue'
import IconButton from '~/components/IconButton.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabViewState } from '~/composables/useHomeTabState'
import { settings } from '~/logic'
import { parseDedeUserID } from '~/logic/loginStatus'
import { getRecommendationRequestIdentity } from '~/logic/recommendationMode'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'
import { DIALOG_FOCUS_OWNER, DIALOG_TELEPORT_TARGET, getDeepActiveElement, getTopDialog, moveDialogTabFocus, ownsDialogKeyboard, restoreOverlayFocus } from '~/utils/dialogFocus'
import { isBrowserFullscreenActive } from '~/utils/escapePriority'
import { findImmersiveVideo, getImmersiveVideoUrl, getImmersiveWindow, IMMERSIVE_WINDOW_SIZE, isImmersiveInput } from '~/utils/immersiveRecommendation'
import { lockPageScroll, unlockPageScroll } from '~/utils/pageScrollLock'
import type { ScrollPositionClaim } from '~/utils/scrollIntent'
import { claimScrollPosition, ownsScrollPosition, scrollToPosition } from '~/utils/scrollIntent'

import ImmersiveVideoFrame from './ImmersiveVideoFrame.vue'

type Entry = VideoElement | AppVideoElement
const props = defineProps<{ items: Entry[], initialIndex: number, loading: boolean, noMoreContent: boolean, requestFailed: boolean, trigger?: HTMLElement, scrollClaim?: ScrollPositionClaim }>()
const emit = defineEmits<{ (event: 'close'): void, (event: 'loadMore'): void }>()
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
const sidebar = ref<HTMLElement | null>(null)
const sidebarOpen = ref(true)
const visible = ref(!document.hidden)
const index = ref(findImmersiveVideo(props.items, Math.max(0, props.initialIndex), 1))
const windowStart = ref(index.value)
const pendingNext = ref<{ key: string, automatic: boolean }>()
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
provide('BEWLY_APP', { ...app, scrollViewportRef: sidebar })
const current = computed(() => props.items[index.value])
const nextIndex = computed(() => findImmersiveVideo(props.items, index.value + 1, 1))
const previousIndex = computed(() => findImmersiveVideo(props.items, index.value - 1, -1))
const windowItems = computed(() => getImmersiveWindow(props.items, windowStart.value))
watch(index, () => {
  windowStart.value = index.value
  void nextTick(() => {
    if (app.activatedPage.value !== page || app.homeActivatedPage.value !== homeTab || requestIdentity !== getRecommendationRequestIdentity())
      return
    if (!disposed && sidebar.value)
      scrollToPosition(sidebar.value, 0)
  })
}, { flush: 'sync' })
const frames = computed(() => {
  const currentItem = current.value
  if (!currentItem)
    return []
  const result = [{ entry: currentItem, active: true }]
  if (settings.value.immersivePreloadNext && nextIndex.value >= 0)
    result.push({ entry: props.items[nextIndex.value], active: false })
  return result
})
function select(entry: Entry, event?: MouseEvent) {
  if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey))
    return
  event?.preventDefault()
  const target = props.items.indexOf(entry)
  if (target >= 0 && getImmersiveVideoUrl(entry)) {
    pendingNext.value = undefined
    index.value = target
  }
}
function requestMore(forQueue = false, retry = false) {
  if (disposed || (!forQueue && !visible.value))
    return
  if (!forQueue && windowStart.value + IMMERSIVE_WINDOW_SIZE < props.items.length) {
    windowStart.value += Math.floor(IMMERSIVE_WINDOW_SIZE * 2 / 3)
    return
  }
  if (!props.loading && !props.noMoreContent && (!props.requestFailed || retry))
    emit('loadMore')
}
function next(automatic = false) {
  if (nextIndex.value >= 0) {
    pendingNext.value = undefined
    index.value = nextIndex.value
  }
  else if (!props.noMoreContent && !props.requestFailed && current.value) {
    pendingNext.value = { key: current.value.uniqueId, automatic }
    requestMore(true)
  }
}
function previous() {
  pendingNext.value = undefined
  if (previousIndex.value >= 0)
    index.value = previousIndex.value
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
    index.value = nextIndex.value
  }
  else {
    pendingNext.value = undefined
  }
})
watch(() => settings.value.immersiveAutoNext, (enabled) => {
  if (!enabled && pendingNext.value?.automatic)
    pendingNext.value = undefined
})
watch(() => props.items, (items, previousItems) => {
  if (previousItems.length && items[0] !== previousItems[0])
    emit('close')
}, { flush: 'sync' })
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
        <span class="bew-subheading">{{ $t('settings.immersive_mode') }}</span>
        <IconButton :label="$t('settings.immersive_previous')" :disabled="previousIndex < 0" class="immersive-feed__button" @click="previous">
          <span class="i-tabler:player-skip-back" aria-hidden="true" />
        </IconButton>
        <IconButton :label="$t('settings.immersive_next')" :disabled="nextIndex < 0 && noMoreContent" class="immersive-feed__button" @click="next()">
          <span class="i-tabler:player-skip-forward" aria-hidden="true" />
        </IconButton>
        <IconButton :label="$t('settings.immersive_recommendations')" :aria-pressed="sidebarOpen" class="immersive-feed__button" @click="sidebarOpen = !sidebarOpen">
          <span class="i-tabler:layout-sidebar-right" aria-hidden="true" />
        </IconButton>
        <CloseButton :label="$t('common.close')" @click="close" />
      </header>
      <div class="immersive-feed__body">
        <div class="immersive-feed__stage">
          <ImmersiveVideoFrame
            v-for="frame in frames" :key="frame.entry.uniqueId"
            :url="getImmersiveVideoUrl(frame.entry)!"
            :item-key="frame.entry.uniqueId"
            :title="frame.entry.displayData?.title || ''"
            :active="frame.active"
            :ui-visible="visible"
            @action="action(frame.entry.uniqueId, $event)"
          />
          <p v-if="!current" class="bew-help">
            {{ $t('common.no_data') }}
          </p>
        </div>
        <aside v-if="sidebarOpen" ref="sidebar" class="immersive-feed__list" :aria-label="$t('settings.immersive_recommendations')">
          <VideoCardGrid
            v-if="visible"
            :items="windowItems"
            grid-layout="oneColumn"
            :persist-state="false"
            :show-preview="false"
            :loading="loading"
            :no-more-content="noMoreContent && windowStart + IMMERSIVE_WINDOW_SIZE >= items.length"
            :request-failed="requestFailed"
            :transform-item="(item: Entry) => item.displayData"
            :get-item-key="(item: Entry) => item.uniqueId"
            :card-click-handler="select"
            text-only-states
            @load-more="requestMore()"
            @refresh="requestMore(false, true)"
          >
            <template #afterCard="{ item }">
              <span v-if="item.uniqueId === current?.uniqueId" class="bew-help">{{ $t('settings.immersive_current') }}</span>
            </template>
          </VideoCardGrid>
        </aside>
      </div>
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

.immersive-feed__list {
  flex: 0 0 clamp(280px, 26vw, 384px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--bew-space-4);
  box-sizing: border-box;
  background: var(--bew-bg);
  border-left: var(--bew-hairline) solid var(--bew-separator-color);
}

@media (max-width: 900px) {
  .immersive-feed__list {
    position: absolute;
    inset: var(--bew-control-height) 0 0 auto;
    width: min(384px, 80vw);
  }
}
</style>
