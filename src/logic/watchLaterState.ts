import { computed, shallowRef } from 'vue'

import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'
import type { WatchLaterCountReply, WatchLaterEntry, WatchLaterSnapshot, WatchLaterUpdate } from '~/constants/watchLaterState'
import { WATCH_LATER_STATE_UPDATED } from '~/constants/watchLaterState'
import { parseDedeUserID } from '~/logic/loginStatus'
import api from '~/utils/api'
import { isExtensionContextInvalidatedError, onMessage, reportRuntimeFailure } from '~/utils/messaging'
import { followStateTopic } from '~/utils/stateConsumer'
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
let watchLaterReadGeneration = 0
let retryAt = 0
let indexSource: WatchLaterSnapshot['entries'] | undefined
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
    indexSource = undefined
    index = { aid: new Map(), bvid: new Map(), epid: new Map() }
    retryAt = 0
    watchLaterReadGeneration++
  }
  return current
}

function recoverProjection() {
  watchLaterReadGeneration++
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
  if (update.type === 'count') {
    if (!previous || update.epoch !== previous.epoch || update.baseRevision !== previous.revision) {
      recoverProjection()
      return
    }
    snapshot.value = {
      ...previous,
      revision: update.revision,
      count: update.count,
      countUpdatedAt: update.countUpdatedAt,
      complete: update.complete,
      updatedAt: update.updatedAt,
      entries: update.entriesDropped ? [] : previous.entries,
    }
    lastUpdate.value = update
    return
  }
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
  // This document now shows Watch Later state; while hidden it is only marked stale.
  followStateTopic('watchLater', recoverProjection)
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
  const invalidation = watchLaterReadGeneration
  const task = Promise.resolve().then(async () => {
    try {
      // A count read names the list this page holds, so an unchanged list is not resent.
      const known = !full && existing?.accountId === id ? { knownEpoch: existing.epoch, knownRevision: existing.revision } : {}
      const result = await (full ? api.watchlater.getWatchLaterState : api.watchlater.getWatchLaterCount)({ accountId: id, force, ...known })
      if (version !== generation || currentAccount() !== id || result.code !== 0 || invalidation !== watchLaterReadGeneration)
        return false
      const reply = result.data as WatchLaterCountReply
      const local = snapshot.value
      if (reply.entriesOmitted && (local?.epoch !== reply.epoch || local.revision < (known.knownRevision ?? Infinity)))
        return false
      const { entriesOmitted, entries, ...fields } = reply
      const data: WatchLaterSnapshot = { ...fields, entries: entriesOmitted ? local!.entries : entries ?? [] }
      const accepted = acceptSnapshot(data, true)
      retryAt = 0
      if (accepted)
        lastUpdate.value = { type: 'snapshot', snapshot: data }
      return accepted && (full ? data.complete : data.count !== null)
    }
    catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        contextInvalidated = true
        throw error
      }
      if (version !== generation || currentAccount() !== id || invalidation !== watchLaterReadGeneration)
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
      if (version === generation && invalidation !== watchLaterReadGeneration && !document.hidden && !contextInvalidated)
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

export function captureWatchLaterReadGeneration() {
  syncAccount()
  return watchLaterReadGeneration
}

/** Recheck the broker stamp at the UI commit, including gaps awaiting reconciliation. */
export function isWatchLaterReadCurrent(value: { accountId: number, epoch: string, revision: number } | undefined, generation: number): boolean {
  if (!value || value.accountId !== syncAccount() || generation !== watchLaterReadGeneration)
    return false
  const current = snapshot.value
  return !current || (value.epoch === current.epoch && value.revision >= current.revision)
}

export function findWatchLaterEntry(target: WatchLaterTarget): WatchLaterEntry | undefined {
  const value = snapshot.value
  if (!value)
    return
  if (indexSource !== value.entries) {
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
    indexSource = value.entries
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
