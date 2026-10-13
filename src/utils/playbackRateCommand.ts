import { isValidPlaybackRate } from './playbackRate'

export const IFRAME_PLAYBACK_RATE = 'BEWLY_IFRAME_PLAYBACK_RATE'
let iframeApply: ((rate: number) => Promise<boolean>) | undefined

/** Registered by the actual active player Drawer, never selected by DOM order. */
export function registerIframePlaybackRate(apply: (rate: number) => Promise<boolean>) {
  iframeApply = apply
  return () => {
    if (iframeApply === apply)
      iframeApply = undefined
  }
}

export async function applyActivePlaybackRate(rate: number): Promise<boolean> {
  if (!isValidPlaybackRate(rate))
    return false
  if (iframeApply)
    return iframeApply(rate)
  const href = location.href
  const { applyExplicitPlaybackRate } = await import('./player')
  return location.href === href && applyExplicitPlaybackRate(rate)
}
