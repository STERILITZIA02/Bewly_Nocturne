<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import CloseButton from '~/components/CloseButton.vue'
import Dialog from '~/components/Dialog.vue'
import IconButton from '~/components/IconButton.vue'
import LibraryWorkspace from '~/components/LibraryWorkspace.vue'
import Loading from '~/components/Loading.vue'
import LoadingFill from '~/components/LoadingFill.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import MomentCard from '~/components/MomentCard/MomentCard.vue'
import MomentCardSkeleton from '~/components/MomentCard/MomentCardSkeleton.vue'
import { createMomentDisclosureCache, MOMENT_DISCLOSURES, normalizeForwardCount } from '~/components/MomentCard/momentForwardContent'
import { createMomentForwardTransactions, MOMENT_FORWARD_TRANSACTIONS } from '~/components/MomentCard/momentForwardTransactions'
import MomentReportDialog from '~/components/MomentCard/MomentReportDialog.vue'
import type { DisplayMoment } from '~/components/MomentCard/types'
import { getMomentSkeletonVariant } from '~/components/MomentCard/utils'
import MomentReadMarker from '~/components/MomentReadMarker.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { useLayoutMotion } from '~/composables/useLayoutMotion'
import { useLoadingRingPhase } from '~/composables/useLoadingRingPhase'
import { usePageSearchIntent } from '~/composables/usePageSearchIntent'
import { usePageViewState } from '~/composables/usePageViewState'
import { MOMENTS_DETAIL_LAYOUT } from '~/constants/layout'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'
import { parseDedeUserID } from '~/logic/loginStatus'
import { momentFilterPolicy } from '~/logic/momentFilters'
import { recordUploaderLatestVideoTimes } from '~/logic/uploaderLatestVideoTimes'
import { useTopBarStore } from '~/stores/topBarStore'
import type { AccountId } from '~/utils/accountScope'
import { isSameAccount } from '~/utils/accountScope'
import api from '~/utils/api'
import { createElasticWheelScroll } from '~/utils/elasticScroll'
import { isExtensionContextInvalidatedError, reportRuntimeFailure } from '~/utils/messaging'
import { createMomentCommentSessionCache, MOMENT_COMMENT_SESSIONS } from '~/utils/momentCommentSession'
import { resolveHorizontalScrollState } from '~/utils/momentsLayout'
import type { MomentGap, MomentJoinStatus, MomentUnreadSnapshot } from '~/utils/momentsReadPosition'
import { dynamicId, isNotNewerMoment, keepMomentAnchorInterval, MOMENTS_LATEST_OFFSET } from '~/utils/momentsReadPosition'
import { dissolveElements } from '~/utils/particleDissolve'
import type { ScrollCardAnchor, ScrollPositionClaim } from '~/utils/scrollIntent'
import { canRestoreScrollPosition, claimScrollPosition, scrollToPosition } from '~/utils/scrollIntent'
import { getRemainingScroll, invalidateViewportGeometry, readViewportGeometry } from '~/utils/viewportGeometry'

import { createMomentAdapter } from './momentAdapter'
import { createMomentFeedReader } from './momentFeedReader'
import type { MomentFilter } from './momentFeedTypes'
import type { MomentsPortalLiveUser, MomentsPortalUser } from './momentPortal'
import { getSidebarAvatarUrl } from './momentPortal'
import MomentsContentLayout from './MomentsContentLayout.vue'
import type { MomentSearch } from './momentSearch'
import { EMPTY_MOMENT_SEARCH, getMomentSearchCutoff, isMomentSearchActive, matchesMomentSearch } from './momentSearch'
import MomentsHotSearch from './MomentsHotSearch.vue'
import MomentsReadingActions from './MomentsReadingActions.vue'
import MomentsSidebar from './MomentsSidebar.vue'
import { useMomentActions } from './useMomentActions'
import { useMomentDetail } from './useMomentDetail'
import { useMomentLayout } from './useMomentLayout'
import { useMomentPreviews } from './useMomentPreviews'

interface MomentsPortalUpItem {
  face: string
  has_update: boolean
  is_reserve_recall?: boolean
  mid: string
  uname: string
}

interface MomentsPortalUpListItem {
  face?: string
  has_update?: boolean
  is_reserve_recall?: boolean
  mid?: string | number
  uname?: string
}

interface MomentsPortalUpList {
  has_more?: boolean
  items?: MomentsPortalUpListItem[]
}

interface MomentsPortalResult {
  code: number
  data?: {
    my_info?: MomentsPortalUser
    live_users?: {
      count?: number
      items?: MomentsPortalLiveUser[]
    }
    /** 真实接口为 { has_more, items }；兼容历史数组形态 */
    up_list?: MomentsPortalUpList | MomentsPortalUpListItem[]
  }
}

/** 动态流 features：补齐 opus 图文与充电列表字段 */
const toast = useToast()
const { t } = useI18n()
const { mapMoment, collectVideoPublicationTimes } = createMomentAdapter(t, resolveMomentForwardCount)
const topBarStore = useTopBarStore()

const viewState = usePageViewState('moments')
// Accepted feed. Appends and removals replace the root; a confirmed entity
// patch replaces one element in place (cards render from the layout window,
// parked view state holds its own slice), so no full list copy is made.
const moments = viewState.shallowRef<DisplayMoment[]>('items', [])
let indexedMoments: DisplayMoment[] | undefined
const momentPositions = new Map<string, number>()
/** Id → position of the current root, rebuilt only after a replacement other than an append. */
function getMomentPositions() {
  if (indexedMoments !== moments.value) {
    indexedMoments = moments.value
    momentPositions.clear()
    indexedMoments.forEach((moment, index) => momentPositions.set(moment.id, index))
  }
  return momentPositions
}
function findMoment(id: string) {
  const index = getMomentPositions().get(id)
  return index === undefined ? undefined : moments.value[index]
}
const momentActions = useMomentActions(getMomentActionAccount, applyMomentPatch, removeMomentFromViews)
const { likingMomentIds, reservationLoadingMomentIds, toggleMomentLike, toggleMomentReservation, isWatchLaterAdded, isWatchLaterLoading, toggleMomentWatchLater } = momentActions
const previews = useMomentPreviews(getCurrentAccountId)
const { hoveredMediaId, previewUrls, previewState, previewGeneration, handleMediaEnter, handleMediaLeave, bindPreviewVideo } = previews

const momentLayout = useMomentLayout(moments, {
  onReadAnchor: rememberMomentReading,
  onNearBottom: maybeLoadMoreNearBottom,
  onRecycle: previews.release,
  onViewportChange: (visible, hidden) => {
    syncInteractionInView(visible)
    for (const id of hidden) {
      if (hoveredMediaId.value !== id)
        previews.release(id)
    }
    previews.prune(visible)
  },
})
const { layoutRef, momentsContentRef, gridRef, gridColumnCount, gridCardWidth, readyCardIds, enteringCardIds, virtualColumns, momentsGridStyle, getMomentImageRatio, updateGridColumnCount, handleMomentCardInteractiveResize, updateVirtualColumns, bindCardEl, handleCoverLoad } = momentLayout
const detailDialogRef = ref<InstanceType<typeof Dialog> | null>(null)
const details = useMomentDetail(getMomentImageRatio, () => previews.clear(), () => detailDialogRef.value?.close())
const { selectedMoment, detailFrameUrl, detailFrameLoaded, isOpusDetailMoment, detailDialogHeight, detailDialogWidth, detailContentHeight, clearDetailFocusRetry, bindDetailIframe, openDetailFrameInNewTab, openMomentDetail, handleDetailIframeLoad, closeMomentDetail } = details
const activeMomentFilter = viewState.ref<MomentFilter>('filter', 'all')
/** The rail's search and filter; it narrows every category and uploader feed. */
const momentSearch = viewState.shallowRef<MomentSearch>('search', EMPTY_MOMENT_SEARCH)
const feedReader = createMomentFeedReader(mapMoment)
const portalUser = viewState.ref<MomentsPortalUser | null>('portalUser', null)
const portalLiveUsers = viewState.ref<MomentsPortalLiveUser[]>('portalLiveUsers', [])
const portalLiveCount = viewState.ref('portalLiveCount', 0)
const portalUpList = viewState.ref<MomentsPortalUpItem[]>('portalUpList', [])
const portalLoaded = viewState.ref('portalLoaded', false)
/** 选中的经常访问 UP 主 mid；空字符串表示“全部动态” */
const selectedHostMid = viewState.ref('hostMid', '')
const isPortalLoading = ref(!viewState.restored)
const upListScrollerRef = ref<HTMLElement | null>(null)
// The bar keeps its sideways position across visits (user request).
const upListScrollLeft = viewState.ref('upListScrollLeft', 0)
let upListRestorePending = false
const upListTrackRef = ref<HTMLElement | null>(null)
const canScrollUpListLeft = ref(false)
const canScrollUpListRight = ref(false)
let upListResizeObserver: ResizeObserver | undefined
let upListStateFrame: number | undefined
let upListElastic: ReturnType<typeof createElasticWheelScroll> | undefined
/** The scroll buttons are kept for a coming redesign and hidden until then. */
const SHOW_UP_LIST_ARROWS = false

