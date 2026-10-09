import { computed, shallowRef, watch } from 'vue'
import browser from 'webextension-polyfill'

import { settings, settingsReady } from '~/logic'
import { waitWithSignal, withRequestDeadline } from '~/utils/abort'
import { isExtensionContextInvalidatedError, onMessage, reportRuntimeFailure, sendMessage } from '~/utils/messaging'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'
import { parsePlaybackTabUrl } from '~/utils/playbackTab'
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
const epoch = shallowRef('')
let canonical: VideoHistorySnapshot | undefined
let pendingRead: Promise<void> | undefined
let pending = new Map<string, VideoHistoryEdit>()
let inFlight: { epoch: string, edits: VideoHistoryEdit[], promise: Promise<void> } | undefined
let writeTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let invalidated = false
let operationId = 0
let historyGeneration = 0
const clientId = crypto.randomUUID()
let settingsLoaded = false

function render() {
  const edits = [...(inFlight?.edits ?? []), ...pending.values()].filter(edit => videoHistoryBaseKeys(edit.identity)
    .every(key => (canonical?.deleted[key] ?? 0) <= (edit.baseRevision ?? 0)))
  videoVisitHistory.value = applyVideoHistoryEdits(canonical?.records ?? {}, edits)
}

function acceptSnapshot(next: VideoHistorySnapshot) {
  if (disposed || invalidated || (canonical?.epoch === next.epoch && next.revision < canonical.revision))
    return
  if (next.epoch !== canonical?.epoch) {
    historyGeneration++
    pending.clear()
    inFlight = undefined
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
  canonical = next
  for (const [key, edit] of pending) {
    if (videoHistoryBaseKeys(edit.identity).some(base => (next.deleted[base] ?? 0) > (edit.baseRevision ?? 0)))
      pending.delete(key)
  }
  epoch.value = next.epoch
  render()
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
  if (pendingRead)
    return pendingRead
  if (disposed || invalidated)
    return Promise.resolve()
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
  })
  pendingRead = task
  return task
}

export function flushVideoVisitHistory(): Promise<void> {
  clearTimeout(writeTimer)
  writeTimer = undefined
  if (inFlight)
    return inFlight.promise
  if (disposed || invalidated || !canonical || !pending.size)
    return Promise.resolve()
  const edits = [...pending.values()]
  pending = new Map()
  const owner = { epoch: canonical.epoch, edits, promise: Promise.resolve() }
  inFlight = owner
  const command: VideoHistoryCommand = { type: 'record', epoch: owner.epoch, baseRevision: canonical.revision, operationId: `${clientId}:${++operationId}`, edits }
  owner.promise = sendMessage<VideoHistoryCommand, VideoHistorySnapshot>(VIDEO_VISIT_HISTORY_MESSAGE, command)
    .then((next) => {
      if (inFlight !== owner)
        return
      inFlight = undefined
      acceptSnapshot(next)
      void flushVideoVisitHistory()
    })
    .catch((error) => {
      if (inFlight !== owner)
        return
      inFlight = undefined
      handleFailure(error)
      // Unknown writes are never blindly resent. The next actual session sample
      // carries newer evidence; an authoritative read reconciles this outcome.
      if (!invalidated)
        void initialize()
    })
  return owner.promise
}

function record(edit: VideoHistoryEdit, expectedEpoch = epoch.value): boolean {
  if (!settingsLoaded || !settings.value.showVideoWatchedBadge || !canonical || disposed || invalidated || expectedEpoch !== canonical.epoch)
    return false
  const base = videoHistoryBaseKeys(edit.identity)[0]
  if (!base)
    return false
  const key = `${base}|${videoHistoryPartKey(edit.identity) ?? ''}`
  // Keep only immutable identity primitives; recycled Vue card objects must not
  // turn a delayed visit to A into a visit to B before the batch is submitted.
  const { aid, bvid, cid, page, epid, pageCount } = edit.identity
  pending.set(key, { identity: { aid, bvid, cid, page, epid, pageCount }, record: mergeVideoVisitRecord(pending.get(key)?.record, edit.record), baseRevision: canonical.revision })
  render()
  if (writeTimer === undefined)
    writeTimer = setTimeout(() => void flushVideoVisitHistory(), 500)
  return true
}

export const videoVisitHistoryEpoch = computed(() => epoch.value)

onMessage<VideoHistoryUpdate>(VIDEO_VISIT_HISTORY_UPDATED, (update) => {
  if (disposed || invalidated)
    return
  if (update.type === 'snapshot') {
    if (!canonical || update.snapshot.epoch === canonical.epoch || update.previousEpoch === canonical.epoch)
      acceptSnapshot(update.snapshot)
    else
      void initialize()
    return
  }
  if (!canonical || update.epoch !== canonical.epoch || update.baseRevision > canonical.revision) {
    void initialize()
    return
  }
  if (update.revision <= canonical.revision)
    return
  const records = { ...canonical.records, ...update.records }
  for (const key of update.removed)
    delete records[key]
  acceptSnapshot({ ...canonical, revision: update.revision, records, deleted: { ...canonical.deleted, ...update.deleted } })
})

void settingsReady.then(() => {
  settingsLoaded = true
  if (settings.value.showVideoWatchedBadge)
    void initialize()
})
const stopSettings = watch(() => settings.value.showVideoWatchedBadge, (enabled) => {
  if (enabled && settingsLoaded)
    void initialize()
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
  return record({ identity: video, record: { visitedAt } })
}

export function recordVideoWatchProgress(video: VideoIdentity, progress: number, duration: number | undefined, completed: boolean, expectedEpoch: string): boolean {
  const now = Date.now()
  return record({ identity: video, record: { visitedAt: now, playedAt: now, progress, duration, completed } }, expectedEpoch)
}

export async function clearVideoVisitHistory() {
  if (!canonical)
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

export async function removeVideoVisitHistory(identity: VideoIdentity) {
  if (!canonical)
    await initialize()
  if (!canonical || invalidated || disposed)
    return
  const next = await sendMessage<VideoHistoryCommand, VideoHistorySnapshot>(VIDEO_VISIT_HISTORY_MESSAGE, { type: 'remove', epoch: canonical.epoch, identity }).catch(handleFailure)
  if (next)
    acceptSnapshot(next)
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

let indexedRecords: VideoVisitHistory | undefined
let queryHistory = createVideoHistoryIndex({})
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
