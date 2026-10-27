import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'

import type { DisplayMoment } from '~/components/MomentCard/types'
import { getCardPreviewText, isCompactPlainTextMoment } from '~/components/MomentCard/utils'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { useLayoutEditSettingValue } from '~/logic/layoutEdit'
import { shouldUseWideMomentCardLayout, supportsWideMomentCardLayout } from '~/utils/momentCardLayout'
import { createMomentColumnIndex } from '~/utils/momentColumnIndex'
import { MOMENT_GRID_DIMENSIONS, resolveMomentCardWidth, resolveMomentGridColumnCount } from '~/utils/momentsLayout'
import { isNotNewerMoment } from '~/utils/momentsReadPosition'
import { isPortraitRatio, PORTRAIT_MAX_CLEAR_HEIGHT } from '~/utils/portraitMedia'
import type { ScrollCardAnchor, ScrollPositionClaim } from '~/utils/scrollIntent'
import { claimScrollCardAnchor, claimScrollPosition, ownsScrollPosition, resolveScrollCardAnchor } from '~/utils/scrollIntent'
import { SUPPORTS_TEXT_AUTOSPACE } from '~/utils/textAutospace'
import type { ViewportFrameReason, ViewportGeometry } from '~/utils/viewportGeometry'
import { getLayoutHeight, getRemainingScroll, invalidateViewportGeometry, readViewportGeometry, subscribeViewportFrame } from '~/utils/viewportGeometry'

