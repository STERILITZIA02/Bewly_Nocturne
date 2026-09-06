import { onScopeDispose, reactive, readonly, ref } from 'vue'

import type { DisplayMoment } from '~/components/MomentCard/types'
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
  const previewUrls = reactive<Record<string, string>>({})
  const videoCidCache = new Map<string, number>()
  const videoCidRequests = new Map<string, Promise<number | undefined>>()
  let activePreviewVideo: { id: string, element: HTMLVideoElement } | null = null
  let livePreviewGeneration = 0
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
    })

    // 仍过多时淘汰更早的非悬停项
    const remain = Object.keys(previewUrls).filter(id => id !== hoveredMediaId.value)
    if (remain.length > MAX_PREVIEW_CACHE) {
      remain.slice(0, remain.length - MAX_PREVIEW_CACHE).forEach((id) => {
        delete previewUrls[id]
      })
    }
  }

  function cleanupLivePreviewTransports() {
    streamSession.clear()
  }

  function cleanupLivePreviewPlayer(invalidate = true) {
    if (invalidate)
      livePreviewGeneration++
    cleanupLivePreviewTransports()
    if (activePreviewVideo) {
      releasePreviewVideoElement(activePreviewVideo.element)
      activePreviewVideo = null
    }
  }

  function isLivePreviewCurrent(generation: number, momentId: string, url: string, videoEl: HTMLVideoElement) {
    return !disposed && generation === livePreviewGeneration
      && hoveredMediaId.value === momentId
      && previewUrls[momentId] === url
      && videoEl.isConnected
  }

  function failLivePreview(generation: number, momentId: string, url: string, videoEl: HTMLVideoElement) {
    if (!isLivePreviewCurrent(generation, momentId, url, videoEl))
      return
    cleanupLivePreviewTransports()
    releasePreviewVideoElement(videoEl)
    if (activePreviewVideo?.element === videoEl)
      activePreviewVideo = null
  }

  async function setupStreamPreview(url: string, videoEl: HTMLVideoElement, momentId: string, generation: number) {
    if (!isLivePreviewCurrent(generation, momentId, url, videoEl))
      return
    cleanupLivePreviewTransports()
    releasePreviewVideoElement(videoEl)

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
          isLive: true,
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
            lowLatencyMode: true,
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
    if (moment.isVideo)
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

  async function getVideoCid(bvid: string) {
    const cachedCid = videoCidCache.get(bvid)
    if (cachedCid) {
      cacheVideoCid(bvid, cachedCid)
      return cachedCid
    }

    const pendingRequest = videoCidRequests.get(bvid)
    if (pendingRequest)
      return pendingRequest

    const accountId = getAccountId()
    const generation = cacheGeneration
    const request = api.video.getVideoPageList({ bvid })
      .then((response) => {
        const cid = Number(response.code === 0 ? response.data?.[0]?.cid : 0)
        if (!cid)
          return undefined
        if (!disposed && generation === cacheGeneration && accountId === getAccountId())
          cacheVideoCid(bvid, cid)
        return cid
      })
      .catch(() => undefined)
      .finally(() => {
        if (videoCidRequests.get(bvid) === request)
          videoCidRequests.delete(bvid)
      })
    videoCidRequests.set(bvid, request)
    return request
  }

  async function handleMediaEnter(moment: DisplayMoment) {
    if (disposed || !isMomentPreviewEnabled(moment))
      return

    if (activePreviewVideo && activePreviewVideo.id !== moment.id)
      cleanupLivePreviewPlayer()
    hoveredMediaId.value = moment.id
    const generation = ++livePreviewGeneration

    if (previewUrls[moment.id])
      return

    try {
      if (moment.isLive && moment.roomId) {
        const res = await api.live.getLivePlayUrl({
          cid: moment.roomId,
          platform: 'web',
          qn: 80,
        })
        if (generation !== livePreviewGeneration || hoveredMediaId.value !== moment.id || !isMomentPreviewEnabled(moment))
          return
        if (res.code === 0 && res.data?.durl?.[0]?.url)
          previewUrls[moment.id] = httpsUrl(res.data.durl[0].url)
        return
      }

      if (!moment.isVideo || !moment.bvid)
        return

      const cid = await getVideoCid(moment.bvid)
      if (!cid || generation !== livePreviewGeneration || hoveredMediaId.value !== moment.id || !isMomentPreviewEnabled(moment))
        return

      const preview = await api.video.getVideoPreview({ bvid: moment.bvid, cid })
      if (
        preview.code === 0
        && preview.data?.durl?.[0]?.url
        && generation === livePreviewGeneration
        && hoveredMediaId.value === moment.id
        && isMomentPreviewEnabled(moment)
      ) {
        previewUrls[moment.id] = httpsUrl(preview.data.durl[0].url)
      }
    }
    catch {
    // 预览加载失败时保留封面
    }
  }

  function handleMediaLeave(moment: DisplayMoment) {
    if (hoveredMediaId.value !== moment.id)
      return
    hoveredMediaId.value = ''
    cleanupLivePreviewPlayer()
    // 悬停结束即释放预览地址，避免缓存堆积
    if (previewUrls[moment.id])
      delete previewUrls[moment.id]
  }

  function bindPreviewVideo(el: Element | null, moment: DisplayMoment) {
    if (!(el instanceof HTMLVideoElement))
      return
    const url = previewUrls[moment.id]
    if (!url || hoveredMediaId.value !== moment.id)
      return

    if (activePreviewVideo && activePreviewVideo.element !== el)
      cleanupLivePreviewPlayer(false)
    activePreviewVideo = { id: moment.id, element: el }

    if (moment.isLive || url.includes('.flv') || url.includes('m3u8')) {
      const generation = livePreviewGeneration
      void setupStreamPreview(url, el, moment.id, generation).catch(() => {
        failLivePreview(generation, moment.id, url, el)
      })
    }
    else {
      void el.play().catch(() => {})
    }
  }

  function playPreview(event: Event) {
    const video = event.target as HTMLVideoElement
    void video.play().catch(() => {})
  }
  function release(id: string) {
    if (hoveredMediaId.value === id)
      hoveredMediaId.value = ''
    if (activePreviewVideo?.id === id)
      cleanupLivePreviewPlayer()
    delete previewUrls[id]
  }
  function clear() {
    hoveredMediaId.value = ''
    cleanupLivePreviewPlayer()
    Object.keys(previewUrls).forEach(key => delete previewUrls[key])
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
  return {
    hoveredMediaId: readonly(hoveredMediaId),
    previewUrls: readonly(previewUrls),
    handleMediaEnter,
    handleMediaLeave,
    bindPreviewVideo,
    playPreview,
    isMomentPreviewEnabled,
    prune: prunePreviewCache,
    release,
    clear,
    reset,
  }
}
