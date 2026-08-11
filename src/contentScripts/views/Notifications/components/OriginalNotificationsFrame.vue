<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { OriginalNotificationView } from '../notificationSections'

const props = defineProps<{
  view: OriginalNotificationView
}>()

const { isDark, isOledDark } = useDark()
const topBarStore = useTopBarStore()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeKey = ref(0)
const iframeSrc = ref(buildOriginalNotificationUrl(props.view))
const isIframeLoaded = ref(false)

let isFrameActive = false
let iframeWasReleased = false
let remountGeneration = 0
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
    if (import.meta.env.DEV)
      console.warn('[Notifications] Failed to sync iframe theme', error)
  }
}

function syncUnreadMessageCount() {
  topBarStore.syncUnreadMessageState().catch((error) => {
    if (import.meta.env.DEV)
      console.warn('[Notifications] Failed to sync unread state', error)
  })
}

function scheduleIframeReveal(iframe: HTMLIFrameElement) {
  clearRevealFrame()
  revealFrame = requestAnimationFrame(() => {
    revealFrame = undefined
    if (iframe === iframeRef.value && isFrameActive)
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

function releaseIframeResources() {
  clearRevealFrame()
  isIframeLoaded.value = false
  const iframe = iframeRef.value
  if (iframe && iframe.getAttribute('src') !== 'about:blank')
    iframe.src = 'about:blank'
  iframeWasReleased = true
}

async function remountIframe(view = props.view) {
  const generation = ++remountGeneration
  releaseIframeResources()
  await nextTick()
  if (generation !== remountGeneration || !isFrameActive)
    return

  iframeSrc.value = buildOriginalNotificationUrl(view)
  iframeWasReleased = false
  iframeKey.value++
}

function reload() {
  void remountIframe()
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
  if (isFrameActive && document.visibilityState === 'visible')
    syncUnreadMessageCount()
}

function activateFrame() {
  if (isFrameActive)
    return

  isFrameActive = true
  if (iframeWasReleased) {
    iframeWasReleased = false
    iframeSrc.value = buildOriginalNotificationUrl(props.view)
    iframeKey.value++
  }
  startThemeWatcher()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  syncUnreadMessageCount()
}

function deactivateFrame() {
  if (!isFrameActive)
    return

  isFrameActive = false
  remountGeneration++
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopThemeSync()
  syncUnreadMessageCount()
  releaseIframeResources()
}

watch(() => props.view, (view) => {
  if (isFrameActive)
    void remountIframe(view)
})

onMounted(activateFrame)
onActivated(activateFrame)
onDeactivated(deactivateFrame)
onBeforeUnmount(() => {
  deactivateFrame()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopThemeSync()
  remountGeneration++
  releaseIframeResources()
})

defineExpose({ reload })
</script>

<template>
  <section class="original-notifications-frame" :aria-busy="!isIframeLoaded">
    <div v-if="!isIframeLoaded" class="original-notifications-frame__loading">
      <Loading />
    </div>

    <iframe
      :key="iframeKey"
      ref="iframeRef"
      class="original-notifications-frame__iframe"
      :class="{ 'original-notifications-frame__iframe--loaded': isIframeLoaded }"
      :src="iframeSrc"
      name="bewly-notifications-page"
      :title="$t('notifications.original_frame_title')"
      frameborder="0"
      @load="handleIframeLoad"
    />
  </section>
</template>

<style scoped lang="scss">
.original-notifications-frame {
  position: relative;
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

.original-notifications-frame__loading,
.original-notifications-frame__iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.original-notifications-frame__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bew-homepage-bg);
}

.original-notifications-frame__iframe {
  display: block;
  min-width: 0;
  min-height: 0;
  background: transparent;
  border: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--bew-duration-normal) var(--bew-ease-standard);
}

.original-notifications-frame__iframe--loaded {
  opacity: 1;
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .original-notifications-frame__iframe {
    transition: none;
  }
}
</style>
