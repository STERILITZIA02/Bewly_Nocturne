import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { getDefaultCustomUseOriginalBiliPage, resolvePluginSearchResultsUsage } from '~/utils/pageMode'

export { getPluginSearchResultsUrl } from './searchUrl'

/**
 * 构建关键词搜索链接的唯一入口：
 * 开启插件搜索页时跳扩展内搜索页，否则跳 B 站原生搜索页
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
  const encoded = encodeURIComponent(keyword)

  if (shouldUsePluginSearchResultsPage())
    return `https://www.bilibili.com/?page=SearchResults&keyword=${encoded}`

  return `https://search.bilibili.com/all?keyword=${encoded}`
}
