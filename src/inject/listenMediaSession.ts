const actions: MediaSessionAction[] = ['play', 'pause', 'seekbackward', 'seekforward', 'seekto']

/** MAIN keeps native callbacks; MediaSession deliberately has no handler getter. */
export function createListenMediaSession(session = navigator.mediaSession) {
  if (!session)
    return
  const original = session.setActionHandler
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>()
  let owner: number | undefined
  let metadata: MediaMetadata | null = null
  let playbackState: MediaSessionPlaybackState = 'none'
  const set: MediaSession['setActionHandler'] = function (this: MediaSession, action, handler) {
    if (owner !== undefined && actions.includes(action)) {
      handlers.set(action, handler)
      return
    }
    original.call(this, action, handler)
    if (actions.includes(action))
      handlers.set(action, handler)
  }
  session.setActionHandler = set
  function release(token: number) {
    if (owner !== token)
      return false
    owner = undefined
    for (const action of actions) {
      try {
        original.call(session, action, handlers.get(action) ?? null)
      }
      catch { /* Older engines can omit individual actions. */ }
    }
    session.metadata = metadata
    session.playbackState = playbackState
    return true
  }
  return {
    claim(token: number) {
      if (owner === undefined) {
        metadata = session.metadata
        playbackState = session.playbackState
      }
      owner = token
    },
    release,
    dispose() {
      if (owner !== undefined)
        release(owner)
      if (session.setActionHandler === set)
        session.setActionHandler = original
      handlers.clear()
    },
  }
}
