import { nextTick, onScopeDispose, shallowRef } from 'vue'

interface ConfirmRequest {
  id: number
  message: string
  resolve: (confirmed: boolean) => void
  cleanup: () => void
}

export function useConfirmDialogHost() {
  const activeRequest = shallowRef<ConfirmRequest>()
  const queue: ConfirmRequest[] = []
  let finishing: { request: ConfirmRequest, confirmed: boolean } | undefined
  let nextId = 0
  let disposed = false

  function settle(request: ConfirmRequest, confirmed: boolean) {
    request.cleanup()
    request.resolve(confirmed)
  }

  function finish(confirmed: boolean) {
    const request = activeRequest.value
    if (!request)
      return
    activeRequest.value = undefined
    const completion = { request, confirmed }
    finishing = completion
    // Callers may mutate large lists. Let Vue remove the static overlay first.
    void nextTick(() => {
      settle(request, completion.confirmed && !disposed)
      finishing = undefined
      if (!disposed)
        activeRequest.value = queue.shift()
    })
  }

  function cancel(id: number) {
    if (activeRequest.value?.id === id) {
      finish(false)
    }
    else if (finishing?.request.id === id) {
      finishing.confirmed = false
    }
    else {
      const index = queue.findIndex(request => request.id === id)
      if (index !== -1) {
        const [request] = queue.splice(index, 1)
        settle(request, false)
      }
    }
  }

  function confirm(message: string, signal?: AbortSignal): Promise<boolean> {
    if (disposed || signal?.aborted)
      return Promise.resolve(false)
    return new Promise((resolve) => {
      const id = ++nextId
      const abort = () => cancel(id)
      const request: ConfirmRequest = {
        id,
        message,
        resolve,
        cleanup: () => signal?.removeEventListener('abort', abort),
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (activeRequest.value || finishing)
        queue.push(request)
      else
        activeRequest.value = request
    })
  }

  function cancelAll() {
    for (const request of queue.splice(0))
      settle(request, false)
    if (finishing)
      finishing.confirmed = false
    finish(false)
  }

  onScopeDispose(() => {
    disposed = true
    cancelAll()
  })

  return { activeRequest, confirm, finish, cancelAll }
}
