<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import CloseButton from '~/components/CloseButton.vue'
import Dialog from '~/components/Dialog.vue'
import IconButton from '~/components/IconButton.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import MomentCard from '~/components/MomentCard/MomentCard.vue'
import { createMomentDisclosureCache, MOMENT_DISCLOSURES, normalizeForwardCount } from '~/components/MomentCard/momentForwardContent'
import type { DisplayForwardVideo, DisplayMoment } from '~/components/MomentCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import { MOMENTS_DETAIL_LAYOUT } from '~/constants/layout'
import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'
import { parseDedeUserID } from '~/logic/loginStatus'
import { momentsPinnedUsers, momentsWantedUsers } from '~/logic/storage'
import { recordUploaderLatestVideoTimes } from '~/logic/uploaderLatestVideoTimes'
import { useTopBarStore } from '~/stores/topBarStore'
import type { AccountId } from '~/utils/accountScope'
import { isSameAccount } from '~/utils/accountScope'
import api from '~/utils/api'
import { numFormatter } from '~/utils/dataFormatter'
import { isExtensionContextInvalidatedError, reportRuntimeFailure } from '~/utils/messaging'
import { createMomentCommentSessionCache, MOMENT_COMMENT_SESSIONS } from '~/utils/momentCommentSession'
import { resolveHorizontalScrollState } from '~/utils/momentsLayout'
import { normalizeMomentRemoteUrl } from '~/utils/momentUrl'
import { recordVideoVisit } from '~/utils/videoVisitHistory'

import { createMomentAdapter } from './momentAdapter'
import { createMomentFeedReader } from './momentFeedReader'
import { useMomentActions } from './useMomentActions'
import { useMomentDetail } from './useMomentDetail'
import { useMomentLayout } from './useMomentLayout'
import { useMomentPreviews } from './useMomentPreviews'
import type { MomentFilter } from './useMomentsFeedCache'
import { useMomentsFeedCache } from './useMomentsFeedCache'

interface MomentsPortalUser {
  mid: string
  name: string
  face: string
  following: string
  follower: string
  dyns: string
  vip?: {
    status?: number
    nickname_color?: string
    label?: {
      text?: string
    }
  }
  level_info?: {
    current_level?: number
  }
}

interface MomentsPortalLiveUser {
  mid: string
  room_id: string
  jump_url: string
  face: string
  uname: string
  title: string
}

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

const moments = ref<DisplayMoment[]>([])
const momentActions = useMomentActions(getMomentActionAccount, applyMomentPatch)
const { likingMomentIds, reservationLoadingMomentIds, toggleMomentLike, toggleMomentReservation, isWatchLaterAdded, isWatchLaterLoading, toggleMomentWatchLater } = momentActions
const previews = useMomentPreviews(getCurrentAccountId)
const { hoveredMediaId, previewUrls, handleMediaEnter, handleMediaLeave, bindPreviewVideo, playPreview, isMomentPreviewEnabled } = previews

const momentLayout = useMomentLayout(moments, {
  onNearBottom: maybeLoadMoreNearBottom,
  onRecycle: previews.release,
  onViewportChange: (visible, hidden) => {
    for (const id of hidden) {
      if (hoveredMediaId.value !== id)
        previews.release(id)
    }
    previews.prune(visible)
  },
})
const { showMomentsSidebar, layoutRef, momentsContentRef, gridRef, gridColumnCount, gridCardWidth, readyCardIds, enteringCardIds, virtualColumns, momentsGridStyle, getMomentImageRatio, updateGridColumnCount, handleMomentCardInteractiveResize, updateVirtualColumns, bindCardEl, handleCoverLoad } = momentLayout
const details = useMomentDetail(getMomentImageRatio, () => previews.clear())
const { selectedMoment, detailFrameUrl, detailFrameLoaded, detailImageViewerRef, detailImageViewerOpen, detailImageViewerUrls, detailImageViewerIndex, detailImageViewerScale, detailImageViewerRotation, detailImageViewerDragging, isOpusDetailMoment, detailDialogHeight, detailDialogWidth, detailContentHeight, detailImageViewerUrl, detailImageViewerTransform, clearDetailFocusRetry, bindDetailIframe, resetDetailImageViewerTransform, setDetailImageViewerScale, showDetailImageViewerImage, openMomentImagePreview, closeDetailImageViewer, handleDetailImageViewerWheel, handleDetailImageViewerPointerDown, handleDetailImageViewerPointerMove, handleDetailImageViewerPointerEnd, handleDetailImageViewerDoubleClick, handleDetailImageViewerKeydown, openDetailFrameInNewTab, openMomentDetail, handleDetailIframeLoad, closeMomentDetail } = details
const momentFilters = computed<Array<{ value: MomentFilter, label: string }>>(() => [
  { value: 'all', label: t('moments.filter_all') },
  { value: 'video', label: t('moments.filter_video') },
  { value: 'pgc', label: t('moments.filter_pgc') },
  { value: 'article', label: t('moments.filter_article') },
])
const activeMomentFilter = ref<MomentFilter>('all')
const feedCache = useMomentsFeedCache(getCurrentAccountId)
const feedReader = createMomentFeedReader(feedCache, mapMoment)
const momentsFeedCacheReady = feedCache.ready
const { ensureMomentsCacheAccount } = feedCache
type MomentGroup = 'all' | 'wanted'
const activeMomentGroup = ref<MomentGroup>('all')
const portalUser = ref<MomentsPortalUser | null>(null)
const portalLiveUsers = ref<MomentsPortalLiveUser[]>([])
const portalLiveCount = ref(0)
const portalUpList = ref<MomentsPortalUpItem[]>([])
/** 选中的经常访问 UP 主 mid；空字符串表示“全部动态” */
const selectedHostMid = ref('')
const isPortalLoading = ref(true)
const upListScrollerRef = ref<HTMLElement | null>(null)
const upListTrackRef = ref<HTMLElement | null>(null)
const canScrollUpListLeft = ref(false)
const canScrollUpListRight = ref(false)
let upListResizeObserver: ResizeObserver | undefined
let upListStateFrame: number | undefined

const forwardCountOverrides = new Map<string, number>()

/** 封面宽高比（宽/高），用于单图布局、详情视频比例兜底和虚拟列表测量 */

const isLoading = ref(false)
const isInitialLoading = ref(true)
const feedRequestFailed = ref(false)
const noMoreContent = ref(false)
const offset = ref('')
const updateBaseline = ref('')
/** 按 UP 主筛选时 feed/all 的 page，从 1 递增 */
const momentsFeedPage = ref(1)
const { handlePageRefresh, handleReachBottom, mainAppRef, scrollViewportRef } = useBewlyApp()

const MAX_POST_LOAD_AUTOFILL_PAGES = 3
/** 开启过滤时，每次初始加载、刷新或手动加载最多请求的原始动态页数。 */
/** 虚拟瀑布流需要在全局哨兵进入视口前主动预取，避免高度修正后漏掉相交事件 */
const LOAD_MORE_AHEAD_PX = 640

/** 最近滚动时间，用于避免滚动中重排导致抖动 */

let feedRequestToken = 0
let portalRequestToken = 0
let momentsMounted = false
let momentsExtensionContextInvalidated = false
let loadedAccountId: AccountId = getCurrentAccountId()
const commentAccountIdentity = () => `${topBarStore.userInfo.mid || 'guest'}:${getCurrentAccountId() ?? 'guest'}`
const commentSessions = createMomentCommentSessionCache(commentAccountIdentity())
const disclosureCache = createMomentDisclosureCache()
provide(MOMENT_DISCLOSURES, disclosureCache)
watch(commentAccountIdentity, () => disclosureCache.clear(), { flush: 'sync' })
onScopeDispose(disclosureCache.clear)
provide(MOMENT_COMMENT_SESSIONS, commentSessions)
watch(commentAccountIdentity, accountId => commentSessions.setAccount(accountId), { flush: 'sync' })

/** 高度已稳定的卡片，避免反复 Resize 微抖动 */

const wantedUserMids = computed(() => new Set(momentsWantedUsers.value.map(user => user.mid)))
const pinnedUserMids = computed(() => new Set(momentsPinnedUsers.value.map(user => user.mid)))
const visiblePortalUpList = computed(() =>
  portalUpList.value.filter(up => !pinnedUserMids.value.has(up.mid)),
)
const directWantedUsers = computed(() => momentsWantedUsers.value.filter(user => (
  !portalUpList.value.some(up => up.mid === user.mid)
  && !pinnedUserMids.value.has(user.mid)
)))
const showMomentsUpList = computed(() =>
  settings.value.momentsShowUpList
  && (
    isPortalLoading.value
    || portalUpList.value.length > 0
    || momentsWantedUsers.value.length > 0
    || momentsPinnedUsers.value.length > 0
    || settings.value.momentsEnableWantedFilter
  ),
)

