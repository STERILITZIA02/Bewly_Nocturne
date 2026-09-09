import { onScopeDispose, reactive, readonly, ref, watch } from 'vue'

import type { DisplayMoment } from '~/components/MomentCard/types'
import { DELAYED_MEDIA_PREVIEW_MS } from '~/constants/mediaPreview'
import { settings } from '~/logic'
import type { AccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { loadFlvModule } from '~/utils/flv'
import { loadHlsModule } from '~/utils/hls'
import { releaseMediaElement as releasePreviewVideoElement } from '~/utils/mediaResources'
import { normalizeMomentRemoteUrl as httpsUrl } from '~/utils/momentUrl'
import { createPreviewMediaSession } from '~/utils/previewMediaSession'

export function useMomentPreviews(getAccountId: () => AccountId) {
  const streamSession = createPreviewMediaSession()
  let disposed = false
  let cacheGeneration = 0
  const hoveredMediaId = ref('')
  const previewState = ref<'idle' | 'waiting' | 'loading' | 'ready'>('idle')
  let previewEnterTimer: ReturnType<typeof setTimeout> | undefined
  const previewSources = new Map<string, string>()
  let hoveredSource = ''
  const previewUrls = reactive<Record<string, string>>({})
  const videoCidCache = new Map<string, number>()
  const videoCidRequests = new Map<string, Promise<number | undefined>>()
  let activePreviewVideo: { id: string, url: string, accountId: AccountId, element: HTMLVideoElement } | null = null
  const previewGeneration = ref(0)
  const MAX_PREVIEW_CACHE = 12
  const MAX_VIDEO_CID_CACHE = 80
  function prunePreviewCache(visibleMomentIds: ReadonlySet<string>) {
    const keys = Object.keys(previewUrls)
    if (keys.length <= MAX_PREVIEW_CACHE)
      return

    keys.forEach((id) => {
      if (id === hoveredMediaId.value)
        return
      if (visibleMomentIds.has(id))
        return
      delete previewUrls[id]
      previewSources.delete(id)
    })

    // 仍过多时淘汰更早的非悬停项
    const remain = Object.keys(previewUrls).filter(id => id !== hoveredMediaId.value)
    const available = MAX_PREVIEW_CACHE - Number(Boolean(previewUrls[hoveredMediaId.value]))
    if (remain.length > available) {
      remain.slice(0, remain.length - available).forEach((id) => {
        delete previewUrls[id]
        previewSources.delete(id)
      })
    }
  }

  function cleanupLivePreviewTransports() {
    streamSession.clear()
  }

  function cleanupLivePreviewPlayer(invalidate = true) {
    if (invalidate)
      previewGeneration.value++
    cleanupLivePreviewTransports()
    if (activePreviewVideo) {
      releasePreviewVideoElement(activePreviewVideo.element)
      activePreviewVideo = null
    }
  }

  function isLivePreviewCurrent(generation: number, momentId: string, url: string, videoEl: HTMLVideoElement) {
    return !disposed && generation === previewGeneration.value
      && hoveredMediaId.value === momentId
      && previewUrls[momentId] === url
      && videoEl.isConnected
      && activePreviewVideo?.element === videoEl && activePreviewVideo.accountId === getAccountId()
  }

  function failLivePreview(generation: number, momentId: string, url: string, videoEl: HTMLVideoElement) {
    if (!isLivePreviewCurrent(generation, momentId, url, videoEl))
      return
    cleanupLivePreviewTransports()
    releasePreviewVideoElement(videoEl)
    if (activePreviewVideo?.element === videoEl)
      activePreviewVideo = null
    previewState.value = 'idle'
    hoveredMediaId.value = ''
    delete previewUrls[momentId]
    previewSources.delete(momentId)
  }

  async function setupStreamPreview(url: string, videoEl: HTMLVideoElement, momentId: string, generation: number) {
    if (!isLivePreviewCurrent(generation, momentId, url, videoEl))
      return
    cleanupLivePreviewTransports()
    releasePreviewVideoElement(videoEl)
    previewState.value = 'loading'
    const frameReady = () => {
      if (isLivePreviewCurrent(generation, momentId, url, videoEl) && videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
        previewState.value = 'ready'
    }
    for (const name of ['loadeddata', 'canplay'])
      videoEl.addEventListener(name, frameReady, { signal: streamSession.signal })
    videoEl.addEventListener('error', () => failLivePreview(generation, momentId, url, videoEl), { signal: streamSession.signal })

    if (url.includes('.flv')) {
      try {
        const flvjsModule = await loadFlvModule()
        const flvjs = flvjsModule.default
        if (!isLivePreviewCurrent(generation, momentId, url, videoEl))
          return
        if (!flvjs.isSupported()) {
          failLivePreview(generation, momentId, url, videoEl)
          return
        }

        const player = flvjs.createPlayer({
          type: 'flv',
          url,
          isLive: hoveredSource.startsWith('live:'),
        }, {
          enableWorker: false,
          enableStashBuffer: false,
          stashInitialSize: 128,
          lazyLoad: false,
        })
        streamSession.flv = player
        player.attachMediaElement(videoEl)
        player.on(flvjs.Events.ERROR, () => {
          if (streamSession.flv === player)
            failLivePreview(generation, momentId, url, videoEl)
        })
        player.load()
        void videoEl.play().catch(() => {
          if (streamSession.flv === player)
            failLivePreview(generation, momentId, url, videoEl)
        })
      }
      catch {
        failLivePreview(generation, momentId, url, videoEl)
      }
      return
    }

    if (url.includes('m3u8')) {
      try {
        const Hls = (await loadHlsModule()).default
        if (!isLivePreviewCurrent(generation, momentId, url, videoEl))
          return
        if (Hls.isSupported()) {
          const player = new Hls({
            enableWorker: true,
            lowLatencyMode: hoveredSource.startsWith('live:'),
            maxBufferLength: 10,
          })
          streamSession.hls = player
          player.loadSource(url)
          player.attachMedia(videoEl)
          player.on(Hls.Events.MANIFEST_PARSED, () => {
            if (streamSession.hls !== player || !isLivePreviewCurrent(generation, momentId, url, videoEl))
              return
            void videoEl.play().catch(() => {
              if (streamSession.hls === player)
                failLivePreview(generation, momentId, url, videoEl)
            })
          })
          player.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && streamSession.hls === player)
              failLivePreview(generation, momentId, url, videoEl)
          })
          return
        }
        if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = url
          void videoEl.play().catch(() => {
            failLivePreview(generation, momentId, url, videoEl)
          })
        }
        else {
          failLivePreview(generation, momentId, url, videoEl)
        }
      }
      catch {
        failLivePreview(generation, momentId, url, videoEl)
      }
      return
    }

    videoEl.src = url
    void videoEl.play().catch(() => {
      failLivePreview(generation, momentId, url, videoEl)
    })
  }

  function isMomentPreviewEnabled(moment: DisplayMoment) {
    if (moment.isLive)
      return settings.value.momentsEnableLivePreview
    if (moment.isVideo || moment.forward?.video)
      return settings.value.momentsEnableVideoPreview
    return false
  }

  function cacheVideoCid(bvid: string, cid: number) {
    videoCidCache.delete(bvid)
    videoCidCache.set(bvid, cid)
    while (videoCidCache.size > MAX_VIDEO_CID_CACHE) {
      const oldestBvid = videoCidCache.keys().next().value
      if (!oldestBvid)
        break
      videoCidCache.delete(oldestBvid)
    }
  }

  async function getVideoCid(bvid: string, page: number) {
    const key = `${bvid}:${page}`
    const cachedCid = videoCidCache.get(key)
    if (cachedCid) {
      cacheVideoCid(key, cachedCid)
      return cachedCid
    }

    const pendingRequest = videoCidRequests.get(key)
    if (pendingRequest)
      return pendingRequest

    const accountId = getAccountId()
    const generation = cacheGeneration
    const request = api.video.getVideoPageList({ bvid })
      .then((response) => {
        const cid = Number(response.code === 0 ? response.data?.find((item: { page: number, cid: number }) => item.page === page)?.cid ?? (page === 1 ? response.data?.[0]?.cid : 0) : 0)
        if (!cid)
          return undefined
        if (!disposed && generation === cacheGeneration && accountId === getAccountId())
          cacheVideoCid(key, cid)
        return cid
      })
      .catch(() => undefined)
      .finally(() => {
        if (videoCidRequests.get(key) === request)
          videoCidRequests.delete(key)
      })
    videoCidRequests.set(key, request)
    return request
  }

  function mediaIdentity(moment: DisplayMoment) {
    const video = moment.forward?.video ?? moment
    const url = moment.forward?.video?.url ?? moment.videoUrl
    const requestedPage = url ? Number(new URL(url, 'https://www.bilibili.com').searchParams.get('p')) : 1
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
    return { video, page, source: moment.isLive ? `live:${moment.roomId}` : `${video.bvid}:${video.cid ?? ''}:${page}` }
  }

  async function handleMediaEnter(moment: DisplayMoment) {
    if (disposed || !isMomentPreviewEnabled(moment))
      return
    if (activePreviewVideo?.element.matches(':fullscreen') && activePreviewVideo.id !== moment.id)
      return
    const { source } = mediaIdentity(moment)
    if (hoveredMediaId.value === moment.id && hoveredSource === source)
      return
    clearTimeout(previewEnterTimer)
    previewEnterTimer = undefined

    if (activePreviewVideo && (activePreviewVideo.id !== moment.id || hoveredSource !== source))
      cleanupLivePreviewPlayer()
    hoveredMediaId.value = moment.id
    hoveredSource = source
    const generation = ++previewGeneration.value
    if (previewSources.get(moment.id) !== source)
      delete previewUrls[moment.id]
    const accountId = getAccountId()
    if (!moment.isLive && settings.value.momentsVideoPreviewDelayed) {
      previewState.value = 'waiting'
      previewEnterTimer = setTimeout(() => {
        previewEnterTimer = undefined
        void loadMomentPreview(moment, generation, accountId, source)
      }, DELAYED_MEDIA_PREVIEW_MS)
    }
    else {
      await loadMomentPreview(moment, generation, accountId, source)
    }
  }

  async function loadMomentPreview(moment: DisplayMoment, generation: number, accountId: AccountId, source: string) {
    const isCurrent = () => !disposed && generation === previewGeneration.value && accountId === getAccountId()
      && hoveredMediaId.value === moment.id && hoveredSource === source && mediaIdentity(moment).source === source && isMomentPreviewEnabled(moment)
    if (!isCurrent())
      return
    previewState.value = 'loading'
    if (previewUrls[moment.id])
      return
    previewSources.set(moment.id, source)

    try {
      if (moment.isLive && moment.roomId) {
        const res = await api.live.getLivePlayUrl({
          cid: moment.roomId,
          platform: 'web',
          qn: 80,
        })
        if (!isCurrent())
          return
        if (res.code === 0 && res.data?.durl?.[0]?.url)
          previewUrls[moment.id] = httpsUrl(res.data.durl[0].url)
        else
          release(moment.id)
        return
      }

      const { video: media, page } = mediaIdentity(moment)
      if (!media.bvid) {
        release(moment.id)
        return
      }

      const cid = media.cid || await getVideoCid(media.bvid, page)
      if (!isCurrent())
        return
      if (!cid) {
        release(moment.id)
        return
      }

      const preview = await api.video.getVideoPreview({ bvid: media.bvid, cid })
      if (
        preview.code === 0
        && preview.data?.durl?.[0]?.url
        && isCurrent()
      ) {
        previewUrls[moment.id] = httpsUrl(preview.data.durl[0].url)
      }
      else if (isCurrent()) {
        release(moment.id)
      }
    }
    catch {
      if (isCurrent())
        release(moment.id)
    }
  }

  function handleMediaLeave(moment: DisplayMoment) {
    if (activePreviewVideo?.id === moment.id && activePreviewVideo.element.matches(':fullscreen'))
      return
    if (hoveredMediaId.value !== moment.id)
      return
    release(moment.id)
  }

  function bindPreviewVideo(el: Element | null, moment: DisplayMoment) {
    if (!(el instanceof HTMLVideoElement)) {
      if (activePreviewVideo?.id === moment.id)
        cleanupLivePreviewPlayer()
      return
    }
    const url = previewUrls[moment.id]
    if (!url || hoveredMediaId.value !== moment.id)
      return
    if (activePreviewVideo?.element === el && activePreviewVideo.id === moment.id && activePreviewVideo.url === url)
      return

    if (activePreviewVideo && activePreviewVideo.element !== el)
      cleanupLivePreviewPlayer(false)
    activePreviewVideo = { id: moment.id, url, accountId: getAccountId(), element: el }
    const generation = previewGeneration.value
    void setupStreamPreview(url, el, moment.id, generation).catch(() => {
      failLivePreview(generation, moment.id, url, el)
    })
  }

  function release(id: string) {
    if (activePreviewVideo?.id === id && activePreviewVideo.element.matches(':fullscreen'))
      return
    if (hoveredMediaId.value === id) {
      hoveredMediaId.value = ''
      clearTimeout(previewEnterTimer)
      previewEnterTimer = undefined
      previewState.value = 'idle'
      previewGeneration.value++
    }
    if (activePreviewVideo?.id === id)
      cleanupLivePreviewPlayer()
    delete previewUrls[id]
    previewSources.delete(id)
  }
  function clear() {
    clearTimeout(previewEnterTimer)
    previewEnterTimer = undefined
    previewState.value = 'idle'
    hoveredMediaId.value = ''
    cleanupLivePreviewPlayer()
    Object.keys(previewUrls).forEach(key => delete previewUrls[key])
    previewSources.clear()
  }
  function reset() {
    cacheGeneration++
    clear()
    videoCidCache.clear()
    videoCidRequests.clear()
  }
  onScopeDispose(() => {
    disposed = true
    reset()
  })
  watch(() => [settings.value.momentsEnableLivePreview, settings.value.momentsEnableVideoPreview, settings.value.momentsVideoPreviewDelayed, settings.value.momentsOnlyCoverVideoPreview], clear)
  return {
    hoveredMediaId: readonly(hoveredMediaId),
    previewUrls: readonly(previewUrls),
    previewState: readonly(previewState),
    previewGeneration: readonly(previewGeneration),
    handleMediaEnter,
    handleMediaLeave,
    bindPreviewVideo,
    prune: prunePreviewCache,
    release,
    clear,
    reset,
  }
}
