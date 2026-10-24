<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

import Button from '~/components/Button.vue'
import { DrawerType, useBewlyApp } from '~/composables/useAppProvider'
import { useIframeDocumentHost } from '~/composables/useIframeDocumentHost'
import { usePanelTrigger } from '~/composables/usePanelOrigin'
import { syncRouteState } from '~/composables/useRouteState'
import { BEWLY_DRAWER_CLOSE_REQUEST, BEWLY_DRAWER_ESCAPE_HANDLED, BEWLY_IFRAME_DRAWER_HOST_CHANGE, BEWLY_IFRAME_DRAWER_HOST_CLASS, IFRAME_PLAYER_CONTEXT } from '~/constants/globalEvents'
import { DRAWER_TRANSITION_MS, ESC_CONFIRM_WINDOW_MS } from '~/constants/timing'
import { settings } from '~/logic'
import type { IframePlaybackContext } from '~/logic/iframePageState'
import type { DefaultVideoPlayerMode } from '~/logic/storage'
import { isBewlyWidescreenEngaged } from '~/utils/bewlyWidescreen'
import { getDeepActiveElement } from '~/utils/dialogFocus'
import { isEditableLeafActiveElement, isEligibleDrawerEscape, resolveDrawerEscapeBehavior, shouldHandleDrawerEscape } from '~/utils/drawerEscape'
import { hasIframeEscapePriorityState } from '~/utils/escapePriority'
import { clearIframeDrawerHistory, createIframeDrawerHistory, readIframeDrawerHistory } from '~/utils/iframeDrawerHistory'
import { resolveIframeExternalUrl } from '~/utils/iframeExternalUrl'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '~/utils/iframeMessage'
import { hasNavigationModifier } from '~/utils/linkNavigation'
import { isHomePage, isInIframe } from '~/utils/main'
import { releaseIframeMedia } from '~/utils/mediaResources'
import { reportRuntimeFailure } from '~/utils/messaging'
import { retiringTransition } from '~/utils/motionPresence'
import { lockPageScroll, unlockPageScroll } from '~/utils/pageScrollLock'
import { resolveMomentsDialogPlayerModeOverride } from '~/utils/player'

