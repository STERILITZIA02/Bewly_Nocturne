import type { Ref } from 'vue'
import { computed, onScopeDispose, shallowReactive, watch } from 'vue'

import type { DisplayPrivateMessage } from './privateMessage'
import { comparePrivateMessageSeqno, transformPrivateMessages } from './privateMessage'
import { extractMessages } from './privateMessageResponse'
import { privateMessageSearchText } from './privateMessageSearch'
import { PRIVATE_HISTORY_BATCH_PAUSE_MS, PRIVATE_HISTORY_VISIBLE_BATCH_SIZE, PRIVATE_SEARCH_REQUEST_INTERVAL_MS } from './privateSearchPolicy'
import type { DisplayPrivateSession, PrivateSessionTypeFilter } from './privateSession'
import { matchesPrivateSessionType } from './privateSession'
import { isUsablePrivateMessageHistoryFloor } from './usePrivateMessages'
import type { PrivateSessionsController } from './usePrivateSessions'

export interface PrivateHistoryMatch {
  key: string
  session: DisplayPrivateSession
  message: DisplayPrivateMessage
  snippet: string
}

interface HistoryCursor { session: DisplayPrivateSession, endSeqno?: string, done: boolean }
type HistoryScan
  = | { phase: 'idle' | 'debouncing' | 'scanning' | 'waiting' | 'paused' | 'complete' | 'limited' }
    | { phase: 'failed', cursor: HistoryCursor | null }
type HistoryContext
  = | { phase: 'idle' | 'loading' | 'error' }
    | { phase: 'ready', value: { key: string, talkerId: string, items: DisplayPrivateMessage[] } }
interface SearchDependencies {
  active?: () => boolean
  sessions: PrivateSessionsController
  fetchMessages: (options: { talkerId: string, endSeqno?: string, size?: number }) => Promise<unknown>
}

const BATCH_REQUESTS = 20
const RESULT_LIMIT = 2000
// Match the currently published native client's verified history page size.
const PAGE_SIZE = 20
const CONTEXT_SIZE = PAGE_SIZE

function compareMatches(left: PrivateHistoryMatch, right: PrivateHistoryMatch) {
  return right.message.timestamp - left.message.timestamp || left.key.localeCompare(right.key)
}

function mergeMatches(current: PrivateHistoryMatch[], incoming: PrivateHistoryMatch[]) {
  incoming.sort(compareMatches)
  const merged: PrivateHistoryMatch[] = []
  let left = 0
  let right = 0
  while (left < current.length && right < incoming.length)
    merged.push(compareMatches(current[left], incoming[right]) <= 0 ? current[left++] : incoming[right++])
  return merged.concat(current.slice(left), incoming.slice(right))
}

