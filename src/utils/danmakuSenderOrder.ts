/** The sender column button the playback page adds to Bpx's danmaku list header. */
export const DANMAKU_SENDER_ORDER_BUTTON_CLASS = 'bewly-dm-btn-sender'
/** Marks the header while the list is in sender order (with Bpx's rotate class when reversed). */
export const DANMAKU_SENDER_ORDER_CLASS = 'bewly-dm-order-sender'

export interface SenderOrderedDanmaku {
  /** Bpx's hash of the sender, the only sender identity the list carries. */
  uhash?: unknown
  /** Playback time in milliseconds. */
  stime?: unknown
}

/** Bpx's list store holds plain danmaku records with both fields. */
export function isNativeDanmakuList(value: unknown): value is SenderOrderedDanmaku[] {
  if (!Array.isArray(value) || value.length === 0)
    return false
  const first = value[0] as unknown
  return !!first && typeof first === 'object' && 'uhash' in first && 'stime' in first
}

/**
 * Groups each sender's danmaku together: senders with the most danmaku first
 * (fewest first when reversed), each group in playback order.
 */
export function createDanmakuSenderComparator(list: readonly SenderOrderedDanmaku[], positive: boolean) {
  const counts = new Map<unknown, number>()
  for (const item of list)
    counts.set(item.uhash, (counts.get(item.uhash) ?? 0) + 1)
  return (a: SenderOrderedDanmaku, b: SenderOrderedDanmaku) => {
    const bySize = (counts.get(b.uhash) ?? 0) - (counts.get(a.uhash) ?? 0)
    if (bySize)
      return positive ? bySize : -bySize
    const senderA = String(a.uhash ?? '')
    const senderB = String(b.uhash ?? '')
    if (senderA !== senderB)
      return senderA < senderB ? -1 : 1
    return (Number(a.stime) || 0) - (Number(b.stime) || 0)
  }
}
