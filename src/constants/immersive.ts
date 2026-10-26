export const IMMERSIVE_FRAME_NAME = 'bewly-nocturne-immersive'
export const IMMERSIVE_CONFIG = 'bewly:immersive-config'
export const IMMERSIVE_EVENT = 'bewly:immersive-event'
export const IMMERSIVE_RECOMMENDATIONS = 'bewly:immersive-recommendations'
export const IFRAME_ACTIVITY_CHANGE = 'bewly:iframe-activity-change'

export interface ImmersiveConfig {
  playbackId: number
  key: string
  targetUrl: string
  active: boolean
  uiVisible: boolean
  autoPlay: boolean
  autoNext: boolean
  keyboard: boolean
  wheel: boolean
}
