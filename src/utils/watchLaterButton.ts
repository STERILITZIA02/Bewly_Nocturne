import { watch } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { i18n } from '~/utils/i18n'
import { getCSRF, getUserID } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { resolveWatchLaterAid } from '~/utils/watchLater'

const BUTTON_CLASS = 'bewly-watch-later-btn'
const WATCH_LATER_ICON_CLASS = 'i-mingcute:carplay-line'
const TOOLBAR_LIFECYCLE_SELECTOR = '.video-tool-more, .video-toolbar-container, #arc_toolbar_report, .bewly-watch-later-btn'
const buttonMembershipWatchers = new WeakMap<HTMLButtonElement, () => void>()
const buttonInitializationContexts = new WeakMap<HTMLButtonElement, { ids: VideoIds, state: WatchLaterButtonState }>()
const mountedButtons = new Set<HTMLButtonElement>()
let toolbarLifecycleObserver: MutationObserver | undefined
let toolbarLifecycleFrame: number | undefined
let toolbarLifecycleActive = false
let firstMountPromise: Promise<boolean> | undefined
let resolveFirstMount: ((mounted: boolean) => void) | undefined
let toolbarLifecycleEventCleanup: (() => void) | undefined

export interface VideoIds {
  bvid?: string
  aid?: number
}

interface WatchLaterButtonState {
  aid?: number
  isInWatchLater: boolean
  requestPending: boolean
  initializationPending: boolean
  pendingAid?: Promise<number | undefined>
}

interface MountedWatchLaterButton {
  button: HTMLButtonElement
  ids: VideoIds
  ready: Promise<void>
  state: WatchLaterButtonState
}

/**
 * 从URL中提取视频ID
 * 支持 /video/BV...、/video/av...，以及 /list/...?bvid= / ?avid= 等合集/列表页
 * @param url 视频页面URL，默认为当前页面URL
 * @returns 包含bvid或aid的对象
 */
export function extractVideoIds(url: string = location.href): VideoIds {
  // 提取路径中的 BVID（普通视频页）
  const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/)
  if (bvidMatch)
    return { bvid: bvidMatch[1] }

  // 提取路径中的 AID
  const aidMatch = url.match(/\/video\/av(\d+)/i)
  if (aidMatch)
    return { aid: Number.parseInt(aidMatch[1]) }

  // 合集/列表页：ID 在 query 中（SPA 切集时 pathname 不变，bvid/avid 会变）
  try {
    const searchParams = new URL(url).searchParams
    const bvid = searchParams.get('bvid')
    if (bvid)
      return { bvid }

    const avid = searchParams.get('avid') || searchParams.get('aid')
    if (avid)
      return { aid: Number.parseInt(avid) }
  }
  catch {
    // ignore invalid URL
  }

  return {}
}

function getVideoKey({ bvid, aid }: VideoIds): string {
  return bvid || (aid ? `av${aid}` : '')
}

function translate(key: string): string {
  return String(i18n.global.t(key, settings.value.language))
}

function updateButtonState(button: HTMLButtonElement, isInWatchLater: boolean) {
  const icon = button.querySelector<HTMLElement>('.bewly-watch-later-btn__icon')
  const addLabel = translate('common.add_to_watch_later')
  const actionLabel = isInWatchLater
    ? translate('common.remove_from_watch_later')
    : addLabel

  button.classList.toggle('is-active', isInWatchLater)
  button.dataset.inWatchLater = String(isInWatchLater)
  button.setAttribute('aria-pressed', String(isInWatchLater))
  button.setAttribute('aria-label', actionLabel)
  button.title = actionLabel

  if (icon)
    icon.className = `${WATCH_LATER_ICON_CLASS} bewly-watch-later-btn__icon`
}

function isWatchLaterAccountCurrent(accountId: number, csrf: string) {
  return String(getUserID() || '') === String(accountId) && getCSRF() === csrf
}

function setButtonBusy(button: HTMLButtonElement, isBusy: boolean) {
  button.disabled = isBusy
  button.classList.toggle('is-pending', isBusy)
  button.setAttribute('aria-busy', String(isBusy))
}

