import type { VideoInfo } from '~/models/video/videoInfo'

import { parsePlaybackTabUrl } from './playbackTab'
import type { WatchLaterMutationOwner } from './watchLater'

const DURATION_TOLERANCE_SECONDS = 2
const END_POSITION_TOLERANCE_SECONDS = 1

/** The final CID/page and full duration must agree with the authoritative manuscript. */
export function isCompletedWatchLaterManuscript(href: string, duration: number, response: VideoInfo): boolean {
  const target = parsePlaybackTabUrl(href)
  const url = new URL(href)
  const data = response.data
  if (!target || response.code !== 0 || !data || !Number.isSafeInteger(data.aid) || data.aid <= 0
    || ('aid' in target && target.aid !== data.aid) || ('bvid' in target && target.bvid !== data.bvid)
    || 'epid' in target || 'seasonId' in target || !Array.isArray(data.pages) || data.pages.length !== data.videos) {
    return false
  }
  const last = data.pages.at(-1)
  if (!last || last.page !== data.videos || !Number.isSafeInteger(last.cid) || last.cid <= 0)
    return false
  const cid = Number(url.searchParams.get('cid'))
  const page = Number(url.searchParams.get('p') || 1)
  return (cid ? cid === last.cid : page === last.page)
    && Number.isFinite(duration) && duration > 0 && last.duration > 0 && Math.abs(last.duration - duration) <= DURATION_TOLERANCE_SECONDS
}

interface Dependencies {
  getVideo: () => HTMLVideoElement | null
  getHref: () => string
  capture: () => WatchLaterMutationOwner
  isEligible: () => boolean
  isAdvertisement: () => boolean
  readInfo: (href: string) => Promise<VideoInfo>
  remove: (aid: number, isCurrent: () => boolean) => Promise<void>
  onFailure: () => void
}

/** A single main-media session, using the existing route/setting/DOM lifecycle. */
export function createWatchLaterCompletion(dependencies: Dependencies) {
  let session: { video: HTMLVideoElement, source: string, href: string, account: WatchLaterMutationOwner, info: Promise<VideoInfo | undefined>, handled: boolean } | undefined
  let previous: { video: HTMLVideoElement, source: string } | undefined
  function invalidate(blockPrevious = true) {
    if (session && blockPrevious)
      previous = session
    else if (!blockPrevious)
      previous = undefined
    session = undefined
  }
  function ready(video: HTMLVideoElement) {
    if (video !== dependencies.getVideo() || !dependencies.isEligible() || video.ended || video.readyState < 1 || dependencies.isAdvertisement())
      return
    const source = video.currentSrc || video.getAttribute('src') || ''
    const href = dependencies.getHref()
    const account = dependencies.capture()
    if (!source || !account.isCurrent() || (previous?.video === video && previous.source === source))
      return
    if (session?.video === video && session.source === source && session.href === href && session.account.isCurrent()) {
      if (session.handled && video.currentTime <= END_POSITION_TOLERANCE_SECONDS)
        session.handled = false
      return
    }
    session = { video, source, href, account, info: dependencies.readInfo(href).catch(() => undefined), handled: false }
    previous = undefined
  }
  async function ended(video: HTMLVideoElement) {
    const owner = session
    const current = () => owner === session && !!owner && dependencies.isEligible()
      && dependencies.getVideo() === video && dependencies.getHref() === owner.href
      && owner.account.isCurrent()
      && (video.currentSrc || video.getAttribute('src') || '') === owner.source
    if (!owner || !current() || owner.handled || video !== owner.video || !video.ended || video.seeking
      || !Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime < video.duration - END_POSITION_TOLERANCE_SECONDS
      || dependencies.isAdvertisement()) {
      return
    }
    owner.handled = true
    const duration = video.duration
    const info = await owner.info
    if (!current() || !info || !isCompletedWatchLaterManuscript(owner.href, duration, info))
      return
    try {
      await dependencies.remove(info.data.aid, current)
    }
    catch {
      if (current())
        dependencies.onFailure()
    }
  }
  return { ready, ended, invalidate }
}
