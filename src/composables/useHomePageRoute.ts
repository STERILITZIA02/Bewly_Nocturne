import { ref, watch } from 'vue'

import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { readHomeRoute, resolveHomeTab, writeHomeRoute } from '~/utils/homeRoute'
import type { HomeTabConfigItem } from '~/utils/homeTabConfig'
import { isSameHomeTabConfig, normalizeHomeTabConfig } from '~/utils/homeTabConfig'

/** Page/tab state belongs to the existing route source; this adds no browser listeners. */
export function useHomePageRoute(defaultPage: () => AppPage, defaultTabs: HomeTabConfigItem[]) {
  const href = useCurrentLocationHref()
  const availablePage = (page: AppPage) => settings.value.useSearchPageModeOnHomePage && page === AppPage.Search ? AppPage.Home : page
  const tabConfig = () => normalizeHomeTabConfig(settings.value.homePageTabVisibilityList, defaultTabs)
  const initial = readHomeRoute(href.value)
  const activatedPage = ref(availablePage(initial?.page ?? defaultPage()))
  const homeActivatedPage = ref(resolveHomeTab(initial?.tab ?? null, tabConfig()))
  const homeActivatedPageTouched = ref(Boolean(initial?.tab))
  let applyingRoute = false
  let writtenHref: string | undefined

  function syncUrl() {
    if (applyingRoute)
      return
    const next = writeHomeRoute(window.location.href, activatedPage.value, homeActivatedPage.value)
    if (next !== window.location.href) {
      writtenHref = next
      window.history.replaceState(window.history.state, '', next)
    }
  }
  watch(href, (value) => {
    if (value === writtenHref) {
      writtenHref = undefined
      return
    }
    const route = readHomeRoute(value)
    if (!route)
      return
    applyingRoute = true
    activatedPage.value = availablePage(route.page ?? defaultPage())
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
  watch(() => settings.value.homePageTabVisibilityList, (value) => {
    const config = tabConfig()
    if (!isSameHomeTabConfig(value, config)) {
      settings.value.homePageTabVisibilityList = config
      return
    }
    homeActivatedPage.value = resolveHomeTab(homeActivatedPageTouched.value ? homeActivatedPage.value : null, config)
  }, { deep: true, immediate: true })
  watch([activatedPage, homeActivatedPage], syncUrl, { flush: 'sync' })
  syncUrl()
  return { activatedPage, homeActivatedPage, homeActivatedPageTouched, resolveAvailableAppPage: availablePage }
}
