<script setup lang="ts">
import { tabbable } from 'tabbable'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CloseButton from '~/components/CloseButton.vue'
import IconButton from '~/components/IconButton.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import { getMomentThumbnailUrl } from '~/components/MomentCard/utils'
import Tooltip from '~/components/Tooltip.vue'
import type { ActiveImageViewer } from '~/composables/useImageViewer'
import { restoreOverlayFocus } from '~/utils/dialogFocus'
import type { ImageViewerPoint, ImageViewerRect, ImageViewerSize } from '~/utils/imageViewer'
import { clampPan, clampScale, getDetailScale, getFitScale, getMaxScale, getOriginMorph, getPanBounds, IMAGE_VIEWER_ZOOM_STEP, isUsableOrigin, resistPan, wrapImageViewerIndex, zoomPanAt } from '~/utils/imageViewer'
import { holdAnimation } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { subscribeViewportFrame } from '~/utils/viewportGeometry'
import { createWheelStepper, normalizeWheelDelta } from '~/utils/wheelStep'

const props = defineProps<{
  request: ActiveImageViewer
  open: boolean
}>()
const emit = defineEmits<{
  close: []
  /** The leave animation finished; the host may drop the request. */
  closed: []
}>()
const index = defineModel<number>('index', { required: true })
const { t } = useI18n()

/**
 * Chrome geometry in px, mirrored by the stylesheet: the fitted image centres
 * in the area these leave free, while a zoomed image may pan under them.
 */
const CHROME_EDGE = 16
const CHROME_CONTROL = 44
const CHROME_GAP = 12
const FILMSTRIP_HEIGHT = 48
const COMPACT_WIDTH = 640
const DISMISS_DISTANCE = 0.18
const SWIPE_DISTANCE = 0.16
const FLICK_VELOCITY = 0.5
const GESTURE_SLOP = 6

const root = ref<HTMLElement>()
const filmstrip = ref<HTMLElement>()
let image: HTMLImageElement | null = null
const viewport = reactive<ImageViewerSize>({ width: document.documentElement.clientWidth || window.innerWidth, height: document.documentElement.clientHeight || window.innerHeight })

const count = computed(() => props.request.urls.length)
const url = computed(() => props.request.urls[index.value] ?? '')
const compact = computed(() => viewport.width <= COMPACT_WIDTH)
const safeArea = computed<ImageViewerRect>(() => {
  const side = compact.value ? CHROME_GAP : CHROME_EDGE + CHROME_CONTROL + CHROME_GAP
  const top = CHROME_EDGE + CHROME_CONTROL + CHROME_GAP
  const dock = (compact.value ? CHROME_EDGE : CHROME_EDGE * 1.5) + CHROME_CONTROL + CHROME_GAP
  const bottom = dock + (count.value > 1 ? FILMSTRIP_HEIGHT + CHROME_GAP : 0)
  return { left: side, top, width: Math.max(1, viewport.width - side * 2), height: Math.max(1, viewport.height - top - bottom) }
})
const center = computed<ImageViewerPoint>(() => ({
  x: safeArea.value.left + safeArea.value.width / 2,
  y: safeArea.value.top + safeArea.value.height / 2,
}))

// Every image is fetched and decoded once per opening, then shown from cache.
type ImageState = { status: 'loading' } | { status: 'ready', width: number, height: number } | { status: 'error' }
const images = reactive(new Map<string, ImageState>())
const pending = new Map<string, Promise<void>>()
function load(source: string): Promise<void> {
  if (!source)
    return Promise.resolve()
  const state = images.get(source)
  if (state?.status === 'ready' || pending.has(source))
    return pending.get(source) ?? Promise.resolve()
  images.set(source, { status: 'loading' })
  const probe = new Image()
  probe.decoding = 'async'
  const promise = new Promise<void>((resolve) => {
    probe.onload = () => {
      // decode() can reject for valid images (memory pressure); the load already proves it.
      void probe.decode().catch(() => {}).then(() => {
        if (probe.naturalWidth && probe.naturalHeight)
          images.set(source, { status: 'ready', width: probe.naturalWidth, height: probe.naturalHeight })
        else
          images.set(source, { status: 'error' })
        resolve()
      })
    }
    probe.onerror = () => {
      images.set(source, { status: 'error' })
      resolve()
    }
  }).finally(() => pending.delete(source))
  pending.set(source, promise)
  probe.src = source
  return promise
}
function retry() {
  images.delete(url.value)
  void load(url.value)
}