const forwardCountOverrides = new Map<string, number>()

/** 封面宽高比（宽/高），用于单图布局、详情视频比例兜底和虚拟列表测量 */

const isLoading = ref(false)
const isInitialLoading = ref(!viewState.restored)
const feedRequestFailed = ref(false)
/** The server reports more but a page made no progress: pause automation, not "no more". */
const noMoreContent = viewState.ref('noMoreContent', false)
const offset = viewState.ref('offset', '')
const updateBaseline = viewState.ref('updateBaseline', '')
/** 按 UP 主筛选时 feed/all 的 page，从 1 递增 */
const momentsFeedPage = viewState.ref('page', 1)
const entryUnread = viewState.shallowRef<MomentUnreadSnapshot | undefined>('entryUnread', undefined)
const readingBookmark = viewState.shallowRef<{ id: string, offset: number, type: MomentFilter } | undefined>('readingBookmark', undefined)
const newerGap = viewState.shallowRef<MomentGap | undefined>('newerGap', undefined)
const newestRawId = viewState.ref('newestRawId', '')
const atLatest = viewState.ref('atLatest', true)
const joinStatus = viewState.ref<MomentJoinStatus>('joinStatus', 'connected')
const loadingNewer = ref(false)
const readingBoundary = viewState.shallowRef<{ id: string, local: boolean } | undefined>('readingBoundary', undefined)
/** The card at the top of the reader's view, updated as they scroll; empty at the top of a fresh list. */
const readingAnchorId = viewState.ref('readingAnchorId', '')
/**
 * The last card the reader worked with in this feed: opened, expanded, liked,
 * commented on, forwarded, right-clicked, or rested the pointer on. `offset` is
 * where its top sat in the view, so the jump restores the same view.
 */
const lastInteraction = viewState.shallowRef<{ id: string, offset: number, type: MomentFilter, host: string } | undefined>('lastInteraction', undefined)
const interactionInView = ref(true)
/** A plain flag: written every viewport frame, it triggers only when it flips. */
function syncInteractionInView(visible: ReadonlySet<string>) {
  interactionInView.value = !!lastInteraction.value && visible.has(lastInteraction.value.id)
}
const canResumeMoments = computed(() => !selectedHostMid.value && ['all', 'video'].includes(activeMomentFilter.value))
const matchingBookmark = computed(() => readingBookmark.value?.type === activeMomentFilter.value ? readingBookmark.value : undefined)
const boundaryId = computed(() => {
  if (!canResumeMoments.value)
    return
  const boundary = readingBoundary.value?.id
  const threshold = boundary && (readingBoundary.value?.local ? boundary : String(BigInt(boundary) - 1n))
  return threshold ? moments.value.find(item => isNotNewerMoment(item.id, threshold))?.id : undefined
})
const gapBoundaryId = computed(() => newerGap.value ? moments.value.find(item => isNotNewerMoment(item.id, newerGap.value!.targetId))?.id : undefined)
function rememberMomentReading(anchor: { id: string, offset: number }) {
  if (!dynamicId(anchor.id))
    return
  readingAnchorId.value = anchor.id
  if (!canResumeMoments.value)
    return
  readingBookmark.value = { ...anchor, type: activeMomentFilter.value }
}
/** The resume target for the next 'resume' load. */
let pendingResume: { id: string, offset: number } | undefined
/** The reader's position: the card at the top of the view, or the first card before any scrolling. */
const readingPositionId = computed(() => readingAnchorId.value || moments.value[0]?.id || '')
/** Latest is useful when the list does not start at the newest posts or the reader has scrolled away from them. */
const showJumpToLatest = computed(() => moments.value.length > 0
  && (!atLatest.value || readingPositionId.value !== moments.value[0]?.id))
if (viewState.restored)
  feedReader.restore(moments.value, activeMomentFilter.value, selectedHostMid.value)
const { handlePageRefresh, handleReachBottom, scrollViewportRef } = useBewlyApp()
const interactionTarget = computed(() => {
  const target = lastInteraction.value
  return target && target.type === activeMomentFilter.value && target.host === selectedHostMid.value ? target : undefined
})
function rememberInteraction(element: EventTarget | null) {
  const id = element instanceof Element ? element.closest<HTMLElement>('[data-moment-id]')?.dataset.momentId : undefined
  const viewport = scrollViewportRef.value
  const top = id && dynamicId(id) ? momentLayout.getCardScrollTop(id) : undefined
  if (!id || !viewport || top === undefined)
    return
  lastInteraction.value = { id, offset: top - viewport.scrollTop, type: activeMomentFilter.value, host: selectedHostMid.value }
  interactionInView.value = true
}
/** Resting the pointer on a card counts once it stays there, without scrolling, for this long. */
const HOVER_DWELL_MS = 600
let hoverCard: Element | undefined
let hoverTimer: ReturnType<typeof setTimeout> | undefined
function handleGridPointerOver(event: PointerEvent) {
  const card = event.pointerType === 'mouse' && event.target instanceof Element ? event.target.closest('[data-moment-id]') : null
  if (!card || (card === hoverCard && hoverTimer))
    return
  hoverCard = card
  clearTimeout(hoverTimer)
  const scrollTop = scrollViewportRef.value?.scrollTop
  hoverTimer = setTimeout(() => {
    hoverTimer = undefined
    // A card that only slid under a resting pointer while scrolling, or one already left, does not count.
    if (card.matches(':hover') && scrollViewportRef.value?.scrollTop === scrollTop)
      rememberInteraction(card)
  }, HOVER_DWELL_MS)
}
// The template reads only these booleans: the reading position and the
// in-view flag change as cards scroll past, and an object read there would
// re-render the whole page during scrolling.
/** Back to the last card worked with, while it is out of view and still reachable. */
const showJumpToLastSeen = computed(() => {
  const target = interactionTarget.value
  return !!target && !interactionInView.value && (canResumeMoments.value || getMomentPositions().has(target.id))
})

const MAX_POST_LOAD_AUTOFILL_PAGES = 3
// All-filtered batches yield before continuing; this is a one-shot continuation,
// not polling. Every continuation rechecks visibility, cursor ownership and size.
const FILTERED_FEED_YIELD_MS = 800
let autoFillTimer: ReturnType<typeof setTimeout> | undefined
/** 虚拟瀑布流需要在全局哨兵进入视口前主动预取，避免高度修正后漏掉相交事件 */
const LOAD_MORE_AHEAD_PX = 640

/** 最近滚动时间，用于避免滚动中重排导致抖动 */

/** Accepted batches; a newer commit, refresh, account or view change retires older layout work. */
let layoutCommit = 0
let settlingLayoutCommit = 0
const visibilityWaiters = new Set<() => void>()
let feedRequestToken = 0
let portalRequestToken = 0
let portalRequestController: AbortController | undefined
let momentsMounted = false
let momentsExtensionContextInvalidated = false
let loadedAccountId: AccountId = getCurrentAccountId()
const commentAccountIdentity = () => `${topBarStore.userInfo.mid || 'guest'}:${getCurrentAccountId() ?? 'guest'}`
const commentSessions = createMomentCommentSessionCache(commentAccountIdentity())
const disclosureCache = createMomentDisclosureCache()
const forwardTransactions = createMomentForwardTransactions(getMomentActionAccount, handleMomentForwardCountChange)
provide(MOMENT_FORWARD_TRANSACTIONS, forwardTransactions)
onScopeDispose(forwardTransactions.dispose)
provide(MOMENT_DISCLOSURES, disclosureCache)
watch(commentAccountIdentity, () => disclosureCache.clear(), { flush: 'sync' })
onScopeDispose(disclosureCache.clear)
provide(MOMENT_COMMENT_SESSIONS, commentSessions)
watch(commentAccountIdentity, accountId => commentSessions.setAccount(accountId), { flush: 'sync' })

/** 高度已稳定的卡片，避免反复 Resize 微抖动 */

const showMomentsUpList = computed(() =>
  settings.value.momentsShowUpList
  && (isPortalLoading.value || portalUpList.value.length > 0),
)

function getCurrentAccountId(): AccountId {
  return parseDedeUserID(document.cookie) ?? null
}

function getMomentActionAccount(): AccountId {
  return isSameAccount(loadedAccountId, getCurrentAccountId()) ? loadedAccountId : null
}

function extractPortalUpListItems(
  upList: MomentsPortalUpList | MomentsPortalUpListItem[] | undefined,
): MomentsPortalUpListItem[] {
  if (!upList)
    return []
  if (Array.isArray(upList))
    return upList
  if (Array.isArray(upList.items))
    return upList.items
  return []
}

