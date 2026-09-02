export type CommentReplyPaginationMode = 'loadMore' | 'pagination'

export interface CommentReplyInteractionState {
  action?: number
  like?: number
}

export function applyCommentReplyInteractionOverrides<T extends object>(
  list: T[],
  interactionByRpid: ReadonlyMap<string, CommentReplyInteractionState>,
  getRpid: (reply: T) => string | null | undefined,
): T[] {
  list.forEach((reply) => {
    const rpid = getRpid(reply)
    const interaction = rpid ? interactionByRpid.get(rpid) : undefined
    if (!interaction)
      return
    if (interaction.action !== undefined)
      Object.assign(reply, { action: interaction.action })
    if (interaction.like !== undefined)
      Object.assign(reply, { like: interaction.like })
  })
  return list
}

interface PaginationLabels {
  expandAll: string
  expandingAll: string
  loadMore: string
  loading: string
  noMore: string
}

export interface CommentReplyPaginationAdapter {
  getData: (renderer: any) => any | null
  getMode: () => CommentReplyPaginationMode
  getOid: (reply: any) => string | null
  getRpid: (reply: any) => string | null
  getRootRpid: (reply: any) => string | null
  getLabels: () => PaginationLabels
  isTreeEnabled: () => boolean
  shouldShowExpandAll?: (renderer: any) => boolean
  onNativeCollapse?: (renderer: any) => void
  scheduleTreeUpdate: (renderer: any) => void
}

interface LayoutReservation {
  anchorHost: HTMLElement
  appliedMinHeight: string
  container: HTMLElement
  previousMinHeight: string
  previousOverflowAnchor: string
}

interface PaginationState {
  allRepliesExpanded: boolean
  currentPage: number
  expandAllLoading: boolean
  expandAllOperation?: symbol
  expandAllPromise?: Promise<void>
  identity: string
  initialList: any[]
  interactionByRpid: Map<string, CommentReplyInteractionState>
  loading?: Promise<unknown>
  mergedList?: any[]
  collapsedList?: any[]
  suppressInvalidatedResultRestore?: boolean
  pages: Map<number, any[]>
  pending?: {
    beforeList: any[]
    layoutReservation?: LayoutReservation
    page: number
  }
}

export interface SequentialCommentReplyPageLoader {
  getCurrentPage: () => number
  getTotalPage: () => number
  isValid: () => boolean
  loadNextPage: (currentPage: number) => Promise<unknown>
}

export interface SequentialCommentReplyPageResult {
  completed: boolean
  lastPage: number
  reason: 'completed' | 'invalid' | 'no-progress'
}

export async function loadCommentReplyPagesSequentially({
  getCurrentPage,
  getTotalPage,
  isValid,
  loadNextPage,
}: SequentialCommentReplyPageLoader): Promise<SequentialCommentReplyPageResult> {
  let currentPage = getCurrentPage()
  let totalPage = getTotalPage()
  if (!isValid() || !Number.isFinite(currentPage) || !Number.isFinite(totalPage) || totalPage < 1) {
    return { completed: false, lastPage: currentPage, reason: 'invalid' }
  }

  while (currentPage < totalPage) {
    if (!isValid())
      return { completed: false, lastPage: currentPage, reason: 'invalid' }

    const previousPage = currentPage
    await loadNextPage(previousPage)
    if (!isValid())
      return { completed: false, lastPage: previousPage, reason: 'invalid' }

    currentPage = getCurrentPage()
    totalPage = getTotalPage()
    if (!Number.isFinite(currentPage) || currentPage <= previousPage)
      return { completed: false, lastPage: currentPage, reason: 'no-progress' }
    if (!Number.isFinite(totalPage) || totalPage < 1)
      return { completed: false, lastPage: currentPage, reason: 'invalid' }
  }

  return { completed: true, lastPage: currentPage, reason: 'completed' }
}

export function mergeCommentReplyLists<T>(
  lists: readonly (readonly T[])[],
  getRpid: (reply: T) => string | null | undefined,
): T[] {
  const merged: T[] = []
  const seenRpids = new Set<string>()
  const seenReplies = new Set<T>()
  lists.forEach((list) => {
    list.forEach((reply) => {
      const rpid = getRpid(reply)
      if (rpid) {
        if (seenRpids.has(rpid))
          return
        seenRpids.add(rpid)
      }
      else if (seenReplies.has(reply)) {
        return
      }
      seenReplies.add(reply)
      merged.push(reply)
    })
  })
  return merged
}

