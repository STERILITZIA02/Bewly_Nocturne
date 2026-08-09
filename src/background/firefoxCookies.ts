export interface FirefoxContainerCookie {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  expirationDate?: number
}

export interface FirefoxRequestHeader {
  name: string
  value?: string
  binaryValue?: number[]
}

export const FIREFOX_CONTAINER_COOKIE_HEADER = 'firefox-multi-account-cookie'

function domainMatches(cookie: FirefoxContainerCookie, hostname: string): boolean {
  const domain = cookie.domain.replace(/^\./, '').toLowerCase()
  if (cookie.hostOnly)
    return hostname === domain
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  const path = cookiePath || '/'
  return requestPath === path
    || (requestPath.startsWith(path) && (path.endsWith('/') || requestPath[path.length] === '/'))
}

export function filterCookiesForUrl<T extends FirefoxContainerCookie>(
  cookies: T[],
  requestUrl: string,
  nowSeconds = Date.now() / 1000,
): T[] {
  let url: URL
  try {
    url = new URL(requestUrl)
  }
  catch {
    return []
  }

  const hostname = url.hostname.toLowerCase()
  return cookies.filter(cookie => (
    domainMatches(cookie, hostname)
    && pathMatches(cookie.path, url.pathname)
    && (!cookie.secure || url.protocol === 'https:')
    && (cookie.expirationDate === undefined || cookie.expirationDate > nowSeconds)
  ))
}

export function serializeCookiesForUrl<T extends FirefoxContainerCookie>(cookies: T[], requestUrl: string): string {
  return filterCookiesForUrl(cookies, requestUrl)
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

export function replaceFirefoxContainerCookieHeader(
  headers: FirefoxRequestHeader[],
): FirefoxRequestHeader[] {
  const result: FirefoxRequestHeader[] = []
  let standardCookieHeader: FirefoxRequestHeader | undefined
  let containerCookieValue: string | undefined

  headers.forEach((header) => {
    const name = header.name.toLowerCase()
    if (name === FIREFOX_CONTAINER_COOKIE_HEADER) {
      containerCookieValue = header.value ?? ''
      return
    }
    if (name === 'cookie') {
      standardCookieHeader ??= header
      return
    }
    result.push(header)
  })

  const cookieValue = containerCookieValue ?? standardCookieHeader?.value
  if (cookieValue) {
    result.push({
      name: standardCookieHeader?.name ?? 'Cookie',
      value: cookieValue,
    })
  }

  return result
}
