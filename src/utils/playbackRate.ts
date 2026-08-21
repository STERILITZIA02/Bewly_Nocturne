export const MIN_PLAYBACK_RATE = 0.25
export const MAX_PLAYBACK_RATE = 5
export const PLAYBACK_RATE_STEP = 0.25

export interface PlaybackRateTarget {
  defaultPlaybackRate: number
  playbackRate: number
}

export function isValidPlaybackRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_PLAYBACK_RATE && rate <= MAX_PLAYBACK_RATE
}

export function clampPlaybackRate(rate: number): number {
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate))
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

export type PlaybackRateChangeDecision
  = | { type: 'ignore' }
    | { type: 'restore' }
    | { type: 'save', rate: number }

export function resolvePlaybackRateChange(
  currentRate: number,
  configuredRate: number,
  hasUserIntent: boolean,
): PlaybackRateChangeDecision {
  if (currentRate === configuredRate)
    return { type: 'ignore' }

  if (!hasUserIntent && isValidPlaybackRate(configuredRate))
    return { type: 'restore' }

  if (hasUserIntent && isValidPlaybackRate(currentRate))
    return { type: 'save', rate: currentRate }

  return { type: 'ignore' }
}

export function shouldRestoreConfiguredPlaybackRate(
  currentRate: number,
  configuredRate: number,
  hasUserIntent: boolean,
): boolean {
  return resolvePlaybackRateChange(currentRate, configuredRate, hasUserIntent).type === 'restore'
}
