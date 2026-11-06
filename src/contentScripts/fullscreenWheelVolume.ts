import { watch } from 'vue'

import { hasPlayerMediaMutation, observePlayerDom } from '~/contentScripts/playerDomLifecycle'
import { settings } from '~/logic'
import { getFullscreenElement, subscribeFullscreenChange } from '~/utils/fullscreenChange'
import { i18n } from '~/utils/i18n'
import { showState } from '~/utils/player'
import { getVideoElement } from '~/utils/playerMedia'
import { adjustNativeVolume } from '~/utils/videoMetadataBridge'
import { createWheelStepper } from '~/utils/wheelStep'

const WHEEL_OPTIONS = { capture: true, passive: false } as const
const NATIVE_SCROLL_UI = 'input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="dialog"], .bpx-player-ctrl-setting-box, .bpx-player-dm-wrap, .bpx-player-contextmenu, .bpx-player-ending-panel'

export function setupFullscreenWheelVolume() {
  return watch(() => settings.value.customFullscreenWheelVolume, (enabled, _previous, onCleanup) => {
    if (!enabled)
      return
    const stepper = createWheelStepper()
    let media: HTMLVideoElement | null = null
    let stopDom: (() => void) | undefined
    function mediaEmptied() {
      window.removeEventListener('wheel', wheel, WHEEL_OPTIONS)
      stepper.reset()
    }
    function listenWheel() {
      stepper.reset()
      if (media && getFullscreenElement()?.contains(media) && adjustNativeVolume(media, 0) !== undefined)
        window.addEventListener('wheel', wheel, WHEEL_OPTIONS)
    }
    function releaseWheel() {
      mediaEmptied()
      media?.removeEventListener('emptied', mediaEmptied)
      media?.removeEventListener('loadedmetadata', listenWheel)
      media = null
    }
    function syncMedia(mutations?: MutationRecord[]) {
      if (media?.isConnected && mutations && !hasPlayerMediaMutation(mutations))
        return
      const fullscreen = getFullscreenElement()
      const next = getVideoElement()
      const target = fullscreen && fullscreen !== document.documentElement && fullscreen !== document.body
        && next && fullscreen.contains(next)
        ? next
        : null
      if (target === media)
        return
      releaseWheel()
      media = target
      if (media) {
        listenWheel()
        media.addEventListener('emptied', mediaEmptied)
        media.addEventListener('loadedmetadata', listenWheel)
      }
    }
    function wheel(event: WheelEvent) {
      const fullscreen = getFullscreenElement()
      if (!media?.isConnected || !fullscreen?.contains(media) || event.defaultPrevented || !event.cancelable
        || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return
      }
      const path = event.composedPath()
      if (!path.includes(fullscreen))
        return
      for (const node of path) {
        if (!(node instanceof HTMLElement))
          continue
        if (node === fullscreen)
          break
        if (node.matches(NATIVE_SCROLL_UI))
          return
        const overflow = getComputedStyle(node).overflowY
        if (/auto|scroll|overlay/.test(overflow) && node.scrollHeight > node.clientHeight)
          return
      }
      // Consume the whole gesture before native/BTR handlers, including sub-step deltas.
      event.preventDefault()
      event.stopImmediatePropagation()
      const direction = stepper.step(event.deltaY, event.deltaMode, event.timeStamp)
      if (!direction)
        return
      const volume = adjustNativeVolume(media, -direction * settings.value.fullscreenWheelVolumeStep / 100)
      if (volume !== undefined)
        showState(String(i18n.global.t('common.volume', { volume: Math.round(volume * 100) })))
    }
    function syncFullscreen() {
      stopDom?.()
      stopDom = undefined
      releaseWheel()
      if (getFullscreenElement() && !document.hidden)
        stopDom = observePlayerDom(syncMedia)
    }
    const stopFullscreen = subscribeFullscreenChange(syncFullscreen)
    document.addEventListener('visibilitychange', syncFullscreen)
    syncFullscreen()
    onCleanup(() => {
      stopFullscreen()
      stopDom?.()
      releaseWheel()
      document.removeEventListener('visibilitychange', syncFullscreen)
    })
  }, { immediate: true })
}
