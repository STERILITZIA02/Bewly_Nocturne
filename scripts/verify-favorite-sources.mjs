import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import * as folderForm from '../src/utils/favoriteFolderForm'
import { loadSourceModule } from './sourceModuleHarness'

export function registerFavoriteSourceChecks(check, { Vue, flush, compileComponent }) {
  check('folder interactions: acknowledged state/count updates honor native likes and clamp fallback decrements', async () => {
    const { applyFavoriteFolderInteraction: apply } = await import('../src/contentScripts/views/Favorites/favoriteFolderSocial')
    const folder = { like_state: 0, fav_state: 0, cnt_info: { thumb_up: 4, collect: 2, play: 99 } }
    const liked = apply(folder, 'like', { like_state: 1, likes: 9 })
    assert.equal(liked.like_state, 1)
    assert.equal(liked.cnt_info.thumb_up, 9)
    assert.equal(folder.cnt_info.thumb_up, 4, 'the submitted snapshot remains immutable')
    const unliked = apply(liked, 'like', null)
    assert.equal(unliked.like_state, 0)
    assert.equal(unliked.cnt_info.thumb_up, 8)
    assert.equal(apply(unliked, 'like', { likes: -1 }).cnt_info.thumb_up, 9)
    assert.equal(apply({ ...liked, cnt_info: { ...liked.cnt_info, thumb_up: 0 } }, 'like', undefined).cnt_info.thumb_up, 0)
    const subscribed = apply(folder, 'subscribe', null)
    assert.equal(subscribed.fav_state, 1)
    assert.equal(subscribed.cnt_info.collect, 3)
    assert.equal(apply(subscribed, 'subscribe', null).cnt_info.collect, 2)
    assert.equal(apply(folder, 'like', { like_state: 0 }).cnt_info.thumb_up, 4, 'same acknowledged state does not count twice')
  })

  check('folder interactions: no skeleton/refetch, duplicate lock, stale reads and account/folder switches preserve ownership', async () => {
    const { useFavoriteFolderManager } = await import('../src/contentScripts/views/Favorites/useFavoriteFolderManager')
    const { useFavoriteWrites } = await import('../src/contentScripts/views/Favorites/useFavoriteWrites')
    const { createAccountLifetime } = await import('../src/utils/accountLifetime')
    let account = 1
    const lifetime = createAccountLifetime(() => account)
    const reads = []
    const posts = []
    const errors = []
    const api = {
      getFavoriteFolderInfo: (params, options) => new Promise(resolve => reads.push({ params, options, resolve })),
      likeFavoriteFolder: params => new Promise(resolve => posts.push({ params, resolve })),
    }
    const data = { capture: lifetime.capture, favoriteView: Vue.ref('video'), searchScope: Vue.ref('current'), selectedCategory: Vue.ref({ id: 1 }), selectedSeason: Vue.ref() }
    const writes = useFavoriteWrites({ api, capture: lifetime.capture, getCSRF: () => 'fixture', onError: error => errors.push(error) })
    const scope = Vue.effectScope()
    const manager = scope.run(() => useFavoriteFolderManager({ api, data, writes, getCSRF: () => 'fixture', notify() {}, error() {}, confirm: async () => true }))
    const info = id => ({ id, mid: 2, upper: { mid: 2 }, like_state: 0, fav_state: 0, cnt_info: { thumb_up: 4, collect: 2 } })
    try {
      reads[0].resolve({ code: 0, data: info(1) })
      await flush()
      const held = manager.info.value
      let operation = manager.interact('like')
      await manager.interact('like')
      assert.equal(posts.length, 1)
      assert.equal(manager.info.value, held)
      assert.equal(manager.infoLoading.value, false)
      posts[0].resolve({ code: 0, data: { like_state: 1, likes: 5 } })
      await operation
      assert.equal(reads.length, 1, 'no eventually-consistent GET after a successful write')
      assert.equal(manager.info.value.like_state, 1)
      assert.equal(manager.info.value.cnt_info.thumb_up, 5)
      const stale = manager.refreshInfo()
      assert.ok(manager.info.value, 'refresh retains existing metadata')
      operation = manager.interact('like')
      assert.equal(posts[1].params.thumb_type, 2)
      posts[1].resolve({ code: 0 })
      await operation
      reads[1].resolve({ code: 0, data: { ...info(1), like_state: 1 } })
      await stale
      assert.equal(reads[1].options.signal.aborted, true)
      assert.equal(manager.info.value.like_state, 0)
      assert.equal(manager.info.value.cnt_info.thumb_up, 4)
      operation = manager.interact('like')
      posts[2].resolve({ code: -503 })
      await operation
      assert.equal(manager.info.value.cnt_info.thumb_up, 4)
      assert.equal(errors.length, 1)
      operation = manager.interact('like')
      data.selectedCategory.value = { id: 2 }
      reads[2].resolve({ code: 0, data: info(2) })
      await flush()
      posts[3].resolve({ code: 0, data: { like_state: 1, likes: 100 } })
      await operation
      assert.equal(manager.info.value.id, 2)
      assert.equal(manager.info.value.cnt_info.thumb_up, 4)
      operation = manager.interact('like')
      account = 3
      manager.reset()
      posts[4].resolve({ code: 0, data: { likes: 101 } })
      await operation
      assert.equal(manager.info.value, undefined)
    }
    finally {
      scope.stop()
      lifetime.dispose()
    }
  })

  check('folder social: creator is linked; own collection stays disabled; other collection follows authoritative state', async () => {
    const Social = await compileComponent('../src/contentScripts/views/Favorites/FavoriteFolderSocial.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/utils/main': { removeHttpFromUrl: url => url },
    })
    const own = Vue.ref(true)
    const pending = Vue.ref(false)
    const info = Vue.reactive({ upper: { mid: 7, name: 'Creator', face: '' }, like_state: 0, fav_state: 0, cnt_info: { thumb_up: 3, collect: 4 } })
    let requests = 0
    const root = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Social, { info, own: own.value, pending: pending.value, loading: false, failed: false, onSubscribe: () => requests++ }) })
    app.mount(root)
    try {
      assert.equal(root.querySelector('a').href, 'https://space.bilibili.com/7')
      assert.ok(root.querySelector('a').textContent.includes('Creator'))
      const collect = () => root.querySelectorAll('button')[1]
      assert.equal(collect().disabled, true)
      collect().click()
      assert.equal(requests, 0)
      own.value = false
      await flush()
      assert.equal(collect().disabled, false)
      collect().click()
      assert.equal(requests, 1)
      info.fav_state = 1
      await flush()
      assert.equal(collect().getAttribute('aria-pressed'), 'true')
      assert.ok(collect().textContent.includes('favorites.unfavorite'))
      info.like_state = 1
      info.cnt_info.thumb_up++
      await flush()
      assert.ok(root.querySelector('button').textContent.includes('favorites.folder_unlike'))
      assert.equal(root.querySelector('button').getAttribute('aria-pressed'), 'true')
      pending.value = true
      await flush()
      assert.equal(collect().disabled, true)
    }
    finally {
      app.unmount()
      root.remove()
    }
  })

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

  check('favorite refresh keeps old cards through pending/error/retry and commits the first replacement once', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const reads = []
    const data = useFavoritesData({ api: { getFavoriteResources: () => {
      const held = deferred()
      reads.push(held)
      return held.promise
    } }, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    try {
      data.selectedCategory.value = { id: 1 }
      const initial = data.loadSelectedContent()
      reads[0].resolve(page([video(1)]))
      await initial
      const pending = data.refreshSelectedContent()
      assert.equal(data.favoriteResources[0].id, 1)
      assert.equal(data.isFullPageLoading.value, false)
      reads[1].resolve({ code: -503 })
      await pending
      assert.equal(data.favoriteResources[0].id, 1)
      const retry = data.retryFavoriteContent()
      assert.equal(data.isFullPageLoading.value, false)
      reads[2].resolve(page([video(2)]))
      await retry
      assert.deepEqual(data.favoriteResources.map(item => item.id), [2])
    }
    finally { data.dispose() }
  })

  check('page preloading: selection shares one import with mounting and failed imports can retry', async () => {
    const { createAsyncPageRegistry } = await import('../src/utils/asyncPage')
    const registry = createAsyncPageRegistry()
    const held = deferred()
    let imports = 0
    let mounts = 0
    const page = registry.define(() => {
      imports++
      return held.promise
    }, {})
    registry.preload(page)
    registry.preload(page)
    assert.equal(imports, 1)
    assert.equal(mounts, 0)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(page) })
    app.mount(host)
    held.resolve({ setup: () => {
      mounts++
      return () => Vue.h('p', 'loaded')
    } })
    await flush()
    assert.equal(imports, 1)
    assert.equal(mounts, 1)
    app.unmount()
    host.remove()
    let attempts = 0
    const retry = registry.define(async () => {
      attempts++
      if (attempts === 1)
        throw new Error('network')
      return { render: () => null }
    }, {})
    registry.preload(retry)
    await flush()
    registry.preload(retry)
    await flush()
    assert.equal(attempts, 2)
  })

  check('folder editor lifecycle: a late metadata read and a changed upload account cannot overwrite or submit another editor', async () => {
    const { useFavoriteFolderManager } = await import('../src/contentScripts/views/Favorites/useFavoriteFolderManager')
    const { useFavoriteWrites } = await import('../src/contentScripts/views/Favorites/useFavoriteWrites')
    const { createAccountLifetime } = await import('../src/utils/accountLifetime')
    let account = 1
    let uploads = 0
    let creates = 0
    const lifetime = createAccountLifetime(() => account)
    const reads = []
    const api = {
      getFavoriteFolderInfo: () => {
        const held = deferred()
        reads.push(held)
        return held.promise
      },
      uploadFavoriteCover: async () => {
        uploads++
        return { code: 0, data: { location: 'https://i0.hdslb.com/cover.png' } }
      },
      createFavoriteFolder: async () => {
        creates++
        return { code: 0, data: { id: 9 } }
      },
    }
    const data = {
      capture: lifetime.capture,
      favoriteView: Vue.ref('article'),
      searchScope: Vue.ref('current'),
      selectedCategory: Vue.ref(),
      selectedSeason: Vue.ref(),
      favoriteCategories: [],
      categoryState: { failed: false },
      getFavoriteCategories: async () => {},
      setFolderCover() {},
    }
    const writes = useFavoriteWrites({ api, capture: lifetime.capture, getCSRF: () => 'fixture', onError() {} })
    const scope = Vue.effectScope()
    const manager = scope.run(() => useFavoriteFolderManager({ api, data, writes, getCSRF: () => 'fixture', notify() {}, error() {}, confirm: async () => true }))
    const older = manager.openEditor(1)
    await manager.openEditor()
    reads[0].resolve({ code: 0, data: { id: 1, mid: 1, upper: { mid: 1 }, title: 'old', intro: 'old', attr: 1 } })
    await older
    assert.equal(manager.editor.id, 0)
    assert.equal(manager.form.value.title, '')
    assert.equal(manager.form.value.privacy, 0)
    const fileRead = deferred()
    const save = manager.save({ title: 'new', intro: '', cover: '', privacy: 0 }, { type: 'image/png', size: 4, name: 'test.png', arrayBuffer: () => fileRead.promise })
    account = 2
    fileRead.resolve(new Uint8Array([137, 80, 78, 71]).buffer)
    await save
    assert.equal(uploads, 0)
    assert.equal(creates, 0)
    scope.stop()
  })

  check('folder editor contract: complete fields, bounded cover upload and server sorting preserve the default folder', async () => {
    assert.deepEqual(folderForm.moveFavoriteFolderToTop([1, 2, 3, 4], 4), [1, 4, 2, 3])
    assert.deepEqual(folderForm.moveFavoriteFolderToTop([1, 2, 3], 1), [1, 2, 3])
    assert.deepEqual(folderForm.moveFavoriteFolderToTop([1, 2, 3], 99), [1, 2, 3])
    assert.equal(folderForm.isFavoriteCover({ type: 'image/svg+xml', size: 12 }), false)
    assert.equal(folderForm.isFavoriteCover({ type: 'image/png', size: folderForm.FAVORITE_COVER_MAX_BYTES + 1 }), false)
    const form = folderForm.serializeFavoriteCover({ bytes: [137, 80, 78, 71], mimeType: 'image/png', fileName: 'cover.png', csrf: 'fixture' })
    assert.equal(form.get('bucket'), 'medialist')
    assert.equal(form.get('dir'), 'cover')
    assert.equal(form.get('file').type, 'image/png')
    assert.equal(form.get('csrf'), 'fixture')
    assert.throws(() => folderForm.serializeFavoriteCover({ bytes: [256], mimeType: 'image/png', csrf: 'fixture' }))
    const schema = (await loadSourceModule('../src/background/messageListeners/api/favorite.ts', { '../../utils': { AHS: { J_D: [] } }, '~/utils/favoriteFolderForm': folderForm })).default
    for (const name of ['createFavoriteFolder', 'editFavoriteFolder']) {
      for (const field of ['title', 'intro', 'cover', 'privacy', 'csrf'])
        assert.ok(Object.hasOwn(schema[name]._fetch.body, field))
    }
    assert.ok(schema.likeFavoriteFolder.url.endsWith('/x/v3/fav/thump/up'))
    assert.ok(schema.cleanFavoriteFolder.url.endsWith('/x/v3/fav/resource/clean'))
    assert.equal(schema.uploadFavoriteCover._fetch.headers, undefined, 'multipart boundary belongs to fetch')
  })

  check('folder writes: native parameters, duplicate-submit lock and own-folder subscription guard', async () => {
    const { useFavoriteWrites } = await import('../src/contentScripts/views/Favorites/useFavoriteWrites')
    const { createAccountLifetime } = await import('../src/utils/accountLifetime')
    const lifetime = createAccountLifetime(() => 1)
    const calls = []
    const errors = []
    const names = ['createFavoriteFolder', 'editFavoriteFolder', 'sortFavoriteFolders', 'cleanFavoriteFolder', 'likeFavoriteFolder', 'favCollectedFavoriteFolder', 'unfavCollectedFavoriteFolder']
    const api = Object.fromEntries(names.map(name => [name, async (params) => {
      calls.push({ name, params })
      return { code: 0, data: { id: 9 } }
    }]))
    const writer = useFavoriteWrites({ api, capture: lifetime.capture, getCSRF: () => 'fixture', onError: e => errors.push(e) })
    await writer.execute(writer.prepare({ kind: 'create', title: 'name', intro: 'intro', cover: 'https://i0.hdslb.com/test.png', privacy: 0 }))
    await writer.execute(writer.prepare({ kind: 'edit', folderId: 9, title: 'name', intro: 'updated', cover: '', privacy: 1 }))
    await writer.execute(writer.prepare({ kind: 'sort', ids: [1, 9, 2] }))
    await writer.execute(writer.prepare({ kind: 'clean', folderId: 9 }))
    await writer.execute(writer.prepare({ kind: 'like', folderId: 9, liked: false }))
    await writer.execute(writer.prepare({ kind: 'like', folderId: 9, liked: true }))
    await writer.execute(writer.prepare({ kind: 'subscribe', folderId: 9, mid: 1, subscribed: false }))
    assert.equal(calls.length, 6, 'own folders never reach the subscribe API')
    assert.equal(errors.length, 1)
    await writer.execute(writer.prepare({ kind: 'subscribe', folderId: 9, mid: 2, subscribed: false }))
    assert.equal(calls.at(-1).name, 'favCollectedFavoriteFolder')
    assert.equal(calls[1].params.intro, 'updated')
    assert.equal(calls[2].params.sort, '1,9,2')
    assert.equal(calls[4].params.thumb_type, 1)
    assert.equal(calls[4].params.up_mid, 1)
    assert.equal(calls[5].params.thumb_type, 2)
    assert.ok(calls.every(call => call.params.csrf === 'fixture'))
    const held = deferred()
    api.cleanFavoriteFolder = (params) => {
      calls.push({ name: 'clean', params })
      return held.promise
    }
    const transaction = writer.prepare({ kind: 'clean', folderId: 9 })
    const running = writer.execute(transaction)
    assert.equal(await writer.execute(transaction), null)
    held.resolve({ code: 0 })
    await running
  })

  check('favorite switches: replaced and unmounted content reads are aborted without committing stale cards', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const calls = []
    const data = useFavoritesData({ api: { getFavoriteResources: (params, request) => {
      const held = deferred()
      calls.push({ ...held, params, signal: request.signal })
      return held.promise
    } }, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    data.selectedCategory.value = { id: 1 }
    const first = data.loadSelectedContent()
    data.selectedCategory.value = { id: 2 }
    const second = data.loadSelectedContent()
    assert.equal(calls[0].signal.aborted, true)
    calls[1].resolve(page([video(2)]))
    await second
    calls[0].resolve(page([video(1)]))
    await first
    assert.deepEqual(data.favoriteResources.map(item => item.id), [2])
    const third = data.loadSelectedContent()
    data.dispose()
    assert.equal(calls[2].signal.aborted, true)
    calls[2].resolve(page([video(3)]))
    await third
    assert.equal(data.favoriteResources.length, 0)
  })

  check('favorite pagination: the video grid owns viewport filling instead of racing a second recursive loader', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const reads = []
    const data = useFavoritesData({ api: { getFavoriteResources: async ({ pn }) => {
      reads.push(pn)
      return page(Array.from({ length: 20 }, (_, index) => video((pn - 1) * 20 + index)), 100, true)
    } }, user: {}, getAccountId: () => 1, haveScrollbar: async () => false, t: key => key })
    data.selectedCategory.value = { id: 1 }
    await data.loadSelectedContent()
    assert.deepEqual(reads, [1])
    await data.loadNextPage()
    assert.deepEqual(reads, [1, 2])
    data.dispose()
  })

  check('favorite removal: offset pagination rewinds after a large batch without skipping unseen videos', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    let items = Array.from({ length: 80 }, (_, index) => video(index + 1))
    const folder = { id: 1, media_count: 80 }
    const data = useFavoritesData({ api: {
      getFavoriteCategories: async () => ({ code: 0, data: { list: [{ ...folder, media_count: items.length }] } }),
      getFavoriteResources: async ({ pn }) => page(items.slice((pn - 1) * 20, pn * 20), items.length, pn * 20 < items.length),
    }, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    data.favoriteCategories.push(folder)
    data.selectedCategory.value = folder
    await data.loadSelectedContent()
    await data.loadNextPage()
    items = items.slice(25)
    data.applyResourceWrite({ kind: 'delete', sourceId: 1, resourceKeys: Array.from({ length: 25 }, (_, i) => `${i + 1}:2`) }, data.contentVersion.value)
    await data.loadNextPage()
    assert.deepEqual(data.favoriteResources.map(item => item.id), items.slice(0, 20).map(item => item.id))
    data.dispose()
  })

  check('course favorites: native GET context is scoped to the course read and the captured zero result stays empty', async () => {
    const rules = JSON.parse(await readFile(new URL('../assets/rules.json', import.meta.url), 'utf8'))
    const rule = rules.find(item => item.condition.regexFilter?.includes('pugv'))
    assert.ok(rule)
    assert.equal(rule.condition.domainType, 'thirdParty')
    assert.deepEqual(rule.condition.requestMethods, ['get'])
    assert.deepEqual(rule.condition.resourceTypes, ['xmlhttprequest'])
    assert.equal(rule.action.requestHeaders.find(header => header.header === 'origin').value, 'https://space.bilibili.com')
    assert.equal(rule.action.requestHeaders.find(header => header.header === 'referer').value, 'https://space.bilibili.com/')
    const matcher = new RegExp(rule.condition.regexFilter)
    assert.ok(matcher.test('https://api.bilibili.com/pugv/app/web/favorite/page?mid=1&pn=1&ps=20'))
    assert.equal(matcher.test('https://api.bilibili.com/pugv/app/web/favorite/del'), false)
    assert.equal(matcher.test('https://api.bilibili.com/x/v3/fav/resource/list'), false)
    const api = await loadSourceModule('../src/background/messageListeners/api/favorite.ts', { '../../utils': { AHS: { J_D: [] } }, '~/utils/favoriteFolderForm': folderForm })
    assert.equal(api.default.getFavoriteCourses.params.web_location, '333.1387')
    const { parseOtherFavoritePage } = await import('../src/contentScripts/views/Favorites/otherFavorites')
    const captured = JSON.parse(await readFile(new URL('../tests/fixtures/favorites/course-empty-native.json', import.meta.url), 'utf8'))
    assert.deepEqual(parseOtherFavoritePage('course', captured), { items: [], total: 0 })
    assert.throws(() => parseOtherFavoritePage('course', { code: -403, message: '访问权限不足' }))
  })

  check('course favorites: successful empty payloads finish normally while auth and incomplete pages remain errors', async () => {
    const { parseOtherFavoritePage } = await import('../src/contentScripts/views/Favorites/otherFavorites')
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const payloads = [null, {}, { items: [] }, { items: null, page: { total: 0 } }, { items: [], page: { total: '0' } }]
    for (const payload of payloads)
      assert.deepEqual(parseOtherFavoritePage('course', { code: 0, data: payload }), { items: [], total: 0 })
    for (const response of [{ code: -101 }, { code: 0, data: { items: null, page: { total: 1 } } }, { code: 0, data: { items: [], page: { next: true } } }])
      assert.throws(() => parseOtherFavoritePage('course', response))
    let response = { code: 0, data: null }
    const data = useFavoritesData({ api: { getFavoriteCourses: async () => response }, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    try {
      data.favoriteView.value = 'article'
      data.otherFavoriteType.value = 'course'
      await data.loadSelectedContent()
      assert.equal(data.failedContentPage.value, null)
      assert.equal(data.noMoreContent.value, true)
      assert.equal(data.otherFavoriteCounts.course, 0)
      response = { code: -101, data: null }
      await data.loadSelectedContent()
      assert.equal(data.failedContentPage.value, 1)
      assert.equal(data.noMoreContent.value, false)
    }
    finally { data.dispose() }
  })

  check('text-only states: no illustration is mounted and the retry action remains keyboard accessible', async () => {
    const Empty = await compileComponent('../src/components/Empty.vue', {
      '~/utils/messaging': { getExtensionAssetUrl: () => 'https://example.test/empty.png' },
    })
    const textOnly = Vue.ref(true)
    let retries = 0
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Empty, { description: 'Retry the request', textOnly: textOnly.value, fill: true, actionLabel: 'Retry', onAction: () => retries++ }) })
    app.mount(host)
    try {
      assert.equal(host.querySelector('img'), null)
      assert.equal(host.querySelector('button').type, 'button')
      host.querySelector('button').click()
      assert.equal(retries, 1)
      textOnly.value = false
      await Vue.nextTick()
      assert.ok(host.querySelector('img'), 'ordinary pages retain their existing illustrated state')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('favorite resource actions: icon actions in one row keep transfer gating and pending state', async () => {
    const Actions = await compileComponent('../src/contentScripts/views/Favorites/FavoriteResourceActions.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/IconButton.vue': { default: await compileComponent('../src/components/IconButton.vue') },
      '~/components/Tooltip.vue': { default: { setup: (_props, { slots }) => () => slots.default?.() } },
    })
    const state = Vue.reactive({ managing: false, pending: false, total: 2, selectedCount: 0, allSelected: false, canTransfer: true })
    const events = []
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Actions, {
      ...state,
      onToggle: () => { state.managing = !state.managing },
      onSelectAll: () => events.push('all'),
      onCopy: () => events.push('copy'),
      onMove: () => events.push('move'),
      onRemove: () => events.push('remove'),
    }) })
    app.mount(host)
    try {
      host.querySelector('button').click()
      await Vue.nextTick()
      // Icon-only: each action is named by its label.
      const button = label => [...host.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === `favorites.${label}`)
      assert.ok([...host.querySelectorAll('button')].every(item => !item.textContent.trim()), 'no full-width text buttons')
      assert.ok(button('batch_copy').disabled)
      button('batch_select_all').click()
      state.selectedCount = 2
      state.allSelected = true
      await Vue.nextTick()
      button('batch_copy').click()
      button('batch_move').click()
      button('batch_unfavorite').click()
      assert.deepEqual(events, ['all', 'copy', 'move', 'remove'])
      state.pending = true
      await Vue.nextTick()
      assert.ok([...host.querySelectorAll('button')].every(item => item.disabled))
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('favorite video sorting: order reaches each page and late previous-order responses are ignored', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const calls = []
    const data = useFavoritesData({
      api: { getFavoriteResources: (params) => {
        const task = deferred()
        calls.push({ ...task, params })
        return task.promise
      } },
      user: {},
      getAccountId: () => 1,
      haveScrollbar: async () => true,
      t: key => key,
    })
    try {
      data.selectedCategory.value = { id: 1 }
      const first = data.loadSelectedContent()
      data.videoOrder.value = 'view'
      const second = data.loadSelectedContent()
      assert.deepEqual(calls.map(call => call.params.order), ['mtime', 'view'])
      calls[1].resolve(page([video(2)], 2, true))
      await second
      calls[0].resolve(page([video(1)], 1, false))
      await first
      assert.deepEqual(data.favoriteResources.map(item => item.id), [2])
      const next = data.loadNextPage()
      assert.equal(calls[2].params.order, 'view')
      assert.equal(calls[2].params.pn, 2)
      calls[2].resolve(page([video(3)], 2, false))
      await next
      data.videoOrder.value = 'pubtime'
      const published = data.loadSelectedContent()
      assert.equal(calls[3].params.order, 'pubtime')
      assert.equal(calls[3].params.pn, 1)
      calls[3].resolve(page([], 0, false))
      await published
    }
    finally { data.dispose() }
  })

  check('other favorites: topic search scans later pages, scopes reuse data and courses stay independent', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const { parseOtherFavoritePage } = await import('../src/contentScripts/views/Favorites/otherFavorites')
    const topics = []
    const courses = []
    const data = useFavoritesData({
      api: {
        getFavoriteTopics: async (params) => {
          topics.push(params)
          return { code: 0, data: { topic_list: { topic_items: [{ id: params.page_num, name: params.page_num === 1 ? 'ordinary' : 'needle', stat_desc: 'description', jump_url: `https://www.bilibili.com/v/topic/detail?topic_id=${params.page_num}` }], page_info: { total: 2 } } } }
        },
        getFavoriteCourses: async (params) => {
          courses.push(params)
          return { code: 0, data: { items: [{ season_id: 3, title: 'needle course', status: 'complete', cover: '' }], page: { total: 1 } } }
        },
      },
      user: {},
      getAccountId: () => 1,
      haveScrollbar: async () => true,
      t: key => key,
    })
    try {
      data.favoriteView.value = 'article'
      data.otherFavoriteType.value = 'topic'
      await data.loadSelectedContent()
      data.keyword.value = 'needle'
      await flush()
      assert.deepEqual(topics.map(params => params.page_num), [1, 2])
      assert.equal(data.visibleOtherFavorites.value[0].id, '2')
      data.otherSearchScope.value = 'detail'
      await flush()
      assert.equal(data.visibleOtherFavorites.value.length, 0)
      data.keyword.value = 'description'
      assert.equal(data.visibleOtherFavorites.value.length, 2)
      assert.equal(topics.length, 2)
      data.keyword.value = ''
      data.otherFavoriteType.value = 'course'
      data.otherSearchScope.value = 'all'
      await data.loadSelectedContent()
      assert.equal(data.visibleOtherFavorites.value.length, 1)
      assert.equal(data.visibleOtherFavorites.value[0].url, 'https://www.bilibili.com/cheese/play/ss3')
      assert.deepEqual(courses[0], { mid: '1', pn: 1, ps: 20 })
      assert.equal(data.otherFavoriteCounts.topic, 2)
      assert.equal(data.otherFavoriteCounts.course, 1)
      data.resetAccount()
      assert.deepEqual({ ...data.otherFavoriteCounts }, {})
      assert.equal(data.visibleOtherFavorites.value.length, 0)
      assert.equal(parseOtherFavoritePage('topic', { code: 0, data: { topic_list: null } }).total, 0)
      assert.throws(() => parseOtherFavoritePage('course', { code: -101, data: null }))
      assert.throws(() => parseOtherFavoritePage('course', { code: 0, data: { items: [], page: { total: 'unknown' } } }))
    }
    finally { data.dispose() }
  })

  check('favorite subscription filters: paginate to matching types and compose with collection search', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const sources = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, type: i === 50 ? 21 : 11, title: i === 50 ? 'needle season' : `folder ${i}`, media_count: 0 }))
    const requests = []
    const data = useFavoritesData({
      api: {
        getCollectedFavoriteSeasons: async ({ pn, ps }) => {
          requests.push(pn)
          return { code: 0, data: { list: sources.slice((pn - 1) * ps, pn * ps), count: 51, has_more: pn === 1 } }
        },
        getFavoriteSeasonResources: async () => page([], 0),
      },
      user: {},
      getAccountId: () => 1,
      haveScrollbar: async () => true,
      t: key => key,
    })
    try {
      data.favoriteView.value = 'season'
      data.subscriptionFilter.value = 'season'
      await data.loadMoreSubscriptions()
      await flush()
      assert.deepEqual(requests, [1, 2])
      assert.equal(data.visibleSubscriptions.value.length, 1)
      assert.equal(data.selectedSeason.value.id, 51)
      data.keyword.value = 'needle'
      assert.equal(data.visibleSubscriptions.value.length, 1)
      data.subscriptionFilter.value = 'folder'
      assert.equal(data.visibleSubscriptions.value.length, 0)
      data.keyword.value = ''
      assert.equal(data.visibleSubscriptions.value.length, 50)
      data.subscriptionFilter.value = 'season'
      data.removeSeasons([{ id: 51, type: 21 }])
      assert.equal(data.selectedSeason.value, undefined, 'removing the final matching season must not select a filtered-out folder')
    }
    finally { data.dispose() }
  })

  check('favorite folder covers: lazy queue deduplicates reads and rejects retired account responses', async () => {
    const { createFavoriteFolderCoverLoader } = await import('../src/contentScripts/views/Favorites/favoriteFolderCovers')
    const calls = []
    const loader = createFavoriteFolderCoverLoader((id, signal) => {
      const task = deferred()
      calls.push({ id, signal, ...task })
      return task.promise
    })
    loader.load(1)
    loader.load(1)
    loader.load(2)
    assert.deepEqual(calls.map(call => call.id), [1])
    loader.seed(1, 'fresh-content-cover')
    calls[0].resolve('older-thumbnail')
    await flush()
    assert.equal(loader.covers[1], 'fresh-content-cover')
    assert.deepEqual(calls.map(call => call.id), [1, 2])
    loader.reset()
    assert.equal(calls[1].signal.aborted, true)
    loader.load(2)
    calls[1].resolve('previous-account')
    calls[2].resolve('current-account')
    await flush()
    assert.deepEqual({ ...loader.covers }, { 2: 'current-account' })
    loader.load(3)
    loader.load(4)
    loader.dispose()
    calls[3].resolve('unmounted')
    await flush()
    assert.equal(calls.length, 4)
    assert.deepEqual({ ...loader.covers }, {})
  })

  check('favorite sidebar: single-click selection, isolated actions and inert collapsed panels', async () => {
    let onIntersect
    let stopped = false
    const Item = await compileComponent('../src/contentScripts/views/Favorites/FavoriteSidebarItem.vue', {
      '@vueuse/core': { useIntersectionObserver: (_, callback) => {
        onIntersect = callback
        return { stop: () => stopped = true }
      } },
      '~/utils/main': { removeHttpFromUrl: value => value },
    })
    const selected = Vue.ref(false)
    let visible = 0
    let actions = 0
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Item, {
      title: 'Folder',
      count: 8,
      expanded: selected.value,
      icon: 'folder',
      onSelect: () => selected.value = true,
      onVisible: () => visible++,
    }, { default: () => Vue.h('button', { class: 'test-action', onClick: () => actions++ }, 'Play') }) })
    app.mount(host)
    try {
      const trigger = host.querySelector('.favorite-sidebar-item__trigger')
      const panel = host.querySelector('.favorite-sidebar-item__panel')
      assert.equal(panel.getAttribute('aria-hidden'), 'true')
      assert.ok(panel.hasAttribute('inert'))
      trigger.click()
      await Vue.nextTick()
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      assert.equal(panel.hasAttribute('inert'), false)
      host.querySelector('.test-action').click()
      assert.equal(actions, 1)
      selected.value = false
      selected.value = true
      selected.value = false
      await Vue.nextTick()
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      assert.ok(panel.hasAttribute('inert'))
      onIntersect([{ isIntersecting: true }])
      assert.equal(visible, 1)
      assert.equal(stopped, true)
      assert.equal(host.querySelector('button button'), null)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('favorite search: later collection names and current collection videos are found without refetching edits', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const { matchesFavoriteQuery } = await import('../src/contentScripts/views/Favorites/favoriteSearch')
    assert.ok(matchesFavoriteQuery(' ＡＢＣ 作者 ', 'abc 视频', '作者'))
    const sources = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, type: 11, title: i === 50 ? 'needle collection' : `collection ${i}`, media_count: 2 }))
    const directoryCalls = []
    const contentCalls = []
    const data = useFavoritesData({
      api: {
        getCollectedFavoriteSeasons: async ({ pn, ps }) => {
          directoryCalls.push(pn)
          return { code: 0, data: { list: sources.slice((pn - 1) * ps, pn * ps), count: 51, has_more: pn === 1 } }
        },
        getFavoriteResources: async ({ pn }) => {
          contentCalls.push(pn)
          return page([video(pn, { title: pn === 2 ? 'needle video' : 'ordinary' })], 2, pn === 1)
        },
      },
      user: {},
      getAccountId: () => 1,
      haveScrollbar: async () => true,
      t: key => key,
    })
    try {
      data.favoriteView.value = 'season'
      await data.loadMoreSubscriptions()
      await flush()
      data.keyword.value = 'needle'
      await flush()
      assert.deepEqual(directoryCalls, [1, 2])
      assert.deepEqual(contentCalls, [1, 2])
      assert.equal(data.visibleSubscriptions.value[0].id, 51)
      assert.equal(data.visibleResources.value[0].id, 2)
      data.keyword.value = 'ordinary'
      await flush()
      assert.equal(data.visibleResources.value[0].id, 1)
      data.keyword.value = ''
      await flush()
      assert.equal(data.visibleResources.value.length, 2)
      assert.deepEqual(contentCalls, [1, 2])
      data.keyword.value = 'needle'
      data.favoriteView.value = 'article'
      assert.equal(data.keyword.value, '')
      data.favoriteView.value = 'season'
      assert.equal(data.keyword.value, 'needle')
      data.resetAccount()
      data.favoriteView.value = 'season'
      assert.equal(data.keyword.value, '')
    }
    finally { data.dispose() }
  })

  check('favorite search: article title/author pagination deduplicates, stops a stalled cursor and retries the same boundary', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const requests = []
    let repaired = false
    let account = 1
    const late = deferred()
    const article = (id, content, name) => ({ opus_id: String(id), content, author: { name } })
    const data = useFavoritesData({
      api: { getFavoriteArticles: async ({ page: pn, offset }) => {
        requests.push([pn, offset])
        if (pn === 3)
          return late.promise
        return { code: 0, data: pn === 1
          ? { items: [article(1, 'ordinary', 'Alice')], offset: 'a', has_more: true }
          : { items: [article(1, 'ordinary', 'Alice'), article(2, 'needle', 'Bob')], offset: repaired ? 'b' : 'a', has_more: true } }
      } },
      user: {},
      getAccountId: () => account,
      haveScrollbar: async () => true,
      t: key => key,
    })
    try {
      data.favoriteView.value = 'article'
      await data.loadSelectedContent()
      data.keyword.value = 'needle Bob'
      await flush()
      assert.equal(data.visibleArticles.value.length, 1)
      assert.equal(data.favoriteArticles.length, 2)
      assert.equal(data.stalledContentPage.value, 2)
      assert.equal(data.articleFavoriteOffset.value, 'a')
      await flush()
      assert.equal(requests.length, 2)
      repaired = true
      await data.retryFavoriteContent()
      await flush()
      assert.deepEqual(requests, [[1, ''], [2, 'a'], [2, 'a'], [3, 'b']])
      account = 2
      data.resetAccount()
      late.resolve({ code: 0, data: { items: [article(3, 'needle', 'Bob')], has_more: false } })
      await flush()
      assert.equal(data.favoriteArticles.length, 0)
    }
    finally { data.dispose() }
  })

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

  check('favorite popover: a reloaded extension neither toasts nor logs the terminal read failure', async () => {
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: 1 }, isInWatchLater: () => undefined })
    const toasts = []
    const logged = []
    let categoryReads = 0
    const Popover = await compileComponent('../src/components/TopBar/components/pops/FavoritesPop.vue', {
      '~/components/Tooltip.vue': { default: { inheritAttrs: false, setup: (_props, { slots }) => () => slots.default?.() } },
      '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
      '~/utils/watchLater': { updateOwnedWatchLater: () => assert.fail('no write') },
      'pinia': { storeToRefs: () => ({ favoriteStateVersion: Vue.ref(0) }) },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: message => toasts.push(message) }) },
      '~/components/Empty.vue': { default: { render: () => null } },
      '~/composables/useOptimizedScroll': { useOptimizedScroll() {} },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: { favorite: {
        getFavoriteCategories: () => {
          categoryReads++
          return Promise.reject(new Error('Extension context invalidated.'))
        },
        getFavoriteResources: () => assert.fail('no folder without categories'),
      } } },
      '~/utils/dataFormatter': { calcCurrentTime: () => '01:00' },
      '~/utils/favoriteResource': await import('../src/utils/favoriteResource'),
      '~/utils/favoriteSeason': await import('../src/utils/favoriteSeason'),
      '~/utils/main': { getUserID: () => '1', removeHttpFromUrl: value => value, scrollToTop() {} },
      '~/utils/messaging': { isExtensionContextInvalidatedError: error => String(error?.message ?? error).includes('Extension context invalidated') },
      './PopoverListSkeleton.vue': { default: { render: () => null } },
    }, { globals: { console: { ...console, error: (...args) => logged.push(args) } } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Popover)
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
    app.component('Button', { setup: (_props, { slots }) => () => Vue.h('button', slots.default?.()) })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      await flush()
      assert.equal(categoryReads, 1)
      assert.deepEqual(toasts, [])
      assert.deepEqual(logged, [])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('favorite popover: actual rendered cards share media keys, retain invalid entries, and pause duplicate/failed pagination', async () => {
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: 1 }, isInWatchLater: () => undefined })
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
      '~/components/Tooltip.vue': { default: { inheritAttrs: false, setup: (_props, { slots }) => () => slots.default?.() } },
      '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
      '~/utils/watchLater': { updateOwnedWatchLater: () => assert.fail('rendering a folder must not submit watch later') },
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
      '~/utils/messaging': { isExtensionContextInvalidatedError: error => String(error?.message ?? error).includes('Extension context invalidated') },
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
    const schema = (await loadSourceModule('../src/background/messageListeners/api/favorite.ts', { '../../utils': { AHS: { J_D: 'json' } }, '~/utils/favoriteFolderForm': folderForm })).default
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
