import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'

import {
  ACCOUNT_URL,
  BANGUMI_PLAY_URL,
  CHANNEL_PAGE_URL,
  CREATOR_PLATFORM_URL,
  MOMENTS_URL,
  READ_HOME_URL,
  READ_PREVIEW_URL,
  SEARCH_PAGE_URL,
  VIDEO_LIST_URL,
} from '~/components/TopBar/constants/urls'
import type { PrivilegeInfo, UnReadDm, UnReadMessage, UserInfo } from '~/components/TopBar/types'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import type {
  TopBarFavoritesChanged,
  TopBarRefreshClaim,
  TopBarSharedResource,
  TopBarSharedState,
  TopBarStateClaim,
  TopBarStateInvalidate,
  TopBarStatePublish,
  TopBarStateRelease,
} from '~/constants/topBarState'
import {
  TOP_BAR_RESOURCE_FIELDS,
  TOP_BAR_STATE_MESSAGE,
} from '~/constants/topBarState'
import type { WatchLaterUpdate } from '~/constants/watchLaterState'
import { settings } from '~/logic'
import { checkLoginStatus, LoginStatus, parseDedeUserID } from '~/logic/loginStatus'
import { parseTopBarPublicationTime, recordUploaderLatestVideoTimes } from '~/logic/uploaderLatestVideoTimes'
import { applyWatchLaterUpdate, ensureWatchLaterCount, ensureWatchLaterState as ensureMembership, isInWatchLater as queryWatchLater, watchLaterState, watchLaterUpdate } from '~/logic/watchLaterState'
import type { List as VideoItem } from '~/models/video/watchLater'
import { useSettingsStore } from '~/stores/settingsStore'
import {
  completeSharedRefreshLease,
  runSharedRefreshRequest,
  settleSharedRefreshTasks,
} from '~/stores/topBarSharedRefresh'
import { waitForDelay, withRequestDeadline } from '~/utils/abort'
import api from '~/utils/api'
import { showBewlyTopBar } from '~/utils/effectiveTopBarSource'
import { i18n } from '~/utils/i18n'
import { getCSRF, isHomePage } from '~/utils/main'
import { isExtensionContextInvalidatedError, onMessage, reportRuntimeFailure, sendMessage } from '~/utils/messaging'
import { countVisibleNewMomentItems } from '~/utils/momentFeedOrder'
import { resolveStableMomentKey } from '~/utils/momentKey'
import { getNotificationBadgeCounts } from '~/utils/notificationBadge'
import { updateOwnedWatchLater } from '~/utils/watchLater'
import { normalizeWatchLaterItem } from '~/utils/watchLaterList'

export const LOGIN_RECHECK_INTERVAL = 1000 * 60 // 已登录但 userInfo 未填充时重查的间隔

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000
const UPDATE_INTERVAL = 1000 * 60 * 5

function getNextReceiveAt(nextReceiveDays?: number, periodEndUnix?: number): number | null {
  if (Number.isFinite(periodEndUnix) && periodEndUnix! > 0)
    return periodEndUnix! * 1000

  if (Number.isFinite(nextReceiveDays) && nextReceiveDays! > 0)
    return Date.now() + nextReceiveDays! * DAY_MILLISECONDS

  return null
}

function isBeforeNextReceiveAt(nextReceiveAt: number | null): boolean {
  return nextReceiveAt !== null && nextReceiveAt > Date.now()
}

function runTopBarSharedRefreshRequest(
  endpointName: Parameters<typeof runSharedRefreshRequest>[0],
  operation: Parameters<typeof runSharedRefreshRequest>[1],
): Promise<boolean> {
  return runSharedRefreshRequest(endpointName, operation, {
    isTerminalError: isExtensionContextInvalidatedError,
  })
}

function settleTopBarSharedRefreshTasks(
  tasks: Parameters<typeof settleSharedRefreshTasks>[0],
): Promise<boolean> {
  return settleSharedRefreshTasks(tasks, isExtensionContextInvalidatedError)
}

