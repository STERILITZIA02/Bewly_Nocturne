import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_MATCHES } from '~/constants/contentScript'
import { onMessage } from '~/utils/messaging'
import type { VideoHistoryCommand, VideoHistorySnapshot, VideoHistoryUpdate, VideoHistoryWriteDelta } from '~/utils/videoVisitRecord'
import { applyVideoHistoryEdits, limitVideoVisitHistory, mergeVideoVisitRecord, pruneVideoVisitHistory, VIDEO_VISIT_HISTORY_MAX_ENTRIES, VIDEO_VISIT_HISTORY_MESSAGE, VIDEO_VISIT_HISTORY_UPDATED, videoHistoryBaseKeys } from '~/utils/videoVisitRecord'

import { createVideoVisitHistoryDatabase } from './videoVisitHistoryDatabase'

interface Dependencies {
  get: () => Promise<unknown>
  set: (snapshot: VideoHistorySnapshot, delta?: VideoHistoryWriteDelta) => Promise<void>
  broadcast: (update: VideoHistoryUpdate) => Promise<void>
}

/** All documents patch this writer; read/merge/write never runs in two tabs. */
export function createVideoVisitHistoryCoordinator(dependencies: Dependencies) {
  let snapshot: VideoHistorySnapshot | undefined
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
    return snapshot
  }
  async function commit(previous: VideoHistorySnapshot, next: VideoHistorySnapshot, full = false) {
    const generation = resetGeneration
    const records = Object.fromEntries(Object.entries(next.records).filter(([key, value]) => value !== previous.records[key]))
    const removed = Object.keys(previous.records).filter(key => !Object.hasOwn(next.records, key))
    try {
      await dependencies.set(next, { records, removed, reset: full })
    }
    catch (error) {
      snapshot = undefined
      throw error
    }
    if (generation !== resetGeneration)
      return next
    snapshot = next
    if (full) {
      await dependencies.broadcast({ type: 'snapshot', snapshot: next, previousEpoch: previous.epoch })
    }
    else {
      const deleted = Object.fromEntries(Object.entries(next.deleted).filter(([key, version]) => version !== previous.deleted[key]))
      await dependencies.broadcast({ type: 'patch', epoch: next.epoch, baseRevision: previous.revision, revision: next.revision, records, removed, deleted })
    }
    return next
  }
  function handle(command: VideoHistoryCommand) {
    return serialized(async () => {
      const current = await load()
      if (command.type === 'read')
        return current
      if (command.epoch !== current.epoch)
        return current
      if (command.type === 'clear')
        return commit(current, { ...empty(), migratedSources: current.migratedSources, migrationClosed: true }, true)
      let records = { ...current.records }
      const next = { ...current, revision: current.revision + 1, records }
      if (command.type === 'remove') {
        const keys = new Set(videoHistoryBaseKeys(command.identity))
        const legacyKeys = new Set([...keys].map(key => key.toLowerCase()))
        if (!keys.size)
          return current
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
          return current
        const edits = command.edits.filter(edit => videoHistoryBaseKeys(edit.identity).every(key => (current.deleted[key] ?? 0) <= (edit.baseRevision ?? command.baseRevision)))
        records = applyVideoHistoryEdits(records, edits)
        next.recentOperations = [...current.recentOperations, command.operationId].slice(-256)
      }
      next.records = limitVideoVisitHistory(records)
      return commit(current, next, next.epoch !== current.epoch)
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
    async broadcast(update) {
      const tabs = await browser.tabs.query({ url: [...CONTENT_SCRIPT_MATCHES] }).catch(() => [])
      await Promise.allSettled(tabs.filter(tab => tab.id !== undefined && Boolean(tab.incognito) === privateContext)
        .map(tab => browser.tabs.sendMessage(tab.id!, { type: VIDEO_VISIT_HISTORY_UPDATED, data: update })))
    },
  })
  onMessage<VideoHistoryCommand>(VIDEO_VISIT_HISTORY_MESSAGE, (command, sender) => {
    if (sender?.tab && Boolean(sender.tab.incognito) !== privateContext)
      throw new Error('History privacy context changed')
    return coordinator.handle(command)
  })
}
