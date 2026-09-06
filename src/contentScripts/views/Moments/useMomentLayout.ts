import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import type { DisplayMoment } from '~/components/MomentCard/types'
import { getCardPreviewText, isCompactPlainTextMoment } from '~/components/MomentCard/utils'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { useLayoutEditSettingValue } from '~/logic/layoutEdit'
import { shouldUseWideMomentCardLayout } from '~/utils/momentCardLayout'
import { createMomentColumnIndex } from '~/utils/momentColumnIndex'
import { resolveMomentCardWidth, resolveMomentGridColumnCount, shouldShowMomentsSidebar } from '~/utils/momentsLayout'

interface LayoutHooks {
  onNearBottom: () => void
  onRecycle: (id: string) => void
  onViewportChange: (visible: ReadonlySet<string>, hidden: string[]) => void
}
/** Owns columns, measurements, visible ranges and their observers; never writes feed data. */
export function useMomentLayout(moments: Ref<DisplayMoment[]>, hooks: LayoutHooks) {
  const { scrollViewportRef } = useBewlyApp()
  let active = false
  interface VirtualColumn {
    topPad: number
    bottomPad: number
    items: DisplayMoment[]
  }
  const momentsGridColumns = useLayoutEditSettingValue(
    'page.moments.gridColumns',
    () => settings.value.momentsGridColumns,
  )
  const showMomentsSidebar = ref(false)
  const momentColumns = ref<DisplayMoment[][]>([])
  const layoutRef = ref<HTMLElement | null>(null)
  const momentsContentRef = ref<HTMLElement | null>(null)
  const gridRef = ref<HTMLElement | null>(null)
  const CARD_MIN_WIDTH = 360
  const GRID_GAP = 16
  const SIDEBAR_WIDTH = 248
  const SIDEBAR_MIN_MAIN_WIDTH = CARD_MIN_WIDTH * 2 + GRID_GAP
  const gridColumnCount = ref(1)
  const gridCardWidth = ref(520)
  let rebalanceTimer: ReturnType<typeof setTimeout> | null = null
  const cardHeights = reactive<Record<string, number>>({})
  const visibleMomentIds = reactive(new Set<string>())
  const readyCardIds = reactive(new Set<string>())
  const enteringCardIds = reactive(new Set<string>())
  const revealedCardIds = new Set<string>()
  const cardEnterTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const cardReadyFrames = new Map<string, number>()
  const cardElements = new Map<string, HTMLElement>()
  const virtualColumns = ref<VirtualColumn[]>([])
  const coverRatios = reactive<Record<string, number>>({})
  const MIN_SINGLE_IMAGE_RATIO = 1 / 2
  let gridObserver: ResizeObserver | undefined
  const OVERSCAN_PX = 1200
  let attachedScrollViewport: HTMLElement | null = null
  let cardMeasureObserver: ResizeObserver | undefined
  let visibilityObserver: IntersectionObserver | undefined
  let lastScrollAt = 0
  let virtualRaf = 0
  let cardGeometryFrame = 0
  let suppressBottomRebalanceUntil = 0
  const settledHeights = new Set<string>()
  const columnHeightIndex = createMomentColumnIndex<DisplayMoment>(item => item.id, getCardHeight, GRID_GAP)
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
      const mediaWidth = Math.max(1, (columnWidth - GRID_GAP * 3) * 0.6)
      const mediaRatio = moment.isVideo || moment.isLive ? 16 / 9 : getMomentImageRatio(moment)
      const mediaHeight = mediaWidth / mediaRatio
      const bodyWidth = Math.max(160, (columnWidth - GRID_GAP * 3) * 0.4 - GRID_GAP * 2)
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
    if (moment.forward?.images?.length) {
      const introLines = Math.min(7, Math.max(1, Math.ceil((moment.text || '').length / 28)))
      const firstImageRatio = moment.forward.imageRatios?.[0]
      const singleImageRatio = typeof firstImageRatio === 'number' && Number.isFinite(firstImageRatio) && firstImageRatio > 0
        ? Math.min(2, Math.max(0.5, firstImageRatio))
        : 1
      const galleryRatio = moment.forward.images.length === 1
        ? singleImageRatio
        : moment.forward.images.length <= 3
          ? moment.forward.images.length
          : moment.forward.images.length <= 4
            ? 1
            : moment.forward.images.length <= 6
              ? 3 / 2
              : 1
      // Forward galleries sit inside the bordered card with 12px side/bottom
      // insets; subtract the 16px main inset and the 2px card border as well.
      const galleryWidth = Math.max(1, columnWidth - 58)
      return 190 + introLines * 21 + Math.round(galleryWidth / galleryRatio) + additionalHeight + interactionHeight
    }
    if (moment.forward?.video) {
      const introLines = Math.min(7, Math.max(1, Math.ceil((moment.text || '').length / 28)))
      const forwardMediaWidth = Math.max(150, (columnWidth - 32) * 0.44)
      return 117 + Math.round(forwardMediaWidth * 9 / 16) + introLines * 21 + additionalHeight + interactionHeight
    }
    if (moment.isChargeExclusive && !moment.isVideo)
      return 230 + scaledTextBodyExtra + additionalHeight + interactionHeight
    if (columnWidth < CARD_MIN_WIDTH) {
      if (moment.isLive)
        return Math.round(columnWidth * 9 / 16) + 210 + additionalHeight + interactionHeight
    }
    if (moment.isLive)
      return Math.round((columnWidth - 32) * 9 / 16) + 190 + additionalHeight + interactionHeight
    if (moment.isVideo) {
      const contentWidth = Math.max(1, columnWidth - 32)
      const charsPerLine = Math.max(12, Math.floor(contentWidth / 15))
      const titleLines = moment.title ? Math.min(2, Math.max(1, Math.ceil(moment.title.length / charsPerLine))) : 0
      const description = getCardPreviewText(moment)
      const descriptionMaxLines = moment.descInherited ? 2 : 3
      const descriptionLines = description ? Math.min(descriptionMaxLines, Math.max(1, Math.ceil(description.length / charsPerLine))) : 0
      const bodyHeight = titleLines * 22 + descriptionLines * 24 + (titleLines && descriptionLines ? 8 : 0)
      return Math.round(contentWidth * 9 / 16) + 116 + bodyHeight + additionalHeight + interactionHeight
    }
    if (moment.images.length && !moment.isVideo && !moment.isLive) {
      const galleryRatio = moment.images.length === 1
        ? getMomentImageRatio(moment)
        : moment.images.length <= 3
          ? moment.images.length
          : moment.images.length <= 4
            ? 1
            : moment.images.length <= 6
              ? 3 / 2
              : 1
      return Math.round((columnWidth - 32) / galleryRatio) + 220 + additionalHeight + interactionHeight
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

  function getColumnStackHeight(column: DisplayMoment[]) {
    if (!column.length)
      return 0
    return column.reduce((sum, moment, index) => {
      return sum + getCardHeight(moment) + (index > 0 ? GRID_GAP : 0)
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

  function balanceColumnBottoms(columns: DisplayMoment[][]) {
    const next = columns.map(column => [...column])
    if (next.length < 2)
      return { columns: next, changed: false }

    const sourceOrder = new Map(moments.value.map((moment, index) => [moment.id, index]))
    let changed = false
    const maxMoves = Math.min(moments.value.length, 24)

    for (let moveCount = 0; moveCount < maxMoves; moveCount++) {
      const heights = next.map(column => getColumnStackHeight(column))
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
            candidateHeights[sourceIndex] -= itemHeight + GRID_GAP
            candidateHeights[targetIndex] += itemHeight + (target.length ? GRID_GAP : 0)
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
      const [moved] = next[sourceIndex].splice(itemIndex, 1)
      next[targetIndex].push(moved)
      next[targetIndex].sort((a, b) => (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0))
      changed = true
    }

    return { columns: next, changed }
  }

  function redistributeColumns() {
    const count = Math.max(1, gridColumnCount.value)
    const next = Array.from({ length: count }, () => [] as DisplayMoment[])
    const heights = Array.from({ length: count }, () => 0)

    moments.value.forEach((item) => {
      const columnIndex = findShortestColumnIndex(next, heights)
      next[columnIndex].push(item)
      heights[columnIndex] += (heights[columnIndex] > 0 ? GRID_GAP : 0) + getCardHeight(item)
    })

    momentColumns.value = balanceColumnBottoms(next).columns
    updateVirtualColumns()
  }

  function invalidateCardMeasurementsForWidthChange() {
    Object.keys(cardHeights).forEach(id => delete cardHeights[id])
    settledHeights.clear()
    if (cardGeometryFrame)
      cancelAnimationFrame(cardGeometryFrame)
    cardGeometryFrame = requestAnimationFrame(() => {
      cardGeometryFrame = 0
      cardElements.forEach((element, id) => {
        fitVideoCardDescription(element)
        const height = element.getBoundingClientRect().height
        if (height > 0)
          commitCardHeight(id, height, { force: true })
      })
      updateVirtualColumns()
      hooks.onNearBottom()
    })
  }

  function updateGridColumnCount() {
    const layoutWidth = layoutRef.value?.clientWidth || window.innerWidth
    const mainRailWidth = momentsContentRef.value?.clientWidth || layoutWidth
    const hasSidebarContent = settings.value.momentsSidebarShowUserCard
      || settings.value.momentsSidebarShowPublish
      || settings.value.momentsSidebarShowLive
    showMomentsSidebar.value = shouldShowMomentsSidebar({
      layoutWidth,
      sidebarWidth: SIDEBAR_WIDTH,
      gap: GRID_GAP,
      minMainWidth: SIDEBAR_MIN_MAIN_WIDTH,
      hasContent: hasSidebarContent,
    })

    const preferredColumns = Math.min(3, Math.max(1, Number(momentsGridColumns.value) || 3))
    const nextCols = resolveMomentGridColumnCount({
      containerWidth: mainRailWidth,
      preferredColumns,
      minCardWidth: CARD_MIN_WIDTH,
      gap: GRID_GAP,
    })
    const gridClientWidth = gridRef.value?.clientWidth || mainRailWidth
    const nextCardWidth = resolveMomentCardWidth({
      gridClientWidth,
      columns: nextCols,
      gap: GRID_GAP,
    })

    const colsChanged = nextCols !== gridColumnCount.value
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

    const columnHeights = momentColumns.value.map(column => getColumnStackHeight(column))

    items.forEach((item) => {
      const columnIndex = findShortestColumnIndex(momentColumns.value, columnHeights)
      momentColumns.value[columnIndex].push(item)
      columnHeights[columnIndex] += (columnHeights[columnIndex] > 0 ? GRID_GAP : 0) + getCardHeight(item)
    })
    // 初始布局可整体平衡；分页只追加，不能搬动用户正在查看的旧卡片
    if (wasEmpty)
      momentColumns.value = balanceColumnBottoms(momentColumns.value).columns
    updateVirtualColumns()
    scheduleBottomRebalance()
  }

  function scheduleBottomRebalance() {
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
      const viewport = scrollViewportRef.value
      if (viewport) {
        const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        // 分页加载区不再缩短最高列，避免最大 scrollTop 变化把滚动位置向上夹回
        if (distanceFromBottom < viewport.clientHeight * 1.25)
          return
      }
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

  function scheduleVirtualUpdate() {
    if (!active || virtualRaf)
      return
    virtualRaf = window.requestAnimationFrame(() => {
      virtualRaf = 0
      updateVirtualColumns()
      hooks.onNearBottom()
    })
  }

  function getGridOffsetTop() {
    const grid = gridRef.value
    const viewport = scrollViewportRef.value
    if (!grid || !viewport)
      return 0

    const gridRect = grid.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    return gridRect.top - viewportRect.top + viewport.scrollTop
  }

  function updateVirtualColumns() {
    if (!momentColumns.value.length) {
      virtualColumns.value = []
      return
    }

    const viewport = scrollViewportRef.value
    const scrollTop = viewport?.scrollTop ?? 0
    const viewportHeight = viewport?.clientHeight ?? window.innerHeight
    const gridOffsetTop = getGridOffsetTop()
    const viewStart = scrollTop - OVERSCAN_PX
    const viewEnd = scrollTop + viewportHeight + OVERSCAN_PX
    columnHeightIndex.sync(momentColumns.value, gridCardWidth.value)
    virtualColumns.value = columnHeightIndex.window(viewStart - gridOffsetTop, viewEnd - gridOffsetTop)

    hooks.onViewportChange(visibleMomentIds, [])
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

  function fitVideoCardDescription(card: HTMLElement) {
    if (card.dataset.descriptionExpanded === 'true')
      return

    const body = card.querySelector<HTMLElement>('.moment-card__main--video:not(.moment-card__main--live) .moment-card__body')
    const description = body?.querySelector<HTMLElement>('.moment-card__desc')
    if (!body || !description)
      return

    // 先解除上一次测量得到的限制，让纵向卡片也能按当前宽高重新展开。
    body.style.removeProperty('--moment-card-description-lines')

    const bodyStyle = getComputedStyle(body)
    const title = body.querySelector<HTMLElement>('.moment-card__title')
    const titleStyle = title ? getComputedStyle(title) : undefined
    const occupiedHeight = title
      ? title.getBoundingClientRect().height
      + Number.parseFloat(titleStyle?.marginTop || '0')
      + Number.parseFloat(titleStyle?.marginBottom || '0')
      : 0
    const availableHeight = body.clientHeight
      - Number.parseFloat(bodyStyle.paddingTop)
      - Number.parseFloat(bodyStyle.paddingBottom)
      - occupiedHeight
    const lineHeight = Number.parseFloat(getComputedStyle(description).lineHeight)

    if (!Number.isFinite(lineHeight) || lineHeight <= 0)
      return

    const visibleLines = Math.max(1, Math.floor((availableHeight + 0.5) / lineHeight))
    body.style.setProperty('--moment-card-description-lines', String(visibleLines))
  }

  function bindCardEl(el: Element | null, moment: DisplayMoment) {
    const pendingFrame = cardReadyFrames.get(moment.id)
    if (pendingFrame !== undefined)
      cancelAnimationFrame(pendingFrame)
    cardReadyFrames.delete(moment.id)
    const previous = cardElements.get(moment.id)
    if (!(el instanceof HTMLElement)) {
      if (previous) {
        cardMeasureObserver?.unobserve(previous)
        visibilityObserver?.unobserve(previous)
        cardElements.delete(moment.id)
      }
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
    fitVideoCardDescription(el)

    // 初次挂载写入实测高度（带阈值，避免反复抖）
    const measured = Math.round(el.getBoundingClientRect().height)
    if (measured > 0) {
      commitCardHeight(moment.id, measured)
      const frame = requestAnimationFrame(() => {
        cardReadyFrames.delete(moment.id)
        if (active && cardElements.get(moment.id) === el) {
          fitVideoCardDescription(el)
          markCardReady(moment.id)
        }
      })
      cardReadyFrames.set(moment.id, frame)
    }
    else if (!cardHeights[moment.id]) {
      cardHeights[moment.id] = estimateCardHeight(moment)
    }
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
        fitVideoCardDescription(card)
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
        if (!entry.isIntersecting)
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

  function handleViewportScroll() {
    lastScrollAt = Date.now()
    scheduleVirtualUpdate()
  }

  function attachViewportScroll() {
    const viewport = scrollViewportRef.value
    if (!viewport || attachedScrollViewport === viewport)
      return
    detachViewportScroll()
    viewport.addEventListener('scroll', handleViewportScroll, { passive: true })
    attachedScrollViewport = viewport
  }

  function detachViewportScroll() {
    attachedScrollViewport?.removeEventListener('scroll', handleViewportScroll)
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
    [
      () => settings.value.momentsSidebarShowUserCard,
      () => settings.value.momentsSidebarShowPublish,
      () => settings.value.momentsSidebarShowLive,
    ],
    async () => {
      await nextTick()
      if (!active)
        return
      updateGridColumnCount()
    },
  )
  watch(
    momentsGridColumns,
    async () => {
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
    gridObserver = new ResizeObserver(() => {
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
    cardReadyFrames.forEach(frame => cancelAnimationFrame(frame))
    cardReadyFrames.clear()
    gridObserver?.disconnect()
    cardMeasureObserver?.disconnect()
    visibilityObserver?.disconnect()
    detachViewportScroll()
    if (rebalanceTimer)
      clearTimeout(rebalanceTimer)
    if (virtualRaf)
      cancelAnimationFrame(virtualRaf)
    if (cardGeometryFrame)
      cancelAnimationFrame(cardGeometryFrame)
    cardElements.clear()
    reset()
  })

  function updateMoment(moment: DisplayMoment) {
    momentColumns.value = momentColumns.value.map(column => column.map(item => item.id === moment.id ? moment : item))
    updateVirtualColumns()
  }
  return { showMomentsSidebar, layoutRef, momentsContentRef, gridRef, gridColumnCount, gridCardWidth, readyCardIds, enteringCardIds, virtualColumns, momentsGridStyle, getMomentImageRatio, updateGridColumnCount, handleMomentCardInteractiveResize, updateVirtualColumns, bindCardEl, handleCoverLoad, append, reset, clearColumns, updateMoment, suspendRebalance(duration: number) {
    suppressBottomRebalanceUntil = Date.now() + duration
  } }
}
