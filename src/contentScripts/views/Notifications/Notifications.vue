<script setup lang="ts">
import { useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

const MESSAGE_PAGE_URL = 'https://message.bilibili.com/#/whisper'

const { handlePageRefresh } = useBewlyApp()
const { isDark, isOledDark } = useDark()
const topBarStore = useTopBarStore()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeKey = ref(0)
const isIframeLoaded = ref(false)
const isBottomDock = computed(() => settings.value.dockPosition === 'bottom')

let isPageActive = false
let iframeWasReleased = false
let revealFrame: number | undefined
let stopThemeWatcher: (() => void) | undefined

function clearRevealFrame() {
  if (revealFrame === undefined)
    return

  cancelAnimationFrame(revealFrame)
  revealFrame = undefined
}

function syncIframeTheme(iframe = iframeRef.value) {
  if (!iframe?.contentWindow)
    return

  try {
    iframe.contentWindow.postMessage({
      type: IFRAME_DARK_MODE_CHANGE,
      isDark: isDark.value,
      isOledDark: isOledDark.value,
      darkModeBaseColor: settings.value.darkModeBaseColor,
    }, '*')
  }
  catch (error) {
    console.warn('Failed to send notifications theme state to iframe:', error)
  }
}

function syncUnreadMessageCount() {
  topBarStore.syncUnreadMessageState().catch((error) => {
    console.error('同步消息页未读数量失败:', error)
  })
}

function scheduleIframeReveal(iframe: HTMLIFrameElement) {
  clearRevealFrame()
  revealFrame = requestAnimationFrame(() => {
    revealFrame = undefined
    if (iframe === iframeRef.value && isPageActive)
      isIframeLoaded.value = true
  })
}

function handleIframeLoad(event: Event) {
  const iframe = event.currentTarget as HTMLIFrameElement
  if (iframe !== iframeRef.value || iframe.getAttribute('src') === 'about:blank')
    return

  syncIframeTheme(iframe)
  syncUnreadMessageCount()
  scheduleIframeReveal(iframe)
}

function reloadIframe() {
  clearRevealFrame()
  isIframeLoaded.value = false
  iframeWasReleased = false
  iframeKey.value++
}

function registerRefreshHandler() {
  handlePageRefresh.value = reloadIframe
}

function clearRefreshHandler() {
  if (handlePageRefresh.value === reloadIframe)
    handlePageRefresh.value = undefined
}

function startThemeWatcher() {
  if (stopThemeWatcher)
    return

  stopThemeWatcher = watch(
    [isDark, isOledDark, () => settings.value.darkModeBaseColor],
    () => syncIframeTheme(),
  )
}

function stopThemeSync() {
  stopThemeWatcher?.()
  stopThemeWatcher = undefined
}

function handleVisibilityChange() {
  if (isPageActive && document.visibilityState === 'visible')
    syncUnreadMessageCount()
}

function releaseIframeResources() {
  clearRevealFrame()
  isIframeLoaded.value = false
  const iframe = iframeRef.value
  if (iframe && iframe.getAttribute('src') !== 'about:blank')
    iframe.src = 'about:blank'
  iframeWasReleased = true
}

function activatePage() {
  if (isPageActive)
    return

  isPageActive = true
  if (iframeWasReleased) {
    iframeWasReleased = false
    iframeKey.value++
  }
  registerRefreshHandler()
  startThemeWatcher()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  syncUnreadMessageCount()
}

function deactivatePage() {
  if (!isPageActive)
    return

  isPageActive = false
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopThemeSync()
  clearRefreshHandler()
  syncUnreadMessageCount()
  releaseIframeResources()
}

onMounted(activatePage)
onActivated(activatePage)
onDeactivated(deactivatePage)

onBeforeUnmount(() => {
  deactivatePage()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopThemeSync()
  clearRefreshHandler()
  releaseIframeResources()
})
</script>

<template>
  <main
    class="notifications-page"
    :class="{ 'notifications-page--dock-bottom': isBottomDock }"
    :aria-busy="!isIframeLoaded"
  >
    <div v-if="!isIframeLoaded" class="notifications-page__loading">
      <Loading />
    </div>

    <iframe
      :key="iframeKey"
      ref="iframeRef"
      class="notifications-page__iframe"
      :class="{ 'notifications-page__iframe--loaded': isIframeLoaded }"
      :src="MESSAGE_PAGE_URL"
      name="bewly-notifications-page"
      :title="$t('dock.notifications')"
      frameborder="0"
      @load="handleIframeLoad"
    />
  </main>
</template>

<style scoped lang="scss">
@use "../../../styles/breakpoints";

.notifications-page {
  position: relative;
  width: 100%;
  min-width: 0;
  height: calc(100dvh - var(--bew-top-bar-height) - var(--bew-space-3));
  min-height: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.notifications-page--dock-bottom {
  height: calc(
    100dvh - var(--bew-top-bar-height) - var(--bew-space-3) - var(--bew-dock-control-size) - var(--bew-space-8)
  );
}

.notifications-page__loading,
.notifications-page__iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.notifications-page__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bew-homepage-bg);
}

.notifications-page__iframe {
  display: block;
  min-width: 0;
  min-height: 0;
  background: transparent;
  border: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--bew-duration-normal) var(--bew-ease-standard);
}

.notifications-page__iframe--loaded {
  opacity: 1;
  pointer-events: auto;
}

@media (min-width: breakpoints.$grid-lg) {
  .notifications-page--dock-bottom {
    height: calc(
      100dvh - var(--bew-top-bar-height) - var(--bew-space-3) - var(--bew-dock-control-size-lg) - var(--bew-space-8)
    );
  }
}
</style>
