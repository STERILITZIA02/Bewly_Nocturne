import { AppPage } from '~/enums/appEnums'

/**
 * Get cookie by name
 * @param name cookie name
 * @returns cookie value
 */
export function getCookie(name: string): string {
  const value = `; ${document.cookie}`
  const parts: Array<string> = value.split(`; ${name}=`)
  if (parts.length === 2) {
    const result = parts?.pop()?.split(';').shift() || ''
    return result
  }
  return ''
}

/**
 * Set cookie
 * @param name cookie name
 * @param value cookie value
 */
export function setCookie(name: string, value: any, expDays: number) {
  const date = new Date()
  date.setTime(date.getTime() + expDays * 24 * 60 * 60 * 1000)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value}; ${expires}; domain=.bilibili.com; path=/`
}

/**
 * Get current login user id
 * @returns userId
 */
export const getUserID = (): string => getCookie('DedeUserID')

/**
 * Get csrf token
 */
export const getCSRF = (): string => getCookie('bili_jct')

/**
 * Remove the 'http:' or 'https:' prefix from a URL
 * @param url
 * @returns The result of removing the 'http:' or 'https:' prefix from a url
 */
export function removeHttpFromUrl(url: string): string {
  return url.replace(/^https?:/, '')
}

export function openLinkToNewTab(url: string, features: string = '') {
  window.open(url, '_blank', features)
}

export function isElectron(): boolean {
  if (typeof navigator === 'undefined')
    return false

  // 检测 userAgent
  if (/Electron/i.test(navigator.userAgent))
    return true

  return false
}

/**
 * Convert a hex color value to HSLA, thanks ChatGPT 🫡
 * @param hex hex color value
 * @param alpha color opacity
 * @returns HSLA or HSL color string
 */
export function hexToHSL(hex: string, alpha: number | null = null): string {
  // Remove the hash at the start if it's there
  hex = hex.replace(/^#/, '')

  // Ensure the input is valid
  if (hex.length !== 6) {
    throw new Error('Invalid HEX color.')
  }

  // Parse the r, g, b values
  let r = Number.parseInt(hex.substring(0, 2), 16)
  let g = Number.parseInt(hex.substring(2, 4), 16)
  let b = Number.parseInt(hex.substring(4, 6), 16)

  // Convert r, g, b to percentages
  r /= 255
  g /= 255
  b /= 255

  // Find the greatest and smallest channel values
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h: number = 0
  let s: number = 0
  let l: number = (max + min) / 2

  // Calculate the hue
  if (max === min) {
    h = s = 0 // achromatic
  }
  else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }

    h /= 6
  }

  // Convert to degrees and percentages
  h = Math.round(h * 360)
  s = Math.round(s * 100)
  l = Math.round(l * 100)

  if (alpha !== null)
    return `hsla(${h}, ${s}%, ${l}%, ${alpha})`
  return `hsl(${h}, ${s}%, ${l}%)`
}

/**
 * Smooth scroll to the top of the html element
 */
export function scrollToTop(element: HTMLElement, targetScrollTop = 0 as number) {
  // cancel if already on top
  if (element.scrollTop === targetScrollTop)
    return

  element.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth',
  })
}

export function injectCSS(css: string, element: HTMLElement | ShadowRoot = document.documentElement): HTMLStyleElement {
  const el = document.createElement('style')
  el.setAttribute('rel', 'stylesheet')
  el.textContent = css
  element.appendChild(el)
  return el
}

/**
 * delay
 * @param ms milliseconds delay time
 */
export function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Check if the current page is the home page
 * @param url the url to check
 * @returns true if the current page is the home page
 */
export function isHomePage(url: string = location.href): boolean {
  try {
    const urlObj = new URL(url)
    const isHttp = urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
    const isBilibiliHomeHost = urlObj.hostname === 'www.bilibili.com' || urlObj.hostname === 'bilibili.com'
    return isHttp && isBilibiliHomeHost && (urlObj.pathname === '/' || urlObj.pathname === '/index.html')
  }
  catch {
    return false
  }
}

/**
 * Check if the URL points to Bilibili's topic detail page.
 * The real route carries the topic id in the query string rather than a path segment.
 */
export function isTopicPage(url: string = location.href): boolean {
  try {
    const urlObj = new URL(url)
    const isHttp = urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
    const isBilibiliHost = urlObj.hostname === 'www.bilibili.com' || urlObj.hostname === 'bilibili.com'
    return isHttp && isBilibiliHost && urlObj.pathname === '/v/topic/detail'
  }
  catch {
    return false
  }
}

/**
 * Check if the URL points to Bilibili's watch later list page.
 * Supports both the canonical path and the legacy hash route used by the
 * user-space favorites entry. See https://github.com/keleus/BewlyCat/issues/841
 *
 * @param url the url to check
 * @returns true if the URL is a watch later list page
 */
export function isWatchLaterListPage(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const isHttp = urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
    const isBilibiliHost = urlObj.hostname === 'www.bilibili.com' || urlObj.hostname === 'bilibili.com'
    if (!isHttp || !isBilibiliHost)
      return false

    if (urlObj.pathname === '/watchlater/list' || urlObj.pathname === '/watchlater/list/')
      return true

    const isLegacyWatchLaterPath = urlObj.pathname === '/watchlater' || urlObj.pathname === '/watchlater/'
    return isLegacyWatchLaterPath && /^#\/list(?:[/?]|$)/.test(urlObj.hash)
  }
  catch {
    return false
  }
}

/**
 * Check if the current page is a video or bangumi page
 * @param url the url to check
 * @returns true if the current page is a video or bangumi page
 */
export function isVideoOrBangumiPage(url: string = location.href): boolean {
  if (
    // video page
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:video|list)\/.*/.test(url)
    // anime playback & movie page
    || /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/.*/.test(url)
    // watch later playlist
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater\?(?:bvid|avid).*/.test(url)
    // favorite playlist
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(url)
    || /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(url)
  ) {
    return true
  }
  return false
}

/**
 * Check if the current page is a playback page that should use video-page-only dark mode.
 * This intentionally excludes festival pages because they already use selective dark handling.
 *
 * @param url the url to check
 * @returns true if the current page is a video playback page
 */
export function isVideoPlaybackPage(url: string = location.href): boolean {
  return (
    // normal video page and playlist video page
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:video|list)\/.*/.test(url)
    // anime, movie, and course playback pages
    || /https?:\/\/(?:www\.)?bilibili\.com\/(?:bangumi|cheese)\/play\/.*/.test(url)
    // media playlist playback pages
    || /https?:\/\/(?:www\.)?bilibili\.com\/medialist\/play\/.*/.test(url)
  )
}

/**
 * Check if the current page is the notifications page
 * @param url the url to check
 * @returns true if the current page is the notifications page
 */
export function isNotificationPage(url: string = location.href): boolean {
  if (
    /https?:\/\/message\.bilibili\.com\.*/.test(url)
  ) {
    return true
  }
  return false
}

/**
 * Check if the current page is a search results page
 * @param url the url to check
 * @returns true if the current page is a search results page
 */
export function isSearchResultsPage(url: string = location.href): boolean {
  // 检查是否是 B站原生搜索结果页
  if (/https?:\/\/search\.bilibili\.com\/.*/.test(url)) {
    return true
  }
  // 检查是否是插件搜索结果页。
  const urlObj = new URL(url)
  if (urlObj.searchParams.get('page') === AppPage.SearchResults) {
    return true
  }
  return false
}

/**
 * Check if the current page is a user space page
 * @param url the url to check
 * @returns true if the current page is a user space page
 */
export function isUserSpacePage(url: string = location.href): boolean {
  if (
    /https?:\/\/space\.bilibili\.com\.*/.test(url)
  ) {
    return true
  }
  return false
}

export function calculateContainedImageSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (![width, height, maxWidth, maxHeight].every(value => Number.isFinite(value) && value > 0))
    throw new RangeError('Image dimensions must be positive finite numbers')

  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Compresses and resizes an image file.
 *
 * @param file - The image file to compress and resize.
 * @param maxWidth - The maximum width of the resized image.
 * @param maxHeight - The maximum height of the resized image.
 * @param quality - The quality of the compressed image (0-1).
 * @param callback - The callback function to execute with the compressed file.
 * @param onError - The callback invoked when reading, decoding, or encoding fails.
 */
export function compressAndResizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number,
  callback: (compressedFile: File) => void,
  onError: (error: Error) => void = error => console.error('compressAndResizeImage failed', error),
) {
  const fail = (error: unknown) => {
    onError(error instanceof Error ? error : new Error(String(error)))
  }

  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    fail(new RangeError('Image quality must be between 0 and 1'))
    return
  }

  const img = new Image()
  const reader = new FileReader()

  reader.onerror = () => fail(reader.error ?? new Error('Failed to read image file'))
  reader.onabort = () => fail(new Error('Image file reading was aborted'))
  img.onerror = () => fail(new Error('Failed to decode image file'))

  reader.onload = (event) => {
    const result = event.target?.result
    if (typeof result !== 'string') {
      fail(new Error('Image file did not produce a data URL'))
      return
    }
    img.src = result
  }

  img.onload = () => {
    try {
      const size = calculateContainedImageSize(
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        maxWidth,
        maxHeight,
      )
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        fail(new Error('Unable to create image canvas context'))
        return
      }

      canvas.width = size.width
      canvas.height = size.height
      ctx.drawImage(img, 0, 0, size.width, size.height)
      canvas.toBlob((blob) => {
        if (!blob) {
          fail(new Error('Image encoding returned an empty blob'))
          return
        }
        let compressedFile: File
        try {
          compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
        }
        catch (error) {
          fail(error)
          return
        }
        callback(compressedFile)
      }, 'image/jpeg', quality)
    }
    catch (error) {
      fail(error)
    }
  }

  try {
    reader.readAsDataURL(file)
  }
  catch (error) {
    fail(error)
  }
}

/**
 * Compare two versions
 * @param version1
 * @param version2
 * @returns 1 if version1 is greater than version2, -1 if version1 is less than version2, 0 if version1 is equal to version2
 */
export function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number)
  const v2Parts = version2.split('.').map(Number)

  // Determine the longer length for iteration
  const maxLength = Math.max(v1Parts.length, v2Parts.length)

  for (let i = 0; i < maxLength; i++) {
    const num1 = v1Parts[i] || 0 // Defaults to 0 if undefined
    const num2 = v2Parts[i] || 0 // Defaults to 0 if undefined

    if (num1 > num2)
      return 1
    if (num1 < num2)
      return -1
  }

  return 0 // Versions are equal
}

export function queryDomUntilFound(
  selector: string,
  timeout = 500,
  abort?: AbortController,
  maxWait = 10_000,
  query: (selector: string) => HTMLElement | null = selector => document.querySelector<HTMLElement>(selector),
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    if (abort?.signal.aborted) {
      resolve(null)
      return
    }

    const existingElement = query(selector)
    if (existingElement) {
      resolve(existingElement)
      return
    }

    let settled = false
    let interval: ReturnType<typeof setInterval> | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    let handleAbort: (() => void) | undefined
    const finish = (element: HTMLElement | null) => {
      if (settled)
        return
      settled = true
      if (interval !== undefined)
        clearInterval(interval)
      if (deadline !== undefined)
        clearTimeout(deadline)
      if (handleAbort)
        abort?.signal.removeEventListener('abort', handleAbort)
      resolve(element)
    }
    handleAbort = () => finish(null)

    interval = setInterval(() => {
      const element = query(selector)
      if (element)
        finish(element)
    }, timeout)
    deadline = setTimeout(() => finish(null), maxWait)
    abort?.signal.addEventListener('abort', handleAbort, { once: true })
    if (abort?.signal.aborted)
      finish(null)
  })
}

/**
 * Check if the current page is in an iframe
 * @returns true if the current page is in an iframe
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top
  }
  catch {
    // If we can't access window.top due to security restrictions,
    // we're definitely in an iframe
    return true
  }
}

export { cleanBilibiliShareText, cleanBilibiliUrl } from './bilibiliUrl'
