import { onScopeDispose, readonly, ref } from 'vue'

import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'
import { notifyFollowingGroupsChanged } from '~/utils/userRelation'

import type { FollowingGroupMutation } from './model'
import { getFollowingGroupIds, isFollowingGroupNameValid, SPECIAL_FOLLOWING_GROUP } from './model'
import type { FollowingDirectory } from './useFollowingDirectory'

export interface FollowingGroupWriteResult {
  success: boolean
  applied: boolean
  groupId?: number
  error?: string
  reason?: 'invalid-name' | 'account-unavailable' | 'invalid-target'
}

export function useFollowingGroupWrites(directory: FollowingDirectory, getAccountId: () => AccountId, isActive: () => boolean) {
  const lifetime = createAccountLifetime(getAccountId)
  const busy = ref(false)
  async function submit(input: FollowingGroupMutation): Promise<FollowingGroupWriteResult> {
    if (busy.value || !isActive())
      return { success: false, applied: false }
    const owner = lifetime.capture()
    const csrf = getCSRF()
    if (!owner.isCurrent() || !csrf || String(getUserID()) !== String(owner.accountId))
      return { success: false, applied: true, reason: 'account-unavailable' }
    const operation = 'groupIds' in input ? { ...input, groupIds: [...input.groupIds] } : { ...input }
    if ('name' in operation) {
      operation.name = operation.name.trim()
      if (!isFollowingGroupNameValid(operation.name))
        return { success: false, applied: true, reason: 'invalid-name' }
    }
    if (('groupId' in operation && operation.groupId <= 0)
      || (operation.kind === 'move' && operation.targetGroupId !== 0 && !directory.groups.value.some(group => group.tagid === operation.targetGroupId))) {
      return { success: false, applied: true, reason: 'invalid-target' }
    }
    const normal = 'groupIds' in operation ? getFollowingGroupIds(operation.groupIds).filter(id => id >= 0) : []
    busy.value = true
    try {
      let response
      switch (operation.kind) {
        case 'create':
          response = await api.user.createFollowingGroup({ tag: operation.name, csrf })
          break
        case 'rename':
          response = await api.user.renameFollowingGroup({ tagid: String(operation.groupId), name: operation.name, csrf })
          break
        case 'delete':
          response = await api.user.deleteFollowingGroup({ tagid: String(operation.groupId), csrf })
          break
        case 'special':
          response = operation.enabled
            ? await api.user.copyFollowingUsers({ fids: String(operation.mid), tagids: String(SPECIAL_FOLLOWING_GROUP), csrf })
            : await api.user.moveFollowingUsers({ fids: String(operation.mid), beforeTagids: String(SPECIAL_FOLLOWING_GROUP), afterTagids: normal.join(','), csrf })
          break
        case 'move':
          response = await api.user.moveFollowingUsers({ fids: String(operation.mid), beforeTagids: normal.join(','), afterTagids: String(operation.targetGroupId), csrf })
          break
      }
      if (response.code !== 0)
        return { success: false, applied: owner.isCurrent() && isActive(), error: response.message }
      // A sent write can finish after this view closes. Invalidate a reopened
      // directory through the shared revision, without writing into the new view.
      notifyFollowingGroupsChanged(owner.accountId!)
      if (!owner.isCurrent() || !isActive() || String(getUserID()) !== String(owner.accountId))
        return { success: true, applied: false }
      if (operation.kind === 'move' || operation.kind === 'special') {
        const next = operation.kind === 'move'
          ? [...(operation.groupIds.includes(SPECIAL_FOLLOWING_GROUP) ? [SPECIAL_FOLLOWING_GROUP] : []), operation.targetGroupId]
          : [...(operation.enabled ? [SPECIAL_FOLLOWING_GROUP] : []), ...normal]
        directory.applyMembership(operation.mid, next)
      }
      else {
        if (operation.kind === 'delete')
          directory.removeGroup(operation.groupId)
        directory.acknowledgeRevision()
        await directory.loadGroups(true)
      }
      // A successful write is not retried when its authoritative refresh fails.
      return { success: true, applied: owner.isCurrent() && isActive(), groupId: Number(response.data?.tagid) || undefined }
    }
    catch (error) {
      return { success: false, applied: owner.isCurrent() && isActive(), error: error instanceof Error ? error.message : String(error) }
    }
    finally {
      busy.value = false
    }
  }
  onScopeDispose(lifetime.dispose)
  return { busy: readonly(busy), submit }
}
