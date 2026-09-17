import { createSharedComposable } from '@vueuse/core'
import { getCurrentInstance, onActivated, onDeactivated, onScopeDispose, readonly, ref, watch } from 'vue'

import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getUserID } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { onUserRelationChange } from '~/utils/userRelation'

export interface UserRelation {
  isFollowing: boolean
}

const RELATION_BATCH_SIZE = 40
const RELATION_TTL = 5 * 60_000
const RELATION_RETRY_DELAY = 30_000
const RELATION_CACHE_BUDGET = 512
const RELATION_ATTRIBUTES = [0, 1, 2, 6, 128]
// A reloaded extension cannot revive this content-script world. Keep the
// terminal state across shared-owner recreation when cards/pages remount.
let extensionContextInvalidated = false

/**
 * 用户关系管理的 composable
 * 处理批量查询用户关注状态
 */
// One account-owned set of server relations is shared by search, cards and
// their menus. VueUse releases its effects/data after the final consumer exits.
const useSharedUserRelations = createSharedComposable(() => {
  const topBarStore = useTopBarStore()
  const userRelations = ref<Record<number, UserRelation>>({})
  let requestGeneration = 0
  const relationVersions = new Map<string, number>()
  const accessTimes = new Map<number, number>()
  const retryAfter = new Map<number, number>()
  const consumers = new Map<object, Set<number>>()
  const pending = new Map<number, { promise: Promise<void>, resolve: () => void, readers: Set<() => boolean> }>()

  function prune() {
    const retained = new Set([...consumers.values()].flatMap(mids => [...mids]))
    for (const [mid, time] of accessTimes) {
      if (!retained.has(mid) && !pending.has(mid)
        && (accessTimes.size > RELATION_CACHE_BUDGET || (Date.now() - time >= RELATION_TTL && (retryAfter.get(mid) ?? 0) <= Date.now()))) {
        delete userRelations.value[mid]
        relationVersions.delete(String(mid))
        accessTimes.delete(mid)
        retryAfter.delete(mid)
      }
    }
  }

  function retain(consumer: object, mids: number[]) {
    if (mids.length)
      consumers.set(consumer, new Set(mids))
    else
      consumers.delete(consumer)
    prune()
  }

  function getCurrentAccountId() {
    const account = resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid)
    return account !== null && String(getUserID()) === String(account) ? account : null
  }

  /**
   * 批量查询用户关系状态
   * @param mids 用户 mid 数组
   */
  async function batchQueryUserRelations(mids: number[], isRequestCurrent: () => boolean) {
    if (extensionContextInvalidated)
      return
    const accountId = getCurrentAccountId()
    if (mids.length === 0 || accountId === null)
      return
    const generation = requestGeneration
    const waits: Promise<void>[] = []
    const fresh: number[] = []
    for (const mid of new Set(mids)) {
      if (!Number.isSafeInteger(mid) || mid <= 0 || mid === accountId)
        continue
      if (userRelations.value[mid] && Date.now() - (accessTimes.get(mid) ?? 0) < RELATION_TTL) {
        const updatedAt = accessTimes.get(mid)!
        accessTimes.delete(mid)
        accessTimes.set(mid, updatedAt)
        continue
      }
      if ((retryAfter.get(mid) ?? 0) > Date.now())
        continue
      let query = pending.get(mid)
      if (!query) {
        let resolve!: () => void
        const promise = new Promise<void>((done) => {
          resolve = done
        })
        query = { promise, resolve, readers: new Set() }
        pending.set(mid, query)
        fresh.push(mid)
      }
      query.readers.add(isRequestCurrent)
      waits.push(query.promise)
    }
    // Client URL budget, not an assumed server result count.
    const chunks: number[][] = []
    for (let i = 0; i < fresh.length; i += RELATION_BATCH_SIZE) {
      chunks.push(fresh.slice(i, i + RELATION_BATCH_SIZE))
    }

    const scheduledQueries = new Map(fresh.map(mid => [mid, pending.get(mid)!]))
    for (const chunk of chunks) {
      const queries = new Map(chunk.map(mid => [mid, scheduledQueries.get(mid)!]))
      const isInterested = (mid: number) => [...queries.get(mid)!.readers].some(current => current())
      const versions = new Map(chunk.map(mid => [String(mid), relationVersions.get(String(mid)) ?? 0]))
      try {
        if (extensionContextInvalidated || generation !== requestGeneration || accountId !== getCurrentAccountId() || !chunk.some(isInterested))
          continue
        const response = await api.user.getRelations({
          fids: chunk.join(','),
        })

        if (extensionContextInvalidated || generation !== requestGeneration || accountId !== getCurrentAccountId())
          continue

        const data = response?.data === null ? {} : response?.data
        if (response?.code !== 0 || !data || typeof data !== 'object' || Array.isArray(data))
          throw new Error('Invalid user relations response')
        if (Object.entries(data).some(([mid, relation]) => !/^[1-9]\d*$/.test(mid)
          || !relation || typeof relation !== 'object' || !RELATION_ATTRIBUTES.includes((relation as { attribute: number }).attribute))) {
          throw new Error('Invalid user relation entry')
        }
        chunk.forEach((mid) => {
          const midStr = String(mid)
          if (!isInterested(mid))
            return
          if (versions.get(midStr) !== (relationVersions.get(midStr) ?? 0))
            return
          const attribute = Object.hasOwn(data, midStr) ? data[midStr]?.attribute : 0
          // attribute: 0=未关注, 1=悄悄关注, 2=关注, 6=互相关注, 128=拉黑
          const isFollowing = attribute === 1 || attribute === 2 || attribute === 6
          if (userRelations.value[mid]?.isFollowing !== isFollowing)
            userRelations.value[mid] = { isFollowing }
          accessTimes.delete(mid)
          accessTimes.set(mid, Date.now())
          retryAfter.delete(mid)
        })
      }
      catch (error) {
        // Even a superseded account/query can prove the whole runtime is dead.
        // Settle joined readers and unsent chunks without erasing known data.
        if (isExtensionContextInvalidatedError(error)) {
          extensionContextInvalidated = true
          invalidateQueries()
          retryAfter.clear()
          return
        }
        if (!extensionContextInvalidated && generation === requestGeneration && accountId === getCurrentAccountId()) {
          chunk.forEach((mid) => {
            retryAfter.set(mid, Date.now() + RELATION_RETRY_DELAY)
            if (!accessTimes.has(mid))
              accessTimes.set(mid, Date.now())
          })
          console.error('批量查询用户关系失败:', error)
        }
      }
      finally {
        queries.forEach((query, mid) => {
          if (pending.get(mid) === query)
            pending.delete(mid)
          query.resolve()
        })
        prune()
      }
    }
    await Promise.all(waits)
  }

  /**
   * 更新单个用户的关注状态
   * @param mid 用户 mid
   * @param isFollowing 是否关注
   */
  function updateUserRelation(mid: number, isFollowing: boolean) {
    accessTimes.delete(mid)
    accessTimes.set(mid, Date.now())
    relationVersions.set(String(mid), (relationVersions.get(String(mid)) ?? 0) + 1)
    if (userRelations.value[mid]) {
      userRelations.value[mid].isFollowing = isFollowing
    }
    else {
      userRelations.value[mid] = {
        isFollowing,
      }
    }
    prune()
  }

  function invalidateQueries() {
    requestGeneration++
    pending.forEach((query) => {
      query.readers.clear()
      query.resolve()
    })
    pending.clear()
  }

  /**
   * 重置所有用户关系状态
   */
  function reset() {
    invalidateQueries()
    userRelations.value = {}
    relationVersions.clear()
    accessTimes.clear()
    retryAfter.clear()
  }

  watch(getCurrentAccountId, reset, { flush: 'sync' })
  const stopChanges = onUserRelationChange((change) => {
    if (change.accountId === getCurrentAccountId())
      updateUserRelation(change.mid, change.following)
  })
  onScopeDispose(() => {
    reset()
    consumers.clear()
    stopChanges()
  })

  return {
    userRelations: readonly(userRelations),
    batchQueryUserRelations,
    retain,
  }
})

export function useUserRelations() {
  const owner = useSharedUserRelations()
  const consumer = {}
  let queryGeneration = 0
  let active = true
  let retained: number[] = []
  let queried = false
  function reset() {
    queryGeneration++
    retained = []
    queried = false
    owner.retain(consumer, [])
  }
  onScopeDispose(reset)
  if (getCurrentInstance()) {
    onDeactivated(() => {
      active = false
      queryGeneration++
      owner.retain(consumer, [])
    })
    onActivated(() => {
      active = true
      owner.retain(consumer, retained)
      if (queried) {
        const generation = ++queryGeneration
        void owner.batchQueryUserRelations(retained, () => active && generation === queryGeneration)
      }
    })
  }
  return {
    userRelations: owner.userRelations,
    reset,
    retainUserRelations(mids: number[]) {
      retained = mids
      owner.retain(consumer, active ? mids : [])
    },
    batchQueryUserRelations(mids: number[]) {
      retained = mids
      queried = true
      owner.retain(consumer, active ? mids : [])
      const generation = ++queryGeneration
      return owner.batchQueryUserRelations(active ? mids : [], () => active && generation === queryGeneration)
    },
  }
}