export const useTopBarStore = defineStore('topBar', () => {
  const settingsStore = useSettingsStore()
  const toast = useToast()
  const { t } = i18n.global
  const currentLocationHref = useCurrentLocationHref()
  let sharedStateMessagingUnavailable = false
  let uiActive = !document.hidden
  const canRefreshUi = () => uiActive && !document.hidden && !sharedStateMessagingUnavailable
  const resourceVersions: Record<TopBarSharedResource, number> = { unread: 0, moments: 0, rewards: 0 }
  const resourceRefreshIds: Record<TopBarSharedResource, number> = { unread: -1, moments: -1, rewards: -1 }
  const dirtyResources = new Set<TopBarSharedResource>()
  const pendingResources = new Map<TopBarSharedResource, Promise<void>>()
  const followupResources = new Set<TopBarSharedResource>()
  let loginReadController: AbortController | undefined
  // 登录态是本地事实而非网络推导：初始值取 DedeUserID 存在性（同步、零请求），
  // 之后只有 -101 或本地 Cookie 清除才能翻转为未登录，瞬态失败永不翻转。
  // 否则刷新时的一次风控窗口会把已登录用户误判为未登录（见 issue #921）。
  const isLogin = ref<boolean>(getLocalLoginMid() !== undefined)
  const userInfo = reactive<UserInfo>({} as UserInfo)

  const unReadMessage = reactive<UnReadMessage>({} as UnReadMessage)
  const unReadDm = reactive<UnReadDm>({} as UnReadDm)

  const unReadMessageCount = computed(() => getNotificationBadgeCounts(settings.value, unReadMessage, unReadDm).total)

  // Moments State
  const newMomentsCount = ref<number>(0)
  // 添加稍后再看计数
  const watchLaterCount = computed(() => {
    const snapshot = watchLaterState.value
    return snapshot && snapshot.accountId === userInfo.mid ? snapshot.count ?? 0 : 0
  })
  // 添加稍后再看列表
  const watchLaterList = reactive<VideoItem[]>([])
  const favoriteStateVersion = ref(0)
  const isLoadingWatchLater = ref<boolean>(false)
  let nextWatchLaterPage = 1
  let watchLaterListGeneration = 0
  // 添加 Moments 相关状态
  const moments = reactive<any[]>([])
  const isLoadingMoments = ref<boolean>(false)
  const isLoadingMomentsCount = ref<boolean>(false)
  const noMoreMomentsContent = ref<boolean>(false)
  const livePage = ref<number>(1)
  const momentUpdateBaseline = ref<string>('')
  const momentOffset = ref<string>('')
  const collaborativeVideoMap = new Map<string, { item: any, moment?: any }>()
  let momentsRequestGeneration = 0
  let momentsCountRequestGeneration = 0

  // B币领取状态
  const privilegeInfo = reactive<PrivilegeInfo>({} as PrivilegeInfo)
  const hasBCoinToReceive = ref<boolean>(false)
  const bCoinAlreadyReceived = ref<boolean>(false) // 记录B币是否已经领取
  const bCoinNextReceiveAt = ref<number | null>(null)

  // 大会员经验领取状态
  const vipExpAlreadyReceived = ref<boolean>(false) // 记录大会员经验是否已经领取
  const vipExpNextReceiveAt = ref<number | null>(null)

  // 登录态请求和定时器都可能跨越账号切换、登出或组件卸载；generation 用于
  // 忽略这些生命周期边界之前启动的异步结果。
  let loginStateGeneration = 0
  let lastLoggedOutMid: number | undefined

  // UI State
  const drawerVisible = reactive({
    notifications: false,
  })
  const notificationsDrawerUrl = ref<string>('https://message.bilibili.com/')
  const popupVisible = reactive({
    channels: false,
    userPanel: false,
    notifications: false,
    moments: false,
    favorites: false,
    history: false,
    watchLater: false,
    upload: false,
    more: false,
  })

  // TopBar visibility state
  const topBarVisible = ref<boolean>(true)
  const searchKeyword = ref<string>('')

  // 从 useTopBarReactive 整合的计算属性
  const isSearchPage = computed((): boolean => {
    return SEARCH_PAGE_URL.test(currentLocationHref.value)
  })

  const isTopBarFixed = computed((): boolean => {
    if (
      isHomePage(currentLocationHref.value)
      || VIDEO_LIST_URL.test(currentLocationHref.value)
      || BANGUMI_PLAY_URL.test(currentLocationHref.value)
      || MOMENTS_URL.test(currentLocationHref.value)
      || CHANNEL_PAGE_URL.test(currentLocationHref.value)
      || READ_HOME_URL.test(currentLocationHref.value)
      || ACCOUNT_URL.test(currentLocationHref.value)
    ) {
      return true
    }

    return false
  })

  const showTopBar = computed((): boolean => {
    if (
      CREATOR_PLATFORM_URL.test(currentLocationHref.value)
      || READ_PREVIEW_URL.test(currentLocationHref.value)
    ) {
      return false
    }

    return showBewlyTopBar(settingsStore.getEffectiveTopBarSource())
  })

  function resetReceiveStates() {
    bCoinAlreadyReceived.value = false
    hasBCoinToReceive.value = false
    bCoinNextReceiveAt.value = null
    vipExpAlreadyReceived.value = false
    vipExpNextReceiveAt.value = null
  }

  function closeAccountScopedSurfaces() {
    const accountScopedPopups = ['userPanel', 'notifications', 'moments', 'favorites', 'history', 'watchLater'] as const
    accountScopedPopups.forEach((key) => {
      popupVisible[key] = false
    })
    drawerVisible.notifications = false
    notificationsDrawerUrl.value = 'https://message.bilibili.com/'
  }

  function resetAccountScopedState() {
    for (const resource of Object.keys(resourceVersions) as TopBarSharedResource[]) {
      resourceVersions[resource] = 0
      resourceRefreshIds[resource] = -1
    }
    dirtyResources.clear()
    pendingResources.clear()
    followupResources.clear()
    closeAccountScopedSurfaces()
    Object.keys(unReadMessage).forEach((key) => {
      unReadMessage[key as keyof UnReadMessage] = 0
    })
    Object.keys(unReadDm).forEach((key) => {
      unReadDm[key as keyof UnReadDm] = 0
    })

    newMomentsCount.value = 0
    watchLaterList.splice(0)
    nextWatchLaterPage = 1
    watchLaterListGeneration++
    moments.splice(0)
    momentsRequestGeneration++
    momentsCountRequestGeneration++
    isLoadingMomentsCount.value = false
    livePage.value = 1
    momentUpdateBaseline.value = ''
    momentOffset.value = ''
    noMoreMomentsContent.value = false
    isLoadingMoments.value = false
    isLoadingWatchLater.value = false
    collaborativeVideoMap.clear()
    Object.keys(privilegeInfo).forEach(key => Reflect.deleteProperty(privilegeInfo, key))
    resetReceiveStates()
  }

  // 登录态的本地事实源：读取 DedeUserID（非 HttpOnly，content script 可读）
  function getLocalLoginMid(): number | undefined {
    return parseDedeUserID(document.cookie)
  }

  function isCurrentAccount(accountId: number | undefined): accountId is number {
    return accountId !== undefined && isLogin.value && userInfo.mid === accountId && getLocalLoginMid() === accountId
  }

  function clearUserInfo() {
    Object.keys(userInfo).forEach(key => Reflect.deleteProperty(userInfo, key))
  }

  // User Methods
  async function getUserInfo(
    retryCount = 0,
    requestGeneration = loginStateGeneration,
    requestLocalMid = getLocalLoginMid(),
    signal?: AbortSignal,
  ): Promise<LoginStatus> {
    if (!canRefreshUi() || signal?.aborted || requestGeneration !== loginStateGeneration)
      return LoginStatus.TransientError

    // 本地无会话 Cookie 且已知未登录时，nav 只会返回 -101，跳过无意义的请求
    if (getLocalLoginMid() !== requestLocalMid)
      return LoginStatus.TransientError

    if (!isLogin.value && requestLocalMid === undefined) {
      lastLoggedOutMid = undefined
      return LoginStatus.LoggedOut
    }

    const maxRetries = 2 // 最多重试2次
    const retryDelay = (retryCount + 1) * 1000 // 递增延迟: 1s, 2s

    const result = await checkLoginStatus<UserInfo>(() => api.user.getUserInfo(undefined, { signal }))

    if (signal?.aborted || !canRefreshUi() || requestGeneration !== loginStateGeneration || getLocalLoginMid() !== requestLocalMid)
      return LoginStatus.TransientError

    if (result.status === LoginStatus.LoggedIn) {
      const wasLoggedIn = isLogin.value
      const previousMid = userInfo.mid

      isLogin.value = true
      Object.assign(userInfo, result.data)
      lastLoggedOutMid = undefined

      // 如果是新登录或者切换了账号，清理旧账号的所有本地状态
      if (!wasLoggedIn || previousMid !== userInfo.mid)
        resetAccountScopedState()
      return result.status
    }

    if (result.status === LoginStatus.LoggedOut) {
      lastLoggedOutMid = requestLocalMid
      isLogin.value = false
      clearUserInfo()
      resetAccountScopedState()
      stopUpdateTimer()
      return result.status
    }

    // 瞬态失败（风控/限流/网络错误）：不切换登录态，稍后重试
    if (retryCount < maxRetries) {
      await waitForDelay(retryDelay, signal)
      return getUserInfo(retryCount + 1, requestGeneration, requestLocalMid, signal)
    }
    return result.status
  }

  // 登录/登出会先后触发多个 Cookie 事件，reconcile 会被密集调用；
  // 拉取进行中时复用同一 Promise，避免重复请求 nav
  let fetchUserInfoPromise: Promise<LoginStatus> | null = null
  let fetchUserInfoGeneration = -1
  let fetchUserInfoLocalMid: number | undefined
  function fetchUserInfoOnce(): Promise<LoginStatus> {
    if (!canRefreshUi())
      return Promise.resolve(LoginStatus.TransientError)
    const requestGeneration = loginStateGeneration
    const requestLocalMid = getLocalLoginMid()
    if (
      fetchUserInfoPromise
      && fetchUserInfoGeneration === requestGeneration
      && fetchUserInfoLocalMid === requestLocalMid
    ) {
      return fetchUserInfoPromise
    }

    if (fetchUserInfoPromise)
      invalidateLoginStateRequests()

    const currentGeneration = loginStateGeneration
    const controller = new AbortController()
    loginReadController = controller
    const request = withRequestDeadline(signal => getUserInfo(0, currentGeneration, requestLocalMid, signal), { signal: controller.signal })
      .catch(() => LoginStatus.TransientError)
      .finally(() => {
        if (fetchUserInfoPromise === request) {
          fetchUserInfoPromise = null
          fetchUserInfoGeneration = -1
          fetchUserInfoLocalMid = undefined
          loginReadController = undefined
        }
      })
    fetchUserInfoPromise = request
    fetchUserInfoGeneration = currentGeneration
    fetchUserInfoLocalMid = requestLocalMid
    return fetchUserInfoPromise
  }

  function invalidateLoginStateRequests() {
    loginStateGeneration++
    cancelLoginRead()
  }

  function cancelLoginRead() {
    loginReadController?.abort()
    loginReadController = undefined
    fetchUserInfoPromise = null
    fetchUserInfoGeneration = -1
    fetchUserInfoLocalMid = undefined
  }

  function handleReconciledLoginStatus(status: LoginStatus, requestGeneration: number) {
    if (requestGeneration !== loginStateGeneration)
      return

    if (status === LoginStatus.LoggedIn) {
      startUpdateTimer()
      void syncSharedData().catch((error) => {
        reportRuntimeFailure('Failed to sync TopBar state after login change', error)
      })
    }
    else if (status === LoginStatus.LoggedOut) {
      stopUpdateTimer()
    }
    else if (isLogin.value) {
      // 已登录但资料尚未填充时，保留定时器做退避重试
      startUpdateTimer()
    }
  }

  // 用本地事实校正登录态：页面重新可见或收到会话 Cookie 变化广播时调用。
  // - 本地无 DedeUserID 且当前已登录：交由 nav 裁决（-101 才翻转，见 getUserInfo）
  // - 本地有 DedeUserID 且当前未登录：拉取 userInfo，成功后再切换为已登录；
  //   但如果是新 mid，仍先显示登录态以避免 Cookie 已更新而 UI 长时间滞后
  // - 已登录但 userInfo 未填充，或 mid 不一致：补拉或换号重拉（会重置 B 币领取状态）
  function reconcileLocalLoginState() {
    const localMid = getLocalLoginMid()

    // Cookie 中的 mid 已经切换时，立即丢弃旧账号状态和旧请求；否则旧请求
    // 可能在新账号 userInfo 返回前继续写入旧账号的角标/列表。
    if (localMid !== undefined && isLogin.value && userInfo.mid && userInfo.mid !== localMid) {
      stopUpdateTimer()
      invalidateLoginStateRequests()
      lastLoggedOutMid = undefined
      clearUserInfo()
      resetAccountScopedState()
    }

    if (localMid === undefined && isLogin.value) {
      isLogin.value = false
      invalidateLoginStateRequests()
      clearUserInfo()
      resetAccountScopedState()
      stopUpdateTimer()
    }
    if (!canRefreshUi())
      return

    const fetchAndHandleLoginStatus = () => {
      const request = fetchUserInfoOnce()
      const requestGeneration = loginStateGeneration
      void request.then(status => handleReconciledLoginStatus(status, requestGeneration))
    }

    if (localMid === undefined) {
      lastLoggedOutMid = undefined
      if (isLogin.value)
        fetchAndHandleLoginStatus()
      else
        stopUpdateTimer()
      return
    }

    if (!isLogin.value) {
      if (lastLoggedOutMid !== localMid)
        isLogin.value = true
      // 旧 mid 被判定为失效时不再乐观显示，先让 nav 确认是否真的重新登录
      fetchAndHandleLoginStatus()
      return
    }

    // 已登录但 userInfo 未填充（初始化时撞风控），或本地 mid 变化
    // （他处切换账号）：重新拉取（会重置 B 币领取状态）
    if (!userInfo.mid || userInfo.mid !== localMid)
      fetchAndHandleLoginStatus()
  }

  // Notification Methods
  async function getUnreadMessageCount(): Promise<boolean> {
    const accountId = userInfo.mid
    const version = resourceVersions.unread
    const current = () => isCurrentAccount(accountId) && resourceVersions.unread === version
    if (!isCurrentAccount(accountId))
      return false

    return settleTopBarSharedRefreshTasks([
      () => runTopBarSharedRefreshRequest('getUnreadMsg', async () => {
        const response = await api.notification.getUnreadMsg()
        if (!current())
          return 'account-changed'
        if (response.code === -1)
          return 'network'
        if (response.code !== 0)
          return 'api-error'
        if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data))
          return 'invalid-response'
        Object.assign(unReadMessage, response.data)
        return true
      }),
      () => runTopBarSharedRefreshRequest('getUnreadDm', async () => {
        const response = await api.notification.getUnreadDm()
        if (!current())
          return 'account-changed'
        if (response.code === -1)
          return 'network'
        if (response.code !== 0)
          return 'api-error'
        if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data))
          return 'invalid-response'
        Object.assign(unReadDm, response.data)
        return true
      }),
    ])
  }

  // B币和大会员经验领取状态检查
  async function refreshVipRewardStatus(): Promise<boolean> {
    const accountId = userInfo.mid
    const version = resourceVersions.rewards
    const shouldCheckBCoin = settings.value.showBCoinReceiveReminder
    const shouldCheckVipExp = settings.value.autoReceiveVipExp
    if (!isCurrentAccount(accountId))
      return false
    if (userInfo.vip?.status !== 1 || (!shouldCheckBCoin && !shouldCheckVipExp))
      return true

    const shouldFetchBCoin = shouldCheckBCoin
      && !(bCoinAlreadyReceived.value && isBeforeNextReceiveAt(bCoinNextReceiveAt.value))
    const shouldFetchVipExp = shouldCheckVipExp
      && !(vipExpAlreadyReceived.value && isBeforeNextReceiveAt(vipExpNextReceiveAt.value))
    if (!shouldFetchBCoin && !shouldFetchVipExp)
      return true

    return runTopBarSharedRefreshRequest('refreshVipRewardStatus', async () => {
      const response = await api.user.getPrivilegeInfo()
      if (!isCurrentAccount(accountId) || resourceVersions.rewards !== version)
        return 'account-changed'
      if (response.code === -1)
        return 'network'
      if (response.code !== 0)
        return 'api-error'
      if (!response.data || typeof response.data !== 'object')
        return 'invalid-response'

      Object.assign(privilegeInfo, response.data)

      const rewardRequests: Promise<void>[] = []

      if (shouldCheckBCoin) {
        if (privilegeInfo.vip_type < 2) {
          bCoinAlreadyReceived.value = false
          hasBCoinToReceive.value = false
          bCoinNextReceiveAt.value = null
        }

        // 检查B币兑换状态 (type: 1)
        const bCoinItem = privilegeInfo.vip_type >= 2
          ? privilegeInfo.list?.find(item => item.type === 1)
          : undefined
        if (bCoinItem) {
          const nextReceiveAt = getNextReceiveAt(bCoinItem.next_receive_days, bCoinItem.period_end_unix)
          bCoinAlreadyReceived.value = bCoinItem.state === 1
          bCoinNextReceiveAt.value = bCoinAlreadyReceived.value ? nextReceiveAt : null
          if (bCoinAlreadyReceived.value) {
            hasBCoinToReceive.value = false
          }
          else {
            // 如果有权限领取且未领取
            hasBCoinToReceive.value = bCoinItem.state === 0 && bCoinItem.next_receive_days > 0

            // 如果开启了自动领取，则自动领取B币
            if (hasBCoinToReceive.value && settings.value.autoReceiveBCoinCoupon)
              rewardRequests.push(autoReceiveBCoin(accountId, nextReceiveAt))
          }
        }
        else {
          bCoinAlreadyReceived.value = false
          hasBCoinToReceive.value = false
          bCoinNextReceiveAt.value = null
        }
      }

      if (shouldCheckVipExp) {
        // 每日 10 经验对应 type=9，状态和下一轮领取时间与 B 币一致。
        const vipExpItem = privilegeInfo.list?.find(item => item.type === 9)
        if (vipExpItem) {
          const nextReceiveAt = getNextReceiveAt(vipExpItem.next_receive_days, vipExpItem.period_end_unix)
          vipExpAlreadyReceived.value = vipExpItem.state === 1
          vipExpNextReceiveAt.value = vipExpAlreadyReceived.value ? nextReceiveAt : null

          if (vipExpItem.state === 0 && vipExpItem.next_receive_days > 0)
            rewardRequests.push(autoReceiveVipExp(accountId, nextReceiveAt))
        }
        else {
          vipExpAlreadyReceived.value = false
          vipExpNextReceiveAt.value = null
        }
      }

      await Promise.all(rewardRequests)
      return true
    })
  }

  // 自动领取B币
  async function autoReceiveBCoin(accountId = userInfo.mid, nextReceiveAt: number | null = null) {
    if (settings.initializationState.value !== 'loaded' || !isCurrentAccount(accountId) || !hasBCoinToReceive.value) {
      return
    }

    try {
      const res = await api.user.exchangeCoupon({
        type: '1',
        csrf: getCSRF(),
      })

      if (!isCurrentAccount(accountId))
        return

      if (res.code === 0) {
        // 领取成功，更新状态
        bCoinAlreadyReceived.value = true
        hasBCoinToReceive.value = false
        bCoinNextReceiveAt.value = nextReceiveAt
        toast.success(t('settings.auto_receive_bcoin_coupon_success'))
      }
      else {
        toast.error(t('settings.auto_receive_bcoin_coupon_failed', {
          message: res.message || t('settings.auto_receive_bcoin_coupon_error'),
        }))
      }
    }
    catch (error) {
      if (isExtensionContextInvalidatedError(error))
        throw error
      if (isCurrentAccount(accountId))
        toast.error(t('settings.auto_receive_bcoin_coupon_error'))
    }
  }

  // 自动领取大会员经验
  async function autoReceiveVipExp(accountId = userInfo.mid, nextReceiveAt: number | null = null) {
    if (settings.initializationState.value !== 'loaded' || !isCurrentAccount(accountId) || userInfo.vip?.status !== 1 || !settings.value.autoReceiveVipExp) {
      return
    }

    // 如果已经记录为已领取，则不再请求
    if (vipExpAlreadyReceived.value && isBeforeNextReceiveAt(vipExpNextReceiveAt.value)) {
      return
    }

    try {
      const res = await api.user.receiveVipExp({
        csrf: getCSRF(),
      })

      if (!isCurrentAccount(accountId))
        return

      if (res.code === 0) {
        // 领取成功，更新状态并显示消息
        vipExpAlreadyReceived.value = true
        vipExpNextReceiveAt.value = nextReceiveAt
        toast.success(t('settings.auto_receive_vip_exp_success'), { timeout: 1500 })
      }
      else if (res.code === 69198) {
        // 经验已领取，静默更新状态
        vipExpAlreadyReceived.value = true
        vipExpNextReceiveAt.value = nextReceiveAt
      }
      // 其他错误码不处理，下次继续尝试
    }
    catch (error) {
      if (isExtensionContextInvalidatedError(error))
        throw error
      // 请求失败不处理，下次继续尝试
    }
  }

  // Moments Methods
  async function getTopBarNewMomentsCount(selectedType: string = 'video'): Promise<boolean> {
    const accountId = userInfo.mid
    const version = resourceVersions.moments
    if (!isCurrentAccount(accountId) || isLoadingMomentsCount.value)
      return false

    const requestGeneration = momentsCountRequestGeneration
    isLoadingMomentsCount.value = true
    try {
      return await runTopBarSharedRefreshRequest('getTopBarNewMomentsCount', async () => {
        const response = await api.moment.getMomentsUpdate({
          type: selectedType,
          update_baseline: '0',
        })
        if (!isCurrentAccount(accountId) || requestGeneration !== momentsCountRequestGeneration || resourceVersions.moments !== version)
          return 'account-changed'
        if (response.code === -1)
          return 'network'
        if (response.code !== 0)
          return 'api-error'
        if (!response.data || typeof response.data.update_num !== 'number')
          return 'invalid-response'
        newMomentsCount.value = response.data.update_num
        return true
      })
    }
    finally {
      if (requestGeneration === momentsCountRequestGeneration)
        isLoadingMomentsCount.value = false
    }
  }

  const watchLaterInvalidationVersion = computed(() => watchLaterState.value?.revision ?? 0)

  function isInWatchLater(target: number | undefined | { aid?: number | string, bvid?: string, epid?: number }): boolean | undefined {
    if (!isLogin.value || watchLaterState.value?.accountId !== userInfo.mid)
      return undefined
    return queryWatchLater(typeof target === 'object' ? target : { aid: target })
  }

  function isCurrentWatchLaterAccount(accountId: number | undefined): accountId is number {
    return isCurrentAccount(accountId) && getLocalLoginMid() === accountId
  }

  async function ensureWatchLaterState(force = false): Promise<boolean> {
    const accountId = userInfo.mid
    if (!isCurrentWatchLaterAccount(accountId))
      return false
    return await ensureMembership(force) && isCurrentWatchLaterAccount(accountId)
  }

  async function commitWatchLaterMutation(_aid: number, _added: boolean, accountId: number, update?: WatchLaterUpdate) {
    if (!isCurrentWatchLaterAccount(accountId))
      return
    if (update)
      applyWatchLaterUpdate(update)
    else
      await ensureMembership(true)
  }

  async function invalidateWatchLaterMembership(accountId: number) {
    if (!isCurrentWatchLaterAccount(accountId))
      return

    const response = await api.watchlater.invalidateWatchLaterState({ accountId })
    if (isCurrentWatchLaterAccount(accountId))
      applyWatchLaterUpdate(response.data)
  }

  // 获取稍后再看列表数量
  async function getWatchLaterCount(): Promise<boolean> {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return false

    return await ensureWatchLaterCount() && isCurrentAccount(accountId)
  }

  // 获取稍后再看列表
  function dedupeWatchLaterItems(items: VideoItem[]): VideoItem[] {
    const seen = new Set<number>()
    return items.map(normalizeWatchLaterItem).filter((item): item is VideoItem => {
      if (!item || seen.has(item.aid))
        return false
      seen.add(item.aid)
      return true
    })
  }

  async function getWatchLaterPreview(): Promise<boolean> {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return false

    const requestGeneration = ++watchLaterListGeneration
    nextWatchLaterPage = 1
    isLoadingWatchLater.value = true

    try {
      return await runTopBarSharedRefreshRequest('getWatchLaterList', async () => {
        const response = await api.watchlater.getWatchLaterListByPage({
          pn: 1,
          ps: 10,
        })
        if (!isCurrentAccount(accountId) || requestGeneration !== watchLaterListGeneration)
          return 'account-changed'
        if (response.code === -1)
          return 'network'
        if (response.code !== 0)
          return 'api-error'
        if (!response.data || !Array.isArray(response.data.list) || typeof response.data.count !== 'number')
          return 'invalid-response'
        const list = dedupeWatchLaterItems(response.data.list)
        watchLaterList.splice(0, watchLaterList.length, ...list)
        nextWatchLaterPage = 2
        return true
      })
    }
    finally {
      if (requestGeneration === watchLaterListGeneration)
        isLoadingWatchLater.value = false
    }
  }

  watch(watchLaterUpdate, (update) => {
    if (!update || update.type !== 'change' || update.accountId !== userInfo.mid)
      return
    const change = update.change
    watchLaterListGeneration++
    isLoadingWatchLater.value = false
    if (change.type === 'clear') {
      watchLaterList.splice(0)
      nextWatchLaterPage = 1
    }
    else if (change.type === 'remove') {
      const index = watchLaterList.findIndex(item => item.aid === change.entry.aid)
      if (index !== -1)
        watchLaterList.splice(index, 1)
      nextWatchLaterPage = Math.max(1, Math.ceil(watchLaterList.length / 10))
    }
    // Preview media is a view, not membership. Only an open preview needs its
    // first page filled after an addition; other tabs keep the compact delta.
    else if (popupVisible.watchLater && !document.hidden) {
      void getWatchLaterPreview()
    }
  })

  // 加载更多稍后再看列表
  async function loadMoreWatchLaterList() {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId) || isLoadingWatchLater.value)
      return

    const requestGeneration = watchLaterListGeneration
    const currentPage = nextWatchLaterPage
    const totalPages = Math.ceil(watchLaterCount.value / 10)

    if (currentPage > totalPages || watchLaterList.length >= watchLaterCount.value)
      return

    isLoadingWatchLater.value = true

    try {
      const res = await api.watchlater.getWatchLaterListByPage({
        pn: currentPage,
        ps: 10,
      })
      if (res.code === 0 && isCurrentAccount(accountId) && requestGeneration === watchLaterListGeneration) {
        const existingAids = new Set(watchLaterList.map(item => item.aid))
        const list = dedupeWatchLaterItems(Array.isArray(res.data?.list) ? res.data.list : [])
          .filter(item => !existingAids.has(item.aid))
        watchLaterList.push(...list)
        nextWatchLaterPage = currentPage + 1
      }
    }
    catch (error) {
      reportRuntimeFailure('Failed to load Watch Later page', error)
    }
    finally {
      if (requestGeneration === watchLaterListGeneration)
        isLoadingWatchLater.value = false
    }
  }

  // 删除稍后再看项目
  async function deleteWatchLaterItem(aid: number, isViewCurrent: () => boolean = () => true): Promise<boolean> {
    const accountId = userInfo.mid
    const generation = loginStateGeneration
    if (!isCurrentWatchLaterAccount(accountId))
      return false

    try {
      const owner = { accountId, isCurrent: () => isCurrentWatchLaterAccount(accountId) && generation === loginStateGeneration && isViewCurrent() }
      const result = await updateOwnedWatchLater({ aid }, 'remove', owner, {
        get isLogin() { return isLogin.value },
        userInfo,
        ensureWatchLaterState,
        isInWatchLater,
        commitWatchLaterMutation,
      })
      return result.status === 'success' && owner.isCurrent()
    }
    catch (error) {
      reportRuntimeFailure('Failed to remove Watch Later item', error)
      return false
    }
  }

  function initMomentsData(selectedType: string) {
    // 重置所有相关状态，并使之前分类的异步响应失效。
    momentsRequestGeneration++
    momentsCountRequestGeneration++
    isLoadingMomentsCount.value = false
    moments.splice(0) // 使用 splice 正确清空响应式数组
    momentUpdateBaseline.value = ''
    momentOffset.value = ''
    // newMomentsCount.value = 0
    livePage.value = 1
    noMoreMomentsContent.value = false
    isLoadingMoments.value = false // 重置加载状态,防止卡住
    collaborativeVideoMap.clear()

    // 获取初始数据
    getMomentsData(selectedType)
  }

  function getMomentsData(selectedType: string) {
    if (selectedType !== 'live')
      getTopBarMoments(selectedType)
    else
      getTopBarLiveMoments()
  }

  function getTopBarMoments(selectedType: string) {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId) || isLoadingMoments.value || noMoreMomentsContent.value)
      return

    const requestGeneration = momentsRequestGeneration
    const requestOffset = momentOffset.value
    const requestUpdateBaseline = momentUpdateBaseline.value
    const isFirstPage = !requestOffset
    isLoadingMoments.value = true
    api.moment.getTopBarMoments({
      type: selectedType,
      update_baseline: momentUpdateBaseline.value || undefined,
      offset: momentOffset.value || undefined,
    })
      .then((res: any) => {
        if (res.code === 0 && isCurrentAccount(accountId) && requestGeneration === momentsRequestGeneration) {
          const { has_more, offset, update_baseline } = res.data
          const items = Array.isArray(res.data.items) ? res.data.items : []

          let addedMomentCount = 0
          const existingMomentKeys = new Set(moments.map(moment => moment.id_str))

          // 添加新内容
          if (items?.length) {
            // 根据 selectedType 和设置过滤数据
            // type: 8 是视频，type: 64 是专栏
            let filteredItems = items

            // 如果是视频类型，根据设置决定是否过滤专栏
            if (selectedType === 'video') {
              if (settings.value.filterArticlesInMoments) {
                // 开启过滤专栏：只保留视频（type: 8）
                filteredItems = items.filter((item: any) => item.type === 8)
              }
              else {
                // 关闭过滤专栏：保留视频和专栏（type: 8 或 64）
                filteredItems = items.filter((item: any) => item.type === 8 || item.type === 64)
              }
            }

            const latestVideoTimes = filteredItems
              .filter((item: any) => item.type === 8)
              .flatMap((item: any) => {
                const time = parseTopBarPublicationTime(item.pub_time)
                if (!time)
                  return []

                const authors = Array.isArray(item.authors) && item.authors.length > 0
                  ? item.authors
                  : [item.author]
                return authors.map((author: any) => ({
                  mid: author?.mid,
                  time,
                }))
              })
            void recordUploaderLatestVideoTimes(latestVideoTimes, 'topbar-pop')

            // 联合投稿只会按 bvid 合并重复视频；专栏没有 bvid，会原位保留。
            // 对完整过滤结果一次处理，避免先拆分类型再拼接破坏 API 时间顺序。
            const processedItems = selectedType === 'video'
              ? mergeCollaborativeVideos(filteredItems)
              : filteredItems

            // 如果是第一次加载（offset为空），需要根据过滤和合并后的实际数量调整 newMomentsCount
            // 因为过滤专栏和合并联合投稿会导致显示的条目数量少于原始的 update_num
            if (isFirstPage && selectedType === 'video') {
              newMomentsCount.value = countVisibleNewMomentItems(
                items,
                filteredItems,
                newMomentsCount.value,
                extractBvid,
              )
            }

            processedItems.forEach((item: any) => {
              const idStr = resolveStableMomentKey(item, 'moment')
              if (existingMomentKeys.has(idStr))
                return

              existingMomentKeys.add(idStr)
              addedMomentCount++
              const momentItem = {
                id_str: idStr,
                type: selectedType,
                title: item.title,
                author: item.authors ? item.authors.map((a: any) => a.name).join(' / ') : item.author.name,
                authorFace: item.author.face,
                authorJumpUrl: item.author.jump_url,
                pubTime: item.pub_time,
                cover: item.cover,
                link: item.jump_url,
                rid: item.rid,
                watchLaterAid: item.type === 8 ? Number(item.rid) || undefined : undefined,
                isCollaborative: !!item.authors,
                authors: item.authors,
              }

              moments.push(momentItem)

              if (selectedType === 'video' && item.type === 8) {
                const bvid = extractBvid(item)
                if (!bvid)
                  return
                const entry = collaborativeVideoMap.get(bvid)
                if (!entry)
                  return
                entry.moment = momentItem
                updateMomentCollaborative(momentItem, entry.item)
              }
            })
          }

          const cursorAdvanced = offset !== requestOffset
            || update_baseline !== requestUpdateBaseline
          momentUpdateBaseline.value = update_baseline
          momentOffset.value = offset
          noMoreMomentsContent.value = !has_more
            || items.length === 0
            || (!cursorAdvanced && addedMomentCount === 0)
        }
      })
      .catch(error => reportRuntimeFailure('Failed to load TopBar moments', error))
      .finally(() => {
        if (requestGeneration === momentsRequestGeneration)
          isLoadingMoments.value = false
      })
  }

  function extractBvid(item: any): string | null {
    const jumpUrl = typeof item.jump_url === 'string' ? item.jump_url : ''
    const bvMatch = jumpUrl.match(/\/(BV\w+)/)
    if (bvMatch?.[1])
      return bvMatch[1]

    const major = item?.modules?.module_dynamic?.major
    const directBvid = item?.bvid || major?.archive?.bvid || major?.ugc_season?.bvid
    return typeof directBvid === 'string' && directBvid ? directBvid : null
  }

  function normalizeAuthor(author: any) {
    return {
      name: author?.name,
      face: author?.face,
      jump_url: author?.jump_url,
    }
  }

  function collectAuthors(item: any): any[] {
    if (Array.isArray(item.authors) && item.authors.length > 0)
      return item.authors.map(normalizeAuthor)
    if (item.author)
      return [normalizeAuthor(item.author)]
    return []
  }

  function mergeAuthors(targetItem: any, incomingItem: any) {
    const incomingAuthors = collectAuthors(incomingItem)
    if (incomingAuthors.length === 0)
      return

    const targetAuthors = Array.isArray(targetItem.authors)
      ? targetItem.authors
      : collectAuthors(targetItem)

    incomingAuthors.forEach((author) => {
      const authorKey = author.jump_url || author.name
      const exists = targetAuthors.some((a: any) => (a.jump_url || a.name) === authorKey)
      if (!exists)
        targetAuthors.push(author)
    })

    if (targetAuthors.length > 1)
      targetItem.authors = targetAuthors
  }

  function updateMomentCollaborative(moment: any, item: any) {
    if (!Array.isArray(item.authors) || item.authors.length <= 1)
      return

    moment.isCollaborative = true
    moment.authors = item.authors
    moment.author = item.authors.map((a: any) => a.name).join(' / ')
  }

  // 合并联合投稿视频的辅助函数（跨页合并）
  function mergeCollaborativeVideos(items: any[]) {
    const newItems: any[] = []

    items.forEach((item: any) => {
      const bvid = extractBvid(item)
      if (!bvid) {
        newItems.push(item)
        return
      }

      const existingEntry = collaborativeVideoMap.get(bvid)
      if (!existingEntry) {
        const storedItem = { ...item }
        collaborativeVideoMap.set(bvid, { item: storedItem })
        newItems.push(storedItem)
        return
      }

      mergeAuthors(existingEntry.item, item)
      if (existingEntry.moment)
        updateMomentCollaborative(existingEntry.moment, existingEntry.item)
    })

    return newItems
  }

  function getTopBarLiveMoments() {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId) || isLoadingMoments.value)
      return
    if (noMoreMomentsContent.value)
      return

    const requestGeneration = momentsRequestGeneration
    isLoadingMoments.value = true
    const pageSize = 10
    api.moment.getTopBarLiveMoments({
      page: livePage.value,
      pagesize: pageSize,
    })
      .then((res: any) => {
        if (res.code === 0 && isCurrentAccount(accountId) && requestGeneration === momentsRequestGeneration) {
          const list = Array.isArray(res.data?.list) ? res.data.list : []

          const existingMomentKeys = new Set(moments.map(moment => moment.id_str))
          const liveMoments = list.flatMap((item: any) => {
            const idStr = resolveStableMomentKey(item, 'live')
            if (existingMomentKeys.has(idStr))
              return []

            existingMomentKeys.add(idStr)
            return [{
              id_str: idStr,
              type: 'live',
              title: item.title,
              author: item.uname,
              authorFace: item.face,
              cover: item.pic,
              link: item.link,
              authorJumpUrl: item.link,
            }]
          })
          moments.push(...liveMoments)
          if (list.length < pageSize || liveMoments.length === 0)
            noMoreMomentsContent.value = true
          else
            livePage.value++
        }
      })
      .finally(() => {
        if (requestGeneration === momentsRequestGeneration)
          isLoadingMoments.value = false
      })
  }

  function isNewMoment(index: number) {
    return index < newMomentsCount.value
  }

  function handleNotificationsItemClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
    if (settings.value.openNotificationsPageAsDrawer) {
      drawerVisible.notifications = true
      notificationsDrawerUrl.value = item.url
    }
  }

  function closeAllPopups(exceptionKey?: string) {
    Object.keys(popupVisible).forEach((key) => {
      if (key !== exceptionKey)
        popupVisible[key as keyof typeof popupVisible] = false
    })
  }

  let updateTimer: ReturnType<typeof setTimeout> | null = null
  let updateTimerGeneration = 0

  function disableSharedStateMessaging() {
    if (sharedStateMessagingUnavailable)
      return
    sharedStateMessagingUnavailable = true
    invalidateLoginStateRequests()
    stopUpdateTimer()
  }

  function createSharedStateSnapshot(): TopBarSharedState {
    return {
      unReadMessage: { ...unReadMessage },
      unReadDm: { ...unReadDm },
      newMomentsCount: newMomentsCount.value,
      hasBCoinToReceive: hasBCoinToReceive.value,
      bCoinAlreadyReceived: bCoinAlreadyReceived.value,
      vipExpAlreadyReceived: vipExpAlreadyReceived.value,
      bCoinNextReceiveAt: bCoinNextReceiveAt.value,
      vipExpNextReceiveAt: vipExpNextReceiveAt.value,
    }
  }

  function applySharedState(snapshot: Partial<TopBarSharedState>, resource: TopBarSharedResource) {
    if (resource === 'unread') {
      Object.assign(unReadMessage, snapshot.unReadMessage)
      Object.assign(unReadDm, snapshot.unReadDm)
    }
    else if (resource === 'moments' && snapshot.newMomentsCount !== undefined) {
      newMomentsCount.value = snapshot.newMomentsCount
    }
    else if (resource === 'rewards') {
      if (snapshot.hasBCoinToReceive !== undefined)
        hasBCoinToReceive.value = snapshot.hasBCoinToReceive
      if (snapshot.bCoinAlreadyReceived !== undefined)
        bCoinAlreadyReceived.value = snapshot.bCoinAlreadyReceived
      if (snapshot.vipExpAlreadyReceived !== undefined)
        vipExpAlreadyReceived.value = snapshot.vipExpAlreadyReceived
      bCoinNextReceiveAt.value = snapshot.bCoinNextReceiveAt ?? null
      vipExpNextReceiveAt.value = snapshot.vipExpNextReceiveAt ?? null
    }
  }

  onMessage<TopBarStatePublish>(
    TOP_BAR_STATE_MESSAGE.UPDATED,
    ({ accountId, snapshot, resource, version, refreshId }) => {
      if (!isCurrentAccount(accountId) || !Object.hasOwn(resourceVersions, resource)
        || version < resourceVersions[resource] || (version === resourceVersions[resource] && refreshId <= resourceRefreshIds[resource])) {
        return
      }
      resourceVersions[resource] = version
      resourceRefreshIds[resource] = refreshId
      dirtyResources.delete(resource)
      applySharedState(snapshot, resource)
    },
  )

  onMessage<TopBarStateInvalidate>(
    TOP_BAR_STATE_MESSAGE.INVALIDATED,
    ({ accountId, resource, version }) => {
      if (!isCurrentAccount(accountId) || !Object.hasOwn(resourceVersions, resource)
        || version === undefined || version < resourceVersions[resource]) {
        return
      }

      resourceVersions[resource] = version
      dirtyResources.add(resource)
      if (!canRefreshUi())
        return
      syncSharedData({ resource }).catch((error) => {
        reportRuntimeFailure('Failed to refresh invalidated unread-message state', error)
      })
    },
  )

  onMessage<TopBarFavoritesChanged>(
    TOP_BAR_STATE_MESSAGE.FAVORITES_CHANGED,
    ({ accountId }) => {
      if (accountId === userInfo.mid)
        favoriteStateVersion.value++
    },
  )

  // 他处登录/登出/会话过期导致会话 Cookie 变化时，后台广播此消息（见 issue #921）
  onMessage(TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED, reconcileLocalLoginState)

  interface SyncSharedDataOptions {
    force?: boolean
    resource?: TopBarSharedResource
    refresh?: () => Promise<boolean>
  }

  async function syncSharedDataFromBroker(options: SyncSharedDataOptions, resource: TopBarSharedResource) {
    if (!canRefreshUi() || !isLogin.value)
      return

    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return
    const generation = loginStateGeneration

    const claim = await sendMessage<TopBarStateClaim, TopBarRefreshClaim | null | undefined>(
      TOP_BAR_STATE_MESSAGE.CLAIM_REFRESH,
      {
        accountId,
        maxAge: UPDATE_INTERVAL,
        force: options.force,
        resource,
      },
    )

    // webextension-polyfill can resolve a closed message port without a reply.
    // A claim always returns an object; an empty reply is a terminal transport failure.
    if (!claim) {
      disableSharedStateMessaging()
      return
    }

    // 主动刷新必须使用当前操作的 API 结果，不能先用 broker 中可能过期的
    // snapshot 覆盖本地状态；普通定时同步仍复用 snapshot。
    if (!isCurrentAccount(accountId) || generation !== loginStateGeneration || claim.version < resourceVersions[resource]) {
      if (claim.shouldRefresh && claim.refreshId !== undefined)
        await sendMessage<TopBarStateRelease>(TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH, { accountId, resource, refreshId: claim.refreshId })
      return
    }
    resourceVersions[resource] = claim.version
    if (claim.snapshot && !options.force) {
      applySharedState(claim.snapshot, resource)
      dirtyResources.delete(resource)
    }

    if (!claim.shouldRefresh)
      return

    if (claim.refreshId === undefined)
      return

    const refreshId = claim.refreshId
    const version = claim.version
    dirtyResources.delete(resource)

    const release = () => sendMessage<TopBarStateRelease>(
      TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH,
      {
        accountId,
        refreshId,
        resource,
      },
    )

    try {
      await completeSharedRefreshLease({
        refresh: () => isCurrentAccount(accountId) && canRefreshUi()
          ? (options.refresh?.() ?? (resource === 'unread' ? getUnreadMessageCount() : resource === 'moments' ? getTopBarNewMomentsCount() : refreshVipRewardStatus()))
          : Promise.resolve(false),
        isCurrent: () => isCurrentAccount(accountId) && generation === loginStateGeneration && resourceVersions[resource] === version,
        release,
        publish: () => sendMessage<TopBarStatePublish>(
          TOP_BAR_STATE_MESSAGE.PUBLISH,
          {
            accountId,
            snapshot: Object.fromEntries(TOP_BAR_RESOURCE_FIELDS[resource].map(field => [field, createSharedStateSnapshot()[field]])),
            refreshId,
            resource,
            version,
          },
        ),
      })
    }
    finally {
      // Invalidation during this lease is one follow-up demand. A peer can win
      // the next lease; all participants still converge without bypassing it.
      if (isCurrentAccount(accountId) && generation === loginStateGeneration && dirtyResources.has(resource) && canRefreshUi()) {
        followupResources.add(resource)
      }
    }
  }

  async function syncSharedData(options: SyncSharedDataOptions = {}) {
    if (!canRefreshUi())
      return

    try {
      const resources: TopBarSharedResource[] = options.resource ? [options.resource] : ['unread', 'moments', 'rewards']
      await Promise.all(resources.map((resource) => {
        const existing = pendingResources.get(resource)
        if (existing)
          return existing
        const request = syncSharedDataFromBroker(options, resource).finally(() => {
          if (pendingResources.get(resource) === request) {
            pendingResources.delete(resource)
            if (followupResources.delete(resource) && canRefreshUi())
              void syncSharedData({ resource }).catch(error => reportRuntimeFailure('Failed to reconcile TopBar invalidation', error))
          }
        })
        pendingResources.set(resource, request)
        return request
      }))
      if (!options.resource && canRefreshUi())
        await getWatchLaterCount()
    }
    catch (error) {
      if (!isExtensionContextInvalidatedError(error))
        throw error

      // 扩展重新加载后，旧 content script 的 runtime 无法恢复。
      // 停止轮询并让后续同步短路，等待后台刷新提示引导页面加载新脚本。
      disableSharedStateMessaging()
    }
  }

  function syncUnreadMessageState() {
    return invalidateUnreadMessageState()
  }

  function syncMomentsState(selectedType: string = 'video') {
    return syncSharedData({
      force: true,
      resource: 'moments',
      refresh: () => getTopBarNewMomentsCount(selectedType),
    })
  }

  function syncWatchLaterState(includeList = false) {
    return includeList ? getWatchLaterPreview() : getWatchLaterCount()
  }

  function invalidateUnreadMessageState() {
    const accountId = userInfo.mid
    if (!accountId || sharedStateMessagingUnavailable)
      return Promise.resolve()

    return sendMessage<TopBarStateInvalidate>(
      TOP_BAR_STATE_MESSAGE.INVALIDATE,
      { accountId, resource: 'unread' },
    ).catch((error) => {
      if (!isExtensionContextInvalidatedError(error))
        throw error

      disableSharedStateMessaging()
    })
  }

  function notifyFavoritesChanged() {
    const accountId = userInfo.mid
    if (!accountId || sharedStateMessagingUnavailable)
      return Promise.resolve()

    return sendMessage<TopBarFavoritesChanged>(
      TOP_BAR_STATE_MESSAGE.FAVORITES_CHANGED,
      { accountId },
    ).catch((error) => {
      if (!isExtensionContextInvalidatedError(error))
        throw error

      disableSharedStateMessaging()
    })
  }

  async function initData() {
    if (!canRefreshUi())
      return
    reconcileLocalLoginState()
    const requestGeneration = loginStateGeneration
    await fetchUserInfoOnce()

    if (!canRefreshUi() || requestGeneration !== loginStateGeneration || !isLogin.value)
      return

    await syncSharedData()
  }

  function startUpdateTimer() {
    if (updateTimer || !canRefreshUi())
      return

    const timerGeneration = updateTimerGeneration

    // 登录态由本地事实与事件驱动维护（见 reconcileLocalLoginState），定时器
    // 不再承担登录态轮询，只负责两件事：
    // 1. 已登录但 userInfo 尚未填充（初始化时撞风控/限流）：按
    //    LOGIN_RECHECK_INTERVAL 重查，瞬态失败指数退避（60s → 120s → 240s →
    //    300s 封顶），填充成功即转 2；
    // 2. userInfo 已填充：按固定间隔同步角标状态。
    // 未登录时不启动任何轮询，等待事件唤醒（见 issue #921）。
    const maxRecheckInterval = 5 * 60 * 1000
    let recheckInterval = LOGIN_RECHECK_INTERVAL
    const needsRecheck = () => isLogin.value && !userInfo.mid
    const scheduleNext = (delay: number) => {
      if (timerGeneration !== updateTimerGeneration || !canRefreshUi())
        return

      updateTimer = setTimeout(() => {
        if (timerGeneration !== updateTimerGeneration)
          return

        // 扩展重载后旧 content script 的 runtime 已失效：停止轮询，等待刷新
        if (!canRefreshUi()) {
          updateTimer = null
          return
        }

        if (needsRecheck()) {
          fetchUserInfoOnce()
            .then((status) => {
              if (timerGeneration !== updateTimerGeneration)
                return

              // 重查判定真实登出（-101）：停止轮询，等待事件唤醒
              if (!isLogin.value) {
                updateTimer = null
                return
              }

              // 只有瞬态失败才退避；填充成功即复位到基准间隔
              if (status === LoginStatus.TransientError)
                recheckInterval = Math.min(recheckInterval * 2, maxRecheckInterval)
              else
                recheckInterval = LOGIN_RECHECK_INTERVAL

              // userInfo 填充成功后立即同步一次角标状态，不用等下一个 tick
              if (!needsRecheck()) {
                void syncSharedData().catch((error) => {
                  reportRuntimeFailure('Failed to sync shared TopBar state', error)
                })
              }
              scheduleNext(needsRecheck() ? recheckInterval : UPDATE_INTERVAL)
            })
          return
        }

        if (!isLogin.value) {
          // 未登录：停止轮询，等待 Cookie 事件或可见性校正唤醒
          updateTimer = null
          return
        }

        recheckInterval = LOGIN_RECHECK_INTERVAL
        syncSharedData().catch((error) => {
          reportRuntimeFailure('Failed to sync shared TopBar state', error)
        })
        scheduleNext(UPDATE_INTERVAL)
      }, delay)
    }

    if (!isLogin.value)
      return

    scheduleNext(needsRecheck() ? LOGIN_RECHECK_INTERVAL : UPDATE_INTERVAL)
  }
  function stopUpdateTimer() {
    updateTimerGeneration++
    if (updateTimer) {
      clearTimeout(updateTimer)
      updateTimer = null
    }
  }

  function cleanup() {
    uiActive = false
    stopUpdateTimer()
    invalidateLoginStateRequests()

    if (!isLogin.value) {
      lastLoggedOutMid = getLocalLoginMid()
      clearUserInfo()
    }

    resetAccountScopedState()

    closeAllPopups()
    drawerVisible.notifications = false
  }

  async function setUiActive(active: boolean) {
    uiActive = active
    if (!canRefreshUi()) {
      stopUpdateTimer()
      cancelLoginRead()
      return
    }
    // Cookie reconciliation precedes any reuse of account-scoped snapshots.
    await initData()
    if (canRefreshUi())
      startUpdateTimer()
  }

  // 设置TopBar可见状态
  function setTopBarVisible(visible: boolean) {
    topBarVisible.value = visible
  }

  return {
    canReadUi: canRefreshUi,
    invalidateExtensionContext: disableSharedStateMessaging,
    isLogin,
    userInfo,
    unReadMessage,
    unReadDm,
    unReadMessageCount,
    newMomentsCount,
    watchLaterCount,
    watchLaterList,
    favoriteStateVersion,
    isLoadingWatchLater,
    drawerVisible,
    notificationsDrawerUrl,
    popupVisible,

    isSearchPage,
    isTopBarFixed,
    showTopBar,

    getUserInfo: fetchUserInfoOnce,
    reconcileLocalLoginState,
    getUnreadMessageCount,
    getTopBarNewMomentsCount,
    handleNotificationsItemClick,
    closeAllPopups,
    initData,
    setUiActive,
    cleanup,
    syncSharedData,
    syncUnreadMessageState,
    syncMomentsState,
    syncWatchLaterState,
    ensureWatchLaterState,
    watchLaterInvalidationVersion,
    isInWatchLater,
    commitWatchLaterMutation,
    invalidateWatchLaterMembership,
    invalidateUnreadMessageState,
    notifyFavoritesChanged,
    startUpdateTimer,
    stopUpdateTimer,

    moments,
    watchLaterUpdate,
    isLoadingMoments,
    noMoreMomentsContent,
    livePage,
    momentUpdateBaseline,
    momentOffset,

    getTopBarMoments,
    initMomentsData,
    getMomentsData,
    isNewMoment,
    getWatchLaterCount,
    getWatchLaterPreview,
    loadMoreWatchLaterList,
    deleteWatchLaterItem,

    privilegeInfo,
    hasBCoinToReceive,
    bCoinAlreadyReceived,
    vipExpAlreadyReceived,

    topBarVisible,
    searchKeyword,
    setTopBarVisible,
  }
})
