/** Cancel this consumer's wait without aborting a task owned by another reader. */
export function waitWithSignal<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal)
    return task
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort)
    function abort() {
      cleanup()
      reject(signal!.reason ?? new DOMException('Request aborted', 'AbortError'))
    }
    task.then((value) => {
      cleanup()
      resolve(value)
    }, (error) => {
      cleanup()
      reject(error)
    })
    if (signal.aborted)
      abort()
    else
      signal.addEventListener('abort', abort, { once: true })
  })
}

export interface ReadRequestOptions {
  signal?: AbortSignal
  deadline?: number
}

export function waitForDelay(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    function finish(error?: unknown) {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (error)
        reject(error)
      else
        resolve()
    }
    function abort() {
      finish(signal?.reason ?? new DOMException('Request aborted', 'AbortError'))
    }
    timer = setTimeout(() => finish(), delay)
    if (signal?.aborted)
      abort()
    else
      signal?.addEventListener('abort', abort, { once: true })
  })
}

export const READ_REQUEST_TIMEOUT_MS = 20_000

/** One budget for waiting, fetch, body consumption and any permitted read retry. */
export async function withRequestDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  { signal: parent, deadline }: ReadRequestOptions = {},
  timeoutMs = READ_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort(parent?.reason)
  const remaining = Math.min(timeoutMs, Number.isFinite(deadline) ? deadline! - Date.now() : timeoutMs)
  const timeout = () => controller.abort(new DOMException('Request timed out', 'TimeoutError'))
  if (parent?.aborted)
    abort()
  else
    parent?.addEventListener('abort', abort, { once: true })
  if (remaining <= 0)
    timeout()
  const timer = setTimeout(timeout, Math.max(0, remaining))
  try {
    controller.signal.throwIfAborted()
    return await waitWithSignal(run(controller.signal), controller.signal)
  }
  finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abort)
  }
}
