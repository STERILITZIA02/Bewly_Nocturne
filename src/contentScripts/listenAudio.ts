import type { ListenSession } from '~/utils/listenPlayback'

/**
 * Prepare actual media before disturbing the picture. Only the owning attempt
 * may commit playback. A failed CDN never changes the user's playback intent.
 */
export function prepareListenAudio(state: ListenSession, urls: string[], signal: AbortSignal, failed: () => void) {
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  let committed = false
  let loaded = false
  let index = 0
  let exhausted = false
  function apply() {
    audio.currentTime = audio.duration > 0 ? Math.min(state.time, audio.duration) : state.time
    audio.playbackRate = state.rate
    audio.volume = state.volume
    audio.muted = state.muted
    if (state.playing) {
      void audio.play().catch((error: unknown) => {
        if (!signal.aborted && error instanceof DOMException && error.name === 'NotAllowedError' && audio.paused)
          state.playing = false
      })
    }
  }
  const ready = new Promise<void>((resolve, reject) => {
    function next() {
      loaded = false
      const url = urls[index++]
      if (!url) {
        exhausted = true
        if (committed)
          failed()
        reject(new Error('No playable audio source'))
        return
      }
      audio.src = url
    }
    signal.throwIfAborted()
    signal.addEventListener('abort', () => {
      audio.removeAttribute('src')
      audio.load()
      reject(signal.reason)
    }, { once: true })
    audio.addEventListener('error', next, { signal })
    audio.addEventListener('loadedmetadata', () => {
      loaded = true
      if (committed)
        apply()
      resolve()
    }, { signal })
    next()
  })
  audio.addEventListener('timeupdate', () => {
    if (committed && loaded && !audio.error)
      state.time = audio.currentTime
  }, { signal })
  for (const event of ['play', 'pause']) {
    audio.addEventListener(event, () => {
      if (committed && loaded && !audio.error)
        state.playing = !audio.paused && !audio.ended
    }, { signal })
  }
  audio.addEventListener('ratechange', () => {
    if (committed && loaded && !audio.error)
      state.rate = audio.playbackRate
  }, { signal })
  audio.addEventListener('volumechange', () => {
    if (committed && loaded) {
      state.volume = audio.volume
      state.muted = audio.muted
    }
  }, { signal })
  return {
    audio,
    ready,
    get exhausted() { return exhausted },
    commit() {
      committed = true
      if (loaded)
        apply()
      else if (exhausted)
        failed()
    },
  }
}