function animateButton(button: HTMLButtonElement) {
  button.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
    { duration: 220, easing: 'ease-out' },
  )
}

async function resolveAid(ids: VideoIds, state: WatchLaterButtonState): Promise<number | undefined> {
  if (state.aid)
    return state.aid
  if (!ids.bvid)
    return undefined
  if (state.pendingAid)
    return state.pendingAid

  state.pendingAid = resolveWatchLaterAid(ids)
    .then((aid) => {
      state.aid = aid
      return aid
    })
    .finally(() => {
      state.pendingAid = undefined
    })

  return state.pendingAid
}

async function initializeButtonState(button: HTMLButtonElement, ids: VideoIds, state: WatchLaterButtonState) {
  if (state.initializationPending)
    return
  state.initializationPending = true
  let initialized = false
  try {
    const topBarStore = useTopBarStore()
    await topBarStore.getUserInfo()
    if (!await topBarStore.ensureWatchLaterState())
      return
    const accountId = topBarStore.userInfo.mid
    const csrf = getCSRF()
    if (!accountId || !csrf || !isWatchLaterAccountCurrent(accountId, csrf))
      return
    const aid = await resolveAid(ids, state)
    if (
      !button.isConnected
      || !aid
      || topBarStore.userInfo.mid !== accountId
      || !isWatchLaterAccountCurrent(accountId, csrf)
    ) {
      return
    }

    state.isInWatchLater = topBarStore.isInWatchLater(aid)
    updateButtonState(button, state.isInWatchLater)
    initialized = true
  }
  catch (error) {
    if (!isExtensionContextInvalidatedError(error) && !isBilibiliRiskControl(error))
      console.error('获取稍后再看状态失败:', error)
  }
  finally {
    state.initializationPending = false
    if (button.isConnected) {
      setButtonBusy(button, false)
      button.disabled = !initialized
      button.setAttribute('aria-disabled', String(!initialized))
    }
  }
}

async function toggleWatchLater(button: HTMLButtonElement, ids: VideoIds, state: WatchLaterButtonState) {
  if (state.requestPending)
    return

  state.requestPending = true
  setButtonBusy(button, true)
  let previousState = state.isInWatchLater
  let requestAccepted = false
  let accountStateValid = true

  try {
    const topBarStore = useTopBarStore()
    if (!await topBarStore.ensureWatchLaterState()) {
      accountStateValid = false
      return
    }
    const accountId = topBarStore.userInfo.mid
    const csrf = getCSRF()
    if (
      !topBarStore.isLogin
      || !accountId
      || !csrf
      || !isWatchLaterAccountCurrent(accountId, csrf)
    ) {
      accountStateValid = false
      return
    }
    const aid = await resolveAid(ids, state)
    if (
      !button.isConnected
      || topBarStore.userInfo.mid !== accountId
      || !isWatchLaterAccountCurrent(accountId, csrf)
    ) {
      accountStateValid = false
      return
    }
    if (!aid) {
      console.warn('无法获取当前视频的 aid，不能更新稍后再看')
      return
    }

    previousState = topBarStore.isInWatchLater(aid)
    const nextState = !previousState
    state.isInWatchLater = nextState
    updateButtonState(button, nextState)

    const result = previousState
      ? await api.watchlater.removeFromWatchLater({ aid, csrf })
      : await api.watchlater.saveToWatchLater({ ...ids, csrf })
    if (
      !button.isConnected
      || topBarStore.userInfo.mid !== accountId
      || !isWatchLaterAccountCurrent(accountId, csrf)
    ) {
      accountStateValid = false
      return
    }
    if (result.code !== 0)
      throw new Error(result.message || `Watch later request failed with code ${result.code}`)

    requestAccepted = true
    await topBarStore.commitWatchLaterMutation(aid, nextState, accountId)
    animateButton(button)
  }
  catch (error) {
    if (!requestAccepted && button.isConnected) {
      state.isInWatchLater = previousState
      updateButtonState(button, previousState)
    }
    if (!isExtensionContextInvalidatedError(error))
      console.error('更新稍后再看状态失败:', error)
  }
  finally {
    state.requestPending = false
    if (button.isConnected) {
      setButtonBusy(button, false)
      if (!accountStateValid) {
        button.disabled = true
        button.setAttribute('aria-disabled', 'true')
      }
    }
  }
}

