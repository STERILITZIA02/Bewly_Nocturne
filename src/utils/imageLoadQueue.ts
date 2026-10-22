/**
 * Shared image loading queue.
 *
 * LazyPicture deliberately waits until a queue slot is available before it
 * mounts an image with a src.  This keeps queued pictures cheap while still
 * letting the browser perform the actual format negotiation and decode.
 */

import { subscribeViewportFrame } from './viewportGeometry'

export const IMAGE_LOAD_QUEUE_LIMIT = 6
const DEFAULT_IMAGE_LOAD_TIMEOUT = 20_000

export type ImageLoadQueueCancelReason = 'cancelled' | 'timeout'
export type ImageLoadQueueSettleReason = 'completed' | 'failed' | ImageLoadQueueCancelReason

export interface ImageLoadQueueStartContext {
  /** False after cancellation or timeout. Network requests are not aborted. */
  isCurrent: () => boolean
}

export interface ImageLoadQueueGeometry {
  element: Element
  root: Element | null
}

export interface ImageLoadQueueOptions {
  /** The element and scroll root that rank this task; measured once per geometry version. */
  geometry?: () => ImageLoadQueueGeometry | null
  start: (context: ImageLoadQueueStartContext) => Promise<void> | void
  timeout?: number
  onCancel?: (reason: ImageLoadQueueCancelReason) => void
  onSettled?: (reason: ImageLoadQueueSettleReason) => void
}

export interface ImageLoadQueueHandle {
  cancel: (reason?: ImageLoadQueueCancelReason) => void
  isActive: () => boolean
  isQueued: () => boolean
}

interface QueueTask {
  readonly id: number
  readonly options: ImageLoadQueueOptions
  status: 'queued' | 'active' | 'settled'
  cancelled: boolean
  timeoutId: ReturnType<typeof setTimeout> | null
  priority: number
  /** Geometry version and element the priority was measured for. */
  priorityVersion: number
  measuredElement: Element | null
}

/** Slots kept free for on-screen pictures; off-screen work may use the rest. */
const VISIBLE_RESERVED_SLOTS = 2
const VISIBLE_PRIORITY_LIMIT = 1_000_000

const pendingTasks: QueueTask[] = []
const activeTasks = new Set<QueueTask>()
let nextTaskId = 0
let isPumping = false
let pumpScheduled = false
/** Bumped by scroll/layout frames of a subscribed root, fonts and visibility. */
let geometryVersion = 0
let resumeListenersAttached = false

function measureTaskPriority(task: QueueTask, rootViewports: Map<Element | null, { top: number, bottom: number }>) {
  let geometry: ImageLoadQueueGeometry | null | undefined
  try {
    geometry = task.options.geometry?.()
  }
  catch {
    geometry = null
  }
  task.priorityVersion = geometryVersion
  task.measuredElement = geometry?.element ?? null
  if (!task.options.geometry) {
    task.priority = 0
    return
  }
  if (!geometry) {
    task.priority = Number.POSITIVE_INFINITY
    return
  }
  let viewport = rootViewports.get(geometry.root)
  if (!viewport) {
    viewport = getRootViewport(geometry.root)
    rootViewports.set(geometry.root, viewport)
  }
  const priority = getImageLoadPriority(geometry.element, geometry.root, viewport)
  task.priority = Number.isFinite(priority) ? priority : Number.POSITIVE_INFINITY
}

function isPriorityStale(task: QueueTask) {
  if (task.priorityVersion !== geometryVersion)
    return true
  // A replaced element invalidates its own rank without a global re-measure.
  try {
    return (task.options.geometry?.()?.element ?? null) !== task.measuredElement
  }
  catch {
    return true
  }
}

function attachResumeListeners() {
  if (resumeListenersAttached || typeof document === 'undefined')
    return
  resumeListenersAttached = true
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden)
      invalidateImageLoadPriorities()
  })
  // Late fonts move text and therefore the pictures below it.
  document.fonts?.addEventListener?.('loadingdone', invalidateImageLoadPriorities)
}

