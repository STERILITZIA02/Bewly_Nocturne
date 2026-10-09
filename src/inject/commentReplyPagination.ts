import { COMMENT_REPLY_BATCH_DEFAULT, normalizeCommentReplyBatch } from '~/constants/commentReading'
import { BEWLY_IFRAME_DRAWER_HOST_CHANGE } from '~/constants/globalEvents'
import { captureCommentReadingAnchor } from '~/utils/commentReadingAnchor'
import type { CommentReplyPage, CommentReplyPageIdentity } from '~/utils/commentReplyPageCache'
import { COMMENT_REPLY_CACHE_LIMITS, commentReplyPageKey, commentReplyWriteKey, createCommentReplyPageCache } from '~/utils/commentReplyPageCache'
import { isIframeDrawerHost } from '~/utils/iframeDrawerHost'

import { COMMENT_REPLY_PAGE_CONTROL_CLASS as PAGE_CONTROL_CLASS, removeCommentReplyPageControl, updateCommentReplyPageControl } from './commentReplyControls'

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
  page?: string
  go?: string
  failed?: string
  retry?: string
}

export interface CommentReplyPaginationAdapter {
  getAccountId: () => string
  getContextId?: () => string
  getBatchPages?: () => number
  readPage?: (identity: CommentReplyPageIdentity, page: number, signal: AbortSignal) => Promise<CommentReplyPage<any>>
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
  readIdentity?: CommentReplyPageIdentity
  mode: CommentReplyPaginationMode
  replaceRequested?: boolean
  error?: string
  failedPage?: number
  failedReplace?: boolean
  anchor?: ReturnType<typeof captureCommentReadingAnchor>
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
    controller: AbortController
    replace: boolean
    anchor?: ReturnType<typeof captureCommentReadingAnchor>
  }
}

export interface SequentialCommentReplyPageLoader {
  getCurrentPage: () => number
  getTotalPage: () => number
  isValid: () => boolean
  loadNextPage: (currentPage: number) => Promise<unknown>
  maxPages?: number
}

export interface SequentialCommentReplyPageResult {
  completed: boolean
  lastPage: number
  reason: 'completed' | 'invalid' | 'no-progress' | 'budget'
}