const current = computed(() => images.get(url.value))
const natural = computed<ImageViewerSize | undefined>(() => (
  current.value?.status === 'ready' ? { width: current.value.width, height: current.value.height } : undefined
))
const loading = computed(() => !current.value || current.value.status === 'loading')

// View state of the shown image. `fitted` keeps the scale tied to the fit as
// the window or rotation changes; any zoom detaches it.
const rotation = ref(0)
const fitted = ref(true)
const manualScale = ref(1)
const pan = ref<ImageViewerPoint>({ x: 0, y: 0 })
const swipeX = ref(0)
const dismissY = ref(0)
const smooth = ref(true)
const turns = computed(() => ((rotation.value % 360) + 360) % 360)
const fit = computed(() => natural.value ? getFitScale(natural.value, safeArea.value, turns.value) : 1)
const scale = computed(() => fitted.value ? fit.value : manualScale.value)
const percent = computed(() => Math.round(scale.value * 100))
const dismissProgress = computed(() => Math.min(1, Math.abs(dismissY.value) / (viewport.height * 0.4)))
const canZoomIn = computed(() => Boolean(natural.value) && scale.value < getMaxScale(fit.value) - 0.001)
const canZoomOut = computed(() => Boolean(natural.value) && !fitted.value)

function bounds(nextScale = scale.value) {
  return getPanBounds(natural.value ?? { width: 0, height: 0 }, viewport, center.value, nextScale, turns.value)
}

function resetView() {
  rotation.value = 0
  fitted.value = true
  manualScale.value = 1
  pan.value = { x: 0, y: 0 }
  dismissY.value = 0
}

/** Zooms so the image point under `point` (relative to the resting centre) stays put. */
function zoomTo(next: number, point: ImageViewerPoint = { x: 0, y: 0 }, animate = true) {
  if (!natural.value)
    return
  smooth.value = animate
  const target = clampScale(next, fit.value)
  if (target <= fit.value + 0.0005) {
    fitted.value = true
    pan.value = { x: 0, y: 0 }
    return
  }
  const nextPan = zoomPanAt(pan.value, scale.value, target, point)
  manualScale.value = target
  fitted.value = false
  pan.value = clampPan(nextPan, bounds(target))
}
function relativePoint(event: { clientX: number, clientY: number }): ImageViewerPoint {
  // The viewer is fixed at the viewport origin, so client and viewer coordinates match.
  return { x: event.clientX - center.value.x, y: event.clientY - center.value.y }
}
function toggleDetail(point?: ImageViewerPoint) {
  if (!fitted.value)
    zoomTo(fit.value)
  else
    zoomTo(getDetailScale(fit.value), point)
}
function rotate() {
  smooth.value = true
  rotation.value += 90
  if (!fitted.value) {
    manualScale.value = clampScale(manualScale.value, fit.value)
    pan.value = clampPan(pan.value, bounds())
  }
}

// Navigation: the layer of the outgoing image slides out the way the new one comes from.
let direction: -1 | 0 | 1 = 0
function show(target: number, from: -1 | 0 | 1 = 0) {
  const next = wrapImageViewerIndex(target, count.value)
  if (next === index.value)
    return
  direction = from || (next > index.value ? 1 : -1)
  index.value = next
}
function go(step: -1 | 1) {
  show(index.value + step, step)
}
watch(index, (target) => {
  resetView()
  void load(props.request.urls[target] ?? '').then(() => {
    // Neighbours load after the shown image, so they never compete with it.
    if (count.value > 1 && index.value === target) {
      void load(props.request.urls[wrapImageViewerIndex(target + 1, count.value)])
      void load(props.request.urls[wrapImageViewerIndex(target - 1, count.value)])
    }
  })
  void nextTick(revealThumbnail)
}, { immediate: true })

