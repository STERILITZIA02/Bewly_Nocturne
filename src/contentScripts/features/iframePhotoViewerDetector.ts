import type { createIframeDocumentClient } from '~/utils/iframeDocument'
import { runWhenIdle } from '~/utils/lazyLoad'
import { observePhotoViewerState } from '~/utils/photoViewer'

let stopObserver: (() => void) | null = null
let photoViewerOpen = false
let documentClient: ReturnType<typeof createIframeDocumentClient> | undefined
let stopBindingListener: (() => void) | undefined
let reportedOpen: boolean | undefined
let idleSetup: ReturnType<typeof runWhenIdle> | null = null
let domReadyListener: (() => void) | null = null
let rootReadyRetryTimer: number | null = null

function clearDeferredSetup() {
  idleSetup?.dispose()
  idleSetup = null

  if (domReadyListener) {
    document.removeEventListener('DOMContentLoaded', domReadyListener)
    domReadyListener = null
  }

  if (rootReadyRetryTimer !== null) {
    window.clearTimeout(rootReadyRetryTimer)
    rootReadyRetryTimer = null
  }
}

function setupObserverWhenReady() {
  if (stopObserver)
    return

  const target = document.body ?? document.documentElement
  if (!target) {
    if (document.readyState === 'loading') {
      if (!domReadyListener) {
        domReadyListener = () => {
          domReadyListener = null
          setupObserverWhenReady()
        }
        document.addEventListener('DOMContentLoaded', domReadyListener, { once: true })
      }
    }
    else if (rootReadyRetryTimer === null) {
      rootReadyRetryTimer = window.setTimeout(() => {
        rootReadyRetryTimer = null
        setupObserverWhenReady()
      }, 0)
    }
    return
  }

  stopObserver = observePhotoViewerState(checkPhotoViewerState)
}

/**
 * 监听页面中 PhotoSwipe (pswp) 图片查看器的打开/关闭状态
 * 当检测到图片查看器打开时，通知父页面隐藏顶栏和 Dock
 */
export function setupIframePhotoViewerDetector(client: ReturnType<typeof createIframeDocumentClient>) {
  // 只在 iframe 内运行
  if (window.self === window.top)
    return

  // 避免重复初始化
  if (stopObserver || idleSetup || domReadyListener || rootReadyRetryTimer !== null)
    return

  documentClient = client
  stopBindingListener = client.subscribe(() => {
    reportedOpen = undefined
    reportPhotoViewerState()
  })
  idleSetup = runWhenIdle(() => {
    idleSetup = null
    setupObserverWhenReady()
  })
}

function checkPhotoViewerState(isOpen: boolean) {
  photoViewerOpen = isOpen
  reportPhotoViewerState()
}

function reportPhotoViewerState() {
  if (reportedOpen !== photoViewerOpen && documentClient?.send({ type: 'IFRAME_PHOTO_VIEWER_STATE', isOpen: photoViewerOpen }))
    reportedOpen = photoViewerOpen
}

export function cleanupIframePhotoViewerDetector() {
  clearDeferredSetup()
  stopObserver?.()
  stopObserver = null
  if (photoViewerOpen) {
    documentClient?.send({
      type: 'IFRAME_PHOTO_VIEWER_STATE',
      isOpen: false,
    })
  }
  stopBindingListener?.()
  stopBindingListener = undefined
  documentClient = undefined
  reportedOpen = undefined
  photoViewerOpen = false
}
