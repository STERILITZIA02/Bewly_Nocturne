import type { WatchLaterChange, WatchLaterEntry, WatchLaterSnapshot } from '~/constants/watchLaterState'

export interface WatchLaterTarget { aid?: number | string, bvid?: string, epid?: number }

export function toWatchLaterEntry(value: WatchLaterTarget): WatchLaterEntry | undefined {
  const aid = Number(value.aid)
  if (!Number.isSafeInteger(aid) || aid <= 0)
    return
  return {
    aid,
    ...(typeof value.bvid === 'string' && /^BV[a-z0-9]{10}$/i.test(value.bvid) ? { bvid: `BV${value.bvid.slice(2)}` } : {}),
    ...(Number.isSafeInteger(value.epid) && value.epid! > 0 ? { epid: value.epid } : {}),
  }
}

export function applyWatchLaterChange(state: WatchLaterSnapshot, change: WatchLaterChange): WatchLaterSnapshot {
  if (change.type === 'invalidate')
    return { ...state, entries: [], complete: false, updatedAt: 0, countUpdatedAt: 0 }
  if (change.type === 'clear')
    return { ...state, entries: [], complete: true, count: 0, updatedAt: Date.now(), countUpdatedAt: Date.now() }
  const existing = state.entries.find(entry => entry.aid === change.entry.aid)
  const entries = change.type === 'add'
    ? existing
      ? state.entries.map(entry => entry === existing ? { ...entry, ...change.entry } : entry)
      : [change.entry, ...state.entries]
    : state.entries.filter(entry => entry.aid !== change.entry.aid)
  // A visible server page proves positive membership without fetching the
  // entire list. Its removal can therefore decrement the known total. For an
  // unknown member, retain the displayed count but expire its freshness.
  const count = state.complete ? entries.length : change.type === 'remove' && existing && state.count !== null ? Math.max(0, state.count - 1) : state.count
  return { ...state, entries, count, countUpdatedAt: state.complete || existing ? Date.now() : 0 }
}
