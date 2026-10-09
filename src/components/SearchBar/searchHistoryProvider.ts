import { getIframeMessageData, isIframeReadyForMessaging, markIframeReadyForMessaging, postMessageToIframe } from '~/utils/iframeMessage'

const SEARCH_HISTORY_LIMIT = 20
const SEARCH_HISTORY_RESPONSE_TIMEOUT_MS = 1200
const SEARCH_HISTORY_IFRAME_LOAD_TIMEOUT_MS = 1500
const SEARCH_HISTORY_LOCK_WAIT_MS = 5000

export interface HistoryItem {
  value: string
  timestamp: number
}
export interface SuggestionItem {
  value: string
  term: string
  name: string
  type: string
  ref: number
  spid: number
  timestamp: number
}
export interface SuggestionResponse {
  code: number
  exp_str: string
  result: {
    tag: SuggestionItem[]
  }
  stoken: string
}

function historySort(historyItems: HistoryItem[]) {
  historyItems.sort((a, b) => b.timestamp - a.timestamp)
  return historyItems
}

export interface BilibiliStorageEvent {
  type: 'COLS_RES'
  id?: string
  key: string
  value: string | null
}

class BilibiliStorageProvider {
  static BILIBILI_HISTORY_KEY = 'search_history:search_history'
  static BILIBILI_COLS_IFRAME_URL = 'https://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html'

  private iframe?: HTMLIFrameElement
  private iframeLoadPromise?: Promise<HTMLIFrameElement | undefined>
  private requestId = 0

  private async waitForBody() {
    if (document.body)
      return

    await new Promise<void>((resolve) => {
      window.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    })
  }

  private async createIframe(): Promise<HTMLIFrameElement | undefined> {
    await this.waitForBody()

    document.querySelectorAll<HTMLIFrameElement>('iframe[data-bewly-cols-storage="true"]')
      .forEach(staleIframe => staleIframe.remove())

    const iframe = document.createElement('iframe')
    iframe.dataset.bewlyColsStorage = 'true'
    iframe.tabIndex = -1
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.visibility = 'hidden'
    iframe.style.pointerEvents = 'none'

    const loadedPromise = new Promise<boolean>((resolve) => {
      let settled = false
      let timer = 0
      let handleLoad: () => void
      let handleError: () => void
      const finish = (value: boolean) => {
        if (settled)
          return
        settled = true
        window.clearTimeout(timer)
        iframe.removeEventListener('load', handleLoad)
        iframe.removeEventListener('error', handleError)
        resolve(value)
      }
      handleLoad = () => {
        markIframeReadyForMessaging(iframe)
        if (isIframeReadyForMessaging(iframe))
          finish(true)
      }
      handleError = () => finish(false)
      timer = window.setTimeout(() => finish(false), SEARCH_HISTORY_IFRAME_LOAD_TIMEOUT_MS)
      iframe.addEventListener('load', handleLoad)
      iframe.addEventListener('error', handleError)
    })

    iframe.src = BilibiliStorageProvider.BILIBILI_COLS_IFRAME_URL
    document.body.appendChild(iframe)
    const loaded = await loadedPromise

    if (!loaded) {
      iframe.remove()
      return undefined
    }

    iframe.dataset.bewlyColsReady = 'true'
    return iframe
  }

  private async getIframe() {
    if (this.iframe?.isConnected && this.iframe.dataset.bewlyColsReady === 'true'
      && this.iframe.getAttribute('src') === BilibiliStorageProvider.BILIBILI_COLS_IFRAME_URL) {
      return this.iframe
    }

    if (!this.iframeLoadPromise)
      this.iframeLoadPromise = this.createIframe()

    const pending = this.iframeLoadPromise
    try {
      this.iframe = await pending
      return this.iframe
    }
    finally {
      if (this.iframeLoadPromise === pending)
        this.iframeLoadPromise = undefined
    }
  }

