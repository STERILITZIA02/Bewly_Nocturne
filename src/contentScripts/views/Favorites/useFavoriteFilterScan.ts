import { computed, ref, shallowReactive, shallowRef, toRaw, watch } from 'vue'

import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import { withRequestDeadline } from '~/utils/abort'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'
import { getFavoriteResourceKey } from '~/utils/favoriteResource'

import type { FavoriteFilterQuery, FavoriteFilterRecord, FavoritePartitionOption } from './favoriteFilter'
import { compileFavoriteFilter, EMPTY_FAVORITE_FILTER, getFavoriteFilterKey, getFavoriteFilterRecordKey, isFavoriteFilterActive, mergeFavoritePartitions, parseFavoritePartitions } from './favoriteFilter'
import type { FavoriteVideoOrder } from './otherFavorites'

export type FavoriteFilterScanStatus = 'idle' | 'scanning' | 'paused' | 'budget' | 'complete' | 'failed' | 'stalled'

interface FavoriteFilterScanDependencies {
  api: Pick<typeof api.favorite, 'getFavoriteResources' | 'getFavoritePartitions'>
  invalidatePage: (params: Parameters<typeof api.favorite.getFavoriteResources>[0]) => void
  getAccountId: () => AccountId
  getSourceIds: () => number[]
  getScope: () => 'current' | 'all'
  getOrder: () => FavoriteVideoOrder
  getNormalQuery: () => string
  isActive: () => boolean
}

interface ScanTask {
  sourceId: number
  tid: number | null
  page: number
  done: boolean
  pages: Map<number, string[]>
  keys: Set<string>
  repairThrough?: number
}

const FILTER_PAGE_SIZE = 40
// A round reads at least this many pages and stops only once it has new
// matches, so the grid always has something to scroll to before it asks for
// more (the count is unknown; the page shows a ring, never progress text).
const FILTER_AUTO_PAGE_BUDGET = 25
const PARTITION_CONCURRENCY = 3
const PARTITION_CACHE_LIMIT = 64

