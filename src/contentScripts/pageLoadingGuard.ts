import { splitBilibiliLocalePath } from '../utils/bilibiliLocale'

const PAGE_LOADING_TIMEOUT_MS = 10_000

export interface PageLoadingGuard {
  readonly active: boolean
  revealContent: () => void
  revealHeader: () => void
  adoptOverlay: (remove: (immediate: boolean) => void) => void
  dispose: (immediate?: boolean) => void
}

/** Kept independent of Vue, settings and styles so the document-start entry stays small. */
export function createPageLoadingGuard(doc: Document, inIframe: boolean): PageLoadingGuard {
  const url = new URL(doc.URL)
  const { pathname } = splitBilibiliLocalePath(url.hostname, url.pathname)
  const homepage = !inIframe && ['www.bilibili.com', 'bilibili.com'].includes(url.hostname) && ['/', '/index.html'].includes(pathname)
  const playback = !inIframe && url.hostname === 'www.bilibili.com' && /^\/(?:video\/|bangumi\/play\/|list\/|medialist\/play)/.test(pathname)
  const pageStyle = doc.createElement('style')
  const headerStyle = doc.createElement('style')
  const pageCover = homepage || playback ? doc.createElement('div') : undefined
  pageCover?.setAttribute('data-bewly-page-loading-cover', '')
  pageCover?.setAttribute('aria-hidden', 'true')
  pageStyle.dataset.bewlyPageLoading = ''
  headerStyle.dataset.bewlyHeaderLoading = ''
  // A sibling cover avoids making body a backdrop root while Vue mounts,
  // and keeps native media visible to its own startup observers.
  pageStyle.textContent = pageCover
    ? `[data-bewly-page-loading-cover] { position: fixed; inset: 0; z-index: 2147483646; background: var(--bew-bg, #f6f7f8); }
       @media (prefers-color-scheme: dark) { [data-bewly-page-loading-cover] { background: var(--bew-bg, #050607); } }`
    : ''
  headerStyle.textContent = '.bili-header, #biliMainHeader, .header-channel, .bili-header-channel-panel { visibility: hidden !important; }'
  let active = true
  let contentVisible = false
  let headerVisible = false
  let removeOverlay: ((immediate: boolean) => void) | undefined
  let timeout: ReturnType<typeof setTimeout>
  const observer = new MutationObserver(attach)
  function attach() {
    if (!active || !doc.documentElement)
      return
    if (!contentVisible && (homepage || playback))
      doc.documentElement.append(pageStyle)
    if (!contentVisible && pageCover)
      doc.documentElement.append(pageCover)
    if (!headerVisible)
      doc.documentElement.append(headerStyle)
    observer.disconnect()
  }
  function dispose(immediate = false) {
    if (!active)
      return
    active = false
    observer.disconnect()
    clearTimeout(timeout)
    pageStyle.remove()
    pageCover?.remove()
    headerStyle.remove()
    removeOverlay?.(immediate)
    removeOverlay = undefined
  }
  timeout = setTimeout(dispose, PAGE_LOADING_TIMEOUT_MS, true)
  observer.observe(doc, { childList: true })
  attach()
  return {
    get active() { return active },
    revealContent() {
      // An opaque Bewly overlay now covers the page. Native media and controls
      // must remain visible to their own initialization/readiness observers.
      contentVisible = true
      pageStyle.remove()
      pageCover?.remove()
    },
    revealHeader() {
      headerVisible = true
      headerStyle.remove()
    },
    adoptOverlay(remove) {
      if (active)
        removeOverlay = remove
      else
        remove(true)
    },
    dispose,
  }
}

export function getPageLoadingGuard(): PageLoadingGuard {
  const host = globalThis as typeof globalThis & { __BEWLY_NOCTURNE_PAGE_LOADING__?: PageLoadingGuard }
  return host.__BEWLY_NOCTURNE_PAGE_LOADING__ ??= createPageLoadingGuard(document, window !== window.top)
}
