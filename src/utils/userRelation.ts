import { ref } from 'vue'

import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'
import emitter from '~/utils/mitt'

export interface UserRelationChange {
  accountId: number
  mid: number
  following: boolean
  blocked: boolean
}

const RELATION_CHANGED = 'user-relation-changed'
const revision = ref(0)

export function getUserRelationRevision() {
  return revision.value
}

export function notifyFollowingGroupsChanged(accountId: number) {
  if (String(getUserID()) === String(accountId))
    revision.value++
}

export function onUserRelationChange(listener: (change: UserRelationChange) => void) {
  emitter.on(RELATION_CHANGED, listener)
  return () => emitter.off(RELATION_CHANGED, listener)
}

/**
 * The submitted account/recipient owns the write even when its menu unmounts.
 * Readers keep their existing state; this event only invalidates/updates it.
 */
export async function changeUserRelation(accountId: number, mid: number, act: 1 | 2 | 5) {
  const csrf = getCSRF()
  if (String(getUserID() ?? '') !== String(accountId) || !csrf)
    return { code: -101, message: '' }
  const response = await api.user.relationModify({ fid: String(mid), act, re_src: 11, csrf })
  if (response.code === 0 && String(getUserID() ?? '') === String(accountId)) {
    revision.value++
    emitter.emit(RELATION_CHANGED, { accountId, mid, following: act === 1, blocked: act === 5 } satisfies UserRelationChange)
  }
  return response
}
