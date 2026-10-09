import { computed, shallowRef } from 'vue'

import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'
import type { WatchLaterEntry, WatchLaterSnapshot, WatchLaterUpdate } from '~/constants/watchLaterState'
import { WATCH_LATER_STATE_UPDATED } from '~/constants/watchLaterState'
import { parseDedeUserID } from '~/logic/loginStatus'
import api from '~/utils/api'
import { isExtensionContextInvalidatedError, onMessage, reportRuntimeFailure } from '~/utils/messaging'
import type { WatchLaterTarget } from '~/utils/watchLaterSnapshot'
import { applyWatchLaterChange } from '~/utils/watchLaterSnapshot'

const snapshot = shallowRef<WatchLaterSnapshot>()
const lastUpdate = shallowRef<WatchLaterUpdate>()
let accountId: number | undefined
let generation = 0
let contextInvalidated = false
let pendingMembers: Promise<boolean> | undefined
let pendingCount: Promise<boolean> | undefined
let membershipDemanded = false
let projectionInvalidation = 0
let retryAt = 0
let indexSource: WatchLaterSnapshot | undefined
let index = { aid: new Map<number, WatchLaterEntry>(), bvid: new Map<string, WatchLaterEntry>(), epid: new Map<number, WatchLaterEntry>() }
let bvidIndexComplete = false
let episodeIndexComplete = false
const MAX_AGE = 5 * 60_000

function currentAccount() {
  return parseDedeUserID(document.cookie)
}

function syncAccount() {
  const current = currentAccount()
  if (current !== accountId) {
    accountId = current
    generation++
    snapshot.value = undefined
    lastUpdate.value = undefined
    pendingMembers = undefined
    pendingCount = undefined
    membershipDemanded = false
    retryAt = 0
    projectionInvalidation++
  }
  return current
}

function recoverProjection() {
  projectionInvalidation++
  const previous = snapshot.value
  if (previous)
    snapshot.value = applyWatchLaterChange(previous, { type: 'invalidate' })
  if (!document.hidden)
    void read(membershipDemanded, false).catch(() => {})
}

function acceptSnapshot(value: WatchLaterSnapshot, handshake = false) {
  if (value.accountId !== syncAccount())
    return false
  const previous = snapshot.value
  if (previous && ((!handshake && value.epoch !== previous.epoch)
    || (value.epoch === previous.epoch && value.revision < previous.revision))) {
    return false
  }
  snapshot.value = value
  return true
}

export function applyWatchLaterUpdate(update: WatchLaterUpdate) {
  if (contextInvalidated)
    return
  if (update.type === 'snapshot') {
    if (acceptSnapshot(update.snapshot))
      lastUpdate.value = update
    else if (update.snapshot.accountId === accountId && update.snapshot.epoch !== snapshot.value?.epoch)
      recoverProjection()
    return
  }
  if (update.accountId !== syncAccount())
    return
  const previous = snapshot.value
  if (previous && update.epoch === previous.epoch && update.revision <= previous.revision)
    return
  if (!previous || update.epoch !== previous.epoch || update.baseRevision !== previous.revision) {
    // A gap/worker epoch is recovered from the owner, never guessed by applying
    // an unordered delta to a different base. Hidden tabs only become dirty.
    recoverProjection()
    return
  }
  snapshot.value = {
    ...applyWatchLaterChange(previous, update.change),
    revision: update.revision,
    count: update.count,
    complete: update.complete,
  }
  lastUpdate.value = update
  if (update.change.type === 'invalidate' && membershipDemanded && !document.hidden)
    void ensureWatchLaterState().catch(() => {})
}

async function read(full: boolean, force: boolean) {
  const id = syncAccount()
  if (!id || contextInvalidated)
    return false
  if (!force && Date.now() < retryAt)
    return false
  const pending = full ? pendingMembers : pendingCount
  if (pending)
    return pending
  const existing = snapshot.value
  if (!force && existing && Date.now() - (full ? existing.updatedAt : existing.countUpdatedAt) < MAX_AGE
    && (full ? existing.complete : existing.count !== null)) {
    return true
  }
  const version = generation
  const invalidation = projectionInvalidation
  const task = Promise.resolve().then(async () => {
    try {
      const result = await (full ? api.watchlater.getWatchLaterState : api.watchlater.getWatchLaterCount)({ accountId: id, force })
      if (version !== generation || currentAccount() !== id || result.code !== 0 || invalidation !== projectionInvalidation)
        return false
      const accepted = acceptSnapshot(result.data, true)
      retryAt = 0
      if (accepted)
        lastUpdate.value = { type: 'snapshot', snapshot: result.data }
      return accepted && (full ? result.data.complete : result.data.count !== null)
    }
    catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        contextInvalidated = true
        throw error
      }
      if (version !== generation || currentAccount() !== id || invalidation !== projectionInvalidation)
        return false
      retryAt = Date.now() + 5_000
      reportRuntimeFailure('Failed to read Watch Later state', error)
      return false
    }
    finally {
      if (full && pendingMembers === task)
        pendingMembers = undefined
      if (!full && pendingCount === task)
        pendingCount = undefined
      if (version === generation && invalidation !== projectionInvalidation && !document.hidden && !contextInvalidated)
        void read(membershipDemanded, false).catch(() => {})
    }
  })
  if (full)
    pendingMembers = task
  else
    pendingCount = task
  return task
}

export function ensureWatchLaterState(force = false) {
  syncAccount()
  membershipDemanded = true
  return read(true, force)
}
export function ensureWatchLaterCount(force = false) {
  return read(false, force)
}

export function findWatchLaterEntry(target: WatchLaterTarget): WatchLaterEntry | undefined {
  const value = snapshot.value
  if (!value)
    return
  if (indexSource !== value) {
    index = { aid: new Map(), bvid: new Map(), epid: new Map() }
    bvidIndexComplete = true
    episodeIndexComplete = true
    for (const entry of value.entries) {
      index.aid.set(entry.aid, entry)
      if (entry.bvid)
        index.bvid.set(entry.bvid, entry)
      else bvidIndexComplete = false
      if (entry.epid)
        index.epid.set(entry.epid, entry)
      else episodeIndexComplete = false
    }
    indexSource = value
  }
  return index.aid.get(Number(target.aid))
    ?? (target.bvid ? index.bvid.get(`BV${target.bvid.slice(2)}`) : undefined)
    ?? (target.epid ? index.epid.get(target.epid) : undefined)
}

export function isInWatchLater(target: WatchLaterTarget): boolean | undefined {
  if (findWatchLaterEntry(target))
    return true
  if (!snapshot.value?.complete)
    return undefined
  if (Number.isSafeInteger(Number(target.aid)) && Number(target.aid) > 0)
    return false
  if (target.bvid && bvidIndexComplete)
    return false
  if (target.epid && episodeIndexComplete)
    return false
  return undefined
}

export const watchLaterState = computed(() => snapshot.value)
export const watchLaterUpdate = computed(() => lastUpdate.value)

onMessage<WatchLaterUpdate>(WATCH_LATER_STATE_UPDATED, applyWatchLaterUpdate)
onMessage(TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED, syncAccount)
