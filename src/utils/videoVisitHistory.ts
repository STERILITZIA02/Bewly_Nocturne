import { computed, shallowRef, watch } from 'vue'
import browser from 'webextension-polyfill'

import { settings, settingsReady } from '~/logic'
import { waitWithSignal, withRequestDeadline } from '~/utils/abort'
import { isExtensionContextInvalidatedError, onMessage, reportRuntimeFailure, sendMessage } from '~/utils/messaging'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'
import { parsePlaybackTabUrl } from '~/utils/playbackTab'
import { followStateTopic, unfollowStateTopic } from '~/utils/stateConsumer'
import type { VideoHistoryCommand, VideoHistoryEdit, VideoHistorySnapshot, VideoHistoryUpdate, VideoIdentity, VideoVisitHistory } from '~/utils/videoVisitRecord'
import { applyVideoHistoryEdits, createVideoHistoryIndex, mergeVideoVisitRecord, pruneVideoVisitHistory, VIDEO_VISIT_HISTORY_MESSAGE, VIDEO_VISIT_HISTORY_UPDATED, videoHistoryBaseKeys, videoHistoryPartKey } from '~/utils/videoVisitRecord'

export type { VideoIdentity } from '~/utils/videoVisitRecord'

const VIDEO_VISIT_HISTORY_STORAGE_KEY = 'bewlycat_video_visit_history'
const LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY = 'videoVisitHistory'
const VIDEO_VISIT_HISTORY_MIGRATION_KEY = 'bewlycat_video_visit_history_migrated'

function parseVideoVisitHistory(rawValue: unknown): VideoVisitHistory {
  try {
    const value = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return {}

    return pruneVideoVisitHistory(value)
  }
  catch {
    return {}
  }
}

const videoVisitHistory = shallowRef<VideoVisitHistory>({})
let indexedRecords: VideoVisitHistory | undefined
let queryHistory = createVideoHistoryIndex({})
const epoch = shallowRef('')
let canonical: VideoHistorySnapshot | undefined
let pendingRead: Promise<void> | undefined
let pending = new Map<string, VideoHistoryEdit>()
let inFlight: { epoch: string, operationId: string, acknowledgedRevision?: number, edits: VideoHistoryEdit[], promise: Promise<void> } | undefined
let writeTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let invalidated = false
let operationId = 0
let historyGeneration = 0
const clientId = crypto.randomUUID()
let settingsLoaded = false
const readers = new Set<symbol>()
const hasConsumers = () => settings.value.showVideoWatchedBadge || readers.size > 0
function releaseUnusedSubscription() {
  if (!hasConsumers() && !pendingRead && !inFlight && !pending.size)
    unfollowStateTopic('videoHistory')
}

/** A history/progress surface or native playback owner holds only this topic. */
export function acquireVideoVisitHistory() {
  const interested = hasConsumers()
  const reader = Symbol('video-history-reader')
  readers.add(reader)
  if (settingsLoaded && (!interested || !canonical))
    void initialize()
  return () => {
    readers.delete(reader)
    releaseUnusedSubscription()
  }
}

function editKeys(edits: readonly VideoHistoryEdit[]) {
  return edits.flatMap((edit) => {
    const bases = videoHistoryBaseKeys(edit.identity)
    const part = videoHistoryPartKey(edit.identity)
    return part ? bases.flatMap(base => [base, `${base}|${part}`]) : bases
  })
}

function render(changedKeys: Iterable<string> = [], reset = false) {
  const acknowledged = inFlight?.acknowledgedRevision !== undefined && canonical?.epoch === inFlight.epoch && canonical.revision >= inFlight.acknowledgedRevision
  const edits = [...(!acknowledged ? inFlight?.edits ?? [] : []), ...pending.values()].filter(edit => videoHistoryBaseKeys(edit.identity)
    .every(key => (canonical?.deleted[key] ?? 0) <= (edit.baseRevision ?? 0)))
  const records = applyVideoHistoryEdits(canonical?.records ?? {}, edits)
  if (records === videoVisitHistory.value)
    return
  if (indexedRecords === videoVisitHistory.value) {
    if (reset) {
      queryHistory = createVideoHistoryIndex(records)
    }
    else {
      const affected = new Set([...changedKeys, ...editKeys(edits)])
      queryHistory.update(Object.fromEntries([...affected].flatMap(key => records[key] ? [[key, records[key]]] : [])), [...affected].filter(key => !records[key]))
    }
    indexedRecords = records
  }
  videoVisitHistory.value = records
}

