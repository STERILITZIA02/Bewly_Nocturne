// @unocss-include
import type { Ref } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { syncRouteState } from '~/composables/useRouteState'
import { AppPage } from '~/enums/appEnums'
import { useSettingsStore } from '~/stores/settingsStore'
import { isHomePage, isInIframe, openLinkToNewTab } from '~/utils/main'
import { buildPageSearchHref, PAGE_SEARCH_PAGES, PAGE_SEARCH_PARAM } from '~/utils/pageSearch'
import { openSearchResults } from '~/utils/searchNavigation'
import type { SearchShortcutKind } from '~/utils/searchShortcuts'
import { parseSearchShortcuts } from '~/utils/searchShortcuts'

/** A row of the search bar's quick actions; `href` lets a modified click open it natively. */
export interface SearchCommand {
  key: string
  icon: string
  label: string
  hint?: string
  href?: string
  run: () => void
}

const NAVIGATION_PAGES: readonly AppPage[] = [AppPage.History, AppPage.WatchLater, AppPage.Favorites, AppPage.Moments, AppPage.Notifications]
const PAGE_LABEL_KEYS: Partial<Record<AppPage, string>> = {
  [AppPage.History]: 'dock.history',
  [AppPage.WatchLater]: 'dock.watch_later',
  [AppPage.Favorites]: 'dock.favorites',
  [AppPage.Moments]: 'dock.moments',
  [AppPage.Notifications]: 'dock.notifications',
}
const SHORTCUT_ICONS: Record<SearchShortcutKind, string> = {
  video: 'i-tabler:player-play',
  bangumi: 'i-tabler:device-tv',
  article: 'i-tabler:article',
  space: 'i-tabler:user',
  live: 'i-tabler:broadcast',
  link: 'i-tabler:link',
}

/**
 * The search bar's quick actions for the current input: open a typed id or
 * link, search the same keyword in Moments / Favorites / History, or go to a
 * page. Empty input lists the pages; typed input also matches page names.
 */
export function useSearchCommands(keyword: Readonly<Ref<string>>) {
  const { t } = useI18n()
  const app = useBewlyApp()
  const settingsStore = useSettingsStore()

  const pageLabel = (page: AppPage) => t(PAGE_LABEL_KEYS[page]!)
  const pageIcon = (page: AppPage) => settingsStore.getEffectiveDockItemByPage(page)?.icon ?? 'i-tabler:layout-grid'

  // The handover rides on the Bewly page's URL; a page opened as the native site has no such search.
  function openPageSearch(page: AppPage, query: string) {
    const href = buildPageSearchHref(page, query)
    if (isInIframe() || settingsStore.getEffectiveDockItemByPage(page)?.openInNewTab) {
      openLinkToNewTab(href)
      return
    }
    if (!isHomePage()) {
      location.href = href
      return
    }
    app.navigateToDockPage(page)
    const url = new URL(location.href)
    url.searchParams.set(PAGE_SEARCH_PARAM, query)
    window.history.replaceState(window.history.state, '', url.href)
    syncRouteState()
  }

  const navigationCommands = computed<SearchCommand[]>(() => [
    ...NAVIGATION_PAGES.map(page => ({
      key: `page:${page}`,
      icon: pageIcon(page),
      label: pageLabel(page),
      href: app.getDockPageHref(page),
      run: () => app.navigateToDockPage(page),
    })),
    {
      key: 'settings:search',
      icon: 'i-tabler:settings',
      label: t('search_bar.search_settings'),
      run: () => app.openSettingsAt({ category: 'bewly-pages', page: 'search' }),
    },
  ])

  return computed<SearchCommand[]>(() => {
    const query = keyword.value.trim()
    const shortcuts = parseSearchShortcuts(query)
    const commands: SearchCommand[] = shortcuts.map(shortcut => ({
      key: `open:${shortcut.kind}:${shortcut.id}`,
      icon: SHORTCUT_ICONS[shortcut.kind],
      label: t(`search_bar.open_${shortcut.kind}`),
      hint: shortcut.kind === 'space' ? `UID ${shortcut.id}` : shortcut.id,
      href: shortcut.url,
      run: () => openSearchResults(shortcut.url),
    }))
    if (query && !shortcuts.length) {
      for (const page of PAGE_SEARCH_PAGES) {
        if (settingsStore.getEffectiveDockItemByPage(page)?.useOriginalBiliPage !== false)
          continue
        commands.push({
          key: `search-in:${page}`,
          icon: pageIcon(page),
          label: t('search_bar.search_in', { page: pageLabel(page) }),
          hint: query,
          href: buildPageSearchHref(page, query),
          run: () => openPageSearch(page, query),
        })
      }
    }
    const folded = query.toLocaleLowerCase()
    commands.push(...navigationCommands.value.filter(command => !folded || command.label.toLocaleLowerCase().includes(folded)))
    return commands
  })
}
