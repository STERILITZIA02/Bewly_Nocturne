import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import { APP_CLIENT_FEED_PARAMS } from '~/constants/appClient'
import { getAppVideoKeys, isRepresentableAppVideo, normalizeAppVideoItem } from '~/contentScripts/views/Home/adapters/appRecommendationItem'
import { transformAppVideo, transformWebVideo } from '~/contentScripts/views/Home/adapters/recommendationVideo'
import { LanguageType } from '~/enums/appEnums'
import { appAuthTokens, settings } from '~/logic'
import {
  reportAppAuthorizationInvalid,
  requestAppAuthorization,
} from '~/logic/appAuthorizationCoordinator'
import { parseDedeUserID } from '~/logic/loginStatus'
import { getRecommendationRequestIdentity } from '~/logic/recommendationMode'
import type { AppForYouResult, Item as AppVideoItem } from '~/models/video/appForYou'
import type { forYouResult, Item as VideoItem } from '~/models/video/forYou'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'
import type { AccountId } from '~/utils/accountScope'
import { isSameAccount } from '~/utils/accountScope'
import { isBilibiliAdvertisement, toAdvertisementCard } from '~/utils/advertising'
import api from '~/utils/api'
import type { AppAuthSnapshot } from '~/utils/authProvider'
import { captureAppAuth, ensureFreshAppAccessToken, isAppAccessTokenInvalidResponse, isAppAuthCurrent, refreshInvalidAppAccessToken, requestAppClient } from '~/utils/authProvider'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { debugLog } from '~/utils/debug'
import { isAboveKnownCount } from '~/utils/filterRules'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'

import type { NormalizedAppVideoItem } from './adapters/appRecommendationItem'
import { completeAppLikeCounts } from './appRecommendationLikes'
import { createForYouInitialDataCoordinator } from './forYouInitialData'
import { createRecommendationFeed } from './recommendationFeed'
import type { RecommendationDataState } from './recommendationState'
import { resolveRecommendationSuccessState } from './recommendationState'
import { useRecommendationFilters } from './useRecommendationFilters'
import type { RecommendationSnapshot } from './useRecommendationHistory'
import { useRecommendationHistory } from './useRecommendationHistory'
import { useWebRecommendationCursor } from './useWebRecommendationCursor'