function normalizePortalUpList(list: MomentsPortalResult['data'] | undefined): MomentsPortalUpItem[] {
  const rawList = extractPortalUpListItems(list?.up_list)

  return rawList.reduce<MomentsPortalUpItem[]>((items, item) => {
    if (!item || item.mid == null || item.mid === '')
      return items

    const uname = String(item.uname || '').trim()
    if (!uname)
      return items

    items.push({
      face: String(item.face || ''),
      has_update: Boolean(item.has_update),
      is_reserve_recall: Boolean(item.is_reserve_recall),
      mid: String(item.mid),
      uname,
    })
    return items
  }, [])
}

/** 图文保留自己的布局；播放器与图文弹窗都严格受可用视口约束。 */

/** 关闭详情时销毁 iframe 文档与媒体，避免内存堆积 */

function resolveMomentForwardCount(momentId: string, value: unknown): number {
  const serverCount = normalizeForwardCount(value)
  const key = `${getCurrentAccountId()}:${momentId}`
  const override = forwardCountOverrides.get(key)
  if (override === undefined)
    return serverCount
  if (serverCount >= override) {
    forwardCountOverrides.delete(key)
    return serverCount
  }
  return override
}

function handleMomentFilterChange(filter: MomentFilter) {
  if (activeMomentFilter.value === filter)
    return

  previews.clear()
  activeMomentFilter.value = filter
  if (scrollViewportRef.value)
    scrollToPosition(scrollViewportRef.value, 0)
  void loadMoments(true)
}

function clearUpUpdateDot(mid: string) {
  if (!mid)
    return
  const target = portalUpList.value.find(up => up.mid === mid)
  if (target && target.has_update)
    target.has_update = false
}

function prepareMomentListTransition() {
  previews.clear()
  if (scrollViewportRef.value)
    scrollToPosition(scrollViewportRef.value, 0)
}

/** 选择“全部动态”或某个经常访问的 UP 主；切换时 reset 列表与分页 */
function handleUpFilterChange(mid = '') {
  const nextMid = mid ? String(mid) : ''
  if (selectedHostMid.value === nextMid)
    return

  prepareMomentListTransition()
  selectedHostMid.value = nextMid
  feedReader.reset()
  if (nextMid)
    clearUpUpdateDot(nextMid)
  void loadMoments(true)
}

function handleUpListWheel(event: WheelEvent) {
  upListElastic?.handleWheel(event)
}

function updateUpListScrollState() {
  const scroller = upListScrollerRef.value
  if (!scroller) {
    canScrollUpListLeft.value = false
    canScrollUpListRight.value = false
    return
  }

  const state = resolveHorizontalScrollState({
    scrollLeft: scroller.scrollLeft,
    scrollWidth: scroller.scrollWidth,
    clientWidth: scroller.clientWidth,
  })
  canScrollUpListLeft.value = state.canScrollLeft
  canScrollUpListRight.value = state.canScrollRight
  if (!upListRestorePending) {
    upListScrollLeft.value = scroller.scrollLeft
    return
  }
  // A remounted bar returns to where it was once its row is long enough (or
  // has finished loading, when it is shorter now).
  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
  if (maxScrollLeft < upListScrollLeft.value && isPortalLoading.value)
    return
  upListRestorePending = false
  scroller.scrollLeft = Math.min(upListScrollLeft.value, maxScrollLeft)
}

function scheduleUpListStateUpdate() {
  if (upListStateFrame !== undefined)
    return
  upListStateFrame = requestAnimationFrame(() => {
    upListStateFrame = undefined
    updateUpListScrollState()
  })
}

function scrollUpListBy(direction: -1 | 1) {
  const scroller = upListScrollerRef.value
  if (!scroller)
    return

  const distance = Math.max(Math.round(scroller.clientWidth * 0.65), 180)
  scroller.scrollBy({ left: distance * direction, behavior: 'smooth' })
}

function setupUpListScrollerObserver() {
  upListResizeObserver?.disconnect()
  upListResizeObserver = undefined
  upListElastic?.dispose()
  upListElastic = undefined
  const scroller = upListScrollerRef.value
  if (!scroller)
    return

  // Wheel and trackpad scroll the row (vertical wheels too) and stretch past its ends.
  if (upListTrackRef.value)
    upListElastic = createElasticWheelScroll(scroller, upListTrackRef.value)

  upListRestorePending = true
  upListResizeObserver = new ResizeObserver(scheduleUpListStateUpdate)
  upListResizeObserver.observe(scroller)
  if (upListTrackRef.value)
    upListResizeObserver.observe(upListTrackRef.value)
  scheduleUpListStateUpdate()
}

function isFeedRequestCurrent(
  requestToken: number,
  requestType: MomentFilter,
  requestHostMid: string,
) {
  return momentsMounted
    && requestToken === feedRequestToken
    && isSameAccount(loadedAccountId, getCurrentAccountId())
    && requestType === activeMomentFilter.value
    && requestHostMid === selectedHostMid.value
}

function retryMomentsPage() {
  void loadMoments(false, 0, true)
}

function getMomentFilterText(moment: DisplayMoment) {
  return [
    moment.author.name,
    moment.title,
    moment.text,
    ...moment.richText.map(segment => segment.text),
    moment.additional?.title,
    moment.additional?.desc,
    moment.forward?.author,
    moment.forward?.title,
    moment.forward?.text,
  ].filter(Boolean).join('\n')
}

/** Filters affect page assembly, not whether scrolling can request the next page. */
function hasActiveMomentFilters() {
  return momentFilterPolicy.value.active || isMomentSearchActive(momentSearch.value)
}

function requiresManualMomentPaging() {
  return feedRequestFailed.value
}

function passesMomentSettings(moment: DisplayMoment) {
  const policy = momentFilterPolicy.value
  return policy.passes(moment, policy.keywords.length ? getMomentFilterText(moment) : '')
    && matchesMomentSearch(moment, momentSearch.value, () => getMomentFilterText(moment), getMomentSearchCutoff(momentSearch.value))
}

function applyMomentSearch(next: MomentSearch) {
  const current = momentSearch.value
  if (next.keyword !== current.keyword || next.kind !== current.kind || next.time !== current.time)
    momentSearch.value = next
}
usePageSearchIntent(AppPage.Moments, keyword => applyMomentSearch({ ...momentSearch.value, keyword }))

async function reapplyMomentFiltersFromCache() {
  if (selectedHostMid.value)
    return false

  const sourceItems = feedReader.getLoaded(activeMomentFilter.value, selectedHostMid.value)
  if (!sourceItems)
    return false

  const requestToken = ++feedRequestToken
  feedReader.cancel()
  loadingNewer.value = false
  const requestType = activeMomentFilter.value
  const requestHostMid = selectedHostMid.value
  const filteredItems = sourceItems
    .filter(item => !isMomentDeleted(item.id) && passesMomentSettings(item))

  moments.value = []
  momentLayout.clearColumns()
  layoutCommit++
  if (scrollViewportRef.value)
    scrollToPosition(scrollViewportRef.value, 0)

  appendMoments(filteredItems)
  isInitialLoading.value = false
  isLoading.value = false

  if (filteredItems.length > 0 || noMoreContent.value) {
    await nextTick()
    if (isFeedRequestCurrent(requestToken, requestType, requestHostMid)) {
      updateGridColumnCount()
      updateVirtualColumns()
      maybeLoadMoreNearBottom()
    }
    return true
  }
  // Nothing read so far matches: keep reading the filtered stream.
  void loadMoments()
  return true
}

/**
 * 对各列底部做有限次数的跨列补位。
 * 仅从每列靠后的卡片中选择，并且只有能明确缩小列高差时才移动。
 */

/** 按最短列排布，尽量让各列底部相对平齐 */

/** 按设置的期望列数排布；空间不足时降列，避免卡片窄于最小可读宽度。 */

const { confirm: confirmMomentAction } = useConfirmDialog()
const deletedMomentIds = new Set<string>()
let deletedMomentAccount: AccountId = null
const reportTarget = shallowRef<{ moment: DisplayMoment, account: AccountId } | null>(null)
const reportDialogRef = ref<InstanceType<typeof MomentReportDialog> | null>(null)
const reportSubmitting = computed(() => Boolean(reportTarget.value && momentActions.reportingMomentIds.has(reportTarget.value.moment.id)))

function isMomentDeleted(id: string) {
  return deletedMomentAccount !== null && deletedMomentAccount === getMomentActionAccount() && deletedMomentIds.has(id)
}

// A deleted card breaks into particles; the cards below it then close the gap.
const momentRemovals = ref(0)
useLayoutMotion(gridRef, momentRemovals, { selector: '[data-moment-id]', key: 'data-moment-id', scroller: scrollViewportRef })

function momentCard(id: string) {
  return gridRef.value?.querySelector(`[data-moment-id="${CSS.escape(id)}"]`)
}

