import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'

const SCRUB_START_THRESHOLD_PX = 18
const NEARBY_SEEK_RANGE_SECONDS = 30
const SCRUB_SEEK_INTERVAL_MS = 120
const NATIVE_MEDIA_CONTROL_HEIGHT = 40

/** Shared gesture only. Media transport/readiness remains with each preview's existing owner. */
export function useVideoPreviewSwipeSeek(
  videoRef: Ref<HTMLVideoElement | null>,
  enabled: Readonly<Ref<boolean>>,
  controls: Readonly<Ref<boolean>>,
  source: Readonly<Ref<string>>,
) {
  const isScrubbing = ref(false)
  const scrubProgress = ref(0)
  let disposed = false
  let pointerId: number | undefined
  let surface: HTMLElement | undefined
  let video: HTMLVideoElement | undefined
  let sourceKey = ''
  let mediaSource = ''
  let startX = 0
  let startY = 0
  let startTime = 0
  let width = 0
  let pendingTime: number | undefined
  let seekTimer: ReturnType<typeof setTimeout> | undefined
  let seekFrame: number | undefined
  let clickTimer: ReturnType<typeof setTimeout> | undefined
  let suppressClick = false
  let lastSeek = 0

  const isCurrent = () => !disposed && enabled.value && video === videoRef.value && sourceKey === source.value
    && mediaSource === (video?.currentSrc || video?.getAttribute('src') || '')

  function clearSeek() {
    clearTimeout(seekTimer)
    seekTimer = undefined
    if (seekFrame !== undefined)
      cancelAnimationFrame(seekFrame)
    seekFrame = undefined
  }

  function resetPreviewScrub() {
    clearSeek()
    if (pointerId !== undefined && surface?.hasPointerCapture(pointerId))
      surface.releasePointerCapture(pointerId)
    pointerId = undefined
    surface = undefined
    video = undefined
    pendingTime = undefined
    isScrubbing.value = false
  }

  function seek() {
    if (!isCurrent() || pendingTime === undefined || !video)
      return
    video.currentTime = pendingTime
    lastSeek = performance.now()
  }

  function scheduleSeek(time: number) {
    pendingTime = time
    scrubProgress.value = time / video!.duration * 100
    const elapsed = performance.now() - lastSeek
    if (elapsed >= SCRUB_SEEK_INTERVAL_MS) {
      clearSeek()
      seek()
    }
    else if (seekTimer === undefined && seekFrame === undefined) {
      seekTimer = setTimeout(() => {
        seekTimer = undefined
        seekFrame = requestAnimationFrame(() => {
          seekFrame = undefined
          if (isScrubbing.value)
            seek()
        })
      }, SCRUB_SEEK_INTERVAL_MS - elapsed)
    }
  }

  function handlePreviewPointerDown(event: PointerEvent) {
    suppressClick = false
    clearTimeout(clickTimer)
    clickTimer = undefined
    if (disposed || !enabled.value || event.button !== 0 || !videoRef.value || !(event.currentTarget instanceof HTMLElement))
      return
    const media = videoRef.value
    if (!Number.isFinite(media.duration) || media.duration <= 0 || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || (controls.value && event.clientY >= rect.bottom - NATIVE_MEDIA_CONTROL_HEIGHT))
      return
    resetPreviewScrub()
    pointerId = event.pointerId
    surface = event.currentTarget
    video = media
    sourceKey = source.value
    mediaSource = media.currentSrc || media.getAttribute('src') || ''
    startX = event.clientX
    startY = event.clientY
    startTime = media.currentTime
    width = rect.width
    lastSeek = 0
  }

  function handlePreviewPointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId)
      return
    if (!isCurrent()) {
      disposeSwipeSeek()
      return
    }
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!isScrubbing.value) {
      if (Math.abs(dy) >= SCRUB_START_THRESHOLD_PX && Math.abs(dy) >= Math.abs(dx)) {
        resetPreviewScrub()
        return
      }
      if (Math.abs(dx) < SCRUB_START_THRESHOLD_PX)
        return
      surface!.setPointerCapture(event.pointerId)
      isScrubbing.value = true
    }
    const range = Math.min(video!.duration, NEARBY_SEEK_RANGE_SECONDS)
    scheduleSeek(Math.max(0, Math.min(video!.duration, startTime + dx / width * range)))
    event.preventDefault()
    event.stopPropagation()
  }

  function finishPreviewScrub(event: PointerEvent, cancelled = false) {
    if (pointerId !== event.pointerId)
      return
    const dragged = isScrubbing.value
    if (dragged && !cancelled)
      seek()
    resetPreviewScrub()
    if (!dragged)
      return
    suppressClick = true
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => {
      clickTimer = undefined
      suppressClick = false
    }, 0)
    event.preventDefault()
    event.stopPropagation()
  }

  function handlePreviewClick(event: MouseEvent) {
    if (suppressClick) {
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function disposeSwipeSeek() {
    const dragged = isScrubbing.value
    resetPreviewScrub()
    clearTimeout(clickTimer)
    clickTimer = undefined
    // A changed source may cancel before pointerup. Consume that gesture's
    // synthetic click; a fresh pointerdown always starts an intentional action.
    suppressClick = !disposed && (dragged || suppressClick)
  }
  watch([videoRef, enabled, controls, source], disposeSwipeSeek, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    disposeSwipeSeek()
  })
  return {
    isScrubbing,
    scrubProgress,
    resetPreviewScrub,
    disposeSwipeSeek,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    finishPreviewScrub,
    handlePreviewClick,
    handlePreviewDragStart: (event: DragEvent) => event.preventDefault(),
  }
}