function removePendingTask(task: QueueTask) {
  const index = pendingTasks.indexOf(task)
  if (index >= 0)
    pendingTasks.splice(index, 1)
}

function settleTask(task: QueueTask, reason: ImageLoadQueueSettleReason) {
  if (task.status === 'settled')
    return

  task.status = 'settled'
  removePendingTask(task)
  activeTasks.delete(task)

  if (task.timeoutId !== null) {
    clearTimeout(task.timeoutId)
    task.timeoutId = null
  }

  task.options.onSettled?.(reason)
}

function cancelTask(task: QueueTask, reason: ImageLoadQueueCancelReason) {
  if (task.status === 'settled')
    return

  task.cancelled = true
  // Mark the task settled before invoking user code. The callback can clear
  // the image synchronously and must never be able to cancel this task again.
  settleTask(task, reason)

  try {
    task.options.onCancel?.(reason)
  }
  finally {
    scheduleQueuePump()
  }
}

function startTask(task: QueueTask) {
  task.status = 'active'
  activeTasks.add(task)

  const timeout = Number.isFinite(task.options.timeout)
    ? Math.max(0, task.options.timeout!)
    : DEFAULT_IMAGE_LOAD_TIMEOUT
  task.timeoutId = setTimeout(cancelTask, timeout, task, 'timeout')

  const context: ImageLoadQueueStartContext = {
    isCurrent: () => task.status === 'active' && !task.cancelled,
  }

  let result: Promise<void> | void
  try {
    result = task.options.start(context)
  }
  catch {
    settleTask(task, 'failed')
    scheduleQueuePump()
    return
  }

  Promise.resolve(result).then(
    () => settleTask(task, 'completed'),
    () => settleTask(task, 'failed'),
  ).finally(() => {
    scheduleQueuePump()
  })
}

/**
 * Fill every free slot in one pass. Priorities are reused until a scroll or
 * layout frame, font load, visibility change or element replacement makes
 * them stale; a freed slot with unchanged geometry neither measures nor sorts.
 * Each root rectangle is read once per pump.
 */
function pumpQueue() {
  if (isPumping)
    return
  // Hidden documents start nothing; their tasks resume with fresh geometry.
  if (typeof document !== 'undefined' && document.hidden)
    return

  isPumping = true
  try {
    const stale = pendingTasks.filter(isPriorityStale)
    if (stale.length) {
      const rootViewports = new Map<Element | null, { top: number, bottom: number }>()
      stale.forEach(task => measureTaskPriority(task, rootViewports))
      pendingTasks.sort((first, second) => (first.priority - second.priority) || first.id - second.id)
    }
    while (activeTasks.size < IMAGE_LOAD_QUEUE_LIMIT && pendingTasks.length > 0) {
      const task = pendingTasks[0]
      if (task.status !== 'queued' || task.cancelled) {
        pendingTasks.shift()
        continue
      }
      // Off-screen buffer work cannot occupy the slots kept for visible pictures.
      if (task.priority >= VISIBLE_PRIORITY_LIMIT && activeTasks.size >= IMAGE_LOAD_QUEUE_LIMIT - VISIBLE_RESERVED_SLOTS)
        break
      pendingTasks.shift()
      startTask(task)
    }
  }
  finally {
    isPumping = false
  }
}

function scheduleQueuePump() {
  if (pumpScheduled || pendingTasks.length === 0 || activeTasks.size >= IMAGE_LOAD_QUEUE_LIMIT)
    return

  pumpScheduled = true
  queueMicrotask(() => {
    pumpScheduled = false
    pumpQueue()
  })
}

/** Add a task to the shared six-slot image loading queue. */
export function enqueueImageLoad(options: ImageLoadQueueOptions): ImageLoadQueueHandle {
  const task: QueueTask = {
    id: nextTaskId++,
    options,
    status: 'queued',
    cancelled: false,
    timeoutId: null,
    priority: 0,
    priorityVersion: -1,
    measuredElement: null,
  }
  pendingTasks.push(task)
  attachResumeListeners()
  scheduleQueuePump()

  return {
    cancel: (reason = 'cancelled') => cancelTask(task, reason),
    isActive: () => task.status === 'active' && !task.cancelled,
    isQueued: () => task.status === 'queued' && !task.cancelled,
  }
}

