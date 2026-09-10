import type { DefaultVideoPlayerMode } from '~/logic/storage'

import { isNativeVideoComponentReady } from './videoMetadataBridge'

export const PLAYER_MEDIA_SELECTOR = '#bilibiliPlayer video,#bilibili-player video,.bilibili-player video,.player-container video,#bilibiliPlayer bwp-video,#bilibili-player bwp-video,.bilibili-player bwp-video,.player-container bwp-video,#bofqi video,[aria-label="哔哩哔哩播放器"] video'
const PLAYER_ROOT_SELECTORS = ['#bilibili-player-wrap', '#playerWrap', '#bilibili-player', '#bilibiliPlayer', '.bilibili-player', '.squirtle-video-wrap', '.bpx-player-container', '.player-wrap']
export const PLAYER_ROOT_SELECTOR = PLAYER_ROOT_SELECTORS.join(',')
// The native mode state belongs to this inner container, not the outer layout anchor.
export const PLAYER_MODE_CONTAINER_SELECTOR = '.bpx-player-container,.bilibili-player,.squirtle-video-wrap,#bilibili-player,#bilibiliPlayer'
export const PLAYER_MODE_CONTROL_SELECTORS = {
  wide: ['.bpx-player-ctrl-wide', '.bilibili-player-video-btn-widescreen', '.squirtle-video-widescreen'],
  web: ['.bpx-player-ctrl-web', '.bilibili-player-video-web-fullscreen', '.squirtle-video-pagefullscreen'],
  full: ['.bpx-player-ctrl-full', '.bilibili-player-video-btn-fullscreen', '.squirtle-video-fullscreen'],
} as const

export function getPlayerModeContainer(video = getVideoElement()): HTMLElement | null {
  return video?.closest<HTMLElement>(PLAYER_MODE_CONTAINER_SELECTOR) ?? null
}

export function getPlayerModeControl(mode: keyof typeof PLAYER_MODE_CONTROL_SELECTORS, root = getPlayerModeContainer()): HTMLElement | null {
  return root?.querySelector<HTMLElement>(PLAYER_MODE_CONTROL_SELECTORS[mode].join(',')) ?? null
}

/** Only concrete media/control readiness can reopen an exhausted attempt. */
export function getPlayerModeReadiness(mode: DefaultVideoPlayerMode) {
  const video = getVideoElement()
  const root = getPlayerModeContainer(video)
  const screen = root?.getAttribute('data-screen')
  const control = getPlayerModeControl(mode === 'webFullscreen' || (mode === 'default' && screen === 'web') ? 'web' : 'wide', root)
  return [mode, video, video?.currentSrc || video?.getAttribute('src'), video?.readyState, root, screen, control, control?.hasAttribute('disabled'), control?.getAttribute('aria-disabled'), control?.classList.contains('bpx-state-entered'), video ? isNativeVideoComponentReady(video) : undefined] as const
}

export function getPlayerRoot(): HTMLElement | null {
  const media = getVideoElement()
  for (const selector of PLAYER_ROOT_SELECTORS) {
    const parent = media?.closest<HTMLElement>(selector)
    if (parent)
      return parent
  }
  for (const selector of PLAYER_ROOT_SELECTORS) {
    const root = document.querySelector<HTMLElement>(selector)
    if (root)
      return root
  }
  return null
}

/** One media identity resolver for playback work and the shared DOM observer. */
export function getVideoElement(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>(PLAYER_MEDIA_SELECTOR))
  if (videos.length <= 1)
    return videos[0] ?? null
  const primary = videos.filter(video => video.closest('.bpx-player-video-wrap, .bilibili-player-video-wrap'))
  const candidates = primary.length ? primary : videos
  const owned = candidates.find(video => isNativeVideoComponentReady(video) === true)
  if (owned)
    return owned
  const visible = candidates.filter(video => video.getClientRects().length && getComputedStyle(video).visibility !== 'hidden')
  return visible.find(video => !video.paused && !video.ended)
    ?? visible.find(video => !video.ended && video.readyState >= HTMLMediaElement.HAVE_METADATA)
    ?? visible[0] ?? candidates[0]
}
