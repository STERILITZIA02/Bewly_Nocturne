import { computed, reactive, ref, shallowRef, toRaw, watch } from 'vue'

import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import type { AccountId } from '~/utils/accountScope'
import type api from '~/utils/api'
import { getFavoriteResourceKey } from '~/utils/favoriteResource'

import type { FavoriteFilterQuery, FavoriteFilterRecord, FavoritePartitionOption } from './favoriteFilter'
import { compileFavoriteFilter, EMPTY_FAVORITE_FILTER, getFavoriteFilterKey, getFavoriteFilterRecordKey, isFavoriteFilterActive, mergeFavoritePartitions, parseFavoritePartitions } from './favoriteFilter'
import type { FavoriteVideoOrder } from './otherFavorites'
import type { FavoriteWrite } from './useFavoriteWrites'

export type FavoriteFilterScanStatus = 'idle' | 'scanning' | 'paused' | 'budget' | 'complete' | 'failed' | 'stalled'

interface FavoriteFilterScanDependencies {
  api: Pick<typeof api.favorite, 'getFavoriteResources' | 'getFavoritePartitions'>
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
  const records = reactive<FavoriteFilterRecord[]>([])
  const partitions = shallowRef<FavoritePartitionOption[]>([])
  const partitionsLoading = ref(false)
  const partitionsFailed = ref(false)
  const recordKeys = new Map<string, number>()
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
    tasks = dependencies.getSourceIds().flatMap(sourceId => tids.map(tid => ({ sourceId, tid, page: 0, done: false })))
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
      const page = task.page + 1
      const read = controller = new AbortController()
      let result: FavoritesResult
      try {
        result = await dependencies.api.getFavoriteResources({
          media_id: task.sourceId,
          pn: page,
          ps: FILTER_PAGE_SIZE,
          keyword: '',
          type: 0,
          order: dependencies.getOrder(),
          tid: task.tid ?? 0,
        }, { signal: read.signal })
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
      const medias = Array.isArray(result.data.medias) ? result.data.medias.filter((item): item is FavoriteItem => item != null) : []
      roundBudget--
      if (result.data.has_more && !medias.length) {
        status.value = 'stalled'
        return
      }
      for (const item of medias) {
        const record: FavoriteFilterRecord = { item, sourceId: task.sourceId, tid: task.tid }
        if (!predicate(record))
          continue
        const key = getFavoriteFilterRecordKey(task.sourceId, getFavoriteResourceKey(item))
        const index = recordKeys.get(key)
        if (index === undefined) {
          recordKeys.set(key, records.length)
          sourceByItem.set(item, task.sourceId)
          records.push(record)
        }
      }
      task.page = page
      task.done = !result.data.has_more
    }
  }

  function apply(query: FavoriteFilterQuery) {
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
    void pump(generation)
  }

  function getSourceId(item: FavoriteItem): number | undefined {
    return sourceByItem.get(toRaw(item))
  }

  function getItemKey(item: FavoriteItem): string {
    const sourceId = getSourceId(item)
    return sourceId === undefined ? getFavoriteResourceKey(item) : getFavoriteFilterRecordKey(sourceId, getFavoriteResourceKey(item))
  }

  function applyResourceWrite(command: Extract<FavoriteWrite, { sourceId: number }>) {
    if (command.kind === 'copy' || !records.length)
      return
    const keys = new Set(command.resourceKeys)
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index]
      if (record.sourceId === command.sourceId && keys.has(getFavoriteResourceKey(record.item)))
        records.splice(index, 1)
    }
    recordKeys.clear()
    records.forEach((record, index) => recordKeys.set(getFavoriteFilterRecordKey(record.sourceId, getFavoriteResourceKey(record.item)), index))
  }

  async function loadPartitions() {
    const accountId = dependencies.getAccountId()
    const sourceIds = dependencies.getSourceIds()
    const version = ++partitionGeneration
    partitionController?.abort()
    const read = partitionController = new AbortController()
    if (accountId === null || !sourceIds.length) {
      partitions.value = []
      return
    }
    partitionsLoading.value = true
    partitionsFailed.value = false
    const groups: FavoritePartitionOption[][] = []
    let failed = false
    const queue = [...sourceIds]
    const worker = async () => {
      while (queue.length && !read.signal.aborted) {
        const sourceId = queue.shift()!
        const key = `${accountId}:${sourceId}`
        const cached = partitionCache.get(key)
        if (cached) {
          groups.push(cached)
          continue
        }
        try {
          const parsed = parseFavoritePartitions(await dependencies.api.getFavoritePartitions({ up_mid: String(accountId), media_id: sourceId }, { signal: read.signal }))
          if (!parsed) {
            failed = true
            continue
          }
          partitionCache.delete(key)
          partitionCache.set(key, parsed)
          while (partitionCache.size > PARTITION_CACHE_LIMIT)
            partitionCache.delete(partitionCache.keys().next().value!)
          groups.push(parsed)
        }
        catch {
          failed = true
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARTITION_CONCURRENCY, sourceIds.length) }, worker))
    if (version !== partitionGeneration || accountId !== dependencies.getAccountId())
      return
    partitions.value = mergeFavoritePartitions(groups)
    partitionsFailed.value = failed
    partitionsLoading.value = false
  }

  function invalidatePartitions() {
    partitionCache.clear()
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
    records,
    partitions,
    partitionsLoading,
    partitionsFailed,
    apply,
    refresh,
    reset,
    continueScan,
    getSourceId,
    getItemKey,
    applyResourceWrite,
    loadPartitions,
    invalidatePartitions,
    dispose() {
      reset()
      partitionGeneration++
      partitionController?.abort()
      partitionCache.clear()
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', updateVisibility)
    },
  }
}
