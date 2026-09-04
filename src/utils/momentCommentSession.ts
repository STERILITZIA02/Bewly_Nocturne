import type { InjectionKey } from 'vue'

import type { MomentCommentItem } from '~/components/MomentCard/commentUtils'
import type { MomentCommentTarget } from '~/utils/momentCommentTarget'
import type { MomentCommentThreadSnapshot } from '~/utils/momentCommentThread'

export interface MomentCommentSessionSnapshot {
  comments: MomentCommentItem[]
  nextPage: number
  hasMore: boolean
  threads: MomentCommentThreadSnapshot[]
  likedIds: string[]
  likeCounts: Record<string, number>
  scrollTop: number
}

interface SessionLease {
  key: string
  generation: number
  accountId: string
}

interface SessionEntry {
  momentId: string
  target: MomentCommentTarget
  snapshot?: MomentCommentSessionSnapshot
}

// Normalized comments contain only JSON data. Copying also detaches Vue proxies.
function copySnapshot(snapshot: MomentCommentSessionSnapshot): MomentCommentSessionSnapshot {
  return JSON.parse(JSON.stringify(snapshot))
}

export function createMomentCommentSessionCache(initialAccountId: string, limit = 16) {
  const entries = new Map<string, SessionEntry>()
  let accountId = initialAccountId
  let generation = 0
  const clear = () => {
    generation += 1
    entries.clear()
  }
  const touch = (key: string, entry: SessionEntry) => {
    entries.delete(key)
    entries.set(key, entry)
    while (entries.size > limit)
      entries.delete(entries.keys().next().value!)
  }
  const current = (lease: SessionLease) => lease.generation === generation && lease.accountId === accountId
  return {
    clear,
    setAccount(nextAccountId: string) {
      if (accountId === nextAccountId)
        return
      accountId = nextAccountId
      clear()
    },
    getTarget(requestAccountId: string, momentId: string) {
      if (requestAccountId !== accountId)
        return null
      for (const [key, entry] of entries) {
        if (entry.momentId === momentId) {
          touch(key, entry)
          return { ...entry.target }
        }
      }
      return null
    },
    open(requestAccountId: string, momentId: string, target: MomentCommentTarget): SessionLease | null {
      if (requestAccountId !== accountId)
        return null
      const key = JSON.stringify([accountId, momentId, target.type, target.oid])
      for (const [oldKey, entry] of entries) {
        if (entry.momentId === momentId && oldKey !== key)
          entries.delete(oldKey)
      }
      touch(key, entries.get(key) ?? { momentId, target: { ...target } })
      return { key, generation, accountId }
    },
    restore(lease: SessionLease) {
      const entry = current(lease) ? entries.get(lease.key) : undefined
      if (!entry?.snapshot)
        return null
      touch(lease.key, entry)
      return copySnapshot(entry.snapshot)
    },
    save(lease: SessionLease, snapshot: MomentCommentSessionSnapshot) {
      const entry = current(lease) ? entries.get(lease.key) : undefined
      // Evicted, reset or old-account cards must not resurrect discarded state.
      if (!entry)
        return
      touch(lease.key, { ...entry, snapshot: copySnapshot(snapshot) })
    },
  }
}

export const MOMENT_COMMENT_SESSIONS: InjectionKey<ReturnType<typeof createMomentCommentSessionCache>> = Symbol('moment-comment-sessions')