async function removeMomentFromViews(id: string) {
  const account = getMomentActionAccount()
  if (account === null)
    return
  await dissolveElements(momentCard(id)).released
  if (account !== getMomentActionAccount())
    return
  momentRemovals.value++
  if (deletedMomentAccount !== account) {
    deletedMomentIds.clear()
    deletedMomentAccount = account
  }
  deletedMomentIds.add(id)
  feedReader.remove(id)
  const removed = findMoment(id)
  if (removed && hoveredMediaId.value === id)
    handleMediaLeave(removed)
  moments.value = moments.value.filter(moment => moment.id !== id)
  momentLayout.remove(id)
  if (selectedMoment.value?.id === id)
    closeMomentDetail()
  void nextTick(maybeLoadMoreNearBottom)
}

async function requestMomentDelete(moment: DisplayMoment) {
  const account = getMomentActionAccount()
  if (account === null || momentActions.deletingMomentIds.has(moment.id) || isMomentDeleted(moment.id))
    return
  if (!await confirmMomentAction(t('moment_card.delete_confirm')) || account !== getMomentActionAccount())
    return
  const current = findMoment(moment.id)
  if (!current)
    return
  // The card breaks apart once confirmed; removal from the views joins this dissolve.
  const dissolve = dissolveElements(momentCard(moment.id))
  if (await momentActions.deleteMoment(current) !== 'succeeded')
    dissolve.restore()
}

function requestMomentReport(moment: DisplayMoment) {
  const account = getMomentActionAccount()
  if (account !== null && !reportTarget.value)
    reportTarget.value = { moment, account }
}

async function submitMomentReport(reasonType: number, reasonDesc: string) {
  const target = reportTarget.value
  if (!target)
    return
  if (target.account !== getMomentActionAccount()) {
    reportDialogRef.value?.close()
    return
  }
  const outcome = await momentActions.reportMoment(target.moment, reasonType, reasonDesc)
  if (reportTarget.value === target && outcome !== 'failed')
    reportDialogRef.value?.close()
}

function applyMomentPatch(id: string, patch: Partial<DisplayMoment>) {
  const updated = feedReader.updateMoment(id, patch)
  if (!updated)
    return
  const index = getMomentPositions().get(id)
  if (index !== undefined)
    moments.value[index] = updated
  momentLayout.updateMoment(updated)
  if (selectedMoment.value?.id === id)
    details.updateMoment(updated)
}
function handleMomentForwardCountChange(momentId: string, forwardCount: number) {
  const count = Math.max(normalizeForwardCount(findMoment(momentId)?.forwardCount), forwardCount)
  forwardCountOverrides.set(`${getCurrentAccountId()}:${momentId}`, count)
  applyMomentPatch(momentId, { forwardCount: count })
}

/** Views only report "near the bottom"; loadMoments owns eligibility and budgets. */
function maybeLoadMoreNearBottom() {
  const viewport = scrollViewportRef.value
  if (
    !viewport
    || document.hidden
    || isInitialLoading.value
    || isLoading.value
    || settlingLayoutCommit
    || noMoreContent.value
    || requiresManualMomentPaging()
  ) {
    return
  }

  const geometry = readViewportGeometry(viewport)
  const threshold = Math.max(LOAD_MORE_AHEAD_PX, geometry.clientHeight * 0.6)
  if (getRemainingScroll(geometry) <= threshold)
    void loadMoments()
}

function releaseVisibilityWaiters() {
  const waiters = [...visibilityWaiters]
  visibilityWaiters.clear()
  waiters.forEach(resolve => resolve())
}

useEventListener(document, 'visibilitychange', () => {
  if (document.hidden) {
    if (loadingNewer.value)
      feedReader.cancel()
    return
  }
  releaseVisibilityWaiters()
  // Loads skip a hidden page; a list too short to scroll would otherwise stay
  // stuck until the user scrolled.
  maybeLoadMoreNearBottom()
})

/**
 * DOM commit → stable virtual window. Card refs measure in the patch's own
 * microtask, so no frame wait is needed while visible; a hidden page finishes
 * when it becomes visible again instead of relying on paused frames.
 */
async function settleMomentLayout(commit: number, isCurrent: () => boolean) {
  for (let pass = 0; pass < 3; pass++) {
    await nextTick()
    if (document.hidden)
      await new Promise<void>(resolve => visibilityWaiters.add(resolve))
    if (commit !== layoutCommit || !isCurrent())
      return false
    if (!updateVirtualColumns())
      break
  }
  invalidateViewportGeometry(scrollViewportRef.value)
  return commit === layoutCommit && isCurrent()
}

/** 卡片仅在第一次完成测量时播放入场动画，虚拟列表重新挂载不重复播放 */

function clearMomentPresentationForRefresh(nextItems: DisplayMoment[]) {
  momentActions.reset()
  commentSessions.clear()
  disclosureCache.clear()
  momentLayout.reset(nextItems)
  moments.value = []
  previews.clear()
}

