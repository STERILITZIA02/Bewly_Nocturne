import { BEWLY_IFRAME_DRAWER_HOST_CLASS } from '~/constants/globalEvents'

import { isIframeDocumentActive } from './iframeActivity'

interface ClassListOwner {
  classList: Pick<DOMTokenList, 'contains'>
}

export function isIframeDrawerHost(
  root: ClassListOwner = document.documentElement,
): boolean {
  return !isIframeDocumentActive() || root.classList.contains(BEWLY_IFRAME_DRAWER_HOST_CLASS)
}