function revealThumbnail() {
  const strip = filmstrip.value
  const thumb = strip?.children[index.value] as HTMLElement | undefined
  if (!strip || !thumb)
    return
  strip.scrollTo({ left: thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}
function thumbnailOf(source: string) {
  return source.startsWith('blob:') ? source : getMomentThumbnailUrl(source, 96)
}

const imageStyle = computed(() => {
  const size = natural.value
  if (!size)
    return undefined
  const lift = 1 - dismissProgress.value * 0.24
  return {
    width: `${size.width}px`,
    height: `${size.height}px`,
    left: `${center.value.x - size.width / 2}px`,
    top: `${center.value.y - size.height / 2}px`,
    transform: `translate3d(${pan.value.x}px, ${pan.value.y + dismissY.value}px, 0) rotate(${rotation.value}deg) scale(${scale.value * lift})`,
  }
})
const scrimOpacity = computed(() => 1 - dismissProgress.value * 0.85)
const chromeHidden = computed(() => dismissProgress.value > 0)

// --- Open and close -------------------------------------------------------

// Reduced motion (or no Web Animations) switches states without movement.
const animated = !prefersReducedMotion() && typeof HTMLElement.prototype.animate === 'function'
let entered = false
let closing = false
const running = new Set<Animation>()
function track(animation: Animation) {
  running.add(animation)
  holdAnimation(animation)
  void animation.finished.catch(() => {}).finally(() => running.delete(animation))
  return animation
}
function duration(name: string, fallback: number) {
  return root.value ? getMotionDuration(getComputedStyle(root.value), name, fallback) : fallback
}
function easing() {
  return (root.value && getComputedStyle(root.value).getPropertyValue('--bew-ease-standard').trim()) || 'ease-out'
}

function originRect(at: number): ImageViewerRect | undefined {
  const rect = props.request.getOrigin?.(at, props.request.urls[at])
    ?? (at === props.request.startIndex ? props.request.trigger?.getBoundingClientRect() : undefined)
  return isUsableOrigin(rect, viewport) ? rect : undefined
}
const originRadius = (() => {
  if (props.request.originRadius !== undefined)
    return props.request.originRadius
  const trigger = props.request.trigger
  return trigger?.isConnected ? Number.parseFloat(getComputedStyle(trigger).borderTopLeftRadius) || 0 : 0
})()
function fittedRect(size: ImageViewerSize): ImageViewerRect {
  const width = size.width * fit.value
  const height = size.height * fit.value
  return { left: center.value.x - width / 2, top: center.value.y - height / 2, width, height }
}
function morphFrame(size: ImageViewerSize, origin: ImageViewerRect) {
  const morph = getOriginMorph(origin, fittedRect(size), size, originRadius)
  // Same function list as the resting transform, so the two interpolate term by term.
  return { transform: `translate3d(${morph.dx}px, ${morph.dy}px, 0) rotate(0deg) scale(${fit.value * morph.scale})`, clipPath: morph.clip }
}
const restingClip = 'inset(0px 0px round 0px)'

function fadeChrome(entering: boolean) {
  const targets = root.value?.querySelectorAll<HTMLElement>(':scope > .bew-image-viewer__scrim, :scope > .bew-image-viewer__chrome')
  targets?.forEach((target) => {
    const from = getComputedStyle(target).opacity
    track(target.animate(
      [{ opacity: entering ? 0 : from }, { opacity: entering ? 1 : 0 }],
      { duration: duration(entering ? '--bew-duration-moderate' : '--bew-duration-normal', 240), easing: 'linear', fill: entering ? 'none' : 'forwards' },
    ))
  })
}

/** The first image grows out of its thumbnail; without one it settles in from a slight scale. */
function enterImage(element: Element, done: () => void) {
  const size = natural.value
  if (!(element instanceof HTMLImageElement) || !size || !animated) {
    done()
    return
  }
  const origin = entered ? undefined : originRect(index.value)
  const first = !entered
  entered = true
  const frames = origin
    ? [morphFrame(size, origin), { transform: element.style.transform, clipPath: restingClip }]
    : first
      ? [{ opacity: 0, transform: `${element.style.transform} scale(0.96)` }, { opacity: 1, transform: element.style.transform }]
      : [{ opacity: 0 }, { opacity: 1 }]
  const animation = track(element.animate(frames, {
    duration: duration(origin || first ? '--bew-duration-moderate' : '--bew-duration-fast', 300),
    easing: easing(),
  }))
  void animation.finished.catch(() => {}).finally(done)
}

async function close() {
  if (closing)
    return
  closing = true
  if (root.value)
    root.value.inert = true
  releaseGesture()
  restoreOverlayFocus(root.value ?? null, props.request.trigger ?? null)
  document.documentElement.classList.remove('bewly-image-viewer-open')
  if (!animated || !root.value) {
    emit('closed')
    return
  }
  fadeChrome(false)
  const size = natural.value
  if (image && size) {
    const from = getComputedStyle(image).transform
    const origin = turns.value === 0 ? originRect(index.value) : undefined
    const to = origin
      ? morphFrame(size, origin)
      : { opacity: 0, transform: `${from === 'none' ? '' : from} scale(0.94)` }
    track(image.animate([{ transform: from, clipPath: restingClip, opacity: 1 }, to], {
      duration: duration(origin ? '--bew-duration-moderate' : '--bew-duration-normal', 300),
      easing: easing(),
      fill: 'forwards',
    }))
  }
  await Promise.allSettled([...running].map(animation => animation.finished))
  emit('closed')
}
watch(() => props.open, (value) => {
  if (!value)
    void close()
})

// --- Layers ------------------------------------------------------------------

function slideIn(element: Element, done: () => void) {
  if (!direction || !animated) {
    done()
    return
  }
  const animation = track(element.animate(
    [{ transform: `translateX(${direction * 14}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
    { duration: duration('--bew-duration-moderate', 300), easing: easing() },
  ))
  void animation.finished.catch(() => {}).finally(done)
}
function slideOut(element: Element, done: () => void) {
  if (!direction || !animated) {
    done()
    return
  }
  const from = getComputedStyle(element).transform
  const animation = track(element.animate(
    [{ transform: from === 'none' ? 'translateX(0)' : from, opacity: 1 }, { transform: `translateX(${direction * -14}%)`, opacity: 0 }],
    { duration: duration('--bew-duration-moderate', 300), easing: easing(), fill: 'forwards' },
  ))
  void animation.finished.catch(() => {}).finally(done)
}
function bindImage(element: unknown) {
  image = element instanceof HTMLImageElement ? element : null
}

// --- Pointer gestures ---------------------------------------------------------

interface Gesture {
  kind: 'pending' | 'pan' | 'swipe' | 'dismiss' | 'pinch' | 'none'
  pointerType: string
  onImage: boolean
  start: ImageViewerPoint
  startPan: ImageViewerPoint
  startScale: number
  startDistance: number
  startMid: ImageViewerPoint
  last: ImageViewerPoint & { time: number }
  velocity: ImageViewerPoint
}
const pointers = new Map<number, ImageViewerPoint>()
let gesture: Gesture | undefined
let lastTap: (ImageViewerPoint & { time: number }) | undefined
const dragging = ref(false)

function midpoint() {
  const [a, b] = [...pointers.values()]
  return { point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) }
}
function releaseGesture() {
  for (const id of pointers.keys()) {
    if (root.value?.hasPointerCapture(id))
      root.value.releasePointerCapture(id)
  }
  pointers.clear()
  gesture = undefined
  dragging.value = false
}

function handlePointerDown(event: PointerEvent) {
  if ((event.pointerType === 'mouse' && event.button !== 0) || closing)
    return
  const target = event.target as Element
  if (!target.closest('.bew-image-viewer__stage'))
    return
  event.preventDefault()
  root.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2 && natural.value) {
    const { point, distance } = midpoint()
    smooth.value = false
    dragging.value = true
    // A second finger turns a swipe or pull-down that had started into a pinch.
    swipeX.value = 0
    dismissY.value = 0
    gesture = { ...(gesture ?? createGesture(event, target)), kind: 'pinch', startScale: scale.value, startPan: { ...pan.value }, startDistance: distance, startMid: point }
    return
  }
  if (pointers.size === 1)
    gesture = createGesture(event, target)
}
function createGesture(event: PointerEvent, target: Element): Gesture {
  const start = { x: event.clientX, y: event.clientY }
  return {
    kind: 'pending',
    pointerType: event.pointerType,
    onImage: target === image,
    start,
    startPan: { ...pan.value },
    startScale: scale.value,
    startDistance: 0,
    startMid: start,
    last: { ...start, time: event.timeStamp },
    velocity: { x: 0, y: 0 },
  }
}

function handlePointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId) || !gesture)
    return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (gesture.kind === 'pinch') {
    if (pointers.size < 2 || !natural.value)
      return
    const { point, distance } = midpoint()
    const next = Math.min(getMaxScale(fit.value) * 1.15, Math.max(fit.value * 0.7, gesture.startScale * distance / gesture.startDistance))
    const anchored = zoomPanAt(gesture.startPan, gesture.startScale, next, relativePoint({ clientX: gesture.startMid.x, clientY: gesture.startMid.y }))
    manualScale.value = next
    fitted.value = false
    pan.value = { x: anchored.x + point.x - gesture.startMid.x, y: anchored.y + point.y - gesture.startMid.y }
    return
  }
  const elapsed = Math.max(1, event.timeStamp - gesture.last.time)
  gesture.velocity = { x: (event.clientX - gesture.last.x) / elapsed, y: (event.clientY - gesture.last.y) / elapsed }
  gesture.last = { x: event.clientX, y: event.clientY, time: event.timeStamp }
  const dx = event.clientX - gesture.start.x
  const dy = event.clientY - gesture.start.y
  if (gesture.kind === 'pending') {
    if (Math.hypot(dx, dy) < GESTURE_SLOP)
      return
    const touchLike = gesture.pointerType !== 'mouse'
    gesture.kind = !fitted.value && natural.value
      ? 'pan'
      : !touchLike
          ? 'none'
          : Math.abs(dx) > Math.abs(dy)
            ? (count.value > 1 ? 'swipe' : 'none')
            : 'dismiss'
    smooth.value = false
    dragging.value = gesture.kind !== 'none'
  }
  if (gesture.kind === 'pan')
    pan.value = resistPan({ x: gesture.startPan.x + dx, y: gesture.startPan.y + dy }, bounds())
  else if (gesture.kind === 'swipe')
    swipeX.value = dx
  else if (gesture.kind === 'dismiss')
    dismissY.value = dy
}

function handlePointerUp(event: PointerEvent) {
  if (!pointers.delete(event.pointerId) || !gesture)
    return
  if (root.value?.hasPointerCapture(event.pointerId))
    root.value.releasePointerCapture(event.pointerId)
  const finished = gesture
  const cancelled = event.type === 'pointercancel'
  if (finished.kind === 'pinch') {
    if (pointers.size)
      return
    gesture = undefined
    dragging.value = false
    zoomTo(scale.value)
    return
  }
  gesture = undefined
  dragging.value = false
  smooth.value = true
  const dx = event.clientX - finished.start.x
  const dy = event.clientY - finished.start.y
  if (finished.kind === 'pending') {
    if (cancelled)
      return
    // A plain click or tap on the backdrop closes. On the image a mouse uses
    // dblclick; touch has no reliable dblclick, so two quick taps toggle here.
    if (!finished.onImage) {
      emit('close')
    }
    else if (finished.pointerType !== 'mouse') {
      const tap = { x: event.clientX, y: event.clientY, time: event.timeStamp }
      if (lastTap && tap.time - lastTap.time < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 24) {
        lastTap = undefined
        toggleDetail(relativePoint(event))
      }
      else {
        lastTap = tap
      }
    }
  }
  else if (finished.kind === 'pan') {
    pan.value = clampPan(pan.value, bounds())
  }
  else if (finished.kind === 'swipe') {
    const commit = !cancelled && (Math.abs(dx) > viewport.width * SWIPE_DISTANCE || Math.abs(finished.velocity.x) > FLICK_VELOCITY)
    if (commit) {
      // The outgoing layer keeps its swipe offset and continues from there.
      const step = dx < 0 ? 1 : -1
      go(step)
      swipeX.value = 0
    }
    else {
      swipeX.value = 0
    }
  }
  else if (finished.kind === 'dismiss') {
    if (!cancelled && (Math.abs(dy) > viewport.height * DISMISS_DISTANCE || Math.abs(finished.velocity.y) > FLICK_VELOCITY))
      emit('close')
    else
      dismissY.value = 0
  }
}

// --- Wheel and keyboard ----------------------------------------------------------

const sideStepper = createWheelStepper({ oncePerGesture: true })
function handleWheel(event: WheelEvent) {
  if ((event.target as Element).closest('.bew-image-viewer__filmstrip'))
    return
  event.preventDefault()
  if (!natural.value || closing)
    return
  const horizontal = !event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)
  if (horizontal) {
    if (!fitted.value) {
      smooth.value = false
      pan.value = clampPan({ x: pan.value.x - normalizeWheelDelta(event.deltaX, event.deltaMode, viewport.width), y: pan.value.y }, bounds())
    }
    else if (count.value > 1) {
      const step = sideStepper.step(event.deltaX, event.deltaMode, event.timeStamp)
      if (step)
        go(step)
    }
    return
  }
  // Pinch arrives as ctrl+wheel with small deltas; a mouse wheel zooms gently.
  const delta = normalizeWheelDelta(event.deltaY, event.deltaMode, viewport.height)
  zoomTo(scale.value * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0022)), relativePoint(event), false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || closing)
    return
  const key = event.key
  const handled = () => {
    event.preventDefault()
    event.stopPropagation()
  }
  if (key === 'Escape') {
    handled()
    emit('close')
  }
  else if (key === 'Tab') {
    const focusable = root.value ? tabbable(root.value) : []
    if (!focusable.length)
      return
    const position = focusable.indexOf(event.target as HTMLElement)
    const next = event.shiftKey
      ? (position <= 0 ? focusable.length - 1 : position - 1)
      : (position < 0 || position === focusable.length - 1 ? 0 : position + 1)
    handled()
    focusable[next].focus({ preventScroll: true })
  }
  else if ((key === 'ArrowLeft' || key === 'ArrowRight') && count.value > 1) {
    handled()
    go(key === 'ArrowLeft' ? -1 : 1)
  }
  else if ((key === 'Home' || key === 'End') && count.value > 1) {
    handled()
    show(key === 'Home' ? 0 : count.value - 1)
  }
  else if (key === '+' || key === '=') {
    handled()
    zoomTo(scale.value * IMAGE_VIEWER_ZOOM_STEP)
  }
  else if (key === '-' || key === '_') {
    handled()
    zoomTo(scale.value / IMAGE_VIEWER_ZOOM_STEP)
  }
  else if (key === '0') {
    handled()
    zoomTo(fit.value)
  }
  else if (key === '1') {
    handled()
    zoomTo(1)
  }
  else if (key === 'r' || key === 'R') {
    handled()
    rotate()
  }
}

// --- Lifecycle ----------------------------------------------------------------

let stopViewport: (() => void) | undefined
onMounted(() => {
  const scroller = document.scrollingElement as HTMLElement | null
  if (scroller) {
    stopViewport = subscribeViewportFrame(scroller, (geometry, reason) => {
      if (reason !== 'layout')
        return
      smooth.value = false
      viewport.width = geometry.clientWidth
      viewport.height = geometry.clientHeight
      if (!fitted.value) {
        manualScale.value = clampScale(manualScale.value, fit.value)
        pan.value = clampPan(pan.value, bounds())
      }
    })
  }
  // The page's own scrollbar stays visible beside a full-window viewer otherwise.
  document.documentElement.classList.add('bewly-image-viewer-open')
  if (animated)
    fadeChrome(true)
  root.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  stopViewport?.()
  releaseGesture()
  running.forEach(animation => animation.cancel())
  if (!closing)
    document.documentElement.classList.remove('bewly-image-viewer-open')
})
</script>

<template>
  <div
    ref="root"
    class="bew-image-viewer"
    :class="{ 'bew-image-viewer--compact': compact }"
    role="dialog"
    aria-modal="true"
    :aria-label="t('image_viewer.title')"
    tabindex="-1"
    :data-motion="smooth && !dragging ? 'smooth' : 'instant'"
    :data-zoomed="fitted ? undefined : ''"
    :data-dragging="dragging ? '' : undefined"
    @keydown="handleKeydown"
    @wheel="handleWheel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
  >
    <div class="bew-image-viewer__scrim" :style="{ opacity: scrimOpacity }" aria-hidden="true" />
    <div class="bew-image-viewer__stage">
      <Transition :css="false" @enter="slideIn" @leave="slideOut">
        <div :key="index" class="bew-image-viewer__layer" :style="swipeX ? { transform: `translateX(${swipeX}px)` } : undefined">
          <Transition :css="false" appear @enter="enterImage">
            <img
              v-if="natural"
              :ref="bindImage"
              class="bew-image-viewer__image"
              :src="url"
              :alt="request.label ? `${request.label} · ${t('image_viewer.position', { index: index + 1, count })}` : t('image_viewer.position', { index: index + 1, count })"
              :style="imageStyle"
              draggable="false"
              @dblclick.prevent="toggleDetail(relativePoint($event))"
            >
          </Transition>
          <div v-if="current?.status === 'error'" class="bew-image-viewer__error" role="alert">
            <span>{{ t('common.load_failed') }}</span>
            <button type="button" class="bew-image-viewer__retry" @click="retry">
              {{ t('common.retry') }}
            </button>
          </div>
        </div>
      </Transition>
      <LoadingRing class="bew-image-viewer__loading" :loading="loading" size="var(--bew-icon-size-xl)" />
    </div>

    <div class="bew-image-viewer__chrome" :class="{ 'is-hidden': chromeHidden }">
      <CloseButton class="bew-image-viewer__close" :label="t('image_viewer.close')" size="large" variant="overlay" @click="emit('close')" />
      <template v-if="count > 1">
        <IconButton class="bew-image-viewer__nav bew-image-viewer__nav--prev" :label="t('image_viewer.previous')" @click="go(-1)">
          <i class="i-tabler:chevron-left" aria-hidden="true" />
        </IconButton>
        <IconButton class="bew-image-viewer__nav bew-image-viewer__nav--next" :label="t('image_viewer.next')" @click="go(1)">
          <i class="i-tabler:chevron-right" aria-hidden="true" />
        </IconButton>
      </template>

      <div class="bew-image-viewer__dock">
        <div v-if="count > 1" ref="filmstrip" class="bew-image-viewer__filmstrip" role="group" :aria-label="t('image_viewer.thumbnails')">
          <button
            v-for="(source, thumbIndex) in request.urls"
            :key="source"
            type="button"
            class="bew-image-viewer__thumb"
            :class="{ 'is-active': thumbIndex === index }"
            :aria-current="thumbIndex === index ? 'true' : undefined"
            :aria-label="t('image_viewer.position', { index: thumbIndex + 1, count })"
            @click="show(thumbIndex)"
          >
            <img :src="thumbnailOf(source)" alt="" loading="lazy" decoding="async" draggable="false">
          </button>
        </div>
        <div class="bew-image-viewer__toolbar" role="toolbar" :aria-label="t('image_viewer.title')">
          <span v-if="count > 1" class="bew-image-viewer__counter" aria-live="polite">{{ t('image_viewer.position', { index: index + 1, count }) }}</span>
          <span v-if="count > 1" class="bew-image-viewer__divider" aria-hidden="true" />
          <Tooltip :content="t('image_viewer.zoom_out')" placement="top">
            <IconButton class="bew-image-viewer__control" :label="t('image_viewer.zoom_out')" :disabled="!canZoomOut" @click="zoomTo(scale / IMAGE_VIEWER_ZOOM_STEP)">
              <i class="i-tabler:zoom-out" aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip :content="t(fitted ? 'image_viewer.actual_size' : 'image_viewer.fit')" placement="top">
            <button
              type="button"
              class="bew-image-viewer__percent"
              :aria-label="t(fitted ? 'image_viewer.actual_size' : 'image_viewer.fit')"
              :disabled="!natural"
              @click="fitted ? zoomTo(1) : zoomTo(fit)"
            >
              {{ natural ? `${percent}%` : '–' }}
            </button>
          </Tooltip>
          <Tooltip :content="t('image_viewer.zoom_in')" placement="top">
            <IconButton class="bew-image-viewer__control" :label="t('image_viewer.zoom_in')" :disabled="!canZoomIn" @click="zoomTo(scale * IMAGE_VIEWER_ZOOM_STEP)">
              <i class="i-tabler:zoom-in" aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <span class="bew-image-viewer__divider" aria-hidden="true" />
          <Tooltip :content="t('image_viewer.rotate')" placement="top">
            <IconButton class="bew-image-viewer__control" :label="t('image_viewer.rotate')" :disabled="!natural" @click="rotate">
              <i class="i-tabler:rotate-clockwise" aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip v-if="!url.startsWith('blob:')" :content="t('image_viewer.open_original')" placement="top">
            <a class="bew-image-viewer__control bew-image-viewer__link" :href="url" target="_blank" rel="noopener noreferrer" :aria-label="t('image_viewer.open_original')">
              <i class="i-tabler:external-link" aria-hidden="true" />
            </a>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Chrome offsets mirror CHROME_* in the script: 16 edge, 44 controls, 12 gaps.
.bew-image-viewer {
  --image-viewer-edge: var(--bew-space-4);
  --image-viewer-dock-bottom: var(--bew-space-6);
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-image-viewer);
  overflow: hidden;
  color: var(--bew-image-viewer-text-1);
  outline: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  overscroll-behavior: contain;
}
.bew-image-viewer--compact {
  --image-viewer-dock-bottom: var(--bew-space-4);
}

.bew-image-viewer__scrim {
  position: absolute;
  inset: 0;
  background: var(--bew-image-viewer-scrim);
  backdrop-filter: var(--bew-filter-glass-1);
  pointer-events: none;
}

.bew-image-viewer__stage,
.bew-image-viewer__layer {
  position: absolute;
  inset: 0;
}
.bew-image-viewer__layer {
  overflow: hidden;
}

.bew-image-viewer__image {
  position: absolute;
  display: block;
  max-width: none;
  max-height: none;
  transform-origin: center;
  user-select: none;
  -webkit-user-drag: none;
  cursor: default;
}
.bew-image-viewer[data-zoomed] .bew-image-viewer__image {
  cursor: grab;
}
.bew-image-viewer[data-dragging] .bew-image-viewer__image {
  cursor: grabbing;
}

// Programmatic changes (buttons, keys, settle after a gesture) glide; direct
// manipulation (drag, wheel, pinch) follows the pointer without lag.
.bew-image-viewer[data-motion="smooth"] {
  .bew-image-viewer__image,
  .bew-image-viewer__layer {
    transition: transform var(--bew-duration-moderate) var(--bew-ease-standard);
  }
  .bew-image-viewer__scrim {
    transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
  }
}

.bew-image-viewer__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--bew-image-viewer-text-2);
  pointer-events: none;
}

.bew-image-viewer__error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-image-viewer-text-2);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.bew-image-viewer__chrome {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
  &.is-hidden {
    opacity: 0;
    pointer-events: none;
  }
}

.bew-image-viewer__close {
  position: absolute;
  top: var(--image-viewer-edge);
  left: var(--image-viewer-edge);
}

.bew-image-viewer__nav {
  position: absolute;
  top: 50%;
  width: var(--bew-icon-button-size-lg);
  height: var(--bew-icon-button-size-lg);
  color: var(--bew-on-overlay-color);
  background: var(--bew-overlay-background);
  font-size: var(--bew-icon-size-lg);
  transform: translateY(-50%);

  &:hover:not(:disabled) {
    background: var(--bew-overlay-background-hover);
  }
  &:active:not(:disabled) {
    transform: translateY(-50%) scale(var(--bew-control-press-scale));
  }
}
.bew-image-viewer__nav--prev {
  left: var(--image-viewer-edge);
}
.bew-image-viewer__nav--next {
  right: var(--image-viewer-edge);
}

.bew-image-viewer__dock {
  position: absolute;
  right: var(--image-viewer-edge);
  bottom: var(--image-viewer-dock-bottom);
  left: var(--image-viewer-edge);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-3);
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}

.bew-image-viewer__filmstrip {
  display: flex;
  gap: var(--bew-space-1);
  max-width: min(100%, 640px);
  padding: var(--bew-space-0-5);
  overflow-x: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}
.bew-image-viewer__thumb {
  position: relative;
  flex: 0 0 auto;
  width: var(--bew-icon-button-size-lg);
  height: var(--bew-icon-button-size-lg);
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-image-viewer-chrome);
  opacity: 0.48;
  cursor: pointer;
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  &:hover {
    opacity: 0.8;
  }
  &.is-active {
    opacity: 1;
  }
  &:active {
    transform: scale(var(--bew-control-press-scale));
  }
}

.bew-image-viewer__toolbar {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  height: var(--bew-icon-button-size-lg);
  // Round controls sit concentric in the capsule ends.
  padding: 0 calc((var(--bew-icon-button-size-lg) - var(--bew-icon-button-size-md)) / 2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: var(--bew-image-viewer-chrome);
  box-shadow: var(--bew-shadow-3);
  white-space: nowrap;
}

.bew-image-viewer__counter,
.bew-image-viewer__percent {
  min-width: 5ch;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.bew-image-viewer__counter {
  padding: 0 var(--bew-space-2);
  color: var(--bew-image-viewer-text-1);
}

.bew-image-viewer__control,
.bew-image-viewer__percent,
.bew-image-viewer__retry {
  display: inline-grid;
  place-items: center;
  height: var(--bew-icon-button-size-md);
  border: 0;
  color: var(--bew-image-viewer-text-2);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover:not(:disabled) {
    color: var(--bew-image-viewer-text-1);
    background: var(--bew-image-viewer-control-hover);
  }
  &:active:not(:disabled) {
    background: var(--bew-image-viewer-control-pressed);
    transform: scale(var(--bew-control-press-scale));
  }
  &:disabled {
    opacity: 0.36;
    cursor: default;
  }
}
.bew-image-viewer__control {
  width: var(--bew-icon-button-size-md);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  font-size: var(--bew-icon-size-sm);
}
.bew-image-viewer__percent,
.bew-image-viewer__retry {
  padding: 0 var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
}
.bew-image-viewer__retry {
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-4);
  color: var(--bew-image-viewer-text-1);
  background: var(--bew-image-viewer-chrome);
  font-size: var(--bew-font-size-control);
}
.bew-image-viewer__link {
  text-decoration: none;
}

.bew-image-viewer__divider {
  width: var(--bew-hairline);
  height: var(--bew-space-5);
  margin: 0 var(--bew-space-1);
  background: var(--bew-image-viewer-control-hover);
}

// Touch screens swipe between images and drag down to close: no side arrows.
@media (hover: none), (pointer: coarse) {
  .bew-image-viewer__nav {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bew-image-viewer[data-motion="smooth"] {
    .bew-image-viewer__image,
    .bew-image-viewer__layer,
    .bew-image-viewer__scrim {
      transition: none;
    }
  }
  .bew-image-viewer__chrome,
  .bew-image-viewer__thumb,
  .bew-image-viewer__control,
  .bew-image-viewer__percent,
  .bew-image-viewer__retry {
    transition: none;
  }
}
</style>
