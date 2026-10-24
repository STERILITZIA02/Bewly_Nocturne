import type { Video } from '~/components/VideoCard/types'

import { parsePlaybackTabUrl } from './playbackTab'
import { getVideoPlaybackUrl } from './videoPreviewProgress'

export interface ImmersiveRecommendation {
  uniqueId: string
  displayData?: Video
  isAdvertisement?: boolean
}

export function getImmersiveVideoUrl(entry?: ImmersiveRecommendation): string | undefined {
  const video = entry?.displayData
  if (!video || entry?.isAdvertisement || video.isAdvertisement || video.roomid)
    return
  const href = getVideoPlaybackUrl(video, null)
  if (!parsePlaybackTabUrl(href))
    return
  const url = new URL(href)
  url.protocol = 'https:'
  url.hostname = 'www.bilibili.com'
  return url.href
}

export function findImmersiveVideo(entries: readonly ImmersiveRecommendation[], start: number, direction: -1 | 1): number {
  for (let index = start; index >= 0 && index < entries.length; index += direction) {
    if (getImmersiveVideoUrl(entries[index]))
      return index
  }
  return -1
}

export const IMMERSIVE_WINDOW_SIZE = 48
export function getImmersiveWindow<E extends ImmersiveRecommendation>(entries: readonly E[], index: number): E[] {
  const start = Math.max(0, index)
  return entries.slice(start, start + IMMERSIVE_WINDOW_SIZE).filter(entry => getImmersiveVideoUrl(entry))
}

/** Mode-local commands never take keys away from native controls or text input. */
export function isImmersiveInput(event: KeyboardEvent | WheelEvent) {
  return event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
    || ('isComposing' in event && (event.isComposing || event.keyCode === 229))
    || event.composedPath().some(node => node instanceof HTMLElement
      && (node.isContentEditable || node.matches('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false" i]), [role="button"], [role="slider"], [role="textbox"]')))
}
