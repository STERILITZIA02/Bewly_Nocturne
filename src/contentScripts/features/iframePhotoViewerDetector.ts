import { postMessageToParent } from '~/utils/iframeMessage'
import { runWhenIdle } from '~/utils/lazyLoad'
import { observePhotoViewerState } from '~/utils/photoViewer'

let stopObserver: (() => void) | null = null
let photoViewerOpen = false
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
export function setupIframePhotoViewerDetector() {
  // 只在 iframe 内运行
  if (window.self === window.top)
    return

  // 避免重复初始化
  if (stopObserver || idleSetup || domReadyListener || rootReadyRetryTimer !== null)
    return

  idleSetup = runWhenIdle(() => {
    idleSetup = null
    setupObserverWhenReady()
  })
}

function checkPhotoViewerState(isOpen: boolean) {
  // 只在状态变化时发送消息
  if (isOpen !== photoViewerOpen) {
    photoViewerOpen = isOpen

    // 通知父页面 PhotoSwipe 的状态
    postMessageToParent({
      type: 'IFRAME_PHOTO_VIEWER_STATE',
      isOpen,
    })
  }
}

export function cleanupIframePhotoViewerDetector() {
  clearDeferredSetup()
  stopObserver?.()
  stopObserver = null
  if (photoViewerOpen) {
    postMessageToParent({
      type: 'IFRAME_PHOTO_VIEWER_STATE',
      isOpen: false,
    })
  }
  photoViewerOpen = false
}
