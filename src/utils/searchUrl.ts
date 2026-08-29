const NATIVE_SEARCH_CATEGORY_BY_PATH: Readonly<Record<string, string>> = {
  article: 'article',
  bangumi: 'bangumi',
  live: 'live',
  media_bangumi: 'bangumi',
  media_ft: 'media_ft',
  movie: 'media_ft',
  upuser: 'user',
  user: 'user',
  video: 'video',
}

/**
 * Convert a Bilibili native search URL into Bewly Nocturne's built-in search results
 * URL. Returning null leaves unsupported or keyword-less pages untouched.
 */
export function getPluginSearchResultsUrl(value: string): string | null {
  try {
    const sourceUrl = new URL(value)
    if (
      (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:')
      || sourceUrl.hostname !== 'search.bilibili.com'
    ) {
      return null
    }

    const keyword = sourceUrl.searchParams.get('keyword')?.trim()
    if (!keyword)
      return null

    const targetUrl = new URL('https://www.bilibili.com/')
    targetUrl.searchParams.set('page', 'SearchResults')
    targetUrl.searchParams.set('keyword', keyword)

    const nativePath = sourceUrl.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? 'all'
    const pluginCategory = NATIVE_SEARCH_CATEGORY_BY_PATH[nativePath]
    if (nativePath !== 'all' && !pluginCategory)
      return null
    if (pluginCategory)
      targetUrl.searchParams.set('category', pluginCategory)

    const nativePage = Number(sourceUrl.searchParams.get('page'))
    if (Number.isInteger(nativePage) && nativePage > 1)
      targetUrl.searchParams.set('pn', String(nativePage))

    if (pluginCategory === 'user') {
      const order = sourceUrl.searchParams.get('order')
      const orderSort = sourceUrl.searchParams.get('order_sort')
      if (order === 'fans' || order === 'level')
        targetUrl.searchParams.set('user_order', orderSort === '1' ? `${order}_desc` : order)

      const userType = Number(sourceUrl.searchParams.get('user_type'))
      if (Number.isInteger(userType) && userType >= 1 && userType <= 3)
        targetUrl.searchParams.set('user_type', String(userType))
    }

    if (pluginCategory === 'live') {
      const searchType = sourceUrl.searchParams.get('search_type')
      if (searchType === 'live_room' || searchType === 'live_user')
        targetUrl.searchParams.set('search_type', searchType)
    }

    return targetUrl.toString()
  }
  catch {
    return null
  }
}