async function loadMoments(reset = false, autoFillDepth = 0, manualPaging = false, start: 'automatic' | 'resume' | 'latest' = 'automatic', advanceRead = false) {
  if (momentsExtensionContextInvalidated)
    return
  if (!reset && !manualPaging && document.hidden)
    return

  const requestedGeneration = reset ? ++feedRequestToken : feedRequestToken
  if (momentsExtensionContextInvalidated || !momentsMounted || requestedGeneration !== feedRequestToken)
    return
  if (!reset && !manualPaging && document.hidden)
    return
  if (!isSameAccount(loadedAccountId, getCurrentAccountId()))
    return

  // A failed request needs explicit retry; valid filtered pages continue normally.
  if (!reset && requiresManualMomentPaging() && !manualPaging)
    return
  if ((!reset && (isLoading.value || loadingNewer.value)) || (!reset && noMoreContent.value))
    return
  // The settling batch runs its own follow-up check once its layout is known.
  if (!reset && !manualPaging && settlingLayoutCommit)
    return

  if (reset) {
    clearTimeout(autoFillTimer)
    autoFillTimer = undefined
    feedRequestFailed.value = false
    isInitialLoading.value = true
    clearMomentPresentationForRefresh([])
  }
  const requestToken = feedRequestToken
  const requestType = activeMomentFilter.value
  const requestHostMid = selectedHostMid.value
  let pageApplied = false
  let pageCommit = 0
  let paginationClaim: ScrollPositionClaim | undefined
  let resumeAnchor: ScrollCardAnchor | undefined
  const entryClaim = reset && scrollViewportRef.value ? claimScrollPosition(scrollViewportRef.value) : undefined
  const previousPagination = reset
    ? {
        offset: offset.value,
        updateBaseline: updateBaseline.value,
        page: momentsFeedPage.value,
        noMoreContent: noMoreContent.value,
      }
    : null
  isLoading.value = true
  if (reset) {
    feedReader.reset()
    offset.value = ''
    updateBaseline.value = ''
    momentsFeedPage.value = 1
    noMoreContent.value = false
    loadingNewer.value = false
    newerGap.value = undefined
    newestRawId.value = ''
    atLatest.value = true
    joinStatus.value = 'connected'
    readingAnchorId.value = ''
  }

  try {
    if (reset && canResumeMoments.value) {
      if (!entryUnread.value || start === 'automatic') {
        let snapshot: MomentUnreadSnapshot | undefined
        try {
          snapshot = await topBarStore.readMomentEntrance()
        }
        catch { /* Keep an unavailable boundary distinct from an empty one. */ }
        if (!isFeedRequestCurrent(requestToken, requestType, requestHostMid))
          return
        entryUnread.value = snapshot
      }
      if (!isFeedRequestCurrent(requestToken, requestType, requestHostMid))
        return
      const resuming = start === 'resume' || (start === 'automatic' && settings.value.momentsStartFromLastSeen)
      const requested = start === 'resume' ? pendingResume : undefined
      pendingResume = undefined
      const bookmark = resuming ? requested ?? matchingBookmark.value : undefined
      if (resuming) {
        offset.value = bookmark ? String(BigInt(bookmark.id) + 1n) : entryUnread.value?.oldestId ?? ''
        atLatest.value = !offset.value
        if (bookmark && entryClaim)
          resumeAnchor = { position: entryClaim, candidates: [{ key: bookmark.id, offset: bookmark.offset }] }
      }
      // The marker shows the saved place in this window, else the server's video unread boundary.
      const boundary = bookmark?.id ?? entryUnread.value?.oldestId
      readingBoundary.value = boundary ? { id: boundary, local: !!bookmark } : undefined
    }
    const response = await feedReader.read({
      reset,
      type: requestType,
      hostMid: requestHostMid,
      offset: offset.value,
      updateBaseline: updateBaseline.value,
      page: momentsFeedPage.value,
      filtered: hasActiveMomentFilters(),
      advanceRead: reset && advanceRead && canResumeMoments.value,
    }, () => isFeedRequestCurrent(requestToken, requestType, requestHostMid))
    if (!response || !isFeedRequestCurrent(requestToken, requestType, requestHostMid))
      return
    if ('hostUnfollowed' in response) {
      handleUpFilterChange('')
      return
    }
    const { rawItems, normalizedItems, nextOffset, nextUpdateBaseline, hasMore } = response
    newestRawId.value ||= rawItems[0]?.id_str ?? ''
    momentsFeedPage.value = response.nextPage

    // The reader judges progress from the raw pages, before any filter drops
    // posts. An empty or repeated page means the feed has nothing further, so
    // it ends like the server's own end instead of waiting for a button.
    // The feed is newest first: a page reaching past the time range ends the scan.
    const cutoff = getMomentSearchCutoff(momentSearch.value)
    const ended = !hasMore || (cutoff > 0 && (normalizedItems.at(-1)?.publishedAt ?? cutoff) < cutoff)

    void recordUploaderLatestVideoTimes(
      [
        ...collectVideoPublicationTimes(rawItems),
        ...normalizedItems
          .filter(moment => moment.isVideo && !moment.isForward)
          .map(moment => ({
            mid: moment.author.mid,
            time: moment.publishedAt * 1000,
          })),
      ],
      'moments-page',
    )
    const items = normalizedItems
      .filter(passesMomentSettings)
    if (!reset && scrollViewportRef.value)
      paginationClaim = claimScrollPosition(scrollViewportRef.value)
    if (!reset)
      momentLayout.suspendRebalance(1500)
    else
      clearMomentPresentationForRefresh(items)
    pageCommit = ++layoutCommit
    appendMoments(items)
    if (resumeAnchor)
      momentLayout.restoreAnchor(resumeAnchor)

    offset.value = nextOffset
    updateBaseline.value = nextUpdateBaseline
    noMoreContent.value = ended
    feedRequestFailed.value = response.stalled
    if (reset && advanceRead && canResumeMoments.value)
      void topBarStore.notifyMomentsRead()
    pageApplied = true
  }
  catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      momentsExtensionContextInvalidated = true
      feedRequestToken += 1
      portalRequestToken += 1
      isLoading.value = false
      isInitialLoading.value = false
      isPortalLoading.value = false
      return
    }

    if (isFeedRequestCurrent(requestToken, requestType, requestHostMid)) {
      feedRequestFailed.value = true
      if (!pageApplied && previousPagination) {
        offset.value = previousPagination.offset
        updateBaseline.value = previousPagination.updateBaseline
        momentsFeedPage.value = previousPagination.page
        noMoreContent.value = previousPagination.noMoreContent
      }
      reportRuntimeFailure('Failed to load Moments feed', error)
      toast.error(t('common.load_failed'))
    }
  }
  finally {
    // The network request ends here; layout settling below is separate work.
    if (isFeedRequestCurrent(requestToken, requestType, requestHostMid)) {
      isLoading.value = false
      isInitialLoading.value = false
    }
  }

  if (!pageApplied || !isFeedRequestCurrent(requestToken, requestType, requestHostMid))
    return
  const isCurrent = () => isFeedRequestCurrent(requestToken, requestType, requestHostMid)
  settlingLayoutCommit = pageCommit
  let settled = false
  try {
    settled = await settleMomentLayout(pageCommit, isCurrent)
  }
  finally {
    if (settlingLayoutCommit === pageCommit)
      settlingLayoutCommit = 0
  }
  if (!settled)
    return

  const viewport = scrollViewportRef.value
  // Explicit jumps, other restores and user scrolling since the claim win.
  if (viewport && paginationClaim && canRestoreScrollPosition(viewport, paginationClaim))
    viewport.scrollTop = paginationClaim.top

  if (reset && !atLatest.value && canResumeMoments.value && !document.hidden) {
    void loadNewerMoments()
    return
  }

  if (!viewport || document.hidden || noMoreContent.value || requiresManualMomentPaging())
    return

  // 哨兵分页后可能始终停留在视口内，不会再次触发进入事件；布局稳定后主动补载
  if (getRemainingScroll(readViewportGeometry(viewport)) > 240)
    return
  if (autoFillDepth < MAX_POST_LOAD_AUTOFILL_PAGES) {
    void loadMoments(false, autoFillDepth + 1)
    return
  }
  clearTimeout(autoFillTimer)
  autoFillTimer = setTimeout(() => {
    autoFillTimer = undefined
    if (isCurrent())
      maybeLoadMoreNearBottom()
  }, FILTERED_FEED_YIELD_MS)
}

function clearMomentsPortalState() {
  portalLoaded.value = false
  portalUser.value = null
  portalLiveUsers.value = []
  portalLiveCount.value = 0
  portalUpList.value = []
}

async function loadMomentsPortal() {
  if (momentsExtensionContextInvalidated)
    return

  const requestToken = ++portalRequestToken
  portalRequestController?.abort()
  const controller = new AbortController()
  portalRequestController = controller
  const accountId = loadedAccountId
  isPortalLoading.value = true
  try {
    const response = await api.moment.getMomentsPortal(undefined, { signal: controller.signal }) as MomentsPortalResult
    if (requestToken !== portalRequestToken || !isSameAccount(accountId, getCurrentAccountId()))
      return

    if (response.code !== 0) {
      clearMomentsPortalState()
      return
    }

    portalUser.value = response.data?.my_info || null
    portalLiveUsers.value = response.data?.live_users?.items || []
    portalLiveCount.value = response.data?.live_users?.count ?? portalLiveUsers.value.length
    portalUpList.value = normalizePortalUpList(response.data)
    portalLoaded.value = true
  }
  catch {
    if (requestToken === portalRequestToken && isSameAccount(accountId, getCurrentAccountId()))
      clearMomentsPortalState()
  }
  finally {
    if (portalRequestController === controller)
      portalRequestController = undefined
    if (requestToken === portalRequestToken && isSameAccount(accountId, getCurrentAccountId()))
      isPortalLoading.value = false
  }
}

function refresh() {
  isInitialLoading.value = moments.value.length === 0
  void loadMoments(true, 0, true, 'latest', true)
  void loadMomentsPortal()
}

async function jumpToLastSeen() {
  const target = interactionTarget.value
  const viewport = scrollViewportRef.value
  if (!target || !viewport || isLoading.value || loadingNewer.value)
    return
  // A loaded card is only a glide away; otherwise the list restarts there.
  const top = momentLayout.getCardScrollTop(target.id)
  if (top !== undefined) {
    void scrollToPosition(viewport, Math.max(0, top - target.offset), 'smooth')
    return
  }
  pendingResume = { id: target.id, offset: target.offset }
  prepareMomentListTransition()
  await loadMoments(true, 0, true, 'resume')
}

/**
 * Back to latest (merged with the Dock's back-to-top) and Refresh: glide to
 * the top first, then load the newest posts, so the list is not replaced
 * under a running glide.
 */
let returningToLatest = false
async function returnToLatest() {
  const viewport = scrollViewportRef.value
  if (returningToLatest || !viewport)
    return
  returningToLatest = true
  previews.clear()
  await scrollToPosition(viewport, 0, 'smooth')
  returningToLatest = false
  refresh()
}

async function loadNewerMoments() {
  if (!canResumeMoments.value || atLatest.value || !newestRawId.value || document.hidden || isLoading.value || loadingNewer.value)
    return
  const token = feedRequestToken
  const type = activeMomentFilter.value
  const host = selectedHostMid.value
  const anchor = keepMomentAnchorInterval(momentLayout.captureAnchor(), newerGap.value)
  const gap = newerGap.value ?? { cursor: MOMENTS_LATEST_OFFSET, targetId: newestRawId.value }
  loadingNewer.value = true
  try {
    const result = await feedReader.readNewer(type, gap, () => isFeedRequestCurrent(token, type, host))
    if (!result || !isFeedRequestCurrent(token, type, host))
      return
    void recordUploaderLatestVideoTimes(collectVideoPublicationTimes(result.rawItems), 'moments-page')
    const positions = getMomentPositions()
    const items = result.normalizedItems.filter(item => !positions.has(item.id) && !isMomentDeleted(item.id) && passesMomentSettings(item))
    const insertion = moments.value.findIndex(item => isNotNewerMoment(item.id, gap.targetId))
    const index = insertion < 0 ? moments.value.length : insertion
    moments.value = [...moments.value.slice(0, index), ...items, ...moments.value.slice(index)]
    newerGap.value = result.gap
    joinStatus.value = result.status
    atLatest.value = result.status === 'connected'
    if (atLatest.value && result.newestId)
      newestRawId.value = result.newestId
    const commit = ++layoutCommit
    momentLayout.insertBefore(items, gap.targetId, anchor)
    await settleMomentLayout(commit, () => isFeedRequestCurrent(token, type, host))
  }
  finally {
    if (isFeedRequestCurrent(token, type, host)) {
      loadingNewer.value = false
      maybeLoadMoreNearBottom()
    }
  }
}

