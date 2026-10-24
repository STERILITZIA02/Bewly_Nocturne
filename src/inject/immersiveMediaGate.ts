import { IMMERSIVE_MAIN_ACTIVITY } from '~/constants/immersive'
import { isImmersiveFrame } from '~/utils/iframeActivity'
import { parseVideoMetadataEvent } from '~/utils/videoMetadataBridge'

/** Preparation documents cannot start media, including a delayed native autoplay. */
export function setupImmersiveMediaGate(channelId: string) {
  if (!isImmersiveFrame())
    return
  let active = false
  let autoPlay = false
  let userStarted = false
  const original = HTMLMediaElement.prototype.play
  const play = function (this: HTMLMediaElement) {
    if (!active || (!autoPlay && !userStarted))
      return Promise.reject(new DOMException('Playback is inactive or waiting for a play gesture', 'NotAllowedError'))
    return original.call(this)
  }
  HTMLMediaElement.prototype.play = play
  const receive = (event: Event) => {
    const data = parseVideoMetadataEvent(event)
    if (data?.channelId !== channelId || data.href !== location.href
      || typeof data.active !== 'boolean' || typeof data.autoPlay !== 'boolean') {
      return
    }
    active = data.active
    autoPlay = data.autoPlay
    if (!active) {
      userStarted = false
      document.querySelectorAll('video, audio').forEach(media => (media as HTMLMediaElement).pause())
    }
  }
  const playing = (event: Event) => {
    if ((!active || (!autoPlay && !userStarted)) && event.target instanceof HTMLMediaElement)
      event.target.pause()
  }
  const gesture = (event: Event) => {
    if (!active || !event.isTrusted)
      return
    const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement)
    const playTarget = path.some(node => node.matches('.bpx-player-video-wrap, .bpx-player-dm-wrap, .bpx-player-ctrl-play, .bpx-player-state-wrap, .bpx-player-video-state, .bilibili-player-video-wrap, .bilibili-player-video-btn-start'))
    if (event.type === 'keydown') {
      const keyboard = event as KeyboardEvent
      if (keyboard.isComposing || keyboard.keyCode === 229 || keyboard.ctrlKey || keyboard.metaKey || keyboard.altKey
        || path.some(node => node.isContentEditable || node.matches('input, textarea, [contenteditable]:not([contenteditable="false" i]), [role="textbox"], [role="slider"]'))) {
        return
      }
      const control = path.some(node => node.matches('button, a[href], [role="button"]'))
      if (!((keyboard.key === ' ' && (!control || playTarget)) || (keyboard.key === 'Enter' && playTarget)))
        return
    }
    else if (!playTarget) {
      return
    }
    if (path.some(node => node.matches('.bpx-player-container, .bpx-player-video-wrap, .bpx-player-control-wrap, .bpx-player-dm-wrap, .bilibili-player-video-wrap')))
      userStarted = true
  }
  window.addEventListener(IMMERSIVE_MAIN_ACTIVITY, receive)
  window.addEventListener('play', playing, true)
  window.addEventListener('pointerdown', gesture, true)
  window.addEventListener('keydown', gesture, true)
  window.addEventListener('pagehide', (event: PageTransitionEvent) => {
    active = false
    userStarted = false
    document.querySelectorAll('video, audio').forEach(media => (media as HTMLMediaElement).pause())
    if (event.persisted)
      return
    window.removeEventListener(IMMERSIVE_MAIN_ACTIVITY, receive)
    window.removeEventListener('play', playing, true)
    window.removeEventListener('pointerdown', gesture, true)
    window.removeEventListener('keydown', gesture, true)
    if (HTMLMediaElement.prototype.play === play)
      HTMLMediaElement.prototype.play = original
  })
}
