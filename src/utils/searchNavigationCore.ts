import type { LinkOpenMode, ResolvedLinkOpenAction } from '~/utils/linkNavigation'
import { resolveLinkOpenAction } from '~/utils/linkNavigation'
import { isHomePage } from '~/utils/main'

import { readHomeRoute } from './homeRoute'

export function isActualHomepage(url: string, fallbackPage = 'Home'): boolean {
  if (!isHomePage(url))
    return false

  try {
    const page = readHomeRoute(url)?.page
    return (page ?? fallbackPage) === 'Home'
  }
  catch {
    return false
  }
}

export function resolveSearchOpenAction(
  mode: LinkOpenMode,
  currentUrl: string,
  inIframe = false,
  fallbackPage = 'Home',
): ResolvedLinkOpenAction {
  return resolveLinkOpenAction(mode, {
    isHomepage: isActualHomepage(currentUrl, fallbackPage),
    inIframe,
  })
}
