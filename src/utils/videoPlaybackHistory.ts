import { withRequestDeadline } from '~/utils/abort'
import type { VideoIdentity } from '~/utils/videoVisitRecord'

export interface PlaybackHistoryIdentity extends VideoIdentity { duration?: number }
interface Dependencies {
  media: () => HTMLVideoElement | null
  navigation: () => string
  epoch: () => string
  eligible: () => boolean
  advertisement: () => boolean
  identity: (video: HTMLVideoElement, signal: AbortSignal) => Promise<PlaybackHistoryIdentity | undefined>
  now: () => number
  record: (identity: VideoIdentity, progress: number, duration: number | undefined, completed: boolean, epoch: string) => void
  flush: () => void
}
interface Session {
  video: HTMLVideoElement
  source: string
  navigation: string
  epoch: string
  identity: PlaybackHistoryIdentity
  lastTime: number | undefined
  lastSample: number
  played: number
  ranges: Array<[number, number]>
  coverageUnknown: boolean
  progress: number
  persistedAt: number
  dirty: boolean
}

/** Event-driven main-media evidence. Seeking changes the baseline, never coverage. */
export function createVideoPlaybackHistory(dependencies: Dependencies) {
  let session: Session | undefined
  let request: { video: HTMLVideoElement, source: string, controller: AbortController } | undefined
  let blocked: { video: HTMLVideoElement, source: string } | undefined
  let generation = 0
  let disposed = false
  const sourceOf = (video: HTMLVideoElement) => video.currentSrc || video.getAttribute('src') || ''
  const identityKey = (value: PlaybackHistoryIdentity) => `${value.aid || value.bvid}|${value.epid ?? ''}|${value.cid ?? value.page ?? ''}`
  const current = (owner: Session) => !disposed && session === owner && dependencies.eligible()
    && dependencies.media() === owner.video && sourceOf(owner.video) === owner.source
    && dependencies.navigation() === owner.navigation && dependencies.epoch() === owner.epoch

  function flush(owner = session, ended = false) {
    if (!owner || (!owner.dirty && !ended) || owner.played < Math.min(3, (owner.identity.duration ?? 6) / 2))
      return
    const duration = owner.identity.duration
    const coverage = owner.ranges.reduce((total, [start, end]) => total + end - start, 0)
    const completed = Boolean(ended && duration && !owner.coverageUnknown
      && Math.abs(owner.video.duration - duration) <= 2 && owner.progress >= duration - 1 && coverage >= duration * 0.95)
    dependencies.record(owner.identity, owner.progress, duration, completed, owner.epoch)
    dependencies.flush()
    owner.persistedAt = dependencies.now()
    owner.dirty = false
  }

  async function ready(video: HTMLVideoElement) {
    const source = sourceOf(video)
    if (disposed || !dependencies.eligible() || video !== dependencies.media() || !dependencies.epoch()
      || !source || video.readyState < 1 || (video.paused && !session) || dependencies.advertisement()
      || (blocked?.video === video && blocked.source === source)) {
      return
    }
    if (session && current(session))
      return
    if (request?.video === video && request.source === source)
      return
    request?.controller.abort()
    const owner = { video, source, controller: new AbortController() }
    const version = generation
    const navigation = dependencies.navigation()
    const epoch = dependencies.epoch()
    request = owner
    try {
      const identity = await withRequestDeadline(signal => dependencies.identity(video, signal), { signal: owner.controller.signal })
      if (!identity || disposed || version !== generation || request !== owner || video !== dependencies.media()
        || navigation !== dependencies.navigation() || source !== sourceOf(video) || epoch !== dependencies.epoch()) {
        return
      }
      const previous = session
      flush(previous)
      const same = previous?.epoch === epoch && identityKey(previous.identity) === identityKey(identity)
      session = {
        video,
        source,
        navigation,
        epoch,
        identity,
        lastTime: video.currentTime,
        lastSample: dependencies.now(),
        played: same ? previous.played : 0,
        ranges: same ? previous.ranges : [],
        coverageUnknown: same ? previous.coverageUnknown : false,
        progress: same ? previous.progress : video.currentTime,
        persistedAt: same ? previous.persistedAt : 0,
        dirty: false,
      }
      blocked = undefined
    }
    catch { /* An unconfirmed identity cannot create local playback evidence. */ }
    finally {
      if (request === owner)
        request = undefined
    }
  }

  function sample(video: HTMLVideoElement) {
    const owner = session
    if (!owner || video !== owner.video || !current(owner))
      return
    const now = dependencies.now()
    const previousTime = owner.lastTime
    const elapsed = (now - owner.lastSample) / 1000
    owner.lastSample = now
    owner.lastTime = video.currentTime
    const step = previousTime === undefined ? 0 : video.currentTime - previousTime
    if (video.paused || video.seeking || dependencies.advertisement() || !Number.isFinite(step)
      || step <= 0 || elapsed <= 0 || elapsed > 3 || step > elapsed * Math.max(1, video.playbackRate) + 0.5) {
      return
    }
    owner.played += step
    owner.progress = video.currentTime
    owner.dirty = true
    let start = previousTime!
    let end = video.currentTime
    owner.ranges = owner.ranges.filter(([left, right]) => {
      if (right < start - 0.05 || left > end + 0.05)
        return true
      start = Math.min(start, left)
      end = Math.max(end, right)
      return false
    })
    if (owner.ranges.length < 64)
      owner.ranges.push([start, end])
    else
      owner.coverageUnknown = true
    if (!owner.persistedAt || now - owner.persistedAt >= 15_000)
      flush(owner)
  }

  function event(event: Event) {
    const video = dependencies.media()
    if (!video || event.target !== video)
      return
    if (event.type === 'loadedmetadata' || event.type === 'playing') {
      void ready(video)
      return
    }
    if (event.type === 'timeupdate') {
      sample(video)
      return
    }
    const owner = session
    if (!owner || owner.video !== video)
      return
    if (event.type === 'seeking' || event.type === 'seeked') {
      owner.lastTime = undefined
      owner.lastSample = dependencies.now()
    }
    else if ((event.type === 'pause' || event.type === 'ended') && current(owner) && !dependencies.advertisement()) {
      flush(owner, event.type === 'ended' && video.ended && !video.seeking)
    }
    else if (event.type === 'emptied') {
      flush(owner)
      // Retain identity/coverage across quality changes, but never sample empty media.
      owner.lastTime = undefined
    }
  }

  function invalidate(blockPrevious = true) {
    generation++
    request?.controller.abort()
    request = undefined
    flush()
    blocked = blockPrevious && session ? { video: session.video, source: session.source } : undefined
    session = undefined
  }
  return {
    event,
    ready,
    invalidate,
    flush: () => flush(),
    dispose() {
      invalidate()
      disposed = true
    },
  }
}
