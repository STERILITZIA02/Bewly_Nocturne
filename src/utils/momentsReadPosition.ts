import type { ScrollCardAnchor } from './scrollIntent'

/** feed offsets are exclusive dynamic IDs, never JS numbers. */
export const MOMENTS_LATEST_OFFSET = '9223372036854775807'

export function dynamicId(value: unknown): string | undefined {
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : undefined
}

export function isNotNewerMoment(value: unknown, boundary: string) {
  const id = dynamicId(value)
  return id !== undefined && BigInt(id) <= BigInt(boundary)
}

export interface MomentUnreadSnapshot {
  ids: string[]
  oldestId?: string
}

export function parseMomentUnreadSnapshot(response: any): MomentUnreadSnapshot | undefined {
  if (response?.code !== 0 || !Array.isArray(response.data?.dyn_basic_infos))
    return
  const ids = new Set<string>()
  for (const item of response.data.dyn_basic_infos) {
    const id = dynamicId(item?.dyn_id_str ?? item?.dyn_id)
    if (!id)
      return
    ids.add(id)
  }
  const ordered = [...ids].sort((a, b) => BigInt(a) > BigInt(b) ? -1 : BigInt(a) < BigInt(b) ? 1 : 0)
  return { ids: ordered, oldestId: ordered.at(-1) }
}

export interface MomentGap {
  /** Next exclusive cursor, between the fresh head and the previous interval. */
  cursor: string
  targetId: string
  headId?: string
}

export function keepMomentAnchorInterval(anchor: ScrollCardAnchor | undefined, gap: MomentGap | undefined) {
  if (anchor?.candidates.length && gap) {
    const older = isNotNewerMoment(anchor.candidates[0].key, gap.targetId)
    anchor.candidates = anchor.candidates.filter(candidate => isNotNewerMoment(candidate.key, gap.targetId) === older)
  }
  return anchor
}
export type MomentJoinStatus = 'connected' | 'ended' | 'stalled' | 'failed' | 'budget'
export interface MomentRawPage<T> { items: T[], offset: string, hasMore: boolean }

/** A bounded scan reports continuity independently from having requested the head. */
export async function fetchNewerMoments<T>(
  fetchPage: (offset: string) => Promise<MomentRawPage<T>>,
  gap: MomentGap,
  idOf: (item: T) => string,
  maxPages = 3,
): Promise<{ items: T[], status: MomentJoinStatus, gap?: MomentGap, newestId?: string }> {
  const items: T[] = []
  const seen = new Set<string>()
  const cursors = new Set<string>()
  let cursor = gap.cursor
  let newestId = gap.headId
  const remaining = () => ({ ...gap, cursor, headId: newestId })
  for (let page = 0; page < maxPages; page++) {
    let result: MomentRawPage<T>
    try {
      result = await fetchPage(cursor)
    }
    catch { return { items, status: 'failed', gap: remaining(), newestId } }
    cursors.add(cursor)
    let connected = false
    let added = 0
    for (const item of result.items) {
      const id = dynamicId(idOf(item))
      if (!id)
        return { items, status: 'failed', gap: remaining(), newestId }
      if (!newestId || BigInt(id) > BigInt(newestId))
        newestId = id
      if (BigInt(id) <= BigInt(gap.targetId)) {
        connected = true
        continue
      }
      if (!seen.has(id)) {
        seen.add(id)
        items.push(item)
        added++
      }
    }
    if (connected)
      return { items, status: 'connected', newestId }
    if (!result.hasMore)
      return { items, status: 'ended', gap: remaining(), newestId }
    if (!dynamicId(result.offset) || cursors.has(result.offset) || !added)
      return { items, status: 'stalled', gap: remaining(), newestId }
    cursor = result.offset
  }
  return { items, status: 'budget', gap: remaining(), newestId }
}
