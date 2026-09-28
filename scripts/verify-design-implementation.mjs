import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'

export function registerDesignImplementationChecks(check, { Vue, compileComponent, flush }) {
  check('design: filter summaries clear every applied constraint and each user choice emits once', async () => {
    for (const kind of ['Video', 'User']) {
      const Filters = await compileComponent(`../src/contentScripts/views/SearchResults/components/Search${kind}Filters.vue`, {
        'vue-i18n': { useI18n: () => ({ t: (key, params) => params?.filters ?? key }) },
        './DatePicker.vue': { default: { render: () => null } },
      })
      const fields = kind === 'Video'
        ? { videoOrder: 'click', duration: 2, timeRange: 'custom', customStartDate: '2026-09-01', customEndDate: '2026-09-20' }
        : { order: 'fans', userType: 1 }
      const model = Vue.reactive({ ...fields })
      const updates = []
      const events = Object.fromEntries(Object.keys(fields).map(key => [`onUpdate:${key}`, (value) => {
        updates.push([key, value])
        model[key] = value
      }]))
      const options = { orderOptions: [{ value: '', label: 'Default' }, { value: kind === 'Video' ? 'click' : 'fans', label: 'Popular' }], durationOptions: [{ value: 0, label: 'Any' }, { value: 2, label: 'Long' }], timeRangeOptions: [{ value: 'all', label: 'Any date' }], userTypeOptions: [{ value: 0, label: 'Everyone' }, { value: 1, label: 'Creators' }] }
      const host = document.body.appendChild(document.createElement('div'))
      const app = Vue.createApp({ setup: () => () => Vue.h(Filters, { ...model, ...options, ...events }) })
      app.mount(host)
      try {
        await flush()
        assert.ok(host.querySelector('.bew-search-filter-summary').textContent.includes('Popular'))
        const clear = host.querySelector('.bew-search-filter-clear')
        clear.focus()
        clear.click()
        await flush()
        assert.equal(host.querySelector('.bew-search-filter-summary'), null)
        assert.equal(document.activeElement?.textContent.trim(), 'Default', 'focus moves to the reset choice instead of falling to body')
        assert.equal(document.activeElement?.getAttribute('aria-pressed'), 'true')
        if (kind === 'Video') {
          assert.deepEqual({ ...model }, { videoOrder: '', duration: 0, timeRange: 'all', customStartDate: '', customEndDate: '' })
        }
        else {
          assert.deepEqual({ ...model }, { order: '', userType: 0 })
          updates.length = 0
          host.querySelectorAll('.bew-segment-control__item')[1].click()
          await flush()
          assert.deepEqual(updates, [['order', 'fans']])
        }
      }
      finally {
        app.unmount()
        host.remove()
      }
    }
  })

  check('design: subscriptions group only authoritative season identities without dropping trailers, extras or unknown entries', async () => {
    const module = await loadSourceFunctions('../src/contentScripts/views/Home/components/SubscribedSeries.vue', ['groupSeriesUpdates'], {})
    const entry = (uniqueId, season_id, title) => ({ uniqueId, item: { modules: { module_dynamic: { major: { pgc: { season_id, title } } } } } })
    const items = [entry('latest', 20, '最新正片'), entry('other', 30, '别的剧集'), entry('trailer', 20, '预告'), entry('extra', 20, '花絮'), entry('unknown-1', undefined, '同名'), entry('unknown-2', undefined, '同名')]
    const groups = module.groupSeriesUpdates(items)
    assert.equal(groups.length, 4)
    assert.equal(groups[0].latest, items[0])
    assert.deepEqual(Array.from(groups[0].updates, item => item.uniqueId), ['latest', 'trailer', 'extra'])
    assert.equal(groups.reduce((sum, group) => sum + group.updates.length, 0), items.length)
    assert.equal(items.length, 6, 'grouping never replaces the raw pagination/cache state')
  })

  check('design: Guochuang stays in anime while the declared film and TV season types remain media', async () => {
    const module = await loadSourceFunctions('../src/contentScripts/views/SearchResults/searchTransforms.ts', ['isMediaFtItem'], {})
    for (const season_type of [1, 4])
      assert.equal(module.isMediaFtItem({ type: 'media_bangumi', season_type }), false)
    for (const season_type of [2, 3, 5, 7])
      assert.equal(module.isMediaFtItem({ season_type }), true)
    assert.equal(module.isMediaFtItem({ type: 'media_ft' }), true)
  })

  check('design: timetable Today centers only the horizontal viewport and honors reduced motion', async () => {
    const viewport = document.createElement('div')
    const list = viewport.appendChild(document.createElement('ul'))
    const today = list.appendChild(document.createElement('li'))
    today.dataset.today = 'true'
    Object.defineProperties(viewport, { clientWidth: { value: 600 }, scrollWidth: { value: 2600 } })
    viewport.getBoundingClientRect = () => ({ left: 100, width: 600 })
    today.getBoundingClientRect = () => ({ left: 1300 - viewport.scrollLeft, width: 200 })
    const scrolls = []
    viewport.scrollTo = (options) => {
      viewport.scrollLeft = options.left
      scrolls.push(options)
    }
    let reduce = false
    const module = await loadSourceFunctions('../src/contentScripts/views/Anime/components/AnimeTimeTable.vue', ['scrollHorizontally', 'scrollToToday', 'updateScrollBounds'], {
      window: { matchMedia: () => ({ matches: reduce }) },
      scrollViewport: Vue.ref(viewport),
      animeTimeTableWrap: Vue.ref(list),
      atStart: Vue.ref(true),
      atEnd: Vue.ref(true),
    })
    module.scrollToToday('auto')
    assert.deepEqual({ ...scrolls.at(-1) }, { left: 1000, behavior: 'auto' })
    assert.equal(module.atStart.value, false)
    assert.equal(module.atEnd.value, false)
    viewport.scrollLeft = 0
    reduce = true
    module.scrollToToday()
    assert.deepEqual({ ...scrolls.at(-1) }, { left: 1000, behavior: 'auto' })
    assert.equal(scrolls.every(options => !('top' in options)), true, 'finding Today cannot scroll the whole anime page')
  })

  check('design: only explicit one-film metadata turns year-like episode progress into a time label', async () => {
    const { SeasonVersion } = await import('../src/models/anime/watchList')
    const module = await loadSourceFunctions('../src/contentScripts/views/Anime/Anime.vue', ['getWatchProgressLabel'], {
      SeasonVersion,
      t: (key, params) => params?.time ? `time:${params.time}` : key,
    })
    const movie = { season_version: SeasonVersion.Movie, total_count: 1, progress: '看到第1995话 34:28' }
    assert.equal(module.getWatchProgressLabel(movie), 'time:34:28')
    assert.equal(module.getWatchProgressLabel({ ...movie, season_version: SeasonVersion.Tv }), movie.progress)
    assert.equal(module.getWatchProgressLabel({ ...movie, total_count: 2 }), movie.progress)
    assert.equal(module.getWatchProgressLabel({ ...movie, progress: '未识别的原站进度' }), '未识别的原站进度')
    assert.equal(module.getWatchProgressLabel({ ...movie, progress: '' }), 'anime.havent_seen')
  })

  check('design: history continuation preserves the source part and hash and never invents progress for completed or non-video entries', async () => {
    const { Business } = await import('../src/models/history/history')
    const module = await loadSourceFunctions('../src/contentScripts/views/History/History.vue', ['getHistoryUrl', 'getHistoryResumeUrl'], { Business, URL })
    const item = { uri: 'https://www.bilibili.com/video/BV1fixture/?p=3#comments', history: { business: Business.ARCHIVE }, progress: 42.9, duration: 600 }
    const target = new URL(module.getHistoryResumeUrl(item))
    assert.equal(target.searchParams.get('p'), '3')
    assert.equal(target.searchParams.get('t'), '42')
    assert.equal(target.hash, '#comments')
    for (const progress of [-1, 0, 600, Number.NaN])
      assert.equal(module.getHistoryResumeUrl({ ...item, progress }), undefined)
    assert.equal(module.getHistoryResumeUrl({ ...item, history: { business: Business.LIVE } }), undefined)
    assert.equal(module.getHistoryResumeUrl({ ...item, uri: 'https://example.com/video/other' }), undefined)
  })

  check('design: the playback sidebar button owns Enter/Space before native document shortcuts', async () => {
    const current = { sidebarLayout: 'compact' }
    let activations = 0
    let nativeKeys = 0
    const nativeHandler = () => nativeKeys++
    document.addEventListener('keydown', nativeHandler)
    document.addEventListener('keyup', nativeHandler)
    const module = await loadSourceFunctions('../src/utils/bewlyWidescreen/shell.ts', ['createSidebarToggleButton'], {
      document,
      session: { current },
      setSidebarLayout: (layout) => {
        current.sidebarLayout = layout
        activations++
      },
    })
    const button = document.body.appendChild(module.createSidebarToggleButton())
    try {
      button.focus()
      for (const key of ['Enter', ' ']) {
        button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
        button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, repeat: true }))
        button.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
        assert.equal(document.activeElement, button)
      }
      assert.equal(activations, 2)
      assert.equal(nativeKeys, 0)
      assert.equal(current.sidebarLayout, 'compact')
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      button.dispatchEvent(tab)
      assert.equal(tab.defaultPrevented, false)
      assert.equal(nativeKeys, 1, 'only the local activation keys are handled')
    }
    finally {
      button.remove()
      document.removeEventListener('keydown', nativeHandler)
      document.removeEventListener('keyup', nativeHandler)
    }
  })

  check('design: server-colored Bangumi badges retain readable foregrounds and one configured keyboard link', async () => {
    const colors = await import('../src/utils/themeColor')
    const dark = Vue.ref(false)
    const Card = await compileComponent('../src/components/BangumiCard/BangumiCard.vue', {
      '~/composables/useDark': { useDark: () => ({ isDark: dark }) },
      '~/composables/useVideoCardSharedStyles': { useBangumiCardSharedStyles: () => ({ bangumiTitleClass: '', bangumiTitleStyle: {} }) },
      '~/utils/dataFormatter': { numFormatter: String },
      '~/utils/main': { removeHttpFromUrl: value => value },
      '~/utils/themeColor': colors,
      './BangumiCardSkeleton.vue': { default: { render: () => null } },
    })
    const bangumi = Vue.reactive({ title: 'Accessible title', url: 'https://www.bilibili.com/bangumi/play/ss1', cover: 'https://i0.hdslb.com/example.jpg', desc: '', evaluate: 'Details', badge: { text: 'VIP', bgColor: '#fb7299', bgColorDark: '#d44e7d' } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Card, { bangumi })
    app.component('ALink', { props: ['href'], setup: (props, { attrs, slots }) => () => Vue.h('a', { ...attrs, href: props.href }, slots.default?.()) })
    try {
      app.mount(host)
      for (const [surface, isDark] of [['#fb7299', false], ['#d44e7d', true], ['#00c0ff', false], ['#0b91be', true], ['#ffffff', false], ['#000000', true]]) {
        dark.value = isDark
        bangumi.badge[isDark ? 'bgColorDark' : 'bgColor'] = surface
        await flush()
        const foreground = colors.getContrastingForeground(surface)
        assert.ok(colors.relativeContrast(foreground, surface) >= 4.5)
        const badge = host.querySelector('.bangumi-card__badge')
        assert.equal(badge.style.color, foreground === '#000000' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)')
      }
      const links = host.querySelectorAll('a[href]')
      assert.equal(links.length, 1, 'the title and cover share the same configured navigation and one Tab stop')
      assert.equal(links[0].getAttribute('aria-label'), bangumi.title)
      links[0].focus()
      assert.equal(document.activeElement, links[0])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('design: responsive moment images preserve the original identity and only generate known CDN variants', async () => {
    const { getMomentThumbnailSrcset } = await import('../src/components/MomentCard/utils')
    const candidates = getMomentThumbnailSrcset('http://i0.hdslb.com/bfs/example.png@360w.webp?from=fixture').split(', ')
    assert.equal(candidates.length, 4)
    for (const candidate of candidates) {
      const [url, descriptor] = candidate.split(' ')
      const parsed = new URL(url)
      assert.equal(parsed.protocol, 'https:')
      assert.equal(parsed.search, '?from=fixture')
      assert.equal(parsed.pathname, `/bfs/example.png@${descriptor}.webp`)
    }
    assert.equal(getMomentThumbnailSrcset('https://example.com/picture.png'), undefined)
    assert.equal(getMomentThumbnailSrcset(''), undefined)
  })
}
