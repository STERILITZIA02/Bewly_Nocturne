import browser from 'webextension-polyfill'

import { onMessage } from '~/utils/messaging'
import type { VideoHistoryCommand, VideoHistorySnapshot, VideoHistoryUpdate, VideoHistoryWriteDelta } from '~/utils/videoVisitRecord'
import { applyVideoHistoryEdits, limitVideoVisitHistory, mergeVideoVisitRecord, pruneVideoVisitHistory, VIDEO_VISIT_HISTORY_MAX_ENTRIES, VIDEO_VISIT_HISTORY_MESSAGE, VIDEO_VISIT_HISTORY_UPDATED, videoHistoryBaseKeys } from '~/utils/videoVisitRecord'

import { getStateConsumerRegistry } from './stateConsumers'
import { createVideoVisitHistoryDatabase } from './videoVisitHistoryDatabase'

interface Dependencies {
  get: () => Promise<unknown>
  set: (snapshot: VideoHistorySnapshot, delta?: VideoHistoryWriteDelta) => Promise<void>
  broadcast: (update: VideoHistoryUpdate) => Promise<void>
}

/** All documents patch this writer; read/merge/write never runs in two tabs. */
export function createVideoVisitHistoryCoordinator(dependencies: Dependencies) {
  let snapshot: VideoHistorySnapshot | undefined
  let recordCount = 0
  let queue = Promise.resolve()
  let resetGeneration = 0
  const empty = (): VideoHistorySnapshot => ({ epoch: crypto.randomUUID(), revision: 0, records: {}, deleted: {}, migratedSources: [], migrationClosed: false, recentOperations: [] })
  function serialized<T>(run: () => Promise<T>) {
    const task = queue.then(run, run)
    queue = task.then(() => {}, () => {})
    return task
  }
  async function load() {
    if (snapshot)
      return snapshot
    const stored = await dependencies.get() as VideoHistorySnapshot | undefined
    if (stored?.epoch && Number.isSafeInteger(stored.revision) && stored.records && typeof stored.records === 'object') {
      snapshot = { ...empty(), ...stored, records: pruneVideoVisitHistory(stored.records) }
    }
    else {
      snapshot = empty()
      await dependencies.set(snapshot)
    }
    recordCount = Object.keys(snapshot.records).length
    return snapshot
  }
  async function commit(previous: VideoHistorySnapshot, next: VideoHistorySnapshot, full = false, delta?: VideoHistoryWriteDelta, operationId?: string): Promise<VideoHistoryUpdate> {
    const generation = resetGeneration
    const records = delta?.records ?? Object.fromEntries(Object.entries(next.records).filter(([key, value]) => value !== previous.records[key]))
    const removed = delta?.removed ?? Object.keys(previous.records).filter(key => !Object.hasOwn(next.records, key))
    try {
      await dependencies.set(next, { records, removed, reset: full })
    }
    catch (error) {
      snapshot = undefined
      throw error
    }
    const update: VideoHistoryUpdate = full
      ? { type: 'snapshot', snapshot: next, previousEpoch: previous.epoch }
      : { type: 'patch', epoch: next.epoch, baseRevision: previous.revision, revision: next.revision, records, removed, deleted: Object.fromEntries(Object.entries(next.deleted).filter(([key, version]) => version !== previous.deleted[key])), operationId }
    if (generation === resetGeneration) {
      recordCount = full
        ? Object.keys(next.records).length
        : recordCount + Object.keys(records).filter(key => !Object.hasOwn(previous.records, key)).length - removed.filter(key => Object.hasOwn(previous.records, key)).length
      snapshot = next
      await dependencies.broadcast(update)
    }
    return update
  }
  function handle(command: VideoHistoryCommand) {
    return serialized(async () => {
      const current = await load()
      if (command.type === 'read')
        return current
      if (command.epoch !== current.epoch)
        return command.type === 'record' || command.type === 'remove' ? { type: 'snapshot' as const, snapshot: current } : current
      if (command.type === 'clear') {
        const next = { ...empty(), migratedSources: current.migratedSources, migrationClosed: true }
        await commit(current, next, true)
        return next
      }
      const noChange = (): VideoHistoryUpdate => ({ type: 'patch', epoch: current.epoch, baseRevision: current.revision, revision: current.revision, records: {}, removed: [], deleted: {}, operationId: command.type === 'record' ? command.operationId : undefined })
      let records = current.records
      let delta: VideoHistoryWriteDelta | undefined
      const next = { ...current, revision: current.revision + 1, records }
      if (command.type === 'remove') {
        records = { ...records }
        if (!Array.isArray(command.identities))
          throw new TypeError('Invalid history removal')
        const keys = new Set(command.identities.flatMap(videoHistoryBaseKeys))
        const legacyKeys = new Set([...keys].map(key => key.toLowerCase()))
        if (!keys.size)
          return noChange()
        next.deleted = { ...current.deleted }
        for (const [key, record] of Object.entries(records)) {
          const base = key.split('|')[0]
          const legacyMatch = base.startsWith('bv:bv') && !record.playedAt && legacyKeys.has(base)
          if (keys.has(base) || legacyMatch || videoHistoryBaseKeys(record).some(alias => keys.has(alias))) {
            delete records[key]
            next.deleted[key.split('|')[0]] = next.revision
          }
        }
        for (const key of keys)
          next.deleted[key] = next.revision
        if (Object.keys(next.deleted).length > VIDEO_VISIT_HISTORY_MAX_ENTRIES) {
          next.epoch = crypto.randomUUID()
          next.deleted = {}
        }
      }
      else if (command.type === 'migrate') {
        if (current.migratedSources.includes(command.source))
          return current
        records = { ...records }
        // No playback information is imported from pre-model storage.
        const legacy = current.migrationClosed ? {} : pruneVideoVisitHistory(command.records)
        for (const [key, value] of Object.entries(legacy)) {
          if (!current.deleted[key])
            records[key] = mergeVideoVisitRecord(records[key], { visitedAt: value.visitedAt })
        }
        next.migratedSources = [...current.migratedSources, command.source]
      }
      else {
        if (!command.operationId || current.recentOperations.includes(command.operationId))
          return noChange()
        const edits = command.edits.filter(edit => videoHistoryBaseKeys(edit.identity).every(key => (current.deleted[key] ?? 0) <= (edit.baseRevision ?? command.baseRevision)))
        delta = { records: {}, removed: [], reset: false }
        records = applyVideoHistoryEdits(records, edits, delta.records)
        next.recentOperations = [...current.recentOperations, command.operationId].slice(-256)
      }
      const size = delta ? recordCount + Object.keys(delta.records).filter(key => !Object.hasOwn(current.records, key)).length : Object.keys(records).length
      next.records = size > VIDEO_VISIT_HISTORY_MAX_ENTRIES ? limitVideoVisitHistory(records) : records
      if (delta && next.records !== records) {
        delta.removed = Object.keys(records).filter(key => !Object.hasOwn(next.records, key))
        for (const key of delta.removed)
          delete delta.records[key]
      }
      const update = await commit(current, next, next.epoch !== current.epoch || command.type === 'migrate', delta, command.type === 'record' ? command.operationId : undefined)
      return command.type === 'migrate' ? next : update
    })
  }
  return {
    handle,
    reset() {
      resetGeneration++
      return serialized(async () => {
        const current = snapshot ?? empty()
        return commit(current, { ...empty(), migratedSources: current.migratedSources, migrationClosed: true }, true)
      })
    },
  }
}

export function setupVideoVisitHistoryCoordinator() {
  const privateContext = Boolean(browser.extension?.inIncognitoContext)
  let coordinator: ReturnType<typeof createVideoVisitHistoryCoordinator>
  const storage = createVideoVisitHistoryDatabase(indexedDB, privateContext ? 'private' : 'normal', () => {
    void coordinator.reset().catch(() => {})
  })
  coordinator = createVideoVisitHistoryCoordinator({
    get: storage.get,
    set: storage.set,
    broadcast: update => getStateConsumerRegistry().deliver('videoHistory', { type: VIDEO_VISIT_HISTORY_UPDATED, data: update }, privateContext ? 'private' : 'normal'),
  })
  onMessage<VideoHistoryCommand>(VIDEO_VISIT_HISTORY_MESSAGE, (command, sender) => {
    if (sender?.tab && Boolean(sender.tab.incognito) !== privateContext)
      throw new Error('History privacy context changed')
    if (command.type === 'read')
      void getStateConsumerRegistry().touch('videoHistory', sender)
    return coordinator.handle(command)
  })
}