function resetMomentsAccountState() {
  forwardTransactions.invalidate()
  momentActions.reset()
  previews.reset()
  closeMomentDetail()
  entryUnread.value = undefined
  readingBookmark.value = undefined
  readingBoundary.value = undefined
  lastInteraction.value = undefined
  momentSearch.value = EMPTY_MOMENT_SEARCH
  readingAnchorId.value = ''
  newerGap.value = undefined
  loadingNewer.value = false
  commentSessions.setAccount(commentAccountIdentity())
  commentSessions.clear()
  feedRequestToken++
  portalRequestToken++
  portalRequestController?.abort()
  portalRequestController = undefined
  moments.value = []
  momentLayout.clearColumns()
  selectedHostMid.value = ''
  feedReader.reset()
  offset.value = ''
  updateBaseline.value = ''
  momentsFeedPage.value = 1
  noMoreContent.value = false
  feedRequestFailed.value = false
  isLoading.value = false
  isInitialLoading.value = true
  layoutCommit++
  clearMomentsPortalState()
  previews.clear()
}

async function ensureMomentsAccount(): Promise<boolean> {
  const accountId = getCurrentAccountId()
  const changed = !isSameAccount(loadedAccountId, accountId)
  if (changed) {
    loadedAccountId = accountId
    resetMomentsAccountState()
  }

  return changed
}

function handleMomentsReachBottom() {
  if (document.hidden || requiresManualMomentPaging() || isLoading.value || settlingLayoutCommit || noMoreContent.value)
    return false
  void loadMoments()
  return true
}

onMounted(() => {
  momentsMounted = true
  void ensureMomentsAccount().then(() => {
    if (!momentsMounted)
      return
    void topBarStore.ensureWatchLaterState()
    if (!viewState.restored || (!moments.value.length && !noMoreContent.value)) {
      void loadMoments(true)
      void loadMomentsPortal()
    }
    else {
      if (!portalLoaded.value)
        void loadMomentsPortal()
      void nextTick(() => {
        updateGridColumnCount()
        updateVirtualColumns()
        // A restored list may not fill the viewport.
        maybeLoadMoreNearBottom()
      })
    }
  })
  handlePageRefresh.value = refresh
  handleReachBottom.value = handleMomentsReachBottom
})

watch([
  () => topBarStore.isLogin,
  () => topBarStore.userInfo.mid,
], () => {
  if (topBarStore.isLogin && topBarStore.userInfo.mid)
    void topBarStore.ensureWatchLaterState()
  void ensureMomentsAccount().then((changed) => {
    if (momentsMounted && changed) {
      void loadMoments(true)
      void loadMomentsPortal()
    }
  })
})

onBeforeUnmount(() => {
  momentsMounted = false
  clearTimeout(hoverTimer)
  layoutCommit++
  releaseVisibilityWaiters()
  clearTimeout(autoFillTimer)
  feedReader.reset()
  moments.value = []
  commentSessions.clear()
  feedRequestToken += 1
  portalRequestToken += 1
  portalRequestController?.abort()
  portalRequestController = undefined
  upListResizeObserver?.disconnect()
  upListResizeObserver = undefined
  upListElastic?.dispose()
  upListElastic = undefined
  if (upListStateFrame !== undefined) {
    cancelAnimationFrame(upListStateFrame)
    upListStateFrame = undefined
  }
  if (handlePageRefresh.value === refresh)
    handlePageRefresh.value = undefined
  if (handleReachBottom.value === handleMomentsReachBottom)
    handleReachBottom.value = undefined
})

// 列表从 skeleton 切到真实网格后补观察，确保列宽/列数及时更新

// 骨架屏退出后网格位置会变化，立即按真实位置重算首屏虚拟窗口
watch(isInitialLoading, async (loading) => {
  if (loading)
    return
  await nextTick()
  updateGridColumnCount()
  updateVirtualColumns()
})

// A load whose count is unknown (a search, or a filtered stream with nothing
// shown yet) shows only the ring in the middle; the grid, empty and error
// states wait for it to close. The tail ring closes before "no more" shows.
const pendingRingRef = ref<{ $el: Element }>()
const pendingRingLoading = computed(() => !moments.value.length
  && (isInitialLoading.value ? isMomentSearchActive(momentSearch.value) : isLoading.value))
const pendingRingPhase = useLoadingRingPhase(() => pendingRingLoading.value, () => pendingRingRef.value?.$el)
const tailRingRef = ref<HTMLElement>()
const tailRingLoading = computed(() => isLoading.value && moments.value.length > 0)
const tailRingPhase = useLoadingRingPhase(() => tailRingLoading.value, () => tailRingRef.value)
watch(() => pendingRingPhase.value === 'idle', async (idle) => {
  if (!idle)
    return
  await nextTick()
  updateGridColumnCount()
  updateVirtualColumns()
})

watch([upListScrollerRef, upListTrackRef], async () => {
  await nextTick()
  setupUpListScrollerObserver()
})

watch(
  [
    () => portalUpList.value.map(up => up.mid).join(','),
    () => isPortalLoading.value,
  ],
  async () => {
    await nextTick()
    scheduleUpListStateUpdate()
  },
)

watch(
  [momentFilterPolicy, momentSearch],
  async () => {
    if (await reapplyMomentFiltersFromCache())
      return
    void loadMoments(true)
  },
)

function appendMoments(items: DisplayMoment[]) {
  const wasEmpty = moments.value.length === 0
  const positions = getMomentPositions()
  const incoming = items.filter((item) => {
    if (positions.has(item.id) || isMomentDeleted(item.id))
      return false
    positions.set(item.id, positions.size)
    return true
  })
  if (!incoming.length)
    return
  const next = moments.value.concat(incoming)
  indexedMoments = next
  moments.value = next
  momentLayout.append(incoming, wasEmpty)
}
</script>