function getCurrentAccountId(): AccountId {
  return parseDedeUserID(document.cookie) ?? null
}

function getMomentActionAccount(): AccountId {
  return isSameAccount(loadedAccountId, getCurrentAccountId()) ? loadedAccountId : null
}

const httpsUrl = normalizeMomentRemoteUrl

function getSidebarAvatarUrl(url = '', size = 96) {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@${size}w_${size}h_1c.webp`
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
  if (filter !== 'all' && filter !== 'video')
    activeMomentGroup.value = 'all'
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
  void loadMoments(true)
}

function handleMomentGroupChange(group: MomentGroup) {
  if (
    group === 'wanted'
    && (
      !settings.value.momentsEnableWantedFilter
      || (activeMomentFilter.value !== 'all' && activeMomentFilter.value !== 'video')
    )
  ) {
    return
  }
  if (activeMomentGroup.value === group && (group !== 'wanted' || !selectedHostMid.value))
    return

  prepareMomentListTransition()
  if (group === 'wanted')
    selectedHostMid.value = ''
  activeMomentGroup.value = group
  feedReader.reset()
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
    scrollViewportRef.value.scrollTop = 0
}

/** 选择“全部动态”或某个经常访问的 UP 主；切换时 reset 列表与分页 */
function handleUpFilterChange(mid = '') {
  const nextMid = mid ? String(mid) : ''
  if (selectedHostMid.value === nextMid && activeMomentGroup.value === 'all')
    return

  prepareMomentListTransition()
  selectedHostMid.value = nextMid
  activeMomentGroup.value = 'all'
  feedReader.reset()
  if (nextMid)
    clearUpUpdateDot(nextMid)
  void loadMoments(true)
}

function handleUpListWheel(event: WheelEvent) {
  const scroller = event.currentTarget as HTMLElement | null
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth)
    return

  // 将纵向滚轮转为横向滚动，贴近 B 站经常访问列表交互
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX))
    return

  scroller.scrollLeft += event.deltaY
  event.preventDefault()
  scheduleUpListStateUpdate()
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
  const scroller = upListScrollerRef.value
  if (!scroller)
    return

  upListResizeObserver = new ResizeObserver(scheduleUpListStateUpdate)
  upListResizeObserver.observe(scroller)
  if (upListTrackRef.value)
    upListResizeObserver.observe(upListTrackRef.value)
  scheduleUpListStateUpdate()
}

function isFeedRequestCurrent(
  requestToken: number,
  requestType: MomentFilter,
  requestGroup: MomentGroup,
  requestHostMid: string,
) {
  return momentsMounted
    && requestToken === feedRequestToken
    && isSameAccount(loadedAccountId, getCurrentAccountId())
    && requestType === activeMomentFilter.value
    && requestGroup === activeMomentGroup.value
    && requestHostMid === selectedHostMid.value
}

function matchesMomentFilter(moment: DisplayMoment) {
  if (activeMomentFilter.value === 'all')
    return true
  if (activeMomentFilter.value === 'video')
    return moment.isVideo && !moment.isPgc
  if (activeMomentFilter.value === 'pgc')
    return moment.isPgc
  return moment.isArticle
}

function loadMoreWantedMoments() {
  void loadMoments(false, 0, true)
}

function loadMoreFilteredMoments() {
  void loadMoments(false, 0, true)
}

const normalizedMomentBlockedKeywords = computed(() => {
  if (!settings.value.momentsEnableKeywordFilter)
    return []

  return Array.from(new Set(
    settings.value.momentsBlockedKeywords
      .split(/[\n,，;；]+/)
      .map(keyword => keyword.trim().toLocaleLowerCase())
      .filter(Boolean),
  ))
})

function isMomentBlockedByKeyword(moment: DisplayMoment) {
  if (normalizedMomentBlockedKeywords.value.length === 0)
    return false

  const searchableText = [
    moment.author.name,
    moment.title,
    moment.text,
    ...moment.richText.map(segment => segment.text),
    moment.additional?.title,
    moment.additional?.desc,
    moment.forward?.author,
    moment.forward?.title,
    moment.forward?.text,
  ].filter(Boolean).join('\n').toLocaleLowerCase()

  return normalizedMomentBlockedKeywords.value.some(keyword => searchableText.includes(keyword))
}

/** 任一有效过滤开启时，后续分页只由“加载更多”触发。 */
function hasActiveMomentFilters() {
  return normalizedMomentBlockedKeywords.value.length > 0
    || settings.value.momentsFilterUpRecommendation
    || settings.value.momentsHideChargeExclusive
    || settings.value.momentsHideVideoReservation
    || settings.value.momentsHideLiveReservation
    || settings.value.momentsHideLiveDynamics
    || settings.value.momentsHideVideoDynamics
    || settings.value.momentsHideDrawDynamics
    || settings.value.momentsHideUgcSeasonDynamics
    || settings.value.momentsHideForwardDynamics
    || settings.value.momentsHidePgcDynamics
    || settings.value.momentsHideArticleDynamics
}

function requiresManualMomentPaging() {
  return activeMomentGroup.value === 'wanted' || hasActiveMomentFilters()
}

function passesMomentSettings(moment: DisplayMoment) {
  if (isMomentBlockedByKeyword(moment))
    return false
  if (settings.value.momentsFilterUpRecommendation && moment.isUpRecommendation)
    return false
  if (settings.value.momentsHideChargeExclusive && moment.isChargeExclusive)
    return false
  if (settings.value.momentsHideVideoReservation && moment.isVideoReservation)
    return false
  if (settings.value.momentsHideLiveReservation && moment.isLiveReservation)
    return false
  if (settings.value.momentsHideLiveDynamics && moment.isLive)
    return false
  // 番剧单独过滤；视频过滤不含 PGC
  if (settings.value.momentsHideVideoDynamics && moment.isRegularVideo && !moment.isPgc)
    return false
  if (settings.value.momentsHideDrawDynamics && moment.isDraw)
    return false
  if (settings.value.momentsHideUgcSeasonDynamics && moment.isUgcSeason)
    return false
  if (settings.value.momentsHideForwardDynamics && moment.isForward)
    return false
  if (settings.value.momentsHidePgcDynamics && moment.isPgc && !moment.isForward)
    return false
  if (settings.value.momentsHideArticleDynamics && moment.isArticle && !moment.isForward)
    return false
  return true
}

async function reapplyMomentFiltersFromCache() {
  if (activeMomentGroup.value !== 'all' || selectedHostMid.value)
    return false

  const sourceItems = feedReader.getLoaded(activeMomentFilter.value, activeMomentGroup.value, selectedHostMid.value)
  if (!sourceItems)
    return false

  const requestToken = ++feedRequestToken
  const requestType = activeMomentFilter.value
  const requestGroup = activeMomentGroup.value
  const requestHostMid = selectedHostMid.value
  const filteredItems = sourceItems
    .filter(passesMomentSettings)
    .sort((a, b) => b.publishedAt - a.publishedAt)

  moments.value = []
  momentLayout.clearColumns()
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0

  appendMoments(filteredItems)
  isInitialLoading.value = false
  isLoading.value = false

  if (filteredItems.length > 0 || noMoreContent.value) {
    await nextTick()
    if (isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)) {
      updateGridColumnCount()
      updateVirtualColumns()
      maybeLoadMoreNearBottom()
    }
    return true
  }
  return true
}

/**
 * 对各列底部做有限次数的跨列补位。
 * 仅从每列靠后的卡片中选择，并且只有能明确缩小列高差时才移动。
 */

/** 按最短列排布，尽量让各列底部相对平齐 */

/** 按设置的期望列数排布；空间不足时降列，避免卡片窄于最小可读宽度。 */

function applyMomentPatch(id: string, patch: Partial<DisplayMoment>) {
  const updated = feedReader.updateMoment(id, patch)
  if (!updated)
    return
  moments.value = moments.value.map(moment => moment.id === id ? updated : moment)
  momentLayout.updateMoment(updated)
  feedCache.updateMoment(id, moment => ({ ...moment, ...patch }))
  if (selectedMoment.value?.id === id)
    details.updateMoment(updated)
}
function handleMomentForwardCountChange(momentId: string, forwardCount: number) {
  forwardCountOverrides.set(`${getCurrentAccountId()}:${momentId}`, forwardCount)
  applyMomentPatch(momentId, { forwardCount })
}

function maybeLoadMoreNearBottom() {
  const viewport = scrollViewportRef.value
  if (
    !viewport
    || isInitialLoading.value
    || isLoading.value
    || noMoreContent.value
    || !moments.value.length
    || requiresManualMomentPaging()
  ) {
    return
  }

  const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
  const threshold = Math.max(LOAD_MORE_AHEAD_PX, viewport.clientHeight * 0.6)
  if (distanceFromBottom <= threshold)
    void loadMoments()
}

/** 卡片仅在第一次完成测量时播放入场动画，虚拟列表重新挂载不重复播放 */

function handleForwardVideoClick(video: DisplayForwardVideo) {
  recordVideoVisit(video)
}

function clearMomentPresentationForRefresh(nextItems: DisplayMoment[]) {
  momentActions.reset()
  commentSessions.clear()
  disclosureCache.clear()
  momentLayout.reset(nextItems)
  moments.value = []
  previews.clear()
}

async function loadMoments(reset = false, autoFillDepth = 0, manualPaging = false) {
  if (momentsExtensionContextInvalidated)
    return

  const requestedGeneration = reset ? ++feedRequestToken : feedRequestToken
  await momentsFeedCacheReady
  if (momentsExtensionContextInvalidated || !momentsMounted || requestedGeneration !== feedRequestToken)
    return
  if (!isSameAccount(loadedAccountId, getCurrentAccountId()))
    return
  ensureMomentsCacheAccount(loadedAccountId)

  // “想看”或任意类型过滤开启时只允许按钮触发后续批次。
  if (!reset && requiresManualMomentPaging() && !manualPaging)
    return
  if ((!reset && isLoading.value) || (!reset && noMoreContent.value))
    return

  if (reset) {
    feedRequestFailed.value = false
    isInitialLoading.value = true
    clearMomentPresentationForRefresh([])
  }
  const requestToken = feedRequestToken
  const requestType = activeMomentFilter.value
  const requestGroup = activeMomentGroup.value
  const requestHostMid = selectedHostMid.value
  const requestOffset = offset.value
  const requestUpdateBaseline = updateBaseline.value
  let pageApplied = false
  let preservedPaginationScrollTop: number | null = null
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
  }

  try {
    const response = await feedReader.read({
      reset,
      type: requestType,
      group: requestGroup,
      hostMid: requestHostMid,
      offset: offset.value,
      updateBaseline: updateBaseline.value,
      page: momentsFeedPage.value,
      filtered: hasActiveMomentFilters(),
      hasWantedUsers: momentsWantedUsers.value.length > 0,
    }, () => isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid))
    if (!response || !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid))
      return
    if ('hostUnfollowed' in response) {
      handleUpFilterChange('')
      return
    }
    const { rawItems, normalizedItems, nextOffset, nextUpdateBaseline } = response
    let { hasMore } = response
    momentsFeedPage.value = response.nextPage

    const existingMomentIds = new Set(moments.value.map(moment => moment.id))
    const hasUniqueResponseItem = normalizedItems.some(moment => !existingMomentIds.has(moment.id))
    const cursorAdvanced = nextOffset !== requestOffset
      || nextUpdateBaseline !== requestUpdateBaseline
    if (!reset && hasMore && !hasUniqueResponseItem && !cursorAdvanced)
      hasMore = false

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
      .filter(moment => requestGroup !== 'wanted' || wantedUserMids.value.has(moment.author.mid))
      .filter(moment => requestGroup !== 'wanted' || matchesMomentFilter(moment))
      .filter(passesMomentSettings)
      .sort((a, b) => b.publishedAt - a.publishedAt)
    if (!reset)
      preservedPaginationScrollTop = scrollViewportRef.value?.scrollTop ?? null
    if (!reset)
      momentLayout.suspendRebalance(1500)
    else
      clearMomentPresentationForRefresh(items)
    appendMoments(items)
    if (reset) {
      await nextTick()
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      if (!isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid))
        return
    }

    offset.value = nextOffset
    updateBaseline.value = nextUpdateBaseline
    noMoreContent.value = !hasMore
    feedRequestFailed.value = false
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

    if (isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)) {
      feedRequestFailed.value = reset || moments.value.length === 0
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
    if (isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)) {
      isLoading.value = false
      isInitialLoading.value = false
    }
  }

  if (
    preservedPaginationScrollTop !== null
    && isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
  ) {
    // 等卡片、虚拟 spacer 和底部加载提示完成更新后，恢复分页前的滚动位置
    await nextTick()
    updateVirtualColumns()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    if (!isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid))
      return
    const viewport = scrollViewportRef.value
    if (viewport)
      viewport.scrollTop = preservedPaginationScrollTop
  }

  if (
    !pageApplied
    || noMoreContent.value
    || requiresManualMomentPaging()
    || autoFillDepth >= MAX_POST_LOAD_AUTOFILL_PAGES
    || !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
  ) {
    return
  }

  // 哨兵分页后可能始终停留在视口内，不会再次触发进入事件；布局稳定后主动补载
  await nextTick()
  updateVirtualColumns()
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  if (!isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid))
    return
  const viewport = scrollViewportRef.value
  if (!viewport)
    return
  const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
  if (distanceFromBottom <= 240)
    void loadMoments(false, autoFillDepth + 1)
}

function clearMomentsPortalState() {
  portalUser.value = null
  portalLiveUsers.value = []
  portalLiveCount.value = 0
  portalUpList.value = []
}

async function loadMomentsPortal() {
  if (momentsExtensionContextInvalidated)
    return

  const requestToken = ++portalRequestToken
  const accountId = loadedAccountId
  isPortalLoading.value = true
  try {
    const response = await api.moment.getMomentsPortal() as MomentsPortalResult
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
  }
  catch {
    if (requestToken === portalRequestToken && isSameAccount(accountId, getCurrentAccountId()))
      clearMomentsPortalState()
  }
  finally {
    if (requestToken === portalRequestToken && isSameAccount(accountId, getCurrentAccountId()))
      isPortalLoading.value = false
  }
}

function refresh() {
  isInitialLoading.value = moments.value.length === 0
  void loadMoments(true)
  void loadMomentsPortal()
}

function resetMomentsAccountState() {
  momentActions.reset()
  previews.reset()
  closeMomentDetail()
  commentSessions.setAccount(commentAccountIdentity())
  commentSessions.clear()
  feedRequestToken++
  portalRequestToken++
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

  await momentsFeedCacheReady
  ensureMomentsCacheAccount(accountId)
  return changed
}

function handleMomentsReachBottom() {
  if (requiresManualMomentPaging() || isLoading.value || noMoreContent.value)
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
    refresh()
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
    if (momentsMounted && changed)
      refresh()
  })
})

onBeforeUnmount(() => {
  momentsMounted = false
  feedReader.reset()
  moments.value = []
  commentSessions.clear()
  feedRequestToken += 1
  portalRequestToken += 1
  upListResizeObserver?.disconnect()
  upListResizeObserver = undefined
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

watch([upListScrollerRef, upListTrackRef], async () => {
  await nextTick()
  setupUpListScrollerObserver()
})

watch(
  [
    () => visiblePortalUpList.value.map(up => up.mid).join(','),
    () => directWantedUsers.value.map(user => user.mid).join(','),
    () => settings.value.momentsEnableWantedFilter,
    () => isPortalLoading.value,
  ],
  async () => {
    await nextTick()
    scheduleUpListStateUpdate()
  },
)

watch(
  () => momentsWantedUsers.value.map(user => user.mid).join(','),
  () => {
    if (activeMomentGroup.value === 'wanted')
      void loadMoments(true)
  },
)

watch(
  () => momentsPinnedUsers.value.map(user => user.mid).join(','),
  async () => {
    await nextTick()
    scheduleUpListStateUpdate()
  },
)

watch(
  () => settings.value.momentsEnableWantedFilter,
  (enabled) => {
    if (enabled || activeMomentGroup.value !== 'wanted')
      return

    activeMomentGroup.value = 'all'
    feedReader.reset()
    if (scrollViewportRef.value)
      scrollViewportRef.value.scrollTop = 0
    void loadMoments(true)
  },
)

watch(
  [
    () => settings.value.momentsFilterUpRecommendation,
    () => settings.value.momentsHideChargeExclusive,
    () => settings.value.momentsHideVideoReservation,
    () => settings.value.momentsHideLiveReservation,
    () => settings.value.momentsHideLiveDynamics,
    () => settings.value.momentsHideVideoDynamics,
    () => settings.value.momentsHideDrawDynamics,
    () => settings.value.momentsHideUgcSeasonDynamics,
    () => settings.value.momentsHideForwardDynamics,
    () => settings.value.momentsHidePgcDynamics,
    () => settings.value.momentsHideArticleDynamics,
    () => settings.value.momentsEnableKeywordFilter,
    () => settings.value.momentsBlockedKeywords,
  ],
  async () => {
    if (await reapplyMomentFiltersFromCache())
      return
    void loadMoments(true)
  },
)

watch(
  [
    () => settings.value.momentsEnableLivePreview,
    () => settings.value.momentsEnableVideoPreview,
  ],
  () => {
    const activeMoment = moments.value.find(moment => moment.id === hoveredMediaId.value)
    if (!activeMoment || isMomentPreviewEnabled(activeMoment))
      return

    previews.clear()
  },
)

function appendMoments(items: DisplayMoment[]) {
  const wasEmpty = moments.value.length === 0
  const ids = new Set(moments.value.map(item => item.id))
  const incoming = items.filter((item) => {
    if (ids.has(item.id))
      return false
    ids.add(item.id)
    return true
  })
  moments.value.push(...incoming)
  momentLayout.append(incoming, wasEmpty)
}
</script>

<template>
  <section class="moments-page">
    <div
      ref="layoutRef"
      class="moments-layout"
      :class="{ 'moments-layout--with-sidebar': showMomentsSidebar }"
    >
      <header class="moments-filter-header">
        <section
          class="moments-filter-panel bew-segment-control bew-segment-control--surface"
          :class="{
            'bew-segment-control--solid': settings.disableFrostedGlass,
          }"
        >
          <div class="moments-filter-scroll">
            <div class="moments-filter-inside">
              <LiquidSegmentIndicator
                :active-key="activeMomentFilter"
              />
              <button
                v-for="filter in momentFilters"
                :key="filter.value"
                type="button"
                class="moments-filter-button bew-segment-control__item bew-segment-control__item--wide"
                data-segment-item
                :data-active="activeMomentFilter === filter.value ? 'true' : undefined"
                :aria-pressed="activeMomentFilter === filter.value"
                @click="handleMomentFilterChange(filter.value)"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>
        </section>
      </header>

      <aside
        v-if="showMomentsSidebar"
        v-layout-editable="'moments-sidebar'"
        class="moments-sidebar"
        data-layout-editable-id="moments-sidebar"
        :aria-label="t('moments.user_info')"
      >
        <div v-if="isPortalLoading" class="moments-sidebar-skeleton" aria-hidden="true">
          <div v-if="settings.momentsSidebarShowUserCard" class="moments-sidebar-skeleton__profile">
            <span class="moments-sidebar-skeleton__avatar moments-skeleton-block" />
            <span class="moments-sidebar-skeleton__name moments-skeleton-block" />
          </div>
          <div v-if="settings.momentsSidebarShowUserCard" class="moments-sidebar-skeleton__stats">
            <span v-for="index in 3" :key="index" class="moments-skeleton-block" />
          </div>
          <div v-if="settings.momentsSidebarShowPublish" class="moments-sidebar-skeleton__button moments-skeleton-block" />
          <div v-if="settings.momentsSidebarShowLive" class="moments-sidebar-skeleton__live">
            <span v-for="index in 3" :key="index" class="moments-skeleton-block" />
          </div>
        </div>
        <template v-else>
          <article v-if="settings.momentsSidebarShowUserCard && portalUser" class="moments-user-card">
            <a
              class="moments-user-card__profile"
              :href="`https://space.bilibili.com/${portalUser.mid}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img :src="getSidebarAvatarUrl(portalUser.face)" :alt="portalUser.name">
              <span class="moments-user-card__identity">
                <strong :style="{ color: portalUser.vip?.nickname_color || undefined }">{{ portalUser.name }}</strong>
                <span class="moments-user-card__badges">
                  <em v-if="portalUser.vip?.status === 1 && portalUser.vip.label?.text">{{ portalUser.vip.label.text }}</em>
                  <i v-if="portalUser.level_info?.current_level">LV{{ portalUser.level_info.current_level }}</i>
                </span>
              </span>
            </a>
            <div class="moments-user-card__stats">
              <a
                :href="`https://space.bilibili.com/${portalUser.mid}/fans/follow`"
                target="_blank"
                rel="noopener noreferrer"
                :title="portalUser.following"
                @click.stop
              ><strong>{{ numFormatter(portalUser.following || 0) }}</strong><small>{{ t('moments.following') }}</small></a>
              <a
                :href="`https://space.bilibili.com/${portalUser.mid}/fans/fans`"
                target="_blank"
                rel="noopener noreferrer"
                :title="portalUser.follower"
                @click.stop
              ><strong>{{ numFormatter(portalUser.follower || 0) }}</strong><small>{{ t('moments.followers') }}</small></a>
              <a
                :href="`https://space.bilibili.com/${portalUser.mid}/dynamic`"
                target="_blank"
                rel="noopener noreferrer"
                :title="portalUser.dyns"
                @click.stop
              ><strong>{{ numFormatter(portalUser.dyns || 0) }}</strong><small>{{ t('moments.moments') }}</small></a>
            </div>
          </article>

          <a
            v-if="settings.momentsSidebarShowPublish"
            class="moments-publish-link"
            href="https://t.bilibili.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span i-tabler-edit aria-hidden="true" />
            <span>{{ t('moments.publish') }}</span>
            <span i-tabler-external-link aria-hidden="true" />
          </a>

          <section v-if="settings.momentsSidebarShowLive && portalLiveUsers.length" class="moments-live-card">
            <header>
              <strong>{{ t('moments.live_now') }} <span>{{ portalLiveCount }}</span></strong>
            </header>
            <div class="moments-live-card__list">
              <a
                v-for="liveUser in portalLiveUsers"
                :key="liveUser.room_id"
                :href="liveUser.jump_url || `https://live.bilibili.com/${liveUser.room_id}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="moments-live-card__avatar">
                  <img :src="getSidebarAvatarUrl(liveUser.face, 64)" :alt="liveUser.uname" loading="lazy" decoding="async">
                  <em><span i-tabler-chart-bar />{{ t('moments.live_badge') }}</em>
                </span>
                <span class="moments-live-card__info">
                  <strong>{{ liveUser.uname }}</strong>
                  <small>{{ liveUser.title }}</small>
                </span>
              </a>
            </div>
          </section>
        </template>
      </aside>

      <main ref="momentsContentRef" class="moments-content">
        <section
          v-if="showMomentsUpList"
          v-layout-editable="'moments-up-list'"
          class="moments-up-list"
          data-layout-editable-id="moments-up-list"
          :aria-label="t('moments.feed_bar')"
        >
          <div class="moments-up-list__start" role="group" :aria-label="t('moments.feed_groups')">
            <button
              type="button"
              class="moments-up-list__item"
              :class="{ 'moments-up-list__item--active': !selectedHostMid && activeMomentGroup === 'all' }"
              :aria-pressed="!selectedHostMid && activeMomentGroup === 'all'"
              :title="t('moments.all_moments')"
              @click="handleUpFilterChange('')"
            >
              <span class="moments-up-list__avatar moments-up-list__avatar--all" aria-hidden="true">
                <span
                  class="moments-up-list__all-icon"
                  :class="!selectedHostMid && activeMomentGroup === 'all' ? 'i-tabler-windmill-filled' : 'i-tabler-windmill'"
                />
              </span>
              <span class="moments-up-list__name">{{ t('moments.all_moments') }}</span>
            </button>
            <button
              v-if="settings.momentsEnableWantedFilter"
              type="button"
              class="moments-up-list__item"
              :class="{ 'moments-up-list__item--active': activeMomentGroup === 'wanted' }"
              :aria-pressed="activeMomentGroup === 'wanted'"
              :disabled="activeMomentFilter !== 'all' && activeMomentFilter !== 'video'"
              :aria-label="activeMomentGroup === 'wanted' ? t('moments.wanted_disable') : t('moments.wanted_enable')"
              :title="activeMomentFilter === 'all' || activeMomentFilter === 'video'
                ? (activeMomentGroup === 'wanted' ? t('moments.wanted_disable') : t('moments.wanted_enable'))
                : t('moments.wanted_only_all_video')"
              @click="handleMomentGroupChange(activeMomentGroup === 'wanted' ? 'all' : 'wanted')"
            >
              <span class="moments-up-list__avatar moments-up-list__avatar--wanted" aria-hidden="true">
                <span
                  class="moments-up-list__wanted-icon"
                  :class="activeMomentGroup === 'wanted' ? 'i-tabler-star-filled' : 'i-tabler-star'"
                />
              </span>
              <span class="moments-up-list__name">{{ t('moments.wanted') }}</span>
            </button>
          </div>

          <div class="moments-up-list__main">
            <span
              class="moments-up-list__fade moments-up-list__fade--prev"
              :class="{ 'is-visible': canScrollUpListLeft }"
              aria-hidden="true"
            />
            <span
              class="moments-up-list__fade moments-up-list__fade--next"
              :class="{ 'is-visible': canScrollUpListRight }"
              aria-hidden="true"
            />
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

            <div
              v-if="isPortalLoading && !portalUpList.length"
              ref="upListScrollerRef"
              class="moments-up-list__scroller"
              aria-hidden="true"
            >
              <div ref="upListTrackRef" class="moments-up-list__track">
                <div
                  v-for="index in 8"
                  :key="index"
                  class="moments-up-list__item moments-up-list__item--skeleton"
                >
                  <span class="moments-up-list__avatar moments-skeleton-block" />
                  <span class="moments-up-list__name moments-skeleton-block" />
                </div>
              </div>
            </div>
            <div
              v-else
              ref="upListScrollerRef"
              class="moments-up-list__scroller"
              :class="{
                'can-scroll-left': canScrollUpListLeft,
                'can-scroll-right': canScrollUpListRight,
              }"
              role="group"
              :aria-label="t('moments.frequent_uploaders')"
              @scroll="scheduleUpListStateUpdate"
              @wheel="handleUpListWheel"
            >
              <div ref="upListTrackRef" class="moments-up-list__track">
                <button
                  v-for="up in visiblePortalUpList"
                  :key="up.mid"
                  type="button"
                  class="moments-up-list__item"
                  :class="{ 'moments-up-list__item--active': selectedHostMid === up.mid && activeMomentGroup === 'all' }"
                  :aria-pressed="selectedHostMid === up.mid && activeMomentGroup === 'all'"
                  :title="up.uname"
                  @click="handleUpFilterChange(up.mid)"
                >
                  <span class="moments-up-list__avatar">
                    <img
                      :src="getSidebarAvatarUrl(up.face, 96)"
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
                <template v-if="directWantedUsers.length">
                  <span v-if="visiblePortalUpList.length" class="moments-up-list__divider" aria-hidden="true" />
                  <button
                    v-for="user in directWantedUsers"
                    :key="user.mid"
                    type="button"
                    class="moments-up-list__item"
                    :class="{ 'moments-up-list__item--active': selectedHostMid === user.mid && activeMomentGroup === 'all' }"
                    :aria-pressed="selectedHostMid === user.mid && activeMomentGroup === 'all'"
                    :title="user.name"
                    @click="handleUpFilterChange(user.mid)"
                  >
                    <span class="moments-up-list__avatar">
                      <img
                        :src="getSidebarAvatarUrl(user.face, 96)"
                        :alt="user.name"
                        loading="lazy"
                        decoding="async"
                      >
                    </span>
                    <span class="moments-up-list__name">{{ user.name }}</span>
                  </button>
                </template>
                <template v-if="momentsPinnedUsers.length">
                  <span class="moments-up-list__divider" aria-hidden="true" />
                  <button
                    v-for="user in momentsPinnedUsers"
                    :key="user.mid"
                    type="button"
                    class="moments-up-list__item"
                    :class="{ 'moments-up-list__item--active': selectedHostMid === user.mid && activeMomentGroup === 'all' }"
                    :aria-pressed="selectedHostMid === user.mid && activeMomentGroup === 'all'"
                    :title="user.name"
                    @click="handleUpFilterChange(user.mid)"
                  >
                    <span class="moments-up-list__avatar">
                      <img
                        :src="getSidebarAvatarUrl(user.face, 96)"
                        :alt="user.name"
                        loading="lazy"
                        decoding="async"
                      >
                    </span>
                    <span class="moments-up-list__name">{{ user.name }}</span>
                  </button>
                </template>
              </div>
            </div>
          </div>
        </section>
        <div v-if="isInitialLoading" class="moments-page__initial-loading">
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
              <article
                v-for="itemIndex in 4"
                :key="itemIndex"
                class="moments-skeleton-card"
              >
                <div class="moments-skeleton-card__header">
                  <span class="moments-skeleton-card__avatar moments-skeleton-block" />
                  <span class="moments-skeleton-card__identity">
                    <span class="moments-skeleton-card__author moments-skeleton-block" />
                    <span class="moments-skeleton-card__time moments-skeleton-block" />
                  </span>
                </div>
                <div class="moments-skeleton-card__main">
                  <div class="moments-skeleton-card__cover moments-skeleton-block" />
                  <div class="moments-skeleton-card__body">
                    <div class="moments-skeleton-card__title moments-skeleton-block" />
                    <div v-for="lineIndex in 5" :key="lineIndex" class="moments-skeleton-card__line moments-skeleton-block" :class="{ 'moments-skeleton-card__line--short': lineIndex === 5 }" />
                  </div>
                </div>
                <div class="moments-skeleton-card__footer">
                  <span v-for="actionIndex in 3" :key="actionIndex" class="moments-skeleton-card__action moments-skeleton-block" />
                </div>
              </article>
            </div>
          </div>
        </div>
        <div v-else-if="feedRequestFailed" class="moments-page__empty moments-page__error" role="status">
          <span i-tabler-alert-circle text="size-$bew-icon-size-xl" />
          <p>{{ t('common.load_failed') }}</p>
          <button type="button" :disabled="isLoading" @click="refresh">
            {{ t('moments.retry') }}
          </button>
        </div>
        <div
          v-else-if="moments.length"
          ref="gridRef"
          v-layout-editable="'moments-grid'"
          class="moments-grid"
          data-layout-editable-id="moments-grid"
          :style="momentsGridStyle"
        >
          <div v-for="(column, columnIndex) in virtualColumns" :key="columnIndex" class="moments-grid__column">
            <div v-if="column.topPad" class="moments-grid__spacer" :style="{ height: `${column.topPad}px` }" />
            <MomentCard
              v-for="moment in column.items" :key="moment.id"
              :moment="momentActions.getDisplayMoment(moment)"
              :card-width="gridCardWidth"
              :ready="readyCardIds.has(moment.id)"
              :entering="enteringCardIds.has(moment.id)"
              :preview-active="Boolean(hoveredMediaId === moment.id && previewUrls[moment.id])"
              :preview-url="previewUrls[moment.id]"
              :image-ratio="getMomentImageRatio(moment)"
              :is-like-loading="likingMomentIds.has(moment.id)"
              :is-reservation-loading="reservationLoadingMomentIds.has(moment.id)"
              :is-watch-later-added="isWatchLaterAdded"
              :is-watch-later-loading="isWatchLaterLoading"
              @card-element="element => bindCardEl(element, moment)"
              @open-detail="openMomentDetail"
              @media-enter="handleMediaEnter"
              @media-leave="handleMediaLeave"
              @cover-load="(event, momentId) => handleCoverLoad(event, momentId)"
              @preview-video="bindPreviewVideo"
              @preview-canplay="playPreview"
              @forward-video-click="handleForwardVideoClick"
              @toggle-watch-later="toggleMomentWatchLater"
              @toggle-like="toggleMomentLike"
              @toggle-reservation="toggleMomentReservation"
              @open-image-preview="openMomentImagePreview"
              @interactive-resize="handleMomentCardInteractiveResize"
              @forward-count-change="handleMomentForwardCountChange"
            />
            <div v-if="column.bottomPad" class="moments-grid__spacer" :style="{ height: `${column.bottomPad}px` }" />
          </div>
        </div>
        <div v-else-if="!isInitialLoading && (!requiresManualMomentPaging() || noMoreContent)" class="moments-page__empty">
          <span i-tabler-windmill text="size-$bew-icon-size-xl" /><p>{{ activeMomentGroup === 'wanted' ? (momentsWantedUsers.length ? t('moments.empty_wanted') : t('moments.no_wanted_users')) : t('moments.empty') }}</p><button
            v-if="activeMomentGroup !== 'wanted' || momentsWantedUsers.length"
            :disabled="isLoading"
            @click="requiresManualMomentPaging() && !noMoreContent ? (activeMomentGroup === 'wanted' ? loadMoreWantedMoments() : loadMoreFilteredMoments()) : refresh()"
          >
            {{ isLoading ? t('moments.loading') : requiresManualMomentPaging() ? (!noMoreContent ? t('moments.load_more') : (activeMomentGroup === 'wanted' ? t('moments.recheck') : t('moments.reload'))) : t('moments.reload') }}
          </button>
        </div>
        <button
          v-if="requiresManualMomentPaging() && !isLoading && !noMoreContent"
          type="button"
          class="moments-wanted-load-more"
          @click="activeMomentGroup === 'wanted' ? loadMoreWantedMoments() : loadMoreFilteredMoments()"
        >
          <span i-tabler-arrow-down />
          {{ t('moments.load_more') }}
        </button>
        <p
          v-if="!isInitialLoading && moments.length"
          class="moments-page__loading"
          :class="{ 'is-visible': isLoading || noMoreContent }"
          :aria-hidden="!(isLoading || noMoreContent)"
          aria-live="polite"
        >
          <template v-if="isLoading">
            <span i-svg-spinners:ring-resize />
            {{ t('moments.loading_more') }}
          </template>
          <template v-else-if="noMoreContent">
            {{ t('moments.no_more') }}
          </template>
        </p>
      </main>
    </div>

    <Dialog
      v-if="selectedMoment && detailFrameUrl"
      append-to-bewly-body
      content-flush
      transition-name="moments-dialog"
      :show-header="false"
      :show-border="false"
      :show-footer="false"
      :frosted-glass="false"
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
        <div class="moment-detail-frame__loading" aria-hidden="true">
          <span class="moment-detail-frame__loading-icon" />
          {{ selectedMoment.isLive ? t('moments.opening_live') : selectedMoment.isVideo ? t('moments.opening_video') : selectedMoment.isForward ? t('moments.opening_forward') : t('moments.loading_detail') }}
        </div>
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
        <button
          type="button"
          class="moment-detail-frame__open"
          @click.stop="openDetailFrameInNewTab"
        >
          {{ t('moments.open_new_tab') }}
          <span i-tabler-external-link />
        </button>
      </div>
    </Dialog>

    <Teleport v-if="mainAppRef && detailImageViewerOpen" :to="mainAppRef">
      <div
        ref="detailImageViewerRef"
        class="moment-image-viewer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('moments.image_viewer')"
        tabindex="-1"
        @keydown="handleDetailImageViewerKeydown"
        @wheel.prevent.stop="handleDetailImageViewerWheel"
      >
        <CloseButton
          class="moment-image-viewer__close"
          :label="t('moments.close_image_viewer')"
          size="large"
          variant="overlay"
          @click="closeDetailImageViewer"
        />
        <div class="moment-image-viewer__stage" @click.self="closeDetailImageViewer">
          <img
            :src="detailImageViewerUrl"
            :alt="t('moments.image_large')"
            class="moment-image-viewer__image"
            :class="{
              'is-zoomed': detailImageViewerScale > 1,
              'is-dragging': detailImageViewerDragging,
            }"
            :style="{ transform: detailImageViewerTransform }"
            draggable="false"
            @dblclick.prevent.stop="handleDetailImageViewerDoubleClick"
            @pointerdown="handleDetailImageViewerPointerDown"
            @pointermove="handleDetailImageViewerPointerMove"
            @pointerup="handleDetailImageViewerPointerEnd"
            @pointercancel="handleDetailImageViewerPointerEnd"
          >
        </div>
        <button
          v-if="detailImageViewerUrls.length > 1"
          type="button"
          class="moment-image-viewer__nav moment-image-viewer__nav--prev"
          :aria-label="t('moments.previous_image')"
          @click="showDetailImageViewerImage(detailImageViewerIndex - 1)"
        >
          <span i-tabler-chevron-left />
        </button>
        <button
          v-if="detailImageViewerUrls.length > 1"
          type="button"
          class="moment-image-viewer__nav moment-image-viewer__nav--next"
          :aria-label="t('moments.next_image')"
          @click="showDetailImageViewerImage(detailImageViewerIndex + 1)"
        >
          <span i-tabler-chevron-right />
        </button>
        <div class="moment-image-viewer__toolbar">
          <span class="moment-image-viewer__counter">
            {{ detailImageViewerIndex + 1 }}/{{ detailImageViewerUrls.length }}
          </span>
          <span class="moment-image-viewer__divider" />
          <button type="button" :aria-label="t('moments.zoom_out')" :title="t('moments.zoom_out')" @click="setDetailImageViewerScale(detailImageViewerScale - 0.25)">
            −
          </button>
          <span class="moment-image-viewer__zoom">{{ Math.round(detailImageViewerScale * 100) }}%</span>
          <button type="button" :aria-label="t('moments.zoom_in')" :title="t('moments.zoom_in')" @click="setDetailImageViewerScale(detailImageViewerScale + 0.25)">
            +
          </button>
          <button type="button" :aria-label="t('moments.fit_window')" :title="t('moments.fit_window')" @click="resetDetailImageViewerTransform">
            1:1
          </button>
          <button
            type="button"
            :aria-label="t('moments.rotate_clockwise')"
            :title="t('moments.rotate_clockwise')"
            @click="detailImageViewerRotation = (detailImageViewerRotation + 90) % 360"
          >
            ↻
          </button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped lang="scss">