export function useFavoriteFilterScan(dependencies: FavoriteFilterScanDependencies) {
  const applied = shallowRef<FavoriteFilterQuery>(EMPTY_FAVORITE_FILTER)
  const status = ref<FavoriteFilterScanStatus>('idle')
  const records = shallowReactive<FavoriteFilterRecord[]>([])
  const partitions = shallowRef<FavoritePartitionOption[]>([])
  const partitionsLoading = ref(false)
  const partitionsFailed = ref(false)
  const recordKeys = new Set<string>()
  let sourceByItem = new WeakMap<object, number>()
  const partitionCache = new Map<string, FavoritePartitionOption[]>()
  const pageVisible = ref(typeof document === 'undefined' || !document.hidden)
  const updateVisibility = () => pageVisible.value = !document.hidden
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', updateVisibility)
  let tasks: ScanTask[] = []
  let identity = ''
  let generation = 0
  let controller: AbortController | undefined
  let partitionGeneration = 0
  let partitionController: AbortController | undefined
  let partitionTask: { key: string, promise: Promise<void> } | undefined
  let partitionResultKey = ''
  let partitionsRequested = false
  let disposed = false
  let roundBudget = FILTER_AUTO_PAGE_BUDGET
  let roundStart = 0
  let predicate = compileFavoriteFilter(EMPTY_FAVORITE_FILTER, '')

  const active = computed(() => isFavoriteFilterActive(applied.value))
  const items = computed(() => records.map(record => record.item))

  function computeIdentity() {
    return JSON.stringify([
      dependencies.getAccountId(),
      dependencies.getScope(),
      dependencies.getSourceIds(),
      dependencies.getNormalQuery().trim(),
      dependencies.getOrder(),
      getFavoriteFilterKey(applied.value),
    ])
  }

  function cancelRead() {
    controller?.abort()
    controller = undefined
  }

  function clearResults() {
    records.length = 0
    recordKeys.clear()
    sourceByItem = new WeakMap()
  }

  function reset() {
    generation++
    cancelRead()
    clearResults()
    tasks = []
    identity = ''
    status.value = 'idle'
  }

  function prepare() {
    generation++
    cancelRead()
    clearResults()
    roundBudget = FILTER_AUTO_PAGE_BUDGET
    roundStart = 0
    identity = computeIdentity()
    predicate = compileFavoriteFilter(applied.value, dependencies.getNormalQuery())
    const tids = applied.value.tids.length ? applied.value.tids : [null]
    tasks = dependencies.getSourceIds().flatMap(sourceId => tids.map(tid => ({ sourceId, tid, page: 0, done: false, pages: new Map(), keys: new Set() })))
    status.value = tasks.length ? 'scanning' : 'complete'
    void pump(generation)
  }

  function isCurrent(version: number) {
    return version === generation && identity === computeIdentity() && dependencies.isActive() && active.value
  }

  async function pump(version: number) {
    while (isCurrent(version)) {
      const task = tasks.find(entry => !entry.done)
      if (!task) {
        status.value = 'complete'
        return
      }
      if (!pageVisible.value) {
        status.value = 'paused'
        return
      }
      if (roundBudget <= 0 && records.length > roundStart) {
        status.value = 'budget'
        return
      }
      status.value = 'scanning'
      const accountId = dependencies.getAccountId()
      if (accountId === null) {
        status.value = 'failed'
        return
      }
      let page = task.page + 1
      const repairFrom = task.repairThrough === undefined ? undefined : page
      const read = controller = new AbortController()
      let result: FavoritesResult
      const repairedItems: FavoriteItem[] = []
      const repairedPages = new Map<number, string[]>()
      const sourceKeys = repairFrom === undefined ? task.keys : new Set([...task.pages].filter(([pn]) => pn < page).flatMap(([, keys]) => keys))
      try {
        do {
          const params = {
            media_id: task.sourceId,
            pn: page,
            ps: FILTER_PAGE_SIZE,
            keyword: '',
            type: 0,
            order: dependencies.getOrder(),
            tid: task.tid ?? 0,
          }
          result = await dependencies.api.getFavoriteResources(params, { signal: read.signal })
          if (!isCurrent(version))
            return
          if (result.code !== 0 || !result.data || typeof result.data.has_more !== 'boolean' || (result.data.medias !== null && !Array.isArray(result.data.medias)))
            throw new Error('favorite-filter-page-unavailable')
          const raw = result.data.medias ?? []
          const keys = raw.map(getFavoriteResourceKey)
          const newKeys = keys.filter(key => !sourceKeys.has(key))
          if ((raw.length > 0 && !newKeys.length) || (!raw.length && result.data.has_more)) {
            dependencies.invalidatePage(params)
            status.value = 'stalled'
            return
          }
          keys.forEach(key => sourceKeys.add(key))
          repairedItems.push(...raw)
          repairedPages.set(page, keys)
          if (!result.data.has_more || page >= (task.repairThrough ?? page))
            break
          page++
        } while (isCurrent(version))
      }
      catch {
        if (isCurrent(version))
          status.value = 'failed'
        return
      }
      finally {
        if (controller === read)
          controller = undefined
      }
      if (!isCurrent(version))
        return
      if (result.code !== 0 || !result.data) {
        status.value = 'failed'
        return
      }
      const medias = repairedItems
      roundBudget--
      if (result.data.has_more && !medias.length) {
        status.value = 'stalled'
        return
      }
      if (repairFrom !== undefined) {
        const stale = new Set([...task.pages].filter(([pn]) => pn >= repairFrom).flatMap(([, keys]) => keys))
        for (let index = records.length - 1; index >= 0; index--) {
          const record = records[index]
          if (record.sourceId === task.sourceId && record.tid === task.tid && stale.has(getFavoriteResourceKey(record.item))) {
            recordKeys.delete(getFavoriteFilterRecordKey(record.sourceId, getFavoriteResourceKey(record.item)))
            records.splice(index, 1)
          }
        }
        for (const pn of task.pages.keys()) {
          if (pn >= repairFrom)
            task.pages.delete(pn)
        }
        task.repairThrough = undefined
      }
      const taskIndex = tasks.indexOf(task)
      let insertAt = repairFrom === undefined ? records.length : records.findIndex(record => tasks.findIndex(entry => entry.sourceId === record.sourceId && entry.tid === record.tid) > taskIndex)
      if (insertAt < 0)
        insertAt = records.length
      for (const item of medias) {
        const record: FavoriteFilterRecord = { item, sourceId: task.sourceId, tid: task.tid }
        if (!predicate(record))
          continue
        const key = getFavoriteFilterRecordKey(task.sourceId, getFavoriteResourceKey(item))
        if (!recordKeys.has(key)) {
          recordKeys.add(key)
          sourceByItem.set(item, task.sourceId)
          records.splice(insertAt++, 0, record)
        }
      }
      task.page = page
      task.keys = sourceKeys
      repairedPages.forEach((keys, pn) => task.pages.set(pn, keys))
      task.done = !result.data.has_more
    }
  }

  function apply(query: FavoriteFilterQuery) {
    if (getFavoriteFilterKey(query) === getFavoriteFilterKey(applied.value) && identity === computeIdentity())
      return
    applied.value = query
    if (!isFavoriteFilterActive(query)) {
      reset()
      return
    }
    prepare()
  }

  function refresh() {
    if (active.value && dependencies.isActive())
      prepare()
    else
      reset()
  }

  function continueScan() {
    if (!active.value || !dependencies.isActive())
      return
    if (identity !== computeIdentity()) {
      prepare()
      return
    }
    if (status.value === 'complete' || status.value === 'scanning')
      return
    roundBudget = FILTER_AUTO_PAGE_BUDGET
    roundStart = records.length
    generation++
    status.value = 'scanning'
    return pump(generation)
  }

  function getSourceId(item: FavoriteItem): number | undefined {
    return sourceByItem.get(toRaw(item))
  }

  function getItemKey(item: FavoriteItem): string {
    const sourceId = getSourceId(item)
    return sourceId === undefined ? getFavoriteResourceKey(item) : getFavoriteFilterRecordKey(sourceId, getFavoriteResourceKey(item))
  }

  function applyResourceWrite(command: { kind: 'delete' | 'move' | 'copy' | 'restore' | 'clean', sourceId: number, targetId?: number, resourceKeys: readonly string[] }) {
    const affected = new Set([...(command.kind !== 'copy' ? [command.sourceId] : []), ...(command.targetId ? [command.targetId] : [])])
    invalidatePartitions([...affected])
    if (!tasks.some(task => affected.has(task.sourceId)))
      return
    generation++
    cancelRead()
    const keys = new Set(command.resourceKeys)
    const removes = command.kind === 'delete' || command.kind === 'move'
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index]
      if (removes && record.sourceId === command.sourceId && keys.has(getFavoriteResourceKey(record.item))) {
        recordKeys.delete(getFavoriteFilterRecordKey(record.sourceId, getFavoriteResourceKey(record.item)))
        records.splice(index, 1)
      }
    }
    for (const task of tasks) {
      if (!affected.has(task.sourceId))
        continue
      const firstAffected = removes && task.sourceId === command.sourceId
        ? [...task.pages].find(([, pageKeys]) => pageKeys.some(key => keys.has(key)))?.[0] ?? 1
        : 1
      task.repairThrough = Math.max(task.repairThrough ?? 1, task.page, 1)
      task.page = Math.min(task.page, firstAffected - 1)
      task.done = false
    }
    roundBudget = FILTER_AUTO_PAGE_BUDGET
    roundStart = records.length
    status.value = 'paused'
    return continueScan()
  }

  function invalidateSources(sourceIds = dependencies.getSourceIds()) {
    invalidatePartitions(sourceIds)
    const affected = new Set(sourceIds)
    if (!tasks.some(task => affected.has(task.sourceId)))
      return
    generation++
    cancelRead()
    for (const task of tasks) {
      if (!affected.has(task.sourceId))
        continue
      task.repairThrough = Math.max(task.repairThrough ?? 1, task.page, 1)
      task.page = 0
      task.done = false
    }
    status.value = 'paused'
    continueScan()
  }

  function partitionIdentity() {
    return JSON.stringify([dependencies.getAccountId(), dependencies.isActive(), dependencies.getScope(), [...new Set(dependencies.getSourceIds())].sort((a, b) => a - b)])
  }

  function cancelPartitions() {
    partitionGeneration++
    partitionController?.abort()
    partitionController = undefined
    partitionTask = undefined
    partitionResultKey = ''
    partitionsLoading.value = false
    partitionsFailed.value = false
  }

  function loadPartitions(): Promise<void> {
    partitionsRequested = true
    const key = partitionIdentity()
    if (partitionTask?.key === key)
      return partitionTask.promise
    if (partitionResultKey === key)
      return Promise.resolve()
    cancelPartitions()
    const accountId = dependencies.getAccountId()
    const sourceIds = [...new Set(dependencies.getSourceIds())]
    const version = partitionGeneration
    const read = partitionController = new AbortController()
    if (disposed || !dependencies.isActive() || accountId === null || !sourceIds.length) {
      partitions.value = []
      partitionController = undefined
      return Promise.resolve()
    }
    partitionsLoading.value = true
    const groups: FavoritePartitionOption[][] = []
    let failed = false
    const queue = [...sourceIds]
    const current = () => !disposed && version === partitionGeneration && key === partitionIdentity()
    const worker = async (signal: AbortSignal) => {
      while (queue.length && !signal.aborted && current()) {
        const sourceId = queue.shift()!
        const cacheKey = `${accountId}:${sourceId}`
        const cached = partitionCache.get(cacheKey)
        if (cached) {
          groups.push(cached)
          continue
        }
        try {
          const parsed = parseFavoritePartitions(await dependencies.api.getFavoritePartitions({ up_mid: String(accountId), media_id: sourceId }, { signal }))
          if (!current() || signal.aborted)
            return
          if (!parsed) {
            failed = true
            continue
          }
          partitionCache.delete(cacheKey)
          partitionCache.set(cacheKey, parsed)
          while (partitionCache.size > PARTITION_CACHE_LIMIT)
            partitionCache.delete(partitionCache.keys().next().value!)
          groups.push(parsed)
        }
        catch {
          failed = true
        }
      }
    }
    const promise = (async () => {
      try {
        await withRequestDeadline(signal => Promise.all(Array.from({ length: Math.min(PARTITION_CONCURRENCY, sourceIds.length) }, () => worker(signal))), { signal: read.signal })
      }
      catch {
        failed = true
      }
      finally {
        if (current()) {
          partitions.value = mergeFavoritePartitions(groups)
          partitionsFailed.value = failed
          partitionsLoading.value = false
          partitionResultKey = key
          partitionController = undefined
          partitionTask = undefined
        }
      }
    })()
    partitionTask = { key, promise }
    return promise
  }

  function invalidatePartitions(sourceIds?: readonly number[]) {
    cancelPartitions()
    if (sourceIds) {
      const account = dependencies.getAccountId()
      for (const id of sourceIds)
        partitionCache.delete(`${account}:${id}`)
    }
    else {
      partitionCache.clear()
    }
    if (partitionsRequested && !disposed)
      void loadPartitions()
  }

  let partitionAccount = dependencies.getAccountId()
  const stopPartitions = watch(partitionIdentity, () => {
    if (partitionAccount !== dependencies.getAccountId()) {
      partitionAccount = dependencies.getAccountId()
      partitionCache.clear()
    }
    cancelPartitions()
    partitions.value = []
    if (partitionsRequested)
      void loadPartitions()
  }, { flush: 'post' })

  function retryPartitions() {
    // Successful sources stay cached; only missing/failed sources need another read.
    partitionResultKey = ''
    return loadPartitions()
  }

  watch(pageVisible, (visible) => {
    if (visible && status.value === 'paused')
      continueScan()
  })

  return {
    applied,
    active,
    status,
    items,
    partitions,
    partitionsLoading,
    partitionsFailed,
    apply,
    refresh,
    continueScan,
    getSourceId,
    getItemKey,
    applyResourceWrite,
    invalidateSources,
    loadPartitions,
    retryPartitions,
    dispose() {
      disposed = true
      stopPartitions()
      reset()
      cancelPartitions()
      partitionCache.clear()
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', updateVisibility)
    },
  }
}
