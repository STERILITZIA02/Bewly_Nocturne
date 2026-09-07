import type flvjs from 'flv.js'
import type Hls from 'hls.js'

/** Transport and DOM-listener ownership shared by card and Moments previews. Stream policies stay with callers. */
export function createPreviewMediaSession() {
  let events: AbortController | undefined
  const session = {
    hls: null as Hls | null,
    flv: null as flvjs.Player | null,
    get signal() {
      events ??= new AbortController()
      return events.signal
    },
    releaseHls(player: Hls) {
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
