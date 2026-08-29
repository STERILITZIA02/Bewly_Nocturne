import { getIframeMessageData, isIframeReadyForMessaging, markIframeReadyForMessaging, postMessageToIframe } from '~/utils/iframeMessage'

const SEARCH_HISTORY_LIMIT = 20
const SEARCH_HISTORY_RESPONSE_TIMEOUT_MS = 1200
const SEARCH_HISTORY_IFRAME_LOAD_TIMEOUT_MS = 1500

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
  value: string
}

class BilibiliStorageProvider {
  static BILIBILI_HISTORY_KEY = 'search_history:search_history'
  static BILIBILI_COLS_IFRAME_URL = 'https://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html'

  private iframe?: HTMLIFrameElement
  private iframeLoadPromise?: Promise<HTMLIFrameElement | undefined>

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
    if (this.iframe?.isConnected && this.iframe.dataset.bewlyColsReady === 'true')
      return this.iframe

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

  private async operate(type: 'COLS_GET'): Promise<BilibiliStorageEvent | undefined>
  private async operate(type: 'COLS_SET', value: string): Promise<void>
  private async operate(type: 'COLS_CLR'): Promise<void>
  private async operate(
    type: 'COLS_GET' | 'COLS_CLR' | 'COLS_SET',
    value?: string,
  ): Promise<BilibiliStorageEvent | undefined | void> {
    const iframe = await this.getIframe()
    if (!iframe)
      return undefined

    switch (type) {
      case 'COLS_GET':
        return new Promise<BilibiliStorageEvent | undefined>((resolve) => {
          let timer: number
          let handleMessage: (e: MessageEvent<BilibiliStorageEvent>) => void
          const cleanup = () => {
            window.clearTimeout(timer)
            window.removeEventListener('message', handleMessage)
          }
          handleMessage = (event: MessageEvent<BilibiliStorageEvent>) => {
            const data = getIframeMessageData(event, iframe)
            if (data?.type === 'COLS_RES'
              && data.key === BilibiliStorageProvider.BILIBILI_HISTORY_KEY
              && typeof data.value === 'string') {
              cleanup()
              resolve({
                type: 'COLS_RES',
                id: typeof data.id === 'string' ? data.id : undefined,
                key: data.key,
                value: data.value,
              })
            }
          }
          timer = window.setTimeout(() => {
            cleanup()
            resolve(undefined)
          }, SEARCH_HISTORY_RESPONSE_TIMEOUT_MS)

          window.addEventListener('message', handleMessage)
          if (!postMessageToIframe(iframe, {
            type: 'COLS_GET',
            key: BilibiliStorageProvider.BILIBILI_HISTORY_KEY,
          })) {
            cleanup()
            resolve(undefined)
          }
        })
      case 'COLS_CLR':
        postMessageToIframe(iframe, { type: 'COLS_CLR', key: 'search_history' })
        return
      case 'COLS_SET': {
        const sent = postMessageToIframe(iframe, {
          type: 'COLS_SET',
          key: BilibiliStorageProvider.BILIBILI_HISTORY_KEY,
          value,
        })
        if (!sent)
          throw new Error('Failed to send the search history write.')

        // COLS_SET 没有独立 ACK；同源 iframe 会按消息顺序处理，随后回读即为写入确认。
        const confirmation = await this.operate('COLS_GET')
        if (confirmation?.value !== value)
          throw new Error('Failed to confirm the search history write.')
      }
    }
  }

  getSearchHistory() {
    return this.operate('COLS_GET')
  }

  clearSearchHistory() {
    return this.operate('COLS_CLR')
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

  if (!e)
    return []

  try {
    const history = JSON.parse(e.value)
    return historySort(history)
  }
  catch {
    return []
  }
}

function enqueueSearchHistoryMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = searchHistoryMutationQueue.then(mutation, mutation)
  searchHistoryMutationQueue = result.then(() => undefined, () => undefined)
  return result
}

export async function getSearchHistory(): Promise<HistoryItem[]> {
  await searchHistoryMutationQueue
  return readSearchHistory()
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

    history = history.slice(0, SEARCH_HISTORY_LIMIT)
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

export function clearAllSearchHistory(): Promise<unknown> {
  return enqueueSearchHistoryMutation(() => provider.clearSearchHistory())
}
