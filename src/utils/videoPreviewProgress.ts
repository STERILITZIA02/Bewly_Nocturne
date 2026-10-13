import type { Video } from '~/components/VideoCard/types'

import { parsePlaybackTabUrl } from './playbackTab'

function playbackTarget(video: Video): { url: URL, kind: 'video' | 'ep', id: string, page: number } | undefined {
  if (video.roomid || video.isAdvertisement)
    return
  const fallback = video.epid
    ? `https://www.bilibili.com/bangumi/play/ep${video.epid}`
    : video.bvid || video.aid ? `https://www.bilibili.com/video/${video.bvid || `av${video.aid}`}` : ''
  try {
    const url = new URL(video.url || fallback, 'https://www.bilibili.com')
    if (url.protocol !== 'https:' || url.hostname !== 'www.bilibili.com' || url.port || url.username || url.password)
      return
    const queueTarget = parsePlaybackTabUrl(url.href)
    const videoId = /^\/video\/(BV[\da-z]+|av\d+)\/?$/i.exec(url.pathname)?.[1]
      || (queueTarget && ('bvid' in queueTarget ? queueTarget.bvid : 'aid' in queueTarget ? `av${queueTarget.aid}` : undefined))
    const ep = /^\/bangumi\/play\/ep(\d+)\/?$/.exec(url.pathname)?.[1]
    if (ep && video.epid && ep === String(video.epid))
      return { url, kind: 'ep', id: ep, page: 1 }
    if (!videoId || (videoId !== video.bvid && videoId !== `av${video.aid}`))
      return
    const page = Number(url.searchParams.get('p') || 1)
    if (!Number.isSafeInteger(page) || page < 1)
      return
    return { url, kind: 'video', id: videoId, page }
  }
  catch {}
}

export function getVideoPreviewIdentity(video?: Video): string {
  if (!video)
    return ''
  const target = playbackTarget(video)
  return target ? JSON.stringify([target.kind, target.id, target.page, video.cid || null]) : ''
}

export function getVideoPreviewPage(video: Video): number {
  return playbackTarget(video)?.page || 1
}

export function normalizePreviewPosition(time: number, duration: number, ended = false): number | null {
  if (!Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0)
    return null
  return ended || time >= duration ? 0 : time
}

export function getVideoPlaybackUrl(video: Video, time: number | null): string {
  const fallback = video.bvid || video.aid
    ? `https://www.bilibili.com/video/${video.bvid || `av${video.aid}`}`
    : video.epid
      ? `https://www.bilibili.com/bangumi/play/ep${video.epid}/`
      : video.roomid ? `https://live.bilibili.com/${video.roomid}/` : ''
  const target = playbackTarget(video)
  if (!target)
    return video.url || fallback
  if (time !== null && Number.isFinite(time) && time >= 0) {
    if (time > 5)
      target.url.searchParams.set('t', String(time))
    else target.url.searchParams.delete('t')
  }
  return target.url.href
}
