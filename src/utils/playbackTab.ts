import { parseVideoPageIdentity } from './videoMetadataBridge'

export type PlaybackTabTarget = { aid: number } | { bvid: string } | { epid: number } | { seasonId: number }
export interface PlaybackTab {
  tabId: number
  windowId: number
  incognito: boolean
  url: string
  title: string
  target: PlaybackTabTarget
}

/** Validate the page before consulting media parameters; search/space URLs are not players. */
export function parsePlaybackTabUrl(value: string): PlaybackTabTarget | undefined {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname))
      return
    url.hostname = 'www.bilibili.com'
    const video = parseVideoPageIdentity(url.href)
    if (video?.aid && Number.isSafeInteger(video.aid))
      return { aid: video.aid }
    if (video?.bvid)
      return { bvid: video.bvid }
    const pgc = /^\/bangumi\/play\/(ep|ss)([1-9]\d*)\/?$/.exec(url.pathname)
    if (pgc && Number.isSafeInteger(Number(pgc[2])))
      return pgc[1] === 'ep' ? { epid: Number(pgc[2]) } : { seasonId: Number(pgc[2]) }
    if (/^\/(?:list\/|medialist\/play\/)/.test(url.pathname)) {
      const bvid = url.searchParams.get('bvid')
      const aid = url.searchParams.get('aid') || url.searchParams.get('avid')
      if (bvid || aid)
        return parsePlaybackTabUrl(`https://www.bilibili.com/video/${bvid || `av${aid}`}/`)
    }
    if (/^\/watchlater\/?$/.test(url.pathname)) {
      const id = /^#\/(BV[\da-z]{10}|av\d+)(?:[/?]|$)/i.exec(url.hash)?.[1]
      if (id)
        return parsePlaybackTabUrl(`https://www.bilibili.com/video/${id}/`)
    }
  }
  catch {}
}
