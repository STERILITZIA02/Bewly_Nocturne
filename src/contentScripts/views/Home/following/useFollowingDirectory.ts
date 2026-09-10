import { computed, onActivated, onScopeDispose, ref, watch } from 'vue'

import type { HomeTabState } from '~/composables/useHomeTabState'
import { uploaderLatestVideoTimes, uploaderLatestVideoTimesReady } from '~/logic/uploaderLatestVideoTimes'
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getUserRelationRevision, onUserRelationChange } from '~/utils/userRelation'

import type { FollowingGroup, FollowingRelationUser, FollowingUploader } from './model'
import { getFollowingGroupIds } from './model'

export interface FollowingLoadResult { status: 'success' | 'login-required' | 'error' }

export function useFollowingDirectory(state: HomeTabState, getAccountId: () => AccountId, context: {
  viewed: () => Record<number, number>
  blocked: () => Set<number>
  selected: () => number | null
}) {
  const lifetime = createAccountLifetime(getAccountId)
  const uploaders = state.ref<FollowingUploader[]>('uploaderList', [])
  const groups = state.ref<FollowingGroup[]>('followingGroups', [])
  const page = state.ref('followingPage', 1)
  const loaded = state.ref('followingListLoaded', false)
  const groupsLoaded = state.ref('followingGroupsLoaded', false)
  const loadedRevision = state.ref('followingRelationRevision', -1)
  const loading = ref(false)
  const failed = ref(false)
  const groupsLoading = ref(false)
  const groupsFailed = ref(false)
  let pending: Promise<FollowingLoadResult> | undefined
  let groupsPending: Promise<boolean> | undefined
  let groupGeneration = 0
  let mutationVersion = 0
  const changedMembers = new Map<number, number>()
  const removedMembers = new Set<number>()
  const removedGroups = new Set<number>()
  let memberReads = 0
  const current = () => state.isCurrent() && getAccountId() !== null
  function clearReadFences() {
    if (!pending && memberReads === 0) {
      changedMembers.clear()
      removedMembers.clear()
      removedGroups.clear()
    }
  }

  function sortedUploaders(items: FollowingUploader[], excludeMid = context.selected()) {
    if (excludeMid !== null)
      return items
    const blocked = context.blocked()
    const next = [...items].sort((a, b) => Number(blocked.has(a.mid)) - Number(blocked.has(b.mid)) || b.lastUpdateTime - a.lastUpdateTime)
    return next.some((item, index) => item !== items[index]) ? next : items
  }
  function sort(excludeMid = context.selected()) {
    const next = sortedUploaders(uploaders.value, excludeMid)
    if (next !== uploaders.value)
      uploaders.value = next
  }

  function withUpdateStatus(uploader: FollowingUploader, viewed: Record<number, number>, now: number) {
    const hasUpdate = uploader.hasPostTime && uploader.lastUpdateTime > (viewed[uploader.mid] ?? 0)
      && now - uploader.lastUpdateTime <= 3 * 24 * 60 * 60 * 1000
    return hasUpdate === uploader.hasUpdate ? uploader : { ...uploader, hasUpdate }
  }

  function updateStatus() {
    const viewed = context.viewed()
    const now = Date.now()
    const next = sortedUploaders(uploaders.value.map(uploader => withUpdateStatus(uploader, viewed, now)))
    if (next.some((user, index) => user !== uploaders.value[index]))
      uploaders.value = next
  }

  function notePublication(mid: number, time: number) {
    const index = uploaders.value.findIndex(user => user.mid === mid)
    const previous = uploaders.value[index]
    if (!previous || (previous.hasPostTime && previous.lastUpdateTime >= time))
      return false
    uploaders.value[index] = { ...previous, lastUpdateTime: time, hasPostTime: true }
    return true
  }
  function markViewed(mid: number) {
    const index = uploaders.value.findIndex(user => user.mid === mid)
    const uploader = uploaders.value[index]
    if (uploader?.hasUpdate)
      uploaders.value[index] = { ...uploader, hasUpdate: false }
  }

  function applyRecordedTimes() {
    if (!current())
      return
    let changed = false
    const next = uploaders.value.map((uploader) => {
      const time = uploaderLatestVideoTimes.value[String(uploader.mid)]?.time
      if (!time || (uploader.hasPostTime && uploader.lastUpdateTime >= time))
        return uploader
      changed = true
      return { ...uploader, lastUpdateTime: time, hasPostTime: true }
    })
    if (changed) {
      const viewed = context.viewed()
      const now = Date.now()
      uploaders.value = sortedUploaders(next.map(uploader => withUpdateStatus(uploader, viewed, now)))
    }
  }
  watch(uploaderLatestVideoTimes, applyRecordedTimes, { deep: true })

  function mapUploader(raw: FollowingRelationUser): FollowingUploader {
    const time = uploaderLatestVideoTimes.value[String(raw.mid)]?.time
    return { mid: raw.mid, name: raw.uname, face: raw.face, groupIds: getFollowingGroupIds(raw.tag?.filter(id => !removedGroups.has(id)) ?? null, raw.special), lastUpdateTime: time ?? Number(raw.mtime || 0) * 1000, hasPostTime: Boolean(time), hasUpdate: false }
  }

  function load(force = false): Promise<FollowingLoadResult> {
    if (!current())
      return Promise.resolve({ status: 'login-required' })
    if (pending)
      return pending.then(result => result.status === 'success' && current() && loadedRevision.value < getUserRelationRevision() ? load(true) : result)
    if (loaded.value && !force && loadedRevision.value === getUserRelationRevision())
      return Promise.resolve({ status: 'success' })
    const owner = lifetime.capture()
    const isCurrent = () => owner.isCurrent() && current()
    const revision = getUserRelationRevision()
    const version = mutationVersion
    const refresh = loaded.value || force
    const retained = refresh ? [] : [...uploaders.value]
    let nextPage = refresh ? 1 : page.value
    const seen = new Set(retained.map(user => user.mid))
    loading.value = true
    failed.value = false
    const task = (async (): Promise<FollowingLoadResult> => {
      try {
        await uploaderLatestVideoTimesReady
        while (isCurrent()) {
          const response = await api.user.getUserFollowings({ vmid: String(owner.accountId), ps: 50, pn: nextPage })
          if (!isCurrent())
            return { status: 'error' }
          if (response.code === -101) {
            failed.value = true
            return { status: 'login-required' }
          }
          if (response.code !== 0 || !response.data || (response.data.list !== null && !Array.isArray(response.data.list)))
            throw new Error('Invalid following list')
          const users: FollowingRelationUser[] = response.data.list ?? []
          if (users.length && users.every(user => seen.has(user.mid)))
            throw new Error('Following pagination made no progress')
          // Derived only for this response. Writes during a read keep their
          // version fence without repeated full-directory lookups per member.
          const currentMembers = changedMembers.size ? new Map(uploaders.value.map(user => [user.mid, user])) : undefined
          for (const raw of users) {
            if (seen.has(raw.mid))
              continue
            seen.add(raw.mid)
            const newer = (changedMembers.get(raw.mid) ?? 0) > version
            const user = newer
              ? currentMembers?.get(raw.mid) ?? (removedMembers.has(raw.mid) ? undefined : mapUploader(raw))
              : mapUploader(raw)
            if (user)
              retained.push(user)
          }
          const complete = users.length < 50 || nextPage * 50 >= Number(response.data.total)
          if (!refresh || complete) {
            uploaders.value = retained.map(user => (changedMembers.get(user.mid) ?? 0) > version
              ? currentMembers?.get(user.mid) ?? (removedMembers.has(user.mid) ? undefined : user)
              : user).filter((user): user is FollowingUploader => !!user)
            updateStatus()
            loadedRevision.value = Math.max(loadedRevision.value, revision)
          }
          if (complete) {
            loaded.value = true
            loadedRevision.value = Math.max(loadedRevision.value, revision)
            return { status: 'success' }
          }
          nextPage++
          if (!refresh)
            page.value = nextPage
        }
      }
      catch {
        if (isCurrent())
          failed.value = true
      }
      return { status: 'error' }
    })().finally(() => {
      if (pending === task) {
        pending = undefined
        loading.value = false
        clearReadFences()
      }
    })
    pending = task
    return task
  }

  function loadGroups(force = false): Promise<boolean> {
    if (!current())
      return Promise.resolve(false)
    if (groupsPending && !force)
      return groupsPending
    if (groupsLoaded.value && !force)
      return Promise.resolve(true)
    const owner = lifetime.capture()
    const generation = ++groupGeneration
    groupsLoading.value = true
    groupsFailed.value = false
    const task = api.user.getFollowingGroups().then((response) => {
      if (!owner.isCurrent() || !current() || generation !== groupGeneration)
        return false
      if (response.code !== 0 || !Array.isArray(response.data))
        throw new Error('Invalid following groups')
      groups.value = response.data
      groupsLoaded.value = true
      return true
    }).catch(() => {
      if (owner.isCurrent() && current() && generation === groupGeneration)
        groupsFailed.value = true
      return false
    }).finally(() => {
      if (groupsPending === task) {
        groupsPending = undefined
        groupsLoading.value = false
      }
    })
    groupsPending = task
    return task
  }

  function acknowledgeRevision() {
    loadedRevision.value = getUserRelationRevision()
  }
  function applyMembership(mid: number, groupIds: number[]) {
    changedMembers.set(mid, ++mutationVersion)
    uploaders.value = uploaders.value.map(user => user.mid === mid ? { ...user, groupIds: getFollowingGroupIds(groupIds) } : user)
    acknowledgeRevision()
  }
  async function refreshMember(mid: number) {
    const owner = lifetime.capture()
    const version = mutationVersion
    memberReads++
    try {
      const response = await api.user.getRelations({ fids: String(mid) })
      if (!owner.isCurrent() || !current() || (changedMembers.get(mid) ?? 0) > version)
        return undefined
      const relation = response.code === 0 ? response.data?.[String(mid)] : undefined
      if (!relation || (relation.tag !== null && !Array.isArray(relation.tag)))
        return undefined
      changedMembers.set(mid, ++mutationVersion)
      if (relation.attribute !== 2 && relation.attribute !== 6) {
        removedMembers.add(mid)
        uploaders.value = uploaders.value.filter(user => user.mid !== mid)
        return undefined
      }
      const groupIds = getFollowingGroupIds(relation.tag, relation.special)
      uploaders.value = uploaders.value.map(user => user.mid === mid ? { ...user, groupIds } : user)
      return uploaders.value.find(user => user.mid === mid)
    }
    catch {
      return undefined
    }
    finally {
      memberReads--
      clearReadFences()
    }
  }
  function removeGroup(id: number) {
    removedGroups.add(id)
    groups.value = groups.value.filter(group => group.tagid !== id)
    const version = ++mutationVersion
    let changed = false
    const next = uploaders.value.map((user) => {
      if (!user.groupIds.includes(id))
        return user
      changed = true
      changedMembers.set(user.mid, version)
      return { ...user, groupIds: getFollowingGroupIds(user.groupIds.filter(group => group !== id)) }
    })
    if (changed)
      uploaders.value = next
    groupGeneration++
    acknowledgeRevision()
  }
  const stopChanges = onUserRelationChange((change) => {
    if (!current() || change.accountId !== getAccountId())
      return
    changedMembers.set(change.mid, ++mutationVersion)
    if (!change.following) {
      removedMembers.add(change.mid)
      uploaders.value = uploaders.value.filter(user => user.mid !== change.mid)
      acknowledgeRevision()
    }
    else if (!uploaders.value.some(user => user.mid === change.mid)) {
      removedMembers.delete(change.mid)
      void load(true)
    }
  })
  watch(getUserRelationRevision, () => {
    if (current() && loadedRevision.value !== getUserRelationRevision()) {
      void load(true)
      if (groupsLoaded.value)
        void loadGroups(true)
    }
  })
  onActivated(() => {
    if (current() && loadedRevision.value !== getUserRelationRevision())
      void load()
  })
  function reset() {
    lifetime.invalidate()
    groupGeneration++
    pending = undefined
    groupsPending = undefined
    loading.value = false
    failed.value = false
    groupsLoading.value = false
    groupsFailed.value = false
    uploaders.value = []
    groups.value = []
    page.value = 1
    loaded.value = false
    groupsLoaded.value = false
    loadedRevision.value = -1
    changedMembers.clear()
    removedMembers.clear()
    removedGroups.clear()
  }
  onScopeDispose(() => {
    lifetime.dispose()
    stopChanges()
  })
  return { uploaders: computed(() => uploaders.value), groups: computed(() => groups.value), loaded: computed(() => loaded.value), loading, failed, groupsLoading, groupsFailed, load, loadGroups, reset, updateStatus, sort, notePublication, markViewed, applyMembership, removeGroup, acknowledgeRevision, refreshMember }
}

export type FollowingDirectory = ReturnType<typeof useFollowingDirectory>