<template>
  <section :ref="el => layoutRef = (el as HTMLElement | null)" class="moments-page">
    <LibraryWorkspace :label="t('moments.moments')">
      <template #sidebar="{ contentId }">
        <MomentsSidebar
          :model-value="activeMomentFilter" :content-id="contentId" :loading="isPortalLoading"
          :user="portalUser" :live-users="portalLiveUsers" :live-count="portalLiveCount"
          :previews="previews" :search="momentSearch"
          @update:model-value="handleMomentFilterChange" @search="applyMomentSearch"
        />
      </template>

      <!-- Above the content layout, so the hot-search card starts below it. -->
      <section
        v-if="showMomentsUpList"
        v-layout-editable="'moments-up-list'"
        class="moments-up-list"
        data-layout-editable-id="moments-up-list"
        :aria-label="t('moments.feed_bar')"
      >
        <template v-if="SHOW_UP_LIST_ARROWS">
          <IconButton
            v-show="canScrollUpListLeft"
            class="moments-up-list__arrow moments-up-list__arrow--prev"
            :label="t('moments.scroll_frequent_left')"
            :title="t('moments.scroll_left')"
            @click="scrollUpListBy(-1)"
          >
            <span i-tabler-chevron-left aria-hidden="true" />
          </IconButton>
          <IconButton
            v-show="canScrollUpListRight"
            class="moments-up-list__arrow moments-up-list__arrow--next"
            :label="t('moments.scroll_frequent_right')"
            :title="t('moments.scroll_right')"
            @click="scrollUpListBy(1)"
          >
            <span i-tabler-chevron-right aria-hidden="true" />
          </IconButton>
        </template>

        <div
          ref="upListScrollerRef"
          class="moments-up-list__scroller"
          role="group"
          :aria-label="t('moments.frequent_uploaders')"
          @scroll="scheduleUpListStateUpdate"
          @wheel="handleUpListWheel"
        >
          <div ref="upListTrackRef" class="moments-up-list__track">
            <button
              type="button"
              class="moments-up-list__item"
              :class="{ 'moments-up-list__item--active': !selectedHostMid }"
              :aria-pressed="!selectedHostMid"
              :title="t('moments.all_moments')"
              @click="handleUpFilterChange('')"
            >
              <span class="moments-up-list__avatar moments-up-list__avatar--all" aria-hidden="true">
                <span
                  class="moments-up-list__all-icon"
                  :class="!selectedHostMid ? 'i-tabler-windmill-filled' : 'i-tabler-windmill'"
                />
              </span>
              <span class="moments-up-list__name">{{ t('moments.all_moments') }}</span>
            </button>
            <template v-if="isPortalLoading && !portalUpList.length">
              <div
                v-for="index in 8"
                :key="index"
                class="moments-up-list__item moments-up-list__item--skeleton"
                data-bew-skeleton-group
                aria-hidden="true"
              >
                <SkeletonBlock
                  class="moments-up-list__skeleton-tile"
                  width="var(--bew-moments-up-tile-size)"
                  height="var(--bew-moments-up-tile-size)"
                  radius="media"
                />
                <SkeletonBlock width="var(--bew-space-12)" height="var(--bew-font-size-caption)" />
              </div>
            </template>
            <template v-else>
              <button
                v-for="up in portalUpList"
                :key="up.mid"
                type="button"
                class="moments-up-list__item"
                :class="{ 'moments-up-list__item--active': selectedHostMid === up.mid }"
                :aria-pressed="selectedHostMid === up.mid"
                :title="up.uname"
                @click="handleUpFilterChange(up.mid)"
              >
                <span class="moments-up-list__avatar">
                  <img
                    :src="getSidebarAvatarUrl(up.face, 336)"
                    :alt="up.uname"
                    loading="lazy"
                    decoding="async"
                  >
                  <span
                    v-if="up.has_update"
                    class="moments-up-list__dot"
                    :aria-label="t('moments.has_update')"
                  />
                </span>
                <span class="moments-up-list__name">{{ up.uname }}</span>
              </button>
            </template>
          </div>
        </div>
      </section>

      <MomentsContentLayout :sidebar-label="t('moments.hot_search_title')">
        <template #sidebar>
          <MomentsHotSearch />
          <MomentsReadingActions
            :jump="showJumpToLastSeen"
            :latest="showJumpToLatest"
            :busy="isLoading || loadingNewer"
            :status="newerGap ? t(`moments.join_${joinStatus}`) : undefined"
            @jump="jumpToLastSeen"
            @latest="returnToLatest"
            @refresh="returnToLatest"
          />
        </template>
        <main :ref="el => momentsContentRef = (el as HTMLElement | null)" class="moments-content">
          <LoadingFill v-if="pendingRingPhase !== 'idle'" ref="pendingRingRef" :loading="pendingRingLoading" />
          <div v-else-if="isInitialLoading" class="moments-page__initial-loading">
            <div
              v-layout-editable="'moments-grid'"
              class="moments-skeleton-grid"
              data-layout-editable-id="moments-grid"
              :style="momentsGridStyle"
            >
              <div
                v-for="columnIndex in Math.max(1, gridColumnCount)"
                :key="columnIndex"
                class="moments-skeleton-column"
              >
                <MomentCardSkeleton
                  v-for="itemIndex in 4"
                  :key="itemIndex"
                  :variant="getMomentSkeletonVariant(activeMomentFilter, columnIndex + itemIndex)"
                />
              </div>
            </div>
          </div>
          <div v-else-if="feedRequestFailed && !moments.length" class="moments-page__empty moments-page__error bew-empty--fill" role="status">
            <p>{{ t('common.load_failed') }}</p>
            <button type="button" :disabled="isLoading" @click="loadMoments(true, 0, true, atLatest ? 'latest' : 'resume')">
              {{ t('moments.retry') }}
            </button>
          </div>
          <div
            v-else-if="moments.length"
            :ref="el => gridRef = (el as HTMLElement | null)"
            v-layout-editable="'moments-grid'"
            class="moments-grid"
            data-layout-editable-id="moments-grid"
            :style="momentsGridStyle"
            @click.capture="rememberInteraction($event.target)"
            @contextmenu.capture="rememberInteraction($event.target)"
            @pointerover="handleGridPointerOver"
          >
            <div v-for="(column, columnIndex) in virtualColumns" :key="columnIndex" class="moments-grid__column">
              <div v-if="column.topPad" class="moments-grid__spacer" :style="{ height: `${column.topPad}px` }" />
              <template v-for="(moment, momentIndex) in column.items" :key="moment.id">
                <div v-if="column.gaps?.[momentIndex]" class="moments-grid__spacer" :style="{ height: `${column.gaps[momentIndex]}px` }" />
                <MomentCard
                  :moment="momentActions.getDisplayMoment(moment)"
                  :card-width="gridCardWidth"
                  :ready="readyCardIds.has(moment.id)"
                  :entering="enteringCardIds.has(moment.id)"
                  :preview-active="hoveredMediaId === moment.id && (previewState === 'loading' || previewState === 'ready')"
                  :preview-loading="hoveredMediaId === moment.id && previewState !== 'ready'"
                  :preview-generation="hoveredMediaId === moment.id ? previewGeneration : 0"
                  :preview-url="previewUrls[moment.id]"
                  :image-ratio="getMomentImageRatio(moment)"
                  :is-like-loading="likingMomentIds.has(moment.id)"
                  :is-reservation-loading="reservationLoadingMomentIds.has(moment.id)"
                  :is-forward-loading="forwardTransactions.pending.has(moment.id)"
                  :is-watch-later-added="isWatchLaterAdded"
                  :is-watch-later-loading="isWatchLaterLoading"
                  @card-element="element => bindCardEl(element, moment)"
                  @open-detail="openMomentDetail"
                  @media-enter="handleMediaEnter"
                  @media-leave="handleMediaLeave"
                  @cover-load="(event, momentId) => handleCoverLoad(event, momentId)"
                  @preview-video="bindPreviewVideo"
                  @open-video-link="details.openVideoLink"
                  @toggle-watch-later="toggleMomentWatchLater"
                  @toggle-like="toggleMomentLike"
                  @toggle-reservation="toggleMomentReservation"
                  @interactive-resize="handleMomentCardInteractiveResize"
                  @disclosure-motion="moving => momentLayout.setDisclosureMotion(moment.id, moving)"
                  @interaction-change="held => momentLayout.setInteractionHeld(moment.id, held)"
                  @request-delete="requestMomentDelete"
                  @request-report="requestMomentReport"
                >
                  <template v-if="moment.id === boundaryId || moment.id === gapBoundaryId" #reading-marker>
                    <MomentReadMarker v-if="moment.id === boundaryId" :label="t(readingBoundary?.local ? 'moments.local_bookmark' : 'moments.video_boundary')" />
                    <button v-if="moment.id === gapBoundaryId" type="button" class="moments-load-more" :disabled="loadingNewer" @click="loadNewerMoments">
                      {{ t('moments.continue_gap') }}
                    </button>
                  </template>
                </MomentCard>
              </template>
              <div v-if="column.bottomPad" class="moments-grid__spacer" :style="{ height: `${column.bottomPad}px` }" />
            </div>
          </div>
          <!-- An ended feed only says so; buttons are for failures. -->
          <div v-else-if="!isInitialLoading && !isLoading && (noMoreContent || feedRequestFailed)" class="moments-page__empty bew-empty--fill" role="status">
            <p>{{ feedRequestFailed ? t('common.load_failed') : t(isMomentSearchActive(momentSearch) ? 'moments.search_empty' : 'moments.empty') }}</p>
            <button
              v-if="feedRequestFailed"
              :disabled="isLoading"
              @click="loadMoments(true, 0, true, atLatest ? 'latest' : 'resume')"
            >
              {{ t('moments.retry') }}
            </button>
          </div>
          <button
            v-if="feedRequestFailed && !isLoading && moments.length"
            type="button"
            class="moments-load-more"
            @click="retryMomentsPage()"
          >
            <span i-tabler-arrow-down />
            {{ t('moments.retry') }}
          </button>
          <p
            v-if="!isInitialLoading && pendingRingPhase === 'idle' && moments.length"
            ref="tailRingRef"
            class="moments-page__loading"
            :class="{ 'is-visible': tailRingPhase !== 'idle' || (noMoreContent && !feedRequestFailed) }"
            :aria-hidden="tailRingPhase === 'idle' && !noMoreContent"
            :aria-busy="tailRingLoading"
            aria-live="polite"
          >
            <LoadingRing v-if="tailRingPhase !== 'idle'" :loading="tailRingLoading" size="var(--bew-icon-size-md)" :aria-label="t('common.loading')" />
            <template v-else-if="noMoreContent && !feedRequestFailed">
              {{ t('moments.no_more') }}
            </template>
          </p>
        </main>
      </MomentsContentLayout>
    </LibraryWorkspace>

    <Dialog
      v-if="selectedMoment && detailFrameUrl"
      ref="detailDialogRef"
      append-to-bewly-body
      content-flush
      :show-header="false"
      :show-border="false"
      :show-footer="false"
      :title="selectedMoment.isLive ? t('moments.live_room') : selectedMoment.isVideo ? t('moments.video_playback') : selectedMoment.author.name"
      :desc="selectedMoment.isLive || selectedMoment.isVideo ? selectedMoment.title || selectedMoment.author.name : (selectedMoment.time || t('moments.detail'))"
      :width="detailDialogWidth"
      :height="detailDialogHeight"
      :content-height="detailContentHeight"
      :content-max-height="detailContentHeight"
      @before-close="clearDetailFocusRetry"
      @close="closeMomentDetail"
    >
      <div
        class="moment-detail-frame"
        :style="{ '--moment-detail-player-min-height': `${MOMENTS_DETAIL_LAYOUT.playerMinHeight}px` }"
        :class="{
          'is-loading': !detailFrameLoaded,
          'moment-detail-frame--player': selectedMoment.isVideo || selectedMoment.isLive,
          'moment-detail-frame--opus': isOpusDetailMoment,
        }"
      >
        <CloseButton
          class="moment-detail-frame__close"
          data-dialog-initial-focus
          variant="floating"
          :label="t('common.close')"
          @click="detailDialogRef?.close()"
        />
        <Transition name="fade">
          <Loading v-if="!detailFrameLoaded" class="moment-detail-frame__loading" :kind="selectedMoment.isVideo || selectedMoment.isLive ? 'video' : 'article'" />
        </Transition>
        <iframe
          :ref="bindDetailIframe"
          :key="detailFrameUrl"
          class="moment-detail-frame__iframe"
          tabindex="0"
          :src="detailFrameUrl"
          :title="t('moments.author_detail', { author: selectedMoment.author.name })"
          referrerpolicy="no-referrer-when-downgrade"
          allow="fullscreen; autoplay; clipboard-write"
          scrolling="yes"
          @load="handleDetailIframeLoad"
        />
        <a
          :href="details.detailExternalHref.value" target="_blank" rel="noopener noreferrer"
          class="moment-detail-frame__open"
          @pointerdown="details.syncDetailExternalHref" @focus="details.syncDetailExternalHref" @contextmenu="details.syncDetailExternalHref"
          @click.stop="openDetailFrameInNewTab"
        >
          {{ t('moments.open_new_tab') }}
          <span i-tabler-external-link />
        </a>
      </div>
    </Dialog>

    <MomentReportDialog
      v-if="reportTarget"
      ref="reportDialogRef"
      :submitting="reportSubmitting"
      @submit="submitMomentReport"
      @close="reportTarget = null"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../styles/truncateFade";
