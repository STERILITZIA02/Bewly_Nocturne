import { createListenMediaSession } from '~/inject/listenMediaSession'
import { createMovedPgcReactBridge, getMountedPgcEventRoot } from '~/inject/movedPgcReact'
import { selectors } from '~/utils/bewlyWidescreen/constants'
import { getBilibiliLogicalPathname } from '~/utils/bilibiliLocale'
import type { ListenReturnRequest, ListenSuspendRequest, NativePlaybackUnit } from '~/utils/videoMetadataBridge'
import {
  getNativePlaybackUnitKey,
  isPgcPlaybackPage,
  matchesPlaybackUnit,
  parseVideoMetadataEvent,
  parseVideoPageIdentity,
  validateVideoPageMetadata,
  VIDEO_COMPONENT_CHANGED,
  VIDEO_COMPONENT_REQUEST,
  VIDEO_COMPONENT_RESPONSE,
  VIDEO_METADATA_CHANGED,
  VIDEO_METADATA_REQUEST,
  VIDEO_METADATA_RESPONSE,
} from '~/utils/videoMetadataBridge'

interface NativeVideoData {
  aid?: number
  bvid?: string
  pages?: unknown[]
  videos?: number
  ugc_season?: { id?: number }
}

interface NativeVideoApp {
  $el?: Element
  $children?: NativeVideoApp[]
  player?: NativePlayer
  cidMap?: Record<string, { aid: number, bvid: string, cids: Record<number, number> }>
  switchVideo?: (target: { aid: number, bvid: string, cid: number, p: number, t?: number }) => void
  videoData?: NativeVideoData
  isSection?: boolean
  $watch?: (getter: () => string, callback: () => void) => () => void
}

interface NativeVideoComponent {
  $el?: HTMLElement
  _isMounted?: boolean
  _isDestroyed?: boolean
  _isBeingDestroyed?: boolean
  $once?: (event: string, handler: () => void) => void
  $off?: (event: string, handler: () => void) => void
}

interface NativePlayer {
  pause?: () => void
  __core?: () => { getCorePlayer?: () => {
    getVideoElement?: () => HTMLElement
    getActiveStream?: () => { getProcessors?: () => Array<{
      getScheduleController?: () => { start?: () => void, stop?: () => void }
      getFragmentModel?: () => { abortRequests?: () => void }
    }> }
  } }
  mediaElement?: () => HTMLElement
  getManifest?: () => { aid?: number, bvid?: string, cid?: number, p?: number, episodeId?: number, seasonId?: number }
  getQuality?: () => { nowQ?: number, realQ?: number }
  getDuration?: (includePreview?: boolean) => number
}

export function getNativePlayer() {
  return (window as Window & { player?: NativePlayer }).player
}

interface BtrListenHandoff {
  version: number
  getOwner: () => number | null
  suspend: (video: HTMLElement, gate: number, previousGate?: number) => boolean
  resume: (video: HTMLElement, gate: number, intent: ListenReturnRequest) => boolean
  release: (gate: number) => boolean
}
function btrListenHandoff() {
  const api = (window as Window & { __biliThreadRipperDebug?: { listenHandoff?: BtrListenHandoff } }).__biliThreadRipperDebug?.listenHandoff
  return api?.version === 1 ? api : undefined
}
function btrInstalled() {
  return document.documentElement.hasAttribute('data-btr-userscript')
    || (window as Window & { __biliThreadRipper0901Installed?: boolean }).__biliThreadRipper0901Installed === true
}

