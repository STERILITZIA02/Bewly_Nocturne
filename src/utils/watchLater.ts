import type { VideoInfo } from '~/models/video/videoInfo'
import api from '~/utils/api'
import { resolvePgcEpisodeVideoIds } from '~/utils/pgcEpisode'

export interface WatchLaterIdentity {
  aid?: number | string
  bvid?: string
  epid?: number
  roomid?: number
}

export function getDirectWatchLaterAid(target: WatchLaterIdentity): number | undefined {
  if (target.roomid)
    return undefined

  const aid = Number(target.aid || 0)
  return Number.isFinite(aid) && aid > 0 ? aid : undefined
}

export async function resolveWatchLaterAid(target: WatchLaterIdentity): Promise<number | undefined> {
  const directAid = getDirectWatchLaterAid(target)
  if (directAid)
    return directAid
  if (target.epid) {
    const ids = await resolvePgcEpisodeVideoIds(target.epid)
    return getDirectWatchLaterAid(ids || {})
  }
  if (!target.bvid)
    return undefined

  const result: VideoInfo = await api.video.getVideoInfo({ bvid: target.bvid })
  return result.code === 0 ? getDirectWatchLaterAid(result.data) : undefined
}
