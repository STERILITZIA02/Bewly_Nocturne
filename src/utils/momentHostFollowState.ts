export type MomentHostFollowState = 'followed' | 'unfollowed' | 'unknown'

export function resolveMomentHostFollowState(response: unknown, mid: string): MomentHostFollowState {
  if (!mid || !response || typeof response !== 'object')
    return 'unknown'

  const root = response as { code?: unknown, data?: unknown }
  if (root.code !== 0 || !root.data || typeof root.data !== 'object')
    return 'unknown'

  const relation = (root.data as Record<string, unknown>)[mid]
  if (!relation || typeof relation !== 'object')
    return 'unknown'

  const attribute = (relation as { attribute?: unknown }).attribute
  if (typeof attribute !== 'number')
    return 'unknown'

  return attribute === 1 || attribute === 2 || attribute === 6
    ? 'followed'
    : 'unfollowed'
}
