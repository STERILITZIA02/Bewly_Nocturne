<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { FilterType, useFilter } from '~/composables/useFilter'
import { LanguageType } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { appAuthTokens, noCookieForYouRecommendationState, settings } from '~/logic'
import { parseDedeUserID } from '~/logic/loginStatus'
import type { AppForYouResult, Item as AppVideoItem } from '~/models/video/appForYou'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import type { forYouResult, Item as VideoItem } from '~/models/video/forYou'
import type { AppVideoElement, VideoCardDisplayData, VideoElement } from '~/stores/forYouStore'
import { useForYouStore } from '~/stores/forYouStore'
import type { AccountId } from '~/utils/accountScope'
import { isSameAccount } from '~/utils/accountScope'
import api from '~/utils/api'
import { TVAppKey } from '~/utils/authProvider'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { debugLog } from '~/utils/debug'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { isVerticalVideo } from '~/utils/uriParse'

import type { RecommendationDataState } from '../recommendationState'
import { resolveRecommendationSuccessState } from '../recommendationState'

const { gridLayout } = defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const toast = useToast()
const { t } = useI18n()
const forYouStore = useForYouStore()

const filterFunc = useFilter(
  ['is_followed'],
  [
    FilterType.duration,
    FilterType.viewCount,
    FilterType.likeCount,
    FilterType.title,
    FilterType.user,
    FilterType.user,
    FilterType.publishTime,
  ],
  [
    ['duration'],
    ['stat', 'view'],
    ['stat', 'like'],
    ['title'],
    ['owner', 'name'],
    ['owner', 'mid'],
    ['pubdate'],
  ],
)

const appFilterFunc = useFilter(
  ['bottom_rcmd_reason'],
  [
    FilterType.filterOutVerticalVideos,
    FilterType.duration,
    FilterType.viewCountStr,
    FilterType.title,
    FilterType.user,
    FilterType.user,
  ],
  [
    ['uri'],
    ['player_args', 'duration'],
    ['cover_left_text_1'],
    ['title'],
    ['mask', 'avatar', 'text'],
    ['mask', 'avatar', 'up_id'],
  ],
)

const { handleReachBottom, handlePageRefresh, haveScrollbar, undoForwardState, handleUndoRefresh, handleForwardRefresh, handleBackToTop, scrollViewportRef } = useBewlyApp()

// 先声明数据变量
const videoList = ref<VideoElement[]>([])
const appVideoList = ref<AppVideoElement[]>([])

const isWebRecommendationMode = computed(() => settings.value.recommendationMode !== 'app')
let requestVersion = 0
let loadedAccountId: AccountId = getCurrentAccountId()
let isComponentActive = false
let initializationPending = false
const pendingTimers = new Set<number>()
const disposers: Array<() => void> = []
type WebRecommendRequestType = 'refresh' | 'loadMore'

function scheduleTimer(callback: () => void, delay: number) {
  const timer = window.setTimeout(() => {
    pendingTimers.delete(timer)
    callback()
  }, delay)
  pendingTimers.add(timer)
  return timer
}

function clearPendingTimers() {
  pendingTimers.forEach(timer => window.clearTimeout(timer))
  pendingTimers.clear()
  initializationPending = false
}

disposers.push(clearPendingTimers)

const HOME_LOAD_LOG_PREFIX = '[Bewly Nocturne][首页加载]'
let recommendRequestLogId = 0

interface RecommendRequestLogContext {
  id: number
  mode: string
  requestType: WebRecommendRequestType
  startedAt: number
}

function startRecommendRequestLog(
  mode: string,
  requestType: WebRecommendRequestType,
): RecommendRequestLogContext {
  const context = {
    id: ++recommendRequestLogId,
    mode,
    requestType,
    startedAt: performance.now(),
  }
  debugLog(`${HOME_LOAD_LOG_PREFIX} 插件开始请求推荐接口`, {
    time: new Date().toLocaleString(),
    requestId: context.id,
    mode,
    requestType,
  })
  return context
}

function getRequestDuration(context: RecommendRequestLogContext): number {
  return Math.round((performance.now() - context.startedAt) * 100) / 100
}

