export type MomentAdditionalKind = 'reservation' | 'vote' | 'other'
export type MomentVoteStatus = 'ongoing' | 'ended' | 'unknown'

export function classifyMomentAdditional(type: unknown): MomentAdditionalKind {
  if (type === 'ADDITIONAL_TYPE_RESERVE')
    return 'reservation'
  if (type === 'ADDITIONAL_TYPE_VOTE')
    return 'vote'
  return 'other'
}

export function resolveMomentVoteStatus(endTime: unknown, nowSeconds: number): MomentVoteStatus {
  const normalizedEndTime = Number(endTime)
  if (!Number.isFinite(normalizedEndTime) || normalizedEndTime <= 0)
    return 'unknown'
  return nowSeconds > normalizedEndTime ? 'ended' : 'ongoing'
}
