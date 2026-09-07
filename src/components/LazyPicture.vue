<script lang="ts">
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import type { ImageLoadQueueHandle } from '~/utils/imageLoadQueue'
import { enqueueImageLoad, getImageLoadPriority, subscribeImageLoadRoot } from '~/utils/imageLoadQueue'

// 仅记录“曾经加载过”的 URL，避免重复淡入；不持有 ImageBitmap。
const MAX_REMEMBERED_PICTURES = 240
const loadedPictureSources = new Set<string>()

type SharedIntersectionCallback = (entry: IntersectionObserverEntry) => void

interface SharedObserverRecord {
  root: Element | null
  rootMargin: string
  callbacks: Map<Element, SharedIntersectionCallback>
  observer: IntersectionObserver
}

const sharedObserverRecords: SharedObserverRecord[] = []

function observeIntersection(
  element: Element,
  root: Element | null,
  rootMargin: string,
  callback: SharedIntersectionCallback,
) {
  let record = sharedObserverRecords.find(item => item.root === root && item.rootMargin === rootMargin)

  if (!record) {
    const callbacks = new Map<Element, SharedIntersectionCallback>()
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => callbacks.get(entry.target)?.(entry)),
      { root, rootMargin, threshold: 0.01 },
    )
    record = { root, rootMargin, callbacks, observer }
    sharedObserverRecords.push(record)
  }

  record.callbacks.set(element, callback)
  record.observer.observe(element)

  return () => {
    if (!record)
      return

    record.observer.unobserve(element)
    record.callbacks.delete(element)

    if (record.callbacks.size > 0)
      return

    record.observer.disconnect()
    const recordIndex = sharedObserverRecords.indexOf(record)
    if (recordIndex >= 0)
      sharedObserverRecords.splice(recordIndex, 1)
  }
}

interface PendingImageRelease {
  deadline: number
  release: () => void
}

const pendingImageReleases = new Map<Element, PendingImageRelease>()
let releaseSweepTimer: ReturnType<typeof setTimeout> | null = null
let releaseSweepDeadline = Number.POSITIVE_INFINITY

function runReleaseSweep() {
  releaseSweepTimer = null
  releaseSweepDeadline = Number.POSITIVE_INFINITY
  const now = Date.now()
  let nextDeadline = Number.POSITIVE_INFINITY

  for (const [element, pendingRelease] of pendingImageReleases) {
    if (pendingRelease.deadline <= now) {
      pendingImageReleases.delete(element)
      pendingRelease.release()
    }
    else {
      nextDeadline = Math.min(nextDeadline, pendingRelease.deadline)
    }
  }

  if (Number.isFinite(nextDeadline)) {
    releaseSweepDeadline = nextDeadline
    releaseSweepTimer = setTimeout(
      runReleaseSweep,
      Math.max(0, nextDeadline - Date.now()),
    )
  }
}

function scheduleImageRelease(element: Element, delay: number, release: () => void) {
  const deadline = Date.now() + Math.max(0, delay)
  pendingImageReleases.set(element, {
    deadline,
    release,
  })

  // A batch of offscreen covers shares the earliest wakeup; do not rescan the
  // entire pending set for every new cover in the same IntersectionObserver batch.
  if (releaseSweepTimer !== null && deadline >= releaseSweepDeadline)
    return
  if (releaseSweepTimer !== null)
    clearTimeout(releaseSweepTimer)
  releaseSweepDeadline = deadline
  releaseSweepTimer = setTimeout(runReleaseSweep, Math.max(0, deadline - Date.now()))
}

function cancelImageRelease(element: Element | undefined) {
  if (element)
    pendingImageReleases.delete(element)
  if (pendingImageReleases.size === 0 && releaseSweepTimer !== null) {
    clearTimeout(releaseSweepTimer)
    releaseSweepTimer = null
    releaseSweepDeadline = Number.POSITIVE_INFINITY
  }
}

