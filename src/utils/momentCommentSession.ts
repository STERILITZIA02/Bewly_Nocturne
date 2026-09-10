import type { InjectionKey } from 'vue'
import { shallowReactive } from 'vue'

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
  revision: number
  sort: 0 | 1
}

interface CommentLikeState {
  owner: SessionLease
  version: number
  pending: boolean
  liked: boolean
  count: number
  previousLiked: boolean
  previousCount: number
}

interface SessionEntry {
  momentId: string
  target: MomentCommentTarget
  sort: 0 | 1
  revision: number
  snapshot?: string
  likes: Map<string, CommentLikeState>
  likeVersion: number
  readers: Set<SessionLease>
}

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024
const CACHE_BYTE_BUDGET = 8 * 1024 * 1024

export function createMomentCommentSessionCache(initialAccountId: string, limit = 16) {
  const entries = new Map<string, SessionEntry>()
  const cachedBytes = () => [...entries.values()].reduce((total, entry) => total + (entry.snapshot?.length ?? 0) * 2, 0)
  let accountId = initialAccountId
  let generation = 0
  const clear = () => {
    generation += 1
    entries.clear()
  }
  const pruneEntries = () => {
    while (entries.size > limit) {
      const evict = [...entries].find(([, entry]) => !entry.readers.size && ![...entry.likes.values()].some(like => like.pending))
      if (!evict)
        break
      entries.delete(evict[0])
    }
  }
  const touch = (key: string, entry: SessionEntry) => {
    entries.delete(key)
    entries.set(key, entry)
    pruneEntries()
  }
  const current = (lease: SessionLease) => lease.generation === generation && lease.accountId === accountId
  const storeSnapshot = (entry: SessionEntry, snapshot: MomentCommentSessionSnapshot) => {
    const likedIds = new Set(snapshot.likedIds)
    const likeCounts = { ...snapshot.likeCounts }
    for (const [id, like] of entry.likes) {
      const liked = like.pending ? like.previousLiked : like.liked
      if (liked)
        likedIds.add(id)
      else
        likedIds.delete(id)
      likeCounts[id] = like.pending ? like.previousCount : like.count
    }
    // JSON is immutable and detached from Vue. Serialize once on save, parse
    // once on restore; no mutable comment array is shared with the cache.
    const serialized = JSON.stringify({ ...snapshot, likedIds: [...likedIds], likeCounts })
    entry.snapshot = serialized.length * 2 <= MAX_SNAPSHOT_BYTES ? serialized : undefined
    for (const candidate of entries.values()) {
      if (cachedBytes() <= CACHE_BYTE_BUDGET)
        break
      candidate.snapshot = undefined
    }
  }
  return {
    clear,
    get cachedBytes() { return cachedBytes() },
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
    open(requestAccountId: string, momentId: string, target: MomentCommentTarget, sort?: 0 | 1): SessionLease | null {
      if (requestAccountId !== accountId)
        return null
      const key = JSON.stringify([accountId, momentId, target.type, target.oid])
      for (const [oldKey, entry] of entries) {
        if (entry.momentId === momentId && oldKey !== key)
          entries.delete(oldKey)
      }
      const entry = entries.get(key) ?? { momentId, target: { ...target }, sort: sort ?? 0, revision: 0, likeVersion: 0, likes: shallowReactive(new Map<string, CommentLikeState>()), readers: new Set<SessionLease>() }
      if (sort !== undefined && sort !== entry.sort) {
        entry.sort = sort
        entry.revision += 1
        entry.snapshot = undefined
      }
      const lease = { key, generation, accountId, revision: entry.revision, sort: entry.sort }
      entry.readers.add(lease)
      touch(key, entry)
      return lease
    },
    release(lease: SessionLease) {
      if (!current(lease))
        return
      entries.get(lease.key)?.readers.delete(lease)
      pruneEntries()
    },
    restore(lease: SessionLease) {
      const entry = current(lease) ? entries.get(lease.key) : undefined
      if (!entry?.snapshot || entry.revision !== lease.revision)
        return null
      touch(lease.key, entry)
      return JSON.parse(entry.snapshot) as MomentCommentSessionSnapshot
    },
    save(lease: SessionLease, snapshot: MomentCommentSessionSnapshot) {
      const entry = current(lease) ? entries.get(lease.key) : undefined
      // Evicted, reset or old-account cards must not resurrect discarded state.
      if (!entry || entry.revision !== lease.revision)
        return
      touch(lease.key, entry)
      storeSnapshot(entry, snapshot)
    },
    getLike(lease: SessionLease | null, id: string) {
      const like = lease && current(lease) ? entries.get(lease.key)?.likes.get(id) : undefined
      // Optimism belongs to the initiating view. A remount/new sort restores
      // the confirmed snapshot but retains the shared pending-write lock.
      return like?.pending && like.owner !== lease
        ? { ...like, liked: like.previousLiked, count: like.previousCount }
        : like
    },
    hasPendingLikes(lease: SessionLease | null) {
      return !!lease && current(lease) && [...(entries.get(lease.key)?.likes.values() ?? [])].some(like => like.pending)
    },
    getLikeReadVersion(lease: SessionLease | null) {
      return lease && current(lease) ? entries.get(lease.key)?.likeVersion ?? 0 : 0
    },
    reconcileLikeReads(lease: SessionLease | null, ids: Iterable<string>, readVersion: number) {
      const entry = lease && current(lease) ? entries.get(lease.key) : undefined
      if (!entry)
        return
      for (const id of ids) {
        const like = entry.likes.get(id)
        if (like && !like.pending && like.version <= readVersion)
          entry.likes.delete(id)
      }
    },
    startLike(lease: SessionLease | null, id: string, liked: boolean, count: number) {
      const entry = lease && current(lease) ? entries.get(lease.key) : undefined
      if (!entry || entry.likes.get(id)?.pending)
        return null
      const state: CommentLikeState = { owner: lease!, version: ++entry.likeVersion, pending: true, liked: !liked, count: Math.max(0, count + (liked ? -1 : 1)), previousLiked: liked, previousCount: count }
      entry.likes.set(id, state)
      return { lease: lease!, entry, id, state }
    },
    finishLike(operation: { lease: SessionLease, entry: SessionEntry, id: string, state: CommentLikeState }, succeeded: boolean) {
      const { lease, entry, id, state } = operation
      // Sort is a read identity. An already-sent write still belongs to this
      // account/target entry, including when its card has been remounted.
      if (!current(lease) || entries.get(lease.key) !== entry || entry.likes.get(id) !== state)
        return
      entry.likes.set(id, { ...state, version: ++entry.likeVersion, pending: false, liked: succeeded ? state.liked : state.previousLiked, count: succeeded ? state.count : state.previousCount })
      if (entry.snapshot)
        storeSnapshot(entry, JSON.parse(entry.snapshot))
      pruneEntries()
    },
  }
}

export const MOMENT_COMMENT_SESSIONS: InjectionKey<ReturnType<typeof createMomentCommentSessionCache>> = Symbol('moment-comment-sessions')