  private async operate(type: 'COLS_GET'): Promise<BilibiliStorageEvent>
  private async operate(type: 'COLS_SET', value: string): Promise<void>
  private async operate(type: 'COLS_RM'): Promise<void>
  private async operate(
    type: 'COLS_GET' | 'COLS_RM' | 'COLS_SET',
    value?: string,
  ): Promise<BilibiliStorageEvent | void> {
    const iframe = await this.getIframe()
    if (!iframe)
      throw new Error('Search history storage is unavailable')
    const id = String(++this.requestId)
    const key = BilibiliStorageProvider.BILIBILI_HISTORY_KEY

    switch (type) {
      case 'COLS_GET':
        return new Promise<BilibiliStorageEvent>((resolve, reject) => {
          let timer: number
          let handleMessage: (e: MessageEvent<BilibiliStorageEvent>) => void
          const cleanup = () => {
            window.clearTimeout(timer)
            window.removeEventListener('message', handleMessage)
          }
          handleMessage = (event: MessageEvent<BilibiliStorageEvent>) => {
            if (iframe.getAttribute('src') !== BilibiliStorageProvider.BILIBILI_COLS_IFRAME_URL) {
              cleanup()
              reject(new Error('Search history storage frame changed'))
              return
            }
            const data = getIframeMessageData(event, iframe)
            if (data?.type === 'COLS_RES'
              && data.id === id && data.key === key) {
              cleanup()
              // The native iframe returns null only for a missing key; a
              // storage exception instead returns undefined. Never conflate it.
              if (data.value === null || typeof data.value === 'string')
                resolve({ type: 'COLS_RES', id, key, value: data.value })
              else reject(new Error('Search history storage read failed'))
            }
          }
          timer = window.setTimeout(() => {
            cleanup()
            reject(new Error('Search history storage read timed out'))
          }, SEARCH_HISTORY_RESPONSE_TIMEOUT_MS)

          window.addEventListener('message', handleMessage)
          if (!postMessageToIframe(iframe, {
            type: 'COLS_GET',
            key,
            id,
          })) {
            cleanup()
            reject(new Error('Failed to request search history'))
          }
        })
      case 'COLS_RM':
      case 'COLS_SET': {
        const sent = postMessageToIframe(iframe, {
          type,
          key,
          id,
          value,
        })
        if (!sent)
          throw new Error('Failed to send the search history write.')

        // Native write ACKs also occur on storage exceptions, so confirm the
        // actual value with a separately correlated read before reporting success.
        const confirmation = await this.operate('COLS_GET')
        if (confirmation.value !== (type === 'COLS_RM' ? null : value))
          throw new Error('Failed to confirm the search history write.')
      }
    }
  }

  getSearchHistory() {
    return this.operate('COLS_GET')
  }

  clearSearchHistory() {
    return this.operate('COLS_RM')
  }

  addSearchHistory(value: string) {
    return this.operate('COLS_SET', value)
  }

  removeSearchHistory(value: string) {
    return this.operate('COLS_SET', value)
  }
}

const provider = new BilibiliStorageProvider()
let searchHistoryMutationQueue: Promise<void> = Promise.resolve()

async function readSearchHistory(): Promise<HistoryItem[]> {
  const e = await provider.getSearchHistory()
  if (e.value === null)
    return []
  let history: unknown
  try {
    history = JSON.parse(e.value)
  }
  catch {
    throw new Error('Invalid search history data')
  }
  if (!Array.isArray(history) || history.some(item => !item || typeof item.value !== 'string' || typeof item.timestamp !== 'number' || !Number.isFinite(item.timestamp)))
    throw new Error('Invalid search history data')
  const seen = new Set<string>()
  return historySort(history).filter((item) => {
    if (seen.has(item.value))
      return false
    seen.add(item.value)
    return true
  })
}

function enqueueSearchHistoryMutation<T>(mutation: () => Promise<T>): Promise<T> {
  // All our same-origin tabs cooperate without creating another history store.
  // Native clients on other origins still retain their own storage contract.
  const run = async () => {
    if (!globalThis.navigator?.locks)
      return mutation()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('Search history lock timed out', 'TimeoutError')), SEARCH_HISTORY_LOCK_WAIT_MS)
    try {
      return await navigator.locks.request('bewly:search-history', { signal: controller.signal }, () => {
        clearTimeout(timer)
        return mutation()
      })
    }
    finally { clearTimeout(timer) }
  }
  const result = searchHistoryMutationQueue.then(run, run)
  searchHistoryMutationQueue = result.then(() => undefined, () => undefined)
  return result
}

export async function getSearchHistory(): Promise<HistoryItem[]> {
  return enqueueSearchHistoryMutation(readSearchHistory)
}

export function addSearchHistory(historyItem: HistoryItem): Promise<HistoryItem[]> {
  return enqueueSearchHistoryMutation(async () => {
    let history = await readSearchHistory()

    let hasSameValue = false
    history.forEach((item) => {
      if (item.value === historyItem.value) {
        item.timestamp = historyItem.timestamp
        hasSameValue = true
      }
    })
    if (!hasSameValue)
      history.unshift(historyItem)

    history = historySort(history).slice(0, SEARCH_HISTORY_LIMIT)
    await provider.addSearchHistory(JSON.stringify(history))
    return history
  })
}

export function removeSearchHistory(value: string): Promise<HistoryItem[]> {
  return enqueueSearchHistoryMutation(async () => {
    const history = (await readSearchHistory()).filter(item => item.value !== value)
    await provider.removeSearchHistory(JSON.stringify(history))
    return history
  })
}

export function clearAllSearchHistory(): Promise<HistoryItem[]> {
  return enqueueSearchHistoryMutation(async () => {
    await provider.clearSearchHistory()
    return []
  })
}
