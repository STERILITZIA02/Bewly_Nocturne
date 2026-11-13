const SEARCH_HISTORY_LIMIT = 20
const SEARCH_HISTORY_KEY = 'search_history'
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

let searchHistoryMutationQueue: Promise<void> = Promise.resolve()

// The native top bar reads this page's localStorage, not the old COLS iframe.
function readSearchHistory(): HistoryItem[] {
  const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY)
  if (!raw)
    return []
  let history: unknown
  try {
    history = JSON.parse(raw)
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

function enqueueSearchHistoryMutation<T>(mutation: () => T): Promise<T> {
  // All our same-origin tabs cooperate over the native history store.
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
  return enqueueSearchHistoryMutation(() => {
    let history = readSearchHistory()

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
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history))
    return history
  })
}

export function removeSearchHistory(value: string): Promise<HistoryItem[]> {
  return enqueueSearchHistoryMutation(() => {
    const history = readSearchHistory().filter(item => item.value !== value)
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history))
    return history
  })
}

export function clearAllSearchHistory(): Promise<HistoryItem[]> {
  return enqueueSearchHistoryMutation(() => {
    window.localStorage.removeItem(SEARCH_HISTORY_KEY)
    return []
  })
}
