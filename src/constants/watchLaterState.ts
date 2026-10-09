export const WATCH_LATER_STATE_UPDATED = 'watchLaterState:updated'

export interface WatchLaterEntry {
  aid: number
  bvid?: string
  epid?: number
}

export interface WatchLaterSnapshot {
  accountId: number
  epoch: string
  revision: number
  entries: WatchLaterEntry[]
  complete: boolean
  count: number | null
  updatedAt: number
  countUpdatedAt: number
}

export type WatchLaterChange
  = | { type: 'add' | 'remove', entry: WatchLaterEntry }
    | { type: 'clear' }
    | { type: 'invalidate' }

export type WatchLaterUpdate
  = | { type: 'snapshot', snapshot: WatchLaterSnapshot }
    | {
      type: 'change'
      accountId: number
      epoch: string
      baseRevision: number
      revision: number
      operationId: string
      change: WatchLaterChange
      count: number | null
      complete: boolean
    }
