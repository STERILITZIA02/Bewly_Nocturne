import type { IframePlaybackContext } from '~/logic/iframePageState'

const session = crypto.randomUUID()
const key = '__bewlyIframeDrawer'
export interface IframeDrawerHistoryEntry {
  session: string
  id: string
  origin: string
  playbackContext?: IframePlaybackContext
}

/** Only entries created by this live document can reopen its overlay. */
export function readIframeDrawerHistory(state: unknown, href: string): IframeDrawerHistoryEntry | undefined {
  const entry = state && typeof state === 'object' ? Reflect.get(state, key) : undefined
  if (!entry || entry.session !== session || typeof entry.id !== 'string' || typeof entry.origin !== 'string')
    return
  try {
    const origin = new URL(entry.origin)
    const destination = new URL(href)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== destination.origin || origin.username || origin.password)
      return
    return entry
  }
  catch { /* Foreign history entries are ordinary navigation. */ }
}

export function createIframeDrawerHistory(state: unknown, origin: string, playbackContext?: IframePlaybackContext) {
  const entry: IframeDrawerHistoryEntry = { session, id: crypto.randomUUID(), origin, playbackContext }
  return { ...(state && typeof state === 'object' ? state : {}), [key]: entry }
}

export function clearIframeDrawerHistory(state: unknown) {
  if (!state || typeof state !== 'object' || !Object.hasOwn(state, key))
    return state
  const value = { ...(state && typeof state === 'object' ? state : {}) }
  Reflect.deleteProperty(value, key)
  return value
}

export function resolveApplicationHref(href: string, state: unknown) {
  return readIframeDrawerHistory(state, href)?.origin ?? href
}
