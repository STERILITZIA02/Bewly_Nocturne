import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadSourceModule } from './sourceModuleHarness'

export function registerAdvertisingRuleChecks(check, { Vue, compileComponent, flush }) {
  check('advertising: native brand layouts preserve creative links and never invent video actions', async () => {
    const { toSearchBrandAdvertisementCards } = await import('../src/utils/advertising')
    const image = toSearchBrandAdvertisementCards({ id: 1, card: { card_type: 105, adver: { adver_name: 'Brand', adver_page_url: 'https://example.com/brand' }, covers: [{ title: 'First', url: '//i0.hdslb.com/one.png', button_list: [{ jump_url: 'https://example.com/one' }] }, { title: 'Second', url: 'https://i0.hdslb.com/two.png', button_list: [{ jump_url: 'javascript:bad()' }] }] } })
    assert.deepEqual(image.map(item => item.url), ['https://example.com/one', 'https://example.com/brand'])
    assert.equal(image[0].cover, 'https://i0.hdslb.com/one.png')
    assert.equal(new Set(image.map(item => item.advertisementKey)).size, 2)
    const video = toSearchBrandAdvertisementCards({ id: 2, card: { card_type: 106, videos: [{ title: 'Video creative', cover: 'https://i0.hdslb.com/video.png', url: 'https://example.com/media.mp4', button_list: [{ jump_url: 'https://example.com/campaign' }] }] } })
    assert.equal(video[0].url, 'https://example.com/campaign', 'media assets are not landing pages or autoplay requests')
    const archive = toSearchBrandAdvertisementCards({ id: 3, card: { card_type: 107 }, bili_user: { mid: 42, res: [{ title: 'Archive', bvid: 'BVfixture', pic: '//i0.hdslb.com/archive.png' }] } })
    assert.equal(archive[0].url, 'https://www.bilibili.com/video/BVfixture/')
    assert.equal(archive[0].bvid, '')
    assert.equal(archive[0].aid, undefined)
    const unknown = toSearchBrandAdvertisementCards({ id: 4, card: { card_type: 999, adver: { adver_name: 'Brand entry', adver_page_url: 'https://example.com/entry' } } })
    assert.equal(unknown[0].url, 'https://example.com/entry')
    assert.equal(unknown[0].title, 'Brand entry')
    const buttonOnly = toSearchBrandAdvertisementCards({ id: 5, card: { button: { jump_url: 'https://example.com/button' } } })
    assert.equal(buttonOnly[0].url, 'https://example.com/button')
    assert.ok([...image, ...video, ...archive, ...unknown].every(item => item.isAdvertisement))
  })

  check('advertising: actual comprehensive search restores brand sections from accepted results without another read', async () => {
    const advertising = await import('../src/utils/advertising')
    const preferences = Vue.ref({ blockAds: true, blockTopSearchPageAds: true, searchResultsPaginationMode: 'pagination' })
    const results = Vue.ref(null)
    const page = Vue.ref(1)
    let reads = 0
    let relationReads = 0
    const response = { result: [{ result_type: 'brand_ad', data: [{ id: 71, card: { card_type: 105, adver: { adver_name: 'Campaign' }, covers: [{ title: 'Accepted promotion', url: 'https://i0.hdslb.com/fixture.png', button_list: [{ jump_url: 'https://example.com/accepted' }] }] } }] }, { result_type: 'video', data: [] }] }
    const noop = () => {}
    const empty = { render: () => null }
    const Card = await compileComponent('../src/components/VideoCard/AdvertisementCard.vue', { 'vue-i18n': { useI18n: () => ({ t: key => key }) } })
    const stubs = Object.fromEntries([
      '~/components/ArticleCard/ArticleCard.vue',
      '~/components/BangumiEpisodeList/BangumiEpisodeList.vue',
      '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue',
      '~/components/UserCard/UserAvatarLink.vue',
      '~/components/VideoCard/VideoCard.vue',
      '~/components/VideoCardGrid.vue',
      '../components/AllSearchSkeleton.vue',
      '../components/Pagination.vue',
      '../components/renderers/EsportsMatchCard.vue',
      '../components/SearchEmptyState.vue',
    ].map(path => [path, { default: empty }]))
    const Component = await compileComponent('../src/contentScripts/views/SearchResults/pages/AllSearchPage.vue', {
      ...stubs,
      '../components/mediaResults.scss': {},
      '@vueuse/core': { useResizeObserver: noop },
      'dompurify': { default: { sanitize: value => value } },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ warning: noop, error: noop }) },
      '~/components/VideoCard/AdvertisementCard.vue': { default: Card },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ haveScrollbar: async () => true, handleBackToTop: noop }) },
      '~/composables/useUserRelations': { useUserRelations: () => ({ userRelations: Vue.ref({}), batchQueryUserRelations: async () => { relationReads++ }, reset: noop }) },
      '~/logic': { settings: preferences },
      '~/stores/topBarStore': { useTopBarStore: () => ({ isLogin: true, userInfo: { mid: 42 } }) },
      '~/utils/accountScope': { resolveAuthenticatedAccountId: () => 42 },
      '~/utils/advertising': advertising,
      '~/utils/lvIcons': Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`LV${index}_ICON`, ''])),
      '~/utils/main': { getUserID: () => 42 },
      '~/utils/searchHighlight': { sanitizeSearchHighlight: value => value },
      '~/utils/userRelation': { changeUserRelation: () => { throw new Error('unexpected write') } },
      '../searchSections': await import('../src/contentScripts/views/SearchResults/searchSections'),
      '../searchTransforms': await loadSourceModule('../src/contentScripts/views/SearchResults/searchTransforms.ts', {
        '~/utils/advertising': advertising,
        '~/utils/dataFormatter': { numFormatter: String, parseStatNumber: Number },
        '~/utils/htmlDecode': { decodeHtmlEntities: value => value },
      }),
      '../composables/useSearchRequest': { useSearchRequest: () => ({ results, requestScope: Vue.ref(0), isLoading: Vue.ref(false), error: Vue.ref(null), reset: noop, search: async (_options, accept) => {
        reads++
        return accept({ data: response }, () => true)
      } }) },
      '../composables/usePagination': { refreshSearchPage: noop, usePagination: () => ({ currentPage: page, totalResults: Vue.ref(1), totalPages: Vue.ref(2), context: Vue.ref(''), hasMore: Vue.ref(false), extractPagination: noop, updatePage: (value) => { page.value = value }, getNextPage: () => 1, reset: noop }) },
      '../composables/useLoadMore': { useLoadMore: () => ({ hasMore: Vue.ref(false), exhausted: Vue.ref(false), needsManualLoadMore: Vue.ref(false), requestLoadMore: noop, resumeLoadMore: noop, handleLoadMoreCompletion: noop, setHasMore: noop, setExhausted: noop, reset: noop }) },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Component, { keyword: 'fixture', filters: {} })
    app.component('LazyPicture', { props: ['src', 'alt'], render() {
      return Vue.h('img', { src: this.src, alt: this.alt })
    } })
    try {
      app.mount(host)
      await flush()
      assert.equal(reads, 1)
      assert.equal(host.querySelector('.brand-advertisement-results'), null)
      preferences.value.blockAds = false
      await flush()
      assert.equal(host.querySelector('.brand-advertisement-results a').href, 'https://example.com/accepted')
      assert.match(host.querySelector('.brand-advertisement-results').textContent, /common.advertisement/)
      assert.equal(host.querySelectorAll('.brand-advertisement-results button, .brand-advertisement-results video').length, 0)
      preferences.value.blockAds = true
      await flush()
      assert.equal(host.querySelector('.brand-advertisement-results'), null)
      preferences.value.blockAds = false
      await flush()
      assert.ok(host.querySelector('.brand-advertisement-results a'))
      page.value = 2
      await flush()
      assert.equal(host.querySelector('.brand-advertisement-results'), null, 'first-page modules do not leak into subsequent pagination pages')
      assert.equal(reads, 1)
      assert.equal(relationReads, 0)
      assert.equal(results.value.result[0].data.length, 1)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('advertising: compiled native rules hide explicit channel slots only while the existing switch is on', async () => {
    const { compile } = await import('sass')
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = compile(fileURLToPath(new URL('../src/styles/blockAds.scss', import.meta.url))).css
    const root = document.documentElement
    const wasEnabled = root.classList.contains('block-useless-contents')
    const host = document.body.appendChild(document.createElement('section'))
    host.innerHTML = '<div class="gg-floor-module"><div class="ad-item"><a href="https://example.com/promotion">Promotion</a></div></div><div class="promotion-c">Normal editorial banner</div><div class="ad-item">Unrelated template</div>'
    const ad = host.querySelector('.gg-floor-module > .ad-item')
    const ordinary = host.querySelector('.promotion-c')
    const unrelated = host.lastElementChild
    try {
      root.classList.remove('block-useless-contents')
      assert.notEqual(window.getComputedStyle(ad).display, 'none')
      root.classList.add('block-useless-contents')
      assert.equal(window.getComputedStyle(ad).display, 'none')
      assert.notEqual(window.getComputedStyle(ordinary).display, 'none')
      assert.notEqual(window.getComputedStyle(unrelated).display, 'none')
      const late = ad.parentElement.appendChild(document.createElement('div'))
      late.className = 'ad-item'
      assert.equal(window.getComputedStyle(late).display, 'none', 'native CSS also handles late advertising slots')
      root.classList.remove('block-useless-contents')
      assert.notEqual(window.getComputedStyle(ad).display, 'none')
      assert.notEqual(window.getComputedStyle(late).display, 'none')
      assert.equal(host.querySelector('.gg-floor-module > .ad-item'), ad, 'the original node remains owned by the native page')
      assert.equal(ad.querySelector('a').href, 'https://example.com/promotion')
    }
    finally {
      root.classList.toggle('block-useless-contents', wasEnabled)
      host.remove()
      style.remove()
    }
  })

  check('advertising: explicit API markers preserve normal titles, unknown types and merged pagination data', async () => {
    const { isBilibiliAdvertisement } = await import('../src/utils/advertising')
    const { mergeSections } = await import('../src/contentScripts/views/SearchResults/searchSections')
    for (const item of [null, {}, { type: 'download' }, { type: 'reader' }, { title: '广告拍摄教程' }, { ad_info: {} }, { is_ad: false }])
      assert.equal(isBilibiliAdvertisement(item), false)
    for (const item of [{ type: 'video_ad' }, { goto: 'ad' }, { card_type: 'cm_v1' }, { is_ad: 1 }, { ad_info: { creative_id: 5 } }])
      assert.equal(isBilibiliAdvertisement(item), true)
    const result = mergeSections({ result: [{ result_type: 'video', data: [{ aid: 1 }, { aid: 2, is_ad: true }] }] }, { result: [{ result_type: 'video', data: [{ aid: 2, is_ad: true }, { aid: 3 }] }] })
    assert.deepEqual(result.result[0].data.map(item => item.aid), [1, 2, 3], 'merge must retain ads so disabling the setting can restore accepted results')
  })

  check('advertising: real observer identifies explicit ads without hiding normal recommendations or native controls', async () => {
    const frames = new Map()
    let frameId = 0
    const blocker = await loadSourceModule('../src/contentScripts/features/blockUselessFeedCards.ts', {}, {
      MutationObserver,
      requestAnimationFrame: (run) => {
        frames.set(++frameId, run)
        return frameId
      },
      cancelAnimationFrame: id => frames.delete(id),
    })
    const settle = async () => {
      for (let i = 0; i < 5; i++) {
        await flush()
        for (const [id, run] of frames) {
          frames.delete(id)
          run()
        }
      }
      assert.equal(frames.size, 0, 'marking a card must not leave a repaint loop')
    }
    const host = document.body.appendChild(document.createElement('section'))
    host.innerHTML = '<div class="feed-card" id="normal"><div class="bili-video-card is-rcmd"><a href="https://www.bilibili.com/video/BV1ab411c7mD/">Normal video</a><span></span></div></div><div class="feed-card" id="commercial"><div class="bili-feed-card"><div class="bili-video-card"><span class="bili-video-card__info--ad">广告</span></div></div></div><div id="arc_toolbar_report"><button>Native action</button><input value="draft"><span class="ad-feedback-entry"></span></div><div id="v_desc">简介中的广告一词不是广告标记</div>'
    const normal = host.querySelector('#normal')
    const commercial = host.querySelector('#commercial')
    const marker = normal.querySelector('span')
    const link = normal.querySelector('a')
    try {
      assert.equal(blocker.shouldEnableUselessFeedCardBlocker({ blockAds: true, homePage: false, searchPage: true, inIframe: true }), true)
      assert.equal(blocker.shouldEnableUselessFeedCardBlocker({ blockAds: false, homePage: true, searchPage: true, inIframe: false }), false)
      assert.equal(blocker.shouldEnableUselessFeedCardBlocker({ blockAds: true, homePage: false, nativeFeedPage: true, inIframe: false }), true)
      blocker.setUselessFeedCardBlockerEnabled(true)
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), false, 'missing no-interest controls do not imply an advertisement')
      assert.equal(commercial.classList.contains('bewly-blocked-feed-card'), true)
      assert.equal(commercial.firstElementChild.classList.contains('bewly-blocked-feed-card'), false, 'only the outer card owns the hidden slot')
      marker.className = 'ad-feedback-entry'
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), true)
      marker.className = ''
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), false)
      link.href = 'https://cm.bilibili.com/cm/api/noticeUrl?fixture=1'
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), true)
      link.href = 'https://www.bilibili.com/video/BV1ab411c7mD/'
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), false)
      assert.equal(host.querySelector('#arc_toolbar_report').classList.contains('bewly-blocked-feed-card'), false)
      assert.equal(host.querySelector('input').value, 'draft')
      assert.equal(host.querySelector('#v_desc').textContent, '简介中的广告一词不是广告标记')
      blocker.setUselessFeedCardBlockerEnabled(false)
      assert.equal(commercial.classList.contains('bewly-blocked-feed-card'), false, 'disabled state restores the original node')
      host.innerHTML = '<div class="video-list"><div class="col_3"><div class="bili-video-card"><span class="ad-feedback-entry"></span></div></div><div class="col_3"><div class="bili-video-card">Normal search result</div></div></div>'
      blocker.setUselessFeedCardBlockerEnabled(true)
      await settle()
      const results = host.querySelectorAll('.col_3')
      assert.equal(results[0].classList.contains('bewly-blocked-feed-card'), true)
      assert.equal(results[1].classList.contains('bewly-blocked-feed-card'), false)
      results[0].querySelector('span').remove()
      await settle()
      assert.equal(results[0].classList.contains('bewly-blocked-feed-card'), false)
      blocker.setUselessFeedCardBlockerEnabled(false)
      host.innerHTML = '<div class="feedchannel"><div class="head-cards"><div class="feed-card"><div class="bili-video-card">Normal</div></div></div><div class="other-feed"></div></div>'
      blocker.setUselessFeedCardBlockerEnabled(true)
      host.querySelector('.other-feed').innerHTML = '<div class="feed-card"><div class="bili-video-card"><span class="ad-feedback-entry"></span></div></div>'
      await settle()
      const laterCard = host.querySelector('.other-feed .feed-card')
      assert.equal(laterCard.classList.contains('bewly-blocked-feed-card'), true, 'the second channel list shares the same observer')
      assert.equal(laterCard.firstElementChild.classList.contains('bewly-blocked-feed-card'), false)
      blocker.setUselessFeedCardBlockerEnabled(false)
      assert.equal(laterCard.classList.contains('bewly-blocked-feed-card'), false)
      host.className = 'right-container'
      host.innerHTML = '<div class="video-list"><div class="row"><div class="bili-video-card"><span class="ad-feedback-entry"></span></div></div></div><div class="video-page-game-card-small"><a href="https://www.bilibili.com/video/BVfixture">Related game</a></div>'
      blocker.setUselessFeedCardBlockerEnabled(true)
      await settle()
      const row = host.querySelector('.row')
      const game = host.querySelector('.video-page-game-card-small')
      const originalAd = row.firstElementChild
      assert.equal(row.classList.contains('bewly-blocked-feed-card'), true)
      assert.equal(game.classList.contains('bewly-blocked-feed-card'), false, 'game content alone is not advertising evidence')
      const regular = row.appendChild(document.createElement('div'))
      regular.className = 'bili-video-card'
      await settle()
      assert.equal(row.classList.contains('bewly-blocked-feed-card'), false, 'a reused wrapper cannot hide another recommendation')
      assert.equal(originalAd.classList.contains('bewly-blocked-feed-card'), true)
      assert.equal(regular.classList.contains('bewly-blocked-feed-card'), false)
      game.querySelector('a').href = 'https://cm.bilibili.com/cm/api/noticeUrl?fixture=2'
      await settle()
      assert.equal(game.classList.contains('bewly-blocked-feed-card'), true)
      regular.dataset.targetUrl = 'https://cm.bilibili.com/cm/api/noticeUrl?fixture=3'
      await settle()
      assert.equal(regular.classList.contains('bewly-blocked-feed-card'), true, 'explicit click targets on the card root are evidence too')
      regular.removeAttribute('data-target-url')
      await settle()
      assert.equal(regular.classList.contains('bewly-blocked-feed-card'), false)
    }
    finally {
      blocker.setUselessFeedCardBlockerEnabled(false)
      host.remove()
    }
    await settle()
    assert.equal(frames.size, 0)
  })
}