/** Owns recommendation requests and accepted data, composed with cursor, filtering and history owners. */
export function useForYouRecommendations(emit: {
  (event: 'beforeLoading'): void
  (event: 'afterLoading'): void
}) {
  const toast = useToast()
  const { t } = useI18n()
  const tabState = useHomeTabState()
  const requestIdentity = getRecommendationRequestIdentity()
  const requestColumn = settings.value.appRecommendationColumn
  const recommendationHistory = useRecommendationHistory(tabState)

  const { handleReachBottom, handlePageRefresh, haveScrollbar, undoForwardState, handleUndoRefresh, handleForwardRefresh, handleBackToTop } = useBewlyApp()

  // Accepted lists are large and immutable once published: every change
  // replaces the root, so history snapshots and parked tabs share them safely.
  const videoList = tabState.shallowRef<VideoElement[]>('videoList', [])
  const appVideoList = tabState.shallowRef<AppVideoElement[]>('appVideoList', [])
  const appFeedIdx = tabState.ref<number>('appFeedIdx', 0)
  const appRecentShownKeys = tabState.shallowRef<string[]>('appRecentShownKeys', [])
  const APP_RECENT_SHOWN_MAX_KEYS = 600

  const isWebRecommendationMode = computed(() => settings.value.recommendationMode !== 'app')
  const { refreshIdx, webFetchRow, webShowlistGroups, buildLastShowlistGroup, getLastShowlistFromGroups, getNoCookieStoredLastShowlist, getNoCookieNextFreshIdx, saveNoCookieRecommendationState } = useWebRecommendationCursor(tabState)
  const { filterFunc, appFilterFunc, hasActiveWebRecommendationFilter, hasActiveAppRecommendationFilter, hasActiveRecommendationFilter, requiresManualFilteredPaging, recommendationFilterSettingsSignature, resetFilteredFeedPagingState, recordFilteredFeedBatch } = useRecommendationFilters(tabState, isWebRecommendationMode)
  const acceptedFilterSignature = tabState.ref('recommendationFilterSignature', recommendationFilterSettingsSignature.value)
  let requestVersion = 0
  let appLikesController: AbortController | undefined
  let suspendedAppLikes = false
  let filterRefreshTimer: ReturnType<typeof setTimeout> | undefined
  function invalidateRequests() {
    requestVersion++
    suspendedAppLikes = false
    clearTimeout(filterRefreshTimer)
    filterRefreshTimer = undefined
    appLikesController?.abort()
    appLikesController = undefined
  }
  let loadedAccountId: AccountId = getCurrentAccountId()
  let isComponentActive = false
  const disposers: Array<() => void> = []
  type WebRecommendRequestType = 'refresh' | 'loadMore'

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
    return context
  }

  function getRequestDuration(context: RecommendRequestLogContext): number {
    return Math.round((performance.now() - context.startedAt) * 100) / 100
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

  const blockAds = () => settings.value.blockAds
  const webFeed = createRecommendationFeed(videoList, { blockAds, keysOf: entry => [entry.uniqueId] })
  // Cross-page dedupe uses every manuscript identity of a normal card; an
  // advertisement is keyed by its own creative identity only.
  const appFeed = createRecommendationFeed(appVideoList, {
    blockAds,
    keysOf: entry => entry.isAdvertisement || !entry.item ? [entry.uniqueId] : getAppVideoKeys(entry.item),
  })
  // 当前使用的视频列表（根据推荐模式），由各自的增量投影维护
  const currentVideoList = computed(() => isWebRecommendationMode.value ? webFeed.visible.value : appFeed.visible.value)

  const isLoading = ref<boolean>(true)
  const recommendationDataState = tabState.ref<RecommendationDataState>('recommendationDataState', 'idle')
  const requestFailed = computed(() => (
    recommendationDataState.value === 'risk-control'
    || recommendationDataState.value === 'request-error'
  ))
  const needToLoginFirst = tabState.ref<boolean>('needToLoginFirst', false)
  const appAuthorizationRequired = tabState.ref('appAuthorizationRequired', false)
  const noMoreContent = tabState.ref<boolean>('noMoreContent', false)

  const hasInitializedData = tabState.ref<boolean>('hasInitializedData', false)
  const initialDataCoordinator = createForYouInitialDataCoordinator({
    hasInitializedData: () => hasInitializedData.value,
    runInitialData: () => initData(),
  })

  function getCurrentAccountId(): AccountId {
    return parseDedeUserID(document.cookie) ?? null
  }

  function requireAppAuthorization() {
    needToLoginFirst.value = false
    appAuthorizationRequired.value = true
    recommendationDataState.value = 'idle'
    reportAppAuthorizationInvalid(appAuthTokens.value.accessToken)
  }

  // 页面可见性状态
  const isPageVisible = ref<boolean>(!document.hidden)

  // 修改缓存数据变量，添加前进状态变量

  // 添加前进状态变量

  // APP 模式的缓存和前进状态变量

  // 添加状态标记

  const PAGE_SIZE = 30
  const WEB_REFRESH_PAGE_SIZE = 10
  const WEB_LOAD_MORE_PAGE_SIZE = 12
  const WEB_RISK_COOLDOWN_MS = 60_000
  const MAX_EMPTY_LOADS = 5 // 最大连续空加载次数
  const APP_LOAD_BATCHES = tabState.ref<number>('APP_LOAD_BATCHES', 1) // APP模式每次加载的批次数，初始化时为1
  const scrollLoadStartLength = tabState.ref<number>('scrollLoadStartLength', 0) // 滚动加载开始时的列表长度
  const consecutiveEmptyLoads = tabState.ref<number>('consecutiveEmptyLoads', 0) // 连续空加载次数，用于防止无限递归（Web模式）
  const appConsecutiveEmptyLoads = tabState.ref<number>('appConsecutiveEmptyLoads', 0) // APP模式连续空加载次数
  // 递归加载锁，防止双重触发
  const isRecursiveLoading = ref<boolean>(false)
  const webRiskCooldownUntil = tabState.ref('webRiskCooldownUntil', 0)
  let notifiedWebRiskCooldownUntil = 0

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
    if (input.displayedItemCount === 0)
      noMoreContent.value = recommendationDataState.value === 'empty'
  }

  watch(recommendationFilterSettingsSignature, () => {
    invalidateRequests()
    recommendationHistory.reset()
    resetFilteredFeedPagingState()
    consecutiveEmptyLoads.value = 0
    appConsecutiveEmptyLoads.value = 0
    if (isComponentActive) {
      // A threshold or keyword edit must not request a feed for every keystroke.
      filterRefreshTimer = setTimeout(() => {
        filterRefreshTimer = undefined
        void initData()
      }, 300)
    }
  })

  // 监听页面可见性变化
  async function handleVisibilityChange() {
    isPageVisible.value = !document.hidden
    if (!isPageVisible.value && appLikesController) {
      suspendAppLikeReads()
    }
    else if (isPageVisible.value && suspendedAppLikes) {
      suspendedAppLikes = false
      const version = requestVersion
      await getData('loadMore')
      if (version === requestVersion && isComponentActive)
        hasInitializedData.value = true
    }
  }

  function suspendAppLikeReads() {
    invalidateRequests()
    suspendedAppLikes = true
    isLoading.value = false
    recommendationDataState.value = currentVideoList.value.length ? 'success' : 'idle'
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

  onMounted(() => {
    isComponentActive = true
    initialDataCoordinator.activate()
    attachVisibilityListener()
    loadedAccountId = getCurrentAccountId()
    if (tabState.restored) {
      isLoading.value = false
      if (currentVideoList.value.length > 0)
        hasInitializedData.value = true
      if (recommendationDataState.value === 'loading')
        recommendationDataState.value = currentVideoList.value.length ? 'success' : 'idle'
    }
    if (acceptedFilterSignature.value !== recommendationFilterSettingsSignature.value) {
      hasInitializedData.value = false
      recommendationHistory.reset()
    }
    initPageAction()
    void initialDataCoordinator.ensure()
  })

  onBeforeUnmount(() => {
    isComponentActive = false
    initialDataCoordinator.deactivate()
    invalidateRequests()
  })

  onUnmounted(() => {
    isComponentActive = false
    for (const dispose of disposers)
      dispose()
    disposers.length = 0
  })

  // 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
  // 这样可以避免在模板中进行大量计算，提高渲染性能
  function getWebVideoKey(item: VideoItem): string {
    if (isBilibiliAdvertisement(item))
      return toAdvertisementCard(item).advertisementKey!
    const bvid = item.bvid?.trim()
    if (bvid)
      return bvid
    return `${item.id}`
  }

  function rememberAppRecentShown(list: AppVideoElement[]) {
    const keys = new Set(list.flatMap(video => video.item && !video.isAdvertisement ? getAppVideoKeys(video.item) : []))
    if (!keys.size)
      return
    appRecentShownKeys.value = [
      ...appRecentShownKeys.value.filter(key => !keys.has(key)),
      ...keys,
    ].slice(-APP_RECENT_SHOWN_MAX_KEYS)
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
    return tabState.isCurrent()
      && isComponentActive
      && version === requestVersion
      && recommendationMode === settings.value.recommendationMode
      && requestIdentity === getRecommendationRequestIdentity()
      && isSameAccount(accountId, loadedAccountId)
      && isSameAccount(accountId, getCurrentAccountId())
  }

  // Home remounts the owner for this key. Invalidate synchronously before its
  // transition so an old response cannot publish during the retiring frame.
  watch(getRecommendationRequestIdentity, () => {
    invalidateRequests()
  }, { flush: 'sync' })

  async function initData() {
    invalidateRequests()
    if (isWebRecommendationMode.value && isWebRiskCooldownActive()) {
      recommendationDataState.value = 'risk-control'
      notifyWebRiskCooldown()
      return
    }

    acceptedFilterSignature.value = recommendationFilterSettingsSignature.value
    const version = requestVersion
    const recommendationMode = settings.value.recommendationMode
    const accountId = loadedAccountId
    hasInitializedData.value = false
    if (isWebRecommendationMode.value)
      webFetchRow.value = 1

    if (recommendationMode === 'app') {
      rememberAppRecentShown(appVideoList.value)
      appFeedIdx.value = 0
    }
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
    appAuthorizationRequired.value = false
    try {
      await getData('refresh')
    }
    finally {
      if (isCurrentWebRequest(version, recommendationMode, accountId)) {
        hasInitializedData.value = true
        await nextTick()
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
            toast.warning(t('settings.app_recommendation_auto_switched_to_web'))
          }
          else {
            setRecommendationFailure(error)
            toast.error(t('settings.app_recommendation_failed'))
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
      || filterRefreshTimer !== undefined
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
      scrollLoadStartLength.value = currentVideoList.value.length
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

  function captureRecommendationSnapshot(): RecommendationSnapshot {
    return {
      videoList: videoList.value,
      appVideoList: appVideoList.value,
      appFeedIdx: appFeedIdx.value,
      requestIdentity,
      appRecentShownKeys: appRecentShownKeys.value,
      refreshIdx: refreshIdx.value,
      webFetchRow: webFetchRow.value,
      webShowlistGroups: webShowlistGroups.value,
      noMoreContent: noMoreContent.value,
      dataState: recommendationDataState.value,
    }
  }
  function syncHistoryActions() {
    undoForwardState.value = recommendationHistory.canUndo.value
      ? UndoForwardState.ShowUndo
      : recommendationHistory.canRedo.value ? UndoForwardState.ShowForward : UndoForwardState.Hidden
  }
  function restoreRecommendationSnapshot(snapshot: RecommendationSnapshot | null) {
    if (!snapshot || !tabState.isCurrent() || snapshot.requestIdentity !== getRecommendationRequestIdentity())
      return false
    invalidateRequests()
    isLoading.value = false
    isRecursiveLoading.value = false
    videoList.value = snapshot.videoList
    appVideoList.value = snapshot.appVideoList
    appFeedIdx.value = snapshot.appFeedIdx
    appRecentShownKeys.value = snapshot.appRecentShownKeys
    refreshIdx.value = snapshot.refreshIdx
    webFetchRow.value = snapshot.webFetchRow
    webShowlistGroups.value = snapshot.webShowlistGroups
    noMoreContent.value = snapshot.noMoreContent
    recommendationDataState.value = snapshot.dataState === 'loading' ? 'idle' : snapshot.dataState
    hasInitializedData.value = true
    resetFilteredFeedPagingState()
    consecutiveEmptyLoads.value = 0
    appConsecutiveEmptyLoads.value = 0
    handleBackToTop()
    syncHistoryActions()
    if (!currentVideoList.value.length && snapshot.dataState === 'loading')
      void getData('refresh')
    return true
  }
  function initPageAction() {
    if (!tabState.isCurrent())
      return
    syncHistoryActions()
    handleReachBottom.value = undefined
    handlePageRefresh.value = () => {
      if (isLoading.value || !tabState.isCurrent())
        return
      recommendationHistory.remember(captureRecommendationSnapshot())
      syncHistoryActions()
      retryRecommendation()
    }
    handleUndoRefresh.value = () => {
      if (tabState.isCurrent())
        restoreRecommendationSnapshot(recommendationHistory.undo(captureRecommendationSnapshot()))
    }
    handleForwardRefresh.value = () => tabState.isCurrent()
      && restoreRecommendationSnapshot(recommendationHistory.redo(captureRecommendationSnapshot()))
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

      const beforeLoadCount = currentVideoList.value.length

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
        const accepted: VideoElement[] = []
        const batchKeys = new Set<string>()
        const activeWebFilter = hasActiveWebRecommendationFilter.value ? filterFunc.value : null
        const classifications = response.data.item.map((item: VideoItem) => ({ advertisement: isBilibiliAdvertisement(item), usable: Boolean(item.owner && item.stat) }))
        const filterMatches = activeWebFilter ? await activeWebFilter(response.data.item.map((item: VideoItem, index: number) => classifications[index].advertisement || !classifications[index].usable ? null : item)) : null
        if (!isCurrentWebRequest(version, recommendationMode, accountId))
          return
        refreshIdx.value = currentRefreshIdx + 1
        webFetchRow.value = fetchRow
        let filteredCandidateCount = 0
        let filteredKeptCount = 0

        // Only this page is classified, deduped (against the maintained key
        // index), filtered and transformed; the accumulated list is not rescanned.
        response.data.item.forEach((item: VideoItem, index: number) => {
          const { advertisement, usable } = classifications[index]
          // 过滤掉缺少必要字段的数据（owner 或 stat 为 null）
          if (!advertisement && !usable)
            return

          const itemKey = getWebVideoKey(item)
          if (webFeed.has(itemKey) || batchKeys.has(itemKey))
            return

          batchKeys.add(itemKey)
          if (activeWebFilter && !advertisement)
            filteredCandidateCount++

          if (filterMatches && !advertisement && !filterMatches[index])
            return

          if (activeWebFilter && !advertisement)
            filteredKeptCount++
          accepted.push({
            uniqueId: itemKey,
            item,
            displayData: transformWebVideo(item),
            isAdvertisement: advertisement,
          })
        })

        recordFilteredFeedBatch(filteredCandidateCount, filteredKeptCount)

        const showlistGroup = buildLastShowlistGroup(accepted.flatMap(entry =>
          entry.item && !(settings.value.blockAds && entry.isAdvertisement) ? [entry.item] : []))
        if (showlistGroup)
          webShowlistGroups.value = [...webShowlistGroups.value, showlistGroup]

        webFeed.append(accepted)

        saveNoCookieRecommendationState(
          showlistGroup,
          recommendationMode,
          shouldUseNoCookieStoredFreshIdx ? currentRefreshIdx + 1 : undefined,
        )

        // 检查是否成功添加了新内容
        const afterLoadCount = currentVideoList.value.length
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
        const filledItems = currentVideoList.value

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

    const tokenReady = await ensureFreshAppAccessToken()
    if (!isCurrentWebRequest(version, recommendationMode, accountId) || recommendationMode !== 'app')
      return
    let auth: AppAuthSnapshot | null = tokenReady ? captureAppAuth() : null
    if (!auth) {
      debugLog(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, {
        time: new Date().toLocaleString(),
        mode: recommendationMode,
        requestType,
        reason: 'App authorization invalid',
      })
      requireAppAuthorization()
      return
    }
    const isCurrentAppRequest = () => isCurrentWebRequest(version, recommendationMode, accountId) && isAppAuthCurrent(auth)

    const batchesToLoad = APP_LOAD_BATCHES.value
    const beforeLoadCount = currentVideoList.value.length
    // Accepted cards are covered by the feed's maintained key index.
    const recentShownKeys = new Set(appRecentShownKeys.value)
    const locale = settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN'

    for (let batch = 0; batch < batchesToLoad; batch++) {
      try {
        const idx = appFeedIdx.value
        const requestLog = startRecommendRequestLog(recommendationMode, requestType)

        let response: AppForYouResult
        try {
          const requestAppRecommendations = () => requestAppClient<AppForYouResult>('feedIndex', {
            ...APP_CLIENT_FEED_PARAMS,
            column: requestColumn,
            access_key: auth!.accessToken,
            c_locale: locale,
            s_locale: locale,
            idx,
            pull: idx === 0,
          }, { mid: auth?.mid })
          response = await requestAppRecommendations()
          if (
            isAppAccessTokenInvalidResponse(response)
            && isCurrentAppRequest()
            && await refreshInvalidAppAccessToken()
            && isCurrentWebRequest(version, recommendationMode, accountId)
          ) {
            auth = captureAppAuth()
            if (!auth) {
              requireAppAuthorization()
              return
            }
            response = await requestAppRecommendations()
          }
        }
        catch (error) {
          if (!isCurrentAppRequest())
            return
          if (!isExtensionContextInvalidatedError(error))
            logRecommendRequestFailure(requestLog, { error })
          throw error
        }

        if (!isCurrentAppRequest())
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
          const advertisements = response.data.items.map(isBilibiliAdvertisement)
          const normalizedItems = response.data.items.map((item: AppVideoItem, index: number) => advertisements[index] ? item : normalizeAppVideoItem(item))
          const representable = normalizedItems.map((item, index) => !advertisements[index] && isRepresentableAppVideo(item))
          const filterMatches = activeAppFilter ? await activeAppFilter(normalizedItems.map((item, index) => representable[index] ? item : null)) : null
          if (!isCurrentAppRequest())
            return
          if (settings.value.enableFilterByLikeCount) {
            if (!isPageVisible.value) {
              suspendAppLikeReads()
              return
            }
            const candidates = normalizedItems.flatMap((item, index) => {
              if (!representable[index] || !filterMatches?.[index]
                || getAppVideoKeys(item).some(key => appFeed.has(key) || recentShownKeys.has(key))) {
                return []
              }
              const normalized = item as NormalizedAppVideoItem
              return settings.value.disableFilterForFollowedUser && normalized.normalized.followed ? [] : [normalized]
            })
            const controller = new AbortController()
            appLikesController = controller
            try {
              await completeAppLikeCounts(candidates, controller.signal)
            }
            finally {
              controller.abort()
              if (appLikesController === controller)
                appLikesController = undefined
            }
            if (!isCurrentAppRequest())
              return
            normalizedItems.forEach((item, index) => {
              if (!representable[index] || !filterMatches![index])
                return
              const normalized = (item as NormalizedAppVideoItem).normalized
              if (!(settings.value.disableFilterForFollowedUser && normalized.followed))
                filterMatches![index] = isAboveKnownCount(normalized.likeCount, settings.value.filterByLikeCount)
            })
          }
          appFeedIdx.value = idx + 1
          let filteredCandidateCount = 0
          let filteredKeptCount = 0

          const accepted: AppVideoElement[] = []
          const batchKeys = new Set<string>()
          const isSeen = (key: string) => appFeed.has(key) || batchKeys.has(key)
          response.data.items.forEach((rawItem: AppVideoItem, index: number) => {
            if (advertisements[index]) {
              const displayData = toAdvertisementCard(rawItem)
              const uniqueId = displayData.advertisementKey!
              if (!isSeen(uniqueId)) {
                batchKeys.add(uniqueId)
                accepted.push({ uniqueId, item: rawItem, displayData, isAdvertisement: true })
              }
              return
            }
            const item = normalizedItems[index] as NormalizedAppVideoItem
            if (!representable[index])
              return

            const videoKeys = getAppVideoKeys(item)
            if (videoKeys.some(key => isSeen(key) || recentShownKeys.has(key)))
              return
            videoKeys.forEach(key => batchKeys.add(key))

            if (activeAppFilter) {
              filteredCandidateCount++
              if (!filterMatches![index])
                return
              filteredKeptCount++
            }

            accepted.push({
              uniqueId: videoKeys[0],
              item,
              displayData: { ...transformAppVideo(item), recommendationRequestIdentity: requestIdentity },
              isAdvertisement: false,
            })
          })
          appFeed.append(accepted)
          recordFilteredFeedBatch(filteredCandidateCount, filteredKeptCount)
          applyRecommendationSuccessState({
            apiItemCount: response.data.items.length,
            displayedItemCount: currentVideoList.value.length,
            filterCandidateCount: filteredCandidateCount,
            filterKeptCount: filteredKeptCount,
            filtersActive: Boolean(activeAppFilter),
          })
        }
        else if (response.code === 62011) {
          logRecommendRequestFailure(requestLog, {
            code: response.code,
            message: response.message,
          })
          requireAppAuthorization()
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
        if (!isCurrentAppRequest())
          return

        setRecommendationFailure(error)
        break
      }
    }

    // 检查是否成功添加了新内容
    if (!isCurrentAppRequest())
      return

    const afterLoadCount = currentVideoList.value.length
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

      if (!hasScrollbar || currentVideoList.value.length < PAGE_SIZE) {
        shouldContinue = true
      }
      else if (scrollLoadStartLength.value > 0) {
        const loadedCount = currentVideoList.value.length - scrollLoadStartLength.value
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

  function handleAppAuthorization() {
    requestAppAuthorization(appAuthTokens.value.accessToken)
  }

  function jumpToLoginPage() {
    location.href = 'https://passport.bilibili.com/login'
  }

  // 修改 defineExpose，暴露重置方法和撤销方法

  return { currentVideoList, isLoading, noMoreContent, needToLoginFirst, appAuthorizationRequired, requestFailed, recommendationEmptyDescription, isWebRecommendationMode, requiresManualFilteredPaging, retryRecommendation, jumpToLoginPage, handleLoadMore, handleManualLoadMore, handleAppAuthorization, initData, undoRefresh: () => tabState.isCurrent() && restoreRecommendationSnapshot(recommendationHistory.undo(captureRecommendationSnapshot())), goForward: () => tabState.isCurrent() && restoreRecommendationSnapshot(recommendationHistory.redo(captureRecommendationSnapshot())), canGoBack: () => recommendationHistory.canUndo.value, canGoForward: () => recommendationHistory.canRedo.value }
}