export async function loadCommentReplyPagesSequentially({
  getCurrentPage,
  getTotalPage,
  isValid,
  loadNextPage,
  maxPages = COMMENT_REPLY_BATCH_DEFAULT,
}: SequentialCommentReplyPageLoader): Promise<SequentialCommentReplyPageResult> {
  let currentPage = getCurrentPage()
  let totalPage = getTotalPage()
  if (!isValid() || !Number.isFinite(currentPage) || !Number.isFinite(totalPage) || totalPage < 1) {
    return { completed: false, lastPage: currentPage, reason: 'invalid' }
  }

  let requested = 0
  while (currentPage < totalPage && requested < maxPages) {
    if (!isValid())
      return { completed: false, lastPage: currentPage, reason: 'invalid' }

    const previousPage = currentPage
    requested++
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

  return { completed: currentPage >= totalPage, lastPage: currentPage, reason: currentPage >= totalPage ? 'completed' : 'budget' }
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
  const pageCache = createCommentReplyPageCache<any>()
  const activeRenderers = new Set<any>()
  let scopeGeneration = 0
  const readingRenderers = new Set<any>()
  let readRoute = ''
  const routeEvents = ['pushstate', 'replacestate', 'popstate', 'hashchange'] as const

  const isEnabled = () => adapter.isTreeEnabled()
  const canHandle = (renderer: any) => isEnabled() && (!adapter.readPage || getReadIdentity(renderer) !== undefined)
  const batchPages = () => normalizeCommentReplyBatch(adapter.getBatchPages?.())

  function stopInactiveReads() {
    if (!document.hidden && !isIframeDrawerHost())
      return
    for (const renderer of [...readingRenderers])
      invalidateLoading(renderer)
  }
  function suspendReads() {
    for (const renderer of [...readingRenderers])
      invalidateLoading(renderer)
  }
  function routeIdentity() {
    const url = new URL(window.location.href)
    return JSON.stringify([url.origin, url.pathname, url.searchParams.get('p'), url.searchParams.get('page')])
  }
  function checkReadRoute() {
    // The existing MAIN history bridge notifies before history has committed.
    // Tracking-parameter cleanup is not a new reading context.
    queueMicrotask(() => {
      if (readingRenderers.size && routeIdentity() !== readRoute)
        suspendReads()
    })
  }
  function beginRead(renderer: any) {
    if (readingRenderers.size === 0) {
      readRoute = routeIdentity()
      document.addEventListener('visibilitychange', stopInactiveReads)
      window.addEventListener(BEWLY_IFRAME_DRAWER_HOST_CHANGE, stopInactiveReads)
      window.addEventListener('pagehide', suspendReads)
      routeEvents.forEach(name => window.addEventListener(name, checkReadRoute))
    }
    readingRenderers.add(renderer)
  }
  function endRead(renderer: any) {
    const state = states.get(renderer)
    if (state?.pending || state?.loading)
      return
    readingRenderers.delete(renderer)
    if (readingRenderers.size === 0) {
      document.removeEventListener('visibilitychange', stopInactiveReads)
      window.removeEventListener(BEWLY_IFRAME_DRAWER_HOST_CHANGE, stopInactiveReads)
      window.removeEventListener('pagehide', suspendReads)
      routeEvents.forEach(name => window.removeEventListener(name, checkReadRoute))
    }
  }

  function getReadIdentity(renderer: any): CommentReplyPageIdentity | undefined {
    const data = adapter.getData(renderer) ?? {}
    const oid = String(renderer.oid ?? adapter.getOid(data) ?? '')
    const root = String(renderer.root ?? adapter.getRpid(data) ?? adapter.getRootRpid(data) ?? '')
    const type = Number(renderer.type ?? data.type)
    const sort = Number(renderer.mode ?? data.mode ?? 0)
    const pageSize = Number(renderer.pageSize)
    if (!/^[1-9]\d*$/.test(oid) || !/^[1-9]\d*$/.test(root) || !Number.isSafeInteger(type) || type < 1 || type > 99
      || !Number.isSafeInteger(sort) || sort < 0 || sort > 3 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return
    }
    return { account: adapter.getAccountId(), context: adapter.getContextId?.() ?? 'document', oid, root, type, sort, pageSize }
  }

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
    if (!reservation)
      return
    requestAnimationFrame(() => requestAnimationFrame(() => releaseLayoutReservation(reservation)))
  }

  function getIdentity(renderer: any): string {
    const readIdentity = getReadIdentity(renderer)
    if (readIdentity)
      return `${scopeGeneration}|${commentReplyPageKey(readIdentity)}`
    const data = adapter.getData(renderer) ?? {}
    const oid = String(renderer.oid ?? adapter.getOid(data) ?? '')
    const type = String(renderer.type ?? data.type ?? data.business ?? '')
    const root = String(renderer.root ?? adapter.getRpid(data) ?? adapter.getRootRpid(data) ?? '')
    return `${scopeGeneration}|${adapter.getAccountId()}|${oid}|${type}|${root}`
  }

  function removeExpandAllButton(renderer: any) {
    const root = renderer?.shadowRoot as ShadowRoot | null | undefined
    root?.querySelector<HTMLElement>(`.${EXPAND_ALL_BUTTON_CLASS}`)?.remove()
    if (renderer instanceof HTMLElement)
      removeCommentReplyPageControl(renderer)
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
    state.pending?.controller.abort()
    state.pending?.anchor?.cancel()
    state.anchor?.cancel()
    state.anchor = undefined
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
    activeRenderers.delete(renderer)
    endRead(renderer)
    removeExpandAllButton(renderer)
    renderer.requestUpdate?.()
  }

  function mergeLists(...lists: any[][]): any[] {
    return mergeCommentReplyLists(lists, adapter.getRpid)
  }

  function trimVisiblePages(state: PaginationState) {
    let size = [...state.pages.values()].reduce((sum, page) => sum + page.length, 0)
    while (state.pages.size > COMMENT_REPLY_CACHE_LIMITS.pages || size > COMMENT_REPLY_CACHE_LIMITS.items) {
      const oldest = state.pages.entries().next().value
      if (!oldest)
        break
      size -= oldest[1].length
      state.pages.delete(oldest[0])
    }
    const retained = new Set([...state.pages.values()].flatMap(page => page.map(adapter.getRpid)).filter(Boolean))
    for (const key of state.interactionByRpid.keys()) {
      if (!retained.has(key))
        state.interactionByRpid.delete(key)
    }
  }

  function requestPage(renderer: any, page: number, replace = true) {
    if (!canHandle(renderer) || renderer.isConnected === false || !Number.isSafeInteger(page) || page < 1 || page > Number(renderer.totalPage))
      return Promise.resolve()
    invalidateLoading(renderer)
    const state = getState(renderer)
    state.replaceRequested = replace
    renderer.currentPage = page
    return Promise.resolve(renderer.getList())
  }

  function updatePageControl(renderer: any) {
    if (!(renderer instanceof HTMLElement))
      return
    if (!canHandle(renderer) || (renderer as any).showPagination !== true || !renderer.isConnected) {
      removeCommentReplyPageControl(renderer)
      return
    }
    const state = getState(renderer)
    updateCommentReplyPageControl(renderer, {
      enabled: canHandle(renderer) && (renderer as any).showPagination === true,
      page: state.pending?.page ?? state.currentPage,
      total: Number((renderer as any).totalPage),
      pages: [...state.pages.keys()],
      loading: !!state.loading,
      failed: !!state.error,
      labels: adapter.getLabels(),
      navigate: page => void requestPage(renderer, page),
      retry: () => {
        const state = states.get(renderer)
        if (state?.failedPage)
          void requestPage(renderer, state.failedPage, state.failedReplace)
      },
    })
  }

  function invalidateLoading(renderer: any) {
    const state = states.get(renderer)
    if (!state)
      return

    state.expandAllOperation = undefined
    state.pending?.controller.abort()
    state.pending?.anchor?.cancel()
    state.anchor?.cancel()
    state.anchor = undefined
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
    renderer.currentPage = state.currentPage
    renderer.showSpinner = false
    endRead(renderer)
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
    // Visited pages belong to the bounded shared cache, not every collapsed
    // renderer that the native feed may retain in its DOM.
    state.pages.clear()
    state.mergedList = undefined
    state.interactionByRpid.clear()
    activeRenderers.delete(renderer)
  }

  function getState(renderer: any): PaginationState {
    const identity = getIdentity(renderer)
    const existing = states.get(renderer)
    if (existing?.identity === identity) {
      if (renderer.showPagination === true || renderer.showViewMore === false)
        activeRenderers.add(renderer)
      return existing
    }
    if (existing)
      clear(renderer, false)

    const state: PaginationState = {
      allRepliesExpanded: false,
      currentPage: Number(renderer.currentPage) || 1,
      expandAllLoading: false,
      identity,
      readIdentity: getReadIdentity(renderer),
      mode: adapter.getMode(),
      initialList: Array.isArray(renderer.list) ? renderer.list.slice() : [],
      interactionByRpid: new Map(),
      pages: new Map(),
    }
    states.set(renderer, state)
    if (renderer.showPagination === true || renderer.showViewMore === false)
      activeRenderers.add(renderer)
    return state
  }

  function isExpandAllOperationValid(renderer: any, state: PaginationState, operation: symbol) {
    return canHandle(renderer)
      && !document.hidden && !isIframeDrawerHost()
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
    if (!canHandle(renderer) || renderer.isConnected === false || adapter.getMode() !== 'loadMore' || adapter.shouldShowExpandAll?.(renderer) === false) {
      existing?.remove()
      return
    }

    const state = getState(renderer)
    const totalPage = Number(renderer.totalPage) || 0
    state.allRepliesExpanded = state.currentPage >= totalPage
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

    const openedPreview = renderer.showPagination !== true
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
      if (!isExpandAllOperationValid(renderer, state, operation))
        return

      const result = await loadCommentReplyPagesSequentially({
        getCurrentPage: () => Number(renderer.currentPage) || 1,
        getTotalPage: () => Number(renderer.totalPage) || 0,
        isValid: () => isExpandAllOperationValid(renderer, state, operation),
        loadNextPage: loadPage,
        maxPages: Math.max(0, batchPages() - (openedPreview ? 1 : 0)),
      })

      if (isExpandAllOperationValid(renderer, state, operation))
        state.allRepliesExpanded = result.completed
    })().catch((error) => {
      console.error('[Bewly Nocturne] Failed to expand all comment replies:', error)
    }).finally(() => {
      if (expandAllTasks.get(renderer) === request)
        expandAllTasks.delete(renderer)
      if (states.get(renderer) !== state || state.identity !== identity || state.expandAllOperation !== operation) {
        if (states.get(renderer) === state && state.expandAllPromise === request) {
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
    const previous = state.interactionByRpid.get(rpid)
    if (previous?.action === nextInteraction.action && previous?.like === nextInteraction.like)
      return

    state.interactionByRpid.set(rpid, nextInteraction)
    if (state.readIdentity)
      pageCache.update(state.readIdentity, rpid, reply => adapter.getRpid(reply) === rpid ? { ...reply, ...nextInteraction } : reply)
    const updateList = (list: any[] | undefined) => list?.map((reply) => {
      if (adapter.getRpid(reply) !== rpid || Object.entries(nextInteraction).every(([key, value]) => reply[key] === value))
        return reply
      return { ...reply, ...nextInteraction }
    })
    renderer.list = updateList(renderer.list)
    if (Array.isArray(renderer.cacheList))
      renderer.cacheList = updateList(renderer.cacheList)
    if (Array.isArray(renderer.newItems))
      renderer.newItems = updateList(renderer.newItems)
    state.initialList = updateList(state.initialList)!
    state.mergedList = updateList(state.mergedList)
    state.collapsedList = updateList(state.collapsedList)
    if (state.pending)
      state.pending.beforeList = updateList(state.pending.beforeList)!
    state.pages.forEach((replies, page) => state.pages.set(page, updateList(replies)!))
    renderer.requestUpdate?.()
  }

  function patchPrototype(classConstructor: unknown) {
    if (typeof classConstructor !== 'function')
      return
    const prototype = classConstructor.prototype as Record<PropertyKey, unknown> | undefined
    if (!prototype || prototype[PAGINATION_PATCHED] || !Object.isExtensible(prototype))
      return
    if (['getList', 'handleChangePage', 'paginationItems'].some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key)
      return descriptor && !descriptor.configurable
    })) {
      return
    }

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
        if (!canHandle(this)) {
          clear(this, true)
          return Reflect.apply(originalGetList, this, args)
        }
        if (document.hidden || isIframeDrawerHost()) {
          invalidateLoading(this)
          return Promise.resolve()
        }

        const state = getState(this)
        if (state.loading && state.pending?.page === Number(this.currentPage) && !state.replaceRequested)
          return state.loading
        if (state.loading) {
          const requestedPage = this.currentPage
          invalidateLoading(this)
          this.currentPage = requestedPage
        }

        state.suppressInvalidatedResultRestore = false
        state.collapsedList = undefined
        state.error = undefined
        state.failedPage = undefined
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
          controller: new AbortController(),
          replace: state.replaceRequested === true || adapter.getMode() === 'pagination' || state.pages.size === 0,
          anchor: undefined as ReturnType<typeof captureCommentReadingAnchor> | undefined,
        }
        state.replaceRequested = false
        // The native first expansion/deep link still owns its initial scroll.
        if (this instanceof HTMLElement && state.pages.size > 0) {
          state.anchor?.cancel()
          const anchor = pending.replace ? this.shadowRoot?.querySelector<HTMLElement>(`.${PAGE_CONTROL_CLASS}, #pagination-head`) ?? this : this
          const inner = this.shadowRoot?.querySelector<HTMLElement>('[data-bewly-reply-reading-scroll]') ?? undefined
          pending.anchor = captureCommentReadingAnchor(anchor, inner, pending.controller.signal)
          state.anchor = pending.anchor
        }
        state.mergedList = pending.beforeList
        state.pending = pending
        beginRead(this)

        let result: unknown
        try {
          if (adapter.readPage && state.readIdentity) {
            this.showSpinner = true
            const identity = state.readIdentity
            result = pageCache.read(identity, pending.page, signal => adapter.readPage!(identity, pending.page, signal), pending.controller.signal).then((page) => {
              if (state.pending !== pending || states.get(this) !== state || state.identity !== getIdentity(this) || pending.controller.signal.aborted)
                return
              if (page.page > Math.max(1, page.totalPages))
                throw new Error('Comment page is no longer available')
              this.list = page.items
              this.count = page.count
              this.totalPage = page.totalPages
              const received = new Set(page.items.map(adapter.getRpid))
              if (Array.isArray(this.newItems))
                this.newItems = this.newItems.filter((item: unknown) => !received.has(adapter.getRpid(item)))
            })
          }
          else {
            result = Reflect.apply(originalGetList, this, args)
          }
        }
        catch (error) {
          if (state.pending === pending) {
            releaseLayoutReservation(pending.layoutReservation)
            state.pending = undefined
            pending.anchor?.cancel()
            endRead(this)
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
              endRead(this)
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
              const loadedList = this.list
                .filter((reply: unknown) => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? ''))
              applyInteractionOverrides(state, loadedList)
              state.pages.forEach((replies, page) => {
                state.pages.set(page, replies.filter(reply => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? '')))
              })
              if (pending.replace)
                state.pages.clear()
              state.pages.delete(pending.page)
              state.pages.set(pending.page, loadedList)
              trimVisiblePages(state)
              state.currentPage = pending.page
              state.allRepliesExpanded = state.currentPage >= Number(this.totalPage)
              state.mergedList = mergePages(state)
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
          if (!state.pending)
            this.showSpinner = false
          updatePageControl(this)
          endRead(this)
          void pending.anchor?.restore(() => states.get(this) === state && state.identity === getIdentity(this) && !state.pending && state.anchor === pending.anchor)
            .finally(() => {
              if (state.anchor === pending.anchor)
                state.anchor = undefined
            })
          return value
        }, (error) => {
          if (state.pending === pending) {
            releaseLayoutReservation(pending.layoutReservation)
            state.pending = undefined
            state.loading = undefined
            this.showSpinner = false
            this.currentPage = state.currentPage
            if (!pending.controller.signal.aborted) {
              state.error = error instanceof Error ? error.message : 'failed'
              state.failedPage = pending.page
              state.failedReplace = pending.replace
            }
          }
          pending.anchor?.cancel()
          updateExpandAllButton(this)
          updatePageControl(this)
          this.requestUpdate?.()
          endRead(this)
        })
        state.loading = request
        updateExpandAllButton(this)
        updatePageControl(this)
        return request
      },
    })

    Object.defineProperty(prototype, 'handleChangePage', {
      configurable: true,
      writable: true,
      value(this: any, ...args: any[]) {
        if (!canHandle(this))
          return Reflect.apply(originalChangePage, this, args)
        const state = getState(this)
        if (adapter.getMode() === 'loadMore' && !state.expandAllLoading && !state.replaceRequested)
          return expandAllReplies(this)
        if (state.loading)
          invalidateLoading(this)

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
        if (!canHandle(this) || adapter.getMode() !== 'loadMore' || this.showPagination !== true || !Array.isArray(items))
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
    const enabled = canHandle(renderer)
    if (enabledStates.get(renderer) !== enabled) {
      enabledStates.set(renderer, enabled)
      renderer.requestUpdate?.()
    }
    if (!enabled) {
      clear(renderer, true)
    }
    else {
      const state = getState(renderer)
      if (state.mode !== adapter.getMode()) {
        invalidateLoading(renderer)
        state.mode = adapter.getMode()
        const currentPage = state.pages.get(state.currentPage)
        state.pages.clear()
        if (currentPage) {
          state.pages.set(state.currentPage, currentPage)
          state.mergedList = currentPage
          renderer.list = currentPage
        }
      }
      updateExpandAllButton(renderer)
      updatePageControl(renderer)
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
    suspendForNativeCollapse,
    sync,
    requestPage,
    getKnownReplies(renderer: any) {
      const identity = getReadIdentity(renderer)
      return identity ? pageCache.knownItems(identity) : []
    },
    getKnownRevision(renderer: any) {
      const identity = getReadIdentity(renderer)
      return identity ? pageCache.revision(identity) : 0
    },
    reset() {
      scopeGeneration++
      for (const renderer of [...activeRenderers])
        clear(renderer, false)
      pageCache.clear()
    },
    captureInteraction(renderer: any, rpid: string) {
      if (!canHandle(renderer))
        return
      const state = getState(renderer)
      const identity = state.readIdentity
      if (!identity || !rpid)
        return
      const generation = scopeGeneration
      const key = commentReplyWriteKey(identity)
      return (interaction: CommentReplyInteractionState) => {
        if (scopeGeneration !== generation || adapter.getAccountId() !== identity.account)
          return
        pageCache.update(identity, rpid, reply => adapter.getRpid(reply) === rpid ? { ...reply, ...interaction } : reply)
        if (states.get(renderer)?.readIdentity && commentReplyWriteKey(states.get(renderer)!.readIdentity!) === key)
          recordInteraction(renderer, rpid, interaction)
        for (const target of activeRenderers) {
          if (target === renderer)
            continue
          const current = states.get(target)
          if (current?.readIdentity && commentReplyWriteKey(current.readIdentity) === key)
            recordInteraction(target, rpid, interaction)
        }
      }
    },
  }
}
