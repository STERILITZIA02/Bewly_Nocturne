import { computed, onScopeDispose, reactive, ref, watch } from 'vue'

import type { Info } from '~/models/video/favorite'
import type api from '~/utils/api'
import type { FavoriteFolderForm } from '~/utils/favoriteFolderForm'
import { FAVORITE_FOLDER_INTRO_LIMIT, FAVORITE_FOLDER_TITLE_LIMIT, isFavoriteCover, moveFavoriteFolderToTop } from '~/utils/favoriteFolderForm'

import { applyFavoriteFolderInteraction } from './favoriteFolderSocial'
import type { useFavoritesData } from './useFavoritesData'
import type { useFavoriteWrites } from './useFavoriteWrites'

interface Dependencies {
  api: typeof api.favorite
  data: ReturnType<typeof useFavoritesData>
  writes: ReturnType<typeof useFavoriteWrites>
  getCSRF: () => string
  notify: () => void
  error: (key: string) => void
  confirm: (key: string) => Promise<boolean>
}

/** Folder metadata/editor lifecycle is independent of the video grid and pagination. */
export function useFavoriteFolderManager({ api, data, writes, getCSRF, notify, error, confirm }: Dependencies) {
  const editor = reactive({ visible: false, id: 0, loading: false, failed: false })
  const form = ref<FavoriteFolderForm>({ title: '', intro: '', cover: '', privacy: 0 })
  const busy = ref(false)
  const pending = computed(() => busy.value || writes.pending.value)
  const info = ref<Info>()
  const infoFailed = ref(false)
  const infoLoading = ref(false)
  let editorVersion = 0
  let operationVersion = 0
  let infoController: AbortController | undefined
  let editorController: AbortController | undefined
  const currentFolderId = computed(() => data.favoriteView.value === 'video' && data.searchScope.value === 'current'
    ? data.selectedCategory.value?.id
    : data.favoriteView.value === 'season' && data.selectedSeason.value?.type === 11 ? data.selectedSeason.value.id : undefined)

  async function readInfo(id: number, signal?: AbortSignal): Promise<Info> {
    const response = await api.getFavoriteFolderInfo({ media_id: id }, { signal })
    if (response?.code !== 0 || response.data?.id !== id || !response.data?.upper)
      throw new Error('favorite-folder-info-unavailable')
    return response.data
  }

  async function refreshInfo() {
    infoController?.abort()
    const id = currentFolderId.value
    if (info.value?.id !== id)
      info.value = undefined
    infoFailed.value = false
    infoLoading.value = false
    if (!id)
      return
    const owner = data.capture()
    const controller = infoController = new AbortController()
    infoLoading.value = true
    const current = () => owner.isCurrent() && infoController === controller && !controller.signal.aborted && currentFolderId.value === id
    try {
      const result = await readInfo(id, controller.signal)
      if (current())
        info.value = result
    }
    catch {
      if (current())
        infoFailed.value = true
    }
    finally {
      if (current())
        infoLoading.value = false
    }
  }
  watch(currentFolderId, () => void refreshInfo(), { immediate: true, flush: 'sync' })

  async function openEditor(id = 0) {
    if (pending.value || !data.capture().isCurrent())
      return
    editorController?.abort()
    const version = ++editorVersion
    const owner = data.capture()
    Object.assign(editor, { visible: true, id, loading: Boolean(id), failed: false })
    form.value = { title: '', intro: '', cover: '', privacy: 0 }
    if (!id)
      return
    const controller = editorController = new AbortController()
    try {
      const result = await readInfo(id, controller.signal)
      if (!owner.isCurrent() || version !== editorVersion)
        return
      if (String(result.mid || result.upper.mid) !== String(owner.accountId))
        throw new Error('not-folder-owner')
      form.value = { title: result.title, intro: result.intro || '', cover: result.cover || '', privacy: result.attr & 1 }
    }
    catch {
      if (owner.isCurrent() && version === editorVersion)
        editor.failed = true
    }
    finally {
      if (owner.isCurrent() && version === editorVersion)
        editor.loading = false
    }
  }

  function closeEditor() {
    if (pending.value)
      return
    editorVersion++
    editorController?.abort()
    editor.visible = false
  }

  async function save(value: FavoriteFolderForm, file?: File) {
    const owner = data.capture()
    if (pending.value || editor.loading || editor.failed || !owner.isCurrent())
      return
    const draft = { ...value, title: value.title.trim() }
    if (!draft.title || draft.title.length > FAVORITE_FOLDER_TITLE_LIMIT || draft.intro.length > FAVORITE_FOLDER_INTRO_LIMIT) {
      error('favorites.edit_folder_title_empty')
      return
    }
    if (file && !isFavoriteCover(file)) {
      error('favorites.cover_invalid')
      return
    }
    const id = editor.id
    const version = ++operationVersion
    const csrf = getCSRF()
    busy.value = true
    const current = () => owner.isCurrent() && version === operationVersion
    try {
      if (file) {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
        if (!current())
          return
        const response = await api.uploadFavoriteCover({ bytes, mimeType: file.type, fileName: file.name, csrf })
        if (!current())
          return
        if (response?.code !== 0 || typeof response.data?.location !== 'string' || !/^https?:\/\//.test(response.data.location))
          throw new Error('favorite-cover-upload-failed')
        draft.cover = response.data.location
      }
      if (!current())
        return
      const transaction = writes.prepare(id ? { kind: 'edit', folderId: id, ...draft } : { kind: 'create', ...draft })
      const result = await writes.execute(transaction)
      if (!result || !current())
        return
      // The write succeeded: close before refreshing, so a read failure cannot invite duplicate creation.
      editor.visible = false
      await data.getFavoriteCategories()
      if (!current())
        return
      if (data.categoryState.failed)
        error('favorites.saved_refresh_failed')
      const savedId = id || ('data' in result ? Number(result.data?.id) : 0)
      if (savedId) {
        data.setFolderCover(savedId, draft.cover)
        if (id) {
          data.applyFolderEdit(id, draft.title, draft.privacy === 0)
        }
        else {
          const created = data.favoriteCategories.find(folder => folder.id === savedId)
          if (created && data.favoriteView.value === 'video') {
            data.selectedCategory.value = created
            data.searchScope.value = 'current'
            data.keyword.value = ''
            void data.loadSelectedContent()
          }
        }
      }
      void refreshInfo()
      notify()
    }
    catch {
      if (current())
        error('common.operation_failed')
    }
    finally {
      if (version === operationVersion)
        busy.value = false
    }
  }

  async function pin(id: number) {
    if (pending.value)
      return
    const owner = data.capture()
    const version = ++operationVersion
    busy.value = true
    try {
      // Sort the authoritative complete list; do not overwrite folders created in another tab.
      await data.getFavoriteCategories()
      if (!owner.isCurrent() || version !== operationVersion || data.categoryState.failed)
        return
      const ids = data.favoriteCategories.map(folder => folder.id)
      const sorted = moveFavoriteFolderToTop(ids, id)
      if (sorted.every((value, index) => value === ids[index]))
        return
      const result = await writes.execute(writes.prepare({ kind: 'sort', ids: sorted }))
      if (result && owner.isCurrent() && version === operationVersion) {
        await data.getFavoriteCategories()
        if (owner.isCurrent() && (data.categoryState.failed || data.favoriteCategories[1]?.id !== id))
          error('favorites.saved_refresh_failed')
        notify()
      }
    }
    finally {
      if (version === operationVersion)
        busy.value = false
    }
  }

  async function clean(id: number) {
    if (pending.value)
      return
    const transaction = writes.prepare({ kind: 'clean', folderId: id })
    const version = ++operationVersion
    busy.value = true
    try {
      if (!await confirm('favorites.clean_invalid_confirm'))
        return
      const result = await writes.execute(transaction)
      if (!result || !transaction.owner.isCurrent())
        return
      await data.getFavoriteCategories()
      if (!transaction.owner.isCurrent())
        return
      if (currentFolderId.value === id)
        void data.loadSelectedContent()
      void refreshInfo()
      notify()
    }
    finally {
      if (version === operationVersion)
        busy.value = false
    }
  }

  async function interact(kind: 'like' | 'subscribe') {
    const folder = info.value
    if (!folder || folder.id !== currentFolderId.value || pending.value)
      return
    const mid = folder.mid || folder.upper.mid
    const transaction = writes.prepare(kind === 'like'
      ? { kind, folderId: folder.id, liked: folder.like_state === 1 }
      : { kind, folderId: folder.id, mid, subscribed: folder.fav_state === 1 })
    if (kind === 'subscribe' && String(mid) === String(transaction.owner.accountId))
      return
    const version = ++operationVersion
    busy.value = true
    try {
      const result = await writes.execute(transaction)
      if (!result || result.kind !== kind || !transaction.owner.isCurrent() || version !== operationVersion)
        return
      const updated = applyFavoriteFolderInteraction(folder, kind, result.data)
      if (currentFolderId.value === folder.id) {
        // A metadata read begun before this write must not restore the old toggle/count.
        infoController?.abort()
        infoLoading.value = false
        infoFailed.value = false
        info.value = updated
      }
      if (kind === 'subscribe') {
        if (updated.fav_state === 0)
          data.removeSeasons([{ id: folder.id, type: 11 }])
        notify()
      }
    }
    finally {
      if (version === operationVersion)
        busy.value = false
    }
  }

  function reset() {
    operationVersion++
    editorVersion++
    infoController?.abort()
    editorController?.abort()
    editor.visible = false
    busy.value = false
    info.value = undefined
    infoFailed.value = false
    infoLoading.value = false
  }
  onScopeDispose(reset)
  return { editor, form, pending, info, infoFailed, infoLoading, currentFolderId, openEditor, closeEditor, save, pin, clean, interact, refreshInfo, reset }
}
