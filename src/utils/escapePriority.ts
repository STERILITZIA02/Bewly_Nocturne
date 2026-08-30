import { isPhotoViewerOpen } from '~/utils/photoViewer'

const BILIBILI_WIDESCREEN_SELECTOR = [
  '[data-screen="wide"]',
  '.bpx-player-ctrl-wide.bpx-state-entered',
  '.bilibili-player-video-btn-widescreen.bpx-state-entered',
  '.squirtle-video-widescreen.bpx-state-entered',
].join(', ')

const BILIBILI_WEB_FULLSCREEN_SELECTOR = [
  '[data-screen="web"]',
  '.bpx-player-ctrl-web.bpx-state-entered',
  '.bilibili-player-video-web-fullscreen.bpx-state-entered',
  '.squirtle-video-pagefullscreen.bpx-state-entered',
].join(', ')

const EXPLICIT_OVERLAY_SELECTOR = [
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[popover]',
  '.dialog',
  '.bili-dialog',
  '.bpx-player-dialog-wrap',
].join(', ')

interface EscapePriorityOptions {
  documentRoot?: Document
  bewlyWidescreenEngaged?: boolean
  editingStateActive?: boolean
}

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement || element instanceof SVGElement))
    return false
  if ((element instanceof HTMLElement && element.hidden) || element.getAttribute('aria-hidden') === 'true')
    return false
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return rect.width > 0
    && rect.height > 0
    && style.display !== 'none'
    && style.visibility !== 'hidden'
}

function getKnownRoots(documentRoot: Document): ParentNode[] {
  const roots: ParentNode[] = [documentRoot]
  const bewlyShadowRoot = documentRoot.querySelector('#bewly')?.shadowRoot
  if (bewlyShadowRoot)
    roots.push(bewlyShadowRoot)
  return roots
}

function hasVisibleExplicitOverlay(documentRoot: Document): boolean {
  return getKnownRoots(documentRoot).some(root => (
    Array.from(root.querySelectorAll(EXPLICIT_OVERLAY_SELECTOR)).some(isElementVisible)
  ))
}

export function isBrowserFullscreenActive(documentRoot: Document = document): boolean {
  const webkitDocument = documentRoot as Document & { webkitFullscreenElement?: Element | null }
  return Boolean(documentRoot.fullscreenElement || webkitDocument.webkitFullscreenElement)
}

export function isBilibiliPlayerDisplayModeActive(documentRoot: Document = document): boolean {
  return Boolean(documentRoot.querySelector(
    `${BILIBILI_WIDESCREEN_SELECTOR}, ${BILIBILI_WEB_FULLSCREEN_SELECTOR}`,
  ))
}

export function hasIframeEscapePriorityState(options: EscapePriorityOptions = {}): boolean {
  const documentRoot = options.documentRoot ?? document
  return Boolean(
    options.bewlyWidescreenEngaged
    || options.editingStateActive
    || isBrowserFullscreenActive(documentRoot)
    || isPhotoViewerOpen(documentRoot)
    || isBilibiliPlayerDisplayModeActive(documentRoot)
    || hasVisibleExplicitOverlay(documentRoot),
  )
}
