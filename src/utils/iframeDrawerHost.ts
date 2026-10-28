import { BEWLY_IFRAME_DRAWER_HOST_CLASS } from '~/constants/globalEvents'

interface ClassListOwner {
  classList: Pick<DOMTokenList, 'contains'>
}

export function isIframeDrawerHost(
  root: ClassListOwner = document.documentElement,
): boolean {
  return root.classList.contains(BEWLY_IFRAME_DRAWER_HOST_CLASS)
}
