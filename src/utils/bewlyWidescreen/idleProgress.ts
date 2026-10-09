import { watch } from 'vue'

import { settings } from '~/logic'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'
import { getVideoElement } from '~/utils/playerMedia'

/** A display projection of the native media, not another progress recorder. */
export function setupIdleProgress(currentState: BewlyWidescreenState) {
  let bar: HTMLDivElement | undefined
  let value: HTMLDivElement | undefined
  const events = ['timeupdate', 'durationchange', 'loadedmetadata', 'playing', 'pause', 'ended', 'emptied']
  function update(event?: Event) {
    if (!bar || !value || session.current !== currentState)
      return
    const video = getVideoElement()
    if (event && event.target !== video)
      return
    const visible = currentState.root.dataset.playerControlsHidden === 'true' && !currentState.navigationPending
      && video instanceof HTMLMediaElement && currentState.playerEl.contains(video)
      && !video.paused && !video.ended && video.readyState >= 1 && video.duration > 0 && Number.isFinite(video.duration)
      && event?.type !== 'emptied'
    bar.hidden = !visible
    if (!visible)
      return
    const transform = `scaleX(${normalizePlaybackProgress(video.currentTime, video.duration) / 100})`
    if (value.style.transform !== transform)
      value.style.transform = transform
  }
  function release() {
    events.forEach(name => document.removeEventListener(name, update, true))
    bar?.remove()
    bar = undefined
    value = undefined
    currentState.updateIdleProgress = undefined
  }
  const stop = watch(() => settings.value.showWidescreenIdleProgress, (enabled) => {
    release()
    if (!enabled || session.current !== currentState)
      return
    bar = document.createElement('div')
    bar.className = 'bewly-widescreen-idle-progress'
    bar.setAttribute('aria-hidden', 'true')
    value = document.createElement('div')
    bar.append(value)
    currentState.playerFrame.append(bar)
    events.forEach(name => document.addEventListener(name, update, true))
    currentState.updateIdleProgress = update
    update()
  }, { immediate: true })
  currentState.idleProgressCleanup = () => {
    stop()
    release()
  }
}
