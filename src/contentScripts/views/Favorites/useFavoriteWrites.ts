import { ref } from 'vue'

import type { FavoriteSource } from '~/models/video/favoriteSeason'
import type { createAccountLifetime } from '~/utils/accountLifetime'
import type api from '~/utils/api'
import type { FavoriteFolderForm } from '~/utils/favoriteFolderForm'

export type FavoriteWrite
  = | { kind: 'delete' | 'copy' | 'move', sourceId: number, targetId?: number, resourceKeys: readonly string[] }
    | { kind: 'folders', ids: readonly number[] }
    | { kind: 'seasons', sources: readonly FavoriteSource[] }
    | ({ kind: 'edit', folderId: number } & FavoriteFolderForm)
    | ({ kind: 'create' } & FavoriteFolderForm)
    | { kind: 'sort', ids: readonly number[] }
    | { kind: 'clean', folderId: number }
    | { kind: 'like', folderId: number, liked: boolean }
    | { kind: 'subscribe', folderId: number, mid: number, subscribed: boolean }

interface FavoriteWriteDependencies {
  api: typeof api.favorite
  capture: ReturnType<typeof createAccountLifetime>['capture']
  getCSRF: () => string
  onError: (error: unknown) => void
}

/** Serializes submitted intents, preserving their account, IDs and credentials across awaits. */
export function useFavoriteWrites(dependencies: FavoriteWriteDependencies) {
  const pending = ref(false)
  let operation = 0

  function prepare(command: FavoriteWrite) {
    const snapshot = command.kind === 'seasons'
      ? { ...command, sources: command.sources.map(({ id, type }) => ({ id, type })) }
      : command
    return { command: snapshot, owner: dependencies.capture(), csrf: dependencies.getCSRF() }
  }

  async function execute(transaction: ReturnType<typeof prepare>) {
    const { command, owner, csrf } = transaction
    if (!owner.isCurrent() || pending.value || !csrf)
      return null
    const version = ++operation
    pending.value = true
    try {
      if (command.kind === 'seasons') {
        const succeeded: FavoriteSource[] = []
        const failed: FavoriteSource[] = []
        for (const source of command.sources) {
          if (!owner.isCurrent())
            return null
          try {
            const response = source.type === 11
              ? await dependencies.api.unfavCollectedFavoriteFolder({ media_id: source.id, csrf })
              : source.type === 21 ? await dependencies.api.unfavFavoriteSeason({ season_id: source.id, csrf }) : undefined
            if (response?.code !== 0)
              throw response
            succeeded.push(source)
          }
          catch {
            failed.push(source)
          }
        }
        if (!owner.isCurrent())
          return null
        if (failed.length)
          dependencies.onError(new Error('partial-failure'))
        return { kind: 'seasons' as const, succeeded, failed }
      }
      let response
      if (command.kind === 'folders') {
        response = await dependencies.api.delFavoriteFolder({ media_ids: command.ids.join(','), csrf })
      }
      else if (command.kind === 'edit') {
        response = await dependencies.api.editFavoriteFolder({ media_id: command.folderId, title: command.title, intro: command.intro, cover: command.cover, privacy: command.privacy, csrf })
      }
      else if (command.kind === 'create') {
        response = await dependencies.api.createFavoriteFolder({ title: command.title, intro: command.intro, cover: command.cover, privacy: command.privacy, csrf })
      }
      else if (command.kind === 'sort') {
        response = await dependencies.api.sortFavoriteFolders({ sort: command.ids.join(','), csrf })
      }
      else if (command.kind === 'clean') {
        response = await dependencies.api.cleanFavoriteFolder({ media_id: command.folderId, csrf })
      }
      else if (command.kind === 'like') {
        // Native space uses the current space MID, including its collected folders.
        response = await dependencies.api.likeFavoriteFolder({ rid: command.folderId, up_mid: Number(owner.accountId), thumb_type: command.liked ? 2 : 1, csrf })
      }
      else if (command.kind === 'subscribe') {
        if (String(command.mid) === String(owner.accountId))
          throw new Error('cannot-subscribe-own-folder')
        response = await dependencies.api[command.subscribed ? 'unfavCollectedFavoriteFolder' : 'favCollectedFavoriteFolder']({ media_id: command.folderId, csrf })
      }
      else {
        const resources = command.resourceKeys.join(',')
        response = command.kind === 'delete'
          ? await dependencies.api.patchDelFavoriteResources({ media_id: command.sourceId, resources, csrf })
          : await dependencies.api[command.kind === 'move' ? 'moveFavoriteResources' : 'copyFavoriteResources']({
              src_media_id: command.sourceId,
              tar_media_id: command.targetId!,
              resources,
              mid: String(owner.accountId),
              csrf,
            })
      }
      if (!owner.isCurrent())
        return null
      if (response.code !== 0)
        throw response
      return { kind: command.kind, data: response.data, succeeded: command.kind === 'folders' ? [...command.ids] : [], failed: [] }
    }
    catch (error) {
      if (owner.isCurrent())
        dependencies.onError(error)
      return null
    }
    finally {
      if (version === operation)
        pending.value = false
    }
  }

  return {
    pending,
    prepare,
    execute,
    reset() {
      operation++
      pending.value = false
    },
  }
}
