import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'

import { resolveDefaultAppPage } from './homeRoute'
import type { LinkOpenMode } from './linkNavigation'
import { resolveLinkOpenAction } from './linkNavigation'
import { isHomePage, isInIframe } from './main'
import { isActualHomepage } from './searchNavigationCore'

/** The same default as the Home route; an explicit URL page always takes precedence. */
export function getLinkFallbackPage(activePage?: AppPage): AppPage {
  if (settings.value.pageMode === 'original')
    return AppPage.Home
  const page = activePage ?? resolveDefaultAppPage(settings.value.dockItemsConfig)
  return page === AppPage.Search && settings.value.useSearchPageModeOnHomePage ? AppPage.Home : page
}

export function resolveConfiguredLinkAction(mode: LinkOpenMode, href: string, activePage?: AppPage) {
  return resolveLinkOpenAction(mode, {
    // Preserve the existing outside-home policy; the new mode uses the actual outlet.
    isHomepage: mode === 'currentTabIfHomepage'
      ? isActualHomepage(href, getLinkFallbackPage(activePage))
      : isHomePage(href),
    inIframe: isInIframe(),
  })
}
