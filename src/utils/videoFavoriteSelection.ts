import { computed, ref, shallowRef } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import { waitWithSignal } from '~/utils/abort'
import { createAccountLifetime } from '~/utils/accountLifetime'

export interface VideoFavoriteFolder { id: number, title: string, media_count: number, fav_state: number, max_count?: number }
interface FolderResponse { code: number, data?: { count: number, list: VideoFavoriteFolder[] | null } }
interface Dependencies {
  account: () => number | null
  csrf: () => string
  resolveAid: (bvid: string, signal: AbortSignal) => Promise<number | undefined>
  read: (aid: number, account: number, signal: AbortSignal) => Promise<FolderResponse>
  write: (data: { rid: number, add_media_ids: string, del_media_ids: string, csrf: string }) => Promise<{ code: number }>
  changed: () => Promise<unknown>
}

const submitted = new Map<string, Promise<void>>()
const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0

export function canFavoriteVideo(video: Partial<Video>) {
  return !video.roomid && !video.epid && !video.isAdvertisement && video.type !== 'ketang' && video.type !== 'bangumi'
    && (!video.goto || ['av', 'video'].includes(video.goto))
    && (validId(video.aid) || (typeof video.bvid === 'string' && /^BV[\da-z]+$/i.test(video.bvid)))
}

/** One editor snapshot; membership is authoritative only after the read succeeds. */
export function createVideoFavoriteSelection(video: Partial<Video>, deps: Dependencies) {
  const folders = shallowRef<VideoFavoriteFolder[]>([])
  const selected = ref<number[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const loaded = ref(false)
  const error = ref<'read' | 'save' | 'verify' | ''>('')
  const needsVerification = ref(false)
  const lifetime = createAccountLifetime(deps.account)
  const owner = lifetime.capture()
  const csrf = deps.csrf()
  const controller = new AbortController()
  let initial = new Set<number>()
  let desired: Set<number> | undefined
  let aid = validId(video.aid) ? video.aid : undefined
  const closed = ref(false)
  const sameAccount = () => owner.accountId !== null && deps.account() === owner.accountId && !!csrf && deps.csrf() === csrf
  const current = () => !closed.value && owner.isCurrent() && sameAccount()
  const editable = computed(() => loaded.value && !loading.value && !saving.value && !needsVerification.value && !closed.value)
  const full = (folder: VideoFavoriteFolder) => Number.isSafeInteger(folder.max_count) && folder.max_count! >= 0 && folder.media_count >= folder.max_count!

  async function read() {
    if (!current() || !aid)
      return false
    const response = await deps.read(aid, Number(owner.accountId), controller.signal)
    if (!current())
      return false
    const list = response.data?.list
    if (response.code !== 0 || !response.data || (!Array.isArray(list) && !(list === null && response.data.count === 0))
      || list?.some(folder => !validId(folder.id) || typeof folder.title !== 'string' || ![0, 1].includes(folder.fav_state))) {
      throw new Error('invalid favorite membership')
    }
    const next = list || []
    const members = new Set(next.filter(folder => folder.fav_state === 1).map(folder => folder.id))
    if (desired && (members.size !== desired.size || [...desired].some(id => !members.has(id))))
      throw new Error('favorite membership not yet confirmed')
    folders.value = next
    initial = members
    selected.value = [...members]
    desired = undefined
    needsVerification.value = false
    loaded.value = true
    return true
  }

  async function load() {
    if (!current() || loading.value || saving.value)
      return false
    loading.value = true
    error.value = ''
    try {
      if (!canFavoriteVideo(video))
        throw new Error('not an ordinary archive')
      aid ||= await deps.resolveAid(video.bvid!, controller.signal)
      if (!validId(aid))
        throw new Error('invalid aid')
      const previousWrite = submitted.get(`${owner.accountId}:${aid}`)
      if (previousWrite)
        await waitWithSignal(previousWrite, controller.signal)
      return await read()
    }
    catch {
      if (current())
        error.value = needsVerification.value ? 'verify' : 'read'
      return false
    }
    finally {
      if (current())
        loading.value = false
    }
  }

  function toggle(folder: VideoFavoriteFolder) {
    if (!current() || !editable.value || (!initial.has(folder.id) && !selected.value.includes(folder.id) && full(folder)))
      return
    selected.value = selected.value.includes(folder.id) ? selected.value.filter(id => id !== folder.id) : [...selected.value, folder.id]
  }

  async function save() {
    if (!current() || !editable.value || !aid)
      return false
    const target = new Set(selected.value)
    const added = folders.value.filter(folder => target.has(folder.id) && !initial.has(folder.id))
    const removed = folders.value.filter(folder => initial.has(folder.id) && !target.has(folder.id))
    if (added.some(full))
      return false
    if (!added.length && !removed.length)
      return true
    const key = `${owner.accountId}:${aid}`
    if (submitted.has(key))
      return false
    let release!: () => void
    const settled = new Promise<void>((resolve) => {
      release = resolve
    })
    submitted.set(key, settled)
    saving.value = true
    error.value = ''
    try {
      const response = await deps.write({ rid: aid, add_media_ids: added.map(folder => folder.id).join(','), del_media_ids: removed.map(folder => folder.id).join(','), csrf })
      if (response.code !== 0) {
        if (current())
          error.value = 'save'
        return false
      }
      // Close/unmount cannot undo an accepted write. Notify the original account
      // even when this editor has retired, but never update another account.
      if (sameAccount())
        await deps.changed().catch(() => undefined)
      if (!current())
        return false
      desired = target
      initial = new Set(target)
      needsVerification.value = true
      return await read()
    }
    catch {
      if (current()) {
        needsVerification.value = true
        desired = target
        error.value = 'verify'
      }
      return false
    }
    finally {
      if (submitted.get(key) === settled)
        submitted.delete(key)
      release()
      if (current())
        saving.value = false
    }
  }
  return { folders, selected, loading, saving, loaded, error, editable, needsVerification, full, load, save, toggle, close() {
    closed.value = true
    controller.abort()
    lifetime.dispose()
  } }
}