function hasLoadedPicture(src: string): boolean {
  if (!src || !loadedPictureSources.has(src))
    return false

  // 刷新插入顺序，使最近重新使用的封面更晚被淘汰。
  loadedPictureSources.delete(src)
  loadedPictureSources.add(src)
  return true
}

function rememberLoadedPicture(src: string) {
  if (!src)
    return

  loadedPictureSources.delete(src)
  loadedPictureSources.add(src)

  while (loadedPictureSources.size > MAX_REMEMBERED_PICTURES) {
    const oldestSource = loadedPictureSources.values().next().value
    if (!oldestSource)
      break
    loadedPictureSources.delete(oldestSource)
  }
}

function forgetLoadedPicture(src: string) {
  if (!src)
    return
  loadedPictureSources.delete(src)
}
</script>

<script setup lang="ts">
/**
 * 优化的懒加载图片组件
 * 使用 Intersection Observer API 实现精确的懒加载控制
 * 只在图片即将进入视口时进入共享队列；离开保留区后释放 img
 */

interface Props {
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
  // 无法取得滚动视口高度时使用的预加载边距
  rootMargin?: string
  // 提前加载与离屏回收的保留范围
  retainScreens?: number
  // 离开保留范围后延迟释放，避免快速往返滚动时反复解码
  releaseDelay?: number
  // 是否显示骨架占位
  showSkeleton?: boolean
  aspectRatio?: string
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '150px',
  retainScreens: 3,
  releaseDelay: 2000,
  showSkeleton: true,
  aspectRatio: '16 / 9',
})

const emit = defineEmits<{
  loaded: []
}>()

const bewlyApp = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const imgRef = ref<HTMLElement>()
const imageElRef = ref<HTMLImageElement | null>(null)
// 不再因为“曾经加载过”就立刻挂 src，避免离屏卡片重新吃内存。
const isVisible = ref(props.loading === 'eager')
const isLoaded = ref(false)
const imageFailed = ref(!props.src)
const usePreferredSources = ref(true)
const actualSrc = ref(props.loading === 'eager' ? props.src : '')
const imageKey = computed(() => `${actualSrc.value}:${usePreferredSources.value}`)
const skipRevealTransition = ref(false)

let stopObserving: (() => void) | null = null
let isWithinRetainedRange = props.loading === 'eager'
let active = true
let loadVersion = 0
let queueHandle: ImageLoadQueueHandle | null = null
let settleLoad: (() => void) | undefined
let stopRootSubscription: (() => void) | undefined

function cleanupObserver() {
  stopRootSubscription?.()
  stopRootSubscription = undefined
  stopObserving?.()
  stopObserving = null
}

function getObserverRoot(): Element | null {
  if (typeof window === 'undefined')
    return null
  const viewport = bewlyApp?.scrollViewportRef?.value
  return viewport?.isConnected ? viewport : null
}

function getViewportHeight(): number {
  const root = getObserverRoot()
  if (root instanceof HTMLElement && root.clientHeight > 0)
    return root.clientHeight
  return typeof window !== 'undefined' ? window.innerHeight : 0
}

function getRetainScreens(): number {
  return Number.isFinite(props.retainScreens) && props.retainScreens! > 0
    ? props.retainScreens!
    : 3
}

function getObserverRootMargin(): string {
  const viewportHeight = getViewportHeight()
  if (viewportHeight <= 0)
    return props.rootMargin || '150px'

  // 对齐 1.6.9 的三屏提前加载时机，同时避免百分比 rootMargin 按宽度计算。
  const margin = Math.max(1, Math.round(viewportHeight * getRetainScreens()))
  return `${margin}px 0px`
}

