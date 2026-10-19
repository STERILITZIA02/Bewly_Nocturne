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

/**
 * A count read from a client that already holds the member list of this epoch
 * at or after the revision the list last changed: the list is not resent.
 */
export interface WatchLaterCountReply extends Omit<WatchLaterSnapshot, 'entries'> {
  entries?: WatchLaterEntry[]
  entriesOmitted?: true
}

export type WatchLaterChange
  = | { type: 'add' | 'remove', entry: WatchLaterEntry }
    | { type: 'clear' }
    | { type: 'invalidate' }

export type WatchLaterUpdate
  = | { type: 'snapshot', snapshot: WatchLaterSnapshot }
  /** A count read: list fields stay with the consumer's base revision unless dropped. */
    | {
      type: 'count'
      accountId: number
      epoch: string
      baseRevision: number
      revision: number
      count: number
      countUpdatedAt: number
      complete: boolean
      updatedAt: number
      /** The count no longer matches the known members; the list must be read again. */
      entriesDropped: boolean
    }
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