const EXPAND_ALL_BUTTON_CLASS = 'bewly-comment-expand-all'
const PAGINATION_PATCHED = Symbol('bewly-comment-reply-pagination-patched')

function findPropertyDescriptor(prototype: object, property: string): PropertyDescriptor | null {
  let current: object | null = prototype
  while (current && current !== Object.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(current, property)
    if (descriptor)
      return descriptor
    current = Object.getPrototypeOf(current)
  }
  return null
}

export function createCommentReplyPaginationController(adapter: CommentReplyPaginationAdapter) {
  const states = new WeakMap<object, PaginationState>()
  const enabledStates = new WeakMap<object, boolean>()
  const expandAllTasks = new WeakMap<object, Promise<void>>()
  const activeLayoutReservations = new WeakMap<HTMLElement, LayoutReservation>()

  const isEnabled = () => adapter.isTreeEnabled() && adapter.getMode() === 'loadMore'

  function getInvisibleRpids(renderer: any): Set<string> {
    if (!renderer.invisibleID || typeof renderer.invisibleID !== 'object')
      return new Set()
    return new Set(Object.keys(renderer.invisibleID).filter(rpid => renderer.invisibleID[rpid]))
  }

  function reserveLayoutHeight(renderer: any): LayoutReservation | undefined {
    const root = renderer?.shadowRoot as ShadowRoot | null | undefined
    const container = root?.querySelector<HTMLElement>('#expander-contents')
    if (!container)
      return

    const height = Math.ceil(container.getBoundingClientRect().height)
    if (height <= 0)
      return

    const existing = activeLayoutReservations.get(container)
    const anchorHost = renderer instanceof HTMLElement ? renderer : container
    const reservation = {
      anchorHost,
      appliedMinHeight: `${height}px`,
      container,
      previousMinHeight: existing?.previousMinHeight ?? container.style.minHeight,
      previousOverflowAnchor: existing?.previousOverflowAnchor
        ?? anchorHost.style.getPropertyValue('overflow-anchor'),
    }
    container.style.minHeight = reservation.appliedMinHeight
    anchorHost.style.setProperty('overflow-anchor', 'none')
    activeLayoutReservations.set(container, reservation)
    return reservation
  }

  function releaseLayoutReservation(reservation: LayoutReservation | undefined) {
    if (!reservation || activeLayoutReservations.get(reservation.container) !== reservation)
      return

    activeLayoutReservations.delete(reservation.container)
    if (reservation.container.style.minHeight === reservation.appliedMinHeight)
      reservation.container.style.minHeight = reservation.previousMinHeight
    if (reservation.anchorHost.style.getPropertyValue('overflow-anchor') === 'none') {
      if (reservation.previousOverflowAnchor)
        reservation.anchorHost.style.setProperty('overflow-anchor', reservation.previousOverflowAnchor)
      else
        reservation.anchorHost.style.removeProperty('overflow-anchor')
    }
  }

  function scheduleTreeUpdate(renderer: any, reservation?: LayoutReservation) {
    try {
      adapter.scheduleTreeUpdate(renderer)
    }
    catch (error) {
      releaseLayoutReservation(reservation)
      throw error
    }
    requestAnimationFrame(() => requestAnimationFrame(() => releaseLayoutReservation(reservation)))
  }

  function getIdentity(renderer: any): string {
    const data = adapter.getData(renderer) ?? {}
    const oid = String(renderer.oid ?? adapter.getOid(data) ?? '')
    const type = String(renderer.type ?? data.type ?? data.business ?? '')
    const root = String(renderer.root ?? adapter.getRpid(data) ?? adapter.getRootRpid(data) ?? '')
    return `${oid}|${type}|${root}`
  }

  function removeExpandAllButton(renderer: any) {
    const root = renderer?.shadowRoot as ShadowRoot | null | undefined
    root?.querySelector<HTMLElement>(`.${EXPAND_ALL_BUTTON_CLASS}`)?.remove()
  }

  function clear(renderer: any, restoreCurrentPage: boolean) {
    const state = states.get(renderer)
    if (!state) {
      removeExpandAllButton(renderer)
      return
    }

    state.expandAllOperation = undefined
    state.expandAllLoading = false
    state.expandAllPromise = undefined
    expandAllTasks.delete(renderer)
    const currentPage = state.pages.get(state.currentPage)
    if (restoreCurrentPage && state.mergedList && renderer.list === state.mergedList && currentPage) {
      renderer.list = currentPage.slice()
      renderer.requestUpdate?.()
    }

    releaseLayoutReservation(state.pending?.layoutReservation)
    state.loading = undefined
    state.pending = undefined
    state.pages.clear()
    state.interactionByRpid.clear()
    states.delete(renderer)
    removeExpandAllButton(renderer)
    renderer.requestUpdate?.()
  }

  function mergeLists(...lists: any[][]): any[] {
    return mergeCommentReplyLists(lists, adapter.getRpid)
  }

  function invalidateLoading(renderer: any) {
    const state = states.get(renderer)
    if (!state)
      return

    state.expandAllOperation = undefined
    if (!state.expandAllPromise)
      state.expandAllLoading = false
    if (!state.pending && !state.loading) {
      updateExpandAllButton(renderer)
      return
    }

    releaseLayoutReservation(state.pending?.layoutReservation)
    if (!state.mergedList && state.pages.size > 0)
      state.mergedList = mergePages(state)
    if (state.mergedList)
      renderer.list = state.mergedList
    state.pending = undefined
    state.loading = undefined
    renderer.requestUpdate?.()
    updateExpandAllButton(renderer)
  }

  function suspendForNativeCollapse(renderer: any, captureCollapsedList: boolean) {
    const state = states.get(renderer)
    if (!state)
      return
    state.suppressInvalidatedResultRestore = true
    if (captureCollapsedList && Array.isArray(renderer.list))
      state.collapsedList = renderer.list.slice()
    invalidateLoading(renderer)
  }

  function getState(renderer: any): PaginationState {
    const identity = getIdentity(renderer)
    const existing = states.get(renderer)
    if (existing?.identity === identity)
      return existing
    if (existing)
      clear(renderer, false)

    const state: PaginationState = {
      allRepliesExpanded: false,
      currentPage: Number(renderer.currentPage) || 1,
      expandAllLoading: false,
      identity,
      initialList: Array.isArray(renderer.list) ? renderer.list.slice() : [],
      interactionByRpid: new Map(),
      pages: new Map(),
    }
    states.set(renderer, state)
    return state
  }

  function isExpandAllOperationValid(renderer: any, state: PaginationState, operation: symbol) {
    return isEnabled()
      && renderer?.isConnected !== false
      && states.get(renderer) === state
      && state.identity === getIdentity(renderer)
      && state.expandAllOperation === operation
  }

  function updateExpandAllButton(renderer: any) {
    const root = renderer?.shadowRoot as ShadowRoot | null | undefined
    if (!root)
      return

    const existing = root.querySelector<HTMLButtonElement>(`.${EXPAND_ALL_BUTTON_CLASS}`)
    if (!isEnabled() || adapter.shouldShowExpandAll?.(renderer) === false) {
      existing?.remove()
      return
    }

    const state = getState(renderer)
    const totalPage = Number(renderer.totalPage) || 0
    state.allRepliesExpanded = hasLoadedEveryPage(state, totalPage)
    const shouldShow = renderer.isConnected !== false && totalPage > 1 && !state.allRepliesExpanded
    if (!shouldShow) {
      existing?.remove()
      return
    }

    const button = existing ?? document.createElement('button')
    if (!existing) {
      button.type = 'button'
      button.className = EXPAND_ALL_BUTTON_CLASS
      button.addEventListener('click', () => {
        void expandAllReplies(renderer)
      })
      root.append(button)
    }

    const labels = adapter.getLabels()
    const expandAllLoading = state.expandAllLoading || expandAllTasks.has(renderer)
    button.disabled = expandAllLoading
    button.textContent = expandAllLoading ? labels.expandingAll : labels.expandAll
    button.setAttribute('aria-busy', String(expandAllLoading))
  }

  function expandAllReplies(renderer: any): Promise<void> {
    const runningTask = expandAllTasks.get(renderer)
    if (runningTask)
      return runningTask

    const state = getState(renderer)
    if (state.expandAllPromise)
      return state.expandAllPromise

    const operation = Symbol('bewly-comment-expand-all-operation')
    const identity = state.identity
    const layoutReservation = reserveLayoutHeight(renderer)
    state.allRepliesExpanded = false
    state.expandAllLoading = true
    state.expandAllOperation = operation
    updateExpandAllButton(renderer)
    renderer.requestUpdate?.()

    const request = (async () => {
      if (renderer.showPagination !== true) {
        if (typeof renderer.handleViewMore !== 'function')
          return
        const initialRequest = Reflect.apply(renderer.handleViewMore, renderer, [{
          preventDefault() {},
          stopImmediatePropagation() {},
          stopPropagation() {},
        }])
        await Promise.resolve(initialRequest)
        if (state.loading)
          await state.loading
        await Promise.resolve(renderer.updateComplete)
      }

      if (renderer.showPagination !== true || !isExpandAllOperationValid(renderer, state, operation))
        return

      const loadPage = async (pageIndex: number) => {
        const pageTarget = document.createElement('button')
        pageTarget.dataset.idx = String(pageIndex)
        const nextRequest = renderer.handleChangePage({
          currentTarget: pageTarget,
          idx: pageIndex,
          preventDefault() {},
          stopImmediatePropagation() {},
          stopPropagation() {},
          target: pageTarget,
        })
        await Promise.resolve(nextRequest)
        if (state.loading && state.loading !== nextRequest)
          await state.loading
        await Promise.resolve(renderer.updateComplete)
      }
      const currentPage = Number(renderer.currentPage) || 1
      if (currentPage > 1 && !hasLoadedEveryPage(state, currentPage))
        await loadPage(0)
      if (!isExpandAllOperationValid(renderer, state, operation))
        return

      const result = await loadCommentReplyPagesSequentially({
        getCurrentPage: () => Number(renderer.currentPage) || 1,
        getTotalPage: () => Number(renderer.totalPage) || 0,
        isValid: () => isExpandAllOperationValid(renderer, state, operation),
        loadNextPage: loadPage,
      })

      if (isExpandAllOperationValid(renderer, state, operation))
        state.allRepliesExpanded = result.completed
    })().catch((error) => {
      console.error('[Bewly Nocturne] Failed to expand all comment replies:', error)
    }).finally(() => {
      if (expandAllTasks.get(renderer) === request)
        expandAllTasks.delete(renderer)
      if (states.get(renderer) !== state || state.identity !== identity || state.expandAllOperation !== operation) {
        if (states.get(renderer) === state) {
          state.expandAllLoading = false
          state.expandAllPromise = undefined
          updateExpandAllButton(renderer)
        }
        releaseLayoutReservation(layoutReservation)
        updateExpandAllButton(renderer)
        return
      }

      state.expandAllLoading = false
      state.expandAllOperation = undefined
      state.expandAllPromise = undefined
      renderer.requestUpdate?.()
      if (renderer.isConnected !== false && isEnabled())
        scheduleTreeUpdate(renderer, layoutReservation)
      else
        releaseLayoutReservation(layoutReservation)
      updateExpandAllButton(renderer)
    })

    state.expandAllPromise = request
    expandAllTasks.set(renderer, request)
    return request
  }

  function mergePages(state: PaginationState): any[] {
    const merged = mergeLists(...[...state.pages.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, replies]) => replies))
    return applyCommentReplyInteractionOverrides(merged, state.interactionByRpid, adapter.getRpid)
  }

  function applyInteractionOverrides(state: PaginationState, list: any[] | undefined) {
    if (list)
      applyCommentReplyInteractionOverrides(list, state.interactionByRpid, adapter.getRpid)
  }

  function recordInteraction(
    renderer: any,
    rpid: string,
    interaction: CommentReplyInteractionState,
  ) {
    const state = states.get(renderer)
    if (!state || !rpid)
      return

    const nextInteraction: CommentReplyInteractionState = {
      ...(Number.isFinite(interaction.action) ? { action: interaction.action } : {}),
      ...(Number.isFinite(interaction.like) ? { like: interaction.like } : {}),
    }
    if (nextInteraction.action === undefined && nextInteraction.like === undefined)
      return

    state.interactionByRpid.set(rpid, nextInteraction)
    applyInteractionOverrides(state, renderer.list)
    applyInteractionOverrides(state, state.initialList)
    applyInteractionOverrides(state, state.mergedList)
    applyInteractionOverrides(state, state.collapsedList)
    applyInteractionOverrides(state, state.pending?.beforeList)
    state.pages.forEach(replies => applyInteractionOverrides(state, replies))
    renderer.requestUpdate?.()
  }

  function hasLoadedEveryPage(state: PaginationState, totalPage: number) {
    if (!Number.isFinite(totalPage) || totalPage < 1)
      return false
    for (let page = 1; page <= totalPage; page += 1) {
      if (!state.pages.has(page))
        return false
    }
    return true
  }

  function getNewPage(beforeList: any[], loadedList: any[]): any[] {
    const existingRpids = new Set(beforeList.map(adapter.getRpid).filter(Boolean) as string[])
    const existingReplies = new Set(beforeList)
    const newRpids = new Set<string>()
    return loadedList.filter((reply) => {
      const rpid = adapter.getRpid(reply)
      if (!rpid)
        return !existingReplies.has(reply)
      if (existingRpids.has(rpid) || newRpids.has(rpid))
        return false
      newRpids.add(rpid)
      return true
    })
  }

  function patchPrototype(classConstructor: unknown) {
    if (typeof classConstructor !== 'function')
      return
    const prototype = classConstructor.prototype as Record<PropertyKey, unknown> | undefined
    if (!prototype || prototype[PAGINATION_PATCHED])
      return

    const originalGetList = findPropertyDescriptor(prototype, 'getList')?.value
    const originalChangePage = findPropertyDescriptor(prototype, 'handleChangePage')?.value
    const paginationItems = findPropertyDescriptor(prototype, 'paginationItems')?.get
    if (typeof originalGetList !== 'function'
      || typeof originalChangePage !== 'function'
      || typeof paginationItems !== 'function') {
      Object.defineProperty(prototype, PAGINATION_PATCHED, {
        configurable: true,
        value: true,
      })
      return
    }

    Object.defineProperty(prototype, 'getList', {
      configurable: true,
      writable: true,
      value(this: any, ...args: any[]) {
        if (!isEnabled()) {
          clear(this, true)
          return Reflect.apply(originalGetList, this, args)
        }

        const state = getState(this)
        if (state.loading)
          return state.loading

        state.suppressInvalidatedResultRestore = false
        state.collapsedList = undefined
        const invisibleRpids = getInvisibleRpids(this)
        if (invisibleRpids.size > 0) {
          state.pages.forEach((replies, page) => {
            state.pages.set(page, replies.filter((reply: unknown) => !invisibleRpids.has(adapter.getRpid(reply) ?? '')))
          })
          if (state.mergedList)
            state.mergedList = state.mergedList.filter(reply => !invisibleRpids.has(adapter.getRpid(reply) ?? ''))
        }

        const currentList = Array.isArray(this.list)
          ? this.list.filter((reply: unknown) => !invisibleRpids.has(adapter.getRpid(reply) ?? ''))
          : []
        const pending = {
          beforeList: mergeLists(state.mergedList ?? [], currentList),
          layoutReservation: state.expandAllLoading ? undefined : reserveLayoutHeight(this),
          page: Number(this.currentPage) || 1,
        }
        state.mergedList = pending.beforeList
        state.pending = pending

        let result: unknown
        try {
          result = Reflect.apply(originalGetList, this, args)
        }
        catch (error) {
          if (state.pending === pending) {
            releaseLayoutReservation(pending.layoutReservation)
            state.pending = undefined
          }
          throw error
        }

        const request = Promise.resolve(result).then((value) => {
          const currentState = states.get(this)
          if (currentState !== state || state.identity !== getIdentity(this)) {
            if (state.pending === pending) {
              releaseLayoutReservation(pending.layoutReservation)
              state.pending = undefined
              state.loading = undefined
            }
            if (currentState?.identity === getIdentity(this)) {
              this.list = currentState.mergedList
                ?? currentState.pending?.beforeList
                ?? currentState.collapsedList
                ?? currentState.initialList
              this.requestUpdate?.()
            }
            updateExpandAllButton(this)
            return value
          }

          if (state.pending === pending) {
            state.pending = undefined
            state.loading = undefined

            if (isEnabled()
              && states.get(this) === state
              && state.identity === getIdentity(this)
              && Array.isArray(this.list)) {
              const latestInvisibleRpids = getInvisibleRpids(this)
              const retainedBeforeList = pending.beforeList
                .filter((reply: unknown) => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? ''))
              const loadedList = this.list
                .filter((reply: unknown) => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? ''))
              applyInteractionOverrides(state, retainedBeforeList)
              applyInteractionOverrides(state, loadedList)
              const newPage = getNewPage(retainedBeforeList, loadedList)
              state.pages.forEach((replies, page) => {
                state.pages.set(page, replies.filter(reply => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? '')))
              })
              state.pages.set(pending.page, loadedList)
              state.currentPage = pending.page
              state.allRepliesExpanded = hasLoadedEveryPage(state, Number(this.totalPage) || 0)
              state.mergedList = mergeLists(retainedBeforeList, newPage)
              this.list = state.mergedList
              if (state.expandAllLoading) {
                releaseLayoutReservation(pending.layoutReservation)
                this.requestUpdate?.()
              }
              else {
                scheduleTreeUpdate(this, pending.layoutReservation)
              }
            }
            else {
              releaseLayoutReservation(pending.layoutReservation)
            }
          }
          else if (states.get(this) === state && state.identity === getIdentity(this)) {
            if (state.suppressInvalidatedResultRestore && state.collapsedList) {
              this.list = state.collapsedList
              this.requestUpdate?.()
            }
            else if (!state.pending && !state.loading && state.mergedList) {
              this.list = state.mergedList
              scheduleTreeUpdate(this)
            }
          }
          updateExpandAllButton(this)
          return value
        }, (error) => {
          if (state.pending === pending) {
            releaseLayoutReservation(pending.layoutReservation)
            state.pending = undefined
            state.loading = undefined
          }
          updateExpandAllButton(this)
          throw error
        })
        state.loading = request
        updateExpandAllButton(this)
        return request
      },
    })

    Object.defineProperty(prototype, 'handleChangePage', {
      configurable: true,
      writable: true,
      value(this: any, ...args: any[]) {
        if (!isEnabled())
          return Reflect.apply(originalChangePage, this, args)
        const state = getState(this)
        if (state.loading)
          return state.loading

        const currentPage = Number(this.currentPage) || 1
        if (!state.pages.has(currentPage) && Array.isArray(this.list) && this.list !== state.mergedList) {
          const currentList = this.list.slice()
          applyInteractionOverrides(state, currentList)
          state.pages.set(currentPage, currentList)
          state.currentPage = currentPage
        }
        return Reflect.apply(originalChangePage, this, args)
      },
    })

    Object.defineProperty(prototype, 'paginationItems', {
      configurable: true,
      get(this: any) {
        const items = Reflect.apply(paginationItems, this, [])
        if (!isEnabled() || this.showPagination !== true || !Array.isArray(items))
          return items

        const state = getState(this)
        const currentPage = Number(this.currentPage) || 1
        const labels = adapter.getLabels()
        if (state.expandAllLoading || state.allRepliesExpanded)
          return []
        if (state.loading)
          return [{ clickable: false, idx: currentPage, text: labels.loading }]
        const hasNext = currentPage < (Number(this.totalPage) || 0)
          && items.some(item => Number(item?.idx) === currentPage && item?.clickable !== false)
        return [{
          clickable: hasNext,
          idx: currentPage,
          text: hasNext ? labels.loadMore : labels.noMore,
        }]
      },
    })

    const originalRevert = findPropertyDescriptor(prototype, 'handleRevert')?.value
    if (typeof originalRevert === 'function') {
      Object.defineProperty(prototype, 'handleRevert', {
        configurable: true,
        writable: true,
        value(this: any, ...args: any[]) {
          const cleanup = (captureCollapsedList: boolean) => {
            suspendForNativeCollapse(this, captureCollapsedList)
            adapter.onNativeCollapse?.(this)
          }
          cleanup(false)
          let result: unknown
          try {
            result = Reflect.apply(originalRevert, this, args)
          }
          catch (error) {
            cleanup(true)
            throw error
          }
          cleanup(true)
          return result
        },
      })
    }

    Object.defineProperty(prototype, PAGINATION_PATCHED, {
      configurable: true,
      value: true,
    })
  }

  function sync(renderer: any) {
    const enabled = isEnabled()
    if (enabledStates.get(renderer) !== enabled) {
      enabledStates.set(renderer, enabled)
      renderer.requestUpdate?.()
    }
    if (!enabled) {
      clear(renderer, true)
    }
    else {
      getState(renderer)
      updateExpandAllButton(renderer)
    }
  }

  return {
    clear,
    dispose(renderer: any) {
      enabledStates.delete(renderer)
      clear(renderer, false)
    },
    invalidateLoading,
    patchPrototype,
    recordInteraction,
    suspendForNativeCollapse,
    sync,
  }
}
