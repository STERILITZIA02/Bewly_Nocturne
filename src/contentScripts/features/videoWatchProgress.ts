import { watch } from 'vue'

import { onRouteChange } from '~/composables/useRouteState'
import { IFRAME_ACTIVITY_CHANGE } from '~/constants/immersive'
import { settings } from '~/logic'
import { waitWithSignal } from '~/utils/abort'
import api from '~/utils/api'
import { isIframeDocumentActive } from '~/utils/iframeActivity'
import { resolvePgcEpisodeVideoIds } from '~/utils/pgcEpisode'
import { getPlaybackNavigationKey, parsePlaybackTabUrl } from '~/utils/playbackTab'
import { getVideoElement, isPlayerAdvertisement } from '~/utils/playerMedia'
import { isNativeVideoComponentReady, readNativePlaybackEpisodeId } from '~/utils/videoMetadataBridge'
import type { PlaybackHistoryIdentity } from '~/utils/videoPlaybackHistory'
import { createVideoPlaybackHistory } from '~/utils/videoPlaybackHistory'
import { flushVideoVisitHistory, recordVideoVisitFromUrl, recordVideoWatchProgress, videoVisitHistoryEpoch } from '~/utils/videoVisitHistory'

import { hasPlayerMediaMutation, observePlayerDom } from '../playerDomLifecycle'

export function setupVideoWatchProgress() {
  let media: HTMLVideoElement | null = null
  let navigation = ''
  let detach: (() => void) | undefined
  let identity: PlaybackHistoryIdentity | undefined
  const tracker = createVideoPlaybackHistory({
    media: () => media,
    navigation: () => navigation,
    epoch: () => videoVisitHistoryEpoch.value,
    eligible: () => isIframeDocumentActive() && settings.value.showVideoWatchedBadge && Boolean(navigation),
    advertisement: () => isPlayerAdvertisement(media),
    async identity(video, signal) {
      if (isNativeVideoComponentReady(video) === false)
        return
      if (identity)
        return identity
      const currentNavigation = navigation
      const resolved = await (async () => {
        const target = parsePlaybackTabUrl(location.href)
        if (!target)
          return
        const url = new URL(location.href)
        const epid = 'epid' in target ? target.epid : 'seasonId' in target ? readNativePlaybackEpisodeId(video) : undefined
        if ('seasonId' in target && !epid)
          return
        const ids = epid ? await waitWithSignal(resolvePgcEpisodeVideoIds(epid), signal) : target
        if (!ids)
          return
        signal.throwIfAborted()
        const result = await api.video.getVideoInfo('aid' in ids ? { aid: String(ids.aid) } : 'bvid' in ids ? { bvid: ids.bvid } : {}, { signal })
        if (result.code !== 0 || !result.data || !Array.isArray(result.data.pages))
          return epid ? { epid } : undefined
        const data = result.data
        if (('aid' in ids && Number(ids.aid) !== data.aid) || ('bvid' in ids && ids.bvid && ids.bvid !== data.bvid))
          return
        const page = Number(url.searchParams.get('p') || 1)
        const cid = Number(url.searchParams.get('cid'))
        const selected = data.pages.find((part: { cid: number, page: number }) => cid ? part.cid === cid : part.page === page)
        if (!selected || !Number.isSafeInteger(selected.cid) || selected.cid <= 0)
          return
        return { aid: data.aid, bvid: data.bvid, epid, cid: selected.cid, page: selected.page, pageCount: data.videos, duration: Number.isFinite(selected.duration) && selected.duration > 0 ? selected.duration : undefined }
      })()
      if (currentNavigation === navigation && !signal.aborted)
        identity = resolved
      return resolved
    },
    now: () => performance.now(),
    record: recordVideoWatchProgress,
    flush: () => { void flushVideoVisitHistory() },
  })
  const events = ['loadedmetadata', 'playing', 'timeupdate', 'seeking', 'seeked', 'pause', 'ended', 'emptied']
  const syncMedia = () => {
    const candidate = getVideoElement()
    // Only native DOM media properties are read in ISOLATED. An unsupported
    // custom player remains browsing-only rather than guessing page expandos.
    media = candidate instanceof HTMLMediaElement ? candidate : null
    if (media)
      void tracker.ready(media)
  }
  function syncRoute() {
    const key = getPlaybackNavigationKey(location.href)
    if (key !== navigation) {
      tracker.invalidate()
      identity = undefined
      navigation = key
    }
    detach?.()
    detach = undefined
    if (!navigation || !settings.value.showVideoWatchedBadge || !isIframeDocumentActive())
      return
    const stopObserver = observePlayerDom((records) => {
      if (hasPlayerMediaMutation(records))
        syncMedia()
    })
    events.forEach(name => window.addEventListener(name, tracker.event, true))
    syncMedia()
    detach = () => {
      stopObserver()
      events.forEach(name => window.removeEventListener(name, tracker.event, true))
    }
  }
  const stopRoute = onRouteChange(syncRoute, true)
  const stopSettings = watch([() => settings.value.showVideoWatchedBadge, videoVisitHistoryEpoch], () => {
    tracker.invalidate(false)
    identity = undefined
    if (videoVisitHistoryEpoch.value)
      recordVideoVisitFromUrl(location.href)
    syncRoute()
  }, { immediate: true, flush: 'sync' })
  const flush = () => tracker.flush()
  const activityChanged = () => {
    tracker.invalidate()
    identity = undefined
    syncRoute()
    if (isIframeDocumentActive())
      recordVideoVisitFromUrl(location.href)
  }
  window.addEventListener(IFRAME_ACTIVITY_CHANGE, activityChanged)
  document.addEventListener('visibilitychange', flush)
  window.addEventListener('pagehide', flush)
  return () => {
    stopRoute()
    stopSettings()
    detach?.()
    tracker.dispose()
    document.removeEventListener('visibilitychange', flush)
    window.removeEventListener('pagehide', flush)
    window.removeEventListener(IFRAME_ACTIVITY_CHANGE, activityChanged)
    media = null
  }
}