const props = defineProps<{
  url: string
  title?: string
  playbackContext?: IframePlaybackContext
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { activeDrawer, setActiveDrawer } = useBewlyApp()
const sourceTrigger = usePanelTrigger()() ?? getDeepActiveElement(document)

const show = ref(false)
const headerShow = ref(true)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref<string>(props.url)
const showIframe = ref<boolean>(false)
const renderIframe = ref<boolean>(true)
const iframeKey = ref(0)
const delayCloseTimer = ref<NodeJS.Timeout | null>(null)
const removeTopBarClassInjected = ref<boolean>(false)
const originUrl = ref<string>()
let historyEntryId: string | undefined
let historyEntryDeparted = false
const isPageFullscreen = ref<boolean>(false)
const isPageScrollLocked = ref(false)
const isEscPressed = ref<boolean>(false)
const escPressedTimer = ref<NodeJS.Timeout | null>(null)
const disableEscPress = ref<boolean>(false)
let stopIframePushStateListener: (() => void) | null = null
let stopIframePopStateListener: (() => void) | null = null
let stopIframeDOMContentLoadedListener: (() => void) | null = null
let focusRetryTimer: ReturnType<typeof setTimeout> | null = null
let focusFrame: number | null = null
let iframeGeneration = 0
let navigationVersion = 0
let focusVersion = 0
let disposed = false
let closing = false
let iframeEscapeHandledGeneration = 0
let iframeDrawerHostClaimed = false
const escapeArbitrationTimers = new Set<number>()
const disposers: Array<() => void> = []
let playerContextSessionId = crypto.randomUUID()
let playerContextRequest: { documentId: string, requestId: number, href: string } | undefined
const reportedPlayerMode = ref<DefaultVideoPlayerMode>()
const playerMode = computed(() => reportedPlayerMode.value ?? resolveMomentsDialogPlayerModeOverride(props.playbackContext))
const containerStyle = computed(() => props.playbackContext === 'momentsDialog'
  && resolveMomentsDialogPlayerModeOverride(props.playbackContext) !== undefined && playerMode.value === 'default' && !isPageFullscreen.value
  ? { maxWidth: 'var(--bew-page-max-width)', marginInline: 'auto', right: '0' }
  : undefined)

function requestPlayerContext() {
  postMessageToIframe(iframeRef.value, { type: IFRAME_PLAYER_CONTEXT, phase: 'request', sessionId: playerContextSessionId, generation: iframeGeneration })
}
watch(() => props.playbackContext, () => {
  iframeGeneration++
  playerContextSessionId = crypto.randomUUID()
  playerContextRequest = undefined
  reportedPlayerMode.value = undefined
  requestPlayerContext()
})

// 计算iframe容器的样式
const iframeContainerClasses = computed(() => {
  if (isPageFullscreen.value) {
    return 'iframe-drawer__fullscreen pos-fixed top-0 left-0 w-full h-full'
  }
  else {
    const topPosition = headerShow.value ? 'top-$bew-top-bar-height' : 'top-0'
    // 修正高度：使用 calc(100% - top位置) 确保容器不会超出可视区域
    const height = headerShow.value ? 'h-[calc(100%-var(--bew-top-bar-height))]' : 'h-full'
    return `pos-absolute ${topPosition} left-0 of-hidden bg-$bew-bg rounded-t-$bew-surface-radius w-full ${height}`
  }
})

const iframeStyles = computed(() => {
  if (isPageFullscreen.value) {
    return {}
  }
  else {
    // 不再需要负偏移，因为容器高度已经正确设置
    return {
      top: '0',
    }
  }
})

disposers.push(useEventListener(window, 'popstate', updateIframeUrl))

const { currentHref: reportedHref } = useIframeDocumentHost(iframeRef, () => show.value && !closing && !disposed)
const externalHref = computed(() => resolveIframeExternalUrl(iframeRef.value, reportedHref.value, props.url))

function syncExternalHref(event: Event) {
  (event.currentTarget as HTMLAnchorElement).href = resolveIframeExternalUrl(iframeRef.value, reportedHref.value, props.url)
}

watch(() => props.url, async (newUrl, oldUrl) => {
  if (disposed || closing || !show.value || newUrl === oldUrl)
    return

  history.replaceState(history.state, '', newUrl.replace(/\/$/, ''))
  syncRouteState()
  await remountIframe(newUrl)
})

function cleanupIframeWindowListeners() {
  stopIframePushStateListener?.()
  stopIframePopStateListener?.()
  stopIframeDOMContentLoadedListener?.()
  stopIframePushStateListener = null
  stopIframePopStateListener = null
  stopIframeDOMContentLoadedListener = null
}

function clearFocusRetryTimer() {
  focusVersion++
  if (focusRetryTimer) {
    clearTimeout(focusRetryTimer)
    focusRetryTimer = null
  }
  if (focusFrame !== null) {
    cancelAnimationFrame(focusFrame)
    focusFrame = null
  }
}

function clearEscapeConfirmation() {
  isEscPressed.value = false
  if (escPressedTimer.value) {
    clearTimeout(escPressedTimer.value)
    escPressedTimer.value = null
  }
}

function clearEscapeArbitrationTimers() {
  for (const timer of escapeArbitrationTimers)
    window.clearTimeout(timer)
  escapeArbitrationTimers.clear()
}

function dispatchIframeDrawerHostChange(active: boolean) {
  window.dispatchEvent(new CustomEvent(BEWLY_IFRAME_DRAWER_HOST_CHANGE, {
    detail: { active },
  }))
}

function claimIframeDrawerHost() {
  document.documentElement.classList.add(BEWLY_IFRAME_DRAWER_HOST_CLASS)
  iframeDrawerHostClaimed = true
  dispatchIframeDrawerHostChange(true)
}

function restoreOriginUrl() {
  // Never overwrite a browser-back destination or a newer navigation.
  if (!historyEntryDeparted && originUrl.value && readIframeDrawerHistory(history.state, window.location.href)?.id === historyEntryId) {
    history.replaceState(clearIframeDrawerHistory(history.state), '', originUrl.value)
    syncRouteState()
  }
}

function releaseIframeDrawerHost() {
  if (!iframeDrawerHostClaimed)
    return
  try {
    restoreOriginUrl()
  }
  catch (error) {
    reportRuntimeFailure('Failed to restore iframe drawer host URL', error)
  }
  finally {
    document.documentElement.classList.remove(BEWLY_IFRAME_DRAWER_HOST_CLASS)
    iframeDrawerHostClaimed = false
    dispatchIframeDrawerHostChange(false)
  }
}

function hasDrawerEscapePriorityState() {
  return hasIframeEscapePriorityState({
    bewlyWidescreenEngaged: isBewlyWidescreenEngaged(),
    editingStateActive: isPageFullscreen.value || disableEscPress.value,
  }) || isEditableLeafActiveElement()
}

function focusIframe(retryCount = 3) {
  clearFocusRetryTimer()
  const version = focusVersion

  nextTick(() => {
    if (disposed || closing || version !== focusVersion)
      return
    focusFrame = requestAnimationFrame(() => {
      focusFrame = null
      const iframe = iframeRef.value
      if (disposed || closing || version !== focusVersion || !iframe || !show.value || activeDrawer.value !== DrawerType.IframeDrawer)
        return

      iframe.focus({ preventScroll: true })
      try {
        iframe.contentWindow?.focus()
      }
      catch {
        // Cross-origin frames may block direct window focus.
      }

      if (retryCount > 0) {
        focusRetryTimer = setTimeout(() => {
          focusIframe(retryCount - 1)
        }, 120)
      }
    })
  })
}

function injectStyleClass() {
  if (headerShow.value) {
    try {
      iframeRef.value?.contentDocument?.documentElement.classList.add('remove-top-bar-without-placeholder')
      removeTopBarClassInjected.value = true
    }
    catch (error) {
      reportRuntimeFailure('Failed to inject iframe style class', error)
    }
  }
}

function handleIframeLoad(event: Event) {
  const iframe = event.currentTarget
  if (!(iframe instanceof HTMLIFrameElement)
    || iframe !== iframeRef.value
    || currentUrl.value === 'about:blank'
    || !show.value || disposed || closing) {
    return
  }

  markIframeReadyForMessaging(iframe)
  iframeGeneration++
  playerContextSessionId = crypto.randomUUID()
  playerContextRequest = undefined
  requestPlayerContext()
  const iframeWindow = iframe.contentWindow
  if (!iframeWindow) {
    reportRuntimeFailure('Iframe lifecycle', 'contentWindow is unavailable after load')
    return
  }

  cleanupIframeWindowListeners()
  injectStyleClass()
  if (iframe.contentDocument) {
    stopIframePushStateListener = useEventListener(iframeWindow, 'pushstate', updateCurrentUrl)
    stopIframePopStateListener = useEventListener(iframeWindow, 'popstate', updateCurrentUrl)
    stopIframeDOMContentLoadedListener = useEventListener(iframeWindow, 'DOMContentLoaded', injectStyleClass)
  }
  showIframe.value = true
  focusIframe()
}

async function remountIframe(url: string) {
  const version = ++navigationVersion
  await releaseIframeResources()
  if (disposed || closing || version !== navigationVersion)
    return
  currentUrl.value = url
  iframeKey.value += 1
  renderIframe.value = true
  await nextTick()
}

onMounted(() => {
  const restored = readIframeDrawerHistory(history.state, window.location.href)
  originUrl.value = restored?.origin ?? window.location.href
  claimIframeDrawerHost()
  try {
    if (!restored)
      history.pushState(createIframeDrawerHistory(history.state, originUrl.value, props.playbackContext), '', props.url)
    historyEntryId = readIframeDrawerHistory(history.state, window.location.href)?.id
    syncRouteState()
  }
  catch (error) {
    releaseIframeDrawerHost()
    throw error
  }
  show.value = true
  headerShow.value = true
  currentUrl.value = props.url
  renderIframe.value = true
  setActiveDrawer(DrawerType.IframeDrawer) // 设置为当前活跃抽屉
  if (!isPageScrollLocked.value) {
    lockPageScroll()
    isPageScrollLocked.value = true
  }
})

onBeforeUnmount(async () => {
  disposed = true
  navigationVersion++
  for (const dispose of disposers)
    dispose()
  disposers.length = 0
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  clearEscapeConfirmation()
  clearEscapeArbitrationTimers()
  clearFocusRetryTimer()
  await releaseIframeResources()
})

onUnmounted(() => {
  releaseIframeDrawerHost()
})

function updateCurrentUrl(e: any) {
  if (!iframeRef.value?.contentWindow) {
    reportRuntimeFailure('Iframe navigation', 'contentWindow is unavailable')
    return
  }
  let newUrl = iframeRef.value.contentWindow.location.href
  if (e.type === 'pushstate' && Array.isArray(e.detail) && e.detail.length === 3 && e.detail[2]) {
    newUrl = String(e.detail[2])
  }
  newUrl = newUrl.replace(/\/$/, '')
  if (newUrl && newUrl !== 'about:blank') {
    history.replaceState(history.state, '', newUrl)
    syncRouteState()
  }
}

async function updateIframeUrl() {
  if (readIframeDrawerHistory(history.state, window.location.href)?.id !== historyEntryId)
    historyEntryDeparted = true
  if (disposed || closing)
    return
  if (isHomePage() || readIframeDrawerHistory(history.state, window.location.href)?.id !== historyEntryId) {
    await handleClose()
    return
  }
  await remountIframe(location.href.replace(/\/$/, ''))
}

async function handleClose() {
  if (disposed || closing)
    return
  closing = true
  navigationVersion++
  clearEscapeConfirmation()
  clearEscapeArbitrationTimers()
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  await releaseIframeResources()
  if (disposed)
    return
  show.value = false
  headerShow.value = false
  setActiveDrawer(DrawerType.None) // 清除活跃抽屉状态
  if (readIframeDrawerHistory(history.state, window.location.href)?.id === historyEntryId)
    history.back()
  delayCloseTimer.value = setTimeout(() => {
    releaseIframeDrawerHost()
    emit('close')
    void nextTick(() => {
      if (!readIframeDrawerHistory(history.state, window.location.href) && sourceTrigger instanceof HTMLElement && sourceTrigger.isConnected && !sourceTrigger.closest('[inert]'))
        sourceTrigger.focus({ preventScroll: true })
    })
  }, DRAWER_TRANSITION_MS)
}

async function releaseIframeResources() {
  iframeGeneration++
  playerContextSessionId = crypto.randomUUID()
  playerContextRequest = undefined
  reportedPlayerMode.value = undefined
  clearFocusRetryTimer()
  cleanupIframeWindowListeners()
  showIframe.value = false
  removeTopBarClassInjected.value = false

  const iframe = iframeRef.value
  releaseIframeMedia(iframe)
  currentUrl.value = 'about:blank'

  // Now safe to remove from DOM
  renderIframe.value = false
  isPageFullscreen.value = false
  disableEscPress.value = false
  removeTopBarClassInjected.value = false
  await nextTick()
}

function handleOpenInNewTab(event: MouseEvent) {
  if (closing || disposed) {
    event.preventDefault()
    return
  }
  syncExternalHref(event)
  if (event.button === 0 && !hasNavigationModifier(event)) {
    event.preventDefault()
    window.open((event.currentTarget as HTMLAnchorElement).href, '_blank', 'noopener,noreferrer')
    void handleClose()
  }
}

function applyDrawerEscapeRequest() {
  if (!show.value || activeDrawer.value !== DrawerType.IframeDrawer)
    return

  const action = resolveDrawerEscapeBehavior(settings.value.drawerEscapeBehavior, isEscPressed.value)
  if (action === 'close') {
    void handleClose()
    return
  }

  isEscPressed.value = true
  if (escPressedTimer.value)
    clearTimeout(escPressedTimer.value)
  escPressedTimer.value = setTimeout(() => {
    escPressedTimer.value = null
    isEscPressed.value = false
  }, ESC_CONFIRM_WINDOW_MS)
}

function handleKeydown(event: KeyboardEvent) {
  if (!isEligibleDrawerEscape(event) || activeDrawer.value !== DrawerType.IframeDrawer || !show.value)
    return

  const hadPriorityState = hasDrawerEscapePriorityState()
  const handledGeneration = iframeEscapeHandledGeneration
  const timer = window.setTimeout(() => {
    escapeArbitrationTimers.delete(timer)
    const canHandle = shouldHandleDrawerEscape({
      active: show.value && activeDrawer.value === DrawerType.IframeDrawer,
      defaultPrevented: event.defaultPrevented,
      propagationStopped: event.cancelBubble,
      hadPriorityState,
      hasPriorityState: hasDrawerEscapePriorityState(),
      iframeHandled: iframeEscapeHandledGeneration !== handledGeneration,
    })
    if (!canHandle) {
      clearEscapeConfirmation()
      return
    }
    applyDrawerEscapeRequest()
  }, 0)
  escapeArbitrationTimers.add(timer)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
  disposers.push(() => window.removeEventListener('keydown', handleKeydown, true))
})

