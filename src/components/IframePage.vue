<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useIframeDocumentHost } from '~/composables/useIframeDocumentHost'
import { useIframeImageViewerBridge } from '~/composables/useIframeImageViewerBridge'
import { useLoadingRingPhase } from '~/composables/useLoadingRingPhase'
import { IFRAME_NAVIGATION_ACK, IFRAME_NAVIGATION_REQUEST, IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { useSettingsStore } from '~/stores/settingsStore'
import { showNativeBilibiliTopBar } from '~/utils/effectiveTopBarSource'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '~/utils/iframeMessage'
import { isVideoOrBangumiPage } from '~/utils/main'
import { releaseIframeMedia } from '~/utils/mediaResources'

const props = defineProps<{
  url: string
}>()
const emit = defineEmits<{
  (event: 'photoViewerChange', open: boolean, url: string): void
}>()
const { reachTop } = useBewlyApp()
const { t } = useI18n()
const toast = useToast()
const settingsStore = useSettingsStore()
const headerShow = ref(false)
const iframeRef = ref<HTMLIFrameElement | null>(null)
// Images of an embedded moment page open full window in this document's viewer.
useIframeImageViewerBridge(iframeRef)
const currentUrl = ref<string>(props.url)
const iframeKey = ref(0)

const showLoading = ref<boolean>(false)
const loadingKind = computed(() => isVideoOrBangumiPage(currentUrl.value) ? 'video' : 'page')
// A page ring closes over the ready iframe before the overlay fades.
const loadingPhase = useLoadingRingPhase(() => showLoading.value, () => iframeRef.value)
const iframeScrollCleanupFns = ref<Array<() => void>>([])
const iframeScrollSyncFailed = ref(false)
let iframeGeneration = 0
let commandId = 0
let commandTimer: ReturnType<typeof setTimeout> | null = null

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

  const generation = iframeGeneration
  const handleScroll = () => {
    if (generation === iframeGeneration && iframeRef.value?.contentWindow === iframeWindow)
      updateReachTopFromIframe()
  }
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

const { channel: documentChannel, photoViewerOpen } = useIframeDocumentHost(iframeRef, () => currentUrl.value !== 'about:blank')
watch(photoViewerOpen, open => emit('photoViewerChange', open, currentUrl.value), { flush: 'sync' })

watch(() => settingsStore.getEffectiveTopBarSource(), (source) => {
  const newValue = showNativeBilibiliTopBar(source)
  syncIframeTopBarVisibility(newValue)
}, { immediate: true })

// Only show loading animation after 1.5 seconds to prevent annoying flash when content loads quickly
const showLoadingTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

function clearLifecycleTimers() {
  if (commandTimer !== null) {
    clearTimeout(commandTimer)
    commandTimer = null
  }
  if (showLoadingTimeout.value !== null) {
    clearTimeout(showLoadingTimeout.value)
    showLoadingTimeout.value = null
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
  if (commandTimer !== null) {
    clearTimeout(commandTimer)
    commandTimer = null
  }
  // 清除loading状态
  if (showLoadingTimeout.value !== null) {
    clearTimeout(showLoadingTimeout.value)
    showLoadingTimeout.value = null
  }
  showLoading.value = false

  setupIframeScrollSync()
  syncIframeTopBarVisibility(shouldUseOriginalBilibiliTopBar())
}

function beginNavigation() {
  documentChannel.clear()
  photoViewerOpen.value = false
  iframeGeneration++
  commandId++
  cleanupIframeScrollSync()
  clearLifecycleTimers()
  showLoading.value = false
  const generation = iframeGeneration
  showLoadingTimeout.value = setTimeout(() => {
    if (generation === iframeGeneration)
      showLoading.value = true
  }, 1500)
}

watch(() => props.url, (url) => {
  releaseIframeMedia(iframeRef.value)
  currentUrl.value = url
  iframeKey.value++
  beginNavigation()
})

onMounted(() => {
  beginNavigation()
  window.addEventListener('message', handleNavigationAck)
  const generation = iframeGeneration
  nextTick(() => {
    if (generation === iframeGeneration)
      iframeRef.value?.focus()
  })
})

onBeforeUnmount(() => {
  clearLifecycleTimers()
  window.removeEventListener('message', handleNavigationAck)
  releaseIframeResources()
})

function releaseIframeResources() {
  iframeGeneration++
  clearLifecycleTimers()
  cleanupIframeScrollSync()
  reachTop.value = true

  // Clear iframe content
  const iframe = iframeRef.value
  releaseIframeMedia(iframe)
  currentUrl.value = 'about:blank'
  /**
   * eg: When use 'iframeRef.value?.contentWindow?.document' of t.bilibili.com iframe on bilibili.com, there may be cross domain issues
   * set the src to 'about:blank' to avoid this issue, it also can release the memory
   */
}

function handleBackToTop() {
  const child = iframeRef.value?.contentWindow
  if (!child)
    return
  if (canAccessIframeDocument(child))
    child.scrollTo({ top: 0, behavior: 'smooth' })
  else
    requestChildNavigation('top')
}

function handleRefresh() {
  const child = iframeRef.value?.contentWindow
  if (!child)
    return
  beginNavigation()
  if (canAccessIframeDocument(child))
    child.location.reload()
  else
    requestChildNavigation('reload')
}

function requestChildNavigation(action: 'reload' | 'top') {
  // A scroll request must not replace the acknowledgement deadline of an in-flight reload.
  if (action === 'top' && commandTimer !== null)
    return
  const requestId = ++commandId
  const generation = iframeGeneration
  if (commandTimer !== null)
    clearTimeout(commandTimer)
  const fail = () => {
    commandTimer = null
    if (generation !== iframeGeneration || requestId !== commandId)
      return
    if (action === 'reload') {
      clearLifecycleTimers()
      showLoading.value = false
    }
    toast.error(t('common.operation_failed'))
  }
  if (!postMessageToIframe(iframeRef.value, { type: IFRAME_NAVIGATION_REQUEST, requestId, action })) {
    fail()
    return
  }
  commandTimer = setTimeout(fail, 1500)
}

function handleNavigationAck(event: MessageEvent) {
  const data = getIframeMessageData(event, iframeRef.value)
  if (data?.type !== IFRAME_NAVIGATION_ACK || data.requestId !== commandId)
    return
  if (commandTimer !== null)
    clearTimeout(commandTimer)
  commandTimer = null
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
      <Loading
        v-if="showLoading || (loadingKind === 'page' && loadingPhase !== 'idle')" :kind="loadingKind" :loading="showLoading" class="iframe-page-loading" w-full
        h-full
        pos="absolute top-0 left-0"
      />
    </Transition>
    <!-- Iframe -->
    <iframe
      :key="iframeKey"
      ref="iframeRef"
      :src="currentUrl"
      :style="{
        bottom: headerShow ? `var(--bew-top-bar-height)` : '0',
        visibility: showLoading ? 'hidden' : 'visible',
      }"
      frameborder="0"
      pointer-events-auto
      pos="absolute left-0"
      w-inherit h-inherit
      @load="handleIframeLoad"
    />
  </div>
</template>

<style scoped lang="scss">
.iframe-page-loading {
  z-index: 1;
  background: var(--bew-bg);
}
</style>
