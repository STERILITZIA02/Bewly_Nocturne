import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReadonly, shallowRef } from 'vue'

import type { DisplayMoment } from '~/components/MomentCard/types'
import { getMomentOriginalImageUrl } from '~/components/MomentCard/utils'
import { useBewlyApp } from '~/composables/useAppProvider'
import { BEWLY_DRAWER_CLOSE_REQUEST, BEWLY_DRAWER_ESCAPE_HANDLED } from '~/constants/globalEvents'
import { MOMENTS_DETAIL_LAYOUT } from '~/constants/layout'
import { settings } from '~/logic'
import { shouldContinueIframeFocusRetry } from '~/utils/iframeFocusRetryPolicy'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '~/utils/iframeMessage'
import { releaseIframeMedia } from '~/utils/mediaResources'
import { normalizeMomentRemoteUrl as httpsUrl } from '~/utils/momentUrl'
import { openLinkInBackground } from '~/utils/tabs'
import { recordVideoVisit } from '~/utils/videoVisitHistory'

/** Owns the detail frame, gallery, focus and navigation lifecycle. */
export function useMomentDetail(getImageRatio: (moment: DisplayMoment) => number, beforeOpen: () => void) {
  const { mainAppRef } = useBewlyApp()
  let disposed = false
  const selectedMoment = ref<DisplayMoment | null>(null)
  const detailFrameUrl = ref('')
  const detailFrameLoaded = ref(false)
  const detailIframeRef = ref<HTMLIFrameElement | null>(null)
  const detailIframeGenerations = new WeakMap<HTMLIFrameElement, number>()
  let detailFrameGeneration = 0
  const detailImageViewerRef = ref<HTMLElement | null>(null)
  const detailImageViewerOpen = ref(false)
  const detailImageViewerUrls = ref<string[]>([])
  const detailImageViewerIndex = ref(0)
  const detailImageViewerScale = ref(1)
  const detailImageViewerRotation = ref(0)
  const detailImageViewerPanX = ref(0)
  const detailImageViewerPanY = ref(0)
  const detailImageViewerSource = shallowRef<Window | null>(null)
  const detailImageViewerTrigger = shallowRef<HTMLElement | null>(null)
  let detailLoadTimer: ReturnType<typeof setTimeout> | null = null
  let detailFocusRetryTimer: ReturnType<typeof setTimeout> | null = null
  let detailFocusRetryRaf = 0
  let detailFocusGeneration = 0
  let detailFocusOrigin: Element | null = null
  const DETAIL_FOCUS_MAX_ATTEMPTS = 4
  const DETAIL_FOCUS_RETRY_DELAY = 120
  const DETAIL_FOCUS_DEADLINE = 720
  const detailImageViewerDragging = ref(false)
  let detailImageViewerDragStartX = 0
  let detailImageViewerDragStartY = 0
  let detailImageViewerDragOriginX = 0
  let detailImageViewerDragOriginY = 0
  const isOpusDetailMoment = computed(() => Boolean(selectedMoment.value && !isPlayerMoment(selectedMoment.value)))
  const detailViewportGutter = MOMENTS_DETAIL_LAYOUT.viewportGutter * 2
  const detailViewportSafeWidth = `calc(100vw - ${detailViewportGutter}px)`
  const detailReferenceHeight = 'min(88dvh, 49.5vw)'
  const detailSafeHeight = `min(calc(100dvh - ${detailViewportGutter}px), max(${MOMENTS_DETAIL_LAYOUT.playerMinHeight}px, ${detailReferenceHeight}))`
  const detailPlayerMaxWidth = `min(${MOMENTS_DETAIL_LAYOUT.playerViewportScale * 100}vw, calc(${MOMENTS_DETAIL_LAYOUT.playerViewportScale * 100}dvh * 16 / 9), ${detailViewportSafeWidth})`
  const opusDetailCommentPageRatio = 0.29
  const opusDetailMaxWidth = `min(90vw, ${detailViewportSafeWidth})`
  const opusSplitDetailBaseWidth = `${opusDetailCommentPageRatio * 200}vw`
  const opusDetailMaxHeight = `min(calc(100dvh - ${detailViewportGutter}px), max(${MOMENTS_DETAIL_LAYOUT.playerMinHeight}px, 88dvh), ${opusDetailMaxWidth})`
  const detailDialogHeight = computed(() => (
    isOpusSplitDetailMoment(selectedMoment.value) ? opusDetailMaxHeight : detailSafeHeight
  ))
  const detailDialogWidth = computed(() => {
    if (selectedMoment.value?.isLive)
      return detailPlayerMaxWidth
    const moment = selectedMoment.value
    if (isOpusSplitDetailMoment(moment)) {
      const commentWidth = `${opusDetailCommentPageRatio * 100}vw`
      const contentWidth = `calc(${getOpusSplitLayoutRatio(moment)} * ${detailDialogHeight.value} + ${commentWidth})`
      return `min(${opusDetailMaxWidth}, max(${opusSplitDetailBaseWidth}, ${contentWidth}))`
    }
    return `min(${MOMENTS_DETAIL_LAYOUT.opusMaxWidth}px, ${detailViewportSafeWidth})`
  })
  const detailContentHeight = computed(() => detailDialogHeight.value)
  const detailImageViewerUrl = computed(() => detailImageViewerUrls.value[detailImageViewerIndex.value] || '')
  const detailImageViewerTransform = computed(() => {
    return `translate3d(${detailImageViewerPanX.value}px, ${detailImageViewerPanY.value}px, 0) scale(${detailImageViewerScale.value}) rotate(${detailImageViewerRotation.value}deg)`
  })
  function getDetailImageUrlKey(url: string) {
    const path = httpsUrl(url.trim())
      .replace(/@[^/?#]*(?=[?#]|$)/, '')
      .split(/[?#]/, 1)[0]
    const isGif = /\.gif$/i.test(path)
    return `${path.replace(/\.(?:avif|webp|gif|jpe?g|png)$/i, '').toLowerCase()}|${isGif ? 'gif' : 'static'}`
  }

  function isOriginalDetailImageUrl(url: string) {
    return /\.(?:gif|jpe?g|png)$/i.test(url.split(/[?#]/, 1)[0])
  }

  function normalizeDetailImageViewerPayload(value: unknown, requestedIndex: unknown) {
    const urls: string[] = []
    const urlIndexes = new Map<string, number>()
    const sourceIndexes: number[] = []
    if (Array.isArray(value)) {
      value.forEach((rawUrl, sourceIndex) => {
        if (typeof rawUrl !== 'string' || !rawUrl.trim())
          return
        const url = httpsUrl(rawUrl.trim())
        const key = getDetailImageUrlKey(url)
        const existingIndex = urlIndexes.get(key)
        if (existingIndex !== undefined) {
          sourceIndexes[sourceIndex] = existingIndex
          if (isOriginalDetailImageUrl(url) && !isOriginalDetailImageUrl(urls[existingIndex]))
            urls[existingIndex] = url
          return
        }
        urlIndexes.set(key, urls.length)
        sourceIndexes[sourceIndex] = urls.length
        urls.push(url)
      })
    }

    const limitedUrls = urls.slice(0, 100)
    const sourceIndex = Number(requestedIndex)
    const mappedIndex = Number.isInteger(sourceIndex) ? sourceIndexes[sourceIndex] : undefined
    return {
      index: mappedIndex === undefined
        ? Math.min(limitedUrls.length - 1, Math.max(0, Number(requestedIndex) || 0))
        : Math.min(limitedUrls.length - 1, mappedIndex),
      urls: limitedUrls,
    }
  }

  function resolveVideoUrl(moment: DisplayMoment) {
    if (moment.videoUrl)
      return moment.videoUrl
    if (moment.bvid)
      return `https://www.bilibili.com/video/${moment.bvid}`
    if (moment.aid)
      return `https://www.bilibili.com/video/av${moment.aid}`
    return ''
  }

  function resolveLiveUrl(moment: DisplayMoment) {
    if (!moment.roomId)
      return ''
    return `https://live.bilibili.com/${moment.roomId}`
  }

  function resolveDetailUrl(moment: DisplayMoment) {
  // Forwarded/live and article cards own an opus detail URL. Resolve that
  // before embedded media so the card never leaves its source dynamic.
    if (moment.isForward || moment.isArticle) {
      try {
        const url = new URL(moment.url)
        if (moment.isForward)
          url.searchParams.set('bewly_opus_plain', '1')
        if (moment.isArticle)
          url.searchParams.set('bewly_opus_article', '1')
        return url.toString()
      }
      catch {
        const join = moment.url.includes('?') ? '&' : '?'
        const params = [
          moment.isForward ? 'bewly_opus_plain=1' : '',
          moment.isArticle ? 'bewly_opus_article=1' : '',
        ].filter(Boolean).join('&')
        return params ? `${moment.url}${join}${params}` : moment.url
      }
    }
    if (moment.isLive) {
      const liveUrl = resolveLiveUrl(moment)
      if (liveUrl)
        return liveUrl
    }
    if (moment.isVideo) {
      const videoUrl = resolveVideoUrl(moment)
      if (videoUrl)
        return videoUrl
    }
    return moment.url
  }

  function clearDetailLoadTimer() {
    if (detailLoadTimer) {
      clearTimeout(detailLoadTimer)
      detailLoadTimer = null
    }
  }

  function clearDetailFocusRetry() {
    detailFocusGeneration++
    if (detailFocusRetryTimer) {
      clearTimeout(detailFocusRetryTimer)
      detailFocusRetryTimer = null
    }
    if (detailFocusRetryRaf) {
      cancelAnimationFrame(detailFocusRetryRaf)
      detailFocusRetryRaf = 0
    }
  }

  function bindDetailIframe(element: Element | ComponentPublicInstance | null) {
    if (!(element instanceof HTMLIFrameElement))
      return
    detailIframeRef.value = element
    detailIframeGenerations.set(element, detailFrameGeneration)
  }

  function getDetailActiveElement(iframe: HTMLIFrameElement | null = detailIframeRef.value) {
    const root = iframe?.getRootNode() ?? mainAppRef.value?.getRootNode()
    if (root instanceof Document || root instanceof ShadowRoot)
      return root.activeElement
    return document.activeElement
  }

  function shouldYieldDetailFocus(iframe: HTMLIFrameElement) {
    const active = getDetailActiveElement(iframe)
    return Boolean(
      active
      && active !== document.body
      && active !== document.documentElement
      && active !== iframe
      && active !== detailFocusOrigin,
    )
  }

  async function focusDetailIframe(iframe: HTMLIFrameElement) {
    clearDetailFocusRetry()
    const generation = detailFocusGeneration
    const startedAt = performance.now()
    let attemptCount = 0

    const canContinue = () => Boolean(
      selectedMoment.value
      && detailFrameUrl.value
      && shouldContinueIframeFocusRetry({
        attemptCount,
        maxAttempts: DETAIL_FOCUS_MAX_ATTEMPTS,
        elapsedMs: performance.now() - startedAt,
        deadlineMs: DETAIL_FOCUS_DEADLINE,
        cancelled: generation !== detailFocusGeneration,
        iframeReplaced: iframe !== detailIframeRef.value,
        viewerOpen: detailImageViewerOpen.value,
        userMovedFocus: shouldYieldDetailFocus(iframe),
      }),
    )

    const attempt = async () => {
      if (!canContinue())
        return

      await nextTick()
      if (!canContinue())
        return

      detailFocusRetryRaf = requestAnimationFrame(() => {
        detailFocusRetryRaf = 0
        if (!canContinue())
          return

        attemptCount++
        iframe.focus({ preventScroll: true })
        try {
          iframe.contentWindow?.focus()
        }
        catch {
        // Cross-origin frames may reject window focus; the element focus remains.
        }

        // Once the parent active element is the iframe, focus is established.
        // Retrying after that could steal focus from controls inside the frame.
        if (getDetailActiveElement(iframe) !== iframe && canContinue()) {
          detailFocusRetryTimer = setTimeout(() => {
            detailFocusRetryTimer = null
            void attempt()
          }, DETAIL_FOCUS_RETRY_DELAY)
        }
      })
    }

    await attempt()
  }

  function syncDetailFrameViewport() {
    const iframe = detailIframeRef.value
    if (!iframe || !detailFrameUrl.value)
      return
    postMessageToIframe(iframe, {
      type: 'BEWLY_OPUS_VIEWPORT',
      width: window.innerWidth,
    })
  }

  function isPlayerMoment(moment: DisplayMoment | null | undefined) {
    return Boolean(moment?.isVideo || moment?.isLive)
  }

  function isOpusSplitDetailMoment(moment: DisplayMoment | null | undefined) {
    return Boolean(
      moment
      && !isPlayerMoment(moment)
      && !moment.isArticle
      && !moment.isForward
      && moment.images.length > 0,
    )
  }

  function getOpusSplitLayoutRatio(moment: DisplayMoment | null | undefined) {
    if (!moment)
      return 1
    return getImageRatio(moment)
  }

  function resetDetailImageViewerTransform() {
    detailImageViewerScale.value = 1
    detailImageViewerRotation.value = 0
    detailImageViewerPanX.value = 0
    detailImageViewerPanY.value = 0
  }

  function setDetailImageViewerScale(scale: number) {
    detailImageViewerScale.value = Math.min(4, Math.max(0.25, scale))
    if (detailImageViewerScale.value <= 1) {
      detailImageViewerPanX.value = 0
      detailImageViewerPanY.value = 0
    }
  }

  function showDetailImageViewerImage(index: number) {
    const count = detailImageViewerUrls.value.length
    if (!count)
      return
    detailImageViewerIndex.value = ((index % count) + count) % count
    resetDetailImageViewerTransform()
  }

  function openDetailImageViewer(
    value: unknown,
    requestedIndex: unknown,
    source: Window | null = null,
    trigger: HTMLElement | null = null,
  ) {
    const { index, urls } = normalizeDetailImageViewerPayload(value, requestedIndex)
    if (!urls.length)
      return false

    detailImageViewerUrls.value = urls
    detailImageViewerIndex.value = index
    detailImageViewerSource.value = source
    detailImageViewerTrigger.value = trigger
    detailImageViewerOpen.value = true
    document.documentElement.classList.add('bewly-moment-image-viewer-open')
    clearDetailFocusRetry()
    resetDetailImageViewerTransform()
    const generation = detailFrameGeneration
    nextTick(() => {
      if (!disposed && generation === detailFrameGeneration && detailImageViewerOpen.value)
        detailImageViewerRef.value?.focus({ preventScroll: true })
    })
    return true
  }

  function openMomentImagePreview(images: string[], index: number, trigger: HTMLElement) {
    openDetailImageViewer(images.map(getMomentOriginalImageUrl), index, null, trigger)
  }

  function closeDetailImageViewer() {
    if (!detailImageViewerOpen.value)
      return

    try {
      postMessageToIframe(detailIframeRef.value, {
        type: 'BEWLY_OPUS_IMAGE_VIEWER_CLOSE',
        index: detailImageViewerIndex.value,
      })
    }
    catch {
    // iframe 已销毁时忽略
    }
    detailImageViewerOpen.value = false
    document.documentElement.classList.remove('bewly-moment-image-viewer-open')
    detailImageViewerUrls.value = []
    const source = detailImageViewerSource.value
    const trigger = detailImageViewerTrigger.value
    detailImageViewerSource.value = null
    detailImageViewerTrigger.value = null
    detailImageViewerDragging.value = false
    resetDetailImageViewerTransform()
    const generation = detailFrameGeneration
    nextTick(() => {
      if (disposed || generation !== detailFrameGeneration || detailImageViewerOpen.value)
        return
      if (source)
        detailIframeRef.value?.focus({ preventScroll: true })
      else
        trigger?.focus({ preventScroll: true })
    })
  }

  function handleDetailImageViewerWheel(event: WheelEvent) {
    const delta = event.deltaY || event.deltaX
    if (!delta)
      return
    setDetailImageViewerScale(detailImageViewerScale.value * (delta < 0 ? 1.15 : 0.87))
  }

  function handleDetailImageViewerPointerDown(event: PointerEvent) {
    if (detailImageViewerScale.value <= 1)
      return
    event.preventDefault()
    detailImageViewerDragging.value = true
    detailImageViewerDragStartX = event.clientX
    detailImageViewerDragStartY = event.clientY
    detailImageViewerDragOriginX = detailImageViewerPanX.value
    detailImageViewerDragOriginY = detailImageViewerPanY.value
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function handleDetailImageViewerPointerMove(event: PointerEvent) {
    if (!detailImageViewerDragging.value)
      return
    detailImageViewerPanX.value = detailImageViewerDragOriginX + event.clientX - detailImageViewerDragStartX
    detailImageViewerPanY.value = detailImageViewerDragOriginY + event.clientY - detailImageViewerDragStartY
  }

  function handleDetailImageViewerPointerEnd(event: PointerEvent) {
    if (!detailImageViewerDragging.value)
      return
    detailImageViewerDragging.value = false
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    }
    catch {
    // 指针已经释放时忽略
    }
  }

  function handleDetailImageViewerDoubleClick() {
    if (detailImageViewerScale.value > 1)
      resetDetailImageViewerTransform()
    else
      setDetailImageViewerScale(2)
  }

  function handleDetailImageViewerKeydown(event: KeyboardEvent) {
    if (!detailImageViewerOpen.value)
      return

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      closeDetailImageViewer()
    }
    else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopImmediatePropagation()
      showDetailImageViewerImage(detailImageViewerIndex.value - 1)
    }
    else if (event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopImmediatePropagation()
      showDetailImageViewerImage(detailImageViewerIndex.value + 1)
    }
    else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      event.stopImmediatePropagation()
      setDetailImageViewerScale(detailImageViewerScale.value + 0.25)
    }
    else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      event.stopImmediatePropagation()
      setDetailImageViewerScale(detailImageViewerScale.value - 0.25)
    }
    else if (event.key === '0') {
      event.preventDefault()
      event.stopImmediatePropagation()
      resetDetailImageViewerTransform()
    }
  }

  function shouldOpenMomentExternally(moment: DisplayMoment) {
    return moment.isLive
      || settings.value.momentsCardOpenMode === 'newTab'
      || settings.value.momentsCardOpenMode === 'background'
      || window.innerWidth <= MOMENTS_DETAIL_LAYOUT.dialogMinWidth
  }

  function openMomentInNewTab(moment: DisplayMoment, background = false) {
    const url = resolveDetailUrl(moment) || moment.url
    if (!url)
      return

    beforeOpen()
    if (background)
      void openLinkInBackground(url)
    else
      window.open(url, '_blank', 'noopener,noreferrer')
  }

  function openDetailFrameInNewTab() {
    const url = detailFrameUrl.value
    if (!url)
      return

    const newWindow = window.open('about:blank', '_blank')
    if (!newWindow)
      return

    try {
      newWindow.opener = null
      newWindow.location.replace(url)
      closeMomentDetail()
    }
    catch {
      newWindow.close()
    }
  }

  function openMomentDetail(moment: DisplayMoment, forceDialog = false) {
    if (disposed)
      return
    if (moment.isVideo && !moment.isLive) {
      recordVideoVisit(moment)
      openMomentInNewTab(moment)
      return
    }

    // 小屏、直播与「新标签/后台标签」设置：外部打开，避免狭窄 Dialog 与跨域直播占用
    if (!forceDialog && shouldOpenMomentExternally(moment)) {
      openMomentInNewTab(moment, settings.value.momentsCardOpenMode === 'background')
      return
    }

    // 若已有详情在开，先销毁旧 iframe，避免叠内存
    if (selectedMoment.value || detailFrameUrl.value)
      destroyDetailIframe()

    clearDetailFocusRetry()
    detailFocusOrigin = getDetailActiveElement()
    detailFrameGeneration += 1
    selectedMoment.value = moment
    detailFrameUrl.value = resolveDetailUrl(moment)
    detailFrameLoaded.value = false
    // 打开详情时释放悬停预览资源
    beforeOpen()
    clearDetailLoadTimer()
    // 视频/直播、转发：load 后即可；图文等待布局 ready
    // 兜底避免遮罩卡住
    const fallbackMs = isPlayerMoment(moment)
      ? 1800
      : moment.isForward
        ? 1200
        : 4500
    const generation = detailFrameGeneration
    const frameUrl = detailFrameUrl.value
    detailLoadTimer = setTimeout(() => {
      if (generation === detailFrameGeneration && frameUrl === detailFrameUrl.value && selectedMoment.value)
        detailFrameLoaded.value = true
    }, fallbackMs)
  }

  function handleDetailIframeLoad(event: Event) {
    const iframe = event.target as HTMLIFrameElement | null
    const frameUrl = detailFrameUrl.value
    if (!iframe
      || iframe !== detailIframeRef.value
      || !selectedMoment.value
      || !frameUrl
      || iframe.getAttribute('src') !== frameUrl
      || detailIframeGenerations.get(iframe) !== detailFrameGeneration) {
      return
    }

    clearDetailLoadTimer()
    // Ready identity is established before viewport/focus messages are sent.
    markIframeReadyForMessaging(iframe)
    syncDetailFrameViewport()
    void focusDetailIframe(iframe)

    // 与抽屉一致：同域时去掉顶栏占位，并保证视频/直播页可滚动
    const win = iframe?.contentWindow
    if (win) {
      try {
        const doc = win.document
        if (doc) {
          doc.documentElement.classList.add('remove-top-bar-without-placeholder')
          doc.documentElement.style.setProperty('overflow-x', 'hidden', 'important')
          doc.documentElement.style.setProperty('overflow-y', 'auto', 'important')
          if (doc.body) {
            doc.body.style.setProperty('overflow-x', 'hidden', 'important')
            doc.body.style.setProperty('overflow-y', 'auto', 'important')
            doc.body.style.setProperty('height', 'auto', 'important')
          }
        }
      }
      catch {
      // 跨域（如 live.bilibili.com）无法注入，依赖 iframe 默认滚动
      }
    }

    // 视频/直播、转发：load 后立即显示，不做「整理动态」等待
    if (isPlayerMoment(selectedMoment.value) || selectedMoment.value?.isForward) {
      detailFrameLoaded.value = true
      return
    }

    // 图文/专栏：再给布局一点时间，最终由 BEWLY_OPUS_LAYOUT_READY 解除
    const generation = detailFrameGeneration
    detailLoadTimer = setTimeout(() => {
      if (generation === detailFrameGeneration && frameUrl === detailFrameUrl.value && iframe === detailIframeRef.value)
        detailFrameLoaded.value = true
    }, 2800)
  }

  function destroyDetailIframe() {
    clearDetailFocusRetry()
    clearDetailLoadTimer()
    const iframe = detailIframeRef.value
    detailIframeRef.value = null
    detailFrameGeneration += 1
    if (!iframe)
      return

    // 通知同域 iframe 内部主动释放观察器/媒体
    try {
      postMessageToIframe(iframe, { type: 'BEWLY_OPUS_DISPOSE' })
    }
    catch {
    // ignore
    }

    releaseIframeMedia(iframe)
  }

  function closeMomentDetail() {
    closeDetailImageViewer()
    destroyDetailIframe()
    detailFocusOrigin = null
    selectedMoment.value = null
    detailFrameUrl.value = ''
    detailFrameLoaded.value = false
  }

  function handleDetailFrameMessage(event: MessageEvent) {
    const data = getIframeMessageData(event, detailIframeRef.value)
    if (!data)
      return

    const type = data.type
    if (type === 'BEWLY_OPUS_IMAGE_VIEWER_OPEN') {
      const source = event.source as Window
      if (!openDetailImageViewer(data.urls, data.index, source))
        return
      try {
        source.postMessage({ type: 'BEWLY_OPUS_IMAGE_VIEWER_ACK' }, event.origin)
      }
      catch {
      // iframe 已销毁时忽略
      }
      return
    }
    // 图文详情布局完成后再去掉遮罩
    if (type === 'BEWLY_OPUS_LAYOUT_READY') {
      detailFrameLoaded.value = true
      clearDetailLoadTimer()
      syncDetailFrameViewport()
      return
    }
    // iframe 内 ESC 会 post 该消息；Dialog 场景下同步关闭详情
    if (type === BEWLY_DRAWER_ESCAPE_HANDLED)
      return
    if (type === BEWLY_DRAWER_CLOSE_REQUEST && selectedMoment.value)
      closeMomentDetail()
  }
  onMounted(() => {
    window.addEventListener('message', handleDetailFrameMessage)
    window.addEventListener('resize', syncDetailFrameViewport)
  })
  onBeforeUnmount(() => {
    disposed = true
    window.removeEventListener('message', handleDetailFrameMessage)
    window.removeEventListener('resize', syncDetailFrameViewport)
    closeMomentDetail()
  })
  return {
    selectedMoment: shallowReadonly(selectedMoment),
    detailFrameUrl,
    detailFrameLoaded,
    detailImageViewerRef,
    detailImageViewerOpen,
    detailImageViewerUrls,
    detailImageViewerIndex,
    detailImageViewerScale,
    detailImageViewerRotation,
    detailImageViewerDragging,
    isOpusDetailMoment,
    detailDialogHeight,
    detailDialogWidth,
    detailContentHeight,
    detailImageViewerUrl,
    detailImageViewerTransform,
    clearDetailFocusRetry,
    bindDetailIframe,
    resetDetailImageViewerTransform,
    setDetailImageViewerScale,
    showDetailImageViewerImage,
    openMomentImagePreview,
    closeDetailImageViewer,
    handleDetailImageViewerWheel,
    handleDetailImageViewerPointerDown,
    handleDetailImageViewerPointerMove,
    handleDetailImageViewerPointerEnd,
    handleDetailImageViewerDoubleClick,
    handleDetailImageViewerKeydown,
    openDetailFrameInNewTab,
    openMomentDetail,
    handleDetailIframeLoad,
    closeMomentDetail,
    updateMoment(moment: DisplayMoment) { selectedMoment.value = moment },
  }
}
