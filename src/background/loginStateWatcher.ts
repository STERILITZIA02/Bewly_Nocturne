import browser from 'webextension-polyfill'

import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'

import { getStateConsumerRegistry } from './stateConsumers'
import { invalidateWbiMemoryCache } from './wbiSign'

// 登录态相关的会话 Cookie（见 bilibili-API-collect docs/login/exit.md：
// 登出会清空它们，登录/扫码登录会写入）
const WATCHED_COOKIE_NAMES = new Set(['DedeUserID', 'SESSDATA', 'bili_jct'])
const accountCookieListeners = new Set<(storeId: string) => void>()

export function onAccountCookieChange(listener: (storeId: string) => void) {
  accountCookieListeners.add(listener)
}

// 登录/登出/切号通常会连续触发多个 Cookie 变更；短窗内合并为一次广播
const BROADCAST_COALESCE_MS = 200

let broadcastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 监听会话 Cookie 变化并广播给所有内容脚本。
 *
 * 登录态变化（他处登录/登出/会话过期/切换账号）会伴随这些会话 Cookie 的
 * 写入或清除，因此事件驱动可以替代轮询（见 issue #921）。广播不携带状态，
 * 各标签页自行按本地 Cookie 事实校正（reconcileLocalLoginState），SESSDATA
 * 例行轮换等值变化会被标签页侧的 mid 比对自然过滤。
 */
export function setupLoginStateWatcher() {
  browser.cookies.onChanged.addListener(({ cookie }) => {
    const normalizedDomain = cookie.domain.trim().toLowerCase().replace(/^\.+/, '')
    const isBilibiliDomain = normalizedDomain === 'bilibili.com' || normalizedDomain.endsWith('.bilibili.com')

    if (!WATCHED_COOKIE_NAMES.has(cookie.name) || !isBilibiliDomain)
      return

    accountCookieListeners.forEach(listener => listener(cookie.storeId))
    invalidateWbiMemoryCache()
    scheduleBroadcastLoginStateChanged()
  })
}

function scheduleBroadcastLoginStateChanged() {
  // 延后到最后一次 Cookie 变更后再广播，避免在 DedeUserID/SESSDATA
  // 尚未同时更新时触发中间态校正。
  if (broadcastTimer !== null)
    clearTimeout(broadcastTimer)

  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    void broadcastLoginStateChanged()
  }, BROADCAST_COALESCE_MS)
}

// Account-scoped consumers (TopBar, Watch Later) get one message per document;
// hidden ones only turn stale and reconcile Cookie facts on resume.
async function broadcastLoginStateChanged() {
  await getStateConsumerRegistry().deliverOnce(['topBar', 'watchLater'], { type: TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED })
}
