import { createSharedComposable } from '@vueuse/core'
import { onScopeDispose, readonly, ref, watch } from 'vue'

import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getUserID } from '~/utils/main'
import { onUserRelationChange } from '~/utils/userRelation'

export interface UserRelation {
  isFollowing: boolean
}

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

  function getCurrentAccountId() {
    const account = resolveAuthenticatedAccountId(topBarStore.isLogin, topBarStore.userInfo.mid)
    return account !== null && String(getUserID()) === String(account) ? account : null
  }

  /**
   * 批量查询用户关系状态
   * @param mids 用户 mid 数组
   */
  async function batchQueryUserRelations(mids: number[], isRequestCurrent: () => boolean) {
    const accountId = getCurrentAccountId()
    if (mids.length === 0 || accountId === null)
      return
    const generation = requestGeneration

    // B站API限制最多40个mid
    const chunks: number[][] = []
    for (let i = 0; i < mids.length; i += 40) {
      chunks.push(mids.slice(i, i + 40))
    }

    for (const chunk of chunks) {
      if (!isRequestCurrent() || generation !== requestGeneration || accountId !== getCurrentAccountId())
        return
      const versions = new Map(chunk.map(mid => [String(mid), relationVersions.get(String(mid)) ?? 0]))
      try {
        const response = await api.user.getRelations({
          fids: chunk.join(','),
        })

        if (!isRequestCurrent() || generation !== requestGeneration || accountId !== getCurrentAccountId())
          return

        if (response.code === 0 && response.data) {
          Object.keys(response.data).forEach((midStr) => {
            const mid = Number(midStr)
            if (versions.get(midStr) !== (relationVersions.get(midStr) ?? 0))
              return
            const relation = response.data[midStr]
            // attribute: 0=未关注, 1=悄悄关注, 2=关注, 6=互相关注, 128=拉黑
            const isFollowing = relation.attribute === 2 || relation.attribute === 6
            userRelations.value[mid] = {
              isFollowing,
            }
          })
        }
      }
      catch (error) {
        if (isRequestCurrent() && generation === requestGeneration && accountId === getCurrentAccountId())
          console.error('批量查询用户关系失败:', error)
      }
    }
  }

  /**
   * 更新单个用户的关注状态
   * @param mid 用户 mid
   * @param isFollowing 是否关注
   */
  function updateUserRelation(mid: number, isFollowing: boolean) {
    relationVersions.set(String(mid), (relationVersions.get(String(mid)) ?? 0) + 1)
    if (userRelations.value[mid]) {
      userRelations.value[mid].isFollowing = isFollowing
    }
    else {
      userRelations.value[mid] = {
        isFollowing,
      }
    }
  }

  /**
   * 重置所有用户关系状态
   */
  function reset() {
    requestGeneration++
    userRelations.value = {}
    relationVersions.clear()
  }

  watch(getCurrentAccountId, reset, { flush: 'sync' })
  const stopChanges = onUserRelationChange((change) => {
    if (change.accountId === getCurrentAccountId())
      updateUserRelation(change.mid, change.following)
  })
  onScopeDispose(() => {
    requestGeneration++
    stopChanges()
  })

  return {
    userRelations: readonly(userRelations),
    batchQueryUserRelations,
  }
})

export function useUserRelations() {
  const owner = useSharedUserRelations()
  let queryGeneration = 0
  function reset() {
    queryGeneration++
  }
  onScopeDispose(reset)
  return {
    ...owner,
    reset,
    batchQueryUserRelations(mids: number[]) {
      const generation = queryGeneration
      return owner.batchQueryUserRelations(mids, () => generation === queryGeneration)
    },
  }
}
