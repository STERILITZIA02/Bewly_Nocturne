const BILIBILI_LOCALE_PREFIXES: ReadonlySet<string> = new Set([
  'ar',
  'en',
  'es',
  'id',
  'ja',
  'ms',
  'pt',
  'ru',
  'th',
  'tr',
  'vi',
  'zh-Hans',
  'zh-Hant',
])

const BILIBILI_MAIN_HOSTS: ReadonlySet<string> = new Set(['www.bilibili.com', 'bilibili.com'])

const LOCALIZED_ROUTE_PATTERN = /^\/(?:$|video\/|list\/|watchlater(?:\/|$)|bangumi\/play\/|history(?:\/|$))/
const LOCALE_SEGMENT_PATTERN = /^\/([^/]+)(\/.*)?$/

export interface BilibiliLocalePath {
  locale: string | null
  pathname: string
}

export function isBilibiliMainHost(hostname: string): boolean {
  return BILIBILI_MAIN_HOSTS.has(hostname)
}

export function splitBilibiliLocalePath(hostname: string, pathname: string): BilibiliLocalePath {
  if (!isBilibiliMainHost(hostname))
    return { locale: null, pathname }
  const match = LOCALE_SEGMENT_PATTERN.exec(pathname)
  if (!match || !BILIBILI_LOCALE_PREFIXES.has(match[1]))
    return { locale: null, pathname }
  const logicalPathname = match[2] || '/'
  if (!LOCALIZED_ROUTE_PATTERN.test(logicalPathname))
    return { locale: null, pathname }
  return { locale: match[1], pathname: logicalPathname }
}

function parseUrl(value: string | URL, base?: string): URL | null {
  if (value instanceof URL)
    return value
  try {
    return new URL(value, base)
  }
  catch {
    return null
  }
}

export function getBilibiliLogicalPathname(value: string | URL = location.href, base?: string): string {
  const url = parseUrl(value, base)
  if (!url)
    return ''
  return splitBilibiliLocalePath(url.hostname, url.pathname).pathname
}

export function toBilibiliLogicalUrl(value: string): string {
  const url = parseUrl(value)
  if (!url)
    return value
  const { locale, pathname } = splitBilibiliLocalePath(url.hostname, url.pathname)
  if (!locale)
    return value
  const logical = new URL(url.href)
  logical.pathname = pathname
  return logical.href
}

export function isBilibiliHomepagePathname(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/index.html'
}
