<script setup lang="ts">
import { useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { IFRAME_DARK_MODE_CHANGE, IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { useSettingsStore } from '~/stores/settingsStore'
import { showNativeBilibiliTopBar } from '~/utils/effectiveTopBarSource'
import { markIframeReadyForMessaging, postMessageToIframe } from '~/utils/iframeMessage'

const props = defineProps<{
  url: string
}>()
const { reachTop } = useBewlyApp()
const { isDark, isOledDark } = useDark()
const settingsStore = useSettingsStore()
const headerShow = ref(false)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref<string>(props.url)

const showLoading = ref<boolean>(false)
const iframeScrollCleanupFns = ref<Array<() => void>>([])
const iframeScrollSyncFailed = ref(false)
let iframeGeneration = 0
let initialThemeTimer: ReturnType<typeof setTimeout> | null = null

function shouldUseOriginalBilibiliTopBar() {
  return showNativeBilibiliTopBar(settingsStore.getEffectiveTopBarSource())
}

function cleanupIframeScrollSync() {
  for (const stop of iframeScrollCleanupFns.value)
    stop()
  iframeScrollCleanupFns.value = []
}

function updateReachTopFromIframe() {
  if (iframeScrollSyncFailed.value)
    return

  const iframeWindow = iframeRef.value?.contentWindow
  if (!iframeWindow)
    return

  try {
    const doc = iframeWindow.document
    const scrollElement = doc?.scrollingElement ?? doc?.documentElement ?? doc?.body
    const scrollTop = scrollElement?.scrollTop ?? iframeWindow.scrollY ?? 0
    reachTop.value = scrollTop <= 0
  }
  catch (error) {
    if (!iframeScrollSyncFailed.value) {
      iframeScrollSyncFailed.value = true
      if (import.meta.env.DEV)
        console.warn('Failed to sync reachTop from iframe scroll:', error)
    }
    reachTop.value = false
    cleanupIframeScrollSync()
  }
}

function setupIframeScrollSync() {
  const iframeWindow = iframeRef.value?.contentWindow
  if (!iframeWindow)
    return

  iframeScrollSyncFailed.value = false
  cleanupIframeScrollSync()

  if (!canAccessIframeDocument(iframeWindow)) {
    iframeScrollSyncFailed.value = true
    reachTop.value = false
    return
  }

  updateReachTopFromIframe()

  const handleScroll = () => updateReachTopFromIframe()
  iframeWindow.addEventListener('scroll', handleScroll, { passive: true })
  iframeScrollCleanupFns.value.push(() => iframeWindow.removeEventListener('scroll', handleScroll))

  const doc = iframeWindow.document
  const scrollTarget = doc?.scrollingElement ?? doc?.documentElement ?? doc?.body
  if (scrollTarget) {
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true })
    iframeScrollCleanupFns.value.push(() => scrollTarget.removeEventListener('scroll', handleScroll))
  }
}

function canAccessIframeDocument(iframeWindow: Window): boolean {
  try {
    void iframeWindow.document?.documentElement
    return true
  }
  catch {
    return false
  }
}

function syncIframeTopBarVisibility(useOriginalBilibiliTopBar: boolean) {
  const iframeWindow = iframeRef.value?.contentWindow
  if (!iframeWindow)
    return

  // 同源时直接同步类名，避免 iframe 消息监听器尚未就绪时短暂显示原版顶栏
  try {
    iframeWindow.document.documentElement.classList.toggle('remove-top-bar', !useOriginalBilibiliTopBar)
  }
  catch {
    // 跨域页面继续使用 postMessage 同步
  }

  try {
    postMessageToIframe(iframeRef.value, {
      type: IFRAME_TOP_BAR_CHANGE,
      useOriginalBilibiliTopBar,
    })
  }
  catch (error) {
    console.warn('Failed to send top bar change message to iframe:', error)
  }
}

watch([isDark, isOledDark], ([newValue, newOledValue]) => {
  if (iframeRef.value?.contentWindow) {
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
  }
})

watch(() => settingsStore.getEffectiveTopBarSource(), (source) => {
  const newValue = showNativeBilibiliTopBar(source)
  syncIframeTopBarVisibility(newValue)
}, { immediate: true })

// 监听深色模式基准颜色变化
watch(() => settings.value.darkModeBaseColor, (newColor) => {
  if (iframeRef.value?.contentWindow && isDark.value) {
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
  }
})

