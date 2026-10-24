import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { getBilibiliLogicalPathname } from '~/utils/bilibiliLocale'

import type { HomeTabConfigItem } from './homeTabConfig'
import { PRIVATE_CONVERSATION_ROUTE_PARAMS } from './privateConversationRoute'

export function homeTabStateKey(tab: HomeSubPage, requestIdentity: string) {
  return tab === HomeSubPage.ForYou ? `${tab}:${requestIdentity}` : tab
}

export function resolveDefaultAppPage(config: readonly { page: AppPage, visible: boolean }[]): AppPage {
  return config.find(item => item.visible)?.page ?? AppPage.Home
}

export function readHomeRoute(href: string) {
  const url = new URL(href)
  if (!['bilibili.com', 'www.bilibili.com'].includes(url.hostname) || !['/', '/index.html'].includes(getBilibiliLogicalPathname(url)))
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

export interface HomeRouteDefaults {
  page: AppPage
  tab: HomeSubPage
}

export function shouldOmitHomeRouteTab(page: AppPage, tab: HomeSubPage, defaults: HomeRouteDefaults): boolean {
  return page === AppPage.Home && tab === defaults.tab
}

export function shouldOmitHomeRoutePage(page: AppPage, tab: HomeSubPage, defaults: HomeRouteDefaults): boolean {
  return defaults.page === AppPage.Home && shouldOmitHomeRouteTab(page, tab, defaults)
}

export function writeHomeRoute(href: string, page: AppPage, tab: HomeSubPage, defaults?: HomeRouteDefaults): string {
  if (!readHomeRoute(href))
    return href
  const url = new URL(href)
  if (defaults && shouldOmitHomeRoutePage(page, tab, defaults))
    url.searchParams.delete('page')
  else
    url.searchParams.set('page', page)
  if (page !== AppPage.SearchResults) {
    for (const key of ['keyword', 'category', 'user_order', 'user_type', 'search_type', 'live_room_order', 'live_user_order', 'pn'])
      url.searchParams.delete(key)
  }
  if (page !== AppPage.Notifications) {
    for (const key of ['notificationView', ...Object.values(PRIVATE_CONVERSATION_ROUTE_PARAMS)])
      url.searchParams.delete(key)
  }
  if (page === AppPage.Home && !(defaults && shouldOmitHomeRouteTab(page, tab, defaults)))
    url.searchParams.set('tab', tab)
  else
    url.searchParams.delete('tab')
  return url.href
}
