import { selectors } from '~/utils/bewlyWidescreen/constants'
import {
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

export function setupVideoMetadataBridge(channelId: string) {
  const controller = new AbortController()
  const { signal } = controller
  let watchedApp: NativeVideoApp | undefined
  let stopWatch: (() => void) | undefined
  let lastSignature = ''
  let refreshQueued = false
  const nativeComponents = new Map<NativeVideoComponent, { node: HTMLElement, destroyed: () => void }>()

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
  const nativeComponentSelector = [...selectors.upPanel, ...selectors.toolbar, ...selectors.description, ...selectors.tags].join(',')
  document.addEventListener(VIDEO_COMPONENT_REQUEST, (event) => {
    const request = parseVideoMetadataEvent(event)
    const node = event.target
    if (request?.channelId !== channelId || !Number.isSafeInteger(request.requestId)
      || request.href !== location.href || !parseVideoPageIdentity(location.href)
      || !(node instanceof HTMLElement) || !node.isConnected || !node.matches(nativeComponentSelector)) {
      return
    }
    const owner = (node as HTMLElement & { __vue__?: NativeVideoComponent }).__vue__
    const ready = !!owner && owner.$el === node && owner._isMounted === true
      && !owner._isDestroyed && !owner._isBeingDestroyed
    if (ready && typeof owner.$once === 'function') {
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
    stopWatch?.()
    nativeComponents.forEach((binding, owner) => owner.$off?.('hook:destroyed', binding.destroyed))
    nativeComponents.clear()
  }, { once: true })
  window.addEventListener('pagehide', (event: PageTransitionEvent) => {
    if (!event.persisted)
      controller.abort()
  }, { signal })
  return () => controller.abort()
}