function startLoad() {
  if (!active || imageFailed.value || queueHandle || actualSrc.value)
    return
  const loadedBefore = hasLoadedPicture(props.src)
  skipRevealTransition.value = loadedBefore
  // 重新挂载解码资源时仍走短暂占位，避免空白闪断过长
  isLoaded.value = false
  const source = props.src
  const version = ++loadVersion
  if (props.loading === 'eager') {
    isVisible.value = true
    actualSrc.value = source
    return
  }
  queueHandle = enqueueImageLoad({
    priority: () => imgRef.value ? getImageLoadPriority(imgRef.value, getObserverRoot()) : Infinity,
    start: ({ isCurrent }) => {
      if (!isCurrent() || version !== loadVersion || !active)
        return
      return new Promise<void>((resolve) => {
        settleLoad = resolve
        isVisible.value = true
        actualSrc.value = source
      })
    },
    onSettled: () => {
      if (version === loadVersion)
        queueHandle = null
    },
    onCancel: (reason) => {
      if (version !== loadVersion)
        return
      settleLoad?.()
      settleLoad = undefined
      if (reason === 'timeout') {
        imageFailed.value = true
        detachImageElement()
        actualSrc.value = ''
      }
    },
  })
}

function cancelLoad() {
  loadVersion++
  const handle = queueHandle
  queueHandle = null
  settleLoad?.()
  settleLoad = undefined
  handle?.cancel()
}

function detachImageElement() {
  imgRef.value?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'))
  const imageEl = imageElRef.value
  if (imageEl) {
    // 主动断开 src，帮助浏览器更快释放解码缓存。
    imageEl.removeAttribute('src')
    imageEl.removeAttribute('srcset')
  }
  imageElRef.value = null
}

function releaseImage() {
  if (props.loading === 'eager')
    return

  cancelLoad()
  detachImageElement()
  actualSrc.value = ''
  isVisible.value = false
  isLoaded.value = false
  skipRevealTransition.value = hasLoadedPicture(props.src)
}

function cancelScheduledRelease() {
  cancelImageRelease(imgRef.value)
}

function scheduleRelease() {
  const element = imgRef.value
  if (!element || !isVisible.value || props.loading === 'eager')
    return

  scheduleImageRelease(element, props.releaseDelay, () => {
    if (!isWithinRetainedRange)
      releaseImage()
  })
}

function createObserver() {
  cancelScheduledRelease()
  cleanupObserver()

  if (props.loading === 'eager' || !active)
    return

  const element = imgRef.value
  if (!element)
    return
  stopRootSubscription = subscribeImageLoadRoot(getObserverRoot())
  if (typeof IntersectionObserver === 'undefined') {
    isWithinRetainedRange = true
    startLoad()
    return
  }

  stopObserving = observeIntersection(
    element,
    getObserverRoot(),
    getObserverRootMargin(),
    (entry) => {
      if (!active)
        return
      isWithinRetainedRange = entry.isIntersecting

      if (entry.isIntersecting) {
        cancelScheduledRelease()
        if (!isVisible.value)
          startLoad()
        return
      }

      if (queueHandle?.isQueued())
        cancelLoad()
      scheduleRelease()
    },
  )
}

function bindImageEl(el: Element | { $el?: unknown } | null) {
  const raw = el && typeof el === 'object' && '$el' in el ? el.$el : el
  imageElRef.value = raw instanceof HTMLImageElement ? raw : null
}

onMounted(() => {
  if (props.loading === 'eager')
    return

  createObserver()
})

function releaseResources() {
  active = false
  cancelLoad()
  cleanupObserver()
  cancelScheduledRelease()
  detachImageElement()
  actualSrc.value = ''
  isVisible.value = false
  isLoaded.value = false
}
onBeforeUnmount(releaseResources)
onDeactivated(releaseResources)
onActivated(() => {
  active = true
  if (props.loading === 'eager')
    startLoad()
  else
    createObserver()
})

function isCurrentImage(image: HTMLImageElement) {
  return image === imageElRef.value && image.dataset.imageKey === imageKey.value && Boolean(actualSrc.value)
}

