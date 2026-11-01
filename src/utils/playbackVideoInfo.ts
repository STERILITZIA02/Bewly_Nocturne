import type { VideoInfo } from '~/models/video/videoInfo'
import { waitWithSignal } from '~/utils/abort'
import api from '~/utils/api'
import { getUserID } from '~/utils/main'

// The playback sidebar, comment repair and watched-progress tracker all read
// the same manuscript. Parts share its pages array; media and comments do not.
const recent = new Map<string, { info: VideoInfo, expires: number }>()
interface PendingRead { task: Promise<VideoInfo>, controller: AbortController, readers: number }
const pending = new Map<string, PendingRead>()

export function getPlaybackPart(url: URL, pages: VideoInfo['data']['pages']) {
  const cid = Number(url.searchParams.get('cid'))
  const page = Number(url.searchParams.get('p') || 1)
  return pages.find(part => cid ? part.cid === cid : part.page === page)
}

export async function getPlaybackVideoInfo(params: { aid?: string, bvid?: string }, signal?: AbortSignal): Promise<VideoInfo> {
  signal?.throwIfAborted()
  const account = getUserID()
  const key = `${account}:${params.bvid || params.aid}`
  const hit = recent.get(key)
  if (hit && hit.expires > Date.now())
    return hit.info

  let read = pending.get(key)
  if (!read) {
    const controller = new AbortController()
    const task = api.video.getVideoInfo(params, { signal: controller.signal }).then((info: VideoInfo) => {
      controller.signal.throwIfAborted()
      if (account !== getUserID())
        throw new DOMException('Account changed', 'AbortError')
      if (info.code === 0 && info.data && !info.data.no_cache
        && (params.bvid ? info.data.bvid === params.bvid : String(info.data.aid) === params.aid)) {
        const entry = { info, expires: Date.now() + 60_000 }
        for (const id of [info.data.aid, info.data.bvid]) {
          const alias = `${account}:${id}`
          recent.delete(alias)
          recent.set(alias, entry)
        }
        // Two aliases per manuscript, at most eight recently loaded responses.
        while (recent.size > 16)
          recent.delete(recent.keys().next().value!)
      }
      return info
    }).finally(() => {
      if (pending.get(key)?.controller === controller)
        pending.delete(key)
    })
    read = { controller, task, readers: 0 }
    pending.set(key, read)
  }
  read.readers++
  try {
    return await waitWithSignal(read.task, signal)
  }
  finally {
    if (--read.readers === 0 && pending.get(key) === read) {
      pending.delete(key)
      read.controller.abort()
    }
  }
}
