import { useDark } from '~/composables/useDark'
import { syncRouteState } from '~/composables/useRouteState'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { getLinkFallbackPage } from '~/utils/configuredLinkNavigation'
import { IFRAME_SEARCH_REQUEST, parseIframeSearchUrl } from '~/utils/iframeSearch'
import { isHomePage, isInIframe, openLinkToNewTab } from '~/utils/main'
import { buildNativeSearchUrl, getDefaultCustomUseOriginalBiliPage, resolvePluginSearchResultsUsage } from '~/utils/pageMode'
import { resolveSearchOpenAction } from '~/utils/searchNavigationCore'
import type { SearchScope, SearchVideoFilters } from '~/utils/searchUrl'
import { buildPluginSearchResultsUrl, EMPTY_SEARCH_VIDEO_FILTERS } from '~/utils/searchUrl'
import { openLinkInBackground } from '~/utils/tabs'

export { getPluginSearchResultsUrl } from './searchUrl'

/**
 * 构建关键词搜索链接的唯一入口：
 * 开启插件搜索页时跳扩展内搜索页，否则跳 B 站原生搜索页。
 */
export function shouldUsePluginSearchResultsPage(): boolean {
  const customUseOriginalSearchPage = settings.value.dockItemsConfig
    .find(item => item.page === AppPage.Search)
    ?.useOriginalBiliPage ?? getDefaultCustomUseOriginalBiliPage(AppPage.Search)

  return resolvePluginSearchResultsUsage(
    settings.value.pageMode,
    customUseOriginalSearchPage,
    settings.value.usePluginSearchResultsPage,
  )
}

/** Search target for a keyword with an optional scope and video filters (Bewly or native results). */
export function resolveSearchNavigationTarget(keyword: string, scope: SearchScope = 'all', filters: SearchVideoFilters = EMPTY_SEARCH_VIDEO_FILTERS): string {
  const target = buildPluginSearchResultsUrl(keyword, scope, filters)
  return shouldUsePluginSearchResultsPage() ? target : buildNativeSearchUrl(target)
}

function isPluginSearchResultsDestination(destination: string): boolean {
  try {
    const target = new URL(destination)
    return isHomePage(target.toString()) && target.searchParams.get('page') === 'SearchResults'
  }
  catch {
    return false
  }
}

export function openSearchResultsInCurrentTab(destination: string): void {
  if (isPluginSearchResultsDestination(destination) && isHomePage() && !isInIframe()) {
    const target = new URL(destination)
    window.history.pushState(window.history.state, '', `${location.pathname}${target.search}${target.hash}`)
    syncRouteState()
    return
  }

  window.location.assign(destination)
}

let iframeSearchRequestId = 0

export interface SearchNavigationOptions {
  persistHistory?: () => Promise<void>
  fromSearchResultsTopBar?: boolean
}

function persistSearchHistory(options?: SearchNavigationOptions): Promise<void> {
  return options?.persistHistory?.() ?? Promise.resolve()
}

/**
 * 搜索结果打开行为的唯一执行入口。调用方只负责提供已经解析好的目标 URL；
 * 当前页、首页外当前页、新标签页和后台标签页都在这里统一决策。
 */
export function openSearchResults(destination: string, options?: SearchNavigationOptions): void {
  const initialUrl = window.location.href
  const inPlace = options?.fromSearchResultsTopBar && isPluginSearchResultsDestination(initialUrl)
    && isPluginSearchResultsDestination(destination) && !isInIframe()
  const action = inPlace
    ? 'currentTab'
    : resolveSearchOpenAction(
        settings.value.searchBarLinkOpenMode,
        window.location.href,
        isInIframe(),
        getLinkFallbackPage(),
      )

  if (action === 'currentTab') {
    // Commit navigation in the activation task. History must never keep the old
    // page visible or perform a second, stale navigation after its async write.
    // Plugin result pages persist their keyword in the destination document.
    void persistSearchHistory(options).catch(() => undefined)
    if (isInIframe()) {
      const search = parseIframeSearchUrl(destination)
      if (search && useDark().iframeDocument.send({ type: IFRAME_SEARCH_REQUEST, ...search, intent: 'currentTab', requestId: ++iframeSearchRequestId }))
        return
      // A not-yet-bound child cannot navigate the sandboxed top document.
      // Keep the user activation for the explicit destination in a new tab.
      openLinkToNewTab(destination)
    }
    else {
      openSearchResultsInCurrentTab(destination)
    }
  }
  else if (action === 'background') {
    void openLinkInBackground(destination)
    void persistSearchHistory(options).catch(() => undefined)
  }
  else {
    // 新标签页必须仍在原始 user activation 任务中打开，避免被浏览器拦截。
    openLinkToNewTab(destination)
    void persistSearchHistory(options).catch(() => undefined)
  }
}
