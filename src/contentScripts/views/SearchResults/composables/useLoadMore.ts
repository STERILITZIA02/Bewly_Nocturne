import { computed, getCurrentScope, nextTick, onScopeDispose, ref } from 'vue'

import type { SearchViewState } from './useSearchRequest'

export interface LoadMoreOptions {
  cooldownMs?: number
  retryDelayMs?: number
  maxAutoFillAttempts?: number
  isLoading?: () => boolean
  view?: SearchViewState
}

export interface LoadMoreState {
  phase: 'idle' | 'loading'
  schedule: 'idle' | 'waiting'
  lastTriggered: number
  lastCompleted: number
  lastAppended: number
  autoFillAttempts: number
}

/**
 * 无限加载的通用 composable
 * 管理分页、加载状态、防抖和自动填充
 */
export function useLoadMore(
  loadFn: () => Promise<{ success: boolean, appendedCount: number }>,
  options: LoadMoreOptions = {},
) {
  const {
    cooldownMs = 800,
    retryDelayMs = 120,
    maxAutoFillAttempts = 2,
    isLoading = () => false,
  } = options

  const page = ref(0)
  const hasMore = ref(true)
  const exhausted = ref(false)
  const autoFillPaused = ref(false)
  for (const [name, field] of Object.entries({ hasMore, exhausted, autoFillPaused }))
    options.view?.retain(name, field)
  const needsManualLoadMore = computed(() => autoFillPaused.value && hasMore.value && !exhausted.value)

  const state = ref<LoadMoreState>({
    phase: 'idle',
    schedule: 'idle',
    lastTriggered: 0,
    lastCompleted: 0,
    lastAppended: 0,
    autoFillAttempts: 0,
  })

  let loadMoreTimer: number | undefined
  let generation = 0
  let disposed = false
  let renderFrame: number | undefined
  let finishRenderWait: (() => void) | undefined
  let completion: { phase: 'rendering' | 'measuring', promise: Promise<void> } | undefined

  function cancelRenderWait() {
    if (renderFrame !== undefined)
      window.cancelAnimationFrame(renderFrame)
    finishRenderWait?.()
    renderFrame = undefined
    finishRenderWait = undefined
  }

  async function waitForRender(requestGeneration: number) {
    await nextTick()
    if (disposed || requestGeneration !== generation)
      return false
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => {
        finishRenderWait = () => {
          renderFrame = undefined
          finishRenderWait = undefined
          resolve()
        }
        renderFrame = window.requestAnimationFrame(() => finishRenderWait?.())
      })
    }
    return !disposed && requestGeneration === generation
  }

  /**
   * 清除定时器
   */
  function clearTimer() {
    if (loadMoreTimer !== undefined) {
      clearTimeout(loadMoreTimer)
      loadMoreTimer = undefined
    }
    state.value.schedule = 'idle'
  }

  /**
   * 调度加载更多尝试
   */
  function scheduleAttempt(delay: number) {
    if (disposed || autoFillPaused.value)
      return
    if (isLoading()) {
      clearTimer()
      return
    }

    clearTimer()
    const effectiveDelay = Math.max(delay, 0)
    state.value.schedule = 'waiting'

    loadMoreTimer = window.setTimeout(() => {
      loadMoreTimer = undefined
      void attemptLoadMore()
    }, effectiveDelay)
  }

  /**
   * 尝试加载更多
   */
  async function attemptLoadMore() {
    if (disposed || autoFillPaused.value || state.value.phase === 'loading')
      return

    if (isLoading()) {
      clearTimer()
      return
    }

    if (!hasMore.value || exhausted.value) {
      clearTimer()
      state.value.autoFillAttempts = 0
      return
    }

    clearTimer()
    state.value.phase = 'loading'
    state.value.lastTriggered = Date.now()
    const requestGeneration = generation

    try {
      const result = await loadFn()
      if (disposed || requestGeneration !== generation)
        return

      if (result.success) {
        page.value += 1
        state.value.lastAppended = result.appendedCount

        // A filtered/duplicate page is not the end of the server result set.
        // Pause automatic requests, while retaining an explicit continuation.
        if (result.appendedCount === 0) {
          autoFillPaused.value = true
          clearTimer()
        }
      }
    }
    finally {
      if (!disposed && requestGeneration === generation) {
        state.value.lastCompleted = Date.now()
        state.value.phase = 'idle'
      }
    }
  }

  /**
   * 请求加载更多（带防抖）
   */
  function requestLoadMore() {
    if (disposed || autoFillPaused.value || !hasMore.value || exhausted.value || isLoading() || state.value.phase === 'loading')
      return

    const now = Date.now()
    const lastRequestBoundary = Math.max(state.value.lastTriggered, state.value.lastCompleted)
    const elapsed = now - lastRequestBoundary

    // 如果在冷却期内，标记为pending并调度延迟加载
    if (elapsed < cooldownMs) {
      if (state.value.schedule !== 'waiting') {
        const remainingCooldown = cooldownMs - elapsed
        scheduleAttempt(remainingCooldown)
      }
      return
    }

    void attemptLoadMore()
  }

  function resumeLoadMore() {
    if (disposed || isLoading() || state.value.phase === 'loading')
      return
    autoFillPaused.value = false
    state.value.autoFillAttempts = 0
    requestLoadMore()
  }

  /**
   * 处理加载完成后的自动填充逻辑
   * @param haveScrollbar 检查是否有滚动条的函数
   */
  function handleLoadMoreCompletion(haveScrollbar: () => Promise<boolean>): Promise<void> {
    if (disposed)
      return Promise.resolve()
    if (completion)
      return completion.promise
    const task = { phase: 'rendering' as 'rendering' | 'measuring', promise: Promise.resolve() }
    completion = task
    task.promise = completeLoadMore(haveScrollbar, task).finally(() => {
      if (completion === task)
        completion = undefined
    })
    return task.promise
  }

  async function completeLoadMore(haveScrollbar: () => Promise<boolean>, task: NonNullable<typeof completion>) {
    const requestGeneration = generation
    if (!await waitForRender(requestGeneration))
      return

    if (isLoading()) {
      clearTimer()
      return
    }

    const now = Date.now()
    const lastRequestBoundary = Math.max(state.value.lastTriggered, state.value.lastCompleted)
    const elapsed = now - lastRequestBoundary
    const remainingCooldown = Math.max(cooldownMs - elapsed, 0)

    // 如果有挂起的请求，继续调度
    if (state.value.schedule === 'waiting' && hasMore.value) {
      scheduleAttempt(Math.max(remainingCooldown, retryDelayMs))
      return
    }

    if (!hasMore.value) {
      state.value.autoFillAttempts = 0
      return
    }

    // 检查是否需要自动填充
    const appendedItems = state.value.lastAppended
    if (appendedItems <= 0) {
      state.value.autoFillAttempts = 0
      return
    }

    if (state.value.autoFillAttempts >= maxAutoFillAttempts) {
      state.value.autoFillAttempts = 0
      return
    }

    task.phase = 'measuring'
    const hasScrollBar = await haveScrollbar()
    if (disposed || requestGeneration !== generation)
      return
    if (hasScrollBar) {
      state.value.autoFillAttempts = 0
      return
    }

    state.value.autoFillAttempts += 1
    scheduleAttempt(Math.max(remainingCooldown, retryDelayMs))
  }

  /**
   * 重置状态
   */
  function reset() {
    generation++
    completion = undefined
    cancelRenderWait()
    autoFillPaused.value = false
    page.value = 0
    hasMore.value = true
    exhausted.value = false
    state.value = {
      phase: 'idle',
      schedule: 'idle',
      lastTriggered: 0,
      lastCompleted: 0,
      lastAppended: 0,
      autoFillAttempts: 0,
    }
    clearTimer()
  }

  /**
   * 设置是否还有更多数据
   */
  function setHasMore(value: boolean) {
    hasMore.value = value
  }

  /**
   * 设置已耗尽状态
   */
  function setExhausted(value: boolean) {
    exhausted.value = value
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      generation++
      completion = undefined
      clearTimer()
      cancelRenderWait()
    })
  }

  return {
    page,
    hasMore,
    exhausted,
    requestLoadMore,
    needsManualLoadMore,
    resumeLoadMore,
    handleLoadMoreCompletion,
    reset,
    setHasMore,
    setExhausted,
  }
}
