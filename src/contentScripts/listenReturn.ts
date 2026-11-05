import { onRouteChange } from '~/composables/useRouteState'
import type { ListenSession } from '~/utils/listenPlayback'
import { isListenSession, matchesListenUnit } from '~/utils/listenPlayback'
import { getVideoElement } from '~/utils/playerMedia'
import { applyNativeListenReturn, getNativePlaybackUnitKey, VIDEO_METADATA_CHANGED } from '~/utils/videoMetadataBridge'

const KEY = 'listenPlayback:return'
const RETURN_WINDOW = 20_000

export function saveListenReturn(state: ListenSession) {
  sessionStorage.setItem(KEY, JSON.stringify({ state, expires: Date.now() + RETURN_WINDOW }))
}

/**
 * Native and BTR may attach successive sources during startup. Honor the
 * explicit return until the user takes control or the startup window ends.
 */
export function restoreListenReturn(scope: AbortSignal) {
  const raw = sessionStorage.getItem(KEY)
  if (!raw)
    return
  sessionStorage.removeItem(KEY)
  let saved: { state: ListenSession, expires: number }
  try {
    saved = JSON.parse(raw)
  }
  catch { return }
  if (!isListenSession(saved?.state, location.href) || !Number.isFinite(saved.expires) || saved.expires <= Date.now())
    return
  const state = saved.state
  const controller = new AbortController()
  const { signal } = controller
  const stop = () => controller.abort()
  let applied: HTMLVideoElement | undefined
  function sync(event?: Event) {
    const video = getVideoElement()
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA)
      return
    if (applyNativeListenReturn(video, {
      unit: getNativePlaybackUnitKey(state.unit),
      time: state.time,
      playing: state.playing,
      muted: state.muted,
      volume: state.volume,
      rate: state.rate,
      bind: applied !== video || event?.type === 'loadedmetadata',
    })) {
      applied = video
    }
  }
  const timeout = setTimeout(stop, saved.expires - Date.now())
  const stopRoute = onRouteChange(() => {
    if (!matchesListenUnit(location.href, state.unit))
      stop()
  })
  signal.addEventListener('abort', () => {
    clearTimeout(timeout)
    stopRoute()
    scope.removeEventListener('abort', stop)
  }, { once: true })
  scope.addEventListener('abort', stop, { once: true })
  for (const name of ['pointerdown', 'keydown', 'pagehide'])
    window.addEventListener(name, stop, { capture: true, signal })
  for (const name of ['loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'seeked', 'play', 'pause'])
    document.addEventListener(name, sync, { capture: true, signal })
  window.addEventListener(VIDEO_METADATA_CHANGED, sync, { signal })
  sync()
}
