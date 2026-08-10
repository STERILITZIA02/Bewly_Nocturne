export type CommentReplyPaginationMode = 'loadMore' | 'pagination'

interface PaginationLabels {
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
  currentPage: number
  identity: string
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

  function clear(renderer: any, restoreCurrentPage: boolean) {
    const state = states.get(renderer)
    if (!state)
      return

    const currentPage = state.pages.get(state.currentPage)
    if (restoreCurrentPage && state.mergedList && renderer.list === state.mergedList && currentPage) {
      renderer.list = currentPage.slice()
      renderer.requestUpdate?.()
    }

    releaseLayoutReservation(state.pending?.layoutReservation)
    state.loading = undefined
    state.pending = undefined
    state.pages.clear()
    states.delete(renderer)
    renderer.requestUpdate?.()
  }

  function mergeLists(...lists: any[][]): any[] {
    const merged: any[] = []
    const seenRpids = new Set<string>()
    const seenReplies = new Set<any>()
    lists.forEach((list) => {
      list.forEach((reply) => {
        const rpid = adapter.getRpid(reply)
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

  function invalidateLoading(renderer: any) {
    const state = states.get(renderer)
    if (!state || (!state.pending && !state.loading))
      return

    releaseLayoutReservation(state.pending?.layoutReservation)
    if (!state.mergedList && state.pages.size > 0)
      state.mergedList = mergePages(state)
    if (state.mergedList)
      renderer.list = state.mergedList
    state.pending = undefined
    state.loading = undefined
    renderer.requestUpdate?.()
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
      currentPage: Number(renderer.currentPage) || 1,
      identity,
      pages: new Map(),
    }
    states.set(renderer, state)
    return state
  }

  function mergePages(state: PaginationState): any[] {
    return mergeLists(...[...state.pages.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, replies]) => replies))
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
            state.pages.set(page, replies.filter(reply => !invisibleRpids.has(adapter.getRpid(reply) ?? '')))
          })
          if (state.mergedList)
            state.mergedList = state.mergedList.filter(reply => !invisibleRpids.has(adapter.getRpid(reply) ?? ''))
        }

        const currentList = Array.isArray(this.list)
          ? this.list.filter(reply => !invisibleRpids.has(adapter.getRpid(reply) ?? ''))
          : []
        const pending = {
          beforeList: mergeLists(state.mergedList ?? [], currentList),
          layoutReservation: reserveLayoutHeight(this),
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
          if (state.pending === pending) {
            state.pending = undefined
            state.loading = undefined

            if (isEnabled()
              && states.get(this) === state
              && state.identity === getIdentity(this)
              && Array.isArray(this.list)) {
              const latestInvisibleRpids = getInvisibleRpids(this)
              const retainedBeforeList = pending.beforeList
                .filter(reply => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? ''))
              const loadedList = this.list
                .filter(reply => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? ''))
              const newPage = getNewPage(retainedBeforeList, loadedList)
              state.pages.forEach((replies, page) => {
                state.pages.set(page, replies.filter(reply => !latestInvisibleRpids.has(adapter.getRpid(reply) ?? '')))
              })
              state.pages.set(pending.page, loadedList)
              state.currentPage = pending.page
              state.mergedList = mergeLists(retainedBeforeList, newPage)
              this.list = state.mergedList
              scheduleTreeUpdate(this, pending.layoutReservation)
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
          return value
        }, (error) => {
          if (state.pending === pending) {
            releaseLayoutReservation(pending.layoutReservation)
            state.pending = undefined
            state.loading = undefined
          }
          throw error
        })
        state.loading = request
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
          state.pages.set(currentPage, this.list.slice())
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
        if (state.loading)
          return [{ clickable: false, idx: currentPage, text: labels.loading }]
        const hasNext = items.some(item => Number(item?.idx) === currentPage && item?.clickable !== false)
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
    if (!enabled)
      clear(renderer, true)
    else
      getState(renderer)
  }

  return {
    clear,
    invalidateLoading,
    patchPrototype,
    suspendForNativeCollapse,
    sync,
  }
}
