import assert from 'node:assert/strict'
import { glob, readFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { effectScope, nextTick, ref, shallowReactive, watch } from 'vue'

import { useLibraryBatchSelection } from '../src/composables/useLibraryBatchSelection'
import { useFavoriteFilterScan } from '../src/contentScripts/views/Favorites/useFavoriteFilterScan'
import { useHistoryTimeline } from '../src/contentScripts/views/History/useHistoryTimeline'
import type { List as HistoryItem } from '../src/models/history/history'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { findTokenReferenceViolations } from './tokenReferencePolicy'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const item = (id: number) => ({ kid: id, title: `Video ${id}`, view_at: 1_793_232_000 - id, duration: 100, progress: 0, history: { business: 'archive', oid: id, bvid: `BV${id}`, dt: 2 } }) as HistoryItem

export async function verifyAuditOptimizations() {
  const scope = effectScope()
  let account = 1
  let reads = 0
  let deleted = 0
  let cleared = 0
  let exit = deferred<void>()
  const dependencies = {
    api: {
      getHistoryList: async () => {
        reads++
        return { code: 0, data: { list: [item(1), item(2)], cursor: { max: 2, view_at: 1_793_232_000, business: 'archive' } } }
      },
      deleteHistoryItem: async () => ({ code: 0 }),
      clearAllHistory: async () => ({ code: 0 }),
      getHistoryPauseStatus: async () => ({ code: 0, data: false }),
    } as Parameters<typeof useHistoryTimeline>[0]['api'],
    getAccountId: () => account,
    getCSRF: () => 'fixture',
    haveScrollbar: async () => true,
    onWriteError: (error: unknown) => assert.fail(String(error)),
    onDeleted: () => { deleted++ },
    onCleared: () => { cleared++ },
    getGroupInterval: () => 'day' as const,
    getSortOrder: () => 'newest' as const,
    beforeRemove: () => exit.promise,
  }
  try {
    const timeline = scope.run(() => useHistoryTimeline(dependencies))!
    await timeline.load()
    await timeline.deleteSelectedHistoryItem('archive_1')
    const committing = timeline.commitSelectedHistoryItems()
    const saved = timeline.snapshot()
    assert.deepEqual(saved.items.map(record => record.kid), [2])
    assert.equal(timeline.historyList.length, 2, 'visible rows stay until the exit releases them')
    assert.equal(deleted, 1, 'the confirmed write updates local history before its animation ends')
    timeline.dispose()
    exit.resolve()
    await committing
    const restored = scope.run(() => useHistoryTimeline(dependencies))!
    restored.activate(saved)
    assert.deepEqual(restored.historyList.map(record => record.kid), [2])
    assert.equal(reads, 1, 'restoration needs no compensating network request')
    restored.dispose()

    exit = deferred<void>()
    const single = scope.run(() => useHistoryTimeline(dependencies))!
    await single.load()
    const removing = single.deleteHistoryItem(single.historyList[0])
    await nextTick()
    assert.deepEqual(single.snapshot().items.map(record => record.kid), [2])
    account = 2
    single.resetAccount()
    exit.resolve()
    await removing
    assert.equal(single.historyList.length, 0, 'a late animation cannot mutate the next account')
    single.dispose()

    exit = deferred<void>()
    const clearing = scope.run(() => useHistoryTimeline(dependencies))!
    await clearing.load()
    const clear = clearing.clearAllHistory()
    await nextTick()
    const clearedSnapshot = clearing.snapshot()
    assert.equal(clearedSnapshot.items.length, 0)
    assert.equal(clearedSnapshot.noMoreContent, true)
    assert.equal(cleared, 1)
    clearing.dispose()
    exit.resolve()
    await clear

    const requests: Array<{ view_at?: number }> = []
    const dated = scope.run(() => useHistoryTimeline({
      ...dependencies,
      api: { ...dependencies.api, getHistoryList: async (params) => {
        requests.push(params!)
        return { code: 0, data: { list: [], cursor: { max: 0, view_at: 0, business: '' } } }
      } },
    }))!
    dated.filters.value = { duration: 'all', period: 'custom', startDate: '2026-10-01', endDate: '', device: 'all' }
    await dated.load(true)
    assert.equal(requests[0].view_at, 0)
    dated.filters.value.endDate = '2026-10-02'
    await dated.load(true)
    assert.ok(Number.isFinite(requests[1].view_at) && requests[1].view_at! > 0)
    dated.dispose()
    console.log('PASS audit history: confirmed single/batch/clear snapshots, account changes and open-ended date refresh')
  }
  finally { scope.stop() }

  const batchScope = effectScope()
  const commit = deferred<void>()
  const batch = batchScope.run(() => useLibraryBatchSelection({ keys: () => [1, 2], captureOwner: () => ({ isCurrent: () => true }), remove: async () => true, commit: () => commit.promise }))!
  batch.toggleManaging()
  batch.toggleAll()
  const removal = batch.removeSelected()
  await nextTick()
  await nextTick()
  assert.equal(batch.busy.value, true)
  commit.resolve()
  await removal
  assert.equal(batch.busy.value, false)
  assert.equal(batch.selected.value.size, 0)
  batchScope.stop()
  console.log('PASS audit batch: controls remain busy until the asynchronous local commit settles')

  let calls = 0
  let response = { code: 0, data: { items: [{ sub_items: [{ episode_id: 1 }] }], coursor: 0, has_next: true } }
  const anime = await loadSourceFunctions('../src/contentScripts/views/Anime/Anime.vue', ['recommendationKey', 'getRecommendAnimeList', 'handleAnimeReachBottom'], {
    animeMounted: true,
    requestGeneration: 1,
    animeController: new AbortController(),
    getAnimeAccountId: () => 1,
    isAnimeRequestCurrent: () => true,
    isLoadingRecommendAnime: ref(false),
    recommendRequestFailed: ref(false),
    recommendAnimeList: shallowReactive([]),
    recommendationKeys: new Set(),
    recommendationCursors: new Set(),
    cursor: ref(0),
    noMoreContent: ref(false),
    recommendationsLoaded: ref(false),
    reportRuntimeFailure: assert.fail,
    api: { anime: { getRecommendAnimeList: async () => {
      calls++
      return response
    } } },
  })
  await anime.handleAnimeReachBottom()
  await anime.handleAnimeReachBottom()
  assert.equal(calls, 1)
  assert.equal(anime.recommendAnimeList.length, 1)
  assert.equal(anime.recommendRequestFailed.value, true)
  response = { code: 0, data: { items: [{ sub_items: [{ episode_id: 1 }, { episode_id: 2 }] }], coursor: 2, has_next: true } }
  assert.equal(await anime.getRecommendAnimeList(), true)
  assert.equal(anime.recommendAnimeList.length, 2)
  response = { code: 0, data: { items: [{ sub_items: [{ episode_id: 3 }] }], coursor: 2, has_next: false } }
  await anime.getRecommendAnimeList()
  assert.equal(anime.recommendAnimeList.length, 3, 'the terminal page is consumed even when its cursor repeats')
  assert.equal(anime.noMoreContent.value, true)
  await anime.handleAnimeReachBottom()
  assert.equal(calls, 3)
  console.log('PASS audit anime: stalled cursors stop auto-load, retry deduplicates and terminal rows survive')

  const filterScope = effectScope()
  let notifications = 0
  const scan = filterScope.run(() => useFavoriteFilterScan({
    api: { getFavoritePartitions: async () => ({ code: 0, data: [] }), getFavoriteResources: async () => ({ code: 0, data: {
      medias: Array.from({ length: 40 }, (_, index) => ({ id: index + 1, type: 2, title: `Video ${index}`, upper: { mid: 1, name: 'fixture' } })),
      has_more: false,
    } }) },
    invalidatePage() {},
    getAccountId: () => 1,
    getSourceIds: () => [1],
    getScope: () => 'current',
    getOrder: () => 'mtime',
    getNormalQuery: () => '',
    isActive: () => true,
  }))!
  filterScope.run(() => watch(() => scan.items.value.length, () => notifications++, { flush: 'sync' }))
  scan.apply({ mids: [1], tids: [] })
  await nextTick()
  await nextTick()
  assert.equal(scan.items.value.length, 40)
  assert.equal(notifications, 1, 'a fetched page publishes once, not once per result')
  scan.dispose()
  filterScope.stop()
  console.log('PASS audit favorite scan: one reactive publication for a 40-row page')

  const repairScope = effectScope()
  const sourcesById = new Map([1, 2, 3].map(source => [source, Array.from({ length: 40 }, (_, index) => ({ id: source * 100 + index, type: 2, title: 'fixture', upper: { mid: 1, name: 'fixture' } }))]))
  const repair = repairScope.run(() => useFavoriteFilterScan({
    api: {
      getFavoritePartitions: async () => ({ code: 0, data: [] }),
      getFavoriteResources: async params => ({ code: 0, data: { medias: sourcesById.get(params!.media_id!), has_more: false } }),
    },
    invalidatePage() {},
    getAccountId: () => 1,
    getSourceIds: () => [1, 2, 3],
    getScope: () => 'all',
    getOrder: () => 'mtime',
    getNormalQuery: () => '',
    isActive: () => true,
  }))!
  repair.apply({ mids: [1], tids: [] })
  for (let turn = 0; turn < 10 && repair.status.value !== 'complete'; turn++)
    await nextTick()
  assert.equal(repair.items.value.length, 120)
  sourcesById.set(2, sourcesById.get(2)!.slice(1))
  await repair.applyResourceWrite({ kind: 'delete', sourceId: 2, resourceKeys: ['200:2'] })
  assert.deepEqual(repair.items.value.map(item => item.id), [...sourcesById.values()].flat().map(item => item.id))
  assert.equal(new Set(repair.items.value.map(repair.getItemKey)).size, 119)
  repair.dispose()
  repairScope.stop()
  console.log('PASS audit favorite repair: deletion preserves source order, resource identity and unique rows')

  const [pagination, input, button, radio, colors] = await Promise.all([
    'src/contentScripts/views/SearchResults/components/Pagination.vue',
    'src/components/Input.vue',
    'src/components/Button.vue',
    'src/components/Radio.vue',
    'src/components/Settings/Appearance/AppearanceColorField.vue',
  ].map(path => readFile(path, 'utf8')))
  assert.match(pagination, /@container \(max-width: 560px\)/)
  assert.doesNotMatch(pagination, /--bew-elevated-[12]|border-color: var\(--bew-selected-bg\)/)
  assert.match(input, /:has\(input:focus-visible\)[\s\S]*background-color: var\(--bew-input-bg-hover\)/)
  assert.match(button, /&:focus-visible \{[^}]*background-color:/)
  assert.match(radio, /&:focus-visible \+ \.radio-switch \{[^}]*background:/)
  assert.doesNotMatch(colors, /box-shadow: 0 0 0 var\(--bew-space-1\)/)
  console.log('PASS audit controls: narrow pagination, role tokens and borderless keyboard feedback')
  const sources = []
  for await (const file of glob('src/**/*.{vue,ts,scss,css}'))
    sources.push(file)
  assert.deepEqual(await findTokenReferenceViolations(sources), [])
  console.log(`PASS audit tokens: required references resolve across ${sources.length} source files`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await verifyAuditOptimizations()
