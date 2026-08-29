import type { LinkOpenMode, ResolvedLinkOpenAction } from '~/utils/linkNavigation'
import { resolveLinkOpenAction } from '~/utils/linkNavigation'
import { isHomePage } from '~/utils/main'

export function isActualHomepage(url: string): boolean {
  if (!isHomePage(url))
    return false

  try {
    const page = new URL(url).searchParams.get('page')
    return page === null || page === 'Home'
  }
  catch {
    return false
  }
}

export function resolveSearchOpenAction(
  mode: LinkOpenMode,
  currentUrl: string,
  inIframe = false,
): ResolvedLinkOpenAction {
  return resolveLinkOpenAction(mode, {
    isHomepage: isActualHomepage(currentUrl),
    inIframe,
  })
}
