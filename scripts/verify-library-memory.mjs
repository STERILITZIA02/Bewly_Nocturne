import assert from 'node:assert/strict'

export function registerLibraryMemoryChecks(check, { Vue, compileComponent, flush }) {
  check('memory: virtual rows keep their metrics when enrichment replaces equal keys and still rebuild for sorting or layout changes', async () => {
    const { useCardWindow } = await import('../src/composables/useCardWindow')
    const { CardRowMetrics } = await import('../src/utils/cardRowMetrics')
    const reset = CardRowMetrics.prototype.reset
    let resets = 0
    CardRowMetrics.prototype.reset = function (...args) {
      resets++
      return reset.apply(this, args)
    }
    const keys = Vue.ref(Array.from({ length: 100 }, (_, i) => i))
    const layout = Vue.ref('grid')
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      useCardWindow({ root: Vue.ref(null), container: Vue.ref(null), keys, columns: Vue.ref(2), gap: Vue.ref(16), enabled: Vue.ref(true), estimatedHeight: Vue.ref(200), layout, canRelease: () => true })
      return () => null
    } })
    try {
      app.mount(host)
      await flush()
      const initial = resets
      keys.value = [...keys.value]
      await flush()
      assert.equal(resets, initial)
      keys.value = [...keys.value].reverse()
      await flush()
      assert.equal(resets, initial + 1)
      layout.value = 'list'
      await flush()
      assert.equal(resets, initial + 2)
    }
    finally {
      app.unmount()
      host.remove()
      CardRowMetrics.prototype.reset = reset
    }
  })

  check('memory: responsive covers share finite CDN widths and never rewrite animation, foreign, signed or unknown crop URLs', async () => {
    const { getResponsiveCoverSrcset } = await import('../src/utils/responsiveImage')
    const base = 'https://i1.hdslb.com/bfs/archive/test.jpg'
    const variants = getResponsiveCoverSrcset(`${base}@672w_378h_1c_!web-home-common-cover`, 'avif').split(', ')
    assert.equal(variants.length, 8)
    assert.equal(variants[0], `${base}@160w_90h_1c.avif 160w`)
    assert.equal(variants.at(-1), `${base}@1920w_1080h_1c.avif 1920w`)
    for (const url of [base.replace('.jpg', '.gif'), `${base}?sign=x`, base.replace('i1.hdslb.com', 'example.com'), `${base}@96w_96h_1c`, `${base}@672w_378h_2c`])
      assert.equal(getResponsiveCoverSrcset(url), undefined)
  })

  check('memory: responsive LazyPicture measures once, follows layout, keeps its image node and falls back without srcset after errors', async () => {
    let measured = 0
    let release = 0
    let size
    const responsive = await import('../src/utils/responsiveImage')
    const Picture = await compileComponent('../src/components/LazyPicture.vue', { '~/utils/responsiveImage': {
      ...responsive,
      observeCoverWidth: (_element, callback) => {
        measured++
        size = callback
        callback(249)
        return () => release++
      },
    } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Picture, { src: 'https://i1.hdslb.com/bfs/archive/fixture.jpg@672w_378h_1c', loading: 'eager', responsiveCover: true }) })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      const image = host.querySelector('img')
      assert.equal(image.sizes, '249px')
      assert.equal(image.srcset.split(', ').length, 8)
      size(480)
      await flush()
      assert.equal(host.querySelector('img'), image)
      assert.equal(image.sizes, '480px')
      assert.equal(measured, 1)
      image.dispatchEvent(new Event('error'))
      await flush()
      assert.equal(host.querySelector('img').getAttribute('srcset'), null)
      assert.equal(host.querySelectorAll('source').length, 0)
    }
    finally {
      app.unmount()
      host.remove()
    }
    assert.equal(release, 1)
  })

  check('memory: omitted Tooltip placement defaults to top without Vue warnings, including teleported keyboard hints', async () => {
    const Tooltip = await compileComponent('../src/components/Tooltip.vue')
    const host = document.body.appendChild(document.createElement('div'))
    const messages = []
    const app = Vue.createApp({ setup() {
      Vue.provide('BEWLY_APP', { mainAppRef: Vue.ref(host) })
      return () => Vue.h(Tooltip, { content: '退出管理', teleport: true }, () => Vue.h('button', '管理'))
    } })
    app.config.warnHandler = message => messages.push(message)
    try {
      app.mount(host)
      host.querySelector('button').focus()
      await flush()
      assert.equal(host.querySelector('[role="tooltip"]').getAttribute('aria-hidden'), 'false')
      assert.deepEqual(messages, [])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('memory: changing folders cancels queued avatar reads while preserving completed cache and newer owners', async () => {
    const { createFavoriteAvatarLoader } = await import('../src/utils/favoriteAvatar')
    const calls = []
    const loader = createFavoriteAvatarLoader((mid, signal) => new Promise(resolve => calls.push({ mid, signal, resolve })))
    const cached = loader.load(99)
    calls[0].resolve('cached-face')
    await cached
    await flush()
    const pending = Array.from({ length: 30 }, (_, i) => loader.load(i + 1))
    assert.equal(calls.length, 5)
    loader.cancelPending()
    assert.ok(calls.slice(1).every(call => call.signal.aborted))
    await Promise.all(pending)
    const newer = loader.load(1)
    await flush()
    assert.equal(calls.length, 6, 'old queued users are not fetched')
    calls.at(-1).resolve('new-face')
    assert.equal(await newer, 'new-face')
    assert.equal(await loader.load(99), 'cached-face')
    loader.dispose()
  })

  check('memory: favorite metadata pages do not fetch offscreen avatars; only requested visible items enrich once', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    let reads = 0
    const data = useFavoritesData({ api: { getFavoriteResources: async () => ({ code: 0, data: {
      info: { id: 1, cover: '', media_count: 200 },
      has_more: true,
      medias: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, type: 2, title: 'fixture', upper: { mid: i + 1, name: 'fixture' } })),
    } }) }, user: { getUserCard: async () => {
      reads++
      return { code: 0, data: { card: { face: 'https://i0.hdslb.com/bfs/face/fixture.jpg' } } }
    } }, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    try {
      data.selectedCategory.value = { id: 1 }
      await data.loadSelectedContent()
      assert.equal(data.favoriteResources.length, 20)
      assert.equal(reads, 0)
      data.loadResourceAvatars(data.favoriteResources.slice(0, 3))
      await flush()
      assert.equal(reads, 3)
      data.loadResourceAvatars(data.favoriteResources.slice(0, 3))
      await flush()
      assert.equal(reads, 3)
      assert.ok(data.favoriteResources.slice(0, 3).every(item => item.upper.face))
      assert.ok(data.favoriteResources.slice(3).every(item => !item.upper.face))
    }
    finally { data.dispose() }
  })

  check('memory: initial history and article viewport fill yield after a bounded batch even before layout reports a scrollbar', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const { LIBRARY_AUTOFILL_PAGE_LIMIT } = await import('../src/constants/library')
    let historyReads = 0
    let articleReads = 0
    const history = useHistoryTimeline({ api: { getHistoryList: async () => {
      historyReads++
      return { code: 0, data: { list: Array.from({ length: 20 }, (_, i) => ({ title: String(i), view_at: 10_000 - historyReads * 20 - i, history: { oid: historyReads * 20 + i, business: 'archive' } })) } }
    } }, getAccountId: () => 1, getCSRF: () => '', haveScrollbar: async () => false, onWriteError: assert.fail })
    const favorites = useFavoritesData({ api: { getFavoriteArticles: async () => {
      articleReads++
      return { code: 0, data: { items: [{ opus_id: String(articleReads), content: 'fixture', author: { name: 'fixture' } }], offset: String(articleReads), has_more: true } }
    } }, user: {}, getAccountId: () => 1, haveScrollbar: async () => false, t: key => key })
    try {
      await history.load()
      assert.equal(historyReads, LIBRARY_AUTOFILL_PAGE_LIMIT)
      assert.equal(history.noMoreContent.value, false)
      favorites.favoriteView.value = 'article'
      await favorites.loadSelectedContent()
      assert.equal(articleReads, LIBRARY_AUTOFILL_PAGE_LIMIT)
      assert.equal(favorites.noMoreContent.value, false)
    }
    finally {
      history.dispose()
      favorites.dispose()
    }
  })

  check('memory: hidden favorites pause automatic search pagination and resume without discarding loaded results', async () => {
    const { useFavoritesData } = await import('../src/contentScripts/views/Favorites/useFavoritesData')
    const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    let reads = 0
    const data = useFavoritesData({ api: { getFavoriteArticles: async () => {
      reads++
      return { code: 0, data: { items: [{ opus_id: String(reads), content: 'needle', author: { name: 'fixture' } }], offset: String(reads), has_more: reads < 2 } }
    } }, user: {}, getAccountId: () => 1, haveScrollbar: async () => true, t: key => key })
    try {
      data.favoriteView.value = 'article'
      data.keyword.value = 'needle'
      await data.loadSelectedContent()
      await flush()
      assert.equal(reads, 1)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
      assert.equal(reads, 2)
      assert.equal(data.favoriteArticles.length, 2)
    }
    finally {
      data.dispose()
      if (descriptor)
        Object.defineProperty(document, 'hidden', descriptor)
      else delete document.hidden
    }
  })

  check('memory: hidden native homepage images release sources and restore latest native values without touching the header', async () => {
    const { suspendHiddenHomepageImages } = await import('../src/contentScripts/features/hiddenHomepageImages')
    const doc = document.implementation.createHTMLDocument('fixture')
    doc.documentElement.classList.add('bewly-custom-homepage')
    doc.body.innerHTML = '<div id="app"><header class="bili-header"><img src="header.png"></header><main><picture><source srcset="cover-large.png 2x"><img src="cover.png" srcset="cover-small.png 1x"></picture></main></div><div id="bewly"><img src="extension.png"></div>'
    const image = doc.querySelector('main img')
    const source = doc.querySelector('source')
    const stop = suspendHiddenHomepageImages(doc)
    assert.match(image.getAttribute('src'), /^data:image\/gif/)
    assert.equal(source.getAttribute('srcset'), '')
    assert.equal(doc.querySelector('header img').getAttribute('src'), 'header.png')
    assert.equal(doc.querySelector('#bewly img').getAttribute('src'), 'extension.png')
    image.setAttribute('src', 'native-update.png')
    source.removeAttribute('srcset')
    await flush()
    assert.match(image.getAttribute('src'), /^data:image\/gif/)
    const late = doc.createElement('img')
    late.setAttribute('src', 'late.png')
    doc.querySelector('main').append(late)
    await flush()
    assert.match(late.getAttribute('src'), /^data:image\/gif/)
    stop()
    assert.equal(image.getAttribute('src'), 'native-update.png')
    assert.equal(image.getAttribute('srcset'), 'cover-small.png 1x')
    assert.equal(source.getAttribute('srcset'), null)
    assert.equal(late.getAttribute('src'), 'late.png')
    image.setAttribute('src', 'after-dispose.png')
    await flush()
    assert.equal(image.getAttribute('src'), 'after-dispose.png')
  })

  check('memory: late native roots are suspended, moved images restore, and visible homepages are untouched', async () => {
    const { suspendHiddenHomepageImages } = await import('../src/contentScripts/features/hiddenHomepageImages')
    const doc = document.implementation.createHTMLDocument('fixture')
    doc.body.innerHTML = '<div id="app"><img src="original.png"></div>'
    const visibleStop = suspendHiddenHomepageImages(doc)
    assert.equal(doc.querySelector('img').getAttribute('src'), 'original.png')
    visibleStop()
    doc.documentElement.classList.add('bewly-custom-homepage')
    const stop = suspendHiddenHomepageImages(doc)
    const root = doc.createElement('div')
    root.id = 'i_cecream'
    root.innerHTML = '<img src="late-root.png">'
    doc.body.append(root)
    await flush()
    const image = root.firstElementChild
    assert.match(image.getAttribute('src'), /^data:image\/gif/)
    doc.body.append(image)
    await flush()
    assert.equal(image.getAttribute('src'), 'late-root.png')
    stop()
  })

  check('memory: native header-sync transport is excluded while actual message and drawer pages remain targets', async () => {
    const { CONTENT_SCRIPT_EXCLUDE_MATCHES, isContentScriptTargetUrl } = await import('../src/constants/contentScript')
    assert.ok(CONTENT_SCRIPT_EXCLUDE_MATCHES.includes('*://message.bilibili.com/pages/nav/header_sync*'))
    assert.equal(isContentScriptTargetUrl('https://message.bilibili.com/pages/nav/header_sync'), false)
    assert.equal(isContentScriptTargetUrl('https://message.bilibili.com/#/whisper'), true)
    assert.equal(isContentScriptTargetUrl('https://www.bilibili.com/video/BV1xx411c7mD'), true)
  })

  check('memory: 100 collapsed folders mount only the selected action panel and retain at most the outgoing panel during handoff', async () => {
    const Row = await compileComponent('../src/contentScripts/views/Favorites/FavoriteSidebarItem.vue', { '~/utils/main': { removeHttpFromUrl: value => value } })
    const selected = Vue.ref(0)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h('ul', Array.from({ length: 100 }, (_, id) => Vue.h(Row, { key: id, title: String(id), count: 0, expanded: selected.value === id, icon: '' }, () => Vue.h('button', { class: 'fixture-action' }, 'Manage')))) })
    try {
      app.mount(host)
      await flush()
      assert.equal(host.querySelectorAll('.fixture-action').length, 1)
      selected.value = 1
      await flush()
      assert.ok(host.querySelectorAll('.fixture-action').length <= 2)
      await new Promise(resolve => setTimeout(resolve, 270))
      assert.equal(host.querySelectorAll('.fixture-action').length, 1)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
