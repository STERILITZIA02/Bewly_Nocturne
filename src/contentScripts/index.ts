import '~/styles'
import 'uno.css'

import type { App as VueApp } from 'vue'
import { createApp } from 'vue'

import { stopDarkState, useDark } from '~/composables/useDark'
import { onRouteChange, stopRouteObserver } from '~/composables/useRouteState'
import { CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG } from '~/constants/contentScript'
import { BEWLY_MOUNTED, IFRAME_DARK_MODE_CHANGE, IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { getPageBridgeTargetOrigin, isPageBridgeMessage, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '~/constants/pageBridge'
import { settings, settingsInitializationState, settingsReady } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import { useTopBarStore } from '~/stores/topBarStore'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import api from '~/utils/api'
import { applyBewlyWidescreen, exitBewlyWidescreen, isBewlyWidescreenActive, prepareBewlyWidescreenLoading } from '~/utils/bewlyWidescreen'
import { cleanupBilibiliScripts } from '~/utils/bilibiliScriptCleanup'
import { captureOriginalBilibiliTopBar, ensureOriginalBilibiliTopBarAppended, resetBilibiliTopBarInlineStyles, setupLoginButtonClickHandlers } from '~/utils/bilibiliTopBar'
import type { EffectiveTopBarSource } from '~/utils/effectiveTopBarSource'
import { applyEffectiveTopBarSource, EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE, resolveEffectiveTopBarSource } from '~/utils/effectiveTopBarSource'
import { initFavoriteDialogEnhancement, stopFavoriteDialogEnhancement } from '~/utils/favoriteDialog'
import { getParentMessageData, postMessageToParent } from '~/utils/iframeMessage'
import { runWhenIdle } from '~/utils/lazyLoad'
import { executeResolvedLinkAction, hasNavigationModifier, resolveLinkOpenAction } from '~/utils/linkNavigation'
import { getCookie, injectCSS, isElectron, isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage, isVideoPlaybackPage, isWatchLaterListPage, openLinkToNewTab } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { initNativeFavoriteSeasonPlayAllIntercept, stopNativeFavoriteSeasonPlayAllIntercept } from '~/utils/nativeFavoriteSeasonPlayAll'
import { getPageBridgeChannelId, setPageBridgeChannelId } from '~/utils/pageBridgeChannel'
import { createPageSettingsPayload } from '~/utils/pageSettingsProtocol'
import { applyAutoPlayByVideoType, applyDefaultCaptionState, applyDefaultDanmakuState, cancelPlayerRetryTasks, defaultMode, getVideoElement, handleVideoPageNavigation, isPlayerDisplayModeReady, isVideoPage, resetAutoPlayUserChangeFlag, resolveDefaultVideoPlayerMode, startAutoExitFullscreenMonitoring, startAutoPlayUserChangeMonitoring, stopAutoExitFullscreenMonitoring, stopAutoPlayUserChangeMonitoring, stopPlaybackRateMonitoring, webFullscreen, widescreen } from '~/utils/player'
import { applyRandomPlayActivationSettings, destroyRandomPlay, initRandomPlay, isCustomPlayPage, resetRandomPlayInitialization, syncRandomPlayOrder, syncRandomPlayUI } from '~/utils/randomPlay'
import { getPluginSearchResultsUrl, shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'
import { canStartSettingsDependentBoot, shouldShowBewlyBootOverlay } from '~/utils/settingsBootPolicy'
import { SVG_ICONS } from '~/utils/svgIcons'
import { openLinkInBackground } from '~/utils/tabs'
import { initVerticalVideoZoom, resetVerticalVideoZoom } from '~/utils/verticalVideoZoom'
import { recordVideoVisitFromUrl } from '~/utils/videoVisitHistory'
import { ensureResponsiveViewport } from '~/utils/viewportMeta'

import { version } from '../../package.json'
import { mountBewlyBootOverlay } from './bewlyBootOverlay'
import { initBewlyWidescreenControl, stopBewlyWidescreenControl } from './bewlyWidescreenControl'
import { cleanupIframePhotoViewerDetector, setupIframePhotoViewerDetector } from './features/iframePhotoViewerDetector'
import { setupNotificationStateInvalidation } from './features/notificationStateInvalidation'
import { disposeOpusDetailDrawerLayout, setupOpusDetailDrawerLayout } from './features/opusDetailDrawerLayout'
import { initTouchPlayerGestures, stopTouchPlayerGestures } from './touchPlayerGestures'
import { initVideoAspectRatioMemory, stopVideoAspectRatioMemory } from './videoAspectRatioMemory'
import { initVideoScreenshotControl, stopVideoScreenshotControl } from './videoScreenshotControl'
import App from './views/App.vue'

const CONTENT_SCRIPT_DISPOSE_EVENT = 'bewly:content-script-dispose'
const contentScriptGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__?: boolean
}
const shouldInitializeContentScript = !contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__
const contentScriptDisposers: Array<() => void> = []
let contentScriptAbortController: AbortController | null = null
let mountedVueApp: VueApp<Element> | null = null
let mountedVueContainer: HTMLElement | null = null
let mountedVueRoot: HTMLElement | null = null
let restoreOriginalPageVisibilityOwner: (() => void) | null = null

function unmountInjectedApp() {
  const app = mountedVueApp
  mountedVueApp = null
  if (app) {
    try {
      app.unmount()
    }
    catch {
      // A stale extension context may already have invalidated the Vue runtime.
    }
  }
  mountedVueContainer?.remove()
  mountedVueContainer = null
  mountedVueRoot = null
}

function disposeContentScriptRuntime() {
  contentScriptAbortController?.abort()
  contentScriptAbortController = null
  while (contentScriptDisposers.length) {
    try {
      contentScriptDisposers.pop()?.()
    }
    catch {
      // Continue releasing the remaining owners after extension invalidation.
    }
  }
  const finalizers = [
    stopFavoriteDialogEnhancement,
    stopNativeFavoriteSeasonPlayAllIntercept,
    stopTouchPlayerGestures,
    stopVideoAspectRatioMemory,
    stopVideoScreenshotControl,
    stopBewlyWidescreenControl,
    stopAutoPlayUserChangeMonitoring,
    stopAutoExitFullscreenMonitoring,
    stopPlaybackRateMonitoring,
    stopRouteObserver,
    stopDarkState,
    cleanupIframePhotoViewerDetector,
    disposeOpusDetailDrawerLayout,
    exitBewlyWidescreen,
    destroyRandomPlay,
    cancelPlayerRetryTasks,
    resetVerticalVideoZoom,
  ]
  for (const finalize of finalizers) {
    try {
      finalize()
    }
    catch {
      // A partially invalidated runtime must not block the remaining teardown.
    }
  }
  unmountInjectedApp()
}

if (shouldInitializeContentScript) {
  // A newly created extension world asks any stale world to release its Vue root
  // before mounting. Re-evaluation in the same world is still blocked by the flag.
  window.dispatchEvent(new Event(CONTENT_SCRIPT_DISPOSE_EVENT))
  contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__ = true
  contentScriptAbortController = new AbortController()
  const signal = contentScriptAbortController.signal
  window.addEventListener(CONTENT_SCRIPT_DISPOSE_EVENT, disposeContentScriptRuntime, { signal })
  window.addEventListener('pagehide', (event: PageTransitionEvent) => {
    if (event.persisted) {
      if (mountedVueApp === null)
        restoreOriginalPageVisibilityOwner?.()
      return
    }
    disposeContentScriptRuntime()
  }, { signal })
  window.addEventListener('unhandledrejection', (event) => {
    if (isExtensionContextInvalidatedError(event.reason))
      event.preventDefault()
  }, { signal })
  const handleRuntimeMessage = (message: unknown) => {
    if (typeof message === 'object' && message !== null && 'type' in message && message.type === CONTENT_SCRIPT_PING)
      return Promise.resolve(CONTENT_SCRIPT_PONG)

    return false
  }
  browser.runtime.onMessage.addListener(handleRuntimeMessage)
  contentScriptDisposers.push(() => browser.runtime.onMessage.removeListener(handleRuntimeMessage))
}

const isElectronEnv = isElectron()

const currentUrl = document.URL

if (shouldInitializeContentScript && isHomePage()) {
  console.log('[Bewly Nocturne][首页加载] 插件开始加载', {
    time: new Date().toLocaleString(),
    version,
  })
}

function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

function isSupportedPages(): boolean {
  if (isInIframe())
    return false
  if (
    // homepage
    isHomePage()
    // video or bangumi page
    || isVideoOrBangumiPage()
    // watch later list page
    || isWatchLaterListPage(currentUrl)
    // popular page https://www.bilibili.com/v/popular/all
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/popular\/all.*/.test(currentUrl)
    // search page
    || /https?:\/\/search\.bilibili\.com\.*/.test(currentUrl)
    // moments page
    // https://github.com/BewlyBewly/BewlyBewly/issues/1246
    // https://github.com/BewlyBewly/BewlyBewly/issues/1256
    // https://github.com/BewlyBewly/BewlyBewly/issues/1266
    // https://github.com/keleus/BewlyCat/issues/150
    || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share|\/pages\/nav).*/.test(currentUrl)
    // moment detail
    || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
    // history page
    || /https?:\/\/(?:www\.)?bilibili\.com\/history.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/account\/history.*/.test(currentUrl)
    // user space page
    || /https?:\/\/space\.bilibili\.com\.*/.test(currentUrl)
    // notifications page
    || /https?:\/\/message\.bilibili\.com\.*/.test(currentUrl)
    // bilibili channel page b站分区页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/(?!popular).*/.test(currentUrl)
    // bilibili channel page 新版本页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/c\/(?!popular).*/.test(currentUrl)
    // anime page & chinese anime page
    || /https?:\/\/(?:www\.)?bilibili\.com\/(?:anime|guochuang).*/.test(currentUrl)
    // channel page e.g. tv shows, movie, variety shows, mooc page
    || /https?:\/\/(?:www\.)?bilibili\.com\/(?:tv|movie|variety|mooc|documentary).*/.test(currentUrl)
    // article page
    || /https?:\/\/(?:www\.)?bilibili\.com\/read\/.*/.test(currentUrl)
    // 404 page
    || /^https?:\/\/(?:www\.)?bilibili\.com\/404.*$/.test(currentUrl)
    // creative center page 創作中心頁
    || /^https?:\/\/member\.bilibili\.com\/platform.*$/.test(currentUrl)
    // account settings page 帳號設定頁
    || /^https?:\/\/account\.bilibili\.com\/.*$/.test(currentUrl)
    // music center page 新歌熱榜 https://music.bilibili.com/pc/music-center/
    || /https?:\/\/music\.bilibili\.com\/pc\/music-center.*$/.test(currentUrl)
    // // blackboard 存在和B站其他页面不一样的元素，需要独立适配
    // || /https?:\/\/(?:www\.)?bilibili\.com\/blackboard.*$/.test(currentUrl)
    // // judgement 存在和B站其他页面不一样的元素，需要独立适配
    // || /https?:\/\/(?:www\.)?bilibili\.com\/judgement.*$/.test(currentUrl)
  ) {
    return true
  }
  else {
    return false
  }
}

export function isSupportedIframePages(): boolean {
  if (
    isInIframe()
    && (
      // supports Bilibili page URLs recorded in the dock
      isHomePage()
      // Since `Open in drawer` will open the video page within an iframe, so we need to support the following pages
      || isVideoOrBangumiPage()
      || /https?:\/\/search\.bilibili\.com\/all.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/anime.*/.test(currentUrl)
      || /https?:\/\/space\.bilibili\.com\/\d+\/favlist.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/history.*/.test(currentUrl)
      || isWatchLaterListPage(currentUrl)
      // moments page
      // https://github.com/BewlyBewly/BewlyBewly/issues/1246
      // https://github.com/BewlyBewly/BewlyBewly/issues/1256
      // https://github.com/BewlyBewly/BewlyBewly/issues/1266
      // https://github.com/keleus/BewlyCat/issues/150
      || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share|\/pages\/nav).*/.test(currentUrl)
      // moment detail (opus)
      || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
      // notifications page, for `Open the notifications page as a drawer`
      || isNotificationPage()
    )
  ) {
    return true
  }
  else {
    return false
  }
}

