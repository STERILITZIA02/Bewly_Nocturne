import { getBilibiliLogicalPathname } from '~/utils/bilibiliLocale'

export const IFRAME_SEARCH_REQUEST = 'BEWLY_IFRAME_SEARCH_REQUEST'
const categories = ['all', 'video', 'bangumi', 'media_ft', 'live', 'article', 'user'] as const
export type IframeSearchCategory = typeof categories[number]

export function parseIframeSearch(value: unknown): { keyword: string, category: IframeSearchCategory } | undefined {
  if (!value || typeof value !== 'object')
    return
  const { keyword, category } = value as Record<string, unknown>
  if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 1000
    || typeof category !== 'string' || !categories.includes(category as IframeSearchCategory)) {
    return
  }
  return { keyword: keyword.trim(), category: category as IframeSearchCategory }
}

export function parseIframeSearchUrl(destination: string) {
  try {
    const url = new URL(destination)
    if (url.protocol !== 'https:' || url.port || url.username || url.password)
      return
    if (url.hostname === 'www.bilibili.com' && getBilibiliLogicalPathname(url) === '/' && url.searchParams.get('page') === 'SearchResults')
      return parseIframeSearch({ keyword: url.searchParams.get('keyword'), category: url.searchParams.get('category') || 'all' })
    if (url.hostname === 'search.bilibili.com') {
      const path = url.pathname.replace(/^\/|\/$/g, '') || 'all'
      return parseIframeSearch({ keyword: url.searchParams.get('keyword'), category: path === 'upuser' ? 'user' : path === 'media_bangumi' ? 'bangumi' : path })
    }
  }
  catch {}
}
