import browser from 'webextension-polyfill'

import type { RegexBatch, RegexBatchReply } from './regexBatch'

/** One lazily created host per active filter; no worker for ordinary keywords. */
export function createRegexBatchRunner() {
  let frame: HTMLIFrameElement | undefined
  let port: MessagePort | undefined
  let ready: Promise<void> | undefined
  let rejectReady: ((error: Error) => void) | undefined
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  let pending: { id: number, resolve: (matches: boolean[][]) => void, reject: (error: Error) => void } | undefined
  let id = 0
  let generation = 0

  function dispose(error: Error = new DOMException('Filter disposed', 'AbortError')) {
    generation++
    clearTimeout(deadlineTimer)
    rejectReady?.(error)
    pending?.reject(error)
    rejectReady = undefined
    pending = undefined
    port?.close()
    frame?.remove()
    frame = undefined
    port = undefined
    ready = undefined
  }

  function start() {
    ready ??= new Promise<void>((resolve, reject) => {
      rejectReady = reject
      const channel = new MessageChannel()
      port = channel.port1
      const host = document.createElement('iframe')
      frame = host
      host.hidden = true
      host.src = browser.runtime.getURL('assets/regex-host.html')
      host.onload = () => {
        if (frame === host) {
          host.contentWindow!.postMessage(null, browser.runtime.getURL(''), [channel.port2])
          host.onload = null
        }
      }
      port.onmessage = ({ data }: MessageEvent<RegexBatchReply | { ready: true }>) => {
        if (frame !== host)
          return
        if ('ready' in data) {
          clearTimeout(deadlineTimer)
          rejectReady = undefined
          resolve()
          return
        }
        if (data.id !== pending?.id)
          return
        clearTimeout(deadlineTimer)
        if ('error' in data) {
          dispose(new Error(data.error))
          return
        }
        pending.resolve(data.matches)
        pending = undefined
      }
      deadlineTimer = setTimeout(() => dispose(new Error('Regular-expression worker did not start')), 5000)
      document.documentElement.append(host)
    })
    return ready
  }

  async function run(groups: RegexBatch[]) {
    if (pending)
      dispose()
    const current = ++generation
    await start()
    if (current !== generation)
      throw new DOMException('Filter replaced', 'AbortError')
    return new Promise<boolean[][]>((resolve, reject) => {
      pending = { id: ++id, resolve, reject }
      // Completion also has a deadline if the host disappears during an extension reload.
      deadlineTimer = setTimeout(() => dispose(new Error('Regular-expression host did not finish')), 1000)
      port!.postMessage({ id, groups })
    })
  }
  return { run, dispose }
}
