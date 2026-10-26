import { IFRAME_ACTIVITY_CHANGE, IMMERSIVE_FRAME_NAME } from '~/constants/immersive'

export function isImmersiveFrame() {
  return typeof window !== 'undefined' && window.parent !== window
    && window.name === IMMERSIVE_FRAME_NAME
}

let active = !isImmersiveFrame()

export function isIframeDocumentActive() {
  return active
}

export function setIframeDocumentActive(value: boolean) {
  if (active === value)
    return
  active = value
  window.dispatchEvent(new Event(IFRAME_ACTIVITY_CHANGE))
}