function handleIframeMessage(event: MessageEvent) {
  if (isInIframe() || disposed || closing || !show.value)
    return

  const message = getIframeMessageData(event, iframeRef.value)
  if (!message)
    return

  switch (message.type) {
    case IFRAME_PLAYER_CONTEXT: {
      // Drawer URLs are same-origin. Check the actual document URL as well as
      // Window identity, since an iframe WindowProxy survives SPA navigation.
      try {
        if (message.href !== iframeRef.value?.contentWindow?.location.href)
          return
      }
      catch { return }
      if (message.phase === 'ready' && typeof message.documentId === 'string' && message.documentId
        && Number.isSafeInteger(message.requestId) && Number(message.requestId) > 0) {
        if (message.sessionId !== playerContextSessionId || message.generation !== iframeGeneration) {
          requestPlayerContext()
          return
        }
        if (playerContextRequest?.documentId === message.documentId && Number(message.requestId) <= playerContextRequest.requestId)
          return
        playerContextRequest = { documentId: message.documentId, requestId: Number(message.requestId), href: String(message.href) }
        reportedPlayerMode.value = undefined
        postMessageToIframe(iframeRef.value, { type: IFRAME_PLAYER_CONTEXT, phase: 'context', ...playerContextRequest, sessionId: playerContextSessionId, generation: iframeGeneration, context: props.playbackContext })
      }
      else if (message.phase === 'mode' && playerContextRequest && message.sessionId === playerContextSessionId
        && message.generation === iframeGeneration
        && message.documentId === playerContextRequest.documentId && message.requestId === playerContextRequest.requestId
        && message.href === playerContextRequest.href && typeof message.mode === 'string'
        && ['default', 'webFullscreen', 'widescreen', 'bewlyWidescreen'].includes(message.mode)) {
        reportedPlayerMode.value = message.mode as DefaultVideoPlayerMode
        const fullscreen = message.mode === 'webFullscreen'
        clearEscapeConfirmation()
        headerShow.value = !fullscreen
        disableEscPress.value = fullscreen
        isPageFullscreen.value = fullscreen
      }
      break
    }
    case BEWLY_DRAWER_ESCAPE_HANDLED:
      if (message.source === 'iframe') {
        iframeEscapeHandledGeneration += 1
        clearEscapeConfirmation()
      }
      break
    case BEWLY_DRAWER_CLOSE_REQUEST:
      if (message.source === 'iframe' && activeDrawer.value === DrawerType.IframeDrawer) {
        if (hasDrawerEscapePriorityState())
          clearEscapeConfirmation()
        else
          applyDrawerEscapeRequest()
      }
      break
  }
}

