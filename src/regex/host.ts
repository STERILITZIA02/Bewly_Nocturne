import type { RegexBatchReply, RegexBatchRequest } from '~/utils/regexBatch'

// An extension-origin frame gives its Worker a same-origin packaged URL.
// It avoids blob/eval CSP exceptions in content scripts and needs no new API permission.
window.addEventListener('message', function connect(event: MessageEvent) {
  if (event.source !== parent || !event.ports[0])
    return
  window.removeEventListener('message', connect)
  const port = event.ports[0]
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  let pending: number | undefined
  let executionTimer: ReturnType<typeof setTimeout> | undefined
  const fail = (error: string) => {
    clearTimeout(executionTimer)
    worker.terminate()
    if (pending !== undefined)
      port.postMessage({ id: pending, error })
  }
  worker.onerror = () => fail('Unable to run regular-expression filters')
  worker.onmessage = ({ data }: MessageEvent<RegexBatchReply | { ready: true }>) => {
    if ('ready' in data) {
      port.postMessage(data)
      return
    }
    clearTimeout(executionTimer)
    pending = undefined
    port.postMessage(data)
  }
  port.onmessage = ({ data }: MessageEvent<RegexBatchRequest>) => {
    if (pending !== undefined) {
      port.postMessage({ id: data?.id, error: 'Regular-expression batch is already running' })
      return
    }
    // This is the only untrusted boundary: the host is a web-accessible resource.
    if (!Number.isSafeInteger(data?.id) || !Array.isArray(data.groups) || data.groups.length > 2
      || data.groups.some(group => !Array.isArray(group.rules) || group.rules.length > 2000
        || group.rules.some(rule => typeof rule !== 'string' || rule.length > 512)
        || !Array.isArray(group.values) || group.values.length > 1000
        || group.values.some(fields => !Array.isArray(fields) || fields.length > 3
          || fields.some(value => typeof value !== 'string' || value.length > 8192)))) {
      port.postMessage({ id: data?.id, error: 'Invalid regular-expression filter batch' })
      return
    }
    pending = data.id
    // Enforced here because a web-accessible host cannot trust its caller's timer.
    executionTimer = setTimeout(fail, 250, 'Regular-expression filter exceeded its 250 ms execution budget')
    worker.postMessage(data)
  }
  window.addEventListener('pagehide', () => {
    clearTimeout(executionTimer)
    worker.terminate()
    port.close()
  }, { once: true })
})