function createButton(ids: VideoIds): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `video-toolbar-right-item ${BUTTON_CLASS}`
  button.dataset.videoKey = getVideoKey(ids)
  button.innerHTML = `<i class="${WATCH_LATER_ICON_CLASS} bewly-watch-later-btn__icon"></i>`

  updateButtonState(button, false)
  setButtonBusy(button, true)
  return button
}

function teardownMountedWatchLaterButton(button: HTMLButtonElement) {
  mountedButtons.delete(button)
  buttonInitializationContexts.delete(button)
  buttonMembershipWatchers.get(button)?.()
  buttonMembershipWatchers.delete(button)
  button.remove()
}

function mountWatchLaterButton(ids: VideoIds): MountedWatchLaterButton | undefined {
  const moreButton = Array.from(document.querySelectorAll<HTMLElement>('.video-tool-more'))
    .find((element) => {
      if (element.closest(`#bewly-widescreen-root .bewly-widescreen-action-slot`))
        return true
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
    })
  if (!moreButton?.parentNode)
    return undefined

  const state: WatchLaterButtonState = {
    aid: ids.aid,
    isInWatchLater: false,
    requestPending: false,
    initializationPending: false,
  }
  const button = createButton(ids)
  const mounted: MountedWatchLaterButton = {
    button,
    ids,
    ready: Promise.resolve(),
    state,
  }

  button.addEventListener('click', () => {
    void handleButtonClick(mounted)
  })

  const topBarStore = useTopBarStore()
  buttonMembershipWatchers.set(button, watch(
    [
      () => i18n.global.locale.value,
      () => topBarStore.isLogin,
      () => topBarStore.userInfo.mid,
      () => [...topBarStore.addedWatchLaterList],
    ],
    () => {
      if (!button.isConnected || state.requestPending)
        return
      if (!topBarStore.isLogin) {
        state.isInWatchLater = false
        updateButtonState(button, false)
        button.disabled = true
        button.setAttribute('aria-disabled', 'true')
        return
      }
      if (button.getAttribute('aria-disabled') === 'true') {
        void initializeButtonState(button, ids, state)
        return
      }
      state.isInWatchLater = topBarStore.isInWatchLater(state.aid)
      updateButtonState(button, state.isInWatchLater)
    },
  ))

  moreButton.parentNode.insertBefore(button, moreButton)
  mountedButtons.add(button)
  buttonInitializationContexts.set(button, { ids, state })
  mounted.ready = initializeButtonState(button, ids, state)
  return mounted
}

async function handleButtonClick(mounted: MountedWatchLaterButton) {
  // 合集/列表页切集后必须以点击瞬间的 URL 为准，不能继续使用旧按钮闭包中的视频 ID。
  const currentIds = extractVideoIds()
  const currentVideoKey = getVideoKey(currentIds)
  if (!currentVideoKey)
    return

  if (currentVideoKey !== getVideoKey(mounted.ids)) {
    teardownMountedWatchLaterButton(mounted.button)
    const replacement = mountWatchLaterButton(currentIds)
    if (!replacement)
      return

    await replacement.ready
    if (!replacement.button.isConnected || getVideoKey(extractVideoIds()) !== currentVideoKey)
      return

    await toggleWatchLater(replacement.button, replacement.ids, replacement.state)
    return
  }

  await mounted.ready
  if (!mounted.button.isConnected || getVideoKey(extractVideoIds()) !== currentVideoKey)
    return

  await toggleWatchLater(mounted.button, currentIds, mounted.state)
}

/**
 * 添加稍后再看按钮到视频页面。
 * @returns 是否已找到工具栏并成功插入（或复用）按钮
 */
