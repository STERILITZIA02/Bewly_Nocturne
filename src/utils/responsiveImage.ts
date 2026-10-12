// A small, shared set of CDN variants keeps cache keys stable across card widths.
const COVER_WIDTHS = [160, 240, 320, 480, 640, 960, 1280, 1920] as const

/** Only resize known static Bilibili cover URLs; signed/foreign/animated URLs keep their original behavior. */
export function getResponsiveCoverSrcset(source: string, format: '' | 'avif' | 'webp' = ''): string | undefined {
  let url: URL
  try {
    url = new URL(source.startsWith('//') ? `https:${source}` : source)
  }
  catch { return undefined }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.endsWith('.hdslb.com')
    || !url.pathname.startsWith('/bfs/') || url.search || url.hash) {
    return undefined
  }
  const match = url.pathname.match(/^(.*\.(?:jpe?g|png|webp|avif))(?:@(\d+)w_(\d+)h_1c(?:_!web-home-common-cover)?(?:\.(?:webp|avif))?)?$/i)
  if (!match)
    return undefined
  // This API is deliberately for 16:9 covers, not galleries or full-size viewers.
  if (match[2] && Math.abs(Number(match[2]) / Number(match[3]) - 16 / 9) > 0.01)
    return undefined
  const base = `https://${url.host}${match[1]}`
  return COVER_WIDTHS.map(width => `${base}@${width}w_${Math.round(width * 9 / 16)}h_1c${format ? `.${format}` : ''} ${width}w`).join(', ')
}

type SizeListener = (width: number) => void
const listeners = new Map<HTMLElement, SizeListener>()
let observer: ResizeObserver | undefined

function measureAll() {
  for (const [element, listener] of listeners)
    listener(element.getBoundingClientRect().width)
}

/** One observer for mounted covers, no scroll listener or per-image polling. */
export function observeCoverWidth(element: HTMLElement, listener: SizeListener): () => void {
  if (!listeners.size) {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(entries => entries.forEach(entry => listeners.get(entry.target as HTMLElement)?.(entry.contentRect.width)))
    }
    else {
      window.addEventListener('resize', measureAll, { passive: true })
    }
  }
  listeners.set(element, listener)
  listener(element.getBoundingClientRect().width)
  observer?.observe(element)
  return () => {
    if (listeners.get(element) !== listener)
      return
    listeners.delete(element)
    observer?.unobserve(element)
    if (!listeners.size) {
      observer?.disconnect()
      observer = undefined
      window.removeEventListener('resize', measureAll)
    }
  }
}
