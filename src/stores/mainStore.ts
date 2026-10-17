import { defineStore } from 'pinia'

import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { getUserID } from '~/utils/main'
import { getDefaultCustomUseOriginalBiliPage } from '~/utils/pageMode'

export interface DockItem {
  i18nKey: string
  icon: string
  iconActivated: string
  page: AppPage
  openInNewTab: boolean
  useOriginalBiliPage: boolean
  url: string
  hasBewlyPage: boolean // Whether BewlyBewly has a page for this item
}

export interface HomeTab {
  i18nKey: string
  page: HomeSubPage
}

export const useMainStore = defineStore('main', () => {
  const dockItems = computed((): DockItem[] => {
    return [
      {
        i18nKey: 'dock.home',
        icon: 'i-tabler:home',
        iconActivated: 'i-tabler:home-filled',
        page: AppPage.Home,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Home),
        url: 'https://www.bilibili.com',
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.search',
        icon: 'i-tabler:search',
        iconActivated: 'i-tabler:search',
        page: AppPage.Search,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Search),
        url: 'https://search.bilibili.com/all',
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.anime',
        icon: 'i-tabler:device-tv',
        iconActivated: 'i-tabler:device-tv-filled',
        page: AppPage.Anime,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Anime),
        url: 'https://www.bilibili.com/anime',
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.favorites',
        icon: 'i-tabler:star',
        iconActivated: 'i-tabler:star-filled',
        page: AppPage.Favorites,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Favorites),
        url: 'https://space.bilibili.com',
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.history',
        icon: 'i-tabler:clock',
        iconActivated: 'i-tabler:clock-filled',
        page: AppPage.History,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.History),
        url: `https://www.bilibili.com/history`,
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.watch_later',
        icon: 'i-tabler:playlist',
        iconActivated: 'i-tabler:playlist',
        page: AppPage.WatchLater,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.WatchLater),
        url: `https://www.bilibili.com/watchlater/list`,
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.moments',
        icon: 'i-tabler:windmill',
        iconActivated: 'i-tabler:windmill-filled',
        page: AppPage.Moments,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Moments),
        url: `https://t.bilibili.com`,
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.notifications',
        icon: 'i-tabler:message-circle',
        iconActivated: 'i-tabler:message-circle-filled',
        page: AppPage.Notifications,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Notifications),
        url: 'https://message.bilibili.com',
        hasBewlyPage: true,
      },
    ]
  })

  const homeTabs = shallowReadonly<HomeTab[]>(
    [
      {
        i18nKey: 'home.for_you',
        page: HomeSubPage.ForYou,
      },
      {
        i18nKey: 'home.following',
        page: HomeSubPage.Following,
      },
      {
        i18nKey: 'home.subscribed_series',
        page: HomeSubPage.SubscribedSeries,
      },
      {
        i18nKey: 'home.trending',
        page: HomeSubPage.Trending,
      },
      {
        i18nKey: 'home.weekly',
        page: HomeSubPage.Weekly,
      },
      {
        i18nKey: 'home.precious',
        page: HomeSubPage.Precious,
      },
      {
        i18nKey: 'home.ranking',
        page: HomeSubPage.Ranking,
      },
      {
        i18nKey: 'home.live',
        page: HomeSubPage.Live,
      },
    ],
  )

  function getBiliWebPageURLByPage(page: AppPage): string {
    if (page === AppPage.Favorites) {
      const userId = getUserID()
      return userId
        ? `https://space.bilibili.com/${userId}/favlist`
        : 'https://space.bilibili.com'
    }

    const dockItem = dockItems.value.find(e => e.page === page)
    return dockItem?.url || ''
  }

  function getDockItemByPage(page: AppPage): DockItem | undefined {
    return dockItems.value.find(e => e.page === page)
  }

  return { dockItems, homeTabs, getBiliWebPageURLByPage, getDockItemByPage }
})
