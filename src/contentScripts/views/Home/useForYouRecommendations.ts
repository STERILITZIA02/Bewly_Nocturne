import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import { transformAppVideo, transformWebVideo } from '~/contentScripts/views/Home/adapters/recommendationVideo'
import { LanguageType } from '~/enums/appEnums'
import { appAuthTokens, settings } from '~/logic'
import {
  appAuthorizationSuccessVersion,
  reportAppAuthorizationInvalid,
  requestAppAuthorization,
} from '~/logic/appAuthorizationCoordinator'
import { parseDedeUserID } from '~/logic/loginStatus'
import type { AppForYouResult, Item as AppVideoItem } from '~/models/video/appForYou'
import type { forYouResult, Item as VideoItem } from '~/models/video/forYou'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'
import type { AccountId } from '~/utils/accountScope'
import { isSameAccount } from '~/utils/accountScope'
import api from '~/utils/api'
import { ensureFreshAppAccessToken, getTvSign, isAppAccessTokenInvalidResponse, refreshInvalidAppAccessToken, TVAppKey } from '~/utils/authProvider'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { debugLog } from '~/utils/debug'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'

import { createForYouInitialDataCoordinator } from './forYouInitialData'
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
  const recommendationHistory = useRecommendationHistory(tabState)

  const { handleReachBottom, handlePageRefresh, haveScrollbar, undoForwardState, handleUndoRefresh, handleForwardRefresh, handleBackToTop } = useBewlyApp()

  // 先声明数据变量
  const videoList = tabState.ref<VideoElement[]>('videoList', [])
  const appVideoList = tabState.ref<AppVideoElement[]>('appVideoList', [])

  const isWebRecommendationMode = computed(() => settings.value.recommendationMode !== 'app')
  const { refreshIdx, webFetchRow, webShowlistGroups, buildLastShowlistGroup, getLastShowlistFromGroups, getNoCookieStoredLastShowlist, getNoCookieNextFreshIdx, saveNoCookieRecommendationState, resetWebRecommendState } = useWebRecommendationCursor(tabState)
  const { filterFunc, appFilterFunc, hasActiveWebRecommendationFilter, hasActiveAppRecommendationFilter, hasActiveRecommendationFilter, requiresManualFilteredPaging, recommendationFilterSettingsSignature, resetFilteredFeedPagingState, recordFilteredFeedBatch } = useRecommendationFilters(tabState, isWebRecommendationMode)
  let requestVersion = 0
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

  // 当前使用的视频列表（根据推荐模式）
  const currentVideoList = computed(() =>
    isWebRecommendationMode.value ? videoList.value : appVideoList.value,
  )

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
      if (settings.value.recommendationMode === 'app' && tabState.read('appAuthorized', false) !== Boolean(appAuthTokens.value.accessToken))
        hasInitializedData.value = false
    }
    initPageAction()
    void initialDataCoordinator.ensure()
  })
  tabState.capture('appAuthorized', () => Boolean(appAuthTokens.value.accessToken))

  watch(appAuthorizationSuccessVersion, () => {
    appAuthorizationRequired.value = false
    if (settings.value.recommendationMode !== 'app')
      return

    if (isComponentActive && tabState.isCurrent()) {
      void initData()
    }
  })

  onBeforeUnmount(() => {
    isComponentActive = false
    initialDataCoordinator.deactivate()
    requestVersion++
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
      && isSameAccount(accountId, loadedAccountId)
      && isSameAccount(accountId, getCurrentAccountId())
  }

  watch(() => settings.value.recommendationMode, (mode) => {
    if (!tabState.isCurrent())
      return
    recommendationHistory.reset()
    requestVersion++
    if (mode !== 'app') {
      appAuthorizationRequired.value = false
    }
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

    // 重置前进后退状态
    undoForwardState.value = UndoForwardState.Hidden

    // 重置store状态

    if (isComponentActive)
      void initData()
  })

  async function initData() {
    if (isWebRecommendationMode.value && isWebRiskCooldownActive()) {
      recommendationDataState.value = 'risk-control'
      notifyWebRiskCooldown()
      return
    }

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

  function captureRecommendationSnapshot(): RecommendationSnapshot {
    return {
      videoList: videoList.value,
      appVideoList: appVideoList.value,
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
    if (!snapshot || !tabState.isCurrent())
      return false
    requestVersion++
    isLoading.value = false
    isRecursiveLoading.value = false
    videoList.value = snapshot.videoList
    appVideoList.value = snapshot.appVideoList
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

      const beforeLoadCount = videoList.value.length

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

        videoList.value.push(...resData.map(item => ({
          uniqueId: getWebVideoKey(item),
          item,
          displayData: transformWebVideo(item),
        })))

        saveNoCookieRecommendationState(
          showlistGroup,
          recommendationMode,
          shouldUseNoCookieStoredFreshIdx ? currentRefreshIdx + 1 : undefined,
        )

        // 检查是否成功添加了新内容
        const afterLoadCount = videoList.value.length
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
        const filledItems = videoList.value

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

    // 仅在 APP 推荐真正发起请求前按需刷新 access token。
    const tokenReady = await ensureFreshAppAccessToken()
    if (!isCurrentWebRequest(version, recommendationMode, accountId) || recommendationMode !== 'app')
      return
    if (!tokenReady) {
      debugLog(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, {
        time: new Date().toLocaleString(),
        mode: recommendationMode,
        requestType,
        reason: 'App authorization invalid',
      })
      requireAppAuthorization()
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
          const requestAppRecommendations = () => {
            const params = {
              access_key: appAuthTokens.value.accessToken,
              s_locale: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
              c_locate: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
              appkey: TVAppKey.appkey,
              idx: lastIdx,
              ts: Math.floor(Date.now() / 1000).toString(),
            }
            return api.video.getAppRecommendVideos({
              ...params,
              sign: getTvSign(params),
            })
          }
          response = await requestAppRecommendations()
          if (
            isAppAccessTokenInvalidResponse(response)
            && isCurrentWebRequest(version, recommendationMode, accountId)
            && await refreshInvalidAppAccessToken()
            && isCurrentWebRequest(version, recommendationMode, accountId)
          ) {
            response = await requestAppRecommendations()
          }
        }
        catch (error) {
          if (!isCurrentWebRequest(version, recommendationMode, accountId))
            return
          if (isAppAccessTokenInvalidResponse(error)) {
            logRecommendRequestFailure(requestLog, { error })
            requireAppAuthorization()
            return
          }
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

  function handleAppAuthorization() {
    requestAppAuthorization(appAuthTokens.value.accessToken)
  }

  function jumpToLoginPage() {
    location.href = 'https://passport.bilibili.com/login'
  }

  // 修改 defineExpose，暴露重置方法和撤销方法

  return { currentVideoList, isLoading, noMoreContent, needToLoginFirst, appAuthorizationRequired, requestFailed, recommendationEmptyDescription, isWebRecommendationMode, requiresManualFilteredPaging, retryRecommendation, jumpToLoginPage, handleLoadMore, handleManualLoadMore, handleAppAuthorization, initData, undoRefresh: () => tabState.isCurrent() && restoreRecommendationSnapshot(recommendationHistory.undo(captureRecommendationSnapshot())), goForward: () => tabState.isCurrent() && restoreRecommendationSnapshot(recommendationHistory.redo(captureRecommendationSnapshot())), canGoBack: () => recommendationHistory.canUndo.value, canGoForward: () => recommendationHistory.canRedo.value }
}
