import { ref } from 'vue'

import type { createAccountLifetime } from '~/utils/accountLifetime'

type Owner = ReturnType<ReturnType<typeof createAccountLifetime>['capture']>
export type WatchLaterBulkAction = 'clear' | 'viewed'

/** One confirmed bulk intent, bound to the account that opened the confirmation. */
export function useWatchLaterBulkAction(dependencies: {
  capture: () => Owner
  getCSRF: () => string
  blocked: () => boolean
  confirm: (kind: WatchLaterBulkAction) => Promise<boolean>
  submit: (kind: WatchLaterBulkAction, owner: Owner, csrf: string) => Promise<void>
  onError: (error: unknown) => void
}) {
  const pending = ref(false)
  let generation = 0
  async function run(kind: WatchLaterBulkAction) {
    const owner = dependencies.capture()
    if (pending.value || dependencies.blocked() || !owner.isCurrent())
      return
    const csrf = dependencies.getCSRF()
    const version = ++generation
    pending.value = true
    try {
      if (!await dependencies.confirm(kind) || !owner.isCurrent() || version !== generation)
        return
      await dependencies.submit(kind, owner, csrf)
    }
    catch (error) {
      if (owner.isCurrent() && version === generation)
        dependencies.onError(error)
    }
    finally {
      if (version === generation)
        pending.value = false
    }
  }
  return {
    pending,
    run,
    reset() {
      generation++
      pending.value = false
    },
  }
}
