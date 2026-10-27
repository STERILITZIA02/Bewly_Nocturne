import { useEventListener } from '@vueuse/core'
import type { Ref } from 'vue'

import { IFRAME_IMAGE_VIEWER_ACK, IFRAME_IMAGE_VIEWER_CLOSE, IFRAME_IMAGE_VIEWER_OPEN } from '~/constants/globalEvents'
import { getIframeMessageData, postMessageToIframe } from '~/utils/iframeMessage'
import type { ImageViewerRect } from '~/utils/imageViewer'

import { useImageViewer } from './useImageViewer'

function readRect(value: unknown): ImageViewerRect | undefined {
  if (!value || typeof value !== 'object')
    return
  const { left, top, width, height } = value as Record<string, unknown>
  return [left, top, width, height].every(part => typeof part === 'number' && Number.isFinite(part))
    ? { left: left as number, top: top as number, width: width as number, height: height as number }
    : undefined
}

/**
 * Shows images from an embedded page in this document's viewer, full window
 * rather than inside the frame. The page reports the clicked image's box in
 * its own viewport; the morph starts and ends there, and the page learns the
 * last image shown so its gallery follows.
 */
export function useIframeImageViewerBridge(iframe: Ref<HTMLIFrameElement | null>) {
  const viewer = useImageViewer()
  useEventListener(window, 'message', (event: MessageEvent) => {
    const frame = iframe.value
    const data = getIframeMessageData(event, frame)
    if (!frame || data?.type !== IFRAME_IMAGE_VIEWER_OPEN || !Array.isArray(data.urls))
      return
    const inner = readRect(data.rect)
    const frameBox = frame.getBoundingClientRect()
    const origin = inner && { ...inner, left: frameBox.left + inner.left, top: frameBox.top + inner.top }
    const opened = viewer.open({
      urls: data.urls,
      index: Number(data.index),
      trigger: frame,
      getOrigin: () => origin,
      originRadius: typeof data.radius === 'number' ? data.radius : 0,
      onClose: index => postMessageToIframe(frame, { type: IFRAME_IMAGE_VIEWER_CLOSE, index }),
    })
    if (opened)
      (event.source as Window | null)?.postMessage({ type: IFRAME_IMAGE_VIEWER_ACK }, event.origin)
  })
  return viewer
}