export function setupVideoMetadataBridge(channelId: string) {
  const controller = new AbortController()
  const { signal } = controller
  let watchedApp: NativeVideoApp | undefined
  let stopWatch: (() => void) | undefined
  let lastSignature = ''
  let refreshQueued = false
  const nativeComponents = new Map<NativeVideoComponent, { node: HTMLElement, destroyed: () => void }>()
  const movedPgcBridge = createMovedPgcReactBridge()
  const mediaSession = createListenMediaSession()
  let listenOwner: { gate: number, unit: string } | undefined

  function getApp() {
    return (document.getElementById('app') as (HTMLElement & { __vue__?: NativeVideoApp }) | null)?.__vue__
  }

  function readMetadata() {
    const app = getApp()
    const initial = (window as Window & { __INITIAL_STATE__?: NativeVideoApp }).__INITIAL_STATE__
    for (const owner of [app, initial]) {
      const data = owner?.videoData
      if (!data)
        continue
      const metadata = validateVideoPageMetadata({
        aid: data.aid,
        bvid: data.bvid,
        pageCount: data.pages?.length || data.videos,
        isCollection: Boolean(owner.isSection || data.ugc_season?.id),
      }, location.href)
      if (metadata)
        return metadata
    }
    return null
  }

  function refresh() {
    if (signal.aborted)
      return null
    const app = parseVideoPageIdentity(location.href) ? getApp() : undefined
    if (app !== watchedApp) {
      stopWatch?.()
      stopWatch = undefined
      watchedApp = app
      if (typeof app?.$watch === 'function') {
        stopWatch = app.$watch(() => JSON.stringify([
          app.videoData?.aid,
          app.videoData?.bvid,
          app.videoData?.pages?.length,
          app.videoData?.videos,
          app.videoData?.ugc_season?.id,
          app.isSection,
        ]), scheduleRefresh)
      }
    }
    const metadata = readMetadata()
    const signature = JSON.stringify(metadata)
    if (signature !== lastSignature) {
      lastSignature = signature
      window.dispatchEvent(new CustomEvent(VIDEO_METADATA_CHANGED, {
        detail: JSON.stringify({ channelId, href: location.href, metadata }),
      }))
    }
    return metadata
  }

  function scheduleRefresh() {
    if (refreshQueued || signal.aborted)
      return
    refreshQueued = true
    queueMicrotask(() => {
      refreshQueued = false
      refresh()
    })
  }

  window.addEventListener(VIDEO_METADATA_REQUEST, (event) => {
    const request = parseVideoMetadataEvent(event)
    if (request?.channelId !== channelId || !Number.isSafeInteger(request.requestId) || request.href !== location.href)
      return
    const metadata = refresh()
    window.dispatchEvent(new CustomEvent(VIDEO_METADATA_RESPONSE, {
      detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, metadata }),
    }))
  }, { signal })
  const nativeComponentSelector = [...selectors.upPanel, ...selectors.toolbar, ...selectors.description, ...selectors.tags, ...selectors.mediaInfo, ...selectors.playlist, ...selectors.recommend].join(',')
  document.addEventListener(VIDEO_COMPONENT_REQUEST, (event) => {
    const request = parseVideoMetadataEvent(event)
    const node = event.target
    if (request?.channelId === channelId && Number.isSafeInteger(request.requestId) && request.href === location.href
      && node === document.documentElement && (request.listenMediaSession !== undefined || request.listenRelease !== undefined)) {
      if (request.listenRelease !== undefined) {
        const gate = request.listenRelease
        const handoff = btrListenHandoff()
        const released = Number.isSafeInteger(gate) && (!listenOwner || listenOwner.gate === gate)
          && (!handoff || handoff.getOwner() === null || handoff.release(gate as number))
        if (released)
          listenOwner = undefined
        node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
          detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, released }),
        }))
        return
      }
      let token
      if (request.listenMediaSession === true && (parseVideoPageIdentity(location.href) || isPgcPlaybackPage())) {
        token = request.requestId as number
        mediaSession?.claim(token)
      }
      else if (Number.isSafeInteger(request.listenMediaSession)) {
        mediaSession?.release(request.listenMediaSession as number)
      }
      node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, { detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, token }) }))
      return
    }
    const nativeMedia = node instanceof HTMLElement && node.matches('video, bwp-video')
    const favoriteDialog = node instanceof HTMLElement && node.matches('.collection-m-exp') && request?.favorite === true
    if (request?.channelId !== channelId || !Number.isSafeInteger(request.requestId)
      || request.href !== location.href || (!parseVideoPageIdentity(location.href) && !isPgcPlaybackPage() && !(nativeMedia && (request.adjustVolume !== undefined || request.playback === true)))
      || !(node instanceof HTMLElement) || !node.isConnected || (!node.matches(nativeComponentSelector) && !nativeMedia && !favoriteDialog)) {
      return
    }
    if (nativeMedia && request.switchPlayback) {
      const destination = request.switchPlayback as { href?: string, unit?: NativePlaybackUnit }
      const href = destination.href
      const target = typeof href === 'string' && parseVideoPageIdentity(href)
      let switched: NativePlaybackUnit | 'needs-unit' | undefined
      if (href && target && new URL(href).origin === location.origin && parseVideoPageIdentity(location.href)) {
        // Vue 2's router wrappers share their root element with the mounted
        // video component. Follow that branch without traversing player UI.
        let owner = getApp()
        while (owner && !owner.switchVideo)
          owner = owner.$children?.find(child => child.$el === owner?.$el)
        const url = new URL(href)
        const page = Number(url.searchParams.get('p') || 1)
        const known = owner?.cidMap?.[target.bvid ?? String(target.aid)]
        const unit = known?.cids[page] ? { aid: known.aid, bvid: known.bvid, cid: known.cids[page], page } : destination.unit
        try {
          if (owner?.switchVideo && owner.player?.mediaElement?.() === node) {
            if (!unit) {
              switched = 'needs-unit'
            }
            else if (/^BV[0-9a-z]{10}$/i.test(unit.bvid ?? '') && matchesPlaybackUnit(href, unit)) {
              const time = Number(url.searchParams.get('t'))
              owner.switchVideo({ aid: unit.aid, bvid: unit.bvid!, cid: unit.cid, p: unit.page, t: Number.isFinite(time) && time > 0 ? time : undefined })
              switched = unit
            }
          }
        }
        catch { /* A retired native owner leaves the caller its browser destination. */ }
      }
      node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
        detail: JSON.stringify({ channelId, requestId: request.requestId, href: request.href, switched }),
      }))
      return
    }
    if (favoriteDialog) {
      // The published native dialog renders rows with index keys and no folder
      // IDs in the DOM. Read its live owner in MAIN, not an ISOLATED expando.
      const owner = (node as HTMLElement & { __vue__?: NativeVideoComponent & { aid?: number, list?: Array<{ id?: number | string, favoured?: boolean, media_count?: number, max_count?: number }> } }).__vue__
      let favorite
      try {
        const manifest = getNativePlayer()?.getManifest?.()
        const route = parseVideoPageIdentity(location.href)
        const episode = /^\/bangumi\/play\/(ep|ss)(\d+)/.exec(getBilibiliLogicalPathname())
        const currentAid = route ? readMetadata()?.aid : episode && Number(manifest?.[episode[1] === 'ep' ? 'episodeId' : 'seasonId']) === Number(episode[2]) ? manifest?.aid : undefined
        if (owner?.$el === node && owner._isMounted && !owner._isDestroyed && !owner._isBeingDestroyed
          && Number.isSafeInteger(currentAid) && currentAid === Number(owner.aid) && Array.isArray(owner.list)) {
          const folders = owner.list.map(item => ({
            id: typeof item.id === 'string' || Number.isSafeInteger(item.id) ? String(item.id) : '',
            original: item.favoured,
            count: Number.isSafeInteger(item.media_count) && item.media_count! >= 0 ? item.media_count : undefined,
            capacity: Number.isSafeInteger(item.max_count) && item.max_count! > 0 ? item.max_count : undefined,
          }))
          if (folders.every(folder => /^[1-9]\d*$/.test(folder.id) && typeof folder.original === 'boolean'))
            favorite = { aid: currentAid, folders }
        }
      }
      catch { /* An unavailable native owner/capacity leaves native behavior intact. */ }
      node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
        detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, favorite }),
      }))
      return
    }
    if (request.release === true) {
      movedPgcBridge.release(node)
      return
    }
    if (nativeMedia) {
      const player = getNativePlayer()
      const episode = /^\/bangumi\/play\/ep(\d+)/.exec(getBilibiliLogicalPathname())?.[1]
      let ready: boolean | undefined
      let episodeId: number | undefined
      let qualityState
      let unit: NativePlaybackUnit | undefined
      try {
        if (typeof player?.mediaElement === 'function') {
          ready = player.mediaElement() === node
          if (ready && isPgcPlaybackPage()) {
            try {
              episodeId = player?.getManifest?.().episodeId
              if (episode)
                ready = String(episodeId) === episode
            }
            catch {
              // Preserve the existing readiness contract: an optional SS
              // identity probe must not change native node ownership.
              if (episode)
                ready = undefined
            }
          }
        }
      }
      catch { /* The native player can be disposing between navigation and this synchronous probe. */ }
      if (request.adjustVolume !== undefined) {
        let volume: number | undefined
        const delta = request.adjustVolume
        if (ready === true && node instanceof HTMLMediaElement && typeof delta === 'number' && Number.isFinite(delta) && Math.abs(delta) <= 1) {
          volume = Math.max(0, Math.min(1, (node.muted ? 0 : node.volume) + delta))
          if (delta !== 0) {
            node.volume = volume
            if (volume > 0)
              node.muted = false
          }
        }
        node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
          detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, volume }),
        }))
        return
      }
      if ((request.playback === true || request.listen || request.listenReturn || request.listenResume) && ready === true) {
        try {
          const manifest = player?.getManifest?.()
          const identity = parseVideoPageIdentity(location.href)
          const url = new URL(location.href)
          const page = Number(url.searchParams.get('p') || 1)
          const season = /^\/bangumi\/play\/ss(\d+)/.exec(getBilibiliLogicalPathname())?.[1]
          const matches = identity
            ? (identity.aid ? identity.aid === manifest?.aid : identity.bvid === manifest?.bvid)
            && (manifest?.p ?? 1) === page && (!url.searchParams.has('cid') || Number(url.searchParams.get('cid')) === manifest?.cid)
            : episode ? Number(episode) === manifest?.episodeId : !!season && Number(season) === manifest?.seasonId
          if (matches && Number.isSafeInteger(manifest?.aid) && manifest!.aid! > 0
            && Number.isSafeInteger(manifest?.cid) && manifest!.cid! > 0) {
            // The native manifest also has episodeId/seasonId on UGC, where
            // they are sentinel values rather than playback identifiers.
            unit = {
              aid: manifest!.aid!,
              // Episodes may report a literal null BVID; EP and CID identify them.
              bvid: manifest!.bvid || undefined,
              cid: manifest!.cid!,
              page: manifest!.p ?? 1,
              episodeId: !identity && Number(manifest!.episodeId) > 0 ? manifest!.episodeId : undefined,
              seasonId: !identity && Number(manifest!.seasonId) > 0 ? manifest!.seasonId : undefined,
            }
          }
        }
        catch { /* A navigation may retire the manifest before the media node. */ }
      }
      if (request.listenReturn) {
        const intent = request.listenReturn as ListenReturnRequest
        let applied = false
        try {
          if (unit && intent.unit === getNativePlaybackUnitKey(unit) && node instanceof HTMLMediaElement
            && node.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(intent.time) && intent.time >= 0
            && Number.isFinite(intent.rate) && intent.rate > 0 && Number.isFinite(intent.volume) && intent.volume >= 0 && intent.volume <= 1
            && typeof intent.playing === 'boolean' && typeof intent.muted === 'boolean') {
            if (intent.bind) {
              node.volume = intent.volume
              node.muted = intent.muted
              node.defaultPlaybackRate = intent.rate
              node.playbackRate = intent.rate
              if (intent.playing && node.paused)
                void node.play().catch(() => {})
            }
            // BTR wraps this element's play/pause and clock in MAIN. ISOLATED
            // can otherwise pause the decoder without changing the owner's intent.
            if (!intent.playing && (intent.bind || !node.paused))
              node.pause()
            if (!node.seeking && node.duration >= intent.time && Math.abs(node.currentTime - intent.time) > 1
              && (intent.bind || !intent.playing || node.currentTime < intent.time - 1)) {
              node.currentTime = intent.time
            }
            applied = true
          }
        }
        catch { /* An intervening source replacement will emit new readiness events. */ }
        node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
          detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, applied }),
        }))
        return
      }
      // Back from listening: the suspended stream kept its source buffers, so
      // its schedulers restart and it seeks to where the audio stopped. A
      // stream BTR released, or one that never loaded, answers false.
      if (request.listenResume) {
        const intent = request.listenResume as ListenReturnRequest
        let resumed = false
        try {
          const dash = player?.__core?.()?.getCorePlayer?.()
          const processors = dash?.getActiveStream?.()?.getProcessors?.() ?? []
          if (unit && intent.unit === getNativePlaybackUnitKey(unit) && node instanceof HTMLMediaElement
            && (!listenOwner || (intent.gate === listenOwner.gate && intent.unit === listenOwner.unit))
            && Number.isFinite(intent.time) && intent.time >= 0 && Number.isFinite(intent.rate) && intent.rate > 0
            && Number.isFinite(intent.volume) && intent.volume >= 0 && intent.volume <= 1
            && typeof intent.playing === 'boolean' && typeof intent.muted === 'boolean') {
            resumed = intent.gate !== undefined && btrListenHandoff()?.resume(node, intent.gate, intent) === true
            if (dash?.getVideoElement?.() === node && processors.length && node.readyState >= HTMLMediaElement.HAVE_METADATA) {
              node.volume = intent.volume
              node.muted = intent.muted
              node.defaultPlaybackRate = intent.rate
              node.playbackRate = intent.rate
              for (const processor of processors)
                processor.getScheduleController?.()?.start?.()
              node.currentTime = Math.min(intent.time, node.duration || intent.time)
              if (intent.playing)
                void node.play().catch(() => {})
              else
                node.pause()
              resumed = true
            }
            if (resumed)
              listenOwner = undefined
          }
        }
        catch { /* A native switch can retire the media between verification and resume. */ }
        node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
          detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, resumed }),
        }))
        return
      }
      if (request.listen) {
        const intent = request.listen as ListenSuspendRequest
        let suspended: boolean | 'interrupted' | 'btr-companion-required' = false
        try {
          const dash = player?.__core?.()?.getCorePlayer?.()
          const processors = dash?.getActiveStream?.()?.getProcessors?.() ?? []
          const handoff = btrListenHandoff()
          if (btrInstalled() && !handoff) {
            suspended = 'btr-companion-required'
          }
          else if (unit && intent.unit === getNativePlaybackUnitKey(unit) && Number.isSafeInteger(intent.gate) && intent.gate > 0
            && (!listenOwner || listenOwner.unit !== intent.unit || listenOwner.gate === intent.gate || listenOwner.gate === intent.previousGate)
            && dash?.getVideoElement?.() === node && (processors.length || handoff)) {
            suspended = 'interrupted'
            if (handoff && !handoff.suspend(node, intent.gate, intent.previousGate))
              throw new Error('BTR handoff owner changed')
            listenOwner = { unit: intent.unit, gate: intent.gate }
            player?.pause?.()
            // Stop scheduling before cancelling in-flight fragments. Keeping
            // the native SourceBuffers attached lets pending append events finish.
            for (const processor of processors) {
              processor.getScheduleController?.()?.stop?.()
              processor.getFragmentModel?.()?.abortRequests?.()
            }
            suspended = true
          }
        }
        catch { /* A native switch can retire the media between verification and release. */ }
        node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
          detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, suspended }),
        }))
        return
      }
      const btr = request.playback === true
        ? {
            installed: btrInstalled(),
            ownsMedia: !!node.closest('[data-btr-mse-active="true"]'),
            listenHandoffVersion: btrListenHandoff()?.version ?? 0,
          }
        : undefined
      if (request.quality === true) {
        try {
          const manifest = player?.getManifest?.()
          const identity = parseVideoPageIdentity(location.href)
          const url = new URL(location.href)
          const page = Number(url.searchParams.get('p') || 1)
          const cid = Number(url.searchParams.get('cid'))
          const matches = !identity || ((identity.aid ? identity.aid === manifest?.aid : identity.bvid === manifest?.bvid)
            && (!Number.isSafeInteger(manifest?.p) || manifest?.p === page) && (!cid || manifest?.cid === cid))
          if (ready === false || !matches) {
            qualityState = { ready: false }
          }
          else if (ready === true && player?.getQuality && player.getDuration) {
            const quality = player.getQuality()
            const duration = player.getDuration()
            const fullDuration = player.getDuration(true)
            if (Number.isFinite(duration) && Number.isFinite(fullDuration))
              qualityState = { ready: true, quality: quality.nowQ, actualQuality: quality.realQ, preview: fullDuration > duration + 2 }
          }
        }
        catch { /* Optional native APIs cannot change the component-ready contract. */ }
      }
      node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
        detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, ready, episodeId, qualityState, unit, btr, listenOwner: request.playback === true ? listenOwner?.gate ?? btrListenHandoff()?.getOwner() ?? undefined : undefined }),
      }))
      return
    }
    const owner = (node as HTMLElement & { __vue__?: NativeVideoComponent }).__vue__
    const ready = isPgcPlaybackPage()
      ? !!getMountedPgcEventRoot(node)
      : !!owner && owner.$el === node && owner._isMounted === true
        && !owner._isDestroyed && !owner._isBeingDestroyed
    if (isPgcPlaybackPage()) {
      if (ready)
        movedPgcBridge.bind(node)
      else movedPgcBridge.release(node)
    }
    if (ready && typeof owner?.$once === 'function') {
      const existing = nativeComponents.get(owner)
      if (existing) {
        existing.node = node
      }
      else {
        const binding = { node, destroyed: () => {
          nativeComponents.delete(owner)
          binding.node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_CHANGED, {
            bubbles: true,
            detail: JSON.stringify({ channelId, href: location.href }),
          }))
        } }
        nativeComponents.set(owner, binding)
        owner.$once('hook:destroyed', binding.destroyed)
      }
    }
    node.dispatchEvent(new CustomEvent(VIDEO_COMPONENT_RESPONSE, {
      detail: JSON.stringify({ channelId, requestId: request.requestId, href: location.href, ready }),
    }))
  }, { capture: true, signal })
  for (const name of ['pushstate', 'replacestate', 'popstate', 'hashchange', 'load'])
    window.addEventListener(name, scheduleRefresh, { signal })
  document.addEventListener('loadedmetadata', scheduleRefresh, { capture: true, signal })
  signal.addEventListener('abort', () => {
    mediaSession?.dispose()
    stopWatch?.()
    nativeComponents.forEach((binding, owner) => owner.$off?.('hook:destroyed', binding.destroyed))
    nativeComponents.clear()
    movedPgcBridge.dispose()
  }, { once: true })
  window.addEventListener('pagehide', (event: PageTransitionEvent) => {
    if (!event.persisted)
      controller.abort()
  }, { signal })
  return () => controller.abort()
}
