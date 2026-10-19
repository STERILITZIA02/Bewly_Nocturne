import type { ShallowRef } from 'vue'
import { shallowRef, watch } from 'vue'

export interface RecommendationFeedEntry {
  uniqueId: string
  /** Classified once from the immutable raw item when the entry is accepted. */
  isAdvertisement: boolean
}

/**
 * The accepted list stays the only writable truth, in its existing owner.
 * This keeps two derived structures in step with it: the dedupe key index and
 * the visible projection (advertisements hidden while `blockAds` is on). An
 * appended batch only indexes, classifies and projects its own entries; a
 * replaced list (refresh, restore, mode switch) or a changed policy rebuilds.
 * Hidden advertisements remain in the accepted list, so turning the filter off
 * or undoing a refresh restores them.
 */
export function createRecommendationFeed<E extends RecommendationFeedEntry>(
  list: ShallowRef<E[]>,
  options: { blockAds: () => boolean, keysOf: (entry: E) => readonly string[] },
) {
  const keys = new Set<string>()
  const visible = shallowRef<E[]>([])
  let indexed: E[] | undefined
  let projectedBlockAds: boolean | undefined

  function project(entries: readonly E[]) {
    return projectedBlockAds ? entries.filter(entry => !entry.isAdvertisement) : entries.slice()
  }

  function rebuild() {
    indexed = list.value
    keys.clear()
    for (const entry of indexed) {
      for (const key of options.keysOf(entry))
        keys.add(key)
    }
    projectedBlockAds = options.blockAds()
    visible.value = project(indexed)
  }

  // Assignments from other paths (reset, restore, mode switch) rebuild once.
  watch(list, (value) => {
    if (value !== indexed)
      rebuild()
  }, { flush: 'sync' })
  watch(options.blockAds, (blockAds) => {
    if (blockAds !== projectedBlockAds) {
      projectedBlockAds = blockAds
      visible.value = project(list.value)
    }
  })
  rebuild()

  return {
    visible,
    has: (key: string) => keys.has(key),
    /** Publishes one batch: a new list root and the projection of the batch. */
    append(entries: readonly E[]) {
      if (!entries.length)
        return
      const next = list.value.concat(entries)
      indexed = next
      for (const entry of entries) {
        for (const key of options.keysOf(entry))
          keys.add(key)
      }
      list.value = next
      const shown = project(entries)
      if (shown.length)
        visible.value = visible.value.concat(shown)
    },
  }
}