disposers.push(useEventListener(window, 'message', handleIframeMessage))
defineExpose({ close: handleClose })
</script>

<template>
  <div
    class="iframe-drawer-layer"
    pos="absolute top-0 left-0" of-hidden w-full h-full
  >
    <!-- Mask (only show in drawer mode, not in fullscreen) -->
    <Transition name="fade">
      <div
        v-if="show && !isPageFullscreen"
        pos="absolute bottom-0 left-0" w-full h-full bg="black opacity-60"
        @click="handleClose"
      />
    </Transition>

    <Transition name="fade">
      <div
        v-if="headerShow"
        pos="relative top-0" flex="~ items-center justify-end gap-2"
        max-w="$bew-page-max-width" w-full h="$bew-top-bar-height"
        m-auto px-4
        pointer-events-none
      >
        <a
          :href="externalHref" target="_blank" rel="noopener noreferrer"
          class="iframe-drawer__external"
          style="
            --b-button-color: var(--bew-elevated-solid);
            --b-button-color-hover: var(--bew-elevated-solid-hover);
          "
          pointer-events-auto
          @pointerdown="syncExternalHref" @focus="syncExternalHref" @contextmenu="syncExternalHref"
          @click="handleOpenInNewTab"
        >
          <i i-tabler:external-link />
          {{ $t('iframe_drawer.open_in_new_tab') }}
        </a>
        <Button
          v-if="!isEscPressed"
          style="
            --b-button-color: var(--bew-elevated-solid);
            --b-button-color-hover: var(--bew-elevated-solid-hover);
          "
          pointer-events-auto
          @click="handleClose"
        >
          <template #left>
            <i i-tabler:x />
          </template>
          {{ $t('iframe_drawer.close') }}
          <kbd>Esc</kbd>
        </Button>
        <Button
          v-else
          type="error"
          @click="handleClose"
        >
          <template #left>
            <i i-tabler:x />
          </template>
          {{ $t('iframe_drawer.press_esc_again_to_close') }}
          <kbd>Esc</kbd>
        </Button>
      </div>
    </Transition>

    <!-- Iframe Container -->
    <Transition :name="isPageFullscreen ? 'fade' : 'drawer'" v-bind="retiringTransition">
      <div
        v-if="show"
        :class="iframeContainerClasses"
        :style="containerStyle"
      >
        <Transition name="fade">
          <iframe
            v-if="renderIframe"
            v-show="showIframe"
            :key="iframeKey"
            ref="iframeRef"
            name="bewly-iframe-drawer"
            :src="currentUrl"
            :style="iframeStyles"
            frameborder="0"
            tabindex="-1"
            pointer-events-auto
            :pos="isPageFullscreen ? undefined : 'relative left-0'"
            allow="fullscreen"
            w-full
            h-full
            @load="handleIframeLoad"
          />
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.iframe-drawer__external {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2) var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-elevated-solid);
  color: var(--bew-text-1);

  &:hover {
    background: var(--bew-elevated-solid-hover);
  }
}
.iframe-drawer-layer,
.iframe-drawer__fullscreen {
  z-index: var(--bew-z-drawer);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform var(--bew-duration-moderate) var(--bew-ease-standard);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(100%);
}
.drawer-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active {
    transition: none;
  }
  .drawer-enter-from,
  .drawer-leave-to {
    transform: none;
  }
}
</style>
