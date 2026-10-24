import './common'
import './shadowDom'
import './thirdParties'

import { watch } from 'vue'

import { onRouteChange } from '~/composables/useRouteState'
import { settings, settingsInitializationState, settingsReady } from '~/logic/storage'
import { toBilibiliLogicalUrl } from '~/utils/bilibiliLocale'
import { isHomePage, isInIframe, isTopicPage, isWatchLaterListPage } from '~/utils/main'

const PAGE_STYLE_CLASSES = [
  'homePage',
  'nativeFeedPage',
  'esportsPage',
  'musicPage',
  'cheesePage',
  'notificationsPage',
  'momentsPage',
  'historyPage',
  'watchLaterPage',
  'notePage',
  'userSpacePage',
  'searchPage',
  'videoPage',
  'animePlaybackAndMoviePage',
  'animePage',
  'channelPage',
  'articlesPage',
  'topicPage',
  'error404Page',
  'creativeCenterPage',
  'accountSettingsPage',
  'premiumPage',
  'loginPage',
] as const

const MOMENTS_ROUTE_CLASSES = [
  'moments-native-feed',
  'moments-original-components-ready',
  'moments-hide-original-user-card',
  'moments-hide-original-live-list',
  'moments-hide-original-community-center',
  'moments-hide-original-hot-search',
  'moments-hide-original-up-list',
] as const

let styleSetupRevision = 0
let activeMomentsVisibilityGuard: HTMLStyleElement | undefined
let routeStyle: HTMLStyleElement | undefined

type RouteStyleModule = Promise<{ default: string }>

/**
 * Page styles load as text and only on their own route. Bundled into the
 * manifest sheet they applied everywhere, including Bewly's Shadow root, and
 * their CSS-module selectors (`[class*="…"]` above the subject) made every
 * class change restyle the whole subtree on every page. The element goes first
 * in the document, so native sheets still win ties as they did against the
 * manifest sheet.
 */
function applyRouteStyle(css: string | undefined) {
  if (!css) {
    routeStyle?.remove()
    return
  }
  routeStyle ??= document.createElement('style')
  routeStyle.dataset.bewlyRouteStyle = ''
  if (routeStyle.textContent !== css)
    routeStyle.textContent = css
  if (document.documentElement.firstChild !== routeStyle)
    document.documentElement.prepend(routeStyle)
}

function waitForSettingsLoadAttempt(): Promise<boolean> {
  if (settingsInitializationState.value !== 'loading')
    return Promise.resolve(settingsInitializationState.value === 'loaded')

  return new Promise((resolve) => {
    const stop = watch(settingsInitializationState, (state) => {
      if (state === 'loading')
        return
      stop()
      resolve(state === 'loaded')
    }, { flush: 'sync' })
  })
}

function clearRouteStyles() {
  const root = document.documentElement
  root.classList.remove(...PAGE_STYLE_CLASSES, ...MOMENTS_ROUTE_CLASSES, 'bewly-notifications-embedded')
  activeMomentsVisibilityGuard?.remove()
  activeMomentsVisibilityGuard = undefined
  applyRouteStyle(undefined)
}