@use "../../../styles/breakpoints";

@property --moments-up-list-left-clear {
  syntax: "<number>";
  inherits: false;
  initial-value: 1;
}

@property --moments-up-list-right-clear {
  syntax: "<number>";
  inherits: false;
  initial-value: 1;
}

.moments-page {
  padding: var(--bew-space-2) 0 var(--bew-space-12);
}
.moments-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  row-gap: var(--bew-space-8);
  width: 100%;
}
.moments-layout--with-sidebar {
  grid-template-columns: var(--bew-layout-moments-sidebar-width) minmax(0, 1fr);
  column-gap: var(--bew-space-4);
}
.moments-content {
  grid-column: 1;
  grid-row: 2;
  width: 100%;
  min-width: 0;
}
.moments-layout--with-sidebar .moments-content {
  grid-column: 2;
}
.moments-up-list {
  display: flex;
  align-items: stretch;
  gap: 0;
  margin-bottom: var(--bew-space-4);
  padding: var(--bew-space-3) var(--bew-space-2) var(--bew-space-2);
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  background: var(--bew-elevated);
  box-shadow: none;
}
.moments-up-list__main {
  position: relative;
  min-width: 0;
  flex: 1 1 0;
}
.moments-up-list__start {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  margin-right: var(--bew-space-2);
}
.moments-up-list__scroller {
  --moments-up-list-left-clear: 1;
  --moments-up-list-right-clear: 1;
  --moments-up-list-left-clear-mask: linear-gradient(
    90deg,
    rgb(0 0 0 / var(--moments-up-list-left-clear)) 0,
    transparent calc(var(--bew-space-12) + var(--bew-space-10))
  );
  --moments-up-list-right-clear-mask: linear-gradient(
    270deg,
    rgb(0 0 0 / var(--moments-up-list-right-clear)) 0,
    transparent calc(var(--bew-space-12) + var(--bew-space-10))
  );
  --moments-up-list-base-mask: linear-gradient(
    90deg,
    transparent 0%,
    rgb(0 0 0 / 16%) var(--bew-space-4),
    rgb(0 0 0 / 48%) var(--bew-space-10),
    rgb(0 0 0 / 78%) calc(var(--bew-space-12) + var(--bew-space-4)),
    #000 calc(var(--bew-space-12) + var(--bew-space-10)),
    #000 calc(100% - var(--bew-space-12) - var(--bew-space-10)),
    rgb(0 0 0 / 78%) calc(100% - var(--bew-space-12) - var(--bew-space-4)),
    rgb(0 0 0 / 48%) calc(100% - var(--bew-space-10)),
    rgb(0 0 0 / 16%) calc(100% - var(--bew-space-4)),
    transparent 100%
  );
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-padding-inline: var(--bew-space-2);
  scrollbar-width: none;
  -webkit-mask-image:
    var(--moments-up-list-left-clear-mask), var(--moments-up-list-right-clear-mask), var(--moments-up-list-base-mask);
  mask-image:
    var(--moments-up-list-left-clear-mask), var(--moments-up-list-right-clear-mask), var(--moments-up-list-base-mask);
  mask-repeat: no-repeat;
  transition:
    --moments-up-list-left-clear 700ms var(--bew-ease-standard),
    --moments-up-list-right-clear 700ms var(--bew-ease-standard);
}
.moments-up-list__scroller.can-scroll-left {
  --moments-up-list-left-clear: 0;
}
.moments-up-list__scroller.can-scroll-right {
  --moments-up-list-right-clear: 0;
}
.moments-up-list__scroller::-webkit-scrollbar {
  display: none;
}
.moments-up-list__track {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  width: max-content;
  min-width: 100%;
  padding-block: 6px var(--bew-space-1);
  box-sizing: border-box;
}
.moments-up-list__fade {
  position: absolute;
  top: 50%;
  z-index: 1;
  width: calc(var(--bew-space-12) + var(--bew-space-12) + var(--bew-space-12));
  height: calc(100% + var(--bew-space-12));
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    color-mix(in oklab, var(--bew-elevated-solid) 24%, transparent) 0%,
    color-mix(in oklab, var(--bew-elevated-solid) 10%, transparent) 38%,
    transparent 74%
  );
  filter: var(--bew-filter-glass-1);
  transform: translateY(-50%);
  transition: opacity 700ms var(--bew-ease-standard);
}
.moments-up-list__fade.is-visible {
  opacity: 0.72;
}
.moments-up-list__fade--prev {
  left: calc(0px - var(--bew-space-12) - var(--bew-space-6));
}
.moments-up-list__fade--next {
  right: calc(0px - var(--bew-space-12) - var(--bew-space-6));
}
.moments-up-list__arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  border: 1px solid var(--bew-surface-border-color);
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
  backdrop-filter: var(--bew-filter-glass-1);
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
.moments-up-list__divider {
  flex: 0 0 auto;
  width: 1px;
  height: 40px;
  margin: 0 var(--bew-space-1);
  background: var(--bew-border-color);
}
.moments-up-list__item {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-1);
  width: 64px;
  min-width: 64px;
  padding: var(--bew-space-1);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-decoration: none;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);
}
.moments-up-list__item:hover:not(:disabled) {
  color: var(--bew-text-1);
  transform: translateY(-2px);
}
.moments-up-list__item:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}
.moments-up-list__item:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
.moments-up-list__item--active .moments-up-list__name {
  color: var(--bew-theme-foreground);
}
.moments-up-list__item--active .moments-up-list__avatar > img,
.moments-up-list__item--active .moments-up-list__avatar--all,
.moments-up-list__item--active .moments-up-list__avatar--wanted {
  box-shadow:
    0 0 0 2px var(--bew-elevated),
    0 0 0 4px var(--bew-theme-color);
}
.moments-up-list__item--skeleton {
  pointer-events: none;
}
.moments-up-list__avatar {
  position: relative;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
}
.moments-up-list__avatar > img,
.moments-up-list__item--skeleton .moments-up-list__avatar {
  display: block;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  object-fit: cover;
  background: var(--bew-fill-1);
}
.moments-up-list__avatar--all,
.moments-up-list__avatar--wanted {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  box-sizing: border-box;
  border: 0;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  color: var(--bew-theme-foreground);
  background: var(--bew-theme-color-20);
}
.moments-up-list__item--active .moments-up-list__avatar--all,
.moments-up-list__item--active .moments-up-list__avatar--wanted {
  border: 2px solid var(--bew-theme-color);
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}
.moments-up-list__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.moments-up-list__all-icon,
.moments-up-list__wanted-icon {
  display: block;
  width: 22px;
  height: 22px;
  line-height: 1;
}
.moments-up-list__dot {
  position: absolute;
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border: 2px solid var(--bew-elevated);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-bili-pink);
  box-sizing: border-box;
}
.moments-up-list__name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moments-up-list__item--skeleton .moments-up-list__name {
  width: 40px;
  height: 12px;
  border-radius: var(--bew-radius-sm);
}
.moments-sidebar {
  grid-column: 1;
  grid-row: 2;
  position: sticky;
  top: calc(var(--bew-top-bar-height, 64px) + var(--bew-space-3));
  display: flex;
  justify-self: end;
  width: var(--bew-layout-moments-sidebar-width);
  max-height: calc(100dvh - var(--bew-top-bar-height, 64px) - var(--bew-space-6));
  flex-direction: column;
  gap: var(--bew-space-3);
  min-width: 0;
}
.moments-user-card,
.moments-live-card,
.moments-sidebar-skeleton {
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
  background: var(--bew-elevated);
  box-shadow: none;
}
.moments-user-card {
  padding: var(--bew-space-4);
}
.moments-user-card__profile {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  margin: calc(0px - var(--bew-space-2));
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: inherit;
  text-decoration: none;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}
