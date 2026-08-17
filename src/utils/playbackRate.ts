export const MIN_PLAYBACK_RATE = 0.25
export const MAX_PLAYBACK_RATE = 5

export interface PlaybackRateTarget {
  defaultPlaybackRate: number
  playbackRate: number
}

export function isValidPlaybackRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_PLAYBACK_RATE && rate <= MAX_PLAYBACK_RATE
}

export function applyConfiguredPlaybackRate(
  video: PlaybackRateTarget,
  rate: number,
): boolean {
  if (!isValidPlaybackRate(rate))
    return false

  video.defaultPlaybackRate = rate
  video.playbackRate = rate
  return true
}
