import type { Ref } from 'vue'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, shallowRef, watch } from 'vue'

import { CardRowMetrics } from '~/utils/cardRowMetrics'
import { getScrollIntent } from '~/utils/scrollIntent'
import { invalidateViewportGeometry, readViewportGeometry, subscribeViewportFrame } from '~/utils/viewportGeometry'

type CardKey = string | number
export const CARD_WINDOW_THRESHOLD = 40
const OVERSCAN_BEFORE = 1
const OVERSCAN_AFTER = 2
const RECYCLE_MARGIN = 0.5

interface CardMeasurement {
  height: number
  estimatedHeight: number
  layout: string
}

export interface CardWindowSnapshot {
  measurements: [CardKey, CardMeasurement][]
  renderedKeys: CardKey[]
  anchor?: { key: CardKey, offset: number }
}

interface CardRange {
  start: number
  end: number
  /** A skipped range occupies one full-width grid track. */
  height?: number
}

/** Mount only nearby rows and rows containing an interaction that cannot be recycled. */
export function useCardWindow(options: {
  root: Ref<HTMLElement | null>
  container: Ref<HTMLElement | null>
  keys: Ref<CardKey[]>
  columns: Ref<number>
  gap: Ref<number>
  enabled: Ref<boolean>
  estimatedHeight: Ref<number>
  /** Mixed full-width headings and media rows can supply their own estimate. */
  estimateHeight?: (key: CardKey) => number
  layout: Ref<string>
  canRelease: (key: CardKey) => boolean
  snapshot?: CardWindowSnapshot
  /** Return true when the page owns the viewport position and cached card anchors must not override it. */
  restoreScroll?: () => boolean | void
}) {
  const ranges = shallowRef<CardRange[]>([])
  const loadingRange = shallowRef({ start: 0, end: 0 })
  const measurements = new Map<CardKey, CardMeasurement>(options.snapshot?.measurements)
  const slots = new Map<CardKey, HTMLElement>()
  const elementKeys = new WeakMap<Element, CardKey>()
  const indices = new Map<CardKey, number>()
  const metrics = new CardRowMetrics()
  // Avatar/progress enrichment can replace item objects without changing rows.
  // Keep the index owner stable in that case instead of rebuilding all metrics.
  const stableKeys = computed<CardKey[]>((previous) => {
    const next = options.keys.value
    return previous?.length === next.length && next.every((key, index) => key === previous[index]) ? previous : [...next]
  })
  let rowCount = 0
  let measuredColumns = options.columns.value
  let active = false
  let restoring = !!options.snapshot
  const restoredAnchor = options.snapshot?.anchor
  options.snapshot = undefined
  let generation = 0
  let sweepTimer: ReturnType<typeof setTimeout> | undefined
  let resizeObserver: ResizeObserver | undefined
  let containerObserver: ResizeObserver | undefined
  let releaseViewportFrame: (() => void) | undefined
  let frameRoot: HTMLElement | undefined
  let anchorPending = false
  let pendingAnchor: CardWindowSnapshot['anchor']
  let pendingScrollTop = 0
  let bookmark: { root: HTMLElement, scrollTop: number, anchor: CardWindowSnapshot['anchor'] } | undefined
  let bookmarkScheduled = false

  function viewport() {
    const root = options.root.value
    if (!root)
      return { top: 0, height: Math.max(1, window.innerHeight) }
    // Shared with every other consumer of this scroll owner in the same round.
    const geometry = readViewportGeometry(root)
    return { top: geometry.top, height: geometry.clientHeight }
  }

  function visibleAnchor() {
    const { top, height } = viewport()
    let anchor: CardWindowSnapshot['anchor']
    for (const [key, element] of slots) {
      if (!element.isConnected)
        continue
      const rect = element.getBoundingClientRect()
      const offset = rect.top - top
      const precedesAnchor = !anchor || offset < anchor.offset
        || (Math.abs(offset - anchor.offset) < 0.5 && (indices.get(key) ?? Infinity) < (indices.get(anchor.key) ?? Infinity))
      if (rect.bottom > top && rect.top < top + height && precedesAnchor)
        anchor = { key, offset: rect.top - top }
    }
    return anchor
  }

  function restoreAnchor(anchor: CardWindowSnapshot['anchor']) {
    const root = options.root.value
    const element = anchor && slots.get(anchor.key)
    if (root && !getScrollIntent(root).active && anchor && element?.isConnected) {
      const adjustment = element.getBoundingClientRect().top - viewport().top - anchor.offset
      if (Math.abs(adjustment) > 1)
        root.scrollTop += adjustment
    }
  }

  function keepScrollAnchor() {
    if (!active || restoring || anchorPending)
      return
    const root = options.root.value
    // At the page top, a newly measured/replaced grid must not scroll past the
    // content above it. Anchor preservation is only for a scrolled viewport.
    if (!root || root.scrollTop === 0 || getScrollIntent(root).active)
      return
    // ResizeObserver runs after CSS reflows. Use the last settled position
    // when the user has not scrolled since, rather than the already-shifted DOM.
    let anchor = root === bookmark?.root && root?.scrollTop === bookmark?.scrollTop
      ? bookmark?.anchor
      : visibleAnchor()
    const container = options.container.value
    // A scrollbar jump can put every old slot outside the viewport. Preserve
    // the destination row while its estimated predecessors are measured.
    if (!anchor && container) {
      const offset = viewport().top - container.getBoundingClientRect().top
      if (offset >= 0 && offset < metrics.offset(rowCount)) {
        const row = metrics.rowAt(offset)
        const key = options.keys.value[row * options.columns.value]
        if (key !== undefined)
          anchor = { key, offset: metrics.offset(row) - offset }
      }
    }
    if (!root || !anchor)
      return
    const scrollTop = root.scrollTop
    const version = generation
    const scrollVersion = getScrollIntent(root).version
    anchorPending = true
    pendingAnchor = anchor
    pendingScrollTop = scrollTop
    void nextTick(async () => {
      // The caller changes ranges after capturing this anchor. If no Vue flush
      // was pending at capture time, wait for that newly queued patch as well.
      await nextTick()
      anchorPending = false
      pendingAnchor = undefined
      // A narrower row count can shrink the entire scroll range. The browser
      // clamps scrollTop in that case; it is not a new user scroll.
      const clampedScrollTop = Math.min(scrollTop, Math.max(0, root.scrollHeight - root.clientHeight))
      if (version !== generation || scrollVersion !== getScrollIntent(root).version || Math.abs(root.scrollTop - clampedScrollTop) > 1)
        return
      restoreAnchor(anchor)
      scheduleUpdate()
    })
  }

  function updateRanges() {
    if (active && document.hidden)
      return
    const count = options.keys.value.length
    const columns = options.columns.value
    const gap = options.gap.value
    const { top, height } = viewport()
    const container = options.container.value
    const containerRect = container?.getBoundingClientRect()
    const anchorIndex = restoredAnchor && indices.get(restoredAnchor.key)
    const pendingIndex = pendingAnchor && indices.get(pendingAnchor.key)
    const offset = pendingIndex !== undefined && options.root.value?.scrollTop === pendingScrollTop
      ? metrics.offset(Math.floor(pendingIndex / columns)) - pendingAnchor!.offset
      : restoring || !container
        ? metrics.offset(Math.floor((anchorIndex ?? 0) / columns))
        : top - containerRect!.top
    const loadingStart = metrics.rowAt(Math.max(0, offset - height * OVERSCAN_BEFORE))
    const loadingEnd = Math.min(rowCount, metrics.rowAt(offset + height * OVERSCAN_AFTER) + 1)
    const loadable = active && !restoring && !document.hidden && container?.isConnected
      && containerRect && containerRect.width > 0 && containerRect.height > 0
      && offset + height * OVERSCAN_AFTER > 0 && offset - height * OVERSCAN_BEFORE < metrics.offset(rowCount)
    const nextLoading = loadable ? { start: loadingStart * columns, end: Math.min(count, loadingEnd * columns) } : { start: 0, end: 0 }
    if (loadingRange.value.start !== nextLoading.start || loadingRange.value.end !== nextLoading.end)
      loadingRange.value = nextLoading
    const start = options.enabled.value ? loadingStart : 0
    const end = options.enabled.value ? loadingEnd : rowCount
    const rows = new Set<number>()
    for (let row = start; row < end; row++)
      rows.add(row)

    let hasPinnedRows = false
    for (const [key, element] of slots) {
      const index = indices.get(key)
      if (index === undefined)
        continue
      const row = Math.floor(index / columns)
      if (rows.has(row))
        continue
      // Hysteresis keeps recently mounted rows around for direction changes.
      const nearby = metrics.offset(row + 1) > offset - height * (OVERSCAN_BEFORE + RECYCLE_MARGIN) && metrics.offset(row) < offset + height * (OVERSCAN_AFTER + RECYCLE_MARGIN)
      const focused = (element.getRootNode() as Document | ShadowRoot).activeElement
      const pinned = !options.canRelease(key) || (!!focused && element.contains(focused))
      if (nearby || pinned)
        rows.add(row)
      hasPinnedRows ||= pinned
    }
    clearTimeout(sweepTimer)
    sweepTimer = active && hasPinnedRows ? setTimeout(scheduleUpdate, 2000) : undefined

    const next: CardRange[] = []
    let cursor = 0
    for (const row of [...rows].sort((a, b) => a - b)) {
      if (row > cursor) {
        next.push({
          start: cursor * columns,
          end: Math.min(count, row * columns),
          // The grid supplies the gap before/after this replacement track.
          height: Math.max(0, metrics.offset(row) - metrics.offset(cursor) - gap),
        })
      }
      const previous = next[next.length - 1]
      if (previous && previous.height === undefined && previous.end === row * columns)
        previous.end = Math.min(count, (row + 1) * columns)
      else
        next.push({ start: row * columns, end: Math.min(count, (row + 1) * columns) })
      cursor = row + 1
    }
    if (cursor < rowCount) {
      next.push({
        start: cursor * columns,
        end: count,
        height: Math.max(0, metrics.offset(rowCount) - metrics.offset(cursor) - gap),
      })
    }
    if (next.length !== ranges.value.length || next.some((range, index) => {
      const previous = ranges.value[index]
      return range.start !== previous.start || range.end !== previous.end || range.height !== previous.height
    })) {
      keepScrollAnchor()
      ranges.value = next
      if (active && !resizeObserver)
        void nextTick(measureMounted)
    }
    if (bookmarkScheduled)
      return
    bookmarkScheduled = true
    void nextTick(() => {
      bookmarkScheduled = false
      const root = options.root.value
      if (active && !anchorPending && root)
        bookmark = { root, scrollTop: root.scrollTop, anchor: visibleAnchor() }
    })
  }

  /** Joins the viewport's next shared frame instead of scheduling a private one. */
  function scheduleUpdate() {
    if (!active || document.hidden || restoring)
      return
    if (frameRoot)
      invalidateViewportGeometry(frameRoot)
    else
      requestAnimationFrame(handleViewportFrame)
  }

  function handleViewportFrame() {
    if (active && !document.hidden && !restoring)
      updateRanges()
  }

  function measuredHeight(key: CardKey) {
    const measurement = measurements.get(key)
    const estimatedHeight = options.estimateHeight?.(key) ?? options.estimatedHeight.value
    return measurement?.layout === options.layout.value
      ? Math.max(1, measurement.height + estimatedHeight - measurement.estimatedHeight)
      : estimatedHeight
  }

  /**
   * Rows before the first changed key keep their heights: their keys, columns
   * and every height input are unchanged. The suffix from the first affected
   * row (including a previously partial row) is truncated and rebuilt, which
   * covers appended pages and loading placeholders replaced by real cards.
   */
  function rebuildSuffix(keys: CardKey[], previousKeys: CardKey[]) {
    const columns = options.columns.value
    const gap = options.gap.value
    let prefix = 0
    while (prefix < keys.length && prefix < previousKeys.length && keys[prefix] === previousKeys[prefix])
      prefix++
    const firstRow = Math.floor(prefix / columns)
    // A change near the top is a replacement, not an extension.
    if (firstRow === 0 && prefix < keys.length && previousKeys.length > columns)
      return false
    keepScrollAnchor()
    for (let index = prefix; index < previousKeys.length; index++) {
      if (indices.get(previousKeys[index]) === index)
        indices.delete(previousKeys[index])
    }
    for (let index = firstRow * columns; index < keys.length; index++)
      indices.set(keys[index], index)
    rowCount = Math.ceil(keys.length / columns)
    metrics.truncate(firstRow)
    const appended: number[] = []
    for (let row = firstRow; row < rowCount; row++) {
      let height = 0
      for (let index = row * columns; index < Math.min(keys.length, (row + 1) * columns); index++)
        height = Math.max(height, measuredHeight(keys[index]))
      appended.push(height + gap)
    }
    metrics.append(appended)
    for (let index = prefix; index < previousKeys.length; index++) {
      if (!indices.has(previousKeys[index]))
        measurements.delete(previousKeys[index])
    }
    updateRanges()
    return true
  }

  function rebuildRows(next?: unknown[], previous?: unknown[]) {
    const keys = options.keys.value
    // Only the key list changed; every row-height input stayed the same.
    if (next && previous && next.slice(1).every((value, index) => value === previous[index + 1])
      && Array.isArray(previous[0]) && measuredColumns === options.columns.value
      && rebuildSuffix(keys, previous[0] as CardKey[])) {
      return
    }
    keepScrollAnchor()
    const columns = options.columns.value
    measuredColumns = columns
    indices.clear()
    rowCount = Math.ceil(keys.length / columns)
    const heights = Array.from<number>({ length: rowCount }).fill(0)
    keys.forEach((key, index) => {
      indices.set(key, index)
      const row = Math.floor(index / columns)
      heights[row] = Math.max(heights[row], measuredHeight(key))
    })
    // Measurements outside the list or from another layout version cannot be reused.
    for (const [key, measurement] of measurements) {
      if (!indices.has(key) || measurement.layout !== options.layout.value)
        measurements.delete(key)
    }
    metrics.reset(heights.map(height => height + options.gap.value))
    updateRanges()
  }

  function measureMounted(dirtyRows?: Set<number>) {
    if (!active || document.hidden || measuredColumns !== options.columns.value)
      return
    const heights = new Map<number, number>()
    const pending: [CardKey, number][] = []
    for (const [key, element] of slots) {
      const index = indices.get(key)
      if (index === undefined || !element.isConnected)
        continue
      const row = Math.floor(index / options.columns.value)
      if (dirtyRows && !dirtyRows.has(row))
        continue
      const height = element.getBoundingClientRect().height
      if (height <= 0)
        continue
      pending.push([key, height])
      heights.set(row, Math.max(heights.get(row) ?? 0, height))
    }
    // Capture the visible position before changing spacer heights above it.
    keepScrollAnchor()
    for (const [key, height] of pending)
      measurements.set(key, { height, layout: options.layout.value, estimatedHeight: options.estimateHeight?.(key) ?? options.estimatedHeight.value })
    let changed = false
    for (const [row, height] of heights)
      changed = metrics.set(row, height + options.gap.value) || changed
    if (changed)
      updateRanges()
  }

  function setElement(key: CardKey, value: unknown) {
    const previous = slots.get(key)
    if (previous === value)
      return
    if (previous) {
      resizeObserver?.unobserve(previous)
      slots.delete(key)
    }
    if (!(value instanceof HTMLElement))
      return
    slots.set(key, value)
    elementKeys.set(value, key)
    resizeObserver?.observe(value)
  }

  function captureSnapshot(): CardWindowSnapshot {
    measureMounted()
    return { measurements: [...measurements], renderedKeys: [...slots.keys()], anchor: visibleAnchor() }
  }

  function disconnect() {
    generation++
    loadingRange.value = { start: 0, end: 0 }
    clearTimeout(sweepTimer)
    sweepTimer = undefined
    resizeObserver?.disconnect()
    containerObserver?.disconnect()
    resizeObserver = containerObserver = undefined
    releaseViewportFrame?.()
    releaseViewportFrame = frameRoot = undefined
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      loadingRange.value = { start: 0, end: 0 }
    }
    else {
      measureMounted()
      scheduleUpdate()
    }
  }

  function observe() {
    disconnect()
    if (!active)
      return
    const root = options.root.value ?? document.scrollingElement as HTMLElement | null
    // Scroll, root resize and window resize arrive through the shared frame.
    if (root) {
      frameRoot = root
      releaseViewportFrame = subscribeViewportFrame(root, handleViewportFrame)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const dirtyRows = new Set<number>()
        for (const entry of entries) {
          const key = elementKeys.get(entry.target)
          const index = key === undefined ? undefined : indices.get(key)
          if (index !== undefined)
            dirtyRows.add(Math.floor(index / options.columns.value))
        }
        if (dirtyRows.size)
          measureMounted(dirtyRows)
      })
      slots.forEach(element => resizeObserver?.observe(element))
      if (options.container.value) {
        containerObserver = new ResizeObserver(scheduleUpdate)
        containerObserver.observe(options.container.value)
      }
    }
    scheduleUpdate()
  }

  function activate() {
    if (active)
      return
    active = true
    observe()
    void nextTick(() => {
      if (!active)
        return
      const positionReset = options.restoreScroll?.()
      if (restoring && !positionReset)
        restoreAnchor(restoredAnchor)
      restoring = false
      measureMounted()
      updateRanges()
    })
  }

  function deactivate() {
    active = false
    disconnect()
  }

  watch([stableKeys, options.columns, options.gap, options.estimatedHeight, options.layout, options.enabled], (next, previous) => rebuildRows(next, previous), { immediate: true })
  watch([options.root, options.container], observe, { flush: 'post' })
  onMounted(activate)
  onActivated(activate)
  onDeactivated(deactivate)
  onBeforeUnmount(() => {
    deactivate()
    slots.clear()
    measurements.clear()
  })
  return { ranges, loadingRange, setElement, captureSnapshot }
}
