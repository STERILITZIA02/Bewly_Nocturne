import api from '~/utils/api'

import type { NormalizedAppVideoItem } from './adapters/appRecommendationItem'
import { getAppVideoAid } from './adapters/appRecommendationItem'

/** Only the current filtered batch is held here; accepted cards keep their own count. */
export async function completeAppLikeCounts(items: NormalizedAppVideoItem[], signal: AbortSignal): Promise<void> {
  const manuscripts = new Map<number, NormalizedAppVideoItem[]>()
  for (const item of items) {
    const aid = getAppVideoAid(item)
    if (item.card_goto !== 'av' || !aid || item.normalized.likeCount !== undefined)
      continue
    const cards = manuscripts.get(aid)
    if (cards)
      cards.push(item)
    else
      manuscripts.set(aid, [item])
  }
  const pending = manuscripts.entries()
  async function readNext() {
    for (const [aid, cards] of pending) {
      signal.throwIfAborted()
      const result = await api.video.getVideoInfo({ aid: String(aid) }, { signal })
      signal.throwIfAborted()
      if (result.code !== 0)
        throw result
      const count = result.data?.stat?.like
      if (result.data?.aid !== aid || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
        throw new Error('Missing video like count')
      for (const card of cards)
        card.normalized.likeCount = count
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, manuscripts.size) }, readNext))
}
