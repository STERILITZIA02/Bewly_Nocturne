export type PaginationPhase = 'ready' | 'complete' | 'stalled'

export interface PaginationState {
  pagination: PaginationPhase
  readonly noMore: boolean
  readonly paginationStalled: boolean
}

/** The UI flags are projections: exhaustion and a stalled cursor cannot coexist. */
export function withPaginationState<T extends object>(state: T): T & PaginationState {
  const pagination: PaginationState = {
    pagination: 'ready',
    get noMore() { return this.pagination === 'complete' },
    get paginationStalled() { return this.pagination === 'stalled' },
  }
  return Object.defineProperties(state, Object.getOwnPropertyDescriptors(pagination)) as T & PaginationState
}

export function resolvePaginationPhase(noMore: boolean, progressed = true): PaginationPhase {
  return noMore ? 'complete' : progressed ? 'ready' : 'stalled'
}
