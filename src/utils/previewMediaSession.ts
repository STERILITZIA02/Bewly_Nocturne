import type flvjs from 'flv.js'
import type Hls from 'hls.js'

/** Backoff for each `recoverMediaError` of one HLS instance; exhausted afterwards. */
export const HLS_MEDIA_RECOVERY_DELAYS_MS = [400, 1500] as const
/** Continuous playback that proves a recovery worked and restores the budget. */
export const HLS_STABLE_PLAYBACK_SECONDS = 3

interface HlsRecoveryState {
  player: Hls
  attempts: number
  timer?: ReturnType<typeof setTimeout>
  /** Media time when playback resumed after the last recovery or failure. */
  playedFrom?: number
}

/** Transport and DOM-listener ownership shared by card and Moments previews. Stream policies stay with callers. */
export function createPreviewMediaSession() {
  let events: AbortController | undefined
  let recovery: HlsRecoveryState | undefined
  function clearRecovery(player?: Hls) {
    if (!recovery || (player && recovery.player !== player))
      return
    clearTimeout(recovery.timer)
    recovery = undefined
  }
  const session = {
    hls: null as Hls | null,
    flv: null as flvjs.Player | null,
    get signal() {
      events ??= new AbortController()
      return events.signal
    },
    /**
     * Fatal MEDIA_ERROR of the current instance. One owner: a recovery already
     * waiting absorbs repeated errors. Budget and backoff belong to this
     * instance (a new source or instance starts fresh); only playback that
     * advances for a stable interval restores it — `play()` or `canplay` do not.
     * Close, source change or unmount clears the pending timer with the session.
     */
    recoverHlsMediaError(player: Hls, video: HTMLVideoElement, onExhausted: () => void) {
      if (session.hls !== player)
        return
      if (recovery?.player !== player) {
        clearRecovery()
        const state: HlsRecoveryState = { player, attempts: 0 }
        recovery = state
        video.addEventListener('timeupdate', () => {
          if (recovery !== state || video.paused)
            return
          state.playedFrom ??= video.currentTime
          if (state.attempts && video.currentTime - state.playedFrom >= HLS_STABLE_PLAYBACK_SECONDS)
            state.attempts = 0
        }, { signal: session.signal })
      }
      const state = recovery
      if (state.timer !== undefined)
        return
      if (state.attempts >= HLS_MEDIA_RECOVERY_DELAYS_MS.length) {
        clearRecovery(player)
        onExhausted()
        return
      }
      const delay = HLS_MEDIA_RECOVERY_DELAYS_MS[state.attempts++]
      state.timer = setTimeout(() => {
        state.timer = undefined
        if (recovery !== state || session.hls !== player)
          return
        state.playedFrom = undefined
        player.recoverMediaError()
      }, delay)
    },
    releaseHls(player: Hls) {
      clearRecovery(player)
      if (session.hls === player)
        session.hls = null
      player.destroy()
    },
    releaseFlv(player: flvjs.Player) {
      if (session.flv === player)
        session.flv = null
      try {
        player.pause()
        player.unload()
        player.detachMediaElement()
      }
      finally {
        player.destroy()
      }
    },
    clear() {
      clearRecovery()
      events?.abort()
      events = undefined
      if (session.hls)
        session.releaseHls(session.hls)
      if (session.flv) {
        try {
          session.releaseFlv(session.flv)
        }
        catch {
          // FLV may already have detached after a stream error.
        }
      }
    },
  }
  return session
}
