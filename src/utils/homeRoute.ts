import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'

import type { HomeTabConfigItem } from './homeTabConfig'

export function readHomeRoute(href: string) {
  const url = new URL(href)
  if (!['bilibili.com', 'www.bilibili.com'].includes(url.hostname) || !['/', '/index.html'].includes(url.pathname))
    return null
  const page = url.searchParams.get('page') as AppPage | null
  const tab = url.searchParams.get('tab') as HomeSubPage | null
  return {
    page: page && Object.values(AppPage).includes(page) ? page : null,
    tab: page === AppPage.Home && tab && Object.values(HomeSubPage).includes(tab) ? tab : null,
  }
}

export function resolveHomeTab(tab: HomeSubPage | null, config: readonly HomeTabConfigItem[]) {
  return tab && config.some(item => item.page === tab && item.visible)
    ? tab
    : config.find(item => item.visible)?.page ?? HomeSubPage.ForYou
}

export function writeHomeRoute(href: string, page: AppPage, tab: HomeSubPage): string {
  if (!readHomeRoute(href))
    return href
  const url = new URL(href)
  url.searchParams.set('page', page)
  if (page === AppPage.Home)
    url.searchParams.set('tab', tab)
  else
    url.searchParams.delete('tab')
  return url.href
}
