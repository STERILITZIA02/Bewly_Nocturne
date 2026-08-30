import type { MomentCommentItem } from '~/components/MomentCard/commentUtils'
import { mergeMomentComments } from '~/components/MomentCard/commentUtils'

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

interface MomentCommentThreadControllerOptions {
  getIdentity: () => string
  fetchPage: (rootRpid: string, pageNumber: number) => Promise<MomentCommentRepliesPage>
}

export interface MomentCommentThreadController {
  states: Map<string, MomentCommentThreadState>
  getState: (rootRpid: string) => MomentCommentThreadState | undefined
  seed: (rootRpid: string, previewItems: MomentCommentItem[], replyCount: number) => MomentCommentThreadState
  loadMore: (rootRpid: string) => Promise<MomentCommentThreadState>
  invalidate: () => void
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
  let identity = options.getIdentity()
  let generation = 0
  let disposed = false

  const ensureIdentity = () => {
    const nextIdentity = options.getIdentity()
    if (identity === nextIdentity)
      return
    identity = nextIdentity
    generation += 1
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
    state.items = mergeMomentComments(state.items, previewItems)
    const normalizedReplyCount = Number.isFinite(replyCount) ? Math.max(0, replyCount) : 0
    if (!state.loaded)
      state.hasMore = normalizedReplyCount > state.items.length
    else if (normalizedReplyCount > state.items.length)
      state.hasMore = true
    if (!states.has(rootRpid))
      states.set(rootRpid, state)
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
    if (disposed || !state.hasMore)
      return Promise.resolve(state)

    const requestGeneration = generation
    const requestIdentity = identity
    const pageNumber = state.nextPage
    state.loading = true
    state.error = undefined

    const task = options.fetchPage(rootRpid, pageNumber)
      .then((page) => {
        if (disposed || requestGeneration !== generation || requestIdentity !== identity || options.getIdentity() !== identity)
          return state
        const previousItemCount = state.items.length
        const mergedItems = mergeMomentComments(state.items, page.items)
        const madeProgress = mergedItems.length > previousItemCount
        const pageAdvanced = page.nextPage > pageNumber
        state.items = mergedItems
        state.loaded = true
        state.hasMore = page.hasMore && pageAdvanced && (madeProgress || page.items.length > 0)
        state.nextPage = pageAdvanced ? page.nextPage : pageNumber
        return state
      })
      .catch((error: unknown) => {
        if (!disposed
          && requestGeneration === generation
          && requestIdentity === identity
          && options.getIdentity() === identity) {
          state.error = getErrorMessage(error)
        }
        throw error
      })
      .finally(() => {
        if (!disposed
          && requestGeneration === generation
          && requestIdentity === identity
          && options.getIdentity() === identity) {
          state.loading = false
        }
        if (pendingTasks.get(rootRpid) === task)
          pendingTasks.delete(rootRpid)
      })

    pendingTasks.set(rootRpid, task)
    return task
  }

  const invalidate = () => {
    generation += 1
    identity = options.getIdentity()
    states.clear()
    pendingTasks.clear()
  }

  const dispose = () => {
    disposed = true
    generation += 1
    states.clear()
    pendingTasks.clear()
  }

  return {
    states,
    getState,
    seed,
    loadMore,
    invalidate,
    dispose,
  }
}
