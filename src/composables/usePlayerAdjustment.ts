import { reactive, watch } from 'vue'

import { invalidateViewportGeometry, subscribeViewportFrame } from '~/utils/viewportGeometry'

import { setAudioDelay } from './useLocalLoudness'

// The unit is verified by MAIN. A blob URL or a route with tracking parameters
// cannot reset these temporary choices.
export const playerAdjustment = reactive({ rotation: 0, horizontal: false, vertical: false, available: false })
let media: HTMLVideoElement | null = null
let unitKey = ''
let effect: KeyframeEffect | undefined
let animation: Animation | undefined
let stopGeometry: (() => void) | undefined

function releaseTransform() {
  animation?.cancel()
  animation = undefined
  effect = undefined
  stopGeometry?.()
  stopGeometry = undefined
}

function apply() {
  const video = media
  if (!video || !playerAdjustment.available || document.hidden)
    return
  const { rotation, horizontal, vertical } = playerAdjustment
  if (!rotation && !horizontal && !vertical) {
    releaseTransform()
    return
  }
  let fit = 1
  if (rotation % 180 && video.videoWidth && video.videoHeight && video.clientWidth && video.clientHeight) {
    const cover = getComputedStyle(video).objectFit === 'cover'
    const choose = cover ? Math.max : Math.min
    const before = choose(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight)
    const after = choose(video.clientWidth / video.videoHeight, video.clientHeight / video.videoWidth)
    fit = after / before
  }
  const transform = `rotate(${rotation}deg) scale(${(horizontal ? -1 : 1) * fit}, ${(vertical ? -1 : 1) * fit})`
  if (!effect) {
    // An additive, paused effect leaves native mirror/aspect transforms intact;
    // cancelling it removes only our contribution, including in card/fill mode.
    effect = new KeyframeEffect(video, [{ transform }, { transform }], { duration: 1, fill: 'both', composite: 'add' })
    animation = new Animation(effect, document.timeline)
    animation.currentTime = 1
  }
  else {
    effect.setKeyframes([{ transform }, { transform }])
  }
  if (!stopGeometry) {
    stopGeometry = subscribeViewportFrame(video, (_geometry, reason) => {
      if (reason === 'layout')
        apply()
    })
  }
}

export function resetPlayerAdjustment() {
  playerAdjustment.rotation = 0
  playerAdjustment.horizontal = playerAdjustment.vertical = false
  setAudioDelay(0)
  releaseTransform()
}

export function bindPlayerAdjustment(video: HTMLVideoElement | null, key: string, enabled: boolean) {
  if (!enabled) {
    resetPlayerAdjustment()
    media = null
    unitKey = ''
    playerAdjustment.available = false
    return
  }
  if (!video || !key) {
    playerAdjustment.available = false
    if (!video) {
      releaseTransform()
      media = null
    }
    return
  }
  if (unitKey && unitKey !== key)
    resetPlayerAdjustment()
  if (media !== video) {
    releaseTransform()
    media = video
  }
  unitKey = key
  playerAdjustment.available = true
  apply()
  invalidateViewportGeometry(video)
}

export function observePlayerAdjustment() {
  const stop = watch(() => [playerAdjustment.rotation, playerAdjustment.horizontal, playerAdjustment.vertical], apply, { flush: 'post' })
  return () => {
    stop()
    bindPlayerAdjustment(null, '', false)
  }
}