.moments-user-card__profile:hover {
  background: var(--bew-fill-1);
}
.moments-user-card__profile > img {
  flex: 0 0 auto;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-fill-1);
  object-fit: cover;
}
.moments-user-card__identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-2);
}
.moments-user-card__identity > strong {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moments-user-card__badges {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
}
.moments-user-card__badges em,
.moments-user-card__badges i {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--bew-radius-half);
  font-size: var(--bew-font-size-caption);
  font-style: normal;
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-caption);
}
.moments-user-card__badges em {
  color: #fff;
  background: #fb7299;
}
.moments-user-card__badges i {
  color: #fb7299;
  border: 1px solid currentcolor;
}
.moments-user-card__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: var(--bew-space-5);
}
.moments-user-card__stats > a {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-1);
  color: inherit;
  text-decoration: none;
}
.moments-user-card__stats strong {
  overflow: hidden;
  max-width: 100%;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-semibold);
  text-overflow: ellipsis;
}
.moments-user-card__stats strong,
.moments-user-card__stats small {
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
}
.moments-user-card__stats small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.moments-user-card__stats > a:hover strong,
.moments-user-card__stats > a:hover small {
  color: var(--bew-theme-foreground);
}
.moments-user-card__stats > a:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
.moments-publish-link {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: 44px;
  padding: 0 var(--bew-space-4);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-elevated);
  box-shadow: none;
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-body);
  text-decoration: none;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;
}
.moments-publish-link > :last-child {
  margin-left: auto;
  color: var(--bew-text-3);
}
.moments-publish-link:hover {
  color: var(--bew-text-1);
  background: var(--bew-elevated-hover);
}
.moments-publish-link:focus-visible,
.moments-user-card__profile:focus-visible,
.moments-live-card__list > a:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
.moments-live-card {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  padding: var(--bew-space-4) 0 var(--bew-space-3);
}
.moments-live-card > header {
  padding: 0 var(--bew-space-4) var(--bew-space-2);
}
.moments-live-card > header strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
}
.moments-live-card > header span {
  color: var(--bew-text-3);
  font-weight: var(--bew-font-weight-medium);
}
.moments-live-card__list {
  display: flex;
  /* 五个 72px 直播项加四个 4px 间距，超出后在卡片内滚动。 */
  max-height: 376px;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-inline: var(--bew-space-4);
}
.moments-live-card__list > a {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  height: 72px;
  min-width: 0;
  flex: 0 0 72px;
  padding: var(--bew-space-2) var(--bew-space-1);
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  text-decoration: none;
  transition: background-color 0.18s ease;
}
.moments-live-card__list > a:hover {
  background: var(--bew-fill-1);
}
.moments-live-card__avatar {
  position: relative;
  flex: 0 0 auto;
  width: 48px;
  height: 54px;
}
.moments-live-card__avatar img {
  display: block;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-fill-1);
  object-fit: cover;
}
.moments-live-card__avatar em {
  position: absolute;
  left: 50%;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-0-5);
  height: 17px;
  padding: 0 var(--bew-space-1);
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  color: #fff;
  background: #fb7299;
  font-size: var(--bew-font-size-caption);
  font-style: normal;
  line-height: var(--bew-line-height-caption);
  transform: translateX(-50%);
  white-space: nowrap;
}
.moments-live-card__avatar em::after {
  position: absolute;
  inset: -3px;
  border: 1px solid #fb7299;
  border-radius: inherit;
  corner-shape: inherit;
  content: "";
  pointer-events: none;
  animation: moments-live-pulse 1.05s ease-out infinite;
}
.moments-live-card__info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-1);
}
.moments-live-card__info strong,
.moments-live-card__info small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moments-live-card__info strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-body);
}
.moments-live-card__info small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.moments-sidebar-skeleton {
  padding: var(--bew-space-4);
}
.moments-sidebar-skeleton__profile {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
}
.moments-sidebar-skeleton__avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}
.moments-sidebar-skeleton__name {
  width: 104px;
  height: 17px;
  border-radius: var(--bew-radius-half);
}
.moments-sidebar-skeleton__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--bew-space-4);
  margin-top: var(--bew-space-5);
}
.moments-sidebar-skeleton__stats > span {
  height: 34px;
  border-radius: var(--bew-radius-md);
}
.moments-sidebar-skeleton__button {
  display: block;
  height: 44px;
  margin-top: var(--bew-space-4);
  border-radius: var(--bew-radius-lg);
}
.moments-sidebar-skeleton__live {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-4);
}
.moments-sidebar-skeleton__live > span {
  height: 54px;
  border-radius: var(--bew-radius-lg);
}
@keyframes moments-live-pulse {
  0% {
    opacity: 0.75;
    transform: scale(0.94);
  }
  70%,
  100% {
    opacity: 0;
    transform: scale(1.14);
  }
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
.moments-skeleton-card {
  container-type: inline-size;
  min-height: 316px;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  background: color-mix(in oklab, var(--bew-elevated), transparent 42%);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bew-border-color), transparent 72%);
}
.moments-skeleton-block {
  background:
    linear-gradient(
      100deg,
      transparent 20%,
      color-mix(in oklab, var(--bew-fill-4), transparent 28%) 50%,
      transparent 80%
    ),
    var(--bew-skeleton);
  background-size: 220% 100%;
  animation: moment-shimmer 1.4s linear infinite;
}
.moments-skeleton-card__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3) var(--bew-space-4);
}
.moments-skeleton-card__identity {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}
.moments-skeleton-card__main {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(0, 1fr);
  gap: var(--bew-space-3);
  min-height: 0;
  padding: 0 var(--bew-space-4) var(--bew-space-4);
}
.moments-skeleton-card__cover {
  width: 100%;
  min-height: 0;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 16 / 9;
  opacity: 0.68;
}
.moments-skeleton-card__body {
  padding: var(--bew-space-1) 0 0;
}
.moments-skeleton-card__title {
  width: 72%;
  height: 16px;
  border-radius: var(--bew-radius-half);
}
.moments-skeleton-card__line {
  width: 94%;
  height: 11px;
  margin-top: var(--bew-space-3);
  border-radius: var(--bew-radius-sm);
}
.moments-skeleton-card__line--short {
  width: 58%;
  margin-top: var(--bew-space-2);
}
.moments-skeleton-card__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: var(--bew-space-6);
  height: 42px;
  padding: 0 34px;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 72%);
}
.moments-skeleton-card__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}
.moments-skeleton-card__author {
  display: block;
  width: 92px;
  height: 12px;
  border-radius: var(--bew-radius-sm);
}
.moments-skeleton-card__time {
  display: block;
  width: 58px;
  height: 8px;
  border-radius: var(--bew-radius-sm);
}
.moments-skeleton-card__action {
  height: 11px;
  border-radius: var(--bew-radius-sm);
}
.moments-filter-header {
  position: relative;
  z-index: 8;
  grid-column: 1;
  grid-row: 1;
  display: grid;
  grid-template-columns: minmax(0, max-content);
  justify-content: start;
  justify-self: start;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.moments-layout--with-sidebar .moments-filter-header {
  grid-column: 2;
}
.moments-filter-panel {
  max-width: 100%;
}
.moments-filter-scroll {
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.moments-filter-scroll::-webkit-scrollbar {
  display: none;
}
.moments-filter-inside {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--bew-control-gap);
  width: max-content;
  height: 100%;
  box-sizing: border-box;
}
@media (max-width: 1000px) {
  .moments-filter-panel {
    max-width: 100%;
  }
}
@media (max-width: 600px) {
  .moments-filter-header {
    grid-template-columns: minmax(0, 1fr);
  }
}
.moments-page__empty button {
  border: 1px solid var(--bew-surface-border-color);
  min-height: var(--bew-control-height);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-elevated);
  color: var(--bew-text-1);
  padding: 0 var(--bew-space-4);
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-page__empty button:hover {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  border-color: var(--bew-theme-color);
}
.moments-page__empty button:disabled {
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

@container (max-width: 359px) {
  .moments-skeleton-card__main {
    display: block;
  }

  .moments-skeleton-card__cover {
    min-height: 0;
  }

  .moments-skeleton-card__body {
    padding-top: 16px;
  }
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
.moments-wanted-load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  min-width: 124px;
  height: var(--bew-control-height);
  margin: var(--bew-space-5) auto 0;
  padding: 0 var(--bew-space-4);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  color: var(--bew-text-1);
  background: var(--bew-elevated);
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-wanted-load-more:hover {
  color: var(--bew-on-theme-color);
  border-color: var(--bew-theme-color);
  background: var(--bew-theme-color);
}
.moments-page__empty {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
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
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  background: var(--bew-bg);
  font-size: var(--bew-font-size-control);
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.18s ease;
}
.moment-detail-frame__loading-icon {
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
  box-sizing: border-box;
  flex: 0 0 auto;
  border: 2px solid var(--bew-theme-color-20);
  border-top-color: var(--bew-theme-color);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  animation: moment-detail-loading-spin 720ms linear infinite;
}
@keyframes moment-detail-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .moments-skeleton-block,
  .moment-detail-frame__loading-icon {
    animation: none;
  }

  .moments-up-list__fade,
  .moments-up-list__scroller {
    transition-duration: 0ms;
  }

  .moment-detail-frame__loading-icon {
    border-color: var(--bew-theme-color);
  }
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
  right: 12px;
  bottom: 12px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);
  font-family: inherit;
  text-decoration: none;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  opacity: 0.92;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.moment-detail-frame__open:hover {
  opacity: 1;
  transform: translateY(-1px);
}
.moment-image-viewer {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-image-viewer);
  overflow: hidden;
  color: #fff;
  background: rgb(18 18 18 / 76%);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
  touch-action: none;
}
.moment-image-viewer__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 24px 72px 96px;
  overflow: hidden;
}
.moment-image-viewer__image {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  border: 0 !important;
  outline: 0 !important;
  border-radius: 0;
  box-shadow: none !important;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 0.12s ease-out;
  user-select: none;
  -webkit-user-drag: none;
  cursor: zoom-in;
}
.moment-image-viewer__image.is-zoomed {
  cursor: grab;
}
.moment-image-viewer__image.is-dragging {
  cursor: grabbing;
  transition: none;
}
.moment-image-viewer__nav,
.moment-image-viewer__toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  border: 0 !important;
  outline: 0;
  color: #fff;
  background: rgb(0 0 0 / 48%);
  box-shadow: none !important;
  font-family: inherit;
  cursor: pointer;
}
.moment-image-viewer__nav:hover,
.moment-image-viewer__toolbar button:hover {
  background: rgb(0 0 0 / 72%);
}
.moment-image-viewer__nav:focus-visible,
.moment-image-viewer__toolbar button:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.moment-image-viewer__close {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 4;
}
.moment-image-viewer__nav {
  position: absolute;
  top: 50%;
  z-index: 4;
  width: 44px;
  height: 56px;
  border-radius: var(--bew-radius-md);
  transform: translateY(-50%);
  font-size: var(--bew-icon-size-xl);
  line-height: 1;
}
.moment-image-viewer__nav--prev {
  left: 16px;
}
.moment-image-viewer__nav--next {
  right: 16px;
}
.moment-image-viewer__toolbar {
  position: absolute;
  left: 50%;
  bottom: 24px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  background: rgb(0 0 0 / 58%);
  box-shadow: 0 8px 30px rgb(0 0 0 / 28%);
  transform: translateX(-50%);
  white-space: nowrap;
}
.moment-image-viewer__toolbar button {
  width: 34px;
  height: 34px;
  aspect-ratio: 1;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: transparent;
  font-size: var(--bew-icon-size-md);
}
.moment-image-viewer__counter,
.moment-image-viewer__zoom {
  min-width: 48px;
  text-align: center;
  font-size: var(--bew-font-size-control);
  font-variant-numeric: tabular-nums;
}
.moment-image-viewer__divider {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: rgb(255 255 255 / 24%);
}

