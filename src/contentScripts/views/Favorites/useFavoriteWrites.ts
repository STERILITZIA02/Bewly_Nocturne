import { ref } from 'vue'

import type { createAccountLifetime } from '~/utils/accountLifetime'
import type api from '~/utils/api'

export type FavoriteWrite
  = | { kind: 'delete' | 'copy' | 'move', sourceId: number, targetId?: number, resourceKeys: readonly string[] }
    | { kind: 'folders', ids: readonly number[] }
    | { kind: 'seasons', ids: readonly number[] }
    | { kind: 'edit', folderId: number, title: string, privacy: number }

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
    return { command, owner: dependencies.capture(), csrf: dependencies.getCSRF() }
  }

  async function execute(transaction: ReturnType<typeof prepare>) {
    const { command, owner, csrf } = transaction
    if (!owner.isCurrent() || pending.value)
      return null
    const version = ++operation
    pending.value = true
    const succeeded: number[] = []
    const failed: number[] = []
    try {
      if (command.kind === 'seasons') {
        for (const id of command.ids) {
          if (!owner.isCurrent())
            return null
          try {
            const response = await dependencies.api.unfavFavoriteSeason({ season_id: id, csrf })
            if (response.code !== 0)
              throw response
            succeeded.push(id)
          }
          catch {
            failed.push(id)
          }
        }
        if (!owner.isCurrent())
          return null
        if (failed.length)
          dependencies.onError(new Error('partial-failure'))
        return { command, succeeded, failed }
      }
      let response
      if (command.kind === 'folders') {
        response = await dependencies.api.delFavoriteFolder({ media_ids: command.ids.join(','), csrf })
      }
      else if (command.kind === 'edit') {
        response = await dependencies.api.editFavoriteFolder({ media_id: command.folderId, title: command.title, privacy: command.privacy, csrf })
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
      return { command, succeeded: command.kind === 'folders' ? [...command.ids] : [], failed }
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