/** Scroll, layout or direction changed: pending ranks must be measured again. */
export function invalidateImageLoadPriorities() {
  geometryVersion++
  scheduleQueuePump()
}

interface ScrollRootRecord {
  subscriberCount: number
  lastScrollTop: number
  direction: 1 | -1
  release: () => void
}

const scrollRootRecords = new Map<Element | null, ScrollRootRecord>()

function isDocumentScrollingElement(root: Element): boolean {
  if (typeof document === 'undefined')
    return false
  return root === document.scrollingElement || root === document.documentElement || root === document.body
}

/**
 * Subscribe once per real scroll root. The ref-counted record follows the
 * root's shared viewport frame for queue ordering, instead of reading the
 * position on every scroll event, and is released with the last picture.
 */
export function subscribeImageLoadRoot(root: Element | null): () => void {
  if (typeof window === 'undefined')
    return () => {}

  let record = scrollRootRecords.get(root)
  if (!record) {
    const viewport = (root && !isDocumentScrollingElement(root) ? root : document.scrollingElement) as HTMLElement | null
    const created: ScrollRootRecord = {
      subscriberCount: 0,
      lastScrollTop: viewport?.scrollTop ?? 0,
      direction: 1,
      release: () => {},
    }
    if (viewport) {
      created.release = subscribeViewportFrame(viewport, ({ scrollTop }, reason) => {
        if (reason === 'scroll' && scrollTop !== created.lastScrollTop)
          created.direction = scrollTop > created.lastScrollTop ? 1 : -1
        created.lastScrollTop = scrollTop
        // Scrolling, a reversed direction and committed layout moves all re-rank.
        invalidateImageLoadPriorities()
      })
    }
    scrollRootRecords.set(root, record = created)
  }

  record.subscriberCount++
  let subscribed = true

  return () => {
    if (!subscribed)
      return
    subscribed = false

    const current = scrollRootRecords.get(root)
    if (!current)
      return

    current.subscriberCount--
    if (current.subscriberCount > 0)
      return

    current.release()
    scrollRootRecords.delete(root)
  }
}

export function getImageLoadScrollDirection(root: Element | null): 1 | -1 {
  return scrollRootRecords.get(root)?.direction || 1
}

function getRootViewport(root: Element | null): { top: number, bottom: number } {
  if (root && !isDocumentScrollingElement(root)) {
    const rootRect = root.getBoundingClientRect()
    if (rootRect.bottom > rootRect.top)
      return { top: rootRect.top, bottom: rootRect.bottom }
  }

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
  return { top: 0, bottom: Math.max(0, viewportHeight) }
}

/**
 * Lower values run first: visible pictures, then pictures in the current
 * scroll direction ordered by distance, then pictures behind the direction.
 */
export function getImageLoadPriority(element: Element, root: Element | null, viewport = getRootViewport(root)): number {
  const rect = element.getBoundingClientRect()
  const viewportCenter = (viewport.top + viewport.bottom) / 2
  const elementCenter = (rect.top + rect.bottom) / 2

  if (rect.bottom > viewport.top && rect.top < viewport.bottom)
    return Math.abs(elementCenter - viewportCenter)

  const direction = getImageLoadScrollDirection(root)
  const isAhead = direction > 0
    ? rect.top >= viewport.bottom
    : rect.bottom <= viewport.top
  const distance = isAhead
    ? direction > 0
      ? Math.max(0, rect.top - viewport.bottom)
      : Math.max(0, viewport.top - rect.bottom)
    : direction > 0
      ? Math.max(0, viewport.top - rect.bottom)
      : Math.max(0, rect.top - viewport.bottom)

  return (isAhead ? 1_000_000 : 2_000_000) + distance
}