// watch(() => props.url, () => {
//   showIframe.value = false
// })

// Only show loading animation after 1.5 seconds to prevent annoying flash when content loads quickly
const showLoadingTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

function clearLifecycleTimers() {
  if (showLoadingTimeout.value !== null) {
    clearTimeout(showLoadingTimeout.value)
    showLoadingTimeout.value = null
  }
  if (initialThemeTimer !== null) {
    clearTimeout(initialThemeTimer)
    initialThemeTimer = null
  }
}

// 处理iframe加载完成事件
function handleIframeLoad(event: Event) {
  const iframe = event.currentTarget
  if (!(iframe instanceof HTMLIFrameElement)
    || iframe !== iframeRef.value
    || currentUrl.value === 'about:blank') {
    return
  }

  markIframeReadyForMessaging(iframe)
  // 清除loading状态
  if (showLoadingTimeout.value !== null) {
    clearTimeout(showLoadingTimeout.value)
    showLoadingTimeout.value = null
  }
  showLoading.value = false

  setupIframeScrollSync()
  syncIframeTopBarVisibility(shouldUseOriginalBilibiliTopBar())

  // 当iframe加载完成后，发送当前的黑暗模式状态（仅在跨域时需要）
  if (iframeRef.value?.contentWindow) {
    const generation = iframeGeneration
    const iframeWindow = iframe.contentWindow
    if (!iframeWindow)
      return
    if (initialThemeTimer !== null)
      clearTimeout(initialThemeTimer)
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
        syncIframeTopBarVisibility(shouldUseOriginalBilibiliTopBar())
      }
      catch (error) {
        console.warn('Failed to send initial dark mode state to iframe:', error)
      }
    }, 100) // 减少延迟，因为iframe已经触发了load事件
  }
}

watch(() => props.url, (url) => {
  // URL变化时启动loading逻辑，但保持iframe可见以避免样式计算错误
  iframeGeneration++
  currentUrl.value = url
  cleanupIframeScrollSync()
  clearLifecycleTimers()
  showLoadingTimeout.value = setTimeout(() => {
    showLoading.value = true
  }, 1500)
})

onMounted(() => {
  // 第一次加载时启动loading逻辑
  showLoadingTimeout.value = setTimeout(() => {
    showLoading.value = true
  }, 1500)

  nextTick(() => {
    iframeRef.value?.focus()
  })
})

onBeforeUnmount(() => {
  clearLifecycleTimers()
  void releaseIframeResources()
})

async function releaseIframeResources() {
  iframeGeneration++
  clearLifecycleTimers()
  cleanupIframeScrollSync()
  reachTop.value = true

  // Clear iframe content
  const iframe = iframeRef.value
  stopIframeMedia(iframe)
  currentUrl.value = 'about:blank'
  /**
   * eg: When use 'iframeRef.value?.contentWindow?.document' of t.bilibili.com iframe on bilibili.com, there may be cross domain issues
   * set the src to 'about:blank' to avoid this issue, it also can release the memory
   */
  if (iframe)
    iframe.src = 'about:blank'
  await nextTick()
  try {
    iframe?.contentWindow?.close()
  }
  catch {
    // Cross-origin frames are already being released through about:blank.
  }

  // Remove iframe from the DOM
  iframe?.parentNode?.removeChild(iframe)
  await nextTick()

  // Nullify the reference
  if (iframeRef.value === iframe)
    iframeRef.value = null
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
    // Cross-origin frames are released by navigating to about:blank.
  }
}

function handleBackToTop() {
  if (iframeRef.value) {
    iframeRef.value.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function handleRefresh() {
  if (iframeRef.value) {
    iframeRef.value.contentWindow?.location.reload()
  }
}

defineExpose({
  handleBackToTop,
  handleRefresh,
})
</script>

<template>
  <div
    pos="relative top-0 left-0" of-hidden w-full h-full
  >
    <Transition name="fade">
      <Loading v-if="showLoading" w-full h-full pos="absolute top-0 left-0" />
    </Transition>
    <!-- Iframe -->
    <iframe
      ref="iframeRef"
      :src="currentUrl"
      :style="{
        bottom: headerShow ? `var(--bew-top-bar-height)` : '0',
      }"
      frameborder="0"
      pointer-events-auto
      pos="absolute left-0"
      w-inherit h-inherit
      @load="handleIframeLoad"
    />
  </div>
</template>