function logRecommendRequestSuccess(
  context: RecommendRequestLogContext,
) {
  debugLog(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求成功`, {
    time: new Date().toLocaleString(),
    requestId: context.id,
    mode: context.mode,
    requestType: context.requestType,
    durationMs: getRequestDuration(context),
  })
}

function logRecommendRequestFailure(
  context: RecommendRequestLogContext,
  details: Record<string, unknown> = {},
) {
  const error = details.error
  const diagnostic: Record<string, unknown> = {
    time: new Date().toLocaleString(),
    requestId: context.id,
    mode: context.mode,
    requestType: context.requestType,
    durationMs: getRequestDuration(context),
    errorKind: error !== undefined
      ? isExtensionContextInvalidatedError(error)
        ? 'extension-context-invalidated'
        : isBilibiliRiskControl(error) ? 'risk-control' : 'network'
      : isBilibiliRiskControl(details) ? 'risk-control' : 'api-error',
  }

  for (const key of ['code', 'message', 'reason', 'phase'] as const) {
    const value = details[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      diagnostic[key] = value
  }

  debugLog(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, diagnostic)
}

// 当前使用的视频列表（根据推荐模式）
const currentVideoList = computed(() =>
  isWebRecommendationMode.value ? videoList.value : appVideoList.value,
)

const isLoading = ref<boolean>(true)
const recommendationDataState = ref<RecommendationDataState>('idle')
const requestFailed = computed(() => (
  recommendationDataState.value === 'risk-control'
  || recommendationDataState.value === 'request-error'
))
const needToLoginFirst = ref<boolean>(false)
const refreshIdx = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const activatedAppVideo = ref<AppVideoItem | null>()
const showDislikeDialog = ref<boolean>(false)
const hasInitializedData = ref<boolean>(false)

function getCurrentAccountId(): AccountId {
  return parseDedeUserID(document.cookie) ?? null
}

function logHomeLoadComplete(source: 'api' | 'cache', startedAt: number) {
  debugLog(`${HOME_LOAD_LOG_PREFIX} 加载完成`, {
    time: new Date().toLocaleString(),
    source,
    mode: settings.value.recommendationMode,
    failed: requestFailed.value,
    needToLogin: needToLoginFirst.value,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  })
}

// 页面可见性状态
const isPageVisible = ref<boolean>(!document.hidden)
const selectedDislikeReason = ref<number>(1)

// 修改缓存数据变量，添加前进状态变量
const cachedVideoList = ref<VideoElement[]>([])
const cachedRefreshIdx = ref<number>(1)

// 添加前进状态变量
const forwardVideoList = ref<VideoElement[]>([])
const forwardRefreshIdx = ref<number>(1)

// APP 模式的缓存和前进状态变量
const cachedAppVideoList = ref<AppVideoElement[]>([])
const forwardAppVideoList = ref<AppVideoElement[]>([])

// 添加状态标记
const hasBackState = ref<boolean>(false)
const hasForwardState = ref<boolean>(false)

const PAGE_SIZE = 30
const WEB_REFRESH_PAGE_SIZE = 10
const WEB_LOAD_MORE_PAGE_SIZE = 12
const WEB_RISK_COOLDOWN_MS = 60_000
const NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS = 3
const MAX_EMPTY_LOADS = 5 // 最大连续空加载次数
const FILTERED_FEED_SAMPLE_SIZE = 100
const FILTERED_FEED_MIN_RETENTION_RATE = 0.6
const APP_LOAD_BATCHES = ref<number>(1) // APP模式每次加载的批次数，初始化时为1
const scrollLoadStartLength = ref<number>(0) // 滚动加载开始时的列表长度
const consecutiveEmptyLoads = ref<number>(0) // 连续空加载次数，用于防止无限递归（Web模式）
const appConsecutiveEmptyLoads = ref<number>(0) // APP模式连续空加载次数
// 递归加载锁，防止双重触发
const isRecursiveLoading = ref<boolean>(false)
const webRiskCooldownUntil = ref(0)
let notifiedWebRiskCooldownUntil = 0
const webFetchRow = ref<number>(1)
const webShowlistGroups = ref<string[]>([])

const cachedWebFetchRow = ref<number>(1)
const cachedWebShowlistGroups = ref<string[]>([])

const forwardWebFetchRow = ref<number>(1)
const forwardWebShowlistGroups = ref<string[]>([])

const filteredFeedCandidateCount = ref(0)
const filteredFeedKeptCount = ref(0)
const hasActiveWebRecommendationFilter = computed(() => settings.value.enableFilterByDuration
  || settings.value.enableFilterByViewCount
  || settings.value.enableFilterByLikeCount
  || settings.value.enableFilterByTitle
  || settings.value.enableFilterByUser
  || settings.value.enableFilterByPublishTime)
const hasActiveAppRecommendationFilter = computed(() => settings.value.filterOutVerticalVideos
  || settings.value.enableFilterByDuration
  || settings.value.enableFilterByViewCount
  || settings.value.enableFilterByTitle
  || settings.value.enableFilterByUser)
const hasActiveRecommendationFilter = computed(() => isWebRecommendationMode.value
  ? hasActiveWebRecommendationFilter.value
  : hasActiveAppRecommendationFilter.value)
const filteredFeedRetentionRate = computed(() => filteredFeedCandidateCount.value > 0
  ? filteredFeedKeptCount.value / filteredFeedCandidateCount.value
  : 1)
const requiresManualFilteredPaging = computed(() => hasActiveRecommendationFilter.value
  && filteredFeedCandidateCount.value >= FILTERED_FEED_SAMPLE_SIZE
  && filteredFeedRetentionRate.value < FILTERED_FEED_MIN_RETENTION_RATE)
const recommendationEmptyDescription = computed(() => recommendationDataState.value === 'filtered-empty'
  ? t('home.recommendation_filtered_empty')
  : t('home.recommendation_empty'))

function setRecommendationFailure(error: unknown) {
  recommendationDataState.value = isBilibiliRiskControl(error)
    ? 'risk-control'
    : 'request-error'
  noMoreContent.value = false
}

function applyRecommendationSuccessState(input: {
  apiItemCount: number
  displayedItemCount: number
  filterCandidateCount: number
  filterKeptCount: number
  filtersActive: boolean
}) {
  recommendationDataState.value = resolveRecommendationSuccessState(input)
  if (
    input.displayedItemCount === 0
    && (
      recommendationDataState.value === 'empty'
      || recommendationDataState.value === 'filtered-empty'
    )
  ) {
    noMoreContent.value = true
  }
}

const recommendationFilterSettingsSignature = computed(() => JSON.stringify([
  settings.value.disableFilterForFollowedUser,
  settings.value.filterOutVerticalVideos,
  settings.value.enableFilterByDuration,
  settings.value.enableFilterByViewCount,
  settings.value.enableFilterByLikeCount,
  settings.value.enableFilterByTitle,
  settings.value.enableFilterByUser,
  settings.value.enableFilterByPublishTime,
  settings.value.filterByDuration,
  settings.value.filterByViewCount,
  settings.value.filterByLikeCount,
  settings.value.filterByPublishTime,
  settings.value.filterByTitle.map(item => item.keyword),
  settings.value.filterByUser.map(item => item.keyword),
]))

function resetFilteredFeedPagingState() {
  filteredFeedCandidateCount.value = 0
  filteredFeedKeptCount.value = 0
}

function recordFilteredFeedBatch(candidateCount: number, keptCount: number) {
  if (!hasActiveRecommendationFilter.value)
    return

  filteredFeedCandidateCount.value += candidateCount
  filteredFeedKeptCount.value += keptCount
}

watch(recommendationFilterSettingsSignature, () => {
  resetFilteredFeedPagingState()
  consecutiveEmptyLoads.value = 0
  appConsecutiveEmptyLoads.value = 0
})

// 监听页面可见性变化
function handleVisibilityChange() {
  isPageVisible.value = !document.hidden
}

let visibilityListenerAttached = false
function attachVisibilityListener() {
  if (visibilityListenerAttached)
    return
  visibilityListenerAttached = true
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function detachVisibilityListener() {
  if (!visibilityListenerAttached)
    return
  visibilityListenerAttached = false
  document.removeEventListener('visibilitychange', handleVisibilityChange)
}

disposers.push(detachVisibilityListener)

// 添加页面可见性监听器
onMounted(() => {
  const loadStartedAt = performance.now()
  isComponentActive = true
  attachVisibilityListener()
  loadedAccountId = getCurrentAccountId()

  if (!isSameAccount(forYouStore.state.accountId, loadedAccountId))
    forYouStore.resetState()

  // 如果启用状态保留且store中有数据，则恢复状态
  if (
    settings.value.preserveForYouState
    && forYouStore.state.isInitialized
    && isSameAccount(forYouStore.state.accountId, loadedAccountId)
    && forYouStore.state.recommendationMode === settings.value.recommendationMode
  ) {
    // 恢复关键状态
    const savedState = forYouStore.getCompleteState()
    videoList.value = [...savedState.videoList]
    appVideoList.value = [...savedState.appVideoList]
    refreshIdx.value = savedState.refreshIdx
    noMoreContent.value = savedState.noMoreContent
    rebuildShowlistGroupsFromList(videoList.value)
    hasInitializedData.value = true
    isLoading.value = false

    nextTick(() => logHomeLoadComplete('cache', loadStartedAt))

    // 确保撤销按钮不显示（因为这是状态恢复，不是刷新操作）
    hasBackState.value = false
    hasForwardState.value = false
    undoForwardState.value = UndoForwardState.Hidden

    // 清空所有缓存状态，确保没有历史数据影响
    cachedVideoList.value = []
    cachedRefreshIdx.value = 1
    forwardVideoList.value = []
    forwardRefreshIdx.value = 1

    // 恢复滚动位置
    if (savedState.scrollTop) {
      nextTick(() => {
        const viewport = scrollViewportRef.value
        if (viewport)
          viewport.scrollTop = savedState.scrollTop || 0
      })
    }

    // 延迟初始化页面交互功能，避免立即触发数据加载
    scheduleTimer(() => {
      initPageAction()
      // 在初始化页面交互功能后，再次确保按钮状态正确
      scheduleTimer(() => {
        if (settings.value.preserveForYouState && forYouStore.state.isInitialized) {
          undoForwardState.value = UndoForwardState.Hidden
        }
      }, 100)
    }, 1000)
  }
  else {
    // 首次加载或未启用状态保留时，初始化数据
    initializationPending = true
    scheduleTimer(() => {
      initializationPending = false
      if (isComponentActive)
        void initData()
    }, 200)
    initPageAction()
  }
})

onActivated(() => {
  isComponentActive = true
  attachVisibilityListener()
  if (ensureForYouAccount() || (!initializationPending && !hasInitializedData.value && !isLoading.value))
    void initData()
  initPageAction()
})

onDeactivated(() => {
  isComponentActive = false
  detachVisibilityListener()
  requestVersion++
  clearPendingTimers()
  if (isLoading.value)
    emit('afterLoading')
  isLoading.value = false
  isRecursiveLoading.value = false
  if (!hasInitializedData.value)
    recommendationDataState.value = 'idle'
})

onBeforeUnmount(() => {
  requestVersion++
  // 如果启用状态保留，保存当前状态到store
  if (settings.value.preserveForYouState
    && hasInitializedData.value
    && isSameAccount(loadedAccountId, getCurrentAccountId())) {
    // 获取当前滚动位置
    const scrollTop = scrollViewportRef.value?.scrollTop || 0

    const currentState = {
      accountId: loadedAccountId,
      videoList: [...videoList.value],
      appVideoList: [...appVideoList.value],
      refreshIdx: refreshIdx.value,
      noMoreContent: noMoreContent.value,
      isInitialized: true,
      recommendationMode: settings.value.recommendationMode,
      scrollTop, // 保存滚动位置
    }
    forYouStore.saveCompleteState(currentState)
  }
})

onUnmounted(() => {
  isComponentActive = false
  for (const dispose of disposers)
    dispose()
  disposers.length = 0
})

onKeyStroke((e: KeyboardEvent) => {
  if (showDislikeDialog.value) {
    const dislikeReasons = activatedAppVideo.value?.three_point_v2?.find(option => option.type === ThreePointV2Type.Dislike)?.reasons || []

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      dislikeReasons.forEach((reason) => {
        if (dislikeReasons[Number(e.key) - 1] && reason.id === dislikeReasons[Number(e.key) - 1].id)
          selectedDislikeReason.value = reason.id
      })
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const currentIndex = dislikeReasons.findIndex(reason => selectedDislikeReason.value === reason.id)
      if (currentIndex > 0)
        selectedDislikeReason.value = dislikeReasons[currentIndex - 1].id
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const currentIndex = dislikeReasons.findIndex(reason => selectedDislikeReason.value === reason.id)
      if (currentIndex < dislikeReasons.length - 1)
        selectedDislikeReason.value = dislikeReasons[currentIndex + 1].id
    }
  }
})

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
// 这样可以避免在模板中进行大量计算，提高渲染性能
function transformWebVideo(item: VideoItem): VideoCardDisplayData {
  return {
    id: item.id,
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    cover: item.pic,
    author: {
      name: decodeHtmlEntities(item.owner?.name || ''),
      authorFace: item.owner?.face || '',
      followed: !!item.is_followed,
      mid: item.owner?.mid || 0,
    },
    tag: decodeHtmlEntities(item?.rcmd_reason?.content),
    view: item.stat?.view || 0,
    danmaku: item.stat?.danmaku || 0,
    like: item.stat?.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    cid: item.cid,
    goto: item.goto,
    trackId: item.track_id,
    threePointV2: [],
  }
}

function transformAppVideo(item: AppVideoItem): VideoCardDisplayData {
  // 预先计算 followed 状态，避免多次 trim 和比较
  const bottomReason = item?.bottom_rcmd_reason?.trim()
  const followed = bottomReason === '已关注' || bottomReason === '已關注'

  // 预先计算 capsuleText，提取复杂逻辑
  const descPart = item?.desc?.split('·')?.[1]?.trim()
  const capsuleText = descPart || (followed ? bottomReason : undefined)

  // 预先计算 type，避免在模板中调用函数
  let type: 'horizontal' | 'vertical' | 'bangumi' = 'horizontal'
  if (item.card_goto === 'bangumi') {
    type = 'bangumi'
  }
  else if (item.uri && isVerticalVideo(item.uri)) {
    type = 'vertical'
  }

  return {
    // 注意：aid 可能为 0 或 undefined，但只要有 bvid 就是有效视频
    // VideoCardGrid 的骨架屏判断已优化为同时检查 id 和 bvid
    id: item.args?.aid ?? 0,
    durationStr: item.cover_right_text,
    title: decodeHtmlEntities(item.title),
    cover: item.cover || '',
    author: {
      name: decodeHtmlEntities(item?.mask?.avatar?.text || ''),
      authorFace: item?.mask?.avatar?.cover || item?.avatar?.cover || '',
      followed,
      mid: item?.mask?.avatar?.up_id || 0,
    },
    capsuleText: decodeHtmlEntities(capsuleText),
    bvid: item.bvid || '',
    viewStr: item.cover_left_text_1,
    danmakuStr: item.cover_left_text_2,
    cid: item?.player_args?.cid,
    goto: item?.goto,
    param: item?.param,
    trackId: item?.track_id,
    url: item?.goto === 'bangumi' ? item.uri : '',
    type,
    threePointV2: item?.three_point_v2 || [],
  }
}

function getWebVideoKey(item: VideoItem): string {
  const bvid = item.bvid?.trim()
  if (bvid)
    return bvid
  return `${item.id}`
}

function getAppVideoKeys(item: AppVideoItem): string[] {
  const keys: string[] = []
  const bvid = item.bvid?.trim()
  if (bvid)
    keys.push(`bvid:${bvid}`)

  const aid = item.args?.aid
  if (aid && aid > 0)
    keys.push(`aid:${aid}`)
  return keys
}

function getWebShowlistEntry(item: VideoItem): string | undefined {
  const goto = `${item.goto || ''}`.trim()
  if (!goto)
    return undefined

  const id = item.id || 'undefined'
  if (goto === 'av')
    return `av_n_${id}`
  if (goto === 'live')
    return `live_n_${id}`
  if (goto === 'ad')
    return `ad_${id}`

  return `${goto}_${id}`
}

function buildLastShowlistGroup(items: VideoItem[]): string {
  const parts: string[] = []
  const seen = new Set<string>()

  items.forEach((item) => {
    const entry = getWebShowlistEntry(item)
    if (!entry || seen.has(entry))
      return

    seen.add(entry)
    parts.push(entry)
  })

  return parts.join(',')
}

function getLastShowlistFromGroups(): string {
  return webShowlistGroups.value.filter(Boolean).join(';')
}

function getNoCookieStoredLastShowlist(): string {
  if (!settings.value.rememberNoCookieRecommendationState)
    return ''

  return noCookieForYouRecommendationState.value.showlistGroups
    .filter(Boolean)
    .slice(-NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS)
    .join(';')
}

function getNoCookieNextFreshIdx(): number {
  if (!settings.value.rememberNoCookieRecommendationState)
    return refreshIdx.value

  const nextFreshIdx = noCookieForYouRecommendationState.value.nextFreshIdx
  return Number.isFinite(nextFreshIdx) && nextFreshIdx > 0 ? Math.floor(nextFreshIdx) : 1
}

function saveNoCookieRecommendationState(group: string, recommendationMode: string, nextFreshIdx?: number) {
  if (recommendationMode !== 'webNoCookie' || !settings.value.rememberNoCookieRecommendationState)
    return
  if (!group && nextFreshIdx === undefined)
    return

  const groups = noCookieForYouRecommendationState.value.showlistGroups
    .filter(storedGroup => storedGroup && storedGroup !== group)

  if (group)
    groups.push(group)

  noCookieForYouRecommendationState.value = {
    showlistGroups: groups.slice(-NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS),
    nextFreshIdx: nextFreshIdx ?? noCookieForYouRecommendationState.value.nextFreshIdx,
  }
}

function rebuildShowlistGroupsFromList(list: VideoElement[]) {
  const items = list
    .map(video => video.item)
    .filter((item): item is VideoItem => !!item)
  const group = buildLastShowlistGroup(items)
  webShowlistGroups.value = group ? [group] : []
}

function resetWebRecommendState() {
  refreshIdx.value = 1
  webFetchRow.value = 1
  webShowlistGroups.value = []
}

function isWebRiskCooldownActive(): boolean {
  if (webRiskCooldownUntil.value > Date.now())
    return true

  if (webRiskCooldownUntil.value) {
    webRiskCooldownUntil.value = 0
    notifiedWebRiskCooldownUntil = 0
    noMoreContent.value = false
  }
  return false
}

function startWebRiskCooldown() {
  if (!isWebRiskCooldownActive())
    webRiskCooldownUntil.value = Date.now() + WEB_RISK_COOLDOWN_MS
  noMoreContent.value = true
}

function resetWebRiskCooldown() {
  webRiskCooldownUntil.value = 0
  notifiedWebRiskCooldownUntil = 0
}

function notifyWebRiskCooldown(key = 'home.web_recommendation_risk_cooldown') {
  if (!isWebRiskCooldownActive() || notifiedWebRiskCooldownUntil === webRiskCooldownUntil.value)
    return

  notifiedWebRiskCooldownUntil = webRiskCooldownUntil.value
  toast.warning(t(key, {
    seconds: Math.max(1, Math.ceil((webRiskCooldownUntil.value - Date.now()) / 1000)),
  }))
}

function isCurrentWebRequest(version: number, recommendationMode: string, accountId: AccountId) {
  return isComponentActive
    && version === requestVersion
    && recommendationMode === settings.value.recommendationMode
    && isSameAccount(accountId, loadedAccountId)
    && isSameAccount(accountId, getCurrentAccountId())
}

function resetForYouAccountState() {
  requestVersion++
  recommendationDataState.value = 'idle'
  videoList.value = []
  appVideoList.value = []
  refreshIdx.value = 1
  noMoreContent.value = false
  hasInitializedData.value = false
  cachedVideoList.value = []
  forwardVideoList.value = []
  cachedAppVideoList.value = []
  forwardAppVideoList.value = []
  hasBackState.value = false
  hasForwardState.value = false
  undoForwardState.value = UndoForwardState.Hidden
  resetWebRiskCooldown()
  resetWebRecommendState()
  resetFilteredFeedPagingState()
  forYouStore.resetState()
}

function ensureForYouAccount() {
  const accountId = getCurrentAccountId()
  if (isSameAccount(loadedAccountId, accountId))
    return false

  loadedAccountId = accountId
  resetForYouAccountState()
  return true
}

watch(() => settings.value.recommendationMode, () => {
  requestVersion++
  recommendationDataState.value = 'idle'
  noMoreContent.value = false
  hasInitializedData.value = false
  resetWebRiskCooldown()
  resetWebRecommendState()
  resetFilteredFeedPagingState()
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器
  appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器

  videoList.value = []
  appVideoList.value = []
  forwardVideoList.value = []
  cachedVideoList.value = []
  forwardAppVideoList.value = []
  cachedAppVideoList.value = []
  cachedWebFetchRow.value = 1
  cachedWebShowlistGroups.value = []
  forwardWebFetchRow.value = 1
  forwardWebShowlistGroups.value = []

  // 重置前进后退状态
  hasBackState.value = false
  hasForwardState.value = false
  undoForwardState.value = UndoForwardState.Hidden

  // 重置store状态
  forYouStore.resetState()

  if (isComponentActive)
    void initData()
})

async function initData() {
  if (isWebRecommendationMode.value && isWebRiskCooldownActive()) {
    recommendationDataState.value = 'risk-control'
    notifyWebRiskCooldown()
    return
  }

  const loadStartedAt = performance.now()
  requestVersion++
  const version = requestVersion
  const recommendationMode = settings.value.recommendationMode
  const accountId = loadedAccountId
  hasInitializedData.value = false
  if (isWebRecommendationMode.value)
    webFetchRow.value = 1

  // 直接清空列表，骨架屏由 VideoCardGrid 自动处理
  videoList.value = []
  appVideoList.value = []
  noMoreContent.value = false

  APP_LOAD_BATCHES.value = 1 // 初始化时只加载1批
  resetFilteredFeedPagingState()
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器
  appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器
  recommendationDataState.value = 'idle'
  needToLoginFirst.value = false
  try {
    await getData('refresh')
  }
  finally {
    if (isCurrentWebRequest(version, recommendationMode, accountId)) {
      hasInitializedData.value = true
      await nextTick()
      logHomeLoadComplete('api', loadStartedAt)
    }
  }
}

async function getData(webRequestType: WebRecommendRequestType = 'refresh') {
  const version = requestVersion
  const recommendationMode = settings.value.recommendationMode
  const accountId = loadedAccountId
  if (isWebRecommendationMode.value && isWebRiskCooldownActive()) {
    notifyWebRiskCooldown()
    return
  }
  emit('beforeLoading')
  isLoading.value = true
  recommendationDataState.value = 'loading'

  try {
    if (isWebRecommendationMode.value) {
      await getRecommendVideos(version, webRequestType)
    }
    else {
      try {
        await getAppRecommendVideos(version, webRequestType)
      }
      catch (error) {
        if (isExtensionContextInvalidatedError(error))
          return

        if (!isCurrentWebRequest(version, recommendationMode, accountId) || recommendationMode !== 'app')
          return

        debugLog(`${HOME_LOAD_LOG_PREFIX} App 推荐接口请求失败`, {
          errorKind: isBilibiliRiskControl(error) ? 'risk-control' : 'network',
        })

        // 检查是否启用自动切换
        if (settings.value.autoSwitchRecommendationMode) {
          // 切换到 web 模式并提示用户
          settings.value.recommendationMode = 'web'
          toast.warning('App 推荐数据加载失败，已自动切换至 Web 模式')
        }
        else {
          setRecommendationFailure(error)
          toast.error('App 推荐数据加载失败，请手动切换至 Web 模式或稍后重试')
        }
      }
    }
  }
  catch (error) {
    if (isCurrentWebRequest(version, recommendationMode, accountId) && !isExtensionContextInvalidatedError(error))
      setRecommendationFailure(error)
  }
  finally {
    if (isCurrentWebRequest(version, recommendationMode, accountId)) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

function retryRecommendation() {
  resetWebRiskCooldown()
  noMoreContent.value = false
  recommendationDataState.value = 'idle'
  void initData()
}

function loadMore(manual = false) {
  if (isWebRecommendationMode.value && isWebRiskCooldownActive()) {
    notifyWebRiskCooldown()
    return
  }

  // 如果正在递归加载中，跳过外部触发的加载请求
  if (
    !hasInitializedData.value
    || isLoading.value
    || noMoreContent.value
    || isRecursiveLoading.value
    || (!manual && requiresManualFilteredPaging.value)
  ) {
    return
  }

  // 滚动加载时，APP模式记录开始长度，触发持续加载
  if (settings.value.recommendationMode === 'app') {
    APP_LOAD_BATCHES.value = 1
    scrollLoadStartLength.value = appVideoList.value.length
  }

  void getData('loadMore')
}

// 供 VideoCardGrid 预加载调用的函数
function handleLoadMore() {
  loadMore()
}

function handleManualLoadMore() {
  loadMore(true)
}

function initPageAction() {
  // VideoCardGrid owns infinite scrolling. Clear callbacks left by other kept-alive tabs.
  handleReachBottom.value = undefined

  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    // 根据当前模式保存数据
    if (isWebRecommendationMode.value) {
      // 总是保存刷新前的当前状态到后退缓存
      cachedVideoList.value = videoList.value.slice()
      cachedRefreshIdx.value = refreshIdx.value
      cachedWebFetchRow.value = webFetchRow.value
      cachedWebShowlistGroups.value = [...webShowlistGroups.value]
      hasBackState.value = true

      // 清空前进状态（因为刷新会产生新的分支）
      forwardVideoList.value = []
      forwardWebFetchRow.value = 1
      forwardWebShowlistGroups.value = []
      hasForwardState.value = false

      // 显示撤销按钮
      undoForwardState.value = UndoForwardState.ShowUndo
    }
    else if (settings.value.recommendationMode === 'app') {
      // APP 模式下保存刷新前的当前状态到后退缓存
      cachedAppVideoList.value = appVideoList.value.slice()
      hasBackState.value = true

      // 清空前进状态（因为刷新会产生新的分支）
      forwardAppVideoList.value = []
      hasForwardState.value = false

      // 显示撤销按钮
      undoForwardState.value = UndoForwardState.ShowUndo
    }

    retryRecommendation()
  }

  // 修改撤销刷新的处理函数
  handleUndoRefresh.value = () => {
    if (hasBackState.value) {
      if (isWebRecommendationMode.value && cachedVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // Web模式下的后退操作
        // 保存当前数据到前进状态
        forwardVideoList.value = videoList.value.slice()
        forwardRefreshIdx.value = refreshIdx.value
        forwardWebFetchRow.value = webFetchRow.value
        forwardWebShowlistGroups.value = [...webShowlistGroups.value]
        hasForwardState.value = true

        // 恢复缓存的数据
        videoList.value = cachedVideoList.value.slice()
        refreshIdx.value = cachedRefreshIdx.value
        webFetchRow.value = cachedWebFetchRow.value
        webShowlistGroups.value = [...cachedWebShowlistGroups.value]

        hasBackState.value = false
        undoForwardState.value = UndoForwardState.Hidden
        resetFilteredFeedPagingState()
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
      }
      else if (settings.value.recommendationMode === 'app' && cachedAppVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // APP模式下的后退操作
        // 保存当前数据到前进状态
        forwardAppVideoList.value = appVideoList.value.slice()
        hasForwardState.value = true

        // 恢复缓存的数据
        appVideoList.value = cachedAppVideoList.value.slice()

        hasBackState.value = false
        undoForwardState.value = UndoForwardState.Hidden
        resetFilteredFeedPagingState()
        appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器
      }
    }
  }

  // 添加前进功能
  handleForwardRefresh.value = () => {
    if (hasForwardState.value) {
      if (isWebRecommendationMode.value && forwardVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // Web模式下的前进操作
        // 保存当前数据到后退状态
        cachedVideoList.value = videoList.value.slice()
        cachedRefreshIdx.value = refreshIdx.value
        cachedWebFetchRow.value = webFetchRow.value
        cachedWebShowlistGroups.value = [...webShowlistGroups.value]
        hasBackState.value = true

        // 恢复前进状态的数据
        videoList.value = forwardVideoList.value.slice()
        refreshIdx.value = forwardRefreshIdx.value
        webFetchRow.value = forwardWebFetchRow.value
        webShowlistGroups.value = [...forwardWebShowlistGroups.value]

        // 标记为已经前进
        hasForwardState.value = false
        undoForwardState.value = UndoForwardState.ShowUndo
        resetFilteredFeedPagingState()
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
        return true
      }
      else if (settings.value.recommendationMode === 'app' && forwardAppVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // APP模式下的前进操作
        // 保存当前数据到后退状态
        cachedAppVideoList.value = appVideoList.value.slice()
        hasBackState.value = true

        // 恢复前进状态的数据
        appVideoList.value = forwardAppVideoList.value.slice()

        // 标记为已经前进
        hasForwardState.value = false
        undoForwardState.value = UndoForwardState.ShowUndo
        resetFilteredFeedPagingState()
        appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器
        return true
      }
    }
    return false
  }
}

async function getRecommendVideos(version = requestVersion, requestType: WebRecommendRequestType = 'refresh') {
  const recommendationMode = settings.value.recommendationMode
  const accountId = loadedAccountId
  let canFillViewport = false

  try {
    if (isWebRiskCooldownActive()) {
      notifyWebRiskCooldown()
      return
    }

    // 检查是否达到最大空加载次数，防止无限递归
    if (!hasActiveRecommendationFilter.value && consecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
      console.warn('达到最大连续空加载次数，停止加载')
      noMoreContent.value = true
      return
    }

    const beforeLoadCount = videoList.value.filter(video => video.item).length

    // 使用当前的 refreshIdx，只在成功时才递增
    const isLoadMoreRequest = requestType === 'loadMore'
    const shouldUseNoCookieStoredFreshIdx = !isLoadMoreRequest && recommendationMode === 'webNoCookie' && settings.value.rememberNoCookieRecommendationState
    const currentRefreshIdx = shouldUseNoCookieStoredFreshIdx ? getNoCookieNextFreshIdx() : refreshIdx.value
    const pageSize = isLoadMoreRequest ? WEB_LOAD_MORE_PAGE_SIZE : WEB_REFRESH_PAGE_SIZE
    const fetchRow = isLoadMoreRequest ? webFetchRow.value + 3 : 1
    const currentLastShowlist = getLastShowlistFromGroups()
    const lastShowlist = currentLastShowlist || (!isLoadMoreRequest && recommendationMode === 'webNoCookie' ? getNoCookieStoredLastShowlist() : '')

    const getWebRecommendVideos = recommendationMode === 'webNoCookie'
      ? api.video.getNoCookieRecommendVideos
      : api.video.getRecommendVideos

    const requestOptions = {
      fresh_type: isLoadMoreRequest ? 4 : 5,
      fresh_idx: currentRefreshIdx,
      fresh_idx_1h: currentRefreshIdx,
      ps: pageSize,
      fetch_row: fetchRow,
      last_showlist: lastShowlist || undefined,
    }
    let requestLog = startRecommendRequestLog(recommendationMode, requestType)
    let response: forYouResult | undefined

    const tryNoCookieFallback = async () => {
      startWebRiskCooldown()
      requestLog = startRecommendRequestLog('webNoCookie(fallback)', requestType)
      try {
        response = await api.video.getNoCookieRecommendVideos(requestOptions)
      }
      catch (error) {
        if (!isExtensionContextInvalidatedError(error))
          logRecommendRequestFailure(requestLog, { error, phase: 'fallback' })
        if (isCurrentWebRequest(version, recommendationMode, accountId)) {
          recommendationDataState.value = 'risk-control'
          noMoreContent.value = false
          notifyWebRiskCooldown('home.web_recommendation_risk_fallback_failed')
        }
        return false
      }

      if (!isCurrentWebRequest(version, recommendationMode, accountId))
        return false

      if (!response || isBilibiliRiskControl(response) || response.code !== 0 || !response.data || !Array.isArray(response.data.item)) {
        logRecommendRequestFailure(requestLog, {
          code: response?.code,
          message: response?.message,
          phase: 'fallback',
        })
        setRecommendationFailure(response)
        notifyWebRiskCooldown('home.web_recommendation_risk_fallback_failed')
        return false
      }

      notifyWebRiskCooldown('home.web_recommendation_risk_fallback_active')
      return true
    }

    try {
      response = await getWebRecommendVideos(requestOptions)
    }
    catch (error) {
      if (!isExtensionContextInvalidatedError(error))
        logRecommendRequestFailure(requestLog, { error, phase: 'primary' })

      if (!isCurrentWebRequest(version, recommendationMode, accountId))
        return

      if (recommendationMode === 'web' && isBilibiliRiskControl(error)) {
        if (!await tryNoCookieFallback())
          return
      }
      else if (recommendationMode === 'webNoCookie' && isBilibiliRiskControl(error)) {
        startWebRiskCooldown()
        recommendationDataState.value = 'risk-control'
        noMoreContent.value = false
        notifyWebRiskCooldown()
        return
      }
      else {
        throw error
      }
    }

    if (!isCurrentWebRequest(version, recommendationMode, accountId))
      return

    if (isBilibiliRiskControl(response)) {
      logRecommendRequestFailure(requestLog, {
        code: response?.code,
        message: response?.message,
        phase: 'primary',
      })
      if (recommendationMode === 'web') {
        if (!await tryNoCookieFallback())
          return
      }
      else {
        startWebRiskCooldown()
        recommendationDataState.value = 'risk-control'
        noMoreContent.value = false
        notifyWebRiskCooldown()
        return
      }
    }

    if (!response) {
      logRecommendRequestFailure(requestLog, { reason: '响应为空' })
      setRecommendationFailure(response)
      return
    }

    if (!response.data) {
      logRecommendRequestFailure(requestLog, {
        code: response.code,
        message: response.message,
        reason: '响应数据为空',
      })
      setRecommendationFailure(response)
      return
    }

    if (response.code === 0 && Array.isArray(response.data.item)) {
      // 只在成功时递增 refreshIdx
      refreshIdx.value = currentRefreshIdx + 1
      webFetchRow.value = fetchRow

      const resData = [] as VideoItem[]
      const existingIds = new Set<string>()
      const activeWebFilter = hasActiveWebRecommendationFilter.value ? filterFunc.value : null
      let filteredCandidateCount = 0
      let filteredKeptCount = 0

      videoList.value.forEach((video) => {
        if (video.item)
          existingIds.add(getWebVideoKey(video.item))
      })

      response.data.item.forEach((item: VideoItem) => {
        // 过滤掉广告卡片
        if (item.goto === 'ad')
          return

        // 过滤掉缺少必要字段的数据（owner 或 stat 为 null）
        if (!item.owner || !item.stat)
          return

        const itemKey = getWebVideoKey(item)
        if (existingIds.has(itemKey))
          return

        existingIds.add(itemKey)
        if (activeWebFilter)
          filteredCandidateCount++

        if (activeWebFilter && !activeWebFilter(item))
          return

        if (activeWebFilter)
          filteredKeptCount++
        resData.push(item)
      })

      recordFilteredFeedBatch(filteredCandidateCount, filteredKeptCount)

      const showlistGroup = buildLastShowlistGroup(resData)
      if (showlistGroup)
        webShowlistGroups.value.push(showlistGroup)

      // when videoList has length property, it means it is the first time to load
      if (!beforeLoadCount) {
        videoList.value = resData.map(item => ({
          uniqueId: getWebVideoKey(item),
          item,
          displayData: transformWebVideo(item),
        }))
      }
      else {
        resData.forEach((item) => {
          // If the `filterFunc` is unset, indicating that the user hasn't specified the filter,
          // skep the `findFirstEmptyItemIndex` check to enhance the performance
          if (!filterFunc.value) {
            videoList.value.push({
              uniqueId: getWebVideoKey(item),
              item,
              displayData: transformWebVideo(item),
            })
          }
          else {
            const findFirstEmptyItemIndex = videoList.value.findIndex(video => !video.item)
            if (findFirstEmptyItemIndex !== -1) {
              videoList.value[findFirstEmptyItemIndex] = {
                uniqueId: getWebVideoKey(item),
                item,
                displayData: transformWebVideo(item),
              }
            }
            else {
              videoList.value.push({
                uniqueId: getWebVideoKey(item),
                item,
                displayData: transformWebVideo(item),
              })
            }
          }
        })
      }

      saveNoCookieRecommendationState(
        showlistGroup,
        recommendationMode,
        shouldUseNoCookieStoredFreshIdx ? currentRefreshIdx + 1 : undefined,
      )

      // 检查是否成功添加了新内容
      const afterLoadCount = videoList.value.filter(video => video.item).length
      applyRecommendationSuccessState({
        apiItemCount: response.data.item.length,
        displayedItemCount: afterLoadCount,
        filterCandidateCount: filteredCandidateCount,
        filterKeptCount: filteredKeptCount,
        filtersActive: Boolean(activeWebFilter),
      })
      if (afterLoadCount > beforeLoadCount) {
        // 成功加载了新内容，重置空加载计数器
        consecutiveEmptyLoads.value = 0
      }
      else {
        // 没有加载到新内容，增加空加载计数器
        consecutiveEmptyLoads.value++
      }
      logRecommendRequestSuccess(requestLog)
      canFillViewport = true
    }
    else if (response.code === 62011) {
      logRecommendRequestFailure(requestLog, {
        code: response.code,
        message: response.message,
      })
      needToLoginFirst.value = true
      recommendationDataState.value = 'idle'
    }
    else {
      // 其他错误码也应该停止加载，避免无限重试
      logRecommendRequestFailure(requestLog, {
        code: response.code,
        message: response.message,
      })
      setRecommendationFailure(response)
    }
  }
  finally {
    if (canFillViewport && isCurrentWebRequest(version, recommendationMode, accountId)) {
      const filledItems = videoList.value.filter(video => video.item)
      videoList.value = filledItems

      if (!needToLoginFirst.value && !noMoreContent.value) {
        await nextTick()

        const hasScrollbar = await haveScrollbar()
        if (!hasScrollbar || filledItems.length < PAGE_SIZE || filledItems.length < 1) {
          if (
            !hasActiveRecommendationFilter.value
            && isPageVisible.value
            && consecutiveEmptyLoads.value < MAX_EMPTY_LOADS
          ) {
            // 设置递归加载锁，防止 VideoCardGrid 触发额外的 loadMore
            isRecursiveLoading.value = true
            try {
              await getRecommendVideos(version, 'loadMore')
            }
            finally {
              isRecursiveLoading.value = false
            }
          }
          else if (!hasActiveRecommendationFilter.value && consecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
            noMoreContent.value = true
          }
        }
      }
    }
  }
}

async function getAppRecommendVideos(
  version = requestVersion,
  requestType: WebRecommendRequestType = 'refresh',
) {
  const recommendationMode = settings.value.recommendationMode
  const accountId = loadedAccountId

  // 检查是否达到最大空加载次数，防止无限递归
  if (!hasActiveRecommendationFilter.value && appConsecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
    console.warn('APP模式达到最大连续空加载次数，停止加载')
    noMoreContent.value = true
    return
  }

  // 检查是否有有效的 access token
  if (!appAuthTokens.value.accessToken) {
    debugLog(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, {
      time: new Date().toLocaleString(),
      mode: recommendationMode,
      requestType,
      reason: '缺少 access token',
    })
    needToLoginFirst.value = true
    recommendationDataState.value = 'idle'
    return
  }

  const batchesToLoad = APP_LOAD_BATCHES.value
  const beforeLoadCount = appVideoList.value.length
  const seenCandidateIds = new Set(
    appVideoList.value
      .flatMap(video => video.item ? getAppVideoKeys(video.item) : []),
  )

  // 加载多个批次
  for (let batch = 0; batch < batchesToLoad; batch++) {
    try {
      // 获取最后一个视频的idx用于请求下一批
      const lastIdx = appVideoList.value.length > 0 && appVideoList.value[appVideoList.value.length - 1].item
        ? appVideoList.value[appVideoList.value.length - 1].item!.idx
        : 1
      const requestLog = startRecommendRequestLog(recommendationMode, requestType)

      let response: AppForYouResult
      try {
        response = await api.video.getAppRecommendVideos({
          access_key: appAuthTokens.value.accessToken,
          s_locale: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
          c_locate: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
          appkey: TVAppKey.appkey,
          idx: lastIdx,
        })
      }
      catch (error) {
        if (!isExtensionContextInvalidatedError(error))
          logRecommendRequestFailure(requestLog, { error })
        throw error
      }

      if (!isCurrentWebRequest(version, recommendationMode, accountId))
        return

      if (!response) {
        logRecommendRequestFailure(requestLog, {
          reason: '响应为空',
        })
        setRecommendationFailure(response)
        break
      }

      if (response.code === 0 && Array.isArray(response.data?.items)) {
        const activeAppFilter = hasActiveAppRecommendationFilter.value ? appFilterFunc.value : null
        let filteredCandidateCount = 0
        let filteredKeptCount = 0

        response.data.items.forEach((item: AppVideoItem) => {
          // Remove banner & ad cards
          if (item.card_type.includes('banner') || item.card_type === 'cm_v1')
            return

          // 过滤掉没有有效 ID 的视频（既没有 aid 也没有 bvid）
          const hasValidId = (item.args?.aid && item.args.aid > 0) || (item.bvid && item.bvid.trim() !== '')
          if (!hasValidId)
            return

          if (activeAppFilter) {
            const videoKeys = getAppVideoKeys(item)
            if (!videoKeys.length || videoKeys.some(key => seenCandidateIds.has(key)))
              return

            videoKeys.forEach(key => seenCandidateIds.add(key))
            filteredCandidateCount++

            if (!activeAppFilter(item))
              return

            filteredKeptCount++
          }
          else {
            // Keep the unfiltered recommendation path's existing duplicate semantics.
            const isDuplicate = appVideoList.value.some(video =>
              video.item && (video.item.args?.aid === item.args?.aid || video.item.bvid === item.bvid),
            )
            if (isDuplicate)
              return
          }

          const videoId = item.args?.aid || item.bvid
          appVideoList.value.push({
            uniqueId: `${videoId || item.idx}`,
            item,
            displayData: transformAppVideo(item),
          })
        })
        recordFilteredFeedBatch(filteredCandidateCount, filteredKeptCount)
        applyRecommendationSuccessState({
          apiItemCount: response.data.items.length,
          displayedItemCount: appVideoList.value.length,
          filterCandidateCount: filteredCandidateCount,
          filterKeptCount: filteredKeptCount,
          filtersActive: Boolean(activeAppFilter),
        })
        logRecommendRequestSuccess(requestLog)
      }
      else if (response.code === 62011) {
        logRecommendRequestFailure(requestLog, {
          code: response.code,
          message: response.message,
        })
        needToLoginFirst.value = true
        recommendationDataState.value = 'idle'
        break
      }
      else {
        logRecommendRequestFailure(requestLog, {
          code: response.code,
          message: response.message,
        })
        setRecommendationFailure(response)
        break
      }
    }
    catch (error) {
      if (!isCurrentWebRequest(version, recommendationMode, accountId))
        return

      setRecommendationFailure(error)
      break
    }
  }

  // 检查是否成功添加了新内容
  if (!isCurrentWebRequest(version, recommendationMode, accountId))
    return

  const afterLoadCount = appVideoList.value.length
  if (afterLoadCount > beforeLoadCount) {
    // 成功加载了新内容，重置空加载计数器
    appConsecutiveEmptyLoads.value = 0
  }
  else {
    // 没有加载到新内容，增加空加载计数器
    appConsecutiveEmptyLoads.value++
  }

  if (!needToLoginFirst.value && recommendationDataState.value === 'success') {
    await nextTick()

    let shouldContinue = false
    const hasScrollbar = await haveScrollbar()

    if (!hasScrollbar || appVideoList.value.length < PAGE_SIZE) {
      shouldContinue = true
    }
    else if (scrollLoadStartLength.value > 0) {
      const loadedCount = appVideoList.value.length - scrollLoadStartLength.value
      if (loadedCount < PAGE_SIZE) {
        shouldContinue = true
      }
      else {
        scrollLoadStartLength.value = 0
      }
    }

    if (
      shouldContinue
      && !hasActiveRecommendationFilter.value
      && isPageVisible.value
      && appConsecutiveEmptyLoads.value < MAX_EMPTY_LOADS
    ) {
      // 设置递归加载锁，防止 VideoCardGrid 触发额外的 loadMore
      isRecursiveLoading.value = true
      try {
        await getAppRecommendVideos(version, requestType)
      }
      finally {
        isRecursiveLoading.value = false
      }
    }
    else if (!hasActiveRecommendationFilter.value && appConsecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
      noMoreContent.value = true
    }
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

// 修改 defineExpose，暴露重置方法和撤销方法
defineExpose({
  initData,
  undoRefresh: () => {
    handleUndoRefresh.value?.()
  },
  goForward: () => {
    handleForwardRefresh.value?.()
  },
  canGoBack: () => {
    if (isWebRecommendationMode.value)
      return hasBackState.value && cachedVideoList.value.length > 0
    else if (settings.value.recommendationMode === 'app')
      return hasBackState.value && cachedAppVideoList.value.length > 0
    return false
  },
  canGoForward: () => {
    if (isWebRecommendationMode.value)
      return hasForwardState.value && forwardVideoList.value.length > 0
    else if (settings.value.recommendationMode === 'app')
      return hasForwardState.value && forwardAppVideoList.value.length > 0
    return false
  },
})
</script>

<template>
  <div>
    <VideoCardGrid
      v-if="!needToLoginFirst"
      :items="currentVideoList"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :need-to-login-first="needToLoginFirst"
      :request-failed="requestFailed"
      :empty-description="recommendationEmptyDescription"
      :transform-item="(item: VideoElement | AppVideoElement) => item.displayData"
      :get-item-key="(item: VideoElement | AppVideoElement, index?: number) => `${item.uniqueId}-${index ?? 0}`"
      :video-type="isWebRecommendationMode ? 'rcmd' : 'appRcmd'"
      show-preview
      more-btn
      @refresh="retryRecommendation"
      @login="jumpToLoginPage"
      @load-more="handleLoadMore"
    />

    <div
      v-if="requiresManualFilteredPaging && !isLoading && !noMoreContent"
      class="filtered-feed-load-more"
    >
      <Button type="secondary" @click="handleManualLoadMore">
        <template #left>
          <span i-tabler-arrow-down />
        </template>
        {{ $t('common.load_more') }}
      </Button>
    </div>

    <Empty v-if="needToLoginFirst" mt-6 :description="$t('common.please_log_in_first')">
      <Button type="primary" @click="jumpToLoginPage()">
        {{ $t('common.login') }}
      </Button>
    </Empty>
  </div>
</template>

<style lang="scss" scoped>
.filtered-feed-load-more {
  display: flex;
  justify-content: center;
  padding: var(--bew-space-6) 0 var(--bew-space-4);
}
</style>
