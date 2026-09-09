export const DEFAULT_FOLLOWING_GROUP = 0
export const SPECIAL_FOLLOWING_GROUP = -10

export interface FollowingGroup {
  tagid: number
  name: string
  count: number
  tip?: string
}

export interface FollowingRelationUser {
  mid: number
  uname: string
  face: string
  mtime: number
  tag: number[] | null
  special: number
}

export interface FollowingUploader {
  mid: number
  name: string
  face: string
  groupIds: number[]
  hasUpdate: boolean
  hasPostTime: boolean
  lastUpdateTime: number
}

export function getFollowingGroupIds(tags: readonly number[] | null, special = 0): number[] {
  const normal = [...new Set((tags ?? []).filter(id => Number.isSafeInteger(id) && id > 0))]
  return [
    ...(special === 1 || tags?.includes(SPECIAL_FOLLOWING_GROUP) ? [SPECIAL_FOLLOWING_GROUP] : []),
    ...(normal.length ? normal : [DEFAULT_FOLLOWING_GROUP]),
  ]
}

export function groupFollowingUploaders(uploaders: readonly FollowingUploader[], groups: readonly FollowingGroup[], label: (id: number) => string) {
  const grouped = new Map(groups.filter(group => group.tagid >= 0 || group.tagid === SPECIAL_FOLLOWING_GROUP)
    .map(group => [group.tagid, { ...group, name: group.tagid <= 0 ? label(group.tagid) : group.name, uploaders: [] as FollowingUploader[] }]))
  for (const id of [SPECIAL_FOLLOWING_GROUP, DEFAULT_FOLLOWING_GROUP]) {
    if (!grouped.has(id))
      grouped.set(id, { tagid: id, name: label(id), count: 0, uploaders: [] })
  }
  for (const uploader of uploaders) {
    for (const id of getFollowingGroupIds(uploader.groupIds)) {
      let group = grouped.get(id)
      if (!group) {
        group = { tagid: id, name: label(id), count: 0, uploaders: [] }
        grouped.set(id, group)
      }
      group.uploaders.push(uploader)
    }
  }
  return [...grouped.values()].sort((a, b) => Number(a.tagid === 0) - Number(b.tagid === 0))
}

export type FollowingGroupMutation
  = | { kind: 'create', name: string }
    | { kind: 'rename', groupId: number, name: string }
    | { kind: 'delete', groupId: number }
    | { kind: 'move', mid: number, groupIds: number[], targetGroupId: number }
    | { kind: 'special', mid: number, groupIds: number[], enabled: boolean }

export function isFollowingGroupNameValid(name: string) {
  const length = Array.from(name.trim()).length
  return length >= 1 && length <= 16
}
