/** What a typed identifier opens directly from the search bar. */
export type SearchShortcutKind = 'video' | 'bangumi' | 'article' | 'space' | 'live' | 'link'

export interface SearchShortcut {
  kind: SearchShortcutKind
  /** Shown in the row: the normalized identifier. */
  id: string
  url: string
}

const BV_PATTERN = /^[Bb][Vv](1[1-9A-HJ-NP-Za-km-z]{9})$/
const PREFIXED_ID_PATTERN = /^(av|ep|ss|cv)(\d{1,12})$/i
const UID_PATTERN = /^(?:uid|mid)(?:\s*[:：]\s*|\s+)?(\d{1,16})$/i
const LIVE_PATTERN = /^(?:live|lv|直播间?)(?:\s*[:：]\s*|\s+)?(\d{1,12})$/i
const DIGITS_PATTERN = /^\d{1,16}$/
const BILIBILI_HOST_PATTERN = /(?:^|\.)(?:bilibili\.com|b23\.tv)$/

function pageShortcut(kind: SearchShortcutKind, id: string, url: string): SearchShortcut {
  return { kind, id, url }
}

/**
 * Identifiers the search bar can open without searching: BV/av/ep/ss/cv ids,
 * `uid:` or a bare number (a user or a live room), `live:` rooms and
 * Bilibili links. Pure; the bar decides how to open them.
 */
export function parseSearchShortcuts(input: string): SearchShortcut[] {
  const value = input.trim()
  if (!value)
    return []

  const bv = value.match(BV_PATTERN)
  if (bv) {
    // The prefix is case-insensitive; the base58 body is not.
    const id = `BV${bv[1]}`
    return [pageShortcut('video', id, `https://www.bilibili.com/video/${id}`)]
  }

  const prefixed = value.match(PREFIXED_ID_PATTERN)
  if (prefixed) {
    const prefix = prefixed[1].toLowerCase()
    const id = `${prefix}${prefixed[2]}`
    if (prefix === 'av')
      return [pageShortcut('video', id, `https://www.bilibili.com/video/${id}`)]
    if (prefix === 'cv')
      return [pageShortcut('article', id, `https://www.bilibili.com/read/${id}`)]
    return [pageShortcut('bangumi', id, `https://www.bilibili.com/bangumi/play/${id}`)]
  }

  const uid = value.match(UID_PATTERN)
  if (uid)
    return [pageShortcut('space', uid[1], `https://space.bilibili.com/${uid[1]}`)]

  const live = value.match(LIVE_PATTERN)
  if (live)
    return [pageShortcut('live', live[1], `https://live.bilibili.com/${live[1]}`)]

  if (DIGITS_PATTERN.test(value) && Number(value) > 0) {
    return [
      pageShortcut('space', value, `https://space.bilibili.com/${value}`),
      pageShortcut('live', value, `https://live.bilibili.com/${value}`),
    ]
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (BILIBILI_HOST_PATTERN.test(url.hostname))
        return [pageShortcut('link', url.hostname + url.pathname.replace(/\/$/, ''), url.href)]
    }
    catch {}
  }

  return []
}