@use "../../../styles/contentCard";
@use "../../../styles/bleedStrip";

.moments-page {
  min-width: 0;
}
.moments-content {
  width: 100%;
  min-width: 0;
}
// No container: the row starts on the content line, scrolls left under the
// rail's glass out to the window edge, and its last tile stops under the
// top-bar avatar's right edge. It stays in the page layer, below the fixed rail.
.moments-up-list {
  // Tile, gap and one name line (the track's padding and the scroller's
  // negative margin cancel out).
  --moments-up-list-height: calc(var(--bew-moments-up-tile-size) + var(--bew-space-2) + var(--bew-line-height-control));
  // The feed starts this far below the names: room for a hovered tile's scale
  // and shadow, which the feed would otherwise cover.
  --moments-up-list-gap: var(--bew-space-8);
  // The bar stays where it is while the page scrolls (user request); the feed
  // after it, a stacking context of its own (container query), slides over it.
  @include bleedStrip.bar(var(--moments-up-list-height), var(--moments-up-list-gap));
}
.moments-up-list__scroller {
  @include bleedStrip.scroller;
}
.moments-up-list__track {
  @include bleedStrip.track;
}
.moments-up-list__arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-1);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);
}
.moments-up-list__arrow--prev {
  left: 4px;
}
.moments-up-list__arrow--next {
  right: 4px;
}
.moments-up-list:hover .moments-up-list__arrow,
.moments-up-list:focus-within .moments-up-list__arrow {
  opacity: 1;
  pointer-events: auto;
}
.moments-up-list__arrow:hover {
  background: var(--bew-elevated-solid-hover);
}
.moments-up-list__arrow:active:not(:disabled) {
  transform: translateY(-50%) scale(0.92);
}
.moments-up-list__arrow:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
// Same hover scale as video cards (contentCard.bare).
.moments-up-list__item {
  @include bleedStrip.tile(var(--bew-moments-up-tile-size));
}
.moments-up-list__item--active .moments-up-list__name {
  color: var(--bew-text-1);
}
.moments-up-list__item--skeleton {
  pointer-events: none;
}
// Square tiles as tall as a video card cover, framed like one.
.moments-up-list__avatar {
  @include bleedStrip.tile-media(var(--bew-moments-up-tile-size));
}
.moments-up-list__item:hover:not(:disabled) .moments-up-list__avatar {
  box-shadow: var(--bew-shadow-2);
}
.moments-up-list__avatar--all {
  display: grid;
  place-items: center;
  color: var(--bew-text-2);
}
.moments-up-list__item--active .moments-up-list__avatar--all {
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
}
.moments-up-list__skeleton-tile {
  border-radius: var(--bew-media-radius);
}
.moments-up-list__all-icon {
  display: block;
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
  line-height: 1;
}
.moments-up-list__dot {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  z-index: 5;
  width: var(--bew-space-3);
  height: var(--bew-space-3);
  border: 2px solid var(--bew-bg);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-bili-pink);
  box-sizing: border-box;
}
.moments-up-list__name {
  @include bleedStrip.tile-name;
}
.moments-page__initial-loading {
  position: relative;
  min-height: calc(100dvh - var(--bew-top-bar-height) - 90px);
}
.moments-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(var(--moments-columns), minmax(0, 1fr));
  align-items: start;
  gap: var(--bew-space-4);
  width: 100%;
}
.moments-skeleton-column {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.moments-page__empty button:not(.b-button) {
  border: var(--bew-hairline) solid var(--bew-edge-color);
  min-height: var(--bew-control-height);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-elevated);
  color: var(--bew-text-1);
  padding: 0 var(--bew-space-4);
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-page__empty button:not(.b-button):hover {
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
  border-color: var(--bew-selected-bg);
}
.moments-page__empty button:not(.b-button):disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.moments-grid {
  display: grid;
  grid-template-columns: repeat(var(--moments-columns), minmax(0, 1fr));
  gap: var(--bew-space-4);
  width: 100%;
  justify-items: stretch;
  /* 虚拟 spacer 会持续变化，禁用浏览器自动锚定以免与滚动输入互相拉扯 */
  overflow-anchor: none;
}
.moments-grid__column {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-4);
}
.moments-grid :deep(.moment-card) {
  width: 100%;
  max-width: 100%;
}
.moments-grid__spacer {
  flex: 0 0 auto;
  width: 100%;
  pointer-events: none;
}

@media (max-width: 720px) {
  .moments-page {
    padding-right: 8px;
    padding-left: 8px;
  }
}
.moments-page__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  height: 32px;
  margin: var(--bew-space-5) 0 0;
  color: var(--bew-text-2);
  text-align: center;
  font-size: var(--bew-font-size-control);
  visibility: hidden;
  opacity: 0;
  overflow-anchor: none;
  transition: opacity 0.16s ease;
}
.moments-page__loading.is-visible {
  visibility: visible;
  opacity: 1;
}
.moments-load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  min-width: 124px;
  height: var(--bew-control-height);
  margin: var(--bew-space-5) auto 0;
  padding: 0 var(--bew-space-4);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-1);
  background: var(--bew-elevated);
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-load-more:hover {
  color: var(--bew-text-1);
  border-color: var(--bew-selected-bg);
  background: var(--bew-selected-bg);
}
.moments-page__empty {
  flex: 1;
  min-height: var(--bew-space-12);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
  text-align: center;
}
.moments-content:has(.bew-empty--fill) {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.moments-page__empty button:not(.b-button) {
  background: transparent;
  border: 0;
  color: var(--bew-text-2);
  text-decoration: underline;
  text-underline-offset: var(--bew-space-1);
}
.moments-page__empty p {
  margin: 0;
}
.moment-detail-frame {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-surface-radius);
  overflow: hidden;
  background: var(--bew-bg);
}
.moment-detail-frame--player {
  // 视频/直播：按视口/16:9 区域展示，内部页面可滚动
  overflow: hidden;
  background: #000;
  min-height: min(100%, var(--moment-detail-player-min-height));
}
.moment-detail-frame--opus {
  // 图文：小红书 note 高容器，利于竖图展示
  min-height: 0;
  background: var(--bew-bg);
}
.moment-detail-frame__loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  color: var(--bew-text-2);
  background: var(--bew-bg);
  font-size: var(--bew-font-size-control);
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.18s ease;
}
.moment-detail-frame:not(.is-loading) .moment-detail-frame__loading {
  opacity: 0;
  pointer-events: none;
}
.moment-detail-frame__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--bew-bg);
  // 允许 iframe 文档内部滚动（视频评论区、直播简介等）
  overflow: auto;
}
.moment-detail-frame__open {
  position: absolute;
  right: var(--bew-space-3);
  bottom: var(--bew-space-3);
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);
  font-family: inherit;
  text-decoration: none;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  opacity: 0.92;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.moment-detail-frame__close {
  // A space-2 inside the frame's corner, its corner nested in the frame's.
  --bew-close-button-radius: calc(var(--bew-surface-radius) - var(--bew-space-2));
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  z-index: 4;
}
.moment-detail-frame__open:hover {
  opacity: 1;
  transform: translateY(-1px);
}
.moments-page__empty button:not(.b-button),
.moments-load-more,
.moment-detail-frame,
.moment-detail-frame__open {
  corner-shape: var(--bew-corner-shape);
}

.moments-load-more,
.moment-detail-frame__open {
  corner-shape: var(--bew-corner-shape-capsule);
}
</style>
