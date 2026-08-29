import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { isHomePage, isInIframe, openLinkToNewTab } from '~/utils/main'
import { getDefaultCustomUseOriginalBiliPage, resolvePluginSearchResultsUsage } from '~/utils/pageMode'
import { resolveSearchOpenAction } from '~/utils/searchNavigationCore'
import { openLinkInBackground } from '~/utils/tabs'

export { isActualHomepage, resolveSearchOpenAction } from './searchNavigationCore'
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

export function resolveSearchNavigationTarget(keyword: string): string {
  const normalized = keyword.trim()
  const target = shouldUsePluginSearchResultsPage()
    ? new URL('https://www.bilibili.com/')
    : new URL('https://search.bilibili.com/all')

  if (shouldUsePluginSearchResultsPage())
    target.searchParams.set('page', 'SearchResults')
  if (normalized)
    target.searchParams.set('keyword', normalized)

  return target.toString()
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

function openSearchResultsInCurrentTab(destination: string): void {
  if (isPluginSearchResultsDestination(destination) && isHomePage() && !isInIframe()) {
    const target = new URL(destination)
    window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`)
    return
  }

  if (isInIframe() && window.top) {
    window.top.location.assign(destination)
    return
  }

  window.location.assign(destination)
}

export interface SearchNavigationOptions {
  persistHistory?: () => Promise<void>
}

function persistSearchHistory(options?: SearchNavigationOptions): Promise<void> {
  return options?.persistHistory?.() ?? Promise.resolve()
}

/**
 * 搜索结果打开行为的唯一执行入口。调用方只负责提供已经解析好的目标 URL；
 * 当前页、首页外当前页、新标签页和后台标签页都在这里统一决策。
 */
export function openSearchResults(destination: string, options?: SearchNavigationOptions): void {
  const action = resolveSearchOpenAction(
    settings.value.searchBarLinkOpenMode,
    window.location.href,
    isInIframe(),
  )

  if (action === 'currentTab') {
    // 当前标签页跳转可能卸载 content script，必须先持久化历史。
    void persistSearchHistory(options)
      .catch(() => undefined)
      .then(() => openSearchResultsInCurrentTab(destination))
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