async function setupStyles(currentUrl: string) {
  const revision = ++styleSetupRevision
  const root = document.documentElement
  const isCurrentSetup = () => revision === styleSetupRevision && window.location.href === currentUrl
  const activatePage = (css: string | undefined, ...classNames: string[]) => {
    if (!isCurrentSetup())
      return false

    applyRouteStyle(css)
    root.classList.add(...classNames)
    return true
  }
  const loadStyle = async (style: RouteStyleModule) => (await style).default

  clearRouteStyles()
  const routeUrl = toBilibiliLogicalUrl(currentUrl)

  // homepage 首页
  if (isHomePage(currentUrl)) {
    activatePage(await loadStyle(import('./pages/homePage.scss?inline')), 'homePage')
  }

  // Current category feeds and popular lists share native video cards.
  else if (/^https?:\/\/www\.bilibili\.com\/(?:c\/|v\/popular(?:[/?#]|$))/.test(routeUrl)) {
    activatePage(undefined, 'nativeFeedPage')
  }

  else if (/^https?:\/\/music\.bilibili\.com\/pc\/music-center(?:[/?#]|$)/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/musicPage.scss?inline')), 'musicPage')
  }

  else if (/^https?:\/\/www\.bilibili\.com\/v\/game\/match(?:[/?#]|$)/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/esportsPage.scss?inline')), 'esportsPage')
  }

  else if (/^https?:\/\/www\.bilibili\.com\/cheese(?:[/?#]|$)/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/nativeSites.scss?inline')), 'cheesePage')
  }

  // notifications page 消息页
  else if (/https?:\/\/message\.bilibili\.com\/.*/.test(routeUrl)) {
    const css = await loadStyle(import('./pages/notificationsPage.scss?inline'))
    if (!activatePage(css, 'notificationsPage'))
      return

    const isEmbeddedNotificationsPage = isInIframe()
      && window.name === 'bewly-notifications-page'
    if (isEmbeddedNotificationsPage) {
      root.classList.add('bewly-notifications-embedded', 'remove-top-bar-without-placeholder')
    }
  }

  // moments page, new articles page 动态页, 新版专栏页
  else if (
    // moments
    /https?:\/\/t\.bilibili\.com\/.*/.test(routeUrl)
    // moment detail, new articles page
    || /https?:\/\/www\.bilibili\.com\/opus\/.*/.test(routeUrl)
  ) {
    const css = await loadStyle(import('./pages/momentsPage.scss?inline'))
    if (!activatePage(css, 'momentsPage'))
      return

    const isOriginalMomentsFeed = /^https?:\/\/t\.bilibili\.com\/?(?:[?#].*)?$/.test(routeUrl)
    root.classList.toggle('moments-native-feed', isOriginalMomentsFeed)
    let initialVisibilityGuard: HTMLStyleElement | undefined
    if (isOriginalMomentsFeed) {
      // storage 是异步读取的。先让可选区域不可见，等真实设置和正式样式同时就绪后再显示，
      // 避免用户已经关闭的原生组件在首屏短暂闪现。
      initialVisibilityGuard = document.createElement('style')
      initialVisibilityGuard.dataset.bewlyMomentsInitialVisibility = ''
      initialVisibilityGuard.textContent = `
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.left > section:has(.bili-dyn-my-info),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.left > section:has(.bili-dyn-my-info--skeleton),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.left > section:has(.bili-dyn-live-users),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.bili-dyn-banner),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.bili-dyn-topic-box),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.bili-dyn-search-trendings),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.topic-panel),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > main > section:has(.bili-dyn-up-list),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-my-info,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-my-info--skeleton,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-live-users,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-banner,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-topic-box,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-search-trendings,
        html.momentsPage:not(.moments-original-components-ready) .topic-panel,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-up-list {
          visibility: hidden !important;
        }
      `
      root.appendChild(initialVisibilityGuard)
      activeMomentsVisibilityGuard = initialVisibilityGuard
    }

    const applyOriginalMomentsVisibility = () => {
      if (!isCurrentSetup() || !isOriginalMomentsFeed)
        return

      root.classList.toggle('moments-hide-original-user-card', !settings.value.originalMomentsShowUserCard)
      root.classList.toggle('moments-hide-original-live-list', !settings.value.originalMomentsShowLiveList)
      root.classList.toggle('moments-hide-original-community-center', !settings.value.originalMomentsShowCommunityCenter)
      root.classList.toggle('moments-hide-original-hot-search', !settings.value.originalMomentsShowHotSearch)
      root.classList.toggle('moments-hide-original-up-list', !settings.value.originalMomentsShowUpList)
    }

    let settingsLoaded = !isOriginalMomentsFeed
    try {
      settingsLoaded = isOriginalMomentsFeed ? await waitForSettingsLoadAttempt() : true
    }
    finally {
      if (isCurrentSetup() && isOriginalMomentsFeed)
        root.classList.add('moments-original-components-ready')
      initialVisibilityGuard?.remove()
      if (activeMomentsVisibilityGuard === initialVisibilityGuard)
        activeMomentsVisibilityGuard = undefined
    }

    if (!isCurrentSetup())
      return

    if (isOriginalMomentsFeed) {
      if (settingsLoaded) {
        applyOriginalMomentsVisibility()
      }
      else {
        void settingsReady.then(applyOriginalMomentsVisibility)
      }
    }

    // 插件动态页通过抽屉 iframe 打开详情时，隐藏原站冗余布局并聚焦正文。
    const isMomentDetail = /https?:\/\/t\.bilibili\.com\/\d+/.test(routeUrl)
      || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/\d+/.test(routeUrl)
    if (isInIframe() && isMomentDetail)
      root.classList.add('drawer', 'remove-top-bar-without-placeholder')
  }

  // history page 历史记录页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/account\/history.*/.test(routeUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/history.*/.test(routeUrl)
  ) {
    activatePage(await loadStyle(import('./pages/historyPage.scss?inline')), 'historyPage')
  }

  // watch later page 稍候再看页
  else if (isWatchLaterListPage(currentUrl)) {
    activatePage(await loadStyle(import('./pages/watchLaterPage.scss?inline')), 'watchLaterPage')
  }

  // user note page 笔记页
  else if (/^https?:\/\/space\.bilibili\.com\/v\/note-list/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/notePage.scss?inline')), 'notePage')
  }

  // user space page 空间页
  else if (/^https?:\/\/space\.bilibili\.com(?:\/|$).*/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/userSpacePage.scss?inline')), 'userSpacePage')
  }

  // search page 搜索结果页
  else if (/^https?:\/\/search\.bilibili\.com(?:\/|$).*/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/searchPage.scss?inline')), 'searchPage')
  }

  // video page 视频页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/video\/.*/.test(routeUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater.*/.test(routeUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(routeUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/medialist\/play\/.*/.test(routeUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/.*/.test(routeUrl)
  ) {
    activatePage(await loadStyle(import('./pages/videoPage.scss?inline')), 'videoPage')
  }

  else if (/https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/.*/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/animePlayback&MoviePage.scss?inline')), 'animePlaybackAndMoviePage')
  }

  // anime page & chinese anime page 番剧页 与 国创动漫
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/(?:anime|guochuang).*/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/animePage.scss?inline')), 'animePage')
  }

  // channel page e.g. tv shows, movie, variety shows & mooc pages 分区页
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/(?:tv|movie|variety|mooc|documentary).*/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/channelPage.scss?inline')), 'channelPage')
  }

  // articles, articles list & articles ranking pages 专栏页, 专栏列表页, 专栏排行榜页
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/read.*/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/articlesPage.scss?inline')), 'articlesPage')
  }

  // topic page 话题页（真实链接为 /v/topic/detail?topic_id=…）
  else if (isTopicPage(currentUrl)) {
    activatePage(await loadStyle(import('./pages/topicPage.scss?inline')), 'topicPage')
  }

  // 404 page 404页
  else if (/^https?:\/\/(?:www\.)?bilibili\.com\/404.*$/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/error404Page.scss?inline')), 'error404Page')
  }

  // creative center page 创作中心页
  else if (/^https?:\/\/member\.bilibili\.com\/platform.*$/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/creativeCenterPage.scss?inline')), 'creativeCenterPage')
  }

  // account settings page 帳戶設定頁，除了大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/(?!big).*$/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/accountSettingsPage.scss?inline')), 'accountSettingsPage')
  }

  // premium page bilibili 大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/big.*$/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/premiumPage.scss?inline')), 'premiumPage')
  }

  // login page 登入頁
  else if (/^https?:\/\/passport\.bilibili\.com\/login.*$/.test(routeUrl)) {
    activatePage(await loadStyle(import('./pages/loginPage.scss?inline')), 'loginPage')
  }
}

const stopAdaptedStylesRouteWatch = onRouteChange(({ href }) => {
  void setupStyles(href)
}, true)

export function stopAdaptedStyles() {
  styleSetupRevision++
  stopAdaptedStylesRouteWatch()
  clearRouteStyles()
}
