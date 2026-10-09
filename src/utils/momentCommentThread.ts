import type { MomentCommentItem } from '~/components/MomentCard/commentUtils'
import { mergeMomentComments } from '~/components/MomentCard/commentUtils'

import { waitWithSignal } from './abort'
import { COMMENT_REPLY_CACHE_LIMITS } from './commentReplyPageCache'

export interface MomentCommentRepliesPage {
  items: MomentCommentItem[]
  hasMore: boolean
  nextPage: number
}

export interface MomentCommentThreadState {
  items: MomentCommentItem[]
  loading: boolean
  loaded: boolean
  hasMore: boolean
  nextPage: number
  error?: string
}

export interface MomentCommentThreadSnapshot {
  rootRpid: string
  items: MomentCommentItem[]
  loaded: boolean
  hasMore: boolean
  nextPage: number
}

interface MomentCommentThreadControllerOptions {
  getIdentity: () => string
  fetchPage: (rootRpid: string, pageNumber: number, signal: AbortSignal) => Promise<MomentCommentRepliesPage>
}

export interface MomentCommentThreadController {
  states: Map<string, MomentCommentThreadState>
  getState: (rootRpid: string) => MomentCommentThreadState | undefined
  seed: (rootRpid: string, previewItems: MomentCommentItem[], replyCount: number) => MomentCommentThreadState
  loadMore: (rootRpid: string) => Promise<MomentCommentThreadState>
  invalidate: () => void
  cancelReads: () => void
  snapshot: () => MomentCommentThreadSnapshot[]
  restore: (snapshots: MomentCommentThreadSnapshot[]) => void
  dispose: () => void
}

function createThreadState(): MomentCommentThreadState {
  return {
    items: [],
    loading: false,
    loaded: false,
    hasMore: false,
    nextPage: 1,
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}

export function createMomentCommentThreadController(
  options: MomentCommentThreadControllerOptions,
): MomentCommentThreadController {
  const states = new Map<string, MomentCommentThreadState>()
  const pendingTasks = new Map<string, Promise<MomentCommentThreadState>>()
  const controllers = new Map<string, AbortController>()
  let identity = options.getIdentity()
  let generation = 0
  let disposed = false

  const cancelReads = () => {
    controllers.forEach(controller => controller.abort())
    controllers.clear()
    pendingTasks.clear()
    states.forEach(state => state.loading = false)
  }
  const retain = (rootRpid: string, state: MomentCommentThreadState) => {
    states.delete(rootRpid)
    states.set(rootRpid, state)
    while (states.size > COMMENT_REPLY_CACHE_LIMITS.threads) {
      const oldest = [...states.keys()].find(key => !controllers.has(key) && key !== rootRpid)
        ?? (!controllers.has(rootRpid) ? rootRpid : undefined)
      if (!oldest)
        break
      states.delete(oldest)
    }
  }

  const ensureIdentity = () => {
    const nextIdentity = options.getIdentity()
    if (identity === nextIdentity)
      return
    identity = nextIdentity
    generation += 1
    cancelReads()
    states.clear()
    pendingTasks.clear()
  }

  const getState = (rootRpid: string) => {
    ensureIdentity()
    return states.get(rootRpid)
  }

  const seed = (rootRpid: string, previewItems: MomentCommentItem[], replyCount: number) => {
    ensureIdentity()
    const state = states.get(rootRpid) ?? createThreadState()
    if (disposed)
      return state
    state.items = mergeMomentComments(state.items, previewItems).slice(-COMMENT_REPLY_CACHE_LIMITS.items)
    const normalizedReplyCount = Number.isFinite(replyCount) ? Math.max(0, replyCount) : 0
    if (!state.loaded)
      state.hasMore = normalizedReplyCount > state.items.length
    else if (normalizedReplyCount > state.items.length)
      state.hasMore = true
    retain(rootRpid, state)
    return state
  }

  const loadMore = (rootRpid: string): Promise<MomentCommentThreadState> => {
    ensureIdentity()
    const runningTask = pendingTasks.get(rootRpid)
    if (runningTask)
      return runningTask

    const state = states.get(rootRpid) ?? createThreadState()
    if (!states.has(rootRpid))
      states.set(rootRpid, state)
    if (disposed || !state.hasMore || controllers.size >= COMMENT_REPLY_CACHE_LIMITS.threads)
      return Promise.resolve(state)

    const requestGeneration = generation
    const requestIdentity = identity
    const pageNumber = state.nextPage
    state.loading = true
    state.error = undefined
    const controller = new AbortController()
    controllers.set(rootRpid, controller)
    retain(rootRpid, state)
    const task = waitWithSignal(options.fetchPage(rootRpid, pageNumber, controller.signal), controller.signal)
      .then((page) => {
        if (disposed || controller.signal.aborted || requestGeneration !== generation || requestIdentity !== identity || options.getIdentity() !== identity)
          return state
        const previousItemCount = state.items.length
        const mergedItems = mergeMomentComments(state.items, page.items)
        const madeProgress = mergedItems.length > previousItemCount
        const pageAdvanced = page.nextPage > pageNumber
        state.items = mergedItems.slice(-COMMENT_REPLY_CACHE_LIMITS.items)
        state.loaded = true
        state.hasMore = page.hasMore && pageAdvanced && (madeProgress || page.items.length > 0)
        state.nextPage = pageAdvanced ? page.nextPage : pageNumber
        return state
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted)
          return state
        if (!disposed && !controller.signal.aborted
          && requestGeneration === generation
          && requestIdentity === identity
          && options.getIdentity() === identity) {
          state.error = getErrorMessage(error)
        }
        throw error
      })
      .finally(() => {
        if (!disposed && controllers.get(rootRpid) === controller
          && requestGeneration === generation
          && requestIdentity === identity
          && options.getIdentity() === identity) {
          state.loading = false
        }
        if (pendingTasks.get(rootRpid) === task)
          pendingTasks.delete(rootRpid)
        if (controllers.get(rootRpid) === controller)
          controllers.delete(rootRpid)
      })

    pendingTasks.set(rootRpid, task)
    return task
  }

  const invalidate = () => {
    generation += 1
    cancelReads()
    identity = options.getIdentity()
    states.clear()
    pendingTasks.clear()
  }

  const dispose = () => {
    disposed = true
    generation += 1
    cancelReads()
    states.clear()
    pendingTasks.clear()
  }

  return {
    states,
    getState,
    seed,
    loadMore,
    invalidate,
    cancelReads,
    snapshot: () => [...states].map(([rootRpid, state]) => ({
      rootRpid,
      items: state.items,
      loaded: state.loaded,
      hasMore: state.hasMore,
      nextPage: state.nextPage,
    })),
    restore: (snapshots) => {
      invalidate()
      for (const { rootRpid, ...state } of snapshots.slice(-COMMENT_REPLY_CACHE_LIMITS.threads))
        states.set(rootRpid, { ...state, items: state.items.slice(-COMMENT_REPLY_CACHE_LIMITS.items), loading: false })
    },
    dispose,
  }
}