if (isElectronEnv) {
  console.warn('[Bewly Nocturne] Detected Electron environment, extension disabled.')
}
else if (shouldInitializeContentScript) {
  const contentScriptSignal = contentScriptAbortController!.signal
  const bootOverlay = shouldShowBewlyBootOverlay(location.href, isInIframe())
    ? mountBewlyBootOverlay(document)
    : null
  if (bootOverlay) {
    contentScriptDisposers.push(() => bootOverlay.remove(true))
    contentScriptDisposers.push(watch(settingsInitializationState, (state) => {
      if (state === 'degraded')
        bootOverlay.reveal()
    }, { immediate: true }))
  }

  const detachedTimers = new Set<ReturnType<typeof setTimeout>>()
  const scheduleDetachedTimer = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      detachedTimers.delete(timer)
      callback()
    }, delay)
    detachedTimers.add(timer)
    return timer
  }
  contentScriptDisposers.push(() => {
    detachedTimers.forEach(timer => clearTimeout(timer))
    detachedTimers.clear()
  })

  // MAIN world 在 document_start 阶段发起握手，因此必须在等待 DOM 前注册。
  function sendSettingsToPage(value: unknown) {
    const channelId = getPageBridgeChannelId()
    const payload = createPageSettingsPayload(value)
    if (!channelId || !payload)
      return

    postPageBridgeMessage(window, {
      protocol: PAGE_BRIDGE_PROTOCOL,
      channelId,
      type: PAGE_BRIDGE_MESSAGE.SETTINGS_UPDATE,
      data: payload,
    }, window.location.origin)
  }

  window.addEventListener('message', (event) => {
    const targetOrigin = getPageBridgeTargetOrigin(window.location.origin)
    if (!targetOrigin
      || !isPageBridgeMessage(event.data)
      || event.data.type !== PAGE_BRIDGE_MESSAGE.SETTINGS_REQUEST
      || !matchesPageBridgeEvent(event, {
        source: window,
        origin: targetOrigin,
        channelId: event.data.channelId,
        type: PAGE_BRIDGE_MESSAGE.SETTINGS_REQUEST,
      })
      || !setPageBridgeChannelId(event.data.channelId)) {
      return
    }

    void settingsReady.then(() => {
      if (!contentScriptSignal.aborted)
        sendSettingsToPage(settings.value)
    })
  }, { signal: contentScriptSignal })

  const playerModeLoadSettleDelay = 500
  const videoOwnerAvatarReadyTimeout = 8000
  const videoOwnerAvatarSelector = [
    '.up-panel-container .up-avatar-wrap img.bili-avatar-img',
    '.up-panel-container .up-avatar-wrap img',
    '.up-panel-container .up-avatar img.bili-avatar-img',
    '.up-panel-container .up-avatar img',
    '.up-panel-container .bili-avatar-face img',
    '.up-panel-container img[src*="/face/"]',
    '.up-info-container .up-avatar-wrap img',
    '.up-info-container .up-avatar img',
    '.up-info-container .bili-avatar-face img',
    '#v_upinfo .u-face img',
    '.up-info .u-face img',
    '.up-info .up-face img',
    '.upinfo .u-face img',
    '.upinfo .face img',
  ].join(',')
  contentScriptDisposers.push(setupNotificationStateInvalidation())

  let beforeLoadedStyleEl: HTMLStyleElement | undefined
  let beforeLoadedTransitionStyleEl: HTMLStyleElement | undefined
  let beforeLoadedStyleFailsafeTimer: ReturnType<typeof setTimeout> | undefined
  let originalTopBarBootStyleEl: HTMLStyleElement | undefined
  let homePageHiddenStyleEl: HTMLStyleElement | undefined
  let settingsBootLoaded = false
  let lastUrl = location.href
  let lastVideoNavigationKey = getVideoNavigationKey(location.href)
  let lastAppliedPlayerModeNavigationKey: string | undefined
  let playerModeReadyAfter = document.readyState === 'complete'
    ? Date.now() + playerModeLoadSettleDelay
    : Number.POSITIVE_INFINITY
  let playerModeRetryTimer: ReturnType<typeof setTimeout> | undefined
  let playerModeSettingsReady = false
  let videoOwnerAvatarReadyDeadline = document.readyState === 'complete'
    ? Date.now() + videoOwnerAvatarReadyTimeout
    : Number.POSITIVE_INFINITY
  let pendingWidescreenReloadNavigationKey: string | undefined
  let pendingWidescreenReloadTimer: ReturnType<typeof setTimeout> | undefined
  let autoContinuationNavigationKey: string | undefined
  let lastVideoEndedAt = 0
  let watchLaterButtonAdded = false // 标记稍后再看按钮是否已添加
  let stopLoginButtonClickHandlers: (() => void) | null = null

  function ensureLoginButtonClickHandlers() {
    stopLoginButtonClickHandlers ??= setupLoginButtonClickHandlers(document)
  }

  contentScriptDisposers.push(() => {
    stopLoginButtonClickHandlers?.()
    stopLoginButtonClickHandlers = null
  })

  void settingsReady.then(() => {
    if (contentScriptSignal.aborted)
      return
    playerModeSettingsReady = true
    recordVideoVisitFromUrl(lastUrl)
    applyDefaultPlayerMode()
    if (document.readyState === 'complete' && isCustomPlayPage() && settings.value.enableRandomPlay) {
      scheduleDetachedTimer(() => {
        initRandomPlayFeature()
      }, 3000)
    }
  })

  function setupPluginSearchLinkNavigation() {
    document.addEventListener('click', (event) => {
      if (!shouldUsePluginSearchResultsPage() || !getCookie('DedeUserID'))
        return

      // 评论区等 B 站 Web Component 会把点击目标重新指向 Shadow Host，
      // 需要从完整事件路径中找到实际的搜索链接。
      const anchor = event.composedPath().find(
        (target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement && target.hasAttribute('href'),
      ) ?? (event.target instanceof Element ? event.target.closest('a[href]') : null)
      if (!(anchor instanceof HTMLAnchorElement))
        return

      if (anchor.closest('.bili-header, #biliMainHeader, #internationalHeader, #bili-header-container'))
        return

      const pluginSearchResultsUrl = getPluginSearchResultsUrl(anchor.href)
      if (pluginSearchResultsUrl)
        anchor.href = pluginSearchResultsUrl
    }, { capture: true, signal: contentScriptSignal })
  }

  void settingsReady.then(() => setupPluginSearchLinkNavigation())

  function shouldApplyBewlyDesign() {
    if (settings.value.adaptToOtherPageStyles)
      return !isFestivalPage()

    return settings.value.videoPageDarkMode && isVideoPlaybackPage()
  }

  function shouldApplyVideoPageDarkOnly() {
    return !settings.value.adaptToOtherPageStyles
      && settings.value.videoPageDarkMode
      && isVideoPlaybackPage()
  }

  function applyBewlyDesignClasses() {
    const shouldApply = shouldApplyBewlyDesign()
    document.documentElement.classList.toggle('bewly-design', shouldApply)
    document.documentElement.classList.toggle('bewly-video-dark-only', shouldApplyVideoPageDarkOnly())
    return shouldApply
  }

  function applySettingsDependentPageStyles() {
    if (!(isSupportedPages() || isSupportedIframePages()))
      return

    if (settings.value.adaptToOtherPageStyles || settings.value.videoPageDarkMode)
      useDark()

    const shouldApplyFullStyles = applyBewlyDesignClasses()
    // opus 详情分栏布局不依赖“适配其他页样式”，只要在 iframe 内就尝试重排
    if (isInIframe())
      setupOpusDetailDrawerLayout()
    if (shouldApplyFullStyles && isInIframe())
      setupIframePhotoViewerDetector()
  }

  // 挂载完成、异常、路由切换与保险丝共用清理，重复调用无副作用。
  function removeBeforeLoadedStyleEl() {
    beforeLoadedStyleEl?.remove()
    beforeLoadedStyleEl = undefined
    beforeLoadedTransitionStyleEl?.remove()
    beforeLoadedTransitionStyleEl = undefined
    if (beforeLoadedStyleFailsafeTimer !== undefined)
      clearTimeout(beforeLoadedStyleFailsafeTimer)
    beforeLoadedStyleFailsafeTimer = undefined
  }

  function installBeforeLoadedStyle() {
    removeBeforeLoadedStyleEl()
    if (!settings.value.adaptToOtherPageStyles || !isHomePage())
      return

    beforeLoadedStyleEl = injectCSS(`
      html.bewly-design {
        background-color: var(--bew-bg);
        transition: background-color 0.2s ease-in;
      }

      body {
        display: none;
      }
    `)
    beforeLoadedTransitionStyleEl = injectCSS(`
      body {
        transition: opacity 0.5s;
      }
    `)
    beforeLoadedStyleFailsafeTimer = setTimeout(removeBeforeLoadedStyleEl, 4000)
  }

  function removeOriginalTopBarBootStyle() {
    originalTopBarBootStyleEl?.remove()
    originalTopBarBootStyleEl = undefined
  }

  function installOriginalTopBarBootStyle() {
    removeOriginalTopBarBootStyle()
    originalTopBarBootStyleEl = injectCSS(`
      .bili-header,
      #biliMainHeader,
      .header-channel,
      .bili-header-channel-panel {
        visibility: hidden !important;
      }
    `)
  }

  function removeHomePageHiddenStyle() {
    homePageHiddenStyleEl?.remove()
    homePageHiddenStyleEl = undefined
    document.documentElement.classList.remove('bewly-custom-homepage')
  }

  function ensureHomePageHiddenStyle() {
    if (homePageHiddenStyleEl)
      return
    document.documentElement.classList.add('bewly-custom-homepage')
    homePageHiddenStyleEl = injectCSS(`
      html,
      body {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }
      body > #app,
      body > #i_cecream,
      .bilibili-gate-root {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
      }
      body > .bili-header {
        position: relative !important;
        left: 0 !important;
        pointer-events: auto !important;
      }
    `)
  }

  function applyAppRouteLayout(
    container: HTMLElement | null = mountedVueContainer,
    root: HTMLElement | null = mountedVueRoot,
  ) {
    if (!container || !root)
      return

    const useViewportLayout = !isInIframe() && isHomePage()
    if (useViewportLayout) {
      Object.assign(container.style, {
        position: 'fixed',
        inset: '0',
        width: 'auto',
        minWidth: '0',
        maxWidth: 'none',
        height: '100dvh',
        overflow: 'hidden',
      })
      Object.assign(root.style, {
        width: '100%',
        height: '100%',
        minWidth: '0',
      })
      return
    }

    for (const property of ['position', 'inset', 'width', 'min-width', 'max-width', 'height', 'overflow'])
      container.style.removeProperty(property)
    for (const property of ['width', 'height', 'min-width'])
      root.style.removeProperty(property)
  }

  function syncHomePageHiddenStyleScope() {
    applyAppRouteLayout()
    const shouldHideOriginalHome = settingsBootLoaded
      && mountedVueApp !== null
      && !isInIframe()
      && isHomePage()
    if (shouldHideOriginalHome)
      ensureHomePageHiddenStyle()
    else
      removeHomePageHiddenStyle()
  }

  function restoreOriginalPageVisibility() {
    bootOverlay?.reveal()
    removeBeforeLoadedStyleEl()
    removeOriginalTopBarBootStyle()
    removeHomePageHiddenStyle()
    document.documentElement.classList.remove('bewly-design', 'bewly-video-dark-only', 'remove-top-bar')
    document.documentElement.removeAttribute(EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE)
    resetBilibiliTopBarInlineStyles(document)
  }

  restoreOriginalPageVisibilityOwner = restoreOriginalPageVisibility
  contentScriptDisposers.push(() => {
    restoreOriginalPageVisibility()
    if (restoreOriginalPageVisibilityOwner === restoreOriginalPageVisibility)
      restoreOriginalPageVisibilityOwner = null
  })

  window.addEventListener(BEWLY_MOUNTED, () => {
    removeBeforeLoadedStyleEl()
    // 根据设置应用默认播放器模式
    if (isVideoPage())
      applyDefaultPlayerMode()
  }, { signal: contentScriptSignal })

  // 应用默认播放器模式
  function isVideoOwnerAvatarReady() {
    return Array.from(document.querySelectorAll<HTMLImageElement>(videoOwnerAvatarSelector)).some((image) => {
      if (!image.isConnected || !image.complete || image.naturalWidth <= 0)
        return false

      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0)
        return false

      const style = getComputedStyle(image)
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
    })
  }

  function applyDefaultPlayerMode() {
    if (!isVideoOrBangumiPage()) {
      clearPlayerModeRetry()
      exitBewlyWidescreen()
      return
    }

    // 后台新标签页中，load / pageshow 可能早于 B 站播放器和评论组件恢复。
    // 先等设置和可见状态，默认 Bewly 宽屏则立即用遮罩盖住原始布局。
    if (!playerModeSettingsReady
      || document.visibilityState !== 'visible') {
      clearPlayerModeRetry()
      return
    }

    const currentNavigationKey = getVideoNavigationKey(location.href)
    if (lastAppliedPlayerModeNavigationKey === currentNavigationKey)
      return

    let targetPlayerMode = resolveDefaultVideoPlayerMode()
    if (isFestivalPage() && targetPlayerMode === 'bewlyWidescreen')
      targetPlayerMode = 'widescreen'

    const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null }
    const isInFullscreen = !!(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement)
    const webFullscreenBtn = document.querySelector('.bpx-player-ctrl-web,.bilibili-player-video-web-fullscreen') as HTMLElement
    const isInWebFullscreen = webFullscreenBtn?.classList.contains('bpx-state-entered')

    if (targetPlayerMode === 'bewlyWidescreen' && !isInFullscreen && !isInWebFullscreen) {
      prepareBewlyWidescreenLoading(
        autoContinuationNavigationKey === currentNavigationKey,
      )
    }
    else if (!isBewlyWidescreenActive()) {
      exitBewlyWidescreen()
    }

    if (document.readyState !== 'complete') {
      clearPlayerModeRetry()
      return
    }

    const settleDelay = playerModeReadyAfter - Date.now()
    if (settleDelay > 0) {
      schedulePlayerModeRetry(settleDelay)
      return
    }

    // 普通视频页以 UP 主头像完成图片加载和布局作为 B 站主体渲染完成信号。
    // 番剧、活动页等可能没有该头像；普通视频异常时也在超时后继续，避免永久阻塞。
    if (isVideoPage()
      && Date.now() < videoOwnerAvatarReadyDeadline
      && !isVideoOwnerAvatarReady()) {
      schedulePlayerModeRetry()
      return
    }

    // 如果播放器已经在全屏状态，跳过应用模式（避免互动视频退出全屏）
    if (isInFullscreen || isInWebFullscreen) {
      exitBewlyWidescreen()
      autoContinuationNavigationKey = undefined
      applyDefaultDanmakuState()
      applyDefaultCaptionState()
      lastAppliedPlayerModeNavigationKey = currentNavigationKey
      return
    }

    if (!isPlayerDisplayModeReady(targetPlayerMode)) {
      schedulePlayerModeRetry()
      return
    }

    clearPlayerModeRetry()

    if (!targetPlayerMode || targetPlayerMode === 'default') {
    // 默认模式也需要居中显示
      defaultMode()
    }
    else {
      switch (targetPlayerMode) {
        case 'bewlyWidescreen':
          applyBewlyWidescreen(
            settings.value.bewlyWidescreenSidebarPosition || 'right',
            // 遮罩已在等待阶段挂载，并保持到宽屏布局完成。
            false,
          )
          break
        case 'webFullscreen':
          webFullscreen()
          break
        case 'widescreen':
          widescreen()
          break
      }
    }
    applyDefaultDanmakuState()
    applyDefaultCaptionState()
    if (settings.value.showVerticalVideoZoomButton)
      initVerticalVideoZoom()
    else
      resetVerticalVideoZoom()
    // 应用自动连播设置，延迟更长时间确保播放器完全初始化
    scheduleDetachedTimer(() => {
      applyAutoPlayByVideoType()
    }, 2000)
    // 启动自动退出全屏监听
    scheduleDetachedTimer(() => {
      startAutoExitFullscreenMonitoring()
    }, 2000)
    lastAppliedPlayerModeNavigationKey = currentNavigationKey
    autoContinuationNavigationKey = undefined
    lastVideoEndedAt = 0

    // 延迟添加稍后再看按钮
    scheduleAddWatchLaterButton()
  }

  function clearPlayerModeRetry() {
    if (playerModeRetryTimer) {
      clearTimeout(playerModeRetryTimer)
      playerModeRetryTimer = undefined
    }
  }

  function schedulePlayerModeRetry(delay?: number) {
    if (playerModeRetryTimer)
      return

    playerModeRetryTimer = setTimeout(() => {
      playerModeRetryTimer = undefined
      applyDefaultPlayerMode()
    }, delay ?? 500)
  }

  function waitForPlayerModePageSettle() {
    clearPlayerModeRetry()
    playerModeReadyAfter = Date.now() + playerModeLoadSettleDelay
    videoOwnerAvatarReadyDeadline = Date.now() + videoOwnerAvatarReadyTimeout
  }

  // 延迟添加稍后再看按钮
  function scheduleAddWatchLaterButton() {
  // 如果已经添加过或者设置未启用，直接返回
    if (watchLaterButtonAdded || !settings.value.externalWatchLaterButton) {
      return
    }

    // 等待播放器模式调整和滚动完成
    // RetryTask最多20次*500ms=10s，滚动最多3s，再加1s保险 = 14s
    // 实际上大部分情况会更快完成，这里取一个保守值
    scheduleDetachedTimer(() => {
      if (!watchLaterButtonAdded && settings.value.externalWatchLaterButton) {
        import('~/utils/watchLaterButton').then(({ addWatchLaterButton }) => {
          if (!settings.value.externalWatchLaterButton)
            return
          watchLaterButtonAdded = addWatchLaterButton()
        }).catch(err => console.error('添加稍后再看按钮失败:', err))
      }
    }, 5000) // 5秒后添加，确保页面已完全稳定
  }

  // 初始化随机播放功能
  function initRandomPlayFeature() {
  // 只在视频页面初始化随机播放功能
    if (isCustomPlayPage() && settings.value.enableRandomPlay) {
      initRandomPlay()
    }
  }

  function getVideoNavigationKey(url: string) {
    try {
      const urlObj = new URL(url)
      if (!isVideoOrBangumiPage(urlObj.href))
        return ''

      const semanticParams = [
        'avid',
        'bvid',
        'cid',
        'ep_id',
        'p',
        'page',
        'season_id',
      ]
      const params = new URLSearchParams()

      for (const param of semanticParams) {
        const value = urlObj.searchParams.get(param)
        if (value !== null)
          params.set(param, value)
      }

      const query = params.toString()
      return `${urlObj.origin}${urlObj.pathname}${query ? `?${query}` : ''}`
    }
    catch {
      return url.split('?')[0].split('#')[0]
    }
  }

  function getPushStateTargetUrl(event: Event) {
    if (!(event instanceof CustomEvent) || !Array.isArray(event.detail))
      return null

    const targetUrl = event.detail[2]
    if (typeof targetUrl !== 'string' && !(targetUrl instanceof URL))
      return null

    try {
      return new URL(String(targetUrl), location.href).href
    }
    catch {
      return null
    }
  }

  function clearPendingWidescreenReloadNavigation() {
    pendingWidescreenReloadNavigationKey = undefined
    if (pendingWidescreenReloadTimer) {
      clearTimeout(pendingWidescreenReloadTimer)
      pendingWidescreenReloadTimer = undefined
    }
  }

  const commentRootSelector = '#commentapp, #comment-module, #comment-body, .commentapp, .comment-container, .bili-comment-container, .bb-comment'
  const widescreenCommentReloadRetryInterval = 250
  const widescreenCommentReloadRetryTimeout = 10_000
  let widescreenCommentReloadRequestId = 0

  type VideoCommentIdentifier = { bvid: string } | { aid: string }

  function getVideoCommentIdentifier(url = location.href): VideoCommentIdentifier | null {
    try {
      const urlObj = new URL(url)

      const queryBvid = urlObj.searchParams.get('bvid')
      if (queryBvid && /^BV[0-9A-Za-z]+$/.test(queryBvid))
        return { bvid: queryBvid }

      const queryAid = urlObj.searchParams.get('avid') ?? urlObj.searchParams.get('aid')
      if (queryAid && /^\d+$/.test(queryAid)) {
        const aid = Number(queryAid)
        if (Number.isSafeInteger(aid) && aid > 0)
          return { aid: String(aid) }
      }

      if (!/^\/video\//.test(urlObj.pathname))
        return null

      const bvidPathMatch = urlObj.pathname.match(/^\/video\/(BV[0-9A-Za-z]+)(?:\/|$)/)
      if (bvidPathMatch)
        return { bvid: bvidPathMatch[1] }

      const aidPathMatch = urlObj.pathname.match(/^\/video\/av(\d+)(?:\/|$)/i)
      if (aidPathMatch) {
        const aid = Number(aidPathMatch[1])
        if (Number.isSafeInteger(aid) && aid > 0)
          return { aid: String(aid) }
      }

      return null
    }
    catch {
      return null
    }
  }

  function getCommentParamsWithAid(element: Element, aid: number): string | null {
    const currentParams = element.getAttribute('data-params')
    if (!currentParams)
      return null

    const params = currentParams.split(',')
    if (params.length < 2 || !/^\d+$/.test(params[1].trim()))
      return null

    params[1] = String(aid)
    return params.join(',')
  }

  function findVideoCommentsElement(): HTMLElement | null {
    const commentRoot = document.querySelector<HTMLElement>(commentRootSelector)
    if (!commentRoot)
      return null

    return commentRoot.querySelector<HTMLElement>(':scope > bili-comments')
      ?? commentRoot.querySelector<HTMLElement>('bili-comments')
  }

  function replaceVideoCommentsElement(element: HTMLElement, dataParams: string) {
    const replacement = document.createElement(element.tagName.toLowerCase())
    for (const attribute of Array.from(element.attributes))
      replacement.setAttribute(attribute.name, attribute.value)
    replacement.setAttribute('data-params', dataParams)
    element.replaceWith(replacement)
  }

  async function reloadCommentsForWidescreenNavigation(targetNavigationKey: string, requestId: number, identifier: VideoCommentIdentifier) {
    let response: { code?: number, data?: { aid?: unknown } }
    try {
      response = await api.video.getVideoInfo(identifier)
    }
    catch {
      return
    }

    if (requestId !== widescreenCommentReloadRequestId
      || getVideoNavigationKey(location.href) !== targetNavigationKey
      || response?.code !== 0) {
      return
    }

    const aid = Number(response.data?.aid)
    if (!Number.isSafeInteger(aid) || aid <= 0)
      return

    const deadline = Date.now() + widescreenCommentReloadRetryTimeout
    const retryUntilCommentReady = () => {
      if (requestId !== widescreenCommentReloadRequestId
        || getVideoNavigationKey(location.href) !== targetNavigationKey) {
        return
      }

      const comments = findVideoCommentsElement()
      if (comments) {
        const nextParams = getCommentParamsWithAid(comments, aid)
        if (nextParams) {
          const currentParams = comments.getAttribute('data-params')
          const currentAid = Number(currentParams?.split(',')[1]?.trim())
          if (Number.isSafeInteger(currentAid) && currentAid === aid)
            return

          replaceVideoCommentsElement(comments, nextParams)
          return
        }
      }

      if (Date.now() < deadline)
        scheduleDetachedTimer(retryUntilCommentReady, widescreenCommentReloadRetryInterval)
    }

    retryUntilCommentReady()
  }

  function prepareVideoNavigationBeforeRouteChange(event: Event) {
    const wasBewlyWidescreenActive = isBewlyWidescreenActive()
    if (!wasBewlyWidescreenActive)
      return

    const targetUrl = getPushStateTargetUrl(event)
    if (!targetUrl)
      return

    const currentNavigationKey = getVideoNavigationKey(location.href)
    const nextNavigationKey = getVideoNavigationKey(targetUrl)
    if (!nextNavigationKey || nextNavigationKey === currentNavigationKey)
      return

    clearPendingWidescreenReloadNavigation()
    pendingWidescreenReloadNavigationKey = nextNavigationKey
    const video = getVideoElement()
    const remainingPlaybackTime = video && Number.isFinite(video.duration)
      ? video.duration - video.currentTime
      : Number.POSITIVE_INFINITY
    autoContinuationNavigationKey = video?.ended || remainingPlaybackTime <= 1
      ? nextNavigationKey
      : undefined
    pendingWidescreenReloadTimer = setTimeout(() => {
      pendingWidescreenReloadNavigationKey = undefined
      pendingWidescreenReloadTimer = undefined
    }, 5000)
    clearPlayerModeRetry()
    // 先退出宽屏，再让 B 站执行原本的 SPA 路由切换；真正 URL 变化后由
    // checkForUrlChanges 复用 SPA 路由并按需重载评论区。
    exitBewlyWidescreen()
  }

  function checkForUrlChanges() {
    if (location.href !== lastUrl) {
      const navigationRequestId = ++widescreenCommentReloadRequestId
      const currentVideoNavigationKey = getVideoNavigationKey(location.href)
      const isMeaningfulVideoNavigation = currentVideoNavigationKey !== lastVideoNavigationKey

      lastUrl = location.href
      lastVideoNavigationKey = currentVideoNavigationKey
      if (!shouldShowBewlyBootOverlay(lastUrl, isInIframe()))
        bootOverlay?.reveal()
      syncHomePageHiddenStyleScope()
      if (!settingsBootLoaded)
        return

      recordVideoVisitFromUrl(lastUrl)
      applyBewlyDesignClasses()
      syncFavoriteDialogLifecycle()

      if (!isVideoOrBangumiPage()) {
        clearPendingWidescreenReloadNavigation()
        cancelPlayerRetryTasks()
        stopAutoExitFullscreenMonitoring()
        resetRandomPlayInitialization()
        exitBewlyWidescreen()
        autoContinuationNavigationKey = undefined
        lastAppliedPlayerModeNavigationKey = undefined
      }

      if (isVideoOrBangumiPage()) {
        if (!isMeaningfulVideoNavigation) {
          clearPendingWidescreenReloadNavigation()
          autoContinuationNavigationKey = undefined
          return
        }

        if (!autoContinuationNavigationKey && Date.now() - lastVideoEndedAt <= 5000)
          autoContinuationNavigationKey = currentVideoNavigationKey
        if (autoContinuationNavigationKey !== currentVideoNavigationKey)
          autoContinuationNavigationKey = undefined

        const shouldReloadWidescreenNavigation = pendingWidescreenReloadNavigationKey === currentVideoNavigationKey
          || isBewlyWidescreenActive()
        const videoCommentIdentifier = shouldReloadWidescreenNavigation
          ? getVideoCommentIdentifier()
          : null
        clearPendingWidescreenReloadNavigation()

        if (shouldReloadWidescreenNavigation && !videoCommentIdentifier) {
          exitBewlyWidescreen()
          // 评论区无法可靠映射到视频 ID 时保留完整刷新兜底，避免宽屏 SPA
          // 切换后继续复用旧评论组件（例如番剧页面或异常 URL）。
          window.location.reload()
          return
        }

        exitBewlyWidescreen()
        resetVerticalVideoZoom()
        waitForPlayerModePageSettle()
        document.querySelector('.bewly-watch-later-btn')?.remove()
        watchLaterButtonAdded = false // URL变化时重置稍后再看按钮标志
        resetAutoPlayUserChangeFlag()
        cancelPlayerRetryTasks()
        stopAutoExitFullscreenMonitoring()

        // 重置随机播放初始化状态，避免重复加载
        resetRandomPlayInitialization()

        applyDefaultPlayerMode()
        if (videoCommentIdentifier)
          void reloadCommentsForWidescreenNavigation(currentVideoNavigationKey, navigationRequestId, videoCommentIdentifier)
        // 如果是视频页面内部跳转，延迟执行滚动
        if (isVideoOrBangumiPage()) {
          handleVideoPageNavigation()
        }
        // 重新初始化随机播放功能
        if (isCustomPlayPage() && settings.value.enableRandomPlay) {
          scheduleDetachedTimer(() => {
            initRandomPlayFeature()
          }, 2000) // 延迟2秒初始化，确保页面完全加载
        }
      }
    }
  }

  contentScriptDisposers.push(onRouteChange(checkForUrlChanges))

  function syncFavoriteDialogLifecycle() {
    if (isVideoOrBangumiPage())
      initFavoriteDialogEnhancement()
    else
      stopFavoriteDialogEnhancement()
  }

  // inject/index.ts 在调用 history.pushState 前派发此事件，先退出宽屏；URL
  // 真正变化后由共享 route state 复用 SPA 路由并按需重载评论区。
  window.addEventListener('pushstate', prepareVideoNavigationBeforeRouteChange, { capture: true, signal: contentScriptSignal })
  document.addEventListener('ended', (event) => {
    if (event.target === getVideoElement())
      lastVideoEndedAt = Date.now()
  }, { capture: true, signal: contentScriptSignal })

  // 添加页面加载监听
  window.addEventListener('load', () => {
    if (!settingsBootLoaded)
      return

    waitForPlayerModePageSettle()
    if (isVideoPage()) {
      applyDefaultPlayerMode()
    }
    else if (isVideoOrBangumiPage()) {
      applyDefaultPlayerMode()
    }

    // 初始化自定义播放功能
    if (isCustomPlayPage() && settings.value.enableRandomPlay) {
      scheduleDetachedTimer(() => {
        initRandomPlayFeature()
      }, 3000) // 延迟3秒初始化，确保页面完全加载
    }

    // 添加搜索页面视频卡片链接点击事件处理
    if (/https?:\/\/search\.bilibili\.com\.*/.test(location.href))
      setupBiliVideoCardLinkClickHandler()
  }, { signal: contentScriptSignal })

  // B 站原生视频卡片会在多个页面复用，统一监听稍后再看操作并同步顶栏状态。
  const nativeWatchLaterListSelector = '.watch-later-list, .watchlater-list, [class*="watch-later-list"], [class*="watchlater-list"], bili-watch-later-list'
  const nativeWatchLaterItemSelector = '.av-item, [class*="watch-later-item"], [class*="watchlater-item"], [class*="av-item"], bili-watch-later-item'
  const nativeWatchLaterDeleteControlSelector = '.del, .delete, .d-btn, [class*="delete"], [class*="remove"], [aria-label*="删除"], [aria-label*="移除"], [title*="删除"], [title*="移除"], [data-action*="delete"]'
  let nativeWatchLaterSyncTimer: ReturnType<typeof setTimeout> | undefined
  let nativeWatchLaterLastSyncAt = 0
  let nativeWatchLaterListObserver: MutationObserver | null = null

  function scheduleNativeWatchLaterStateSync(force = false) {
    const topBarStore = useTopBarStore()
    const accountId = topBarStore.userInfo.mid
    if (!accountId)
      return

    if (nativeWatchLaterSyncTimer) {
      if (!force)
        return
      clearTimeout(nativeWatchLaterSyncTimer)
      nativeWatchLaterSyncTimer = undefined
    }

    if (!force && Date.now() - nativeWatchLaterLastSyncAt < 2500)
      return

    nativeWatchLaterSyncTimer = setTimeout(() => {
      nativeWatchLaterSyncTimer = undefined
      nativeWatchLaterLastSyncAt = Date.now()

      void topBarStore.invalidateWatchLaterMembership(accountId).catch((error) => {
        if (!isExtensionContextInvalidatedError(error))
          console.error('使稍后再看成员状态失效失败:', error)
      })
    }, 800)
  }

  function isNativeWatchLaterDeleteControl(element: Element, eventPath: EventTarget[]) {
    const control = element.closest(nativeWatchLaterDeleteControlSelector)
    const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`
    if (!control && !/删除|移除/u.test(label))
      return false

    if (control?.closest(nativeWatchLaterListSelector) || element.closest(nativeWatchLaterListSelector))
      return true

    // 自定义元素的删除按钮可能位于 B 站 shadow root 内，无法用 closest() 找到宿主；
    // 页面本身是稍后再看列表时可放宽判断，但排除 Bewly 自己的 shadow root。
    return !eventPath.some(target => target instanceof Element && target.id === 'bewly')
  }

  function isNativeWatchLaterListMutation(mutation: MutationRecord) {
    const target = mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement
    if (!target?.closest(nativeWatchLaterListSelector))
      return false

    return [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some((node) => {
      const element = node instanceof Element ? node : node.parentElement
      return !!element?.matches(nativeWatchLaterItemSelector)
        || !!element?.querySelector(nativeWatchLaterItemSelector)
    })
  }

  function setupNativeWatchLaterStateSync() {
    document.addEventListener('click', (event) => {
      const eventPath = event.composedPath()
      const watchLaterButton = eventPath.find(
        (target): target is Element => target instanceof Element
          && target.matches('.bili-watch-later, .bili-watch-later--wrap, .bili-watch-later__icon'),
      )
      const isWatchLaterDelete = isWatchLaterListPage(location.href)
        && eventPath.some(target => target instanceof Element
          && isNativeWatchLaterDeleteControl(target, eventPath))

      if (watchLaterButton || isWatchLaterDelete)
        scheduleNativeWatchLaterStateSync(true)
    }, { capture: true, signal: contentScriptSignal })

    const observer = new MutationObserver((mutations) => {
      if (!isWatchLaterListPage(location.href)
        || !mutations.some(isNativeWatchLaterListMutation)) {
        return
      }

      scheduleNativeWatchLaterStateSync()
    })
    nativeWatchLaterListObserver = observer

    const syncNativeWatchLaterListObserver = () => {
      observer.disconnect()
      if (document.documentElement && isWatchLaterListPage(location.href))
        observer.observe(document.documentElement, { childList: true, subtree: true })
    }
    if (document.documentElement) {
      contentScriptDisposers.push(onRouteChange(syncNativeWatchLaterListObserver, true))
    }
    else {
      window.addEventListener('DOMContentLoaded', () => {
        contentScriptDisposers.push(onRouteChange(syncNativeWatchLaterListObserver, true))
      }, { once: true, signal: contentScriptSignal })
    }
  }

  setupNativeWatchLaterStateSync()
  contentScriptDisposers.push(() => {
    nativeWatchLaterListObserver?.disconnect()
    nativeWatchLaterListObserver = null
    if (nativeWatchLaterSyncTimer) {
      clearTimeout(nativeWatchLaterSyncTimer)
      nativeWatchLaterSyncTimer = undefined
    }
  })

  // 添加搜索页 bili-video-card 链接点击事件处理
  function setupBiliVideoCardLinkClickHandler() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement

      const linkElement = target.closest('.bili-video-card a, .bili-video-card__wrap a')

      if (linkElement instanceof HTMLAnchorElement) {
        if (!(event instanceof MouseEvent) || event.button !== 0 || hasNavigationModifier(event))
          return
        event.preventDefault()

        const href = linkElement.href
        const action = resolveLinkOpenAction(settings.value.videoCardLinkOpenMode, {
          isHomepage: isHomePage(),
          inIframe: isInIframe(),
        })
        executeResolvedLinkAction(action, href, {
          currentTab: url => window.location.assign(url),
          newTab: openLinkToNewTab,
          background: url => void openLinkInBackground(url),
          drawer: openLinkToNewTab,
        })
      }
    }, { capture: true, signal: contentScriptSignal })
  }
  let playerModeResumeFrame: number | undefined
  function queuePlayerModeResume() {
    if (playerModeResumeFrame !== undefined)
      return
    playerModeResumeFrame = requestAnimationFrame(() => {
      playerModeResumeFrame = undefined
      if (document.visibilityState !== 'visible' || !isVideoOrBangumiPage())
        return
      waitForPlayerModePageSettle()
      applyDefaultPlayerMode()
    })
  }

  window.addEventListener('pageshow', queuePlayerModeResume, { signal: contentScriptSignal })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      queuePlayerModeResume()
  }, { signal: contentScriptSignal })
  contentScriptDisposers.push(() => {
    if (playerModeResumeFrame !== undefined) {
      cancelAnimationFrame(playerModeResumeFrame)
      playerModeResumeFrame = undefined
    }
    clearPlayerModeRetry()
    clearPendingWidescreenReloadNavigation()
    widescreenCommentReloadRequestId++
  })

  async function onDOMLoaded() {
    let changeHomePage = false
    try {
      // settingsReady 只在后台权威设置真实加载后解决；degraded 状态保留原站可用。
      await settingsReady
      if (!canStartSettingsDependentBoot(settingsInitializationState.value, contentScriptSignal.aborted))
        return

      settingsBootLoaded = true
      applySettingsDependentPageStyles()
      changeHomePage = !isInIframe() && isHomePage()
      const shouldMountApp = isSupportedPages() || isSupportedIframePages()
      const initialTopBarSource = resolveEffectiveTopBarSource(
        settings.value.pageMode,
        settings.value.useOriginalBilibiliTopBar,
      )
      applyEffectiveTopBarSource(document, initialTopBarSource)

      if (shouldMountApp) {
        installOriginalTopBarBootStyle()
        installBeforeLoadedStyle()
      }

      if (changeHomePage) {
        ensureResponsiveViewport(document)
        captureOriginalBilibiliTopBar(document)
        ensureHomePageHiddenStyle()
      }

      if (shouldMountApp) {
        if (isHomePage())
          injectApp()
        else
          await injectAppWhenIdle()
      }

      if (contentScriptSignal.aborted || (shouldMountApp && mountedVueApp === null))
        return

      syncHomePageHiddenStyleScope()
      initVideoAspectRatioMemory()
      initVideoScreenshotControl()
      initBewlyWidescreenControl()
      initTouchPlayerGestures()
      syncFavoriteDialogLifecycle()
      initNativeFavoriteSeasonPlayAllIntercept()
    }
    catch (error) {
      restoreOriginalPageVisibility()
      if (!isExtensionContextInvalidatedError(error))
        console.error('[Bewly Nocturne] Failed to bootstrap the content script:', error)
    }
    finally {
      removeBeforeLoadedStyleEl()
      removeOriginalTopBarBootStyle()
      if (mountedVueApp === null)
        bootOverlay?.reveal()
      if (changeHomePage && mountedVueApp === null)
        removeHomePageHiddenStyle()
    }
  }

  if (document.readyState !== 'loading') {
    void onDOMLoaded()
  }
  else {
    document.addEventListener('DOMContentLoaded', () => {
      void onDOMLoaded()
    }, { once: true, signal: contentScriptSignal })
  }

  function injectAppWhenIdle() {
    return new Promise<void>((resolve, reject) => {
      const idleTask = runWhenIdle(() => {
        if (contentScriptSignal.aborted) {
          resolve()
          return
        }
        try {
          injectApp()
          resolve()
        }
        catch (error) {
          reject(error)
        }
      })
      contentScriptDisposers.push(() => {
        idleTask.dispose()
        resolve()
      })
    })
  }

  function injectApp() {
    unmountInjectedApp()
    document.querySelectorAll('#bewly').forEach(el => el.remove())

    // mount component to context window
    const container = document.createElement('div')
    container.id = 'bewly'
    container.setAttribute('data-version', version)
    container.setAttribute('data-dev', import.meta.env.DEV ? 'true' : 'false')
    container.classList.toggle('dark', document.documentElement.classList.contains('dark'))
    container.classList.toggle('oled-dark', document.documentElement.classList.contains('oled-dark'))

    // 立即设置Shadow DOM容器的基准颜色，确保Vue组件能够访问到正确的CSS变量
    if (settings.value.darkModeBaseColor) {
      container.style.setProperty('--bew-dark-base-color', settings.value.darkModeBaseColor)
    }

    const root = document.createElement('div')
    const useViewportLayout = !isInIframe() && isHomePage()
    applyAppRouteLayout(container, root)

    const styleEl = document.createElement('link')
    // Fix #69 https://github.com/hakadao/BewlyBewly/issues/69
    // https://medium.com/@emilio_martinez/shadow-dom-open-vs-closed-1a8cf286088a - open shadow dom
    const shadowDOM = container.attachShadow?.({ mode: 'open' }) || container
    const resetStyleEl = document.createElement('style')
    resetStyleEl.textContent = `${RESET_BEWLY_CSS}`
    styleEl.setAttribute('rel', 'stylesheet')
    styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'))
    shadowDOM.appendChild(resetStyleEl)
    shadowDOM.appendChild(styleEl)
    shadowDOM.appendChild(root)

    const app = createApp(App)
    setupApp(app)
    let isAppMounted = false

    // 样式就绪前隐藏整个 Shadow DOM，避免未应用样式的内容闪现。
    // 就绪后一次性展示，避免容器淡入与页面样式透明度叠加，造成内容延迟出现。
    container.style.visibility = 'hidden'
    let styleLoaded = false
    let styleSettled = false
    let styleLoadFailsafeTimer: ReturnType<typeof setTimeout> | undefined
    const clearStyleLoadFailsafe = () => {
      if (styleLoadFailsafeTimer !== undefined)
        clearTimeout(styleLoadFailsafeTimer)
      styleLoadFailsafeTimer = undefined
    }
    const activateHomePageAfterStyles = () => {
      if (!styleLoaded || !isAppMounted || !useViewportLayout)
        return
      cleanupBilibiliScripts()
      const topBarSource = resolveEffectiveTopBarSource(
        settings.value.pageMode,
        settings.value.useOriginalBilibiliTopBar,
      )
      if (topBarSource === 'bilibili-native')
        ensureOriginalBilibiliTopBarAppended(document)
      ensureLoginButtonClickHandlers()
    }
    const revealContainer = () => {
      styleLoaded = true
      styleSettled = true
      clearStyleLoadFailsafe()
      container.style.visibility = 'visible'
      activateHomePageAfterStyles()
      requestAnimationFrame(() => bootOverlay?.reveal())
    }

    const handleStyleFailure = () => {
      if (styleSettled)
        return
      styleSettled = true
      clearStyleLoadFailsafe()
      if (isAppMounted && mountedVueApp === app) {
        try {
          app.unmount()
        }
        catch {
          // Continue restoring the original page even if Vue teardown fails.
        }
        mountedVueApp = null
        mountedVueContainer = null
        mountedVueRoot = null
      }
      container.remove()
      restoreOriginalPageVisibility()
    }
    styleEl.addEventListener('load', revealContainer, { once: true })
    styleEl.addEventListener('error', handleStyleFailure, { once: true })

    // startShadowDOMStyleInjection()

    // inject svg icons
    const svgDiv = document.createElement('div')
    svgDiv.innerHTML = SVG_ICONS
    shadowDOM.appendChild(svgDiv)

    document.body.appendChild(container)

    try {
      app.mount(root)
      isAppMounted = true
      mountedVueApp = app
      mountedVueContainer = container
      mountedVueRoot = root
      activateHomePageAfterStyles()
      if (!styleSettled) {
        styleLoadFailsafeTimer = setTimeout(handleStyleFailure, 8000)
        contentScriptDisposers.push(clearStyleLoadFailsafe)
      }
    }
    catch (error) {
      container.remove()
      throw error
    }
  }

  contentScriptDisposers.push(watch(
    [
      () => settings.value.enableRandomPlay,
      () => settings.value.randomPlayMode,
      () => settings.value.minVideosForRandom,
      () => settings.value.defaultCustomPlayOrder,
      () => settings.value.enableCustomPlayOrderOverrides,
      () => settings.value.customPlayOrderOverrides.multipart,
      () => settings.value.customPlayOrderOverrides.collection,
      () => settings.value.customPlayOrderOverrides.watchLater,
      () => settings.value.customPlayOrderOverrides.playlist,
    ],
    ([enabled, activationMode, minVideos, ...orderSettings], [previousEnabled, previousActivationMode, previousMinVideos, ...previousOrderSettings]) => {
      if (enabled !== previousEnabled && isCustomPlayPage()) {
        if (enabled) {
          scheduleDetachedTimer(() => {
            initRandomPlayFeature()
          }, 1000)
        }
        else {
          destroyRandomPlay()
        }
      }

      if (orderSettings.some((value, index) => value !== previousOrderSettings[index])) {
        syncRandomPlayOrder()
        applyRandomPlayActivationSettings()
      }

      if (
        activationMode !== previousActivationMode
        || minVideos !== previousMinVideos
      ) {
        applyRandomPlayActivationSettings()
      }
    },
  ))

  contentScriptDisposers.push(watch(
    () => settings.value.showVerticalVideoZoomButton,
    (enabled) => {
      if (enabled && isVideoOrBangumiPage())
        initVerticalVideoZoom()
      else
        resetVerticalVideoZoom()
    },
  ))

  contentScriptDisposers.push(watch(
    () => settings.value.language,
    () => syncRandomPlayUI(),
  ))

  // 监听设置变化
  contentScriptDisposers.push(watch(settings, (newSettings, oldSettings) => {
    sendSettingsToPage(newSettings)

    // 监听自动播放设置变化
    if (isCustomPlayPage()) {
    // 检查自动播放相关设置是否发生变化
      const autoPlaySettingsChanged = oldSettings && (
        newSettings.useBilibiliDefaultAutoPlay !== oldSettings.useBilibiliDefaultAutoPlay
        || newSettings.enableRandomPlay !== oldSettings.enableRandomPlay
        || newSettings.autoPlayMultipart !== oldSettings.autoPlayMultipart
        || newSettings.autoPlayCollection !== oldSettings.autoPlayCollection
        || newSettings.autoPlayRecommend !== oldSettings.autoPlayRecommend
        || newSettings.autoPlayWatchLater !== oldSettings.autoPlayWatchLater
        || newSettings.autoPlayPlaylist !== oldSettings.autoPlayPlaylist
      )

      if (autoPlaySettingsChanged) {
      // 自动播放设置发生变化，同步更新页面上的自动播放开关
      // 延迟时间增加，确保页面元素已经渲染
        scheduleDetachedTimer(() => {
          applyAutoPlayByVideoType()
          applyRandomPlayActivationSettings()
        }, 1000)
      }
    }

    // 监听稍后再看按钮外置设置变化
    if (isVideoPage() && oldSettings) {
      if (newSettings.externalWatchLaterButton !== oldSettings.externalWatchLaterButton) {
        if (newSettings.externalWatchLaterButton) {
        // 启用稍后再看按钮
          watchLaterButtonAdded = false // 重置标志
          scheduleAddWatchLaterButton()
        }
        else {
        // 移除稍后再看按钮
          const existingButton = document.querySelector('.bewly-watch-later-btn')
          existingButton?.remove()
          watchLaterButtonAdded = false
        }
      }
    }
  }, { deep: true }))

  // 监听来自父页面的黑暗模式切换消息（用于iframe跨域场景）
  window.addEventListener('message', (event) => {
    const data = getParentMessageData(event, [IFRAME_DARK_MODE_CHANGE, IFRAME_TOP_BAR_CHANGE])
    if (!data)
      return

    const { type, isDark, isOledDark, darkModeBaseColor, useOriginalBilibiliTopBar } = data

    if (type === IFRAME_DARK_MODE_CHANGE) {
      if (typeof isDark !== 'boolean'
        || (isOledDark !== undefined && typeof isOledDark !== 'boolean')
        || (darkModeBaseColor !== undefined && typeof darkModeBaseColor !== 'string')) {
        return
      }
      // Check if we should apply selective dark mode (plugin UI only) on festival pages
      const isSelectiveDark = isFestivalPage()

      if (isDark) {
      // Always apply to plugin container if it exists
        const bewlyElement = document.querySelector('#bewly')
        if (bewlyElement) {
          bewlyElement.classList.add('dark')
          bewlyElement.classList.toggle('oled-dark', isOledDark === true)
        }

        // Only apply global styles if not on festival pages
        if (!isSelectiveDark) {
          document.documentElement.classList.add('dark')
          document.documentElement.classList.toggle('oled-dark', isOledDark === true)
          document.body?.classList.add('dark')
          document.body?.classList.toggle('oled-dark', isOledDark === true)
        }

        // 如果提供了深色模式基准颜色，则应用它
        if (typeof darkModeBaseColor === 'string' && darkModeBaseColor) {
          document.documentElement.style.setProperty('--bew-dark-base-color', darkModeBaseColor)
        }
      }
      else {
        const bewlyElement = document.querySelector('#bewly')
        if (bewlyElement) {
          bewlyElement.classList.remove('dark', 'oled-dark')
        }

        // Only remove global classes if not in selective mode
        if (!isSelectiveDark) {
          document.documentElement.classList.remove('dark', 'oled-dark')
          document.body?.classList.remove('dark', 'oled-dark')
        }
      }
    }
    else if (type === IFRAME_TOP_BAR_CHANGE) {
      if (typeof useOriginalBilibiliTopBar !== 'boolean')
        return

      const source: EffectiveTopBarSource = useOriginalBilibiliTopBar ? 'bilibili-native' : 'bewly'
      applyEffectiveTopBarSource(document, source)
      document.documentElement.classList.toggle('remove-top-bar', source === 'bewly')
      if (source === 'bilibili-native') {
        resetBilibiliTopBarInlineStyles(document)
        // Setup login button click handlers when switching to original top bar
        ensureLoginButtonClickHandlers()
      }
    }
  }, { passive: true, signal: contentScriptSignal })

  // 启动自动播放用户修改监听
  startAutoPlayUserChangeMonitoring()

  // 为 iframe 中运行时添加 ESC 键监听（消息页面、视频页面、动态详情）
  const isMomentDetailPage = /https?:\/\/t\.bilibili\.com\/\d+/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/\d+/.test(currentUrl)
  const isNotificationsDrawer = isNotificationPage() && window.name === 'bewly-notifications-drawer'
  if (isInIframe() && (isNotificationsDrawer || isVideoOrBangumiPage() || isMomentDetailPage)) {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
    // 只处理ESC键
      if (e.key !== 'Escape' && e.code !== 'Escape')
        return

      // 检查当前焦点元素
      const activeElement = document.activeElement
      const tagName = activeElement?.tagName?.toLowerCase()

      // 检查是否是输入框或可编辑元素
      const isInputElement
      = tagName === 'input'
        || tagName === 'textarea'
        || activeElement?.hasAttribute('contenteditable')

      // 如果焦点在输入框内，不处理ESC键，让用户正常使用
      if (isInputElement)
        return

      // 视频页面：检查视频播放器是否处于网页全屏或宽屏状态
      if (isVideoOrBangumiPage()) {
        const webFullBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-web')
        const wideBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-wide')
        const isWebFull = webFullBtn?.classList.contains('bpx-state-entered')
        const isWide = wideBtn?.classList.contains('bpx-state-entered')

        // 如果视频处于网页全屏或宽屏状态，让播放器自己处理ESC
        if (isWebFull || isWide)
          return
      }

      // 焦点不在输入框，通知父窗口关闭抽屉
      e.preventDefault()
      e.stopPropagation()

      postMessageToParent({
        type: 'BEWLY_DRAWER_CLOSE_REQUEST',
        source: 'iframe',
      })
    }, { capture: true, signal: contentScriptSignal }) // 使用捕获阶段
  }
}
