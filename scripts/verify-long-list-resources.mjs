import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { MOMENTS_SOURCE_FILES } from './refactoredSources'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

export function registerLongListResourceChecks(check, { Vue, compileComponent, flush }) {
  check('mounted Moments: failed pagination keeps rows/cursor, blocks repeated automatic loads, and cancels feed/portal reads on exit', async () => {
    const calls = []
    const pending = []
    const errors = []
    let fail = false
    let stall = false
    let hidden = false
    const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    const noop = () => {}
    const viewport = document.body.appendChild(document.createElement('div'))
    Object.defineProperties(viewport, { scrollHeight: { value: 4000 }, clientHeight: { value: 800 }, scrollTop: { value: 0, writable: true } })
    const appState = { scrollViewportRef: Vue.ref(viewport), handlePageRefresh: Vue.ref(), handleReachBottom: Vue.ref() }
    const data = id => ({ id, publishedAt: 1, isVideo: false, author: { mid: '1' } })
    const filterPolicy = Vue.ref({ active: false, keywords: [], passes: () => true })
    let ended = false
    const api = { moment: {
      getMoments: async (params, options) => {
        calls.push({ params, ...options })
        if (stall) {
          const wait = deferred()
          pending.push({ ...wait, signal: options.signal })
          return wait.promise
        }
        if (fail)
          throw new Error('pagination fixture')
        return { code: 0, data: { items: [data(String(calls.length))], offset: `cursor-${calls.length}`, has_more: !ended } }
      },
      getMomentsPortal: async (_params, { signal }) => {
        if (stall) {
          const wait = deferred()
          pending.push({ ...wait, signal })
          return wait.promise
        }
        return { code: 0, data: {} }
      },
    } }
    const readerModule = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: api },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': {},
    })
    const componentStubs = Object.fromEntries(['Button.vue', 'CloseButton.vue', 'Dialog.vue', 'LiquidSegmentIndicator.vue', 'MomentCard/MomentCard.vue', 'MomentCard/MomentCardSkeleton.vue', 'MomentCard/MomentReportDialog.vue', 'IconButton.vue', 'LibraryWorkspace.vue'].map(name => [`~/components/${name}`, { default: { render: () => null } }]))
    const component = await compileComponent('../src/contentScripts/views/Moments/Moments.vue', {
      ...componentStubs,
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: noop }) },
      '~/components/MomentCard/momentForwardContent': { createMomentDisclosureCache: () => ({ clear: noop }), MOMENT_DISCLOSURES: Symbol('disclosures') },
      '~/components/MomentCard/momentForwardTransactions': { createMomentForwardTransactions: () => ({ dispose: noop, invalidate: noop }), MOMENT_FORWARD_TRANSACTIONS: Symbol('transactions') },
      '~/components/MomentCard/utils': { getMomentSkeletonVariant: () => 'text' },
      '~/composables/useAppProvider': { useBewlyApp: () => appState },
      '~/constants/layout': {},
      '~/logic': { settings: Vue.ref({}) },
      '~/logic/layoutEdit': { vLayoutEditable: {} },
      '~/logic/loginStatus': { parseDedeUserID: () => 1 },
      '~/logic/momentFilters': { momentFilterPolicy: filterPolicy },
      '~/logic/uploaderLatestVideoTimes': { recordUploaderLatestVideoTimes: noop },
      '~/stores/topBarStore': { useTopBarStore: () => ({ userInfo: { mid: 1 }, isLogin: true, ensureWatchLaterState: noop }) },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: api },
      '~/utils/dataFormatter': {},
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false, reportRuntimeFailure: (_message, error) => errors.push(error) },
      '~/utils/momentCommentSession': { createMomentCommentSessionCache: () => ({ clear: noop, setAccount: noop }), MOMENT_COMMENT_SESSIONS: Symbol('comments') },
      '~/utils/momentsLayout': {},
      '~/utils/momentUrl': {},
      '~/utils/scrollIntent': await import('../src/utils/scrollIntent'),
      '~/composables/useConfirmDialog': { useConfirmDialog: () => ({ confirm: async () => false }) },
      '~/composables/useSourcePanelMotion': { useSourcePanelMotion: () => ({}) },
      './momentPortal': { getSidebarAvatarUrl: () => '' },
      './MomentsContentLayout.vue': { default: { render: () => null } },
      './MomentsHotSearch.vue': { default: { render: () => null } },
      './MomentsReadingActions.vue': { default: { render: () => null } },
      './MomentsSidebar.vue': { default: { render: () => null } },
      '~/utils/viewportGeometry': await import('../src/utils/viewportGeometry'),
      './momentAdapter': { createMomentAdapter: () => ({ mapMoment: item => item, collectVideoPublicationTimes: () => [] }) },
      './momentFeedReader': readerModule,
      './useMomentActions': { useMomentActions: () => ({ reset: noop }) },
      './useMomentDetail': { useMomentDetail: () => ({ selectedMoment: Vue.ref(null), closeMomentDetail: noop }) },
      './useMomentLayout': { useMomentLayout: () => ({ reset: noop, append: noop, clearColumns: noop, suspendRebalance: noop, updateVirtualColumns: noop, updateGridColumnCount: noop }) },
      './useMomentPreviews': { useMomentPreviews: () => ({ clear: noop, reset: noop }) },
    }, { renderTemplate: false, globals: { requestAnimationFrame: (callback) => {
      queueMicrotask(callback)
      return 1
    } } })
    let state
    const root = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(component, { ref: (value) => {
      if (value)
        state = value.$.setupState
    } }) })
    let mounted = true
    app.mount(root)
    try {
      await flush()
      await flush()
      assert.deepEqual(errors, [])
      assert.equal(calls.length, 1)
      assert.equal(state.moments.length, 1)
      const firstCursor = state.offset
      fail = true
      await state.loadMoments()
      assert.equal(calls.length, 2)
      assert.equal(state.offset, firstCursor)
      assert.equal(state.moments.length, 1)
      assert.equal(state.feedRequestFailed, true)
      viewport.scrollTop = 3200
      for (let i = 0; i < 100; i++) {
        state.maybeLoadMoreNearBottom()
        assert.equal(appState.handleReachBottom.value(), false)
      }
      await flush()
      assert.equal(calls.length, 2, '100 repeated scroll/geometry callbacks cannot retry a failed page')
      viewport.scrollTop = 0
      fail = false
      await state.loadMoments(false, 0, true)
      assert.equal(calls.length, 3)
      assert.equal(calls[2].params.offset, firstCursor, 'manual retry consumes the unchanged cursor')
      assert.equal(state.moments.length, 2)
      assert.equal(state.feedRequestFailed, false)
      hidden = true
      viewport.scrollTop = 3200
      state.maybeLoadMoreNearBottom()
      assert.equal(appState.handleReachBottom.value(), false)
      await state.loadMoments()
      assert.equal(calls.length, 3, 'a hidden page cannot prefetch from stale geometry')
      hidden = false
      filterPolicy.value.active = true
      ended = true
      const beforeFilteredScroll = calls.length
      assert.equal(appState.handleReachBottom.value(), true, 'filters do not force manual pagination')
      await flush()
      await flush()
      assert.equal(calls.length, beforeFilteredScroll + 1)
      assert.equal(state.noMoreContent, true)
      assert.equal(appState.handleReachBottom.value(), false, 'server end cannot be read again')
      stall = true
      state.refresh()
      await flush()
      assert.equal(pending.length, 2)
      app.unmount()
      mounted = false
      assert.ok(pending.every(request => request.signal.aborted), 'both real feed and portal GET owners are cancelled')
      pending.forEach(request => request.resolve({ code: 0, data: { items: [data('late')], has_more: true, offset: 'late' } }))
      await flush()
      assert.equal(appState.handleReachBottom.value, undefined)
      console.log('PERF Moments fixture: 100 repeated callbacks after pagination failure = 0 requests; hidden automatic load = 0 requests; exit aborts 2 GETs')
    }
    finally {
      if (mounted)
        app.unmount()
      root.remove()
      if (originalHidden)
        Object.defineProperty(document, 'hidden', originalHidden)
      else
        delete document.hidden
    }
  })

  check('pagination ownership: the reader flags a repeated page as a stall while keeping the server has_more; clamps restore, user scrolls and explicit jumps win', async () => {
    const responses = [
      { code: 0, data: { items: [{ id_str: 'a' }], offset: 'same', has_more: true } },
      { code: 0, data: { items: [{ id_str: 'b' }], offset: 'same', has_more: true } },
      { code: 0, data: { items: [{ id_str: 'b' }], offset: 'same', has_more: true } },
      { code: 0, data: { items: [], offset: 'end', has_more: false } },
    ]
    const api = { moment: { getMoments: async () => responses.shift() } }
    const { createMomentFeedReader } = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: api },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': {},
    })
    const reader = createMomentFeedReader(item => item)
    const request = { reset: true, type: 'all', hostMid: '', offset: '', updateBaseline: '', page: 1, filtered: false }
    const first = await reader.read(request, () => true)
    assert.deepEqual([first.hasMore, first.stalled], [true, false])
    const fresh = await reader.read({ ...request, reset: false, offset: 'same' }, () => true)
    assert.deepEqual([fresh.hasMore, fresh.stalled], [true, false], 'unseen posts are progress even when the offset holds (series feeds)')
    const repeated = await reader.read({ ...request, reset: false, offset: 'same' }, () => true)
    assert.deepEqual([repeated.hasMore, repeated.stalled], [true, true], 'a repeated page is no progress')
    const ended = await reader.read({ ...request, reset: false, offset: 'same' }, () => true)
    assert.deepEqual([ended.hasMore, ended.stalled], [false, false])

    const scroll = await import('../src/utils/scrollIntent')
    const viewport = document.body.appendChild(document.createElement('div'))
    let scrollHeight = 5000
    Object.defineProperties(viewport, {
      clientHeight: { value: 800 },
      scrollHeight: { get: () => scrollHeight },
      scrollTop: { value: 1200, writable: true },
    })
    viewport.scrollTo = ({ top }) => {
      viewport.scrollTop = top
    }
    try {
      let claim = scroll.claimScrollPosition(viewport)
      assert.equal(scroll.canRestoreScrollPosition(viewport, claim), false, 'an unchanged position needs no write')
      // A temporarily shorter range clamps without a gesture; the committed layout holds it again.
      scrollHeight = 1600
      viewport.scrollTop = 800
      scrollHeight = 5200
      assert.equal(scroll.canRestoreScrollPosition(viewport, claim), true)
      viewport.dispatchEvent(new window.Event('wheel'))
      assert.equal(scroll.canRestoreScrollPosition(viewport, claim), false, 'continued user scrolling wins')
      claim = scroll.claimScrollPosition(viewport)
      viewport.scrollTop = 400
      scroll.scrollToPosition(viewport, 0)
      assert.equal(scroll.canRestoreScrollPosition(viewport, claim), false, 'an explicit jump or another restore wins')
      claim = scroll.claimScrollPosition(viewport)
      viewport.scrollTop = 0
      scrollHeight = 600
      assert.equal(scroll.canRestoreScrollPosition(viewport, { ...claim, top: 1200 }), false, 'an unreachable position is not forced')
    }
    finally {
      viewport.remove()
    }
  })

  check('moments uploader and series feeds: unseen posts advance; empty or repeated pages pause automation without claiming an end', async () => {
    const page = (ids, offset, more = true) => ({ code: 0, data: { items: ids.map(id => ({ id_str: id, type: 'DYNAMIC_TYPE_DRAW' })), offset, has_more: more } })
    const responses = [page(['a', 'b'], ''), page(['c'], ''), page(['c'], ''), page([], 'x')]
    const pages = []
    const api = {
      moment: { getMomentsByUp: async (params) => {
        pages.push(params.page)
        return responses.shift()
      } },
      user: { getRelations: async () => ({ code: 0 }) },
    }
    const { createMomentFeedReader } = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: api },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': { resolveMomentHostFollowState: () => 'followed' },
    })
    const reader = createMomentFeedReader(item => ({ id: item.id_str }))
    const request = { reset: true, type: 'all', hostMid: '7', offset: '', updateBaseline: '', page: 1, filtered: false }
    const first = await reader.read(request, () => true)
    assert.equal(first.stalled, false, 'an offset the server leaves empty is not a stall')
    const second = await reader.read({ ...request, reset: false, page: first.nextPage }, () => true)
    assert.equal(second.stalled, false, 'new posts on the next page number are progress')
    const repeated = await reader.read({ ...request, reset: false, page: second.nextPage }, () => true)
    assert.equal(repeated.stalled, true, 'a repeated page stops automation')
    const empty = await reader.read({ ...request, reset: false, page: repeated.nextPage }, () => true)
    assert.equal(empty.stalled, true, 'an empty page stops automation')
    assert.deepEqual(pages, [1, 2, 3, 4])

    // Series (pgc) feeds may also hold an empty offset between pages.
    const series = [page(['s1'], ''), page(['s2'], '')]
    const seriesTypes = []
    api.moment.getMoments = async (params) => {
      seriesTypes.push(params.type)
      return series.shift()
    }
    const seriesRequest = { ...request, type: 'pgc', hostMid: '' }
    const seriesFirst = await reader.read(seriesRequest, () => true)
    const seriesNext = await reader.read({ ...seriesRequest, reset: false }, () => true)
    assert.deepEqual([seriesFirst.stalled, seriesNext.stalled], [false, false], 'series keep auto-loading')
    assert.deepEqual(seriesTypes, ['pgc', 'pgc'])

    const moments = await readFile(new URL('../src/contentScripts/views/Moments/Moments.vue', import.meta.url), 'utf8')
    assert.match(moments, /const ended = !hasMore \|\| \(cutoff > 0 && \(normalizedItems\.at\(-1\)\?\.publishedAt \?\? cutoff\) < cutoff\)\n[\s\S]{0,1800}noMoreContent\.value = ended/, 'only a server end, or a page past the search time range, closes pagination')
    assert.match(moments, /feedRequestFailed\.value = response\.stalled/, 'a stalled page remains retryable')
    assert.match(moments, /function requiresManualMomentPaging\(\) \{\s*return feedRequestFailed\.value\s*\}/, 'only failures need a button')
    assert.match(moments, /<template v-else-if="noMoreContent && !feedRequestFailed">\s*\{\{ t\('moments\.no_more'\) \}\}/, 'the end is a centred hint')
    assert.match(moments, /<button\s+v-if="feedRequestFailed"\s+:disabled="isLoading"\s+@click="loadMoments\(true, 0, true, atLatest \? 'latest' : 'resume'\)"/, 'retry reads content without marking the head as read')
    assert.match(moments, /visibilitychange', \(\) => \{[\s\S]{0,450}maybeLoadMoreNearBottom\(\)/, 'returning to the tab resumes a short list')
    assert.match(moments, /updateVirtualColumns\(\)\s*\/\/ A restored list may not fill the viewport\.\s*maybeLoadMoreNearBottom\(\)/)
    assert.match(moments, /momentLayout\.remove\(id\)[\s\S]{0,120}void nextTick\(maybeLoadMoreNearBottom\)/)
  })

  check('moments text-and-image category: reads the full feed, scans like a filter and keeps only WORD and DRAW posts', async () => {
    const calls = []
    const page = (items, offset, more = true) => ({ code: 0, data: { items, offset, has_more: more } })
    const responses = [
      page([{ id: 'w', type: 'DYNAMIC_TYPE_WORD' }, { id: 'v', type: 'DYNAMIC_TYPE_AV' }, { id: 'f', type: 'DYNAMIC_TYPE_FORWARD' }], 'p2'),
      page([{ id: 'd', type: 'DYNAMIC_TYPE_DRAW' }, { id: 'a', type: 'DYNAMIC_TYPE_ARTICLE' }, { id: 'l', type: 'DYNAMIC_TYPE_LIVE_RCMD' }], 'p3'),
    ]
    const api = { moment: {
      getMoments: async (params) => {
        calls.push(params.type)
        return responses.shift()
      },
    } }
    const { createMomentFeedReader } = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: api },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': {},
      './momentFeedTypes': await loadSourceModule('../src/contentScripts/views/Moments/momentFeedTypes.ts'),
    })
    const reader = createMomentFeedReader(item => item)
    const result = await reader.read({ reset: true, type: 'draw', hostMid: '', offset: '', updateBaseline: '', page: 1, filtered: false }, () => true)
    assert.deepEqual(calls, ['all', 'all'], 'no server type exists, so it scans two full-feed pages')
    assert.equal(result.normalizedItems.map(item => item.id).join(), 'w,d')
    assert.equal(result.rawItems.length, 6, 'raw pages still feed uploader video times')
    assert.equal(result.nextOffset, 'p3')
    assert.equal(reader.getLoaded('draw', '').map(item => item.id).join(), 'w,d', 'its cache holds only kept posts')
    const sidebar = await readFile(new URL('../src/contentScripts/views/Moments/MomentsSidebar.vue', import.meta.url), 'utf8')
    assert.match(sidebar, /\['all', 'video', 'draw', 'pgc', 'article'\]/)
  })

  check('viewport geometry: one read per owner and round is shared by every subscriber; hidden pages defer and release stops work', async () => {
    const frames = new Map()
    let frameId = 0
    let hidden = false
    const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    const geometry = await loadSourceModule('../src/utils/viewportGeometry.ts', {}, {
      window: { innerHeight: 700, addEventListener() {}, removeEventListener() {} },
      requestAnimationFrame: (callback) => {
        frames.set(++frameId, callback)
        return frameId
      },
      cancelAnimationFrame: id => frames.delete(id),
      ResizeObserver: class { observe() {} disconnect() {} },
    })
    const runFrame = () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback())
    }
    const createViewport = () => {
      const element = document.body.appendChild(document.createElement('div'))
      let reads = 0
      Object.defineProperties(element, {
        clientHeight: { get: () => {
          reads++
          return 700
        } },
        scrollHeight: { value: 9000 },
        scrollTop: { value: 0, writable: true },
      })
      return { element, reads: () => reads }
    }
    const main = createViewport()
    const panel = createViewport()
    const seen = []
    const stops = [0, 1, 2].map(index => geometry.subscribeViewportFrame(main.element, (snapshot, reason) => seen.push([index, snapshot.scrollTop, reason])))
    const stopPanel = geometry.subscribeViewportFrame(panel.element, snapshot => seen.push(['panel', snapshot.scrollTop]))
    try {
      main.element.scrollTop = 300
      for (let event = 0; event < 5; event++)
        main.element.dispatchEvent(new window.Event('scroll'))
      runFrame()
      assert.deepEqual(seen, [[0, 300, 'scroll'], [1, 300, 'scroll'], [2, 300, 'scroll']])
      assert.equal(main.reads(), 1, 'five scroll events and three consumers share one measurement')
      assert.equal(panel.reads(), 0, 'another scroll owner is not measured for this one')
      seen.length = 0
      geometry.invalidateViewportGeometry(main.element)
      main.element.dispatchEvent(new window.Event('scroll'))
      runFrame()
      assert.ok(seen.every(([, , reason]) => reason === 'layout'), 'a commit in the same frame outranks the scroll')
      hidden = true
      seen.length = 0
      geometry.invalidateViewportGeometry(main.element)
      assert.equal(frames.size, 1)
      hidden = false
      runFrame()
      assert.equal(seen.length, 3)
      stops.forEach(stop => stop())
      stopPanel()
      main.element.dispatchEvent(new window.Event('scroll'))
      assert.equal(frames.size, 0, 'the last subscriber releases listeners and frames')
    }
    finally {
      main.element.remove()
      panel.element.remove()
      if (originalHidden)
        Object.defineProperty(document, 'hidden', originalHidden)
      else
        delete document.hidden
    }
  })

  check('moment reader: replacing or disposing a read aborts only its own GET transport and never commits the cancelled batch', async () => {
    const requests = []
    const module = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: { moment: { getMoments: (params, { signal }) => {
        const pending = deferred()
        requests.push({ ...pending, params, signal })
        return pending.promise
      } } } },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': {},
    })
    const reader = module.createMomentFeedReader(item => item)
    const query = { reset: true, type: 'all', group: 'all', hostMid: '', offset: '', page: 1, filtered: true }
    const old = reader.read(query, () => true)
    reader.reset()
    assert.equal(requests[0].signal.aborted, true)
    const current = reader.read({ ...query, type: 'video' }, () => true)
    requests[0].resolve({ code: 0, data: { items: [{ id: 'old' }], offset: 'next', has_more: true } })
    assert.equal(await old, undefined)
    assert.equal(requests.length, 2, 'an aborted multi-page scan never starts its second request')
    assert.equal(reader.getLoaded('all', ''), undefined)
    assert.equal(requests[1].signal.aborted, false, 'late old completion does not abort the replacement owner')
    requests[1].resolve({ code: 0, data: { items: [{ id: 'current' }], offset: '', has_more: false } })
    assert.equal((await current).normalizedItems[0].id, 'current')
    assert.equal(reader.getLoaded('video', '').length, 1)
    const abandoned = reader.read(query, () => true)
    reader.reset()
    assert.equal(requests[2].signal.aborted, true)
    requests[2].resolve({ code: 0, data: { items: [{ id: 'abandoned' }], has_more: false } })
    assert.equal(await abandoned, undefined)
    assert.equal(reader.getLoaded('all', ''), undefined)
  })

  check('A17/A19 actual forward patches share canonical rows while pending likes never alter confirmed data', async () => {
    const { createAccountLifetime } = await import('../src/utils/accountLifetime')
    const post = Vue.reactive({ id: 'one', forwardCount: 1, isLiked: false, likeCount: 0 })
    const row = Vue.ref([post])
    const list = Vue.ref([post])
    const readerModule = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: { moment: { getMoments: async () => ({ code: 0, data: { items: [{}], offset: 'one', has_more: false } }) } } },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': {},
    })
    const reader = readerModule.createMomentFeedReader(() => post)
    await reader.read({ reset: true, type: 'all', group: 'all', hostMid: '', offset: '', updateBaseline: '', page: 1, filtered: false }, () => true)
    const request = deferred()
    const actionModule = await loadSourceModule('../src/contentScripts/views/Moments/useMomentActions.ts', {
      vue: Vue,
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: () => {}, warning: () => {} }) },
      '~/components/MomentCard/utils': {},
      '~/stores/topBarStore': { useTopBarStore: () => ({}) },
      '~/utils/accountLifetime': { createAccountLifetime },
      '~/utils/api': { default: { moment: { setMomentLike: () => request.promise } } },
      '~/utils/main': { getCSRF: () => 'csrf' },
      '~/utils/messaging': {},
      '~/utils/watchLater': {},
    })
    const selected = Vue.ref(post)
    const handler = await loadSourceFunctions(MOMENTS_SOURCE_FILES, ['handleMomentForwardCountChange', 'applyMomentPatch', 'getMomentPositions', 'findMoment'], {
      indexedMoments: undefined,
      momentPositions: new Map(),
      normalizeForwardCount: (await import('../src/components/MomentCard/momentForwardContent')).normalizeForwardCount,
      forwardCountOverrides: new Map(),
      getCurrentAccountId: () => 1,
      moments: list,
      feedReader: reader,
      momentLayout: { updateMoment: moment => row.value = [moment] },
      selectedMoment: selected,
      details: { updateMoment: moment => selected.value = moment },
    })
    const scope = Vue.effectScope()
    const actions = scope.run(() => actionModule.useMomentActions(() => 1, handler.applyMomentPatch))
    const liking = actions.toggleMomentLike(post)
    assert.equal(actions.getDisplayMoment(list.value[0]).isLiked, true)
    assert.equal(reader.getLoaded('all', '')[0].isLiked, false)
    handler.handleMomentForwardCountChange('one', 5)
    assert.equal(list.value[0], row.value[0])
    assert.equal(row.value[0].forwardCount, 5)
    assert.equal(selected.value, list.value[0])
    assert.equal(reader.getLoaded('all', '')[0].forwardCount, 5)
    assert.equal(reader.getLoaded('all', '')[0].isLiked, false)
    assert.equal(actions.getDisplayMoment(list.value[0]).isLiked, true)
    request.resolve({ code: -1 })
    await liking
    assert.equal(actions.getDisplayMoment(row.value[0]).isLiked, false)
    assert.equal(list.value[0].likeCount, 0)
    scope.stop()
  })

  check('A10 real VideoCardGrid bounds components/slots, preserves focus and interaction state, and remeasures columns', async () => {
    const cardWindow = await import('../src/composables/useCardWindow')
    const tabState = await import('../src/composables/useHomeTabState')
    const cardTypes = await import('../src/components/VideoCard/types')
    const gridPolicy = await import('../src/utils/gridLayout')
    const coverPolicy = await import('../src/utils/videoCardLayout')
    const events = await import('../src/constants/globalEvents')
    const settings = Vue.ref({ autoSwitchListLayout: false, videoCardCoverRatioOneColumn: 40, videoCardCoverRatioTwoColumns: 50, showVideoCardAuthorName: true })
    const relationWindows = []
    const editing = Vue.ref(false)
    const mode = Vue.ref('adaptive')
    const pins = Vue.reactive(new Set())
    const gridLayout = await loadSourceModule('../src/composables/useGridLayout.ts', { vue: Vue, '~/logic': { settings } })
    const grid = await compileComponent('../src/components/VideoCardGrid.vue', {
      '~/composables/useUserRelations': { useUserRelations: () => ({ batchQueryUserRelations: async mids => relationWindows.push(mids) }) },
      '~/components/VideoCard/types': cardTypes,
      '~/composables/useCardWindow': cardWindow,
      '~/composables/useGridLayout': gridLayout,
      '~/composables/useHomeTabState': tabState,
      '~/constants/globalEvents': events,
      '~/logic': { settings, originalSettings: settings.value },
      '~/logic/layoutEdit': { isLayoutEditing: editing },
      '~/utils/gridLayout': gridPolicy,
      '~/utils/mitt': { default: { on: () => {}, off: () => {} } },
      '~/utils/videoCardLayout': coverPolicy,
      '~/utils/viewportGeometry': await import('../src/utils/viewportGeometry'),
      './SmoothLoading.vue': { default: { render: () => null } },
    })
    const root = document.body.appendChild(document.createElement('section'))
    root.style.overflowY = 'auto'
    Object.defineProperties(root, { clientWidth: { value: 1200 }, clientHeight: { value: 700 }, scrollHeight: { value: 450000 } })
    const previousRect = HTMLElement.prototype.getBoundingClientRect
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    HTMLElement.prototype.getBoundingClientRect = function () {
      let top = 0
      let height = 700
      if (this.classList.contains('video-card-grid-container'))
        top = -root.scrollTop
      if (this.classList.contains('video-card-slot')) {
        top = -root.scrollTop
        let column = 0
        const columns = mode.value === 'adaptive' ? 4 : 2
        for (const sibling of this.parentElement.children) {
          if (sibling === this)
            break
          if (sibling.classList.contains('video-card-spacer')) {
            top += Number.parseFloat(sibling.style.height) || 0
            column = 0
          }
          else if (sibling.classList.contains('video-card-slot') && ++column === columns) {
            top += 180
            column = 0
          }
        }
        height = 180
      }
      return { x: 0, y: top, top, bottom: top + height, left: 0, right: 1200, width: 1200, height, toJSON: () => ({}) }
    }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
    let mounted = 0
    const card = {
      props: ['video', 'persistentState'],
      setup(props, { expose }) {
        Vue.onMounted(() => mounted++)
        Vue.onBeforeUnmount(() => mounted--)
        expose({ canRecycle: Vue.computed(() => !pins.has(props.video.id)) })
        return () => Vue.h('div', { 'data-video-id': props.video.id }, [Vue.h('button', { onClick: () => props.persistentState.videoCurrentTime = 17 }, String(props.persistentState.videoCurrentTime))])
      },
    }
    const items = Array.from({ length: 5000 }, (_, id) => ({ id: id + 1, author: { mid: id + 10001 } }))
    const textOnlyStates = Vue.ref(false)
    const app = Vue.createApp({ setup: () => () => Vue.h(grid, { items, gridLayout: mode.value, noMoreContent: true, textOnlyStates: textOnlyStates.value, transformItem: item => item, getItemKey: item => item.id }) })
    app.component('VideoCard', card).component('Empty', {
      props: ['description'],
      setup: props => () => Vue.h('p', { 'data-grid-state': '' }, props.description),
    }).component('Button', { render: () => null })
    app.config.globalProperties.$t = key => key
    app.provide('BEWLY_APP', { scrollViewportRef: Vue.ref(root), isHomeTabSwitching: Vue.ref(false) })
    const settle = async () => {
      await new Promise(resolve => setTimeout(resolve, 60))
      await flush()
    }
    try {
      app.mount(root)
      await settle()
      assert.ok(mounted > 0 && mounted < 250)
      assert.equal(root.querySelector('[data-grid-state]').textContent, 'common.no_more_content')
      textOnlyStates.value = true
      await Vue.nextTick()
      assert.equal(root.querySelector('[data-grid-state]'), null, 'completed sidebar lists have no empty/end footer')
      assert.ok(relationWindows.some(mids => mids.includes(10001)), 'visible unknown relationships are read')
      assert.ok(relationWindows.every(mids => mids.length < 400), 'relation requests cover the loading window, not the entire list')
      const first = root.querySelector('[data-video-id="1"] button')
      first.click()
      first.focus()
      pins.add(2)
      root.scrollTop = 18000
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.ok(root.querySelector('[data-video-id="1"]'), 'focused card survives outside the window')
      assert.ok(root.querySelector('[data-video-id="2"]'), 'open interaction survives outside the window')
      assert.ok(mounted < 350)
      const outside = document.body.appendChild(document.createElement('button'))
      outside.focus()
      pins.clear()
      root.scrollTop++
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.equal(root.querySelector('[data-video-id="1"]'), null)
      root.scrollTop = 0
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.equal(root.querySelector('[data-video-id="1"] button').textContent, '17')
      mode.value = 'twoColumns'
      await settle()
      assert.ok(mounted > 0 && mounted < 350)
      assert.equal(root.querySelectorAll('.video-card-slot').length, mounted)
      // Relations only feed the followed badge beside author names.
      settings.value.showVideoCardAuthorName = false
      await settle()
      assert.equal(relationWindows.at(-1).length, 0, 'hidden relation controls release their query interest')
      outside.remove()
    }
    finally {
      app.unmount()
      assert.equal(mounted, 0)
      HTMLElement.prototype.getBoundingClientRect = previousRect
      if (width)
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', width)
      else
        delete HTMLElement.prototype.clientWidth
      root.remove()
    }
  })

  check('Home entry: explicit top reset wins over cached card anchor; ordinary tab restoration retains it', async () => {
    const { useCardWindow } = await import('../src/composables/useCardWindow')
    for (const resetPosition of [true, false]) {
      const root = document.body.appendChild(document.createElement('section'))
      const card = document.createElement('article')
      root.append(card)
      Object.defineProperties(root, { clientHeight: { value: 600 }, scrollHeight: { value: 10000 } })
      const rect = (top, height) => ({ x: 0, y: top, top, bottom: top + height, left: 0, right: 500, width: 500, height })
      root.getBoundingClientRect = () => rect(0, 600)
      card.getBoundingClientRect = () => rect(5000 - root.scrollTop, 100)
      const mount = root.appendChild(document.createElement('div'))
      let controller
      const app = Vue.createApp({
        setup() {
          controller = useCardWindow({
            root: Vue.ref(root),
            container: Vue.ref(root),
            keys: Vue.ref(Array.from({ length: 100 }, (_, key) => key)),
            columns: Vue.ref(1),
            gap: Vue.ref(0),
            estimatedHeight: Vue.ref(100),
            layout: Vue.ref('adaptive'),
            enabled: Vue.ref(true),
            canRelease: () => true,
            snapshot: { measurements: [], renderedKeys: [50], anchor: { key: 50, offset: 17 } },
            restoreScroll: () => {
              root.scrollTop = 0
              return resetPosition
            },
          })
          controller.setElement(50, card)
          return () => null
        },
      })
      try {
        app.mount(mount)
        await flush()
        assert.equal(root.scrollTop, resetPosition ? 0 : 4983)
        if (resetPosition)
          assert.equal(controller.ranges.value[0].start, 0, 'the first rows replace the old offscreen cached window')
      }
      finally {
        app.unmount()
        root.remove()
      }
    }
  })

  check('A09/A12 real height index matches exhaustive geometry beyond 1000 items and after measurement/layout changes', async () => {
    const { createMomentColumnIndex } = await import('../src/utils/momentColumnIndex')
    const columns = Array.from({ length: 3 }, (_, col) => Array.from({ length: 1500 }, (_, row) => ({ id: `${col}:${row}`, height: 100 + (row * 37 % 250) })))
    const index = createMomentColumnIndex(item => item.id, item => item.height, 16)
    index.sync(columns, 400)
    for (const start of [0, 99, 500, 10000, 150000, 320000]) {
      const result = index.window(start, start + 900)
      for (const [col, items] of columns.entries()) {
        let offset = 0
        const expected = []
        let before = 0
        let after = 0
        for (const item of items) {
          if (offset + item.height < start)
            before += item.height + 16
          else if (offset > start + 900)
            after += item.height + 16
          else
            expected.push(item.id)
          offset += item.height + 16
        }
        assert.deepEqual(result[col].items.map(item => item.id), expected)
        assert.equal(result[col].topPad, Math.max(0, before - 16))
        assert.equal(result[col].bottomPad, Math.max(0, after - 16))
      }
    }
    columns[0][0].height = 500
    index.updateHeight('0:0', 500)
    assert.equal(index.window(300, 400)[0].items[0].id, '0:0')
    columns[0].push({ id: 'extra', height: 400 })
    index.sync(columns, 400)
    index.sync([columns.flat()], 900)
    assert.equal(index.window(0, 600)[0].items[0].height, 500)
  })

  check('A09 regular feed retains all in-memory pages without retired persistent group caches', async () => {
    const { createMomentAdapter } = await import('../src/contentScripts/views/Moments/momentAdapter')
    const requests = []
    const raw = id => ({ id_str: String(id), type: 'DYNAMIC_TYPE_WORD', modules: { module_author: { mid: '1', pub_ts: 20000 - id }, module_dynamic: { desc: { text: `post ${id}` } } } })
    const api = { moment: { getMoments: async (request) => {
      requests.push(request.offset || '')
      const start = request.offset === '9223372036854775807' ? 0 : Number(request.offset || 0)
      return { code: 0, data: { items: Array.from({ length: 50 }, (_, i) => raw(start + i + 1)), offset: String(start + 50), has_more: start + 50 < 1350 } }
    } } }
    const readerModule = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: api },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': {},
    })
    const adapter = createMomentAdapter(key => key, (_id, count) => Number(count) || 0)
    const reader = readerModule.createMomentFeedReader(adapter.mapMoment)
    const query = { reset: true, type: 'all', hostMid: '', offset: '', updateBaseline: '', page: 1, filtered: false }
    for (let page = 0; page < 27; page++) {
      const result = await reader.read(query, () => true)
      query.offset = result.nextOffset
      query.reset = false
    }
    assert.equal(reader.getLoaded('all', '').length, 1350)
    const delayed = deferred()
    api.moment.getMoments = () => delayed.promise
    let current = true
    const stale = reader.read(query, () => current)
    current = false
    delayed.resolve({ code: 0, data: { items: [raw(2000)], has_more: false } })
    assert.equal(await stale, undefined)
    assert.equal(reader.getLoaded('all', '').length, 1350)
    reader.reset()
    assert.equal(reader.getLoaded('all', ''), undefined)
  })

  check('A11 actual tab cache transfers data without cloning and clears old account generations', async () => {
    const { createHomeTabCache } = await import('../src/composables/useHomeTabState')
    const cache = createHomeTabCache()
    const snapshot = { items: Array.from({ length: 2000 }, (_, id) => ({ id })), selection: 5 }
    cache.save('tab', snapshot, cache.generation)
    assert.equal(cache.take('tab'), snapshot)
    assert.equal(cache.take('tab'), undefined)
    const generation = cache.generation
    cache.clear()
    cache.save('old', snapshot, generation)
    assert.equal(cache.take('old'), undefined)
  })

  check('A18 actual image queue limits concurrent work and frees cancelled slots', async () => {
    const queue = await import('../src/utils/imageLoadQueue')
    const running = new Set()
    const tasks = []
    const handles = []
    for (let i = 0; i < 30; i++) {
      const task = deferred()
      tasks.push(task)
      handles.push(queue.enqueueImageLoad({
        start: async () => {
          running.add(i)
          assert.ok(running.size <= queue.IMAGE_LOAD_QUEUE_LIMIT)
          await task.promise
          running.delete(i)
        },
        onCancel: () => {
          running.delete(i)
          task.resolve()
        },
      }))
    }
    await flush()
    assert.equal(running.size, queue.IMAGE_LOAD_QUEUE_LIMIT)
    handles[0].cancel()
    await flush()
    assert.equal(running.size, queue.IMAGE_LOAD_QUEUE_LIMIT)
    handles.forEach(handle => handle.cancel())
    await flush()
    assert.equal(running.size, 0)
    assert.equal(handles.some(handle => handle.isActive() || handle.isQueued()), false)
  })

  check('A18 actual media owners destroy both transports, abort listeners and detach media sources', async () => {
    const { createPreviewMediaSession } = await import('../src/utils/previewMediaSession')
    const resources = await import('../src/utils/mediaResources')
    const session = createPreviewMediaSession()
    const calls = []
    session.hls = { destroy: () => calls.push('hls') }
    session.flv = { pause: () => calls.push('pause'), unload: () => calls.push('unload'), detachMediaElement: () => calls.push('detach'), destroy: () => calls.push('flv') }
    const signal = session.signal
    session.clear()
    session.clear()
    assert.equal(signal.aborted, true)
    assert.equal(session.signal.aborted, false)
    assert.deepEqual(calls, ['hls', 'pause', 'unload', 'detach', 'flv'])
    const video = document.createElement('video')
    const source = document.createElement('source')
    video.append(source)
    video.pause = () => calls.push('media-pause')
    video.load = () => calls.push('media-load')
    video.src = 'https://example.com/fixture.mp4'
    source.src = 'https://example.com/fixture.mp4'
    video.srcObject = { fixture: true }
    resources.releaseMediaElement(video)
    assert.equal(video.srcObject, null)
    assert.equal(video.hasAttribute('src'), false)
    assert.equal(source.hasAttribute('src'), false)
    assert.deepEqual(calls.slice(-2), ['media-pause', 'media-load'])
    session.clear()
  })
}