export function addWatchLaterButton(): boolean {
  const ids = extractVideoIds()
  const videoKey = getVideoKey(ids)
  if (!videoKey)
    return false

  const existingButton = document.querySelector<HTMLButtonElement>(`.${BUTTON_CLASS}`)
  if (existingButton?.dataset.videoKey === videoKey) {
    const context = buttonInitializationContexts.get(existingButton)
    if (existingButton.disabled && context && !context.state.initializationPending)
      void initializeButtonState(existingButton, context.ids, context.state)
    return true
  }
  if (existingButton)
    teardownMountedWatchLaterButton(existingButton)

  return Boolean(mountWatchLaterButton(ids))
}

function nodeTouchesToolbarLifecycle(node: Node) {
  if (!(node instanceof Element))
    return false
  return node.matches(TOOLBAR_LIFECYCLE_SELECTOR)
    || !!node.querySelector(TOOLBAR_LIFECYCLE_SELECTOR)
}

function settleFirstMount(mounted: boolean) {
  resolveFirstMount?.(mounted)
  resolveFirstMount = undefined
}

function ensureLifecycleButton() {
  toolbarLifecycleFrame = undefined
  for (const button of [...mountedButtons]) {
    if (!button.isConnected)
      teardownMountedWatchLaterButton(button)
  }
  if (!toolbarLifecycleActive)
    return
  if (!settings.value.externalWatchLaterButton) {
    removeWatchLaterButton()
    return
  }
  try {
    if (addWatchLaterButton())
      settleFirstMount(true)
  }
  catch (error) {
    if (!isExtensionContextInvalidatedError(error))
      console.error('挂载稍后再看按钮失败:', error)
  }
}

function scheduleLifecycleButtonCheck() {
  if (!toolbarLifecycleActive || toolbarLifecycleFrame !== undefined)
    return
  toolbarLifecycleFrame = requestAnimationFrame(ensureLifecycleButton)
}

/**
 * Keep the shared Watch Later button attached to the current video toolbar.
 * The observer follows actual toolbar insertion/replacement instead of guessing
 * when Bilibili's asynchronous toolbar will be ready.
 */
export function mountWatchLaterButtonWhenToolbarReady(): Promise<boolean> {
  toolbarLifecycleActive = true
  if (!firstMountPromise) {
    firstMountPromise = new Promise<boolean>((resolve) => {
      resolveFirstMount = resolve
    })
  }

  if (!toolbarLifecycleEventCleanup) {
    const handleBrowserActivity = () => scheduleLifecycleButtonCheck()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible')
        scheduleLifecycleButtonCheck()
    }
    window.addEventListener('online', handleBrowserActivity)
    window.addEventListener('focus', handleBrowserActivity)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    toolbarLifecycleEventCleanup = () => {
      window.removeEventListener('online', handleBrowserActivity)
      window.removeEventListener('focus', handleBrowserActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  if (!toolbarLifecycleObserver && document.body) {
    toolbarLifecycleObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === 'attributes')
          return nodeTouchesToolbarLifecycle(record.target)
        return Array.from(record.addedNodes)
          .concat(Array.from(record.removedNodes))
          .some(nodeTouchesToolbarLifecycle)
      })
      if (relevant)
        scheduleLifecycleButtonCheck()
    })
    toolbarLifecycleObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })
  }

  scheduleLifecycleButtonCheck()
  return firstMountPromise
}

export function removeWatchLaterButton() {
  toolbarLifecycleActive = false
  toolbarLifecycleObserver?.disconnect()
  toolbarLifecycleObserver = undefined
  toolbarLifecycleEventCleanup?.()
  toolbarLifecycleEventCleanup = undefined
  if (toolbarLifecycleFrame !== undefined)
    cancelAnimationFrame(toolbarLifecycleFrame)
  toolbarLifecycleFrame = undefined
  settleFirstMount(false)
  firstMountPromise = undefined
  for (const button of [...mountedButtons])
    teardownMountedWatchLaterButton(button)
  document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`).forEach(teardownMountedWatchLaterButton)
}
