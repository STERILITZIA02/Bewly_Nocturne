import type { ListenSession } from '~/utils/listenPlayback'

/**
 * Prepare actual media before disturbing the picture. Only the owning attempt
 * may commit playback. A failed CDN never changes the user's playback intent.
 */
export function prepareListenAudio(state: ListenSession, urls: string[], signal: AbortSignal, failed: () => void) {
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  // Gain can be enabled after playback starts. Acquire CORS permission from
  // the first request, as Bpx does, before a media source can capture the audio.
  audio.crossOrigin = 'anonymous'
  let output: { context: AudioContext, gain: GainNode } | undefined
  let gainDb = 0
  function resumeOutput() {
    if (output?.context.state === 'suspended' && !audio.paused)
      void output.context.resume().catch(() => !signal.aborted && failed())
  }
  function setGain(db: number) {
    if (signal.aborted || db === gainDb)
      return
    gainDb = db
    const value = 10 ** (db / 20)
    if (!output) {
      const context = new AudioContext()
      try {
        const gain = context.createGain()
        // A newly prepared track must start at the matched level, not briefly
        // play at unity gain before the smoothing ramp catches up.
        if (audio.paused)
          gain.gain.value = value
        context.createMediaElementSource(audio).connect(gain).connect(context.destination)
        output = { context, gain }
        signal.addEventListener('abort', () => void context.close().catch(() => {}), { once: true })
      }
      catch (error) {
        void context.close().catch(() => {})
        throw error
      }
    }
    output.gain.gain.setTargetAtTime(value, output.context.currentTime, 0.015)
    resumeOutput()
  }
  // A context made without a user gesture (a restored session) starts
  // suspended; playing is the gesture that lets it run.
  audio.addEventListener('play', resumeOutput, { signal })
  let ownership: 'preparing' | 'committed' = 'preparing'
  let source: 'loading' | 'ready' | 'exhausted' | 'released' = 'loading'
  let index = 0
  function apply() {
    audio.currentTime = audio.duration > 0 ? Math.min(state.time, audio.duration) : state.time
    audio.defaultPlaybackRate = state.rate
    audio.playbackRate = state.rate
    audio.volume = state.volume
    audio.muted = state.muted
    if (state.playing) {
      void audio.play().catch((error: unknown) => {
        if (!signal.aborted && error instanceof DOMException && error.name === 'NotAllowedError' && audio.paused)
          state.playing = false
      })
    }
    else {
      audio.pause()
    }
  }
  const ready = new Promise<void>((resolve, reject) => {
    function next() {
      if (ownership === 'committed' && source === 'ready' && audio.readyState >= HTMLMediaElement.HAVE_METADATA)
        state.time = audio.currentTime
      source = 'loading'
      const url = urls[index++]
      if (!url) {
        source = 'exhausted'
        if (ownership === 'committed')
          failed()
        reject(new Error('No playable audio source'))
        return
      }
      audio.src = url
    }
    signal.throwIfAborted()
    signal.addEventListener('abort', () => {
      source = 'released'
      audio.removeAttribute('src')
      audio.load()
      reject(signal.reason)
    }, { once: true })
    audio.addEventListener('error', next, { signal })
    audio.addEventListener('loadedmetadata', () => {
      source = 'ready'
      if (ownership === 'committed')
        apply()
      resolve()
    }, { signal })
    next()
  })
  audio.addEventListener('timeupdate', () => {
    if (ownership === 'committed' && source === 'ready' && !signal.aborted && !audio.error)
      state.time = audio.currentTime
  }, { signal })
  for (const event of ['play', 'pause']) {
    audio.addEventListener(event, () => {
      if (ownership === 'committed' && source === 'ready' && !signal.aborted && !audio.error)
        state.playing = !audio.paused && !audio.ended
    }, { signal })
  }
  audio.addEventListener('ratechange', () => {
    if (ownership === 'committed' && !signal.aborted) {
      state.rate = audio.playbackRate
      if (audio.defaultPlaybackRate !== state.rate)
        audio.defaultPlaybackRate = state.rate
    }
  }, { signal })
  audio.addEventListener('volumechange', () => {
    if (ownership === 'committed' && !signal.aborted) {
      state.volume = audio.volume
      state.muted = audio.muted
    }
  }, { signal })
  return {
    audio,
    ready,
    setGain,
    get exhausted() { return source === 'exhausted' },
    commit() {
      if (source === 'released' || ownership === 'committed')
        return
      ownership = 'committed'
      if (source === 'ready')
        apply()
      else if (source === 'exhausted')
        failed()
    },
  }
}