async function handleImageLoad(event: Event) {
  // Keep the bound element across decode; target can be retargeted at the Shadow DOM boundary.
  const image = event.currentTarget as HTMLImageElement
  if (!isCurrentImage(image))
    return
  const version = loadVersion
  try {
    await image.decode?.()
  }
  catch {
    // A successful load remains usable if decode is unavailable or rejected.
  }
  if (!active || version !== loadVersion || !isCurrentImage(image))
    return
  rememberLoadedPicture(actualSrc.value)
  isLoaded.value = true
  settleLoad?.()
  settleLoad = undefined
  emit('loaded')
}

function handleImageError(event: Event) {
  if (!isCurrentImage(event.currentTarget as HTMLImageElement))
    return
  if (usePreferredSources.value) {
    // The caller's original URL gets one attempt if the preferred CDN format fails.
    usePreferredSources.value = false
    return
  }
  imageFailed.value = true
  forgetLoadedPicture(actualSrc.value)
  settleLoad?.()
  settleLoad = undefined
}

watch(() => props.src, (newSrc, oldSrc) => {
  cancelLoad()
  detachImageElement()
  actualSrc.value = ''
  isVisible.value = false
  if (oldSrc && oldSrc !== newSrc)
    forgetLoadedPicture(oldSrc)

  skipRevealTransition.value = hasLoadedPicture(newSrc)
  isLoaded.value = false
  imageFailed.value = !newSrc
  usePreferredSources.value = true

  if (props.loading === 'eager' || isWithinRetainedRange)
    startLoad()
})

// 滚动容器引用变化时重建 observer，保证 root 正确。
watch(
  () => bewlyApp?.scrollViewportRef?.value,
  () => {
    if (props.loading === 'eager')
      return
    createObserver()
  },
)

watch(
  () => [props.loading, props.retainScreens, props.rootMargin] as const,
  () => {
    if (props.loading === 'eager') {
      cancelScheduledRelease()
      cleanupObserver()
      startLoad()
    }
    else {
      createObserver()
    }
  },
)
</script>

<template>
  <picture
    ref="imgRef"
    w-full max-w-full align-middle
    rounded-inherit
    style="display: block; position: relative; contain: layout style;"
    :style="{ aspectRatio, backgroundColor: showSkeleton ? 'var(--bew-skeleton)' : undefined }"
    :data-bew-skeleton="showSkeleton && isVisible && !isLoaded && !imageFailed ? '' : undefined"
  >

    <div v-if="imageFailed" class="lazy-picture-error" role="img" :aria-label="$t('common.image_load_failed')">
      <i i-mingcute:pic-line aria-hidden="true" />
      <span>{{ $t('common.image_load_failed') }}</span>
    </div>

    <!-- 实际图片 - 仅在进入加载区后挂载，离开保留区后卸载 -->
    <template v-if="isVisible && actualSrc && !imageFailed">
      <source v-if="usePreferredSources" :srcset="`${actualSrc}.avif`" type="image/avif">
      <source v-if="usePreferredSources" :srcset="`${actualSrc}.webp`" type="image/webp">
      <img
        :key="imageKey"
        :ref="bindImageEl"
        :data-image-key="imageKey"
        :src="actualSrc"
        :alt="alt"
        loading="eager"
        decoding="async"
        block w-full h-full
        rounded-inherit
        style="object-fit: cover; object-position: center;"
        :style="{ aspectRatio, opacity: isLoaded ? 1 : 0 }"
        class="image-transition"
        :class="{ 'image-transition--instant': skipRevealTransition }"
        @load="handleImageLoad"
        @error="handleImageError"
      >
    </template>
  </picture>
</template>

<style scoped>
.lazy-picture-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  box-sizing: border-box;
  background: var(--bew-skeleton);
  color: var(--bew-text-2);
  border-radius: inherit;
  corner-shape: inherit;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}

.lazy-picture-error i {
  font-size: var(--bew-icon-size-lg);
}

.image-transition {
  position: relative;
  z-index: 1;
  transition: opacity 0.28s ease-out;
}

.image-transition--instant {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .image-transition {
    transition: none;
  }
}
</style>
