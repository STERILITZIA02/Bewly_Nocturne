import type { InjectionKey } from 'vue'
import { inject, onActivated, onDeactivated, onScopeDispose } from 'vue'

export interface ConfirmDialogService {
  confirm: (message: string, signal?: AbortSignal) => Promise<boolean>
}

export const confirmDialogKey: InjectionKey<ConfirmDialogService> = Symbol('CONFIRM_DIALOG')

export function useConfirmDialog(): ConfirmDialogService {
  const service = inject(confirmDialogKey)

  if (!service)
    throw new Error('ConfirmDialog service is not provided')

  let owner = new AbortController()
  onDeactivated(() => owner.abort())
  onActivated(() => {
    if (owner.signal.aborted)
      owner = new AbortController()
  })
  onScopeDispose(() => owner.abort())
  return { confirm: async (message) => {
    const { signal } = owner
    return await service.confirm(message, signal) && !signal.aborted
  } }
}
