import { ref, watch } from 'vue'

import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { syncRouteState } from '~/composables/useRouteState'
import type { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { HomeRouteDefaults } from '~/utils/homeRoute'
import { readHomeRoute, resolveHomeTab, writeHomeRoute } from '~/utils/homeRoute'
import type { HomeTabConfigItem } from '~/utils/homeTabConfig'
import { isSameHomeTabConfig, normalizeHomeTabConfig } from '~/utils/homeTabConfig'
import { clearIframeDrawerHistory } from '~/utils/iframeDrawerHistory'

/** Page/tab state belongs to the existing route source; this adds no browser listeners. */
export function useHomePageRoute(defaultPage: () => AppPage, defaultTabs: HomeTabConfigItem[], account: () => string = () => '') {
  const href = useCurrentLocationHref()
  const availablePage = (page: AppPage) => settings.value.useSearchPageModeOnHomePage && page === AppPage.Search ? AppPage.Home : page
  const tabConfig = () => normalizeHomeTabConfig(settings.value.homePageTabVisibilityList, defaultTabs)
  const initial = readHomeRoute(href.value)
  const activatedPage = ref(availablePage(initial?.page ?? defaultPage()))
  const homeActivatedPage = ref(resolveHomeTab(initial?.tab ?? null, tabConfig()))
  const homeActivatedPageTouched = ref(Boolean(initial?.tab))
  let applyingRoute = false
  let writtenHref: string | undefined
  const rememberedUrls = new Map<AppPage, string>()
  let routeAccount = account()
  watch(account, () => rememberedUrls.clear(), { flush: 'sync' })

  const routeDefaults = (): HomeRouteDefaults => ({
    page: availablePage(defaultPage()),
    tab: resolveHomeTab(null, tabConfig()),
  })
  const routePage = (page: AppPage | null) => availablePage(page ?? defaultPage())

  function syncUrl(mode: 'push' | 'replace' = 'replace', base = window.location.href) {
    if (applyingRoute)
      return
    const next = writeHomeRoute(base, activatedPage.value, homeActivatedPage.value, routeDefaults())
    routeAccount = account()
    if (readHomeRoute(next))
      rememberedUrls.set(activatedPage.value, next)
    if (next !== window.location.href) {
      writtenHref = next
      window.history[mode === 'push' ? 'pushState' : 'replaceState'](clearIframeDrawerHistory(window.history.state), '', next)
      syncRouteState()
    }
  }

  function navigateToPage(page: AppPage) {
    const current = readHomeRoute(window.location.href)
    if (current && routeAccount === account())
      rememberedUrls.set(routePage(current.page), window.location.href)
    const target = availablePage(page)
    const remembered = rememberedUrls.get(target)
    applyingRoute = true
    activatedPage.value = target
    applyingRoute = false
    syncUrl('push', remembered ?? window.location.href)
  }

  function navigateToHomeTab(tab: HomeSubPage) {
    applyingRoute = true
    homeActivatedPageTouched.value = true
    homeActivatedPage.value = resolveHomeTab(tab, tabConfig())
    applyingRoute = false
    syncUrl('push')
  }
  watch(href, (value) => {
    if (value === writtenHref) {
      writtenHref = undefined
      return
    }
    const route = readHomeRoute(value)
    if (!route)
      return
    rememberedUrls.set(routePage(route.page), value)
    routeAccount = account()
    applyingRoute = true
    activatedPage.value = routePage(route.page)
    if (activatedPage.value === AppPage.Home) {
      homeActivatedPage.value = resolveHomeTab(route.tab, tabConfig())
      homeActivatedPageTouched.value = Boolean(route.tab)
    }
    applyingRoute = false
    syncUrl()
  }, { flush: 'sync' })
  watch(() => settings.value.useSearchPageModeOnHomePage, () => {
    activatedPage.value = availablePage(activatedPage.value)
  }, { flush: 'sync' })
  watch([() => settings.value.homePageTabVisibilityList, () => settings.initializationState.value], ([value, state]) => {
    const config = tabConfig()
    if (!isSameHomeTabConfig(value, config) && state === 'loaded') {
      settings.value.homePageTabVisibilityList = config
      return
    }
    homeActivatedPage.value = resolveHomeTab(homeActivatedPageTouched.value ? homeActivatedPage.value : null, config)
    syncUrl()
  }, { deep: true, immediate: true })
  watch(() => routeDefaults().page, () => syncUrl(), { flush: 'sync' })
  watch([activatedPage, homeActivatedPage], () => syncUrl(), { flush: 'sync' })
  syncUrl()
  return { activatedPage, homeActivatedPage, homeActivatedPageTouched, navigateToPage, navigateToHomeTab, resolveAvailableAppPage: availablePage }
}
