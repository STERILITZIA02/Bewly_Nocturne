import { readRenderedLoudnessOption } from '~/utils/nativeLoudness'

export function readNativeLoudnessState(player: Element | null): 'off' | 'on' | 'unknown' {
  const option = readRenderedLoudnessOption(player)
  return option === undefined ? 'unknown' : option ? 'on' : 'off'
}

/**
 * Reading one decoded pixel uses the browser's origin-clean check, including
 * redirects/CORS. It never fetches or stores the media resource.
 */
export function canReadMediaAudio(video: HTMLVideoElement) {
  if (!video.currentSrc || video.readyState < 2 || video.mediaKeys || !video.videoWidth || !video.videoHeight)
    return false
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context)
      return false
    context.drawImage(video, 0, 0, 1, 1)
    context.getImageData(0, 0, 1, 1)
    return true
  }
  catch { return false }
}