interface LayoutHooks {
  onNearBottom: () => void
  onRecycle: (id: string) => void
  onViewportChange: (visible: ReadonlySet<string>, hidden: string[]) => void
  onReadAnchor?: (anchor: { id: string, offset: number }) => void
}
/** Owns columns, measurements, visible ranges and their observers; never writes feed data. */
export function useMomentLayout(moments: Ref<DisplayMoment[]>, hooks: LayoutHooks) {
  const { scrollViewportRef } = useBewlyApp()
  const textAutospaceMode = computed(() => SUPPORTS_TEXT_AUTOSPACE ? settings.value.textAutospaceMode : 'default')
  let active = false
  interface VirtualColumn {
    topPad: number
    bottomPad: number
    items: DisplayMoment[]
    gaps?: number[]
  }
  const momentsGridColumns = useLayoutEditSettingValue(
    'page.moments.gridColumns',
    () => settings.value.momentsGridColumns,
  )
  // Column arrays only grow by push or are replaced; the height index follows
  // that contract (see momentColumnIndex). Nothing renders them reactively.
  const momentColumns = shallowRef<DisplayMoment[][]>([])
  /** Feed order of each placed card, for sorting a column after a tail move. */
  const feedOrder = new Map<string, number>()
  let nextFeedOrder = 0
  const layoutRef = ref<HTMLElement | null>(null)
  const momentsContentRef = ref<HTMLElement | null>(null)
  const gridRef = ref<HTMLElement | null>(null)
  const { minCardWidth: CARD_MIN_WIDTH } = MOMENT_GRID_DIMENSIONS
  /** Measured from the rendered grid (or its skeleton) on layout changes, never in render paths. */
  let gridGap: number = MOMENT_GRID_DIMENSIONS.gap
  const gridColumnCount = ref(1)
  const gridCardWidth = ref(520)
  let rebalanceTimer: ReturnType<typeof setTimeout> | null = null
  // Read only by imperative layout passes, never by render or computed state.
  const cardHeights: Record<string, number> = {}
  const visibleMomentIds = reactive(new Set<string>())
  const readyCardIds = reactive(new Set<string>())
  const enteringCardIds = reactive(new Set<string>())
  const revealedCardIds = new Set<string>()
  const cardEnterTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const cardElements = new Map<string, HTMLElement>()
  const cardMoments = new Map<string, DisplayMoment>()
  /** Cards awaiting one batched reset → read → write → measure pass. */
  const pendingCardLayouts = new Map<string, { force: boolean }>()
  const descriptionFitKeys = new WeakMap<HTMLElement, string>()
  let cardLayoutFlushQueued = false
  const pendingReadyIds = new Set<string>()
  let cardReadyFrame = 0
  const virtualColumns = shallowRef<VirtualColumn[]>([])
  const interactiveCardIds = new Set<string>()
  const movingDisclosureIds = new Set<string>()
  const coverRatios = reactive<Record<string, number>>({})
  const MIN_SINGLE_IMAGE_RATIO = 1 / 2
  let gridObserver: ResizeObserver | undefined
  const OVERSCAN_PX = 1200
  let releaseViewportFrame: (() => void) | undefined
  let attachedScrollViewport: HTMLElement | null = null
  /** Grid top within the scroll content; scrolling cannot change it. */
  let gridOffsetTop: number | undefined
  let prependAnchor: ScrollCardAnchor | undefined
  let anchorCommit = 0
  let lastReadingInput = 0
  let readingIntent: ScrollPositionClaim | undefined
  let cardMeasureObserver: ResizeObserver | undefined
  const measuredCardWidths = new WeakMap<HTMLElement, number>()
  const DESCRIPTION_LINES_PROPERTY = '--moment-card-description-lines'
  let visibilityObserver: IntersectionObserver | undefined
  let lastScrollAt = 0
  let cardGeometryFrame = 0
  let suppressBottomRebalanceUntil = 0
  const settledHeights = new Set<string>()
  let measurementRevision = 0
  const columnHeightIndex = createMomentColumnIndex<DisplayMoment>(item => item.id, getCardHeight, () => gridGap)
  const momentsGridStyle = computed(() => ({
    '--moments-columns': String(Math.max(1, gridColumnCount.value)),
  }))
  function isUsableImageRatio(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }

  function estimateCardHeight(moment: DisplayMoment) {
    const columnWidth = Math.max(1, gridCardWidth.value || 520)
    const contentScale = Math.max(1, Math.min(1.6, columnWidth / 520))
    const scaledTextBodyExtra = Math.round(230 * (contentScale - 1))
    const interactionHeight = moment.hotComment ? 52 : 0
    const additionalHeight = moment.additional ? 68 : 0
    if (shouldUseWideMomentCardLayout(moment, columnWidth)) {
      const mediaWidth = Math.max(1, (columnWidth - gridGap * 3) * 0.6)
      const mediaRatio = moment.isVideo || moment.isLive ? 16 / 9 : getMomentImageRatio(moment)
      const mediaHeight = mediaWidth / mediaRatio
      const bodyWidth = Math.max(160, (columnWidth - gridGap * 3) * 0.4 - gridGap * 2)
      const charsPerLine = Math.max(12, Math.floor(bodyWidth / 14))
      const textLineCount = Math.min(7, Math.max(1, Math.ceil((moment.text || '').length / charsPerLine)))
      const bodyHeight = 96 + textLineCount * 24 + (moment.title ? 44 : 0)
      return 115 + Math.round(Math.max(mediaHeight, bodyHeight)) + additionalHeight + interactionHeight
    }
    if (isCompactPlainTextMoment(moment)) {
      const charsPerLine = Math.max(12, Math.floor((columnWidth - 32) / 14))
      const lineCount = Math.min(7, Math.max(1, (moment.text || '').split('\n').reduce(
        (total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)),
        0,
      )))
      return 118 + lineCount * 21 + additionalHeight + interactionHeight
    }
    const forward = moment.forward
    if (forward && (forward.video || forward.liveCover || forward.images?.length)) {
      // The quote spans the card inside its 16px insets: its media on top
      // (16:9 covers; images as at the card top, with the 48px strip and its
      // 8px gap when there are several), then the source row and two lines.
      const introLines = Math.min(7, Math.max(1, Math.ceil((moment.text || '').length / 28)))
      const quoteWidth = Math.max(1, columnWidth - 32)
      const images = forward.video || forward.liveCover ? [] : forward.images ?? []
      const firstRatio = forward.imageRatios?.[0]
      const ratio = isUsableImageRatio(firstRatio) ? firstRatio : 1
      const mediaHeight = !images.length
        ? quoteWidth * 9 / 16
        : isPortraitRatio(firstRatio)
          ? quoteWidth / Math.max(1 / PORTRAIT_MAX_CLEAR_HEIGHT, ratio) + 48
          : quoteWidth / Math.min(2, ratio)
      const textLines = forward.video?.desc || forward.text ? 2 : 1
      return 117 + introLines * 21 + 12 + Math.round(mediaHeight) + (images.length > 1 ? 56 : 0) + 8 + 24 + 22 + textLines * 16 + 12 + additionalHeight + interactionHeight
    }
    if (moment.isChargeExclusive && !moment.isVideo)
      return 230 + scaledTextBodyExtra + additionalHeight + interactionHeight
    if (columnWidth < CARD_MIN_WIDTH) {
      if (moment.isLive)
        return Math.round(columnWidth * 9 / 16) + 210 + additionalHeight + interactionHeight
    }
    // Video and live covers fill the card's full width; coverless ones sit inside the inset.
    const coverWidth = moment.images.length ? columnWidth : columnWidth - 32
    if (moment.isLive)
      return Math.round(coverWidth * 9 / 16) + 190 + additionalHeight + interactionHeight
    if (moment.isVideo) {
      const contentWidth = Math.max(1, columnWidth - 32)
      const charsPerLine = Math.max(12, Math.floor(contentWidth / 15))
      const titleLines = moment.title ? Math.min(2, Math.max(1, Math.ceil(moment.title.length / charsPerLine))) : 0
      const description = getCardPreviewText(moment)
      const descriptionMaxLines = moment.descInherited ? 2 : 3
      const descriptionLines = description ? Math.min(descriptionMaxLines, Math.max(1, Math.ceil(description.length / charsPerLine))) : 0
      const bodyHeight = titleLines * 22 + descriptionLines * 24 + (titleLines && descriptionLines ? 8 : 0)
      return Math.round(coverWidth * 9 / 16) + 116 + bodyHeight + additionalHeight + interactionHeight
    }
    if (moment.images.length && !moment.isVideo && !moment.isLive) {
      // One full-width image on top (ratio capped at 2:1 landscape; a portrait
      // one shows up to 1.2 widths, then a 48px fade), then the 48px thumbnail
      // strip with its 8px gap when there are several.
      const ratio = getMomentImageRatio(moment)
      const imageHeight = isPortraitRatio(moment.imageRatios?.[0])
        ? Math.round(columnWidth / Math.max(1 / PORTRAIT_MAX_CLEAR_HEIGHT, ratio)) + 48
        : Math.round(columnWidth / Math.min(2, ratio))
      return imageHeight + (moment.images.length > 1 ? 56 : 0) + 208 + additionalHeight + interactionHeight
    }
    const charsPerLine = Math.max(12, Math.floor((columnWidth - 32) / 14))
    const textLineCount = Math.min(12, Math.max(1, (moment.text || '').split('\n').reduce(
      (total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)),
      0,
    )))
    return 112
      + textLineCount * 24
      + (moment.title ? 30 : 0)
      + additionalHeight
      + interactionHeight
  }

  function getMomentImageRatio(moment: DisplayMoment) {
    const metadataRatio = moment.imageRatios?.[0]
    const ratio = isUsableImageRatio(metadataRatio)
      ? metadataRatio
      : coverRatios[moment.id]
    return isUsableImageRatio(ratio)
      ? Math.max(MIN_SINGLE_IMAGE_RATIO, ratio)
      : 1
  }

  function getCardHeight(moment: DisplayMoment) {
    return cardHeights[moment.id] || estimateCardHeight(moment)
  }

  function columnIndexKey() {
    return `${gridCardWidth.value}:${gridGap}:${measurementRevision}`
  }

  /** Maintained totals while the index is current; a full reduce otherwise. */
  function getColumnStackHeight(column: DisplayMoment[]) {
    if (!column.length)
      return 0
    const indexed = columnHeightIndex.stackHeight(column)
    if (indexed !== undefined)
      return indexed
    return column.reduce((sum, moment, index) => {
      return sum + getCardHeight(moment) + (index > 0 ? gridGap : 0)
    }, 0)
  }

  function findShortestColumnIndex(columns: DisplayMoment[][], heights?: number[]) {
    let minIdx = 0
    let minHeight = Infinity
    for (let i = 0; i < columns.length; i++) {
      const height = heights ? heights[i] : getColumnStackHeight(columns[i])
      if (height < minHeight) {
        minHeight = height
        minIdx = i
      }
    }
    return minIdx
  }

  /**
   * Tail balancing over maintained column totals: heights are read once and
   * then adjusted per move. Only columns that actually move a card are copied,
   * so untouched columns keep their array (and their index rows).
   */
  function balanceColumnBottoms(columns: DisplayMoment[][]) {
    const next = columns.slice()
    if (next.length < 2)
      return { columns: next, changed: false }

    if (columns === momentColumns.value)
      columnHeightIndex.sync(columns, columnIndexKey())
    const heights = next.map(column => getColumnStackHeight(column))
    const copied = new Set<number>()
    let changed = false
    const maxMoves = Math.min(moments.value.length, 24)

    for (let moveCount = 0; moveCount < maxMoves; moveCount++) {
      const currentSpread = Math.max(...heights) - Math.min(...heights)
      let bestMove: { sourceIndex: number, targetIndex: number, itemIndex: number, spread: number } | null = null

      next.forEach((source, sourceIndex) => {
        if (source.length <= 1)
          return

        // 只调整列尾附近的卡片，避免破坏上方已经阅读过的瀑布流
        const firstCandidateIndex = Math.max(0, source.length - 4)
        for (let itemIndex = firstCandidateIndex; itemIndex < source.length; itemIndex++) {
          const itemHeight = getCardHeight(source[itemIndex])
          next.forEach((target, targetIndex) => {
            if (targetIndex === sourceIndex)
              return

            const candidateHeights = [...heights]
            candidateHeights[sourceIndex] -= itemHeight + gridGap
            candidateHeights[targetIndex] += itemHeight + (target.length ? gridGap : 0)
            const spread = Math.max(...candidateHeights) - Math.min(...candidateHeights)
            if (spread >= currentSpread - 4 || (bestMove && spread >= bestMove.spread))
              return

            bestMove = { sourceIndex, targetIndex, itemIndex, spread }
          })
        }
      })

      if (!bestMove)
        break

      const { sourceIndex, targetIndex, itemIndex } = bestMove
      for (const index of [sourceIndex, targetIndex]) {
        if (!copied.has(index)) {
          copied.add(index)
          next[index] = next[index].slice()
        }
      }
      const [moved] = next[sourceIndex].splice(itemIndex, 1)
      const movedHeight = getCardHeight(moved)
      heights[sourceIndex] -= movedHeight + (next[sourceIndex].length ? gridGap : 0)
      heights[targetIndex] += movedHeight + (next[targetIndex].length ? gridGap : 0)
      next[targetIndex].push(moved)
      next[targetIndex].sort((a, b) => (feedOrder.get(a.id) ?? 0) - (feedOrder.get(b.id) ?? 0))
      changed = true
    }

    return { columns: next, changed }
  }

  function redistributeColumns() {
    const count = Math.max(1, gridColumnCount.value)
    const next = Array.from({ length: count }, () => [] as DisplayMoment[])
    const heights = Array.from<number>({ length: count }).fill(0)

    feedOrder.clear()
    nextFeedOrder = 0
    moments.value.forEach((item) => {
      feedOrder.set(item.id, nextFeedOrder++)
      const columnIndex = findShortestColumnIndex(next, heights)
      next[columnIndex].push(item)
      heights[columnIndex] += (heights[columnIndex] > 0 ? gridGap : 0) + getCardHeight(item)
    })

    momentColumns.value = balanceColumnBottoms(next).columns
    updateVirtualColumns()
  }

  function invalidateCardMeasurementsForWidthChange() {
    measurementRevision++
    Object.keys(cardHeights).forEach(id => delete cardHeights[id])
    settledHeights.clear()
    if (cardGeometryFrame)
      cancelAnimationFrame(cardGeometryFrame)
    // Wait for the new width to reach the DOM, then fit and measure every
    // mounted card in one batch instead of alternating writes and reads per card.
    cardGeometryFrame = requestAnimationFrame(() => {
      cardGeometryFrame = 0
      cardElements.forEach((_element, id) => pendingCardLayouts.set(id, { force: true }))
      flushCardLayouts()
      updateVirtualColumns()
      hooks.onNearBottom()
    })
  }

  function measureGridGap(): boolean {
    const grid = gridRef.value ?? momentsContentRef.value?.querySelector<HTMLElement>('.moments-skeleton-grid')
    if (!grid)
      return false
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap)
    if (Number.isFinite(gap) && gap >= 0 && gap !== gridGap) {
      gridGap = gap
      return true
    }
    return false
  }

  function updateGridColumnCount() {
    const gapChanged = measureGridGap()
    const layoutWidth = layoutRef.value?.clientWidth || window.innerWidth
    const mainRailWidth = momentsContentRef.value?.clientWidth || layoutWidth
    const preferredColumns = Math.min(3, Math.max(1, Number(momentsGridColumns.value) || 3))
    const desiredCols = resolveMomentGridColumnCount({
      containerWidth: mainRailWidth,
      preferredColumns,
      minCardWidth: CARD_MIN_WIDTH,
      gap: gridGap,
    })
    // Keep an active editor/focus/fullscreen in its Vue column. Apply the new
    // column count as soon as the interaction ends; width still follows resize.
    const nextCols = interactiveCardIds.size && momentColumns.value.length ? gridColumnCount.value : desiredCols
    const gridClientWidth = gridRef.value?.clientWidth || mainRailWidth
    const nextCardWidth = resolveMomentCardWidth({
      gridClientWidth,
      columns: nextCols,
      gap: gridGap,
    })

    const colsChanged = nextCols !== gridColumnCount.value || gapChanged
    const widthChanged = Math.abs(nextCardWidth - gridCardWidth.value) > 0.01
    const needInitColumns = momentColumns.value.length !== nextCols

    gridColumnCount.value = nextCols
    gridCardWidth.value = nextCardWidth
    if (widthChanged)
      invalidateCardMeasurementsForWidthChange()

    if (colsChanged || needInitColumns)
      redistributeColumns()
    else if (widthChanged)
      updateVirtualColumns()
  }

  function append(items: DisplayMoment[], wasEmpty: boolean) {
    if (!momentColumns.value.length)
      momentColumns.value = Array.from({ length: Math.max(1, gridColumnCount.value) }, () => [])

    columnHeightIndex.sync(momentColumns.value, columnIndexKey())
    const columnHeights = momentColumns.value.map(column => getColumnStackHeight(column))

    items.forEach((item) => {
      feedOrder.set(item.id, nextFeedOrder++)
      const columnIndex = findShortestColumnIndex(momentColumns.value, columnHeights)
      momentColumns.value[columnIndex].push(item)
      columnHeights[columnIndex] += (columnHeights[columnIndex] > 0 ? gridGap : 0) + getCardHeight(item)
    })
    // 初始布局可整体平衡；分页只追加，不能搬动用户正在查看的旧卡片
    if (wasEmpty)
      momentColumns.value = balanceColumnBottoms(momentColumns.value).columns
    updateVirtualColumns()
    scheduleBottomRebalance()
  }

  function scheduleBottomRebalance() {
    if (prependAnchor)
      return
    // 滚动过程中不重排，避免瀑布流突然上下跳动
    if (rebalanceTimer)
      clearTimeout(rebalanceTimer)
    rebalanceTimer = setTimeout(() => {
      rebalanceTimer = null
      if (Date.now() < suppressBottomRebalanceUntil)
        return
      if (Date.now() - lastScrollAt < 480) {
        scheduleBottomRebalance()
        return
      }
      if (momentColumns.value.length < 2 || moments.value.length < 2)
        return
      if (interactiveCardIds.size)
        return
      const viewport = scrollViewportRef.value
      if (viewport) {
        const geometry = readViewportGeometry(viewport)
        // 分页加载区不再缩短最高列，避免最大 scrollTop 变化把滚动位置向上夹回
        if (getRemainingScroll(geometry) < geometry.clientHeight * 1.25)
          return
      }
      columnHeightIndex.sync(momentColumns.value, columnIndexKey())
      const heights = momentColumns.value.map(column => getColumnStackHeight(column))
      const maxH = Math.max(...heights)
      const minH = Math.min(...heights)
      // 空闲时对列尾做小范围补位，让追加数据后的底边也保持相对平整
      if (maxH - minH <= Math.max(120, gridCardWidth.value * 0.45))
        return
      const balanced = balanceColumnBottoms(momentColumns.value)
      if (balanced.changed) {
        momentColumns.value = balanced.columns
        updateVirtualColumns()
      }
    }, 720)
  }

  function handleMomentCardInteractiveResize() {
    suppressBottomRebalanceUntil = Date.now() + 1200
    if (rebalanceTimer) {
      clearTimeout(rebalanceTimer)
      rebalanceTimer = null
    }
  }

  function commitCardHeight(id: string, next: number, options?: { force?: boolean }) {
    if (next <= 0)
      return false
    const prev = cardHeights[id] || 0
    const threshold = options?.force ? 1 : (settledHeights.has(id) ? 10 : 4)
    if (prev > 0 && Math.abs(prev - next) < threshold)
      return false

    cardHeights[id] = next
    columnHeightIndex.updateHeight(id, next)
    // 连续两次接近的高度视为稳定，后续忽略小幅 Resize 抖动
    if (prev > 0 && Math.abs(next - prev) < 24)
      settledHeights.add(id)
    else if (prev > 0 && settledHeights.has(id) && Math.abs(next - prev) < 48)
      settledHeights.add(id)

    return true
  }

  /** Height commits join the viewport's next layout frame with every other consumer. */
  function scheduleVirtualUpdate() {
    if (!active)
      return
    const viewport = scrollViewportRef.value
    if (viewport)
      invalidateViewportGeometry(viewport)
    else
      updateVirtualColumns()
  }

  function handleViewportFrame(geometry: ViewportGeometry, reason: ViewportFrameReason) {
    if (reason === 'scroll')
      lastScrollAt = Date.now()
    else
      gridOffsetTop = undefined
    updateVirtualColumns(geometry)
    if (reason === 'scroll' && !document.hidden && scrollViewportRef.value) {
      const claim = claimScrollPosition(scrollViewportRef.value)
      if (claim.inputVersion !== lastReadingInput) {
        lastReadingInput = claim.inputVersion
        readingIntent = claim
      }
      if (!prependAnchor && readingIntent && ownsScrollPosition(scrollViewportRef.value, readingIntent)) {
        const candidate = captureAnchor()?.candidates[0]
        if (candidate)
          hooks.onReadAnchor?.({ id: candidate.key, offset: candidate.offset })
      }
    }
    hooks.onNearBottom()
  }

  function captureAnchor(): ScrollCardAnchor | undefined {
    const viewport = scrollViewportRef.value
    if (!viewport)
      return
    const geometry = readViewportGeometry(viewport)
    const top = getGridOffsetTop(geometry)
    columnHeightIndex.sync(momentColumns.value, columnIndexKey())
    const cards = columnHeightIndex.window(geometry.scrollTop - top, geometry.scrollTop - top + geometry.clientHeight)
      .flatMap(column => column.items.map(item => ({ key: item.id, top: top + columnHeightIndex.offsetOf(item.id)! })))
    return claimScrollCardAnchor(viewport, cards)
  }

  /** The scroll position that puts a laid-out card at the top of the viewport. */
  function getCardScrollTop(id: string) {
    const viewport = scrollViewportRef.value
    if (!viewport)
      return
    columnHeightIndex.sync(momentColumns.value, columnIndexKey())
    const offset = columnHeightIndex.offsetOf(id)
    return offset === undefined ? undefined : getGridOffsetTop(readViewportGeometry(viewport)) + offset
  }

  function restoreAnchor(anchor: ScrollCardAnchor) {
    prependAnchor = anchor
    updateVirtualColumns()
  }

  function insertBefore(items: DisplayMoment[], targetId: string, anchor?: ScrollCardAnchor) {
    if (!momentColumns.value.length) {
      append(items, true)
      return
    }
    columnHeightIndex.sync(momentColumns.value, columnIndexKey())
    const prefixes = momentColumns.value.map((column) => {
      const index = column.findIndex(item => isNotNewerMoment(item.id, targetId))
      return index < 0 ? column.length : index
    })
    const additions = momentColumns.value.map(() => [] as DisplayMoment[])
    const heights = momentColumns.value.map((column, index) => prefixes[index] < column.length
      ? columnHeightIndex.offsetOf(column[prefixes[index]].id)!
      : getColumnStackHeight(column))
    for (const item of items) {
      const column = findShortestColumnIndex(additions, heights)
      additions[column].push(item)
      heights[column] += getCardHeight(item) + gridGap
    }
    momentColumns.value = momentColumns.value.map((column, index) => additions[index].length
      ? [...column.slice(0, prefixes[index]), ...additions[index], ...column.slice(prefixes[index])]
      : column)
    moments.value.forEach((item, index) => feedOrder.set(item.id, index))
    nextFeedOrder = moments.value.length
    prependAnchor = anchor
    updateVirtualColumns()
  }

  function getGridOffsetTop(geometry: ViewportGeometry | undefined) {
    const grid = gridRef.value
    if (!grid || !geometry)
      return 0
    gridOffsetTop ??= grid.getBoundingClientRect().top - geometry.top + geometry.scrollTop
    return gridOffsetTop
  }

  /** Returns whether the rendered window changed and needs another DOM commit. */
  function updateVirtualColumns(geometry?: ViewportGeometry) {
    if (!momentColumns.value.length) {
      if (!virtualColumns.value.length)
        return false
      virtualColumns.value = []
      return true
    }

    const viewport = scrollViewportRef.value
    // Explicit calls follow a commit: the grid may have moved inside the content.
    if (!geometry)
      gridOffsetTop = undefined
    const snapshot = geometry ?? (viewport ? readViewportGeometry(viewport) : undefined)
    let scrollTop = snapshot?.scrollTop ?? 0
    const viewportHeight = snapshot?.clientHeight ?? window.innerHeight
    const offsetTop = getGridOffsetTop(snapshot)
    columnHeightIndex.sync(momentColumns.value, columnIndexKey())
    if (prependAnchor && viewport) {
      const top = resolveScrollCardAnchor(viewport, prependAnchor, (id) => {
        const offset = columnHeightIndex.offsetOf(id)
        return offset === undefined ? undefined : offsetTop + offset
      })
      if (top === undefined) {
        prependAnchor = undefined
      }
      else {
        scrollTop = top
        const anchor = prependAnchor
        const commit = ++anchorCommit
        void nextTick(() => {
          if (active && !document.hidden && commit === anchorCommit && prependAnchor === anchor && ownsScrollPosition(viewport, anchor.position) && Math.abs(viewport.scrollTop - anchor.position.top) <= 1 && Math.abs(viewport.scrollTop - top) > 0.5) {
            viewport.scrollTop = top
            anchor.position.top = viewport.scrollTop
          }
        })
      }
    }
    const viewStart = scrollTop - OVERSCAN_PX
    const viewEnd = scrollTop + viewportHeight + OVERSCAN_PX
    const next = columnHeightIndex.window(viewStart - offsetTop, viewEnd - offsetTop, interactiveCardIds)
    const previous = virtualColumns.value
    const changed = next.length !== previous.length || next.some((column, index) => {
      const old = previous[index]
      return column.topPad !== old.topPad || column.bottomPad !== old.bottomPad
        || column.items.length !== old.items.length
        || column.items.some((item, row) => item !== old.items[row] || (column.gaps?.[row] ?? 0) !== (old.gaps?.[row] ?? 0))
    })
    if (changed)
      virtualColumns.value = next

    hooks.onViewportChange(visibleMomentIds, [])
    return changed
  }

  function markCardReady(id: string) {
    readyCardIds.add(id)
    if (revealedCardIds.has(id))
      return

    revealedCardIds.add(id)
    enteringCardIds.add(id)
    const previousTimer = cardEnterTimers.get(id)
    if (previousTimer)
      clearTimeout(previousTimer)
    cardEnterTimers.set(id, setTimeout(() => {
      enteringCardIds.delete(id)
      cardEnterTimers.delete(id)
    }, 240))
  }

  /**
   * Vertical cards keep the CSS clamp (`--moment-card-description-lines`
   * defaults); only a wide split card stretches its body to the media row and
   * needs the remaining height measured. The key covers every input that
   * changes that height: width, gap, font revision, text and expansion.
   */
  function getDescriptionFitTarget(card: HTMLElement, moment: DisplayMoment | undefined) {
    if (!moment || !supportsWideMomentCardLayout(moment))
      return undefined
    const body = card.querySelector<HTMLElement>('.moment-card__main--video:not(.moment-card__main--live) .moment-card__body')
    const description = body?.querySelector<HTMLElement>('.moment-card__desc')
    if (!body || !description)
      return undefined
    const key = [
      measurementRevision,
      Math.round(measuredCardWidths.get(card) ?? gridCardWidth.value),
      gridGap,
      settings.value.fontFamily,
      settings.value.interfaceFontSize,
      textAutospaceMode.value,
      moment.title,
      getCardPreviewText(moment),
      moment.descInherited ? 1 : 0,
    ].join('\u0000')
    return { body, description, title: body.querySelector<HTMLElement>('.moment-card__title'), key }
  }

  function flushCardLayouts() {
    cardLayoutFlushQueued = false
    if (!active) {
      pendingCardLayouts.clear()
      return
    }
    const batch = [...pendingCardLayouts].flatMap(([id, options]) => {
      const card = cardElements.get(id)
      return card?.isConnected ? [{ id, card, ...options }] : []
    })
    pendingCardLayouts.clear()
    if (!batch.length)
      return

    // 1. Resets only: release the previous fit of cards whose inputs changed.
    const fits = batch.flatMap(({ card, id }) => {
      // An expanded description keeps its natural height until it collapses.
      if (card.dataset.descriptionExpanded === 'true')
        return []
      const target = getDescriptionFitTarget(card, cardMoments.get(id))
      if (!target)
        return []
      if (descriptionFitKeys.get(card) === target.key)
        return []
      descriptionFitKeys.set(card, target.key)
      target.body.style.removeProperty(DESCRIPTION_LINES_PROPERTY)
      return [target]
    })
    // 2. Reads only.
    const lines = fits.map(({ body, description, title }) => {
      const bodyStyle = getComputedStyle(body)
      // Not in the split composition: the CSS default clamp already applies.
      if (bodyStyle.gridColumnStart !== '2')
        return undefined
      const titleStyle = title ? getComputedStyle(title) : undefined
      const occupiedHeight = title
        ? getLayoutHeight(title)
        + Number.parseFloat(titleStyle?.marginTop || '0')
        + Number.parseFloat(titleStyle?.marginBottom || '0')
        : 0
      const availableHeight = body.clientHeight
        - Number.parseFloat(bodyStyle.paddingTop)
        - Number.parseFloat(bodyStyle.paddingBottom)
        - occupiedHeight
      const lineHeight = Number.parseFloat(getComputedStyle(description).lineHeight)
      return Number.isFinite(lineHeight) && lineHeight > 0
        ? String(Math.max(1, Math.floor((availableHeight + 0.5) / lineHeight)))
        : undefined
    })
    // 3. Writes only, skipping unchanged values.
    fits.forEach(({ body }, index) => {
      const value = lines[index]
      if (value !== undefined && body.style.getPropertyValue(DESCRIPTION_LINES_PROPERTY) !== value)
        body.style.setProperty(DESCRIPTION_LINES_PROPERTY, value)
    })
    // 4. One layout for the whole batch, then merge the final heights.
    let changed = false
    for (const { id, card, force } of batch) {
      const measured = Math.round(getLayoutHeight(card))
      if (measured > 0) {
        changed = commitCardHeight(id, measured, force ? { force: true } : undefined) || changed
        if (!readyCardIds.has(id))
          pendingReadyIds.add(id)
      }
      else if (!cardHeights[id]) {
        const moment = cardMoments.get(id)
        if (moment)
          changed = commitCardHeight(id, estimateCardHeight(moment), { force: true }) || changed
      }
    }
    if (pendingReadyIds.size && !cardReadyFrame) {
      // Reveal after the first paint of the batch, once for all its cards.
      cardReadyFrame = requestAnimationFrame(() => {
        cardReadyFrame = 0
        for (const id of pendingReadyIds) {
          if (active && cardElements.has(id))
            markCardReady(id)
        }
        pendingReadyIds.clear()
      })
    }
    if (changed) {
      scheduleVirtualUpdate()
      scheduleBottomRebalance()
    }
  }

  /** Bindings, frames and ResizeObserver deliveries for the same version merge here. */
  function requestCardLayout(id: string, force = false) {
    const pending = pendingCardLayouts.get(id)
    pendingCardLayouts.set(id, { force: force || Boolean(pending?.force) })
    if (cardLayoutFlushQueued)
      return
    cardLayoutFlushQueued = true
    // After the current Vue patch has bound every card, before `nextTick` callers.
    queueMicrotask(flushCardLayouts)
  }

  function bindCardEl(el: Element | null, moment: DisplayMoment) {
    const previous = cardElements.get(moment.id)
    cardMoments.set(moment.id, moment)
    if (previous === el)
      return
    pendingReadyIds.delete(moment.id)
    if (!(el instanceof HTMLElement)) {
      if (previous) {
        cardMeasureObserver?.unobserve(previous)
        visibilityObserver?.unobserve(previous)
        cardElements.delete(moment.id)
      }
      cardMoments.delete(moment.id)
      pendingCardLayouts.delete(moment.id)
      movingDisclosureIds.delete(moment.id)
      visibleMomentIds.delete(moment.id)
      readyCardIds.delete(moment.id)
      enteringCardIds.delete(moment.id)
      const enterTimer = cardEnterTimers.get(moment.id)
      if (enterTimer)
        clearTimeout(enterTimer)
      cardEnterTimers.delete(moment.id)
      hooks.onRecycle(moment.id)
      return
    }

    if (previous && previous !== el) {
      cardMeasureObserver?.unobserve(previous)
      visibilityObserver?.unobserve(previous)
    }

    cardElements.set(moment.id, el)
    cardMeasureObserver?.observe(el)
    visibilityObserver?.observe(el)
    el.dataset.momentId = moment.id
    // 初次挂载写入实测高度（带阈值，避免反复抖）；同一次挂载的卡片合并测量
    requestCardLayout(moment.id)
  }

  function setupVirtualObservers() {
    if (!active)
      return
    cardMeasureObserver?.disconnect()
    visibilityObserver?.disconnect()

    cardMeasureObserver = new ResizeObserver((entries) => {
      let changed = false
      entries.forEach((entry) => {
        const card = entry.target as HTMLElement
        const id = card.dataset.momentId
        if (!id || cardElements.get(id) !== card)
          return
        // Natural column flow already moves siblings during the local reveal.
        // Commit the final height once instead of rerendering the virtual window
        // and checking pagination for every intermediate animation frame.
        if (movingDisclosureIds.has(id))
          return
        measuredCardWidths.set(card, entry.contentRect.width)
        // Changed fit inputs (width, collapse) refit in the shared batch. Comment
        // expansion changes only the footer, so its key stays and nothing refits.
        const target = card.dataset.descriptionExpanded === 'true' ? undefined : getDescriptionFitTarget(card, cardMoments.get(id))
        if (target && descriptionFitKeys.get(card) !== target.key) {
          requestCardLayout(id)
          return
        }
        const next = Math.round(entry.contentRect.height)
        if (commitCardHeight(id, next))
          changed = true
        if (next > 0)
          markCardReady(id)
      })
      if (changed) {
        scheduleVirtualUpdate()
        // 测量变化不再立刻重排整列，避免抖动；仅空闲且列差极大时才 rebalance
        scheduleBottomRebalance()
      }
    })

    visibilityObserver = new IntersectionObserver((entries) => {
      const hidden: string[] = []
      entries.forEach((entry) => {
        const id = (entry.target as HTMLElement).dataset.momentId
        if (!id || cardElements.get(id) !== entry.target)
          return
        if (entry.isIntersecting)
          visibleMomentIds.add(id)
        else
          visibleMomentIds.delete(id)

        // 离开视口时释放该卡预览资源
        if (!entry.isIntersecting && !interactiveCardIds.has(id))
          hidden.push(id)
      })
      hooks.onViewportChange(visibleMomentIds, hidden)
    }, {
      root: scrollViewportRef.value,
      rootMargin: '200px 0px',
      threshold: 0.01,
    })

    // 观察器重建后重新绑定当前虚拟窗口内的卡片
    cardElements.forEach((el) => {
      cardMeasureObserver?.observe(el)
      visibilityObserver?.observe(el)
    })
  }

  function attachViewportScroll() {
    const viewport = scrollViewportRef.value
    if (!viewport || attachedScrollViewport === viewport)
      return
    detachViewportScroll()
    releaseViewportFrame = subscribeViewportFrame(viewport, handleViewportFrame)
    attachedScrollViewport = viewport
    gridOffsetTop = undefined
  }

  function detachViewportScroll() {
    releaseViewportFrame?.()
    releaseViewportFrame = undefined
    attachedScrollViewport = null
  }

  function handleCoverLoad(event: Event, momentId: string) {
    const img = event.target as HTMLImageElement
    if (!img.naturalWidth || !img.naturalHeight)
      return

    const ratio = img.naturalWidth / img.naturalHeight
    const moment = moments.value.find(item => item.id === momentId)
    const nextRatio = Math.max(ratio, MIN_SINGLE_IMAGE_RATIO)
    const prevRatio = coverRatios[momentId]
    coverRatios[momentId] = nextRatio

    // 封面比例变化会改估算高度；若尚未实测稳定，用估算高度更新并补偿滚动
    if (!settledHeights.has(momentId) && (!prevRatio || Math.abs(prevRatio - nextRatio) > 0.01)) {
      if (moment && !cardHeights[momentId]) {
        commitCardHeight(momentId, estimateCardHeight(moment), { force: true })
        scheduleVirtualUpdate()
      }
    }
  }
  watch(() => scrollViewportRef.value, () => {
    if (!active)
      return
    detachViewportScroll()
    attachViewportScroll()
    setupVirtualObservers()
    updateVirtualColumns()
  })
  watch(gridRef, (el, prev) => {
    if (prev && gridObserver)
      gridObserver.unobserve(prev)
    if (el && gridObserver) {
      gridObserver.observe(el)
      updateGridColumnCount()
      updateVirtualColumns()
    }
  })
  watch(
    [() => settings.value.fontFamily, textAutospaceMode, () => settings.value.interfaceFontSize],
    async () => {
      await nextTick()
      if (!active)
        return
      invalidateCardMeasurementsForWidthChange()
      updateVirtualColumns()
    },
  )
  watch(
    momentsGridColumns,
    async () => {
      measurementRevision++
      Object.keys(cardHeights).forEach(key => delete cardHeights[key])
      settledHeights.clear()
      await nextTick()
      if (!active)
        return
      updateGridColumnCount()
      updateVirtualColumns()
    },
  )
  function clearColumns() {
    momentColumns.value = []
    virtualColumns.value = []
    columnHeightIndex.sync([], gridCardWidth.value)
  }
  function reset(nextItems: DisplayMoment[] = []) {
    prependAnchor = undefined
    readingIntent = undefined
    anchorCommit++
    interactiveCardIds.clear()
    movingDisclosureIds.clear()
    const ratios = new Map(nextItems.flatMap(item => coverRatios[item.id] ? [[item.id, coverRatios[item.id]] as const] : []))
    clearColumns()
    Object.keys(cardHeights).forEach(key => delete cardHeights[key])
    Object.keys(coverRatios).forEach(key => delete coverRatios[key])
    ratios.forEach((ratio, id) => coverRatios[id] = ratio)
    readyCardIds.clear()
    enteringCardIds.clear()
    revealedCardIds.clear()
    cardEnterTimers.forEach(timer => clearTimeout(timer))
    cardEnterTimers.clear()
    settledHeights.clear()
    visibleMomentIds.clear()
  }
  onMounted(() => {
    active = true
    const observedWidths = new WeakMap<Element, number>()
    gridObserver = new ResizeObserver((entries) => {
      let changed = false
      entries.forEach((entry) => {
        const previous = observedWidths.get(entry.target)
        observedWidths.set(entry.target, entry.contentRect.width)
        if (previous !== entry.contentRect.width)
          changed = true
      })
      if (!changed)
        return
      updateGridColumnCount()
      updateVirtualColumns()
    })
    void nextTick(() => {
      if (!active)
        return
      for (const element of [layoutRef.value, momentsContentRef.value, gridRef.value]) {
        if (element)
          gridObserver?.observe(element)
      }
      updateGridColumnCount()
      attachViewportScroll()
      setupVirtualObservers()
      updateVirtualColumns()
    })
  })
  onBeforeUnmount(() => {
    active = false
    if (cardReadyFrame)
      cancelAnimationFrame(cardReadyFrame)
    cardReadyFrame = 0
    pendingReadyIds.clear()
    pendingCardLayouts.clear()
    gridObserver?.disconnect()
    cardMeasureObserver?.disconnect()
    visibilityObserver?.disconnect()
    detachViewportScroll()
    if (rebalanceTimer)
      clearTimeout(rebalanceTimer)
    if (cardGeometryFrame)
      cancelAnimationFrame(cardGeometryFrame)
    cardElements.clear()
    cardMoments.clear()
    reset()
  })

  function remove(id: string) {
    // Only the owning column is replaced; the index rebuilds that column alone.
    const location = columnHeightIndex.locate(id)
    const column = location && momentColumns.value[location.column]?.[location.row]?.id === id ? location.column : -1
    momentColumns.value = momentColumns.value.map((items, index) => (column < 0 || index === column) && items.some(item => item.id === id)
      ? items.filter(item => item.id !== id)
      : items)
    feedOrder.delete(id)
    interactiveCardIds.delete(id)
    movingDisclosureIds.delete(id)
    readyCardIds.delete(id)
    enteringCardIds.delete(id)
    visibleMomentIds.delete(id)
    revealedCardIds.delete(id)
    settledHeights.delete(id)
    cardElements.delete(id)
    cardMoments.delete(id)
    pendingCardLayouts.delete(id)
    delete cardHeights[id]
    clearTimeout(cardEnterTimers.get(id))
    cardEnterTimers.delete(id)
    updateVirtualColumns()
  }
  function updateMoment(moment: DisplayMoment) {
    if (cardMoments.has(moment.id))
      cardMoments.set(moment.id, moment)
    // Same key, order and height: replace the entity in place. The column array
    // and its index rows stay; only the window containing the card re-renders.
    const location = columnHeightIndex.locate(moment.id)
    const column = location ? momentColumns.value[location.column] : undefined
    if (column && location && column[location.row]?.id === moment.id)
      column[location.row] = moment
    else
      momentColumns.value = momentColumns.value.map(items => items.map(item => item.id === moment.id ? moment : item))
    updateVirtualColumns()
  }
  function setInteractionHeld(id: string, held: boolean) {
    if (interactiveCardIds.has(id) === held)
      return
    if (held)
      interactiveCardIds.add(id)
    else
      interactiveCardIds.delete(id)
    if (!active)
      return
    updateGridColumnCount()
    scheduleVirtualUpdate()
  }
  function setDisclosureMotion(id: string, moving: boolean) {
    if (moving) {
      movingDisclosureIds.add(id)
      handleMomentCardInteractiveResize()
      return
    }
    if (!movingDisclosureIds.delete(id) || !active)
      return
    const card = cardElements.get(id)
    if (card && commitCardHeight(id, Math.round(getLayoutHeight(card)), { force: true }))
      scheduleVirtualUpdate()
  }
  return { captureAnchor, getCardScrollTop, restoreAnchor, insertBefore, layoutRef, momentsContentRef, gridRef, gridColumnCount, gridCardWidth, readyCardIds, enteringCardIds, virtualColumns, momentsGridStyle, getMomentImageRatio, updateGridColumnCount, handleMomentCardInteractiveResize, updateVirtualColumns, bindCardEl, handleCoverLoad, append, remove, reset, clearColumns, updateMoment, setInteractionHeld, setDisclosureMotion, suspendRebalance(duration: number) {
    suppressBottomRebalanceUntil = Date.now() + duration
  } }
}
