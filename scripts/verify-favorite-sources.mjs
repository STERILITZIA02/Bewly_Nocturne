import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadSourceModule } from './sourceModuleHarness'

export function registerFavoriteSourceChecks(check, { Vue, flush, compileComponent }) {
  const deferred = () => {
    let resolve
    const promise = new Promise(done => resolve = done)
    return { promise, resolve }
  }
  const video = (id, fields = {}) => ({
    id,
    type: 2,
    attr: 0,
    title: `video ${id}`,
    cover: '',
    intro: '',
    duration: 60,
    page: 1,
    bvid: `BV1xx411c${String(id).padStart(3, '0')}`,
    bv_id: '',
    link: '',
    fav_time: 1000 - id,
    pubtime: id,
    ctime: id,
    upper: { mid: id, name: `up ${id}`, face: 'https://i0.hdslb.com/face.jpg' },
    cnt_info: { play: 1, danmaku: 2, collect: 0, vt: 0 },
    ugc: { first_cid: 0 },
    season: null,
    ogv: null,
    ...fields,
  })
  const page = (medias, count = medias.length, has_more = false) => ({ code: 0, data: { medias, info: { media_count: count, cover: 'cover' }, has_more } })

  check('favorite sources: actual page fetch routes type 11/21 separately and retains raw media contracts', async () => {
    const calls = []
    const publicMedia = video(1, { type: 12, attr: 9, link: 'bilibili://music/1', page: 4, fav_time: 777, bvid: '', bv_id: 'BV1xx411c7mD' })
    const api = { favorite: {
      getFavoriteResources: async (params) => {
        calls.push(['folder', params])
        return page([publicMedia], 51, true)
      },
      getFavoriteSeasonResources: async (params) => {
        calls.push(['season', params])
        return page([video(2)])
      },
    } }
    const module = await import('../src/utils/favoriteSeason')
    const folder = await module.fetchFavoriteSeasonPage({ id: 7, type: 11 }, 1, api.favorite)
    assert.equal(calls[0][0], 'folder', 'a public folder must never reach the UGC season endpoint')
    assert.equal(calls[0][1].media_id, 7)
    assert.equal(calls[0][1].ps, 20)
    assert.equal(folder.hasMore, true)
    assert.equal(folder.pageMedias[0].type, 12)
    assert.equal(folder.pageMedias[0].attr, 9)
    assert.equal(folder.pageMedias[0].page, 4)
    assert.equal(folder.pageMedias[0].fav_time, 777)
    assert.equal(folder.pageMedias[0].link, 'bilibili://music/1')
    assert.equal(folder.pageMedias[0].bvid, publicMedia.bv_id)
    await module.fetchFavoriteSeasonPage({ id: 7, type: 21 }, 2, api.favorite)
    assert.equal(calls[1][0], 'season')
    assert.deepEqual([calls[1][1].season_id, calls[1][1].pn, calls[1][1].ps], [7, 2, 40])
  })

  check('favorite pagination: composite keys, overlapping pages and full UGC responses preserve completeness and object identity', async () => {
    const { mergeFavoriteSeasonPage } = await import('../src/utils/favoriteSeason')
    const { getFavoriteResourceKey, isPlayableFavoriteVideo, normalizeFavoriteSourceMedia } = await import('../src/utils/favoriteResource')
    const { transformFavoriteItem } = await import('../src/contentScripts/views/Favorites/favoriteAdapters')
    const first = video(1)
    const audio = video(1, { type: 12, link: 'bilibili://music/1' })
    const second = video(2)
    const initial = mergeFavoriteSeasonPage({ sourceType: 11, pn: 1, pageMedias: [first, audio], previousMedias: [], mediaCount: 3, hasMore: true })
    assert.equal(initial.complete, false)
    const next = mergeFavoriteSeasonPage({ sourceType: 11, pn: 2, pageMedias: [{ ...audio }, second], previousMedias: initial.medias, mediaCount: 3, hasMore: false })
    assert.equal(next.complete, true)
    assert.deepEqual(next.medias.map(getFavoriteResourceKey), ['1:2', '1:12', '2:2'])
    assert.equal(next.medias[0], first)
    assert.equal(next.medias[1], audio)
    assert.deepEqual(next.changed.map(change => change.index), [2])
    const duplicate = mergeFavoriteSeasonPage({ sourceType: 11, pn: 2, pageMedias: [first, first], previousMedias: [first], mediaCount: 2, hasMore: true })
    assert.equal(duplicate.medias.length, 1)
    assert.equal(duplicate.complete, false)
    assert.equal(duplicate.stalled, true)
    assert.equal(duplicate.hasMore, false)
    const contradictory = mergeFavoriteSeasonPage({ sourceType: 11, pn: 1, pageMedias: [first], previousMedias: [], mediaCount: 5, hasMore: false })
    assert.equal(contradictory.complete, false)
    assert.equal(contradictory.stalled, true)
    const all = Array.from({ length: 120 }, (_, index) => video(index + 1))
    const full = mergeFavoriteSeasonPage({ sourceType: 21, pn: 1, pageMedias: all, previousMedias: [], mediaCount: 120, pageSize: 40 })
    assert.equal(full.complete, true)
    assert.equal(full.replace, true)
    assert.equal(full.medias.length, 120)
    const unknown = mergeFavoriteSeasonPage({ sourceType: 21, pn: 1, pageMedias: all, previousMedias: [], pageSize: 40 })
    assert.equal(unknown.complete, false, 'an unexpectedly large response alone cannot prove an unbounded list complete')
    assert.equal(unknown.stalled, true)
    const invalid = normalizeFavoriteSourceMedia(video(3, { attr: 9 }), 11)
    const missingBvid = normalizeFavoriteSourceMedia(video(4, { bvid: '', bv_id: '' }), 11)
    assert.equal(isPlayableFavoriteVideo(invalid), false)
    assert.equal(isPlayableFavoriteVideo(missingBvid), false)
    assert.equal(transformFavoriteItem(invalid).bvid, undefined)
    assert.equal(transformFavoriteItem(audio).url, 'https://www.bilibili.com/audio/au1')
  })

  check('favorite popover: actual rendered cards share media keys, retain invalid entries, and pause duplicate/failed pagination', async () => {
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    let cookieMid = '1'
    let phase = 'duplicate'
    let reachBottom
    const requests = []
    const api = { favorite: {
      getFavoriteCategories: async () => ({ code: 0, data: { list: [{ id: 7, title: 'folder' }] } }),
      getFavoriteResources: async ({ pn }) => {
        requests.push(pn)
        if (phase === 'failed')
          return { code: -1 }
        return page(phase === 'good' ? [video(2, { attr: 9 })] : [video(1), video(1, { type: 12 })], 3, phase !== 'good')
      },
    } }
    const Popover = await compileComponent('../src/components/TopBar/components/pops/FavoritesPop.vue', {
      'pinia': { storeToRefs: () => ({ favoriteStateVersion: Vue.ref(0) }) },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error() {} }) },
      '~/components/Empty.vue': { default: { render: () => null } },
      '~/composables/useOptimizedScroll': { useOptimizedScroll: (_ref, callbacks) => { reachBottom = callbacks.onReachBottom } },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: api },
      '~/utils/dataFormatter': { calcCurrentTime: () => '01:00' },
      '~/utils/favoriteResource': await import('../src/utils/favoriteResource'),
      '~/utils/favoriteSeason': await import('../src/utils/favoriteSeason'),
      '~/utils/main': { getUserID: () => cookieMid, removeHttpFromUrl: value => value, scrollToTop() {} },
      './PopoverListSkeleton.vue': { default: { render: () => null } },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Popover)
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
    app.component('Button', { props: ['disabled'], setup: (props, { slots }) => () => Vue.h('button', { disabled: props.disabled }, slots.default?.()) })
    app.config.globalProperties.$t = key => key
    try {
      const pop = app.mount(host)
      await flush()
      const first = host.querySelector('.popover-card')
      assert.equal(host.querySelectorAll('.popover-card').length, 2)
      reachBottom()
      await flush()
      assert.equal(host.querySelector('.popover-card'), first)
      assert.equal(host.querySelectorAll('.popover-card').length, 2)
      assert.ok(host.querySelector('[role="status"] button'))
      reachBottom()
      await flush()
      assert.deepEqual(requests, [1, 2])
      phase = 'good'
      host.querySelector('[role="status"] button').click()
      await flush()
      assert.deepEqual(requests, [1, 2, 2])
      assert.equal(host.querySelectorAll('.popover-card').length, 3)
      assert.equal(host.querySelectorAll('.popover-card__primary').length, 2, 'invalid resources have no fake video link')
      assert.ok(host.querySelector('.popover-card__primary[href*="/audio/au1"]'))
      phase = 'failed'
      pop.refreshFavoriteResources()
      await flush()
      assert.equal(host.querySelectorAll('.popover-card').length, 3)
      assert.ok(host.querySelector('[role="status"] button'))
      const before = requests.length
      cookieMid = '2'
      pop.refreshFavoriteResources()
      await flush()
      assert.equal(requests.length, before, 'cookie changes prevent a request before profile reconciliation')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('favorite play-all: incomplete or foreign preloads are re-read, public latest keeps its queue, and UGC retains native sequence', async () => {
    const { resolveFavoriteSeasonPlayAllUrl } = await import('../src/utils/favoriteSeason')
    const calls = []
    const first = video(1, { fav_time: 200 })
    const last = video(2, { fav_time: 100 })
    const api = { favorite: {
      getFavoriteResources: async (params) => {
        calls.push(params)
        return page([first, last], 2, false)
      },
      getFavoriteSeasonResources: async (params) => {
        calls.push(params)
        return page([first, last], 2, false)
      },
    }, history: { getHistoryList: async () => ({ code: 0, data: { list: [{ history: { business: 'archive', bvid: last.bvid, oid: 2 }, view_at: 100 }] } }) } }
    const context = { api, isCurrent: () => true }
    const publicSource = { id: 7, type: 11 }
    const ugcSource = { id: 7, type: 21 }
    const target = { source: publicSource, spaceMid: 42, mode: 'latest', preloaded: { sourceKey: '21:7', medias: [last], complete: true } }
    const publicLatest = await resolveFavoriteSeasonPlayAllUrl(target, context)
    assert.equal(calls.length, 1, 'the same ID from the other source is not a reusable preload')
    assert.equal(publicLatest.url, `https://www.bilibili.com/medialist/play/ml7?bvid=${first.bvid}`)
    const ugcLatest = await resolveFavoriteSeasonPlayAllUrl({ source: ugcSource, spaceMid: 42, mode: 'latest', preloaded: { sourceKey: '21:7', medias: [first, last], complete: true } }, context)
    assert.equal(ugcLatest.url, `https://www.bilibili.com/video/${last.bvid}/`)
    assert.equal(calls.length, 1)
    const lastWatched = await resolveFavoriteSeasonPlayAllUrl({ ...target, mode: 'lastWatched', preloaded: { sourceKey: '11:7', medias: [first, last], complete: true } }, context)
    assert.equal(lastWatched.url, `https://www.bilibili.com/medialist/play/ml7?bvid=${last.bvid}`)
    api.favorite.getFavoriteResources = async (params) => {
      calls.push(params)
      return page([first, first], 2, true)
    }
    const incomplete = await resolveFavoriteSeasonPlayAllUrl({ ...target, preloaded: { sourceKey: '11:7', medias: [first, first], complete: false, expectedCount: 2 } }, context)
    assert.equal(incomplete.reason, 'incomplete')
    assert.equal(incomplete.url, 'https://www.bilibili.com/medialist/play/ml7')
    assert.equal(calls.length, 3, 'no-progress pagination stops after the repeated page')
    let current = true
    const pendingPage = deferred()
    api.favorite.getFavoriteResources = () => pendingPage.promise
    const pending = resolveFavoriteSeasonPlayAllUrl({ ...target, preloaded: undefined }, { api, isCurrent: () => current })
    current = false
    pendingPage.resolve(page([first], 50, true))
    assert.equal((await pending).reason, 'cancelled')
  })

  check('favorite directories: 51/120 mixed sources paginate independently from content and partition failures', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    for (const count of [51, 120]) {
      const sources = Array.from({ length: count }, (_, index) => ({ id: Math.floor(index / 2) + 1, type: index % 2 ? 21 : 11, title: `source ${index}`, media_count: 1 }))
      const pages = []
      const api = {
        getFavoriteCategories: async () => ({ code: -1 }),
        getCollectedFavoriteSeasons: async ({ pn, ps }) => {
          pages.push(pn)
          return { code: 0, data: { list: sources.slice((pn - 1) * ps, pn * ps), count, has_more: pn * ps < count } }
        },
        getFavoriteResources: async () => page([video(1)]),
      }
      const data = useFavoritesData({ api, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
      try {
        await data.initData()
        assert.equal(data.categoryState.failed, true)
        assert.equal(data.subscriptionState.failed, false)
        data.favoriteView.value = 'season'
        data.selectedSeason.value = data.collectedFavoriteSeasons[0]
        await data.loadSelectedContent()
        assert.equal(data.favoriteResources.length, 1, 'one failed directory does not block content from the successful partition')
        assert.equal(data.bootstrapFailed.value, false)
        while (data.subscriptionState.hasMore)
          await data.loadMoreSubscriptions()
        assert.equal(data.collectedFavoriteSeasons.length, count)
        assert.equal(new Set(data.collectedFavoriteSeasons.map(item => `${item.type}:${item.id}`)).size, count)
        assert.deepEqual(pages, count === 51 ? [1, 2] : [1, 2, 3])
      }
      finally { data.dispose() }
    }
    const api = {
      getFavoriteCategories: async () => ({ code: 0, data: { list: [{ id: 1, media_count: 1 }] } }),
      getCollectedFavoriteSeasons: async () => { throw new Error('offline') },
      getFavoriteResources: async () => page([video(1)]),
    }
    const data = useFavoritesData({ api, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    try {
      await data.initData()
      await flush()
      assert.equal(data.favoriteResources.length, 1)
      assert.equal(data.bootstrapFailed.value, false)
      assert.equal(data.subscriptionState.failed, true)
    }
    finally { data.dispose() }
  })

  check('favorite content: same-ID source changes reject old responses; avatar work is optional and only changed rows are replaced', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const folder = deferred()
    const season = deferred()
    let avatarCalls = 0
    const api = { getFavoriteResources: () => folder.promise, getFavoriteSeasonResources: () => season.promise }
    const data = useFavoritesData({ api, user: { getUserCard: async () => {
      avatarCalls++
      return { code: 0, data: { card: { face: 'new' } } }
    } }, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    try {
      data.favoriteView.value = 'season'
      data.selectedSeason.value = { id: 7, type: 11 }
      const first = data.loadSelectedContent()
      data.selectedSeason.value = { id: 7, type: 21 }
      const second = data.loadSelectedContent()
      season.resolve(page([video(2)]))
      await second
      const stable = data.favoriteResources[0]
      folder.resolve(page([video(1)]))
      await first
      assert.equal(data.favoriteResources[0], stable)
      assert.equal(data.favoriteResources[0].id, 2)
      assert.equal(avatarCalls, 0, 'valid upper.face needs no additional request')
      data.selectedSeason.value = { id: 8, type: 11 }
      api.getFavoriteResources = async ({ pn }) => page(pn === 1 ? [video(1), video(2)] : [video(2), video(3)], 3, pn === 1)
      await data.loadSelectedContent()
      const retained = [...data.favoriteResources]
      await data.loadNextPage()
      assert.equal(data.favoriteResources.length, 3)
      assert.equal(data.favoriteResources[0], retained[0])
      assert.equal(data.favoriteResources[1], retained[1])
      assert.equal(avatarCalls, 0)
    }
    finally { data.dispose() }
  })

  check('favorite retry: correcting contradictory paging signals can resume an already displayed partial page', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    let corrected = false
    const api = {
      getFavoriteResources: async ({ pn }) => page([video(pn)], 3, pn === 1 || (pn === 2 && corrected)),
      getCollectedFavoriteSeasons: async ({ pn }) => ({ code: 0, data: { list: [{ id: pn, type: 11, title: `folder-${pn}` }], count: 3, has_more: pn === 1 || (pn === 2 && corrected) } }),
    }
    const data = useFavoritesData({ api, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    try {
      data.selectedCategory.value = { id: 1 }
      await data.loadSelectedContent()
      await data.loadNextPage()
      assert.equal(data.stalledContentPage.value, 2)
      assert.equal(data.loadedSeasonComplete.value, false)
      await data.loadMoreSubscriptions()
      await data.loadMoreSubscriptions()
      assert.equal(data.subscriptionState.failed, true)
      corrected = true
      await data.retryFavoriteContent()
      assert.equal(data.stalledContentPage.value, null)
      assert.equal(data.currentPageNum.value, 2)
      await data.loadNextPage()
      assert.equal(data.loadedSeasonComplete.value, true)
      assert.deepEqual(Array.from(data.favoriteResources, item => item.id), [1, 2, 3])
      await data.loadMoreSubscriptions(true)
      assert.equal(data.subscriptionState.failed, false)
      assert.equal(data.subscriptionState.page, 2)
      await data.loadMoreSubscriptions()
      assert.equal(data.collectedFavoriteSeasons.length, 3)
      assert.equal(data.subscriptionState.hasMore, false)
    }
    finally { data.dispose() }
  })

  check('favorite avatars: same-MID requests coalesce with bounded concurrency, LRU capacity and failure cooldown', async () => {
    const { createFavoriteAvatarLoader } = await import('../src/utils/favoriteAvatar')
    let now = 0
    let active = 0
    let peak = 0
    let requests = 0
    const pending = []
    const loader = createFavoriteAvatarLoader((mid) => {
      requests++
      active++
      peak = Math.max(peak, active)
      const task = deferred()
      pending.push({ ...task, mid })
      return task.promise.finally(() => active--)
    }, () => now)
    try {
      const first = loader.load(1)
      assert.equal(loader.load(1), first)
      const all = [first, ...Array.from({ length: 299 }, (_, index) => loader.load(index + 2))]
      assert.equal(requests, 4)
      for (let index = 0; index < 300;) {
        const batch = pending.splice(0)
        batch.forEach(task => task.resolve(task.mid === 1 ? undefined : `face-${task.mid}`))
        index += batch.length
        await flush()
      }
      await Promise.all(all)
      assert.equal(peak, 4)
      assert.equal(loader.cacheSize, 256)
      const failed = loader.load(999)
      pending.shift().resolve(undefined)
      await failed
      const before = requests
      await loader.load(999)
      assert.equal(requests, before)
      now = 60_001
      const retry = loader.load(999)
      pending.shift().resolve('recovered')
      assert.equal(await retry, 'recovered')
      assert.equal(requests, before + 1)
    }
    finally { loader.dispose() }
    assert.equal(loader.cacheSize, 0)
    console.log('PERF favorites fixture: 300 missing MIDs; peak 4 requests; cache 256; valid faces 0 lookups; overlapping rows retain identity')
  })

  check('favorite writes: source snapshots select folder/season unfav independently and never delete an owned folder', async () => {
    const { createAccountLifetime } = await import('../src/utils/accountLifetime')
    const { useFavoriteWrites } = await import('../src/contentScripts/views/Favorites/useFavoriteWrites')
    const calls = []
    const first = deferred()
    const api = {
      unfavCollectedFavoriteFolder: (params) => {
        calls.push(['folder', params])
        return first.promise
      },
      unfavFavoriteSeason: async (params) => {
        calls.push(['season', params])
        return { code: 0 }
      },
      delFavoriteFolder: () => { throw new Error('must not delete owned folders') },
    }
    const lifetime = createAccountLifetime(() => 1)
    const writer = useFavoriteWrites({ api, capture: lifetime.capture, getCSRF: () => 'fixture', onError: () => {
      throw new Error('unexpected failure')
    } })
    const sources = [{ id: 7, type: 11 }, { id: 7, type: 21 }]
    const transaction = writer.prepare({ kind: 'seasons', sources })
    sources[0].id = 99
    const resultPromise = writer.execute(transaction)
    first.resolve({ code: 0 })
    const result = await resultPromise
    assert.deepEqual(calls, [['folder', { media_id: 7, csrf: 'fixture' }], ['season', { season_id: 7, csrf: 'fixture' }]])
    assert.equal(result.kind, 'seasons')
    assert.deepEqual(result.succeeded, [{ id: 7, type: 11 }, { id: 7, type: 21 }])
    lifetime.dispose()
  })

  check('native favorites: verified parameters/modifiers preserve native behavior; source changes and runtime stop invalidate pending play-all', async () => {
    const contract = JSON.parse(await readFile(new URL('../tests/fixtures/favorites/native-space-contract.json', import.meta.url), 'utf8'))
    const schema = (await loadSourceModule('../src/background/messageListeners/api/favorite.ts', { '../../utils': { AHS: { J_D: 'json' } } })).default
    assert.equal(new URL(schema.unfavCollectedFavoriteFolder.url).pathname, contract.publicFolder.unfav)
    assert.equal(schema.unfavCollectedFavoriteFolder._fetch.method, contract.publicFolder.method)
    assert.deepEqual(Object.keys(schema.unfavCollectedFavoriteFolder.params).sort(), [...contract.publicFolder.query].sort())
    assert.equal(new URL(schema.unfavFavoriteSeason.url).pathname, contract.ugcSeason.unfav)
    assert.equal(schema.unfavFavoriteSeason._fetch.method, contract.ugcSeason.method)
    assert.deepEqual(Object.keys(schema.unfavFavoriteSeason.params).sort(), [...contract.ugcSeason.query].sort())
    const settings = Vue.ref({ collectedSeasonPlayAllMode: 'latest' })
    const route = { navigationId: 0 }
    const reads = []
    const opened = []
    let href = 'https://space.bilibili.com/42/favlist?ftype=collect&ctype=11&fid=7'
    const api = { favorite: Object.fromEntries(['getFavoriteResources', 'getFavoriteSeasonResources'].map(method => [method, (params) => {
      const task = deferred()
      reads.push({ ...task, method, params })
      return task.promise
    }])), history: { getHistoryList: async () => ({ code: 0, data: { list: [] } }) } }
    const native = await loadSourceModule('../src/utils/nativeFavoriteSeasonPlayAll.ts', {
      'vue-toastification': { useToast: () => ({ warning() {} }) },
      '~/composables/useRouteState': { useRouteState: () => route },
      '~/logic': { settings },
      '~/utils/api': { default: api },
      '~/utils/favoriteResource': await import('../src/utils/favoriteResource'),
      '~/utils/favoriteSeason': await import('../src/utils/favoriteSeason'),
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/main': { getUserID: () => '1', openLinkToNewTab: url => opened.push(url) },
    }, { location: { get href() { return href }, origin: 'https://space.bilibili.com' }, HTMLAnchorElement: window.HTMLAnchorElement })
    const detail = document.body.appendChild(document.createElement('div'))
    detail.className = 'favlist-info-detail__actions'
    const button = detail.appendChild(document.createElement('button'))
    button.className = 'playall-btn'
    button.textContent = '播放全部'
    const click = (options = {}) => {
      const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, ...options })
      button.dispatchEvent(event)
      return event
    }
    try {
      native.initNativeFavoriteSeasonPlayAllIntercept()
      for (const invalid of [
        'https://www.bilibili.com/42/favlist?ftype=collect&ctype=11&fid=7',
        'https://space.bilibili.com/42/favlist-other?ftype=collect&ctype=11&fid=7',
        'https://space.bilibili.com/42/favlist?ftype=create&ctype=11&fid=7',
        'https://space.bilibili.com/42/favlist?ftype=collect&fid=7',
        'https://space.bilibili.com/42/favlist?ftype=collect&ctype=99&fid=7',
        'https://space.bilibili.com/42/favlist?ftype=collect&ctype=21',
      ]) {
        href = invalid
        assert.equal(click().defaultPrevented, false, invalid)
      }
      href = 'https://space.bilibili.com/42/favlist?ftype=collect&ctype=11&fid=7'
      for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])
        assert.equal(click(options).defaultPrevented, false)
      assert.equal(reads.length, 0)
      assert.equal(click().defaultPrevented, true)
      await flush()
      assert.equal(reads[0].method, 'getFavoriteResources')
      href = 'https://space.bilibili.com/42/favlist?ftype=collect&ctype=21&fid=7'
      route.navigationId++
      click()
      await flush()
      assert.equal(reads[1].method, 'getFavoriteSeasonResources')
      reads[0].resolve(page([video(1)]))
      await flush()
      assert.equal(opened.length, 0)
      click()
      await flush()
      assert.equal(reads.length, 2, 'the old result cannot clear the new in-flight marker')
      reads[1].resolve(page([video(2)]))
      await flush()
      assert.deepEqual(opened, [`https://www.bilibili.com/video/${video(2).bvid}/`])
      route.navigationId++
      click()
      await flush()
      native.stopNativeFavoriteSeasonPlayAllIntercept()
      reads[2].resolve(page([video(3)]))
      await flush()
      assert.equal(opened.length, 1)
      settings.value.collectedSeasonPlayAllMode = 'beginning'
      native.initNativeFavoriteSeasonPlayAllIntercept()
      assert.equal(click().defaultPrevented, false, 'default native beginning behavior remains native')
    }
    finally {
      native.stopNativeFavoriteSeasonPlayAllIntercept()
      detail.remove()
    }
  })
}
