import { AppPage } from '~/enums/appEnums'

/** Bewly pages that take a keyword handed over from the search bar. */
export const PAGE_SEARCH_PAGES: readonly AppPage[] = [AppPage.Moments, AppPage.Favorites, AppPage.History]

/** One-shot route parameter: the page applies it as its own search and removes it. */
export const PAGE_SEARCH_PARAM = 'q'

export function buildPageSearchHref(page: AppPage, keyword: string): string {
  const url = new URL('https://www.bilibili.com/')
  url.searchParams.set('page', page)
  url.searchParams.set(PAGE_SEARCH_PARAM, keyword.trim())
  return url.href
}
