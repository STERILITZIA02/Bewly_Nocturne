<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

import { DrawerType, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { DRAWER_TRANSITION_MS, ESC_CONFIRM_WINDOW_MS } from '~/constants/timing'
import { settings } from '~/logic'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '~/utils/iframeMessage'
import { isHomePage, isInIframe } from '~/utils/main'
import { lockPageScroll, unlockPageScroll } from '~/utils/pageScrollLock'

// TODO: support shortcuts like `Ctrl+Alt+T` to open in new tab, `Esc` to close

const props = defineProps<{
  url: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { isDark, isOledDark } = useDark()
const { activeDrawer, setActiveDrawer } = useBewlyApp()

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
let initialThemeTimer: ReturnType<typeof setTimeout> | null = null
let iframeGeneration = 0
const disposers: Array<() => void> = []

// 计算iframe容器的样式
const iframeContainerClasses = computed(() => {
  if (isPageFullscreen.value) {
    return 'iframe-drawer__fullscreen pos-fixed top-0 left-0 w-full h-full'
  }
  else {
    const topPosition = headerShow.value ? 'top-$bew-top-bar-height' : 'top-0'
    // 修正高度：使用 calc(100% - top位置) 确保容器不会超出可视区域
    const height = headerShow.value ? 'h-[calc(100%-var(--bew-top-bar-height))]' : 'h-full'
    return `pos-absolute ${topPosition} left-0 of-hidden bg-$bew-bg rounded-t-$bew-radius w-full ${height}`
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

// 监听黑暗模式变化
watch([isDark, isOledDark], ([newValue, newOledValue]) => {
  try {
    postMessageToIframe(iframeRef.value, {
      type: IFRAME_DARK_MODE_CHANGE,
      isDark: newValue,
      isOledDark: newOledValue,
    })
  }
  catch (error) {
    console.warn('Failed to send dark mode change message to iframe:', error)
  }
})

// 监听深色模式基准颜色变化
watch(() => settings.value.darkModeBaseColor, (newColor) => {
  if (!isDark.value)
    return
  try {
    postMessageToIframe(iframeRef.value, {
      type: IFRAME_DARK_MODE_CHANGE,
      isDark: isDark.value,
      isOledDark: isOledDark.value,
      darkModeBaseColor: newColor,
    })
  }
  catch (error) {
    console.warn('Failed to send dark mode base color change message to iframe:', error)
  }
})

// 监听iframe加载状态，加载完成后发送初始的黑暗模式状态
watch(() => showIframe.value, (newValue) => {
  if (newValue && iframeRef.value?.contentWindow) {
    clearInitialThemeTimer()
    const generation = iframeGeneration
    const iframeWindow = iframeRef.value.contentWindow
    initialThemeTimer = setTimeout(() => {
      initialThemeTimer = null
      if (generation !== iframeGeneration || iframeWindow !== iframeRef.value?.contentWindow)
        return
      try {
        postMessageToIframe(iframeRef.value, {
          type: IFRAME_DARK_MODE_CHANGE,
          isDark: isDark.value,
          isOledDark: isOledDark.value,
          darkModeBaseColor: settings.value.darkModeBaseColor,
        })
      }
      catch (error) {
        console.warn('Failed to send initial dark mode state to iframe:', error)
      }
    }, 500) // 稍长的延迟确保iframe完全加载
  }
})

watch(() => props.url, async (newUrl, oldUrl) => {
  if (!show.value || newUrl === oldUrl)
    return

  history.replaceState(null, '', newUrl.replace(/\/$/, ''))
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
  if (focusRetryTimer) {
    clearTimeout(focusRetryTimer)
    focusRetryTimer = null
  }
  if (focusFrame !== null) {
    cancelAnimationFrame(focusFrame)
    focusFrame = null
  }
}

function clearInitialThemeTimer() {
  if (initialThemeTimer !== null) {
    clearTimeout(initialThemeTimer)
    initialThemeTimer = null
  }
}

function focusIframe(retryCount = 3) {
  clearFocusRetryTimer()

  nextTick(() => {
    focusFrame = requestAnimationFrame(() => {
      focusFrame = null
      const iframe = iframeRef.value
      if (!iframe || !show.value || activeDrawer.value !== DrawerType.IframeDrawer)
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
  if (headerShow.value && iframeRef.value?.contentWindow?.document) {
    try {
      iframeRef.value.contentWindow.document.documentElement.classList.add('remove-top-bar-without-placeholder')
      removeTopBarClassInjected.value = true
    }
    catch (error) {
      console.warn('Failed to inject style class:', error)
    }
  }
}

function handleIframeLoad(event: Event) {
  const iframe = event.currentTarget
  if (!(iframe instanceof HTMLIFrameElement)
    || iframe !== iframeRef.value
    || currentUrl.value === 'about:blank'
    || !show.value) {
    return
  }

  markIframeReadyForMessaging(iframe)
  const iframeWindow = iframe.contentWindow
  if (!iframeWindow) {
    console.error('Iframe or contentWindow is not available')
    return
  }

  cleanupIframeWindowListeners()
  injectStyleClass()
  stopIframePushStateListener = useEventListener(iframeWindow, 'pushstate', updateCurrentUrl)
  stopIframePopStateListener = useEventListener(iframeWindow, 'popstate', updateCurrentUrl)
  stopIframeDOMContentLoadedListener = useEventListener(iframeWindow, 'DOMContentLoaded', injectStyleClass)
  showIframe.value = true
  focusIframe()
}

async function remountIframe(url: string) {
  await releaseIframeResources()
  currentUrl.value = url
  iframeKey.value += 1
  renderIframe.value = true
  await nextTick()
}

onMounted(() => {
  originUrl.value = window.location.href
  history.pushState(null, '', props.url)
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
  if (escPressedTimer.value) {
    clearTimeout(escPressedTimer.value)
  }
  clearFocusRetryTimer()
  await releaseIframeResources()
})

onUnmounted(() => {
  history.replaceState(null, '', originUrl.value)
})

function updateCurrentUrl(e: any) {
  if (!iframeRef.value?.contentWindow) {
    console.error('iframe contentWindow not available')
    return
  }
  let newUrl = iframeRef.value.contentWindow.location.href
  if (e.type === 'pushstate' && Array.isArray(e.detail) && e.detail.length === 3 && e.detail[2]) {
    newUrl = String(e.detail[2])
  }
  newUrl = newUrl.replace(/\/$/, '')
  if (newUrl && newUrl !== 'about:blank') {
    history.replaceState(null, '', newUrl)
  }
}

async function updateIframeUrl() {
  if (isHomePage()) {
    await handleClose()
    return
  }
  await nextTick()

  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.location.replace(location.href.replace(/\/$/, ''))
  }
}

async function handleClose() {
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  await releaseIframeResources()
  show.value = false
  headerShow.value = false
  setActiveDrawer(DrawerType.None) // 清除活跃抽屉状态
  delayCloseTimer.value = setTimeout(() => {
    emit('close')
  }, DRAWER_TRANSITION_MS)
}

async function releaseIframeResources() {
  iframeGeneration++
  clearFocusRetryTimer()
  clearInitialThemeTimer()
  cleanupIframeWindowListeners()
  showIframe.value = false
  removeTopBarClassInjected.value = false

  // Navigate to about:blank and close browsing context BEFORE removing from DOM.
  // Previously, renderIframe was set to false first, which removed the iframe via v-if
  // and made iframeRef null — so contentWindow.close() was never actually called.
  // This is especially important for Firefox which doesn't always release media
  // resources (video decoders, buffers) when an iframe is simply removed from DOM.
  const iframe = iframeRef.value
  stopIframeMedia(iframe)
  currentUrl.value = 'about:blank'
  if (iframe)
    iframe.src = 'about:blank'

  try {
    iframe?.contentWindow?.close()
  }
  catch {
    // Cross-origin may block this
  }

  // Now safe to remove from DOM
  renderIframe.value = false
  await nextTick()
  if (iframeRef.value === iframe)
    iframeRef.value = null
  isPageFullscreen.value = false
  disableEscPress.value = false
  removeTopBarClassInjected.value = false
}

function stopIframeMedia(iframe: HTMLIFrameElement | null) {
  if (!iframe)
    return
  try {
    iframe.contentDocument?.querySelectorAll<HTMLMediaElement>('video, audio').forEach((media) => {
      media.pause()
      media.removeAttribute('src')
      media.querySelectorAll('source').forEach(source => source.remove())
      media.load()
    })
  }
  catch {
    // Cross-origin frames are released by navigating their browsing context to about:blank.
  }
}

function handleOpenInNewTab() {
  if (iframeRef.value) {
    window.open(iframeRef.value.contentWindow?.location.href.replace(/\/$/, ''), '_blank')
    handleClose()
  }
}

/**
 * Listen to Escape key on the main window using capture phase
 * Only active when this drawer is the active drawer
 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' && e.code !== 'Escape')
    return

  // Only handle when this drawer is the active drawer
  if (activeDrawer.value !== DrawerType.IframeDrawer)
    return

  e.preventDefault()
  e.stopPropagation()

  if (settings.value.drawerEscapeBehavior === 'immediate') {
    clearTimeout(escPressedTimer.value!)
    handleClose()
    return
  }
  if (disableEscPress.value)
    return
  if (isEscPressed.value) {
    handleClose()
  }
  else {
    isEscPressed.value = true
    if (escPressedTimer.value) {
      clearTimeout(escPressedTimer.value)
    }
    escPressedTimer.value = setTimeout(() => {
      isEscPressed.value = false
    }, ESC_CONFIRM_WINDOW_MS)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
  document.addEventListener('keydown', handleKeydown, true)
  disposers.push(
    () => window.removeEventListener('keydown', handleKeydown, true),
    () => document.removeEventListener('keydown', handleKeydown, true),
  )
})

function handleIframeMessage(event: MessageEvent) {
  if (isInIframe())
    return

  const message = getIframeMessageData(event, iframeRef.value)
  if (!message)
    return

  switch (message.type) {
    case DRAWER_VIDEO_ENTER_PAGE_FULL:
      headerShow.value = false
      disableEscPress.value = true
      isPageFullscreen.value = true
      break
    case DRAWER_VIDEO_EXIT_PAGE_FULL:
      headerShow.value = true
      disableEscPress.value = false
      isPageFullscreen.value = false
      break
    case 'BEWLY_DRAWER_CLOSE_REQUEST':
    {
      // 来自 iframe 的关闭请求
      if (message.source === 'iframe' && activeDrawer.value === DrawerType.IframeDrawer) {
        if (settings.value.drawerEscapeBehavior === 'immediate') {
          handleClose()
        }
        else {
          if (isEscPressed.value) {
            handleClose()
          }
          else {
            isEscPressed.value = true
            if (escPressedTimer.value) {
              clearTimeout(escPressedTimer.value)
            }
            escPressedTimer.value = setTimeout(() => {
              isEscPressed.value = false
            }, ESC_CONFIRM_WINDOW_MS)
          }
        }
      }
      break
    }
  }
}

disposers.push(useEventListener(window, 'message', handleIframeMessage))
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
        <Button
          style="
            --b-button-color: var(--bew-elevated-solid);
            --b-button-color-hover: var(--bew-elevated-solid-hover);
          "
          pointer-events-auto
          @click="handleOpenInNewTab"
        >
          <template #left>
            <i i-mingcute:external-link-line />
          </template>
          {{ $t('iframe_drawer.open_in_new_tab') }}
          <!-- <div flex="~">
            <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>T</kbd>
          </div> -->
        </Button>
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
            <i i-mingcute:close-line />
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
            <i i-mingcute:close-line />
          </template>
          {{ $t('iframe_drawer.press_esc_again_to_close') }}
          <kbd>Esc</kbd>
        </Button>
      </div>
    </Transition>

    <!-- Iframe Container -->
    <Transition :name="isPageFullscreen ? 'fade' : 'drawer'">
      <div
        v-if="show"
        :class="iframeContainerClasses"
      >
        <Transition name="fade">
          <iframe
            v-if="renderIframe"
            v-show="showIframe"
            :key="iframeKey"
            ref="iframeRef"
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
.iframe-drawer-layer,
.iframe-drawer__fullscreen {
  z-index: var(--bew-z-drawer);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform var(--bew-duration-moderate);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(100%);
}
</style>
