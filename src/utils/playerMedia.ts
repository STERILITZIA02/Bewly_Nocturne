import { isNativeVideoComponentReady } from './videoMetadataBridge'

export const PLAYER_MEDIA_SELECTOR = '#bilibiliPlayer video,#bilibili-player video,.bilibili-player video,.player-container video,#bilibiliPlayer bwp-video,#bilibili-player bwp-video,.bilibili-player bwp-video,.player-container bwp-video,#bofqi video,[aria-label="哔哩哔哩播放器"] video'
const PLAYER_ROOT_SELECTORS = ['#bilibili-player-wrap', '#playerWrap', '#bilibili-player', '#bilibiliPlayer', '.bilibili-player', '.squirtle-video-wrap', '.bpx-player-container', '.player-wrap']
export const PLAYER_ROOT_SELECTOR = PLAYER_ROOT_SELECTORS.join(',')

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