function settleAcknowledgedWrite() {
  const owner = inFlight
  if (!owner || owner.acknowledgedRevision === undefined || canonical?.epoch !== owner.epoch || canonical.revision < owner.acknowledgedRevision)
    return
  inFlight = undefined
  return owner.edits
}

function acceptSnapshot(next: VideoHistorySnapshot, changedKeys?: Iterable<string>) {
  if (disposed || invalidated || (canonical?.epoch === next.epoch && next.revision <= canonical.revision))
    return
  const affected = changedKeys && new Set([...changedKeys, ...editKeys([...(inFlight?.edits ?? []), ...pending.values()])])
  if (next.epoch !== canonical?.epoch) {
    historyGeneration++
    pending.clear()
    inFlight = undefined
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
  canonical = next
  if (inFlight && next.recentOperations.includes(inFlight.operationId))
    inFlight.acknowledgedRevision = next.revision
  for (const [key, edit] of pending) {
    if (videoHistoryBaseKeys(edit.identity).some(base => (next.deleted[base] ?? 0) > (edit.baseRevision ?? 0)))
      pending.delete(key)
  }
  epoch.value = next.epoch
  const settled = settleAcknowledgedWrite()
  render(affected, !changedKeys)
  if (settled)
    void flushVideoVisitHistory()
}

function handleFailure(error: unknown) {
  if (isExtensionContextInvalidatedError(error)) {
    invalidated = true
    pending.clear()
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
  else {
    reportRuntimeFailure('Failed to persist local playback history', error)
  }
}

function writeSiteMarker(value: string) {
  try {
    localStorage.setItem(VIDEO_VISIT_HISTORY_MIGRATION_KEY, value)
    return true
  }
  catch { return false }
}

function initialize(): Promise<void> {
  if (disposed || invalidated)
    return Promise.resolve()
  // Watched badges are shown here; while hidden this document is only marked stale.
  followStateTopic('videoHistory', () => void initialize())
  if (pendingRead)
    return pendingRead
  let readAgain = false
  const task = withRequestDeadline(async (signal) => {
    const generation = historyGeneration
    const next = await waitWithSignal(sendMessage<VideoHistoryCommand, VideoHistorySnapshot>(VIDEO_VISIT_HISTORY_MESSAGE, { type: 'read' }), signal)
    signal.throwIfAborted()
    if (generation !== historyGeneration) {
      readAgain = true
      return
    }
    let marker: string | null | undefined
    try {
      marker = localStorage.getItem(VIDEO_VISIT_HISTORY_MIGRATION_KEY)
    }
    catch { /* Unavailable site storage is not evidence that it was cleared. */ }
    if (next.migratedSources.includes(location.origin) && (marker === null || marker === `reset:${next.epoch}`)) {
      // Mark before sending so another starting tab cannot mistake an in-flight
      // reset (or migration acknowledgement) for a second site-data clear.
      writeSiteMarker(`reset:${next.epoch}`)
      const cleared = await waitWithSignal(sendMessage<VideoHistoryCommand, VideoHistorySnapshot>(VIDEO_VISIT_HISTORY_MESSAGE, { type: 'clear', epoch: next.epoch }), signal)
      signal.throwIfAborted()
      acceptSnapshot(cleared)
      writeSiteMarker('v2')
      return
    }
    acceptSnapshot(next)
    if (disposed || invalidated)
      return
    if (next.migratedSources.includes(location.origin)) {
      if (marker?.startsWith('migrate:') || marker?.startsWith('reset:'))
        writeSiteMarker('v2')
      return
    }
    let legacy: VideoVisitHistory = {}
    if (!next.migrationClosed && marker !== 'v2') {
      try {
        legacy = parseVideoVisitHistory(localStorage.getItem(VIDEO_VISIT_HISTORY_STORAGE_KEY))
      }
      catch { /* Site storage may be unavailable; the extension writer still works. */ }
      if (!browser.extension?.inIncognitoContext) {
        const stored = await waitWithSignal(browser.storage.local.get(LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY), signal)
        for (const [key, record] of Object.entries(parseVideoVisitHistory(stored[LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY])))
          legacy[key] = mergeVideoVisitRecord(legacy[key], record)
      }
    }
    if (disposed || invalidated || canonical?.epoch !== next.epoch)
      return
    signal.throwIfAborted()
    writeSiteMarker(`migrate:${next.epoch}`)
    const migrated = await sendMessage<VideoHistoryCommand, VideoHistorySnapshot>(VIDEO_VISIT_HISTORY_MESSAGE, {
      type: 'migrate',
      epoch: next.epoch,
      source: location.origin,
      records: legacy,
    })
    if (canonical?.epoch !== next.epoch)
      return
    acceptSnapshot(migrated)
    if (migrated.migratedSources.includes(location.origin)) {
      // Only after durable acknowledgement; v2 prevents other documents treating
      // migration cleanup as a user-requested history clear.
      if (writeSiteMarker('v2'))
        localStorage.removeItem(VIDEO_VISIT_HISTORY_STORAGE_KEY)
      if (!browser.extension?.inIncognitoContext)
        await browser.storage.local.remove(LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY)
    }
  }).catch(handleFailure).finally(() => {
    if (pendingRead === task)
      pendingRead = undefined
    if (readAgain && !disposed && !invalidated)
      void initialize()
    releaseUnusedSubscription()
  })
  pendingRead = task
  return task
}

export function flushVideoVisitHistory(): Promise<void> {
  clearTimeout(writeTimer)
  writeTimer = undefined
  if (inFlight) {
    return inFlight.acknowledgedRevision !== undefined && canonical?.epoch === inFlight.epoch && canonical.revision < inFlight.acknowledgedRevision
      ? initialize()
      : inFlight.promise
  }
  if (disposed || invalidated || !canonical || !pending.size)
    return Promise.resolve()
  const edits = [...pending.values()]
  pending = new Map()
  const owner = { epoch: canonical.epoch, operationId: `${clientId}:${++operationId}`, edits, promise: Promise.resolve() }
  inFlight = owner
  const command: VideoHistoryCommand = { type: 'record', epoch: owner.epoch, baseRevision: canonical.revision, operationId: owner.operationId, edits }
  owner.promise = sendMessage<VideoHistoryCommand, VideoHistoryUpdate>(VIDEO_VISIT_HISTORY_MESSAGE, command)
    .then(async (next) => {
      if (inFlight !== owner)
        return
      await receiveUpdate(next)
    })
    .catch((error) => {
      if (inFlight !== owner)
        return
      inFlight = undefined
      render(editKeys(owner.edits))
      handleFailure(error)
      // Unknown writes are never blindly resent. The next actual session sample
      // carries newer evidence; an authoritative read reconciles this outcome.
      if (!invalidated)
        void initialize()
    })
    .finally(releaseUnusedSubscription)
  return owner.promise
}

function record(edit: VideoHistoryEdit, expectedEpoch = epoch.value): boolean {
  if (!settingsLoaded || !canonical || disposed || invalidated || expectedEpoch !== canonical.epoch)
    return false
  const base = videoHistoryBaseKeys(edit.identity)[0]
  if (!base)
    return false
  const key = `${base}|${videoHistoryPartKey(edit.identity) ?? ''}`
  // Keep only immutable identity primitives; recycled Vue card objects must not
  // turn a delayed visit to A into a visit to B before the batch is submitted.
  const { aid, bvid, cid, page, epid, pageCount } = edit.identity
  pending.set(key, { identity: { aid, bvid, cid, page, epid, pageCount }, record: mergeVideoVisitRecord(pending.get(key)?.record, edit.record), baseRevision: canonical.revision })
  render(editKeys([edit]))
  if (writeTimer === undefined)
    writeTimer = setTimeout(() => void flushVideoVisitHistory(), 500)
  return true
}

export const videoVisitHistoryEpoch = computed(() => epoch.value)

async function receiveUpdate(update: VideoHistoryUpdate) {
  if (disposed || invalidated)
    return
  if (update.type === 'snapshot') {
    if (!canonical || update.snapshot.epoch === canonical.epoch || update.previousEpoch === canonical.epoch)
      acceptSnapshot(update.snapshot)
    else
      void initialize()
    return
  }
  const owner = inFlight
  if (owner && update.epoch === owner.epoch && update.operationId === owner.operationId)
    owner.acknowledgedRevision = update.revision
  if (!canonical || update.epoch !== canonical.epoch || update.baseRevision > canonical.revision) {
    await initialize()
    return
  }
  if (update.revision <= canonical.revision) {
    const settled = settleAcknowledgedWrite()
    if (settled) {
      render(editKeys(settled))
      void flushVideoVisitHistory()
    }
    return
  }
  const changed = Object.keys(update.records)
  const records = changed.length || update.removed.length ? { ...canonical.records, ...update.records } : canonical.records
  for (const key of update.removed)
    delete records[key]
  acceptSnapshot({ ...canonical, revision: update.revision, records, deleted: { ...canonical.deleted, ...update.deleted } }, [...changed, ...update.removed])
}
onMessage<VideoHistoryUpdate>(VIDEO_VISIT_HISTORY_UPDATED, (update) => {
  void receiveUpdate(update)
})

void settingsReady.then(() => {
  settingsLoaded = true
  if (hasConsumers())
    void initialize()
})
const stopSettings = watch(() => settings.value.showVideoWatchedBadge, (enabled) => {
  if (enabled && settingsLoaded)
    void initialize()
  else
    releaseUnusedSubscription()
})

if (typeof window !== 'undefined') {
  const changed = (event: StorageEvent) => {
    if (event.key === null || (event.key === VIDEO_VISIT_HISTORY_STORAGE_KEY && event.newValue === null
      && localStorage.getItem(VIDEO_VISIT_HISTORY_MIGRATION_KEY) !== 'v2')) {
      void clearVideoVisitHistory()
    }
  }
  window.addEventListener('storage', changed)
  window.addEventListener('pagehide', (event: PageTransitionEvent) => {
    // Best effort only. Playback also flushes periodically and on pause/ended.
    void flushVideoVisitHistory()
    if (!event.persisted) {
      disposed = true
      stopSettings()
      window.removeEventListener('storage', changed)
    }
  })
}

export function recordVideoVisit(video: VideoIdentity, visitedAt = Date.now()): boolean {
  return settings.value.showVideoWatchedBadge && record({ identity: video, record: { visitedAt } })
}

export function recordVideoWatchProgress(video: VideoIdentity, progress: number, duration: number | undefined, completed: boolean, expectedEpoch: string): boolean {
  const now = Date.now()
  return record({ identity: video, record: { visitedAt: now, playedAt: now, progress, duration, completed } }, expectedEpoch)
}

export async function clearVideoVisitHistory() {
  const release = acquireVideoVisitHistory()
  try {
    if (pendingRead)
      await pendingRead
    else if (!canonical)
      await initialize()
    if (!canonical || invalidated || disposed)
      return
    pending.clear()
    const next = await sendMessage<VideoHistoryCommand, VideoHistorySnapshot>(VIDEO_VISIT_HISTORY_MESSAGE, { type: 'clear', epoch: canonical.epoch }).catch(handleFailure)
    if (next) {
      acceptSnapshot(next)
      writeSiteMarker('v2')
    }
  }
  finally { release() }
}

export async function removeVideoVisitHistory(identity: VideoIdentity | readonly VideoIdentity[]) {
  const release = acquireVideoVisitHistory()
  try {
    if (pendingRead)
      await pendingRead
    else if (!canonical)
      await initialize()
    if (!canonical || invalidated || disposed)
      return
    const identities = Array.isArray(identity) ? identity : [identity as VideoIdentity]
    if (!identities.length)
      return
    const next = await sendMessage<VideoHistoryCommand, VideoHistoryUpdate>(VIDEO_VISIT_HISTORY_MESSAGE, { type: 'remove', epoch: canonical.epoch, identities }).catch(handleFailure)
    if (next)
      await receiveUpdate(next)
  }
  finally { release() }
}

export function getVideoIdentityFromUrl(url: string): VideoIdentity | undefined {
  try {
    const target = parsePlaybackTabUrl(url)
    if (!target || 'seasonId' in target)
      return
    const page = Number(new URL(url).searchParams.get('p') || 1)
    return { ...target, ...('epid' in target ? {} : { page: Number.isSafeInteger(page) && page > 0 ? page : 1 }) }
  }
  catch {
    return undefined
  }

  return undefined
}

export function recordVideoVisitFromUrl(url: string, visitedAt = Date.now()): boolean {
  const identity = getVideoIdentityFromUrl(url)
  return identity ? recordVideoVisit(identity, visitedAt) : false
}

export function getVideoWatchState(video: VideoIdentity) {
  if (indexedRecords !== videoVisitHistory.value) {
    indexedRecords = videoVisitHistory.value
    queryHistory = createVideoHistoryIndex(indexedRecords)
  }
  return queryHistory(video)
}

export function getVideoPlaybackProgress(video: VideoIdentity, serverProgress?: number, serverDuration?: number): { progress: number, duration: number } | undefined {
  if (Number.isFinite(serverDuration) && serverDuration! > 0 && Number.isFinite(serverProgress)
    && (serverProgress === -1 || serverProgress! >= 0)) {
    return { progress: serverProgress === -1 ? serverDuration! : serverProgress!, duration: serverDuration! }
  }
  const local = getVideoWatchState(video)
  return local?.status === 'played' && local.duration && local.progress !== undefined
    ? { progress: local.progress, duration: local.duration }
    : undefined
}

export function getVideoProgressPercentage(video: VideoIdentity, serverProgress?: number, serverDuration?: number): number {
  const value = getVideoPlaybackProgress(video, serverProgress, serverDuration)
  return value ? normalizePlaybackProgress(value.progress, value.duration) : 0
}
