import assert from 'node:assert/strict'

import { countOpenTabsTask, selectOpenTabsTaskItems } from '../src/constants/openTabsWatchLater'
import { createHistoryFilters, historyDateBounds, historyRangeBounds, matchesHistoryFilters } from '../src/contentScripts/views/History/historyFilters'
import { createHistoryGroupIndex } from '../src/contentScripts/views/History/historyGroups'
import { createWatchLaterFilters, filterWatchLaterItems, sortWatchLaterItems, watchLaterAddedBounds, watchLaterPlaybackState } from '../src/contentScripts/views/WatchLater/watchLaterFilters'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerLibraryToolChecks(check, { Vue, compileComponent, flush }) {
  check('rail filter menu: titled single-choice groups, a pending option rings, an action option runs, and opening is reported', async () => {
    const shown = []
    const Menu = await compileComponent('../src/components/LibraryFilterMenu.vue', {
      '~/components/ContextMenu.vue': { default: { props: ['options', 'anchor', 'trigger'], emits: ['select', 'close'], setup(props, { emit }) {
        shown.push({ props, emit })
        return () => null
      } } },
    })
    const events = []
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Menu, {
      label: 'Filters',
      groups: [
        { key: 'scope', title: 'Scope', value: 'current', options: [{ value: 'current', label: 'Current', icon: 'i-a' }, { value: 'all', label: 'All', icon: 'i-b' }] },
        { key: 'partition', title: 'Partition', value: 'all', options: [{ value: 'all', label: 'All', icon: 'i-c', pending: true }, { value: 'retry', label: 'Retry', icon: 'i-d', action: true }] },
      ],
      onOpen: () => events.push(['open']),
      onSelect: (key, value) => events.push([key, value]),
    }) })
    app.mount(host)
    try {
      host.querySelector('button').click()
      await flush()
      assert.deepEqual(events, [['open']])
      const options = shown.at(-1).props.options
      assert.deepEqual(options.map(option => [option.value, option.section, option.kind, option.checked]), [
        ['scope:current', 'Scope', 'radio', true],
        ['scope:all', 'Scope', 'radio', false],
        ['partition:all', 'Partition', 'radio', true],
        ['partition:retry', 'Partition', undefined, undefined],
      ])
      assert.equal(options[2].pending, true, 'a group still loading rings in its check')
      assert.ok(options.every(option => option.closeOnSelect === false), 'the menu stays open while choices apply')
      shown.at(-1).emit('select', 'partition:retry')
      assert.deepEqual(events.at(-1), ['partition', 'retry'])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('Favorites filter scan: a round stops only with new matches, then reads on when the grid asks for more; no manual pause', async () => {
    const scanModule = await loadSourceModule('../src/contentScripts/views/Favorites/useFavoriteFilterScan.ts', {
      vue: Vue,
      '~/utils/favoriteResource': await import('../src/utils/favoriteResource'),
      './favoriteFilter': await import('../src/contentScripts/views/Favorites/favoriteFilter'),
    })
    const reads = []
    // Thirty one-item pages; only pages 27 and 29 match the uploader.
    const api = {
      getFavoriteResources: async ({ pn }) => {
        reads.push(pn)
        return { code: 0, data: { has_more: pn < 30, medias: [{ id: pn, type: 2, title: `v${pn}`, upper: { mid: pn === 27 || pn === 29 ? 7 : 1, name: 'up' } }] } }
      },
      getFavoritePartitions: async () => ({ code: 0, data: [] }),
    }
    const scope = Vue.effectScope()
    const scan = scope.run(() => scanModule.useFavoriteFilterScan({ api, getAccountId: () => 1, getSourceIds: () => [5], getScope: () => 'current', getOrder: () => 'mtime', getNormalQuery: () => '', isActive: () => true }))
    const settle = async () => {
      for (let index = 0; index < 400 && scan.status.value === 'scanning'; index++)
        await new Promise(resolve => setTimeout(resolve, 0))
    }
    assert.equal(scan.pause, undefined)
    assert.equal(scan.scannedItems, undefined, 'no progress counts to show')
    scan.apply({ mids: [7], tids: [] })
    await settle()
    assert.equal(scan.status.value, 'budget')
    assert.equal(reads.length, 27, 'past the page budget until the first match, so the grid is never left empty')
    assert.deepEqual(Array.from(scan.items.value, item => item.id), [27])
    scan.continueScan()
    await settle()
    assert.equal(scan.status.value, 'complete')
    assert.deepEqual(Array.from(scan.items.value, item => item.id), [27, 29])
    scan.dispose()
    scope.stop()
  })
  check('history recording status: unknown stays unknown, pending serializes writes, mismatched readback reports failure', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    const reads = []
    const errors = []
    let posts = 0
    const timeline = useHistoryTimeline({ getGroupInterval: () => 'day', getSortOrder: () => 'newest', api: {
      getHistoryPauseStatus: () => new Promise(resolve => reads.push(resolve)),
      setHistoryPauseStatus: async () => {
        posts++
        return { code: 0 }
      },
    }, getAccountId: () => 1, getCSRF: () => 'fixture', haveScrollbar: async () => true, onWriteError: error => errors.push(error) })
    try {
      let read = timeline.getHistoryPauseStatus()
      assert.equal(timeline.isReadingStatus.value, true)
      reads[0]({ code: -503 })
      await read
      assert.equal(timeline.historyStatus.value, undefined)
      assert.equal(timeline.isReadingStatus.value, false)
      read = timeline.getHistoryPauseStatus()
      reads[1]({ code: 0, data: false })
      await read
      const write = timeline.setHistoryPauseStatus(true)
      await timeline.setHistoryPauseStatus(true)
      assert.equal(posts, 1)
      await flush()
      reads[2]({ code: 0, data: false })
      await write
      assert.equal(errors.length, 1)
      assert.equal(timeline.historyStatus.value, false)
      assert.equal(timeline.isUpdatingStatus.value, false)
    }
    finally { timeline.dispose() }
  })

  check('WatchLater bulk actions: confirmation locks repeat submissions and keeps its original account/credentials', async () => {
    const { useWatchLaterBulkAction } = await import('../src/contentScripts/views/WatchLater/useWatchLaterBulkAction')
    const { createAccountLifetime } = await import('../src/utils/accountLifetime')
    let account = 1
    let csrf = 'first'
    const lifetime = createAccountLifetime(() => account)
    const confirms = []
    const writes = []
    const errors = []
    const action = useWatchLaterBulkAction({ capture: lifetime.capture, getCSRF: () => csrf, blocked: () => false, confirm: () => new Promise(resolve => confirms.push(resolve)), submit: (kind, owner, token) => new Promise((resolve, reject) => writes.push({ kind, owner, token, resolve, reject })), onError: error => errors.push(error) })
    let running = action.run('clear')
    await action.run('viewed')
    assert.equal(confirms.length, 1)
    account = 2
    confirms[0](true)
    await running
    assert.equal(writes.length, 0, 'account changed while the confirmation was open')
    running = action.run('viewed')
    csrf = 'second'
    confirms[1](true)
    await flush()
    assert.equal(writes[0].token, 'first')
    await action.run('clear')
    assert.equal(confirms.length, 2)
    writes[0].reject(new Error('server refused'))
    await running
    assert.equal(errors.length, 1)
    assert.equal(action.pending.value, false)
    running = action.run('clear')
    action.reset()
    confirms[2](true)
    await running
    assert.equal(writes.length, 1, 'disposed confirmation cannot write')
    lifetime.dispose()
  })

  check('history refresh preserves exhausted old results on failure and retry restarts at the latest cursor', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    const reads = []
    const item = id => ({ view_at: id, title: String(id), history: { business: 'archive', oid: id } })
    const timeline = useHistoryTimeline({ getGroupInterval: () => 'day', getSortOrder: () => 'newest', api: { getHistoryList: params => new Promise(resolve => reads.push({ params, resolve })) }, getAccountId: () => 1, getCSRF: () => '', haveScrollbar: async () => true, onWriteError: assert.fail })
    try {
      const initial = timeline.load()
      reads[0].resolve({ code: 0, data: { list: [item(1)], cursor: { max: 1, view_at: 1, business: 'archive' } } })
      await initial
      const tail = timeline.load()
      reads[1].resolve({ code: 0, data: { list: [], cursor: { max: 0, view_at: 0, business: '' } } })
      await tail
      assert.equal(timeline.noMoreContent.value, true)
      const refresh = timeline.refreshCurrentMode()
      assert.equal(timeline.historyList[0].history.oid, 1)
      reads[2].resolve({ code: -503 })
      await refresh
      assert.equal(timeline.historyList[0].history.oid, 1)
      const retry = timeline.retry()
      assert.equal(reads[3].params.view_at, 0)
      reads[3].resolve({ code: 0, data: { list: [item(2)], cursor: { max: 2, view_at: 2, business: 'archive' } } })
      await flush()
      reads[4].resolve({ code: 0, data: { list: [], cursor: { max: 0, view_at: 0, business: '' } } })
      await retry
      assert.deepEqual(timeline.historyList.map(item => item.history.oid), [2])
    }
    finally { timeline.dispose() }
  })

  check('WatchLater refresh stages a loaded prefix and preserves it on partial failure or account changes', async () => {
    const { normalizeWatchLaterItem, mergeWatchLaterItemsByAid } = await import('../src/utils/watchLaterList')
    const item = aid => ({ aid, bvid: `BV${aid}`, title: `Video ${aid}`, duration: 10 })
    const original = Array.from({ length: 40 }, (_, index) => item(index + 1))
    const calls = []
    const context = await loadSourceFunctions('../src/contentScripts/views/WatchLater/WatchLater.vue', [
      'getCurrentAccountId',
      'invalidateRequests',
      'isCurrentRequest',
      'handleWatchLaterPageRefresh',
    ], {
      topBarStore: { isLogin: true, userInfo: { mid: 1 } },
      getUserID: () => '1',
      watchLaterExtensionContextInvalidated: false,
      readController: undefined,
      loadingLibrary: false,
      requestGeneration: 0,
      AbortController,
      isLoading: Vue.ref(false),
      isRefreshing: Vue.ref(false),
      refreshFailed: Vue.ref(false),
      requestFailed: Vue.ref(false),
      requestStalled: Vue.ref(false),
      captureWatchLaterReadGeneration: () => 0,
      isWatchLaterReadCurrent: () => true,
      sourcePages: Vue.ref({}),
      noMoreContent: Vue.ref(false),
      pendingAction: Vue.ref(null),
      batch: { busy: Vue.ref(false) },
      bulkAction: { pending: Vue.ref(false) },
      requiresFullLibrary: Vue.ref(false),
      currentWatchLaterList: Vue.shallowRef(original),
      pageSize: Vue.ref(20),
      pageNum: Vue.ref(3),
      normalizeWatchLaterItem,
      mergeWatchLaterItemsByAid,
      settleExtensionContextInvalidation: () => false,
      loadCompleteLibrary: () => assert.fail('a partial view must not request the entire queue'),
      api: { watchlater: { getWatchLaterListByPage: (options, request) => new Promise(resolve => calls.push({ options, request, resolve })) } },
    })
    let pending = context.handleWatchLaterPageRefresh()
    assert.equal(context.isRefreshing.value, true)
    await context.handleWatchLaterPageRefresh()
    assert.equal(calls.length, 1)
    calls[0].resolve({ code: 0, data: { count: 100, list: [item(99), ...original.slice(0, 19)] } })
    await flush()
    assert.equal(context.currentWatchLaterList.value, original, 'even a successful first page stays staged')
    assert.equal(calls[1].options.pn, 2)
    calls[1].resolve({ code: -503 })
    await pending
    assert.equal(context.currentWatchLaterList.value, original)
    assert.equal(context.pageNum.value, 3)
    assert.equal(context.refreshFailed.value, true)
    pending = context.handleWatchLaterPageRefresh()
    calls[2].resolve({ code: 0, data: { count: 100, list: [item(99), ...original.slice(0, 19)] } })
    await flush()
    calls[3].resolve({ code: 0, data: { count: 100, list: original.slice(19, 39) } })
    await pending
    assert.deepEqual(Array.from(context.currentWatchLaterList.value, entry => entry.aid), [99, ...original.slice(0, 39).map(entry => entry.aid)])
    assert.equal(calls.length, 4, 'only the previously loaded prefix is reread')
    assert.equal(context.noMoreContent.value, false)
    assert.equal(context.pageNum.value, 3)
    assert.equal(context.isLoading.value, false)
    const refreshed = context.currentWatchLaterList.value
    pending = context.handleWatchLaterPageRefresh()
    context.topBarStore.userInfo.mid = 2
    context.invalidateRequests()
    calls[4].resolve({ code: 0, data: { count: 1, list: [item(777)] } })
    await pending
    assert.equal(context.currentWatchLaterList.value, refreshed, 'an old account response cannot replace the current view')
    assert.equal(calls[4].request.signal.aborted, true)
  })

  check('Moments hot search reuses shared interest, shows real loading/error states and retains cached rows during refresh', async () => {
    const state = { hotSearchList: Vue.ref([]), isLoadingHotSearch: Vue.ref(true), hotSearchFailed: Vue.ref(false) }
    let interest
    let releases = 0
    let retries = 0
    const Card = await compileComponent('../src/contentScripts/views/Moments/MomentsHotSearch.vue', {
      '~/logic': { settings: Vue.ref({ disableFrostedGlass: false }) },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/logic/searchExperience': { useSearchExperience: () => state, acquireSearchExperience: (value) => {
        interest = value
        return () => releases++
      }, loadSharedHotSearch: async (force) => {
        if (force)
          retries++
      } },
      '~/utils/searchNavigation': { resolveSearchNavigationTarget: keyword => `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}` },
      '~/components/ALink.vue': { default: { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) } },
      '~/components/Button.vue': { default: await compileComponent('../src/components/Button.vue') },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Card) })
    app.mount(host)
    try {
      assert.equal(Vue.toValue(interest.hotSearch), true)
      assert.equal(interest.recommendation, false)
      assert.equal(host.querySelectorAll('.moments-hot-search__loading-row').length, 10)
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 20)
      state.isLoadingHotSearch.value = false
      state.hotSearchFailed.value = true
      await flush()
      assert.ok(host.textContent.includes('common.load_failed'))
      host.querySelector('button').click()
      assert.equal(retries, 1)
      state.hotSearchFailed.value = false
      state.hotSearchList.value = [{ keyword: 'A & B', show_name: 'First trend', icon: '' }]
      state.isLoadingHotSearch.value = true
      await flush()
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 0)
      assert.equal(host.querySelector('a').getAttribute('href'), 'https://search.bilibili.com/all?keyword=A%20%26%20B')
      assert.ok(host.textContent.includes('First trend'))
    }
    finally {
      app.unmount()
      host.remove()
    }
    assert.equal(releases, 1)
  })
  check('Moments sidebar keeps category navigation when modules are hidden and preserves live/profile links and known loading data', async () => {
    const settings = Vue.ref({ momentsSidebarShowUserCard: true, momentsSidebarShowPublish: true, momentsSidebarShowLive: true })
    const Sidebar = await compileComponent('../src/contentScripts/views/Moments/MomentsSidebar.vue', {
      '~/logic': { settings },
      '~/logic/layoutEdit': { vLayoutEditable: {} },
      '~/utils/dataFormatter': { numFormatter: String },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
    })
    const selected = Vue.ref('all')
    const loading = Vue.ref(false)
    const user = Vue.ref({ mid: '42', name: 'Fixture user', face: 'https://i0.hdslb.com/bfs/face/test.jpg', following: '12', follower: '30', dyns: '7' })
    const liveUsers = Vue.ref([{ mid: '7', room_id: '99', jump_url: '', face: '', uname: 'Live fixture', title: 'Title' }])
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Sidebar, {
      modelValue: selected.value,
      'onUpdate:modelValue': value => selected.value = value,
      contentId: 'fixture-moments',
      loading: loading.value,
      user: user.value,
      liveUsers: liveUsers.value,
      liveCount: 1,
    }) })
    app.mount(host)
    try {
      assert.equal(host.querySelectorAll('[role="tab"]').length, 5, 'all, video, text & images, series, articles')
      host.querySelectorAll('[role="tab"]')[1].click()
      await flush()
      assert.equal(selected.value, 'video')
      assert.equal(host.querySelector('[aria-selected="true"]').getAttribute('aria-controls'), 'fixture-moments')
      assert.equal(host.querySelector('.moments-user-card__profile').href, 'https://space.bilibili.com/42')
      assert.equal(host.querySelector('.moments-live-row__link').href, 'https://live.bilibili.com/99')
      loading.value = true
      await flush()
      assert.ok(host.textContent.includes('Fixture user'))
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 0, 'known module contents stay readable during refresh')
      user.value = null
      liveUsers.value = []
      await flush()
      assert.ok(host.querySelectorAll('[data-bew-skeleton]').length > 0)
      settings.value = { momentsSidebarShowUserCard: false, momentsSidebarShowPublish: false, momentsSidebarShowLive: false }
      await flush()
      assert.equal(host.querySelector('.moments-sidebar__modules'), null)
      assert.ok(host.querySelector('[data-layout-editable-id="moments-sidebar"]'), 'hidden modules retain their layout editing entry')
      assert.equal(host.querySelectorAll('[role="tab"]').length, 5, 'all, video, text & images, series, articles')
      assert.equal(selected.value, 'video')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('history advanced filters compose device, duration and inclusive calendar bounds without mutating sort input', () => {
    const filters = { ...createHistoryFilters(), period: 'custom', startDate: '2026-09-27', endDate: '2026-09-29', duration: 'medium', device: 'phone' }
    const bounds = historyRangeBounds(filters)
    const item = { view_at: bounds.end, duration: 601, history: { business: 'archive', oid: 1, dt: 3 } }
    assert.equal(matchesHistoryFilters(item, 'all', bounds, filters), true)
    for (const patch of [{ duration: 600 }, { duration: 1801 }, { view_at: bounds.end + 1 }, { history: { ...item.history, dt: 2 } }, { history: { ...item.history, dt: 999 } }])
      assert.equal(matchesHistoryFilters({ ...item, ...patch }, 'all', bounds, filters), false)
    assert.equal(historyRangeBounds({ ...filters, endDate: '2026-02-30' }), null)
    assert.equal(historyRangeBounds({ ...filters, endDate: '2026-09-26' }), null)
    const yesterday = historyRangeBounds({ ...createHistoryFilters(), period: 'yesterday' }, new Date(2026, 9, 11, 14))
    assert.deepEqual(yesterday, historyDateBounds('2026-10-10'))
    const input = [{ ...item, view_at: 20 }, { ...item, view_at: 10 }]
    assert.deepEqual(createHistoryGroupIndex().reset(input, 'day', 'oldest').flatMap(group => group.items.map(item => item.view_at)), [10, 20])
    assert.deepEqual(input.map(item => item.view_at), [20, 10])
  })
  check('history batch deduplicates business keys, retains failed selection and stops pending writes on account change', async () => {
    const { useLibraryBatchSelection } = await import('../src/composables/useLibraryBatchSelection')
    const keys = Vue.ref(['archive_1', 'live_1', 'archive_1', 'pgc_2'])
    let account = 1
    let batch
    let release
    let pending = false
    const writes = []
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      batch = useLibraryBatchSelection({ keys: () => keys.value, captureOwner: () => {
        const owner = account
        return { isCurrent: () => owner === account }
      }, remove: async (key) => {
        writes.push(key)
        return pending ? new Promise(resolve => release = resolve) : key !== 'live_1'
      } })
      return () => null
    } })
    app.mount(host)
    try {
      batch.toggleManaging()
      batch.toggleAll()
      assert.equal(batch.selected.value.size, 3)
      await batch.removeSelected()
      assert.deepEqual(writes, ['archive_1', 'live_1'])
      assert.deepEqual([...batch.selected.value], ['live_1', 'pgc_2'])
      keys.value.push('archive_3')
      await flush()
      assert.equal(batch.selected.value.has('archive_3'), false)
      pending = true
      const running = batch.removeSelected()
      await batch.removeSelected()
      account++
      batch.reset()
      release(true)
      await running
      assert.deepEqual(writes, ['archive_1', 'live_1', 'live_1'])
      assert.equal(batch.selected.value.size, 0)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('Watch Later play-all preview keeps queue order, caps covers, reconciles remainder and handles image failure', async () => {
    const Card = await compileComponent('../src/contentScripts/views/WatchLater/WatchLaterPlayAllCard.vue', {
      '~/components/Button.vue': { default: await compileComponent('../src/components/Button.vue') },
      '~/utils/main': { removeHttpFromUrl: value => value },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
    })
    const items = Vue.ref([8, 3, 9, 4, 2, 7, 1].map(aid => ({ aid, pic: `https://example.invalid/${aid}.jpg`, title: String(aid) })))
    const total = Vue.ref(198)
    const disabled = Vue.ref(false)
    let clicks = 0
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Card, { items: items.value, total: total.value, disabled: disabled.value, onPlay: () => clicks++ }) })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    try {
      const images = [...host.querySelectorAll('img')]
      assert.equal(images.length, 6)
      assert.deepEqual(images.map(image => image.getAttribute('src')), items.value.slice(0, 6).map(item => `${item.pic}@192w_108h_1c`))
      assert.equal(host.querySelector('.watch-later-play-all-card__remaining').textContent, '⋯ +192')
      images[0].dispatchEvent(new Event('error'))
      await flush()
      assert.equal(host.querySelectorAll('img').length, 5)
      assert.equal(host.querySelectorAll('.watch-later-play-all-card__cover').length, 6, 'failed images retain the ordered tile')
      host.querySelector('button').click()
      assert.equal(clicks, 1)
      disabled.value = true
      total.value = 3
      await flush()
      host.querySelector('button').click()
      assert.equal(clicks, 1)
      assert.equal(host.querySelectorAll('.watch-later-play-all-card__cover').length, 3)
      assert.equal(host.querySelector('.watch-later-play-all-card__remaining'), null)
      assert.deepEqual(items.value.map(item => item.aid), [8, 3, 9, 4, 2, 7, 1])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('Watch Later advanced filters compose progress, add dates and exact duration boundaries', () => {
    const filters = createWatchLaterFilters()
    const today = new Date(2026, 9, 11).getTime() / 1000
    const tomorrow = new Date(2026, 9, 12).getTime() / 1000
    const items = [600, 601, 1800, 1801, 3600, 3601].map((duration, index) => ({ aid: index + 1, title: 'Test', owner: { name: 'Alice' }, duration, progress: index === 2 ? -1 : 0, add_at: today }))
    const apply = (patch) => {
      const state = { ...filters, ...patch }
      return filterWatchLaterItems(items, 'alice', state.progress, state.duration, () => undefined, state).map(item => item.aid)
    }
    assert.deepEqual(apply({ duration: 'short' }), [1])
    assert.deepEqual(apply({ duration: 'medium' }), [2, 3])
    assert.deepEqual(apply({ duration: 'long' }), [4, 5])
    assert.deepEqual(apply({ duration: 'extraLong' }), [6])
    assert.deepEqual(apply({ progress: 'unstarted', duration: 'medium', added: 'custom', startDate: '2026-10-11', endDate: '2026-10-11' }), [2])
    assert.deepEqual(watchLaterAddedBounds({ ...filters, added: 'custom', startDate: '2026-10-11', endDate: '2026-10-11' }), { start: today, end: tomorrow })
    assert.equal(watchLaterAddedBounds({ ...filters, added: 'custom', startDate: '2026-02-30' }), null)
    assert.equal(watchLaterAddedBounds({ ...filters, added: 'custom', startDate: '2026-10-12', endDate: '2026-10-11' }), null)
    const boundaryItems = [today - 1, today, tomorrow - 1, tomorrow, undefined].map((add_at, i) => ({ ...items[0], aid: i, add_at }))
    assert.deepEqual(filterWatchLaterItems(boundaryItems, '', 'all', 'all', () => undefined, { ...filters, added: 'custom', startDate: '2026-10-11', endDate: '2026-10-11' }).map(item => item.aid), [1, 2])
    assert.equal(filterWatchLaterItems([{ ...items[0], progress: 1 }], '', 'unstarted', 'all', () => undefined).length, 0, 'partially watched is not unwatched')
    assert.equal(filterWatchLaterItems([{ ...items[0], progress: undefined }], '', 'unstarted', 'all', () => undefined).length, 0, 'unknown progress is not evidence of unwatched')
  })
  check('library filters: one funnel menu of titled single-choice groups that apply at once', async () => {
    let menu
    const Menu = await compileComponent('../src/components/LibraryFilterMenu.vue', {
      '~/components/ContextMenu.vue': { default: { props: ['options', 'anchor', 'trigger'], emits: ['select', 'close'], setup(props, { emit }) {
        return () => {
          menu = { props, emit }
          return null
        }
      } } },
    })
    const selected = []
    const groups = [
      { key: 'duration', title: 'Length', value: 'all', options: [{ value: 'all', label: 'All', icon: 'i-a' }, { value: 'long', label: 'Long', icon: 'i-b' }] },
      { key: 'period', title: 'Watched', value: 'custom', options: [{ value: 'all', label: 'Any', icon: 'i-c' }, { value: 'custom', label: 'Custom', icon: 'i-d' }] },
    ]
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Menu, { label: 'Filter', groups, onSelect: (key, value) => selected.push([key, value]) }) })
    app.mount(host)
    try {
      const trigger = host.querySelector('button.library-filter-menu')
      assert.equal(trigger.getAttribute('aria-haspopup'), 'menu')
      assert.equal(menu, undefined, 'the menu mounts only when opened')
      trigger.click()
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      assert.deepEqual(menu.props.options.map(option => [option.value, option.section, option.checked, option.kind, option.closeOnSelect]), [
        ['duration:all', 'Length', true, 'radio', false],
        ['duration:long', 'Length', false, 'radio', false],
        ['period:all', 'Watched', false, 'radio', false],
        ['period:custom', 'Watched', true, 'radio', false],
      ], 'titled groups, one checked choice each, the menu stays open')
      menu.emit('select', 'duration:long')
      menu.emit('select', 'period:all')
      assert.deepEqual(selected, [['duration', 'long'], ['period', 'all']])
      menu.emit('close')
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('Watch Later order uses add time, keeps ties stable and never mutates the server list', () => {
    const items = [{ aid: 1, add_at: 30 }, { aid: 2, add_at: 10 }, { aid: 3, add_at: 30 }, { aid: 4, add_at: undefined, pubdate: 1 }]
    assert.deepEqual(sortWatchLaterItems(items, 'oldest').map(item => item.aid), [2, 1, 3, 4])
    assert.deepEqual(sortWatchLaterItems(items, 'newest').map(item => item.aid), [1, 3, 2, 4])
    assert.deepEqual(items.map(item => item.aid), [1, 2, 3, 4])
  })
  check('Watch Later batch stops on failure, retains remaining selection and cancels across accounts/unmount', async () => {
    const { useLibraryBatchSelection } = await import('../src/composables/useLibraryBatchSelection')
    const ids = Vue.ref([1, 2, 3])
    const calls = []
    let account = 1
    let fail = true
    let release
    let pending = false
    let mounted = true
    let batch
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      batch = useLibraryBatchSelection({
        keys: () => ids.value,
        captureOwner: () => {
          const owner = account
          return { isCurrent: () => owner === account }
        },
        remove: async (id) => {
          calls.push(id)
          if (pending)
            return new Promise(resolve => release = resolve)
          return !(fail && id === 2)
        },
      })
      return () => null
    } })
    app.mount(host)
    try {
      batch.toggleManaging()
      batch.toggleAll()
      await batch.removeSelected()
      assert.deepEqual(calls, [1, 2])
      assert.deepEqual([...batch.selected.value], [2, 3])
      assert.equal(batch.failed.value, true)
      fail = false
      await batch.removeSelected()
      assert.deepEqual(calls, [1, 2, 2, 3])
      assert.equal(batch.selected.value.size, 0)
      batch.toggleAll()
      ids.value = [2, 3]
      await flush()
      assert.deepEqual([...batch.selected.value], [2, 3])
      pending = true
      const running = batch.removeSelected()
      await batch.removeSelected()
      assert.equal(calls.length, 5, 'a second click cannot start another batch')
      account = 2
      batch.reset()
      release(true)
      await running
      assert.equal(calls.length, 5, 'account changes prevent the next write')
      assert.equal(batch.selected.value.size, 0)
      batch.toggleManaging()
      batch.toggleAll()
      const leaving = batch.removeSelected()
      app.unmount()
      mounted = false
      release(true)
      await leaving
      assert.equal(calls.length, 6, 'unmount prevents the next write')
    }
    finally {
      if (mounted)
        app.unmount()
      host.remove()
    }
  })
  const translation = { useI18n: () => ({ t: (key, values) => values ? `${key}:${JSON.stringify(values)}` : key }) }
  check('shared library search keeps one clear action, preserves filters and guards composing/disabled submit', async () => {
    const Search = await compileComponent('../src/components/LibrarySearchField.vue', { 'vue-i18n': translation })
    const query = Vue.ref('needle')
    const disabled = Vue.ref(false)
    let submitted = 0
    let cleared = 0
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Search, {
      modelValue: query.value,
      'onUpdate:modelValue': value => query.value = value,
      label: 'search',
      submitDisabled: disabled.value,
      onSubmit: () => submitted++,
      onClear: () => cleared++,
    }, { filter: () => Vue.h('select', { 'aria-label': 'scope' }, Vue.h('option', { value: 'current' }, 'current')) }) })
    try {
      app.mount(host)
      await flush()
      const input = host.querySelector('input')
      assert.equal(input.placeholder, '')
      assert.equal(host.querySelectorAll('.library-search-field__clear').length, 1)
      input.dispatchEvent(new Event('compositionstart', { bubbles: true }))
      input.value = '查找'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      assert.equal(query.value, 'needle', 'an unfinished IME composition must not change the query')
      input.dispatchEvent(new Event('compositionend', { bubbles: true }))
      await flush()
      assert.equal(query.value, '查找')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      assert.equal(submitted, 0)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(submitted, 1)
      host.querySelector('.library-search-field__clear').click()
      await flush()
      assert.equal(query.value, '')
      assert.equal(cleared, 1)
      assert.equal(document.activeElement, input)
      assert.equal(host.querySelector('select').value, 'current')
      disabled.value = true
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(submitted, 1)
      assert.equal(host.querySelector('button').disabled, true)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  const Button = { props: ['disabled'], setup: (props, { slots }) => () => Vue.h('button', { disabled: props.disabled }, slots.default?.()) }
  const Dialog = { emits: ['close'], setup: (_props, { slots, emit, expose }) => {
    expose({ close: () => emit('close') })
    return () => Vue.h('section', slots.default?.())
  } }
  function mount(component, props) {
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(component, props)
    const errors = []
    app.config.errorHandler = error => errors.push(error)
    app.config.globalProperties.$t = translation.useI18n().t
    app.component('Dialog', Dialog)
    app.component('Button', Button)
    app.mount(host)
    return { host, errors, close() {
      app.unmount()
      host.remove()
    } }
  }
  const historyItem = (id, business = 'archive', time = 1) => ({ title: `item-${id}`, view_at: time, history: { oid: id, business } })
  check('history deletion aborts an older page so its response cannot resurrect deleted records', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    let release
    let signal
    const timeline = useHistoryTimeline({ getGroupInterval: () => 'day', getSortOrder: () => 'newest', api: {
      getHistoryList: (_params, options) => new Promise((resolve) => {
        release = resolve
        signal = options.signal
      }),
      deleteHistoryItem: async () => ({ code: 0 }),
    }, getAccountId: () => 1, getCSRF: () => 'fixture', haveScrollbar: async () => true, onWriteError: assert.fail })
    try {
      const item = historyItem(1)
      timeline.historyList.push(item, { ...item, view_at: 2 })
      const reading = timeline.load()
      assert.equal(await timeline.deleteHistoryItem(item), true)
      assert.equal(signal.aborted, true)
      release({ code: 0, data: { list: [item] } })
      await reading
      assert.equal(timeline.historyList.length, 0)
    }
    finally { timeline.dispose() }
  })
  check('library history: clearing search replaces the submitted query, cancels old reads and shares date/type pagination', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    const reads = []
    const request = kind => (params, options) => new Promise(resolve => reads.push({ kind, params, options, resolve }))
    const timeline = useHistoryTimeline({ getGroupInterval: () => 'day', getSortOrder: () => 'newest', api: { getHistoryList: request('list'), searchHistoryList: request('search'), getHistoryPauseStatus: async () => ({ code: 0, data: false }) }, getAccountId: () => 1, getCSRF: () => 'csrf', haveScrollbar: async () => true, onWriteError: assert.fail })
    try {
      timeline.activate()
      timeline.keyword.value = 'music'
      timeline.handleSearch()
      assert.equal(reads[0].options.signal.aborted, true)
      reads[1].resolve({ code: 0, data: { list: [historyItem(1)] } })
      await flush()
      assert.equal(timeline.submittedKeyword.value, 'music')
      timeline.clearSearch()
      assert.equal(timeline.keyword.value, '')
      assert.equal(timeline.submittedKeyword.value, '')
      assert.equal(reads[2].kind, 'list')
      reads[0].resolve({ code: 0, data: { list: [historyItem(999)] } })
      reads[2].resolve({ code: 0, data: { list: [historyItem(2)] } })
      await flush()
      assert.deepEqual(timeline.historyList.map(item => item.history.oid), [2])
      timeline.filters.value = { ...timeline.filters.value, period: 'custom', startDate: '2026-09-29', endDate: '2026-09-29' }
      timeline.contentType.value = 'pgc'
      timeline.handleSearch()
      const bounds = historyDateBounds(timeline.filters.value.startDate)
      assert.equal(reads[3].params.view_at, bounds.end)
      reads[3].resolve({ code: 0, data: { list: [historyItem(3, 'archive', bounds.start + 1), historyItem(4, 'pgc', bounds.end), historyItem(5, 'pgc', bounds.start - 1)] } })
      await flush()
      assert.deepEqual(timeline.historyList.map(item => item.history.oid), [4])
      assert.equal(matchesHistoryFilters(historyItem(6, 'article-list', bounds.start), 'article', bounds), true)
      assert.equal(historyDateBounds('2026-02-30'), undefined)
    }
    finally { timeline.dispose() }
  })

  check('library history: a sparse filter reads at most three pages per action and unmount aborts a pending page', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    let requests = 0
    let pending
    const timeline = useHistoryTimeline({ getGroupInterval: () => 'day', getSortOrder: () => 'newest', api: {
      getHistoryList: async (_params, options) => {
        requests++
        if (requests === 4)
          return new Promise((resolve) => { pending = { resolve, signal: options.signal } })
        return { code: 0, data: { list: Array.from({ length: 20 }, (_, index) => historyItem(requests * 20 + index, 'archive', 10_000 - requests * 20 - index)) } }
      },
    }, getAccountId: () => 1, getCSRF: () => '', haveScrollbar: async () => false, onWriteError: assert.fail })
    timeline.contentType.value = 'live'
    await timeline.load()
    assert.equal(requests, 3)
    assert.equal(timeline.noMoreContent.value, false)
    const more = timeline.load()
    timeline.dispose()
    assert.equal(pending.signal.aborted, true)
    pending.resolve({ code: 0, data: { list: [historyItem(1, 'live')] } })
    await more
    assert.equal(timeline.historyList.length, 0)
  })
  check('history automatic continuation resumes sparse scans and stops repeated search pages without spinning', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    let calls = 0
    const timeline = useHistoryTimeline({ getGroupInterval: () => 'day', getSortOrder: () => 'newest', api: {
      getHistoryList: async () => {
        calls++
        return { code: 0, data: { list: calls === 4 ? [historyItem(100, 'live', 900)] : Array.from({ length: 20 }, (_, i) => historyItem(calls * 20 + i, 'archive', 1000 - calls * 20 - i)) } }
      },
      searchHistoryList: async () => {
        calls++
        return { code: 0, data: { list: Array.from({ length: 20 }, (_, i) => historyItem(i, 'archive', 1000 - i)) } }
      },
    }, getAccountId: () => 1, getCSRF: () => '', haveScrollbar: async () => false, onWriteError: assert.fail })
    try {
      timeline.contentType.value = 'live'
      await timeline.load()
      assert.equal(calls, 3)
      assert.equal(timeline.noMoreContent.value, false)
      await timeline.load()
      assert.deepEqual(timeline.historyList.map(item => item.history.oid), [100])
      assert.equal(timeline.noMoreContent.value, true)
      assert.equal(await timeline.load(), false)
      assert.equal(calls, 4)
      timeline.keyword.value = 'filtered search'
      timeline.handleSearch()
      await flush()
      assert.equal(calls, 6, 'a repeated full page stops even when every source row is filtered out')
      assert.equal(timeline.noMoreContent.value, true)
      assert.equal(await timeline.load(), false)
      assert.equal(calls, 6)
    }
    finally { timeline.dispose() }
  })

  check('library Watch Later filters: titles/authors, duration boundaries and real completion evidence share one view', async () => {
    const items = [
      { aid: 1, title: 'Hello World', owner: { name: 'Alice' }, progress: 0, duration: 600 },
      { aid: 2, title: 'Long lesson', owner: { name: 'Bob' }, progress: 10, duration: 1800 },
      { aid: 3, title: 'Finished', owner: { name: 'Alice' }, progress: -1, duration: 1801 },
      { aid: 4, title: 'Unknown', owner: { name: 'Carol' }, duration: 0 },
    ]
    const none = () => undefined
    assert.deepEqual(filterWatchLaterItems(items, 'ＡＬＩＣＥ', 'all', 'all', none).map(item => item.aid), [1, 3])
    assert.deepEqual(filterWatchLaterItems(items, '', 'unstarted', 'short', none).map(item => item.aid), [1])
    assert.deepEqual(filterWatchLaterItems(items, '', 'watching', 'medium', none).map(item => item.aid), [2])
    assert.deepEqual(filterWatchLaterItems(items, '', 'completed', 'long', none).map(item => item.aid), [3])
    assert.equal(watchLaterPlaybackState(items[3]), 'unknown')
    assert.equal(watchLaterPlaybackState({ ...items[1], progress: 1800 }), 'watching', 'position at the end alone is not completion')
    assert.equal(watchLaterPlaybackState(items[3], { status: 'played', completed: true }), 'completed')
    assert.equal(watchLaterPlaybackState(items[0], { status: 'played', completed: true }), 'unstarted', 'explicit server progress keeps priority')
  })

  check('library batch selection: actual preview checkboxes, all/none and task replacement submit only checked snapshot ids', async () => {
    const task = Vue.shallowRef(null)
    const calls = []
    const component = await compileComponent('../src/components/WatchLater/OpenTabsDialog.vue', {
      '~/components/Button.vue': { default: Button },
      '~/components/Dialog.vue': { default: Dialog },
      '~/components/Progress.vue': { default: { render: () => null } },
      '~/composables/useOpenTabsWatchLater': { useOpenTabsWatchLater: () => ({ task, busy: Vue.ref(false), failed: Vue.ref(false), command: (...args) => calls.push(args) }) },
      '~/constants/openTabsWatchLater': { countOpenTabsTask },
    })
    const fixture = mount(component)
    try {
      task.value = { id: 'one', status: 'ready', accountId: 1, incognito: false, items: [1, 2, 3].map(tabId => ({ tabId, status: 'pending', title: `Video ${tabId}` })) }
      await flush()
      const inputs = fixture.host.querySelectorAll('input[type="checkbox"]')
      assert.equal(inputs.length, 3)
      assert.ok([...inputs].every(input => input.checked))
      inputs[1].checked = false
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
      const confirm = () => [...fixture.host.querySelectorAll('button')].find(button => button.textContent.trim() === 'watch_later.open_tabs.confirm')
      confirm().click()
      assert.deepEqual(Array.from(calls[0][1]), [1, 3])
      assert.deepEqual(selectOpenTabsTaskItems(task.value, calls[0][1]).map(item => item.tabId), [1, 3])
      assert.throws(() => selectOpenTabsTaskItems(task.value, []))
      assert.throws(() => selectOpenTabsTaskItems(task.value, [999]))
      const selectButton = () => [...fixture.host.querySelectorAll('button')].find(button => /favorites\.(?:unselect_all|select_all)/.test(button.textContent))
      selectButton().click()
      await flush()
      selectButton().click()
      await flush()
      assert.equal(confirm().disabled, true)
      task.value = { ...task.value, id: 'two', items: [{ tabId: 4, status: 'pending', title: 'New tab' }] }
      await flush()
      assert.equal(fixture.host.querySelector('input').checked, true)
      assert.equal(confirm().disabled, false)
      assert.deepEqual(fixture.errors, [])
    }
    finally { fixture.close() }
  })

  check('library conversation find: real component supports normalized text/links, next/previous, IME and trimmed results', async () => {
    const selected = []
    const search = await import('../src/contentScripts/views/Notifications/whisper/privateMessageSearch')
    const component = await compileComponent('../src/contentScripts/views/Notifications/whisper/ConversationFind.vue', { 'vue-i18n': translation, './privateMessageSearch': search })
    const messages = Vue.reactive([
      { msgKey: 'one', content: { type: 'text', segments: [{ type: 'text', text: 'Hello world' }] } },
      { msgKey: 'two', content: { type: 'text-share', title: 'HELLO', text: 'world', href: 'https://example.test/item' } },
    ])
    const fixture = mount(component, { messages, onLocate: key => selected.push(key) })
    try {
      fixture.host.querySelector('button').click()
      await flush()
      const input = fixture.host.querySelector('input')
      input.value = 'ｈｅｌｌｏ'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      assert.deepEqual(selected, [])
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
      assert.deepEqual(selected, ['one', 'two', 'one'])
      messages.splice(0, 1)
      await flush()
      assert.equal(fixture.host.querySelector('[role="status"]').textContent.trim(), '0 / 1')
      input.value = 'example.test'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(selected.at(-1), 'two')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
      assert.equal(fixture.host.querySelector('input'), null)
      assert.deepEqual(fixture.errors, [])
    }
    finally { fixture.close() }
  })
}