/** Explicit, resumable reads across the server's history; never writes ACKs or the conversation cache. */
export function usePrivateHistorySearch(mid: Ref<string>, dependencies: SearchDependencies) {
  const state = shallowReactive({
    query: '',
    typeFilter: 'all' as PrivateSessionTypeFilter,
    results: [] as PrivateHistoryMatch[],
    selectedKey: '',
    selectionVersion: 0,
    scan: { phase: 'idle' } as HistoryScan,
    get loading() { return this.scan.phase === 'scanning' },
    get running() { return ['debouncing', 'scanning', 'waiting'].includes(this.scan.phase) },
    get complete() { return this.scan.phase === 'complete' },
    get error() { return this.scan.phase === 'failed' },
    get canSkip() { return this.scan.phase === 'failed' && this.scan.cursor !== null },
    get limited() { return this.scan.phase === 'limited' },
    scannedMessages: 0,
    skippedSessions: 0,
    batch: 1,
    visibleResultCount: PRIVATE_HISTORY_VISIBLE_BATCH_SIZE,
    contextState: { phase: 'idle' } as HistoryContext,
    get loadingContext() { return this.contextState.phase === 'loading' },
    get contextError() { return this.contextState.phase === 'error' },
    get context() { return this.contextState.phase === 'ready' ? this.contextState.value : null },
  })
  const selected = computed(() => state.results.find(result => result.key === state.selectedKey) ?? null)
  const filteredResults = computed(() => state.results.filter(result => matchesPrivateSessionType(result.session.kind, state.typeFilter)))
  const selectedIndex = computed(() => filteredResults.value.findIndex(result => result.key === state.selectedKey))
  const cursors = new Map<string, HistoryCursor>()
  const seen = new Set<string>()
  let position = 0
  let generation = 0
  let contextGeneration = 0
  let pending: Promise<void> | null = null
  let contextPending: Promise<void> | null = null
  let continuationTimer: ReturnType<typeof setTimeout> | undefined
  let pacingTimer: ReturnType<typeof setTimeout> | undefined
  let finishPacing: (() => void) | undefined
  let disposed = false

  function stop() {
    generation++
    clearTimeout(continuationTimer)
    clearTimeout(pacingTimer)
    finishPacing?.()
    finishPacing = undefined
    if (state.running)
      state.scan = { phase: state.query ? 'paused' : 'idle' }
  }
  function pace() {
    return new Promise<void>((resolve) => {
      finishPacing = resolve
      pacingTimer = setTimeout(() => {
        finishPacing = undefined
        resolve()
      }, PRIVATE_SEARCH_REQUEST_INTERVAL_MS)
    })
  }
  function reset() {
    stop()
    contextGeneration++
    state.batch = 1
    state.visibleResultCount = PRIVATE_HISTORY_VISIBLE_BATCH_SIZE
    state.selectionVersion = 0
    Object.assign(state, { query: '', results: [], selectedKey: '', scan: { phase: 'idle' }, scannedMessages: 0, skippedSessions: 0, contextState: { phase: 'idle' } })
    cursors.clear()
    seen.clear()
    position = 0
  }
  function collectSessions() {
    for (const session of dependencies.sessions.state.items) {
      if (cursors.has(session.key))
        continue
      const readable = session.sessionType === 1 && session.capabilities.canReadNative
      cursors.set(session.key, { session, done: !readable })
      if (!readable)
        state.skippedSessions++
    }
  }
  async function run() {
    if (disposed || document.hidden || dependencies.active?.() === false || !mid.value || !state.query || state.complete || state.limited || state.loading)
      return
    document.addEventListener('visibilitychange', onVisibility)
    const epoch = generation
    const account = mid.value
    const current = () => !disposed && generation === epoch && mid.value === account && !document.hidden && dependencies.active?.() !== false
    state.scan = { phase: 'scanning' }
    clearTimeout(continuationTimer)
    if (pending)
      await pending
    if (!current())
      return
    const task = (async () => {
      const query = state.query.normalize('NFKC').toLocaleLowerCase()
      let failedCursor: HistoryCursor | null = null
      try {
        if (!dependencies.sessions.state.loaded)
          await dependencies.sessions.loadInitial()
        if (!current())
          return
        if (!dependencies.sessions.state.loaded)
          throw new Error('sessions-unavailable')
        for (let reads = 0; reads < BATCH_REQUESTS && current(); reads++) {
          collectSessions()
          let entries = [...cursors.values()]
          // Discover later conversations before another history round, so a
          // single long chat cannot monopolize every search batch.
          if (position >= entries.length && !dependencies.sessions.state.noMore) {
            const count = dependencies.sessions.state.items.length
            await dependencies.sessions.loadMore({ retry: true })
            if (!current())
              return
            if (dependencies.sessions.state.items.length === count && !dependencies.sessions.state.noMore)
              throw new Error('session-pagination-stalled')
            collectSessions()
            entries = [...cursors.values()]
          }
          if (position >= entries.length)
            position = 0
          let cursor: HistoryCursor | undefined
          for (let offset = 0; offset < entries.length; offset++) {
            const index = (position + offset) % entries.length
            if (!entries[index].done) {
              cursor = entries[index]
              position = index
              break
            }
          }
          if (!cursor) {
            if (dependencies.sessions.state.noMore) {
              state.scan = { phase: 'complete' }
              break
            }
            position = entries.length
            continue
          }
          failedCursor = cursor
          const data = extractMessages(await dependencies.fetchMessages({ talkerId: cursor.session.talkerId, endSeqno: cursor.endSeqno, size: PAGE_SIZE }))
          if (!current())
            return
          if (!data)
            throw new Error('history-unavailable')
          const messages = transformPrivateMessages(data.messages, data.e_infos, account)
          const oldest = messages[0]?.seqno
          const hasMore = Boolean(data.has_more) && !(oldest && isUsablePrivateMessageHistoryFloor(data.min_seqno) && comparePrivateMessageSeqno(oldest, data.min_seqno) <= 0)
          if (hasMore && (!oldest || (cursor.endSeqno && comparePrivateMessageSeqno(oldest, cursor.endSeqno) >= 0)))
            throw new Error('history-pagination-stalled')
          const matches: PrivateHistoryMatch[] = []
          for (const message of messages) {
            const key = `${cursor.session.key}:${message.msgKey}`
            const text = privateMessageSearchText(message.content).normalize('NFKC')
            const index = text.toLocaleLowerCase().indexOf(query)
            if (index >= 0 && !seen.has(key)) {
              seen.add(key)
              matches.push({ key, session: cursor.session, message, snippet: text.slice(Math.max(0, index - 32), index + query.length + 128) })
            }
          }
          state.scannedMessages += messages.length
          if (matches.length)
            state.results = mergeMatches(state.results, matches)
          cursor.endSeqno = oldest
          cursor.done = !hasMore
          failedCursor = null
          position++
          if (state.results.length >= RESULT_LIMIT) {
            state.scan = { phase: 'limited' }
            break
          }
          if (reads + 1 < BATCH_REQUESTS)
            await pace()
        }
        if (current() && dependencies.sessions.state.noMore && [...cursors.values()].every(cursor => cursor.done)) {
          state.scan = { phase: 'complete' }
        }
      }
      catch {
        if (current()) {
          state.scan = { phase: 'failed', cursor: failedCursor }
        }
      }
      finally {
        if (generation === epoch && mid.value === account) {
          if (state.scan.phase === 'scanning')
            state.scan = { phase: current() ? 'waiting' : 'paused' }
          if (state.running)
            continuationTimer = setTimeout(() => void run(), PRIVATE_HISTORY_BATCH_PAUSE_MS)
        }
      }
    })()
    pending = task
    await task
    if (pending === task)
      pending = null
  }
  function search(query: string, delay = 0) {
    reset()
    state.query = query.normalize('NFKC').trim()
    if (delay > 0 && state.query) {
      state.scan = { phase: 'debouncing' }
      continuationTimer = setTimeout(() => void run(), delay)
      return Promise.resolve()
    }
    return run()
  }
  function suspend() {
    stop()
    contextGeneration++
    if (state.loadingContext)
      state.contextState = { phase: 'idle' }
    document.removeEventListener('visibilitychange', onVisibility)
  }
  function skipFailed() {
    if (state.scan.phase !== 'failed' || !state.scan.cursor)
      return Promise.resolve()
    state.scan.cursor.done = true
    state.skippedSessions++
    position++
    return run()
  }
  function nextBatch() {
    if (state.loading || !state.limited)
      return Promise.resolve()
    contextGeneration++
    state.results = []
    state.selectedKey = ''
    state.contextState = { phase: 'idle' }
    state.scan = { phase: 'paused' }
    state.batch++
    state.visibleResultCount = PRIVATE_HISTORY_VISIBLE_BATCH_SIZE
    return run()
  }
  async function select(key: string) {
    const result = filteredResults.value.find(item => item.key === key)
    if (!result || disposed || document.hidden || dependencies.active?.() === false)
      return
    document.addEventListener('visibilitychange', onVisibility)
    state.selectedKey = key
    state.contextState = { phase: 'loading' }
    const epoch = ++contextGeneration
    const account = mid.value
    if (contextPending)
      await contextPending
    if (disposed || document.hidden || epoch !== contextGeneration || account !== mid.value)
      return
    const task = (async () => {
      try {
      // The exclusive upper boundary leaves room for newer replies as well as
      // earlier context without converting lossless sequence IDs to Number.
        const upper = BigInt(result.message.seqno) + BigInt(CONTEXT_SIZE / 2 + 1)
        const maximum = BigInt('18446744073709551615')
        const endSeqno = (upper > maximum ? maximum : upper).toString()
        const data = extractMessages(await dependencies.fetchMessages({ talkerId: result.session.talkerId, endSeqno, size: CONTEXT_SIZE }))
        if (disposed || document.hidden || epoch !== contextGeneration || account !== mid.value)
          return
        if (!data)
          throw new Error('context-unavailable')
        const items = transformPrivateMessages(data.messages, data.e_infos, account)
        if (!items.some(item => item.msgKey === result.message.msgKey))
          throw new Error('message-no-longer-available')
        state.contextState = { phase: 'ready', value: { key, talkerId: result.session.talkerId, items } }
      }
      catch {
        if (epoch === contextGeneration && account === mid.value)
          state.contextState = { phase: 'error' }
      }
    })()
    contextPending = task
    await task
    if (contextPending === task)
      contextPending = null
  }
  function choose(key: string) {
    if (!filteredResults.value.some(result => result.key === key))
      return
    state.selectionVersion++
    if (state.selectedKey === key && state.context?.key === key)
      return
    contextGeneration++
    state.selectedKey = key
    state.contextState = { phase: 'idle' }
  }
  function nextKey(direction: number) {
    const length = filteredResults.value.length
    if (!length)
      return ''
    const index = selectedIndex.value < 0 ? (direction > 0 ? -1 : 0) : selectedIndex.value
    return filteredResults.value[(index + direction + length) % length].key
  }
  function setTypeFilter(filter: PrivateSessionTypeFilter) {
    if (filter !== state.typeFilter)
      state.visibleResultCount = PRIVATE_HISTORY_VISIBLE_BATCH_SIZE
    state.typeFilter = filter
    if (state.selectedKey && !filteredResults.value.some(result => result.key === state.selectedKey)) {
      contextGeneration++
      state.selectedKey = ''
      state.contextState = { phase: 'idle' }
    }
  }
  function onVisibility() {
    if (document.hidden) {
      stop()
      contextGeneration++
      if (state.loadingContext)
        state.contextState = { phase: 'error' }
    }
  }
  watch(() => [dependencies.active?.() ?? true, state.query] as const, ([active, query]) => {
    document.removeEventListener('visibilitychange', onVisibility)
    if (active && query)
      document.addEventListener('visibilitychange', onVisibility)
  }, { flush: 'sync' })
  watch(mid, reset, { flush: 'sync' })
  watch(() => dependencies.active?.() ?? true, (active) => {
    if (!active)
      reset()
  }, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    reset()
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return { state, filteredResults, selected, selectedIndex, setTypeFilter, search, resume: run, stop, suspend, reset, select, choose, nextKey, skipFailed, nextBatch }
}

export type PrivateHistorySearchController = ReturnType<typeof usePrivateHistorySearch>
