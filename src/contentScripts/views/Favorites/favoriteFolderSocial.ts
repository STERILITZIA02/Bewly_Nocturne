import type { Info } from '~/models/video/favorite'

/** Apply an acknowledged write; immediate folder/info reads can lag behind it. */
export function applyFavoriteFolderInteraction(folder: Info, kind: 'like' | 'subscribe', data: unknown): Info {
  const response = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const stateKey = kind === 'like' ? 'like_state' : 'fav_state'
  const countKey = kind === 'like' ? 'thumb_up' : 'collect'
  const previous = folder[stateKey] === 1 ? 1 : 0
  const reportedState = response[stateKey]
  const state = reportedState === 0 || reportedState === 1 ? reportedState : 1 - previous
  // The native like endpoint returns `likes`; folder subscriptions return no count.
  const reportedCount = kind === 'like' ? response.likes : undefined
  const count = typeof reportedCount === 'number' && Number.isSafeInteger(reportedCount) && reportedCount >= 0
    ? reportedCount
    : Math.max(0, folder.cnt_info[countKey] + state - previous)
  return { ...folder, [stateKey]: state, cnt_info: { ...folder.cnt_info, [countKey]: count } }
}