.moments-up-list,
.moments-up-list__item,
.moments-up-list__item--skeleton .moments-up-list__name,
.moments-user-card,
.moments-live-card,
.moments-sidebar-skeleton,
.moments-user-card__badges em,
.moments-user-card__badges i,
.moments-publish-link,
.moments-live-card__list > a,
.moments-live-card__avatar em,
.moments-sidebar-skeleton__name,
.moments-sidebar-skeleton__stats > span,
.moments-sidebar-skeleton__button,
.moments-sidebar-skeleton__live > span,
.moments-skeleton-card,
.moments-skeleton-card__cover,
.moments-skeleton-card__title,
.moments-skeleton-card__line,
.moments-skeleton-card__author,
.moments-skeleton-card__time,
.moments-skeleton-card__action,
.moments-page__empty button,
.moments-wanted-load-more,
.moment-detail-frame,
.moment-detail-frame__open,
.moment-image-viewer__nav,
.moment-image-viewer__toolbar {
  corner-shape: var(--bew-corner-shape);
}

.moments-live-card__avatar em::after {
  corner-shape: inherit;
}

.moments-live-card__avatar em,
.moments-wanted-load-more,
.moment-detail-frame__open,
.moment-image-viewer__toolbar {
  corner-shape: var(--bew-corner-shape-round);
}

@media (max-width: breakpoints.$grid-sm) {
  .moment-image-viewer__stage {
    padding: 68px 12px 92px;
  }
  .moment-image-viewer__nav {
    top: auto;
    bottom: 24px;
    width: 36px;
    height: 42px;
    transform: none;
  }
}
@keyframes moment-shimmer {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -120% 0;
  }
}
</style>
