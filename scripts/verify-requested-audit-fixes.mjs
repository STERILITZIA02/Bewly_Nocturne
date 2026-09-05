import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

export function registerRequestedAuditFixChecks(check, { Vue, compileComponent, flush }) {
  const buttonStub = {
    props: ['type', 'label', 'size'],
    emits: ['click'],
    setup: (props, { emit, slots }) => () => Vue.h('button', {
      'type': 'button',
      'aria-label': props.label,
      'onClick': event => emit('click', event),
    }, slots.default?.()),
  }

  check('audit 01: confirm keyboard follows the focused button, traps Tab, and ignores IME', async () => {
    const focus = await import('../src/utils/dialogFocus')
    const { useConfirmDialogHost } = await import('../src/composables/useConfirmDialogHost')
    const ConfirmDialog = await compileComponent('../src/components/ConfirmDialog.vue', {
      '~/components/Button.vue': { default: buttonStub },
      '~/components/CloseButton.vue': { default: buttonStub },
      '~/utils/dialogFocus': focus,
    })
    const host = document.body.appendChild(document.createElement('div'))
    const shadow = host.attachShadow({ mode: 'open' })
    const origin = shadow.appendChild(document.createElement('button'))
    origin.textContent = 'origin'
    const mount = shadow.appendChild(document.createElement('div'))
    let controller
    const app = Vue.createApp({ setup() {
      controller = useConfirmDialogHost()
      return () => controller.activeRequest.value
        ? Vue.h(ConfirmDialog, { message: controller.activeRequest.value.message, onFinish: controller.finish })
        : null
    } })
    app.config.globalProperties.$t = key => key
    app.mount(mount)
    origin.focus()
    const result = controller.confirm('fixture')
    await flush()
    const cancel = shadow.querySelector('[data-confirm-cancel]')
    assert.equal(shadow.activeElement, cancel)
    const buttons = [...shadow.querySelectorAll('.bew-confirm-dialog button')]
    cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true }))
    assert.equal(shadow.activeElement, buttons[2])
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true }))
    assert.equal(shadow.activeElement, buttons[0])
    const composing = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true, composed: true })
    cancel.dispatchEvent(composing)
    assert.equal(composing.defaultPrevented, true)
    assert.ok(controller.activeRequest.value)
    cancel.focus()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true })
    cancel.dispatchEvent(enter)
    assert.equal(enter.defaultPrevented, false)
    // JSDOM does not synthesize a browser's default button activation.
    cancel.click()
    assert.equal(await result, false)
    assert.equal(shadow.querySelector('.bew-confirm-dialog'), null, 'the overlay is removed before the promise settles')
    assert.equal(shadow.activeElement, origin)
    const escaped = controller.confirm('escape')
    await flush()
    shadow.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }))
    assert.equal(await escaped, false)
    const confirmed = controller.confirm('confirm')
    await flush()
    shadow.querySelectorAll('.bew-confirm-dialog button')[2].click()
    assert.equal(await confirmed, true)
    app.unmount()
    host.remove()
  })

  check('audit 01: confirmation ownership cancels queued, closing, deactivated and disposed requests', async () => {
    const { useConfirmDialogHost } = await import('../src/composables/useConfirmDialogHost')
    const scope = Vue.effectScope()
    const host = scope.run(useConfirmDialogHost)
    const owner = new AbortController()
    const first = host.confirm('first')
    const queued = host.confirm('queued', owner.signal)
    owner.abort()
    assert.equal(await queued, false)
    host.finish(true)
    host.cancelAll()
    assert.equal(await first, false, 'navigation during nextTick cannot approve a stale request')
    const pending = host.confirm('pending')
    scope.stop()
    assert.equal(await pending, false)
    assert.equal(await host.confirm('disposed'), false)
    let deactivate
    let activate
    const context = await loadSourceFunctions('../src/composables/useConfirmDialog.ts', ['useConfirmDialog'], {
      confirmDialogKey: Symbol('fixture'),
      inject: () => ({ confirm: async (_message, signal) => !signal.aborted }),
      onScopeDispose: () => {},
      onDeactivated: callback => deactivate = callback,
      onActivated: callback => activate = callback,
      AbortController,
    })
    const service = context.useConfirmDialog()
    assert.equal(await service.confirm('active'), true)
    deactivate()
    assert.equal(await service.confirm('hidden'), false)
    activate()
    assert.equal(await service.confirm('restored'), true)
  })

  check('audit 08: ContextMenu supports arrows, native activation, Escape and trigger focus restoration', async () => {
    const previousObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class { observe() {} disconnect() {} }
    const focus = await import('../src/utils/dialogFocus')
    const floating = await import('../src/utils/floatingMenu')
    const host = document.body.appendChild(document.createElement('div'))
    const origin = host.appendChild(document.createElement('button'))
    origin.setAttribute('aria-label', 'menu trigger')
    const mount = host.appendChild(document.createElement('div'))
    const Menu = await compileComponent('../src/components/ContextMenu.vue', {
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/utils/dialogFocus': focus,
      '~/utils/floatingMenu': floating,
    })
    const visible = Vue.ref(true)
    const selections = []
    const app = Vue.createApp({ setup: () => () => visible.value
      ? Vue.h(Menu, {
          trigger: origin,
          anchor: { x: 100, y: 100 },
          options: [{ value: 'edit', label: 'Edit', icon: '' }, { value: 'delete', label: 'Delete', icon: '', danger: true }],
          onSelect: value => selections.push(value),
          onClose: () => visible.value = false,
        })
      : null })
    app.mount(mount)
    await flush()
    const items = [...host.querySelectorAll('[role="menuitem"]')]
    assert.equal(document.activeElement, items[0])
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    assert.equal(document.activeElement, items[1])
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
    assert.equal(document.activeElement, items[0])
    items[0].click()
    await flush()
    assert.deepEqual(selections, ['edit'])
    assert.equal(document.activeElement, origin)
    visible.value = true
    await flush()
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flush()
    assert.equal(host.querySelector('[role="menu"]'), null)
    assert.equal(document.activeElement, origin)
    app.unmount()
    host.remove()
    globalThis.ResizeObserver = previousObserver
  })

  check('audit 12: image errors settle, try the original URL once, and reject stale image events', async () => {
    const Picture = await compileComponent('../src/components/LazyPicture.vue')
    const src = Vue.ref('https://i0.hdslb.com/bfs/archive/fixture-a.jpg')
    const host = document.body.appendChild(document.createElement('div'))
    let loads = 0
    const app = Vue.createApp({ setup: () => () => Vue.h(Picture, { src: src.value, loading: 'eager', onLoaded: () => loads++ }) })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    const preferred = host.querySelector('img')
    preferred.dispatchEvent(new Event('error'))
    await flush()
    assert.equal(host.querySelectorAll('source').length, 0)
    const original = host.querySelector('img')
    assert.notEqual(original, preferred)
    assert.equal(original.getAttribute('src'), src.value)
    original.dispatchEvent(new Event('error'))
    await flush()
    assert.ok(host.querySelector('.lazy-picture-error'))
    assert.equal(host.querySelector('.lazy-picture-skeleton'), null)
    assert.equal(host.querySelector('img'), null)
    src.value = 'https://i0.hdslb.com/bfs/archive/fixture-b.jpg'
    await flush()
    original.dispatchEvent(new Event('load'))
    assert.equal(loads, 0)
    assert.equal(host.querySelector('.lazy-picture-error'), null)
    host.querySelector('img').dispatchEvent(new Event('load'))
    await flush()
    assert.equal(loads, 1)
    assert.equal(host.querySelector('.lazy-picture-skeleton'), null)
    app.unmount()
    host.remove()
  })

  check('audit 13: anime watchlist failure and retry are separate from a valid empty response', async () => {
    const calls = []
    const context = await loadSourceFunctions('../src/contentScripts/views/Anime/Anime.vue', [
      'getAnimeWatchList',
      'getAnimeAccountId',
      'isAnimeRequestCurrent',
    ], {
      topBarStore: { userInfo: { mid: 1 } },
      getUserID: () => '1',
      animeMounted: true,
      requestGeneration: 1,
      isLoadingAnimeWatchList: Vue.ref(false),
      watchListRequestFailed: Vue.ref(false),
      animeWatchList: [],
      api: { anime: { getAnimeWatchList: () => {
        const request = deferred()
        calls.push(request)
        return request.promise
      } } },
    })
    const failed = context.getAnimeWatchList()
    calls[0].resolve({ code: -500 })
    await failed
    assert.equal(context.watchListRequestFailed.value, true)
    assert.equal(context.isLoadingAnimeWatchList.value, false)
    const retry = context.getAnimeWatchList()
    calls[1].resolve({ code: 0, data: { list: [] } })
    await retry
    assert.equal(context.watchListRequestFailed.value, false)
    const stale = context.getAnimeWatchList()
    context.requestGeneration++
    context.watchListRequestFailed.value = false
    context.isLoadingAnimeWatchList.value = false
    calls[2].resolve({ code: -500 })
    await stale
    assert.equal(context.watchListRequestFailed.value, false)
  })

  async function searchFixture(kind, paginationMode = 'pagination') {
    const requests = []
    const errors = []
    const relations = []
    const emitted = []
    const settings = Vue.ref({ depersonalizeSearchResults: false, searchResultsPaginationMode: paginationMode })
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    const scope = Vue.effectScope()
    const messaging = await loadSourceFunctions('../src/utils/messaging.ts', ['isExtensionContextInvalidatedError'], {})
    const core = await loadSourceFunctions('../src/contentScripts/views/SearchResults/composables/useSearchRequest.ts', ['useSearchRequest'], {
      ...Vue,
      isExtensionContextInvalidatedError: messaging.isExtensionContextInvalidatedError,
      console: { error: (...args) => errors.push(args) },
      useI18n: () => ({ t: key => key }),
      useTopBarStore: () => account,
      settings,
      resolveAuthenticatedAccountId: (loggedIn, mid) => loggedIn && mid > 0 ? mid : null,
      requestSearch: (request) => {
        const pending = deferred()
        requests.push({ ...pending, request })
        return pending.promise
      },
    })
    const controller = scope.run(() => core.useSearchRequest(kind))
    const { usePagination } = await import('../src/contentScripts/views/SearchResults/composables/usePagination')
    const { dedupeByKey } = await import('../src/contentScripts/views/SearchResults/utils/searchHelpers')
    const pagination = usePagination()
    const exhausted = Vue.ref(false)
    const hasMore = Vue.ref(true)
    const props = { keyword: 'old', filters: kind === 'user' ? { order: '', userType: 0 } : { subCategory: 'all', roomOrder: '', userOrder: '' } }
    const context = await loadSourceFunctions(`../src/contentScripts/views/SearchResults/pages/${kind === 'user' ? 'User' : kind === 'all' ? 'All' : 'Live'}SearchPage.vue`, kind === 'user'
      ? ['userOrderMap', 'runUserSearch', 'handlePageChange']
      : kind === 'all'
        ? ['runAllSearch', 'getCurrentResultLength', 'handlePageChange']
        : ['getIncomingLiveResults', 'runLiveSearch', 'refreshLiveRoomsOnly', 'getCurrentResultLength', 'handlePageChange'], {
      props,
      ...controller,
      ...pagination,
      paginationHasMore: pagination.hasMore,
      paginationMode: Vue.computed(() => settings.value.searchResultsPaginationMode),
      exhausted,
      hasMore,
      setExhausted: value => exhausted.value = value,
      setHasMore: value => hasMore.value = value,
      resetPagination: pagination.reset,
      resetLoadMore: () => {
        exhausted.value = false
        hasMore.value = true
      },
      liveRoomList: Vue.computed(() => controller.results.value?.result?.live_room ?? []),
      liveUserList: Vue.computed(() => controller.results.value?.result?.live_user ?? []),
      liveRoomTotalResults: Vue.ref(0),
      liveUserTotalResults: Vue.ref(0),
      batchQueryUserRelations: () => {
        const pending = deferred()
        relations.push(pending)
        return pending.promise
      },
      handleBackToTop: () => {},
      emit: (...args) => emitted.push(args),
      dedupeByKey,
    })
    return { context, requests, errors, relations, controller, account, scope, props, pagination, emitted, settings, exhausted, hasMore }
  }

  check('search: extension invalidation terminates stale and current requests without reporting a search error', async () => {
    const { controller, requests, errors, scope } = await searchFixture('all')
    const request = { category: 'all', keyword: 'fixture', page: 1 }
    let processed = 0
    const process = () => {
      processed++
      return true
    }
    const old = controller.search(request, process)
    const current = controller.search(request, process)
    requests[0].reject(new Error('Extension context invalidated.'))
    assert.equal(await old, false)
    assert.equal(controller.isLoading.value, false)
    assert.equal(controller.error.value, '')
    assert.equal(errors.length, 0)
    requests[1].resolve({ code: 0 })
    assert.equal(await current, false)
    assert.equal(processed, 0)
    controller.reset()
    assert.equal(await controller.search(request, process), false)
    assert.equal(requests.length, 2, 'reset cannot revive a stale extension world')
    scope.stop()
  })

  check('search: ordinary failures remain visible and can be retried', async () => {
    const { controller, requests, errors, scope } = await searchFixture('all')
    const request = { category: 'all', keyword: 'fixture', page: 1 }
    const failed = controller.search(request, () => true)
    requests[0].reject(new Error('Network unavailable'))
    assert.equal(await failed, false)
    assert.equal(controller.error.value, 'search.errors.exception')
    assert.equal(errors.length, 1)
    const retried = controller.search(request, () => true)
    requests[1].resolve({ code: 0 })
    assert.equal(await retried, true)
    assert.equal(controller.error.value, '')
    scope.stop()
  })

  for (const kind of ['user', 'live', 'all']) {
    check(`audit 05: ${kind} query owns enrichment, pagination, URL and loading until completion`, async () => {
      const fixture = await searchFixture(kind)
      const { context, requests, relations, controller, props, emitted, scope } = fixture
      const data = name => kind === 'user'
        ? { result: [{ mid: name }], numResults: 300, pagesize: 30 }
        : kind === 'all'
          ? { result: [{ result_type: 'video', data: [{ id: name }] }, { result_type: 'bili_user', data: [{ mid: name }] }], numResults: 300, pagesize: 30 }
          : { result: { live_room: [{ roomid: name }], live_user: [{ mid: name }] }, pageinfo: { live_room: { total: 300 }, live_user: { total: 1 } } }
      const old = context.handlePageChange(2)
      requests[0].resolve({ code: 0, data: data('old') })
      await flush()
      assert.equal(controller.isLoading.value, true)
      props.keyword = 'new'
      controller.reset()
      const current = context.handlePageChange(3)
      requests[1].resolve({ code: 0, data: data('new') })
      await flush()
      relations[0].resolve()
      assert.equal(await old, false)
      assert.equal(controller.isLoading.value, true)
      assert.equal(emitted.length, 0)
      relations[1].resolve()
      assert.equal(await current, true)
      assert.equal(context.currentPage.value, 3)
      assert.equal(kind === 'user' ? controller.results.value[0].mid : kind === 'all' ? controller.results.value.result[0].data[0].id : controller.results.value.result.live_room[0].roomid, 'new')
      assert.deepEqual(emitted, [['updatePage', 3]])
      const stale = context.handlePageChange(4)
      requests[2].resolve({ code: 0, data: data('account-old') })
      await flush()
      fixture.account.userInfo.mid = 2
      relations[2].resolve()
      assert.equal(await stale, false)
      assert.equal(context.currentPage.value, 3)
      scope.stop()
    })
  }

  check('refactor: list search keeps filtered counts, deduplication, pagination and account ownership', async () => {
    const fixture = await searchFixture('user')
    const { usePagination } = await import('../src/contentScripts/views/SearchResults/composables/usePagination')
    const { dedupeByKey } = await import('../src/contentScripts/views/SearchResults/utils/searchHelpers')
    const query = Vue.ref('list')
    const module = await loadSourceFunctions('../src/contentScripts/views/SearchResults/composables/useSearchListPage.ts', ['useSearchListPage'], {
      ...Vue,
      onMounted: () => {},
      useBewlyApp: () => ({ haveScrollbar: async () => true, handleBackToTop: () => {} }),
      useSearchRequest: () => fixture.controller,
      usePagination,
      useLoadMore: () => ({
        hasMore: fixture.hasMore,
        exhausted: fixture.exhausted,
        setHasMore: fixture.context.setHasMore,
        setExhausted: fixture.context.setExhausted,
        reset: fixture.context.resetLoadMore,
        handleLoadMoreCompletion: async () => {},
      }),
      settings: fixture.settings,
      dedupeByKey,
    })
    const list = fixture.scope.run(() => module.useSearchListPage({
      category: 'video',
      keyword: () => query.value,
      initialPage: () => undefined,
      buildRequest: ({ keyword, page }) => ({ searchType: 'video', keyword, page, pageSize: 30 }),
      itemKey: item => String(item.id),
      transformItems: items => items.filter(item => !item.ad),
      onPageChange: page => fixture.emitted.push(page),
    }))
    const initial = list.handlePageChange(1)
    fixture.requests[0].resolve({ code: 0, data: { result: [{ id: 1 }, { id: 2, ad: true }] } })
    assert.equal(await initial, true)
    assert.equal(list.totalResults.value, 1)
    assert.deepEqual(list.results.value.map(item => item.id), [1])
    fixture.settings.value.searchResultsPaginationMode = 'scroll'
    const next = list.performSearch(true)
    fixture.requests[1].resolve({ code: 0, data: { result: [{ id: 1 }, { id: 3 }], numResults: 120, pagesize: 30 } })
    assert.equal(await next, true)
    assert.deepEqual(list.results.value.map(item => item.id), [1, 3])
    assert.equal(list.currentPage.value, 2)
    const old = list.performSearch(false)
    query.value = 'current'
    await flush()
    fixture.requests[3].resolve({ code: 0, data: { result: [{ id: 4 }] } })
    await flush()
    fixture.requests[2].resolve({ code: 0, data: { result: [{ id: 99 }] } })
    assert.equal(await old, false)
    assert.deepEqual(list.results.value.map(item => item.id), [4])
    fixture.account.userInfo.mid = 2
    await flush()
    assert.equal(list.results.value.length, 0)
    assert.equal(list.isLoading.value, true)
    fixture.requests[4].resolve({ code: 0, data: { result: [{ id: 5 }] } })
    await flush()
    assert.deepEqual(list.results.value.map(item => item.id), [5])
    fixture.scope.stop()
  })

  check('audit 06/07: live sorting resets pagination; flat and nested single-category pages do not end early', async () => {
    const fixture = await searchFixture('live', 'scroll')
    const { context, controller, requests, relations, props, exhausted, scope } = fixture
    controller.results.value = { result: { live_room: [{ roomid: 'old' }], live_user: [{ mid: 'kept' }] } }
    context.currentPage.value = 5
    exhausted.value = true
    const sorting = context.refreshLiveRoomsOnly()
    assert.equal(exhausted.value, false)
    assert.equal(requests[0].request.page, 1)
    requests[0].resolve({ code: 0, data: { result: { live_room: [{ roomid: 'new' }], live_user: [{ mid: 'replace' }] }, pageinfo: { live_room: { total: 90 } } } })
    assert.equal(await sorting, true)
    assert.equal(context.currentPage.value, 1)
    assert.equal(controller.results.value.result.live_user[0].mid, 'kept')
    assert.equal(context.getNextPage(true), 2)
    for (const category of ['live_room', 'live_user']) {
      props.filters.subCategory = category
      for (const nested of [false, true]) {
        const list = category === 'live_room' ? [{ roomid: 10 }] : [{ mid: 20 }]
        const loading = context.runLiveSearch(1, false)
        requests.at(-1).resolve({ code: 0, data: { result: nested ? { [category]: list } : list, numResults: 90, pagesize: 30 } })
        await flush()
        if (category === 'live_user')
          relations.at(-1).resolve()
        assert.equal(await loading, true)
        assert.equal(exhausted.value, false)
      }
    }
    scope.stop()
  })

  check('audit 14: follow commits its submitted target and stale relation reads cannot overwrite it', async () => {
    const request = deferred()
    const events = []
    const errors = []
    const context = await loadSourceFunctions('../src/components/UserCard/UserCard.vue', ['handleFollowClick'], {
      props: { mid: 10, isFollowed: 0 },
      isFollowing: Vue.ref(false),
      isFollowLoading: Vue.ref(false),
      followGeneration: 0,
      currentAccountId: Vue.ref(1),
      topBarStore: { isLogin: true },
      getCSRF: () => 'fixture',
      api: { user: { relationModify: () => request.promise } },
      emit: (...args) => events.push(args),
      toast: { warning: error => errors.push(error), error: error => errors.push(error) },
      t: key => key,
      isExtensionContextInvalidatedError: () => false,
    })
    const pending = context.handleFollowClick({ preventDefault() {}, stopPropagation() {} })
    context.isFollowing.value = true
    request.resolve({ code: 0 })
    await pending
    assert.equal(context.isFollowing.value, true)
    assert.deepEqual(events, [['followStateChanged', 10, true]])
    const relationRequest = deferred()
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    const relations = await loadSourceFunctions('../src/contentScripts/views/SearchResults/composables/useUserRelations.ts', ['useUserRelations'], {
      ...Vue,
      useTopBarStore: () => account,
      resolveAuthenticatedAccountId: (loggedIn, mid) => loggedIn && mid > 0 ? mid : null,
      api: { user: { getRelations: () => relationRequest.promise } },
    })
    const scope = Vue.effectScope()
    const controller = scope.run(relations.useUserRelations)
    const reading = controller.batchQueryUserRelations([10])
    controller.updateUserRelation(10, true)
    relationRequest.resolve({ code: 0, data: { 10: { attribute: 0 } } })
    await reading
    assert.equal(controller.userRelations.value[10].isFollowing, true)
    account.userInfo.mid = 2
    assert.equal(Object.keys(controller.userRelations.value).length, 0)
    scope.stop()
  })

  check('audit 11: MAIN metadata bridge transfers strings, validates the current manuscript and cleans up', async () => {
    const bridge = await import('../src/utils/videoMetadataBridge')
    const { setPageBridgeChannelId } = await import('../src/utils/pageBridgeChannel')
    setPageBridgeChannelId('audit-fixture')
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
    Object.defineProperty(globalThis, 'location', { configurable: true, value: window.location })
    const oldUrl = window.location.href
    window.history.replaceState({}, '', '/video/BV1ab411c7mD/')
    const element = document.body.appendChild(document.createElement('div'))
    element.id = 'app'
    const watchers = new Set()
    element.__vue__ = {
      videoData: { aid: 123, bvid: 'BV1ab411c7mD', pages: [{}, {}], videos: 2 },
      isSection: true,
      $watch: (_getter, callback) => {
        watchers.add(callback)
        return () => watchers.delete(callback)
      },
    }
    const main = await loadSourceFunctions('../src/inject/videoMetadata.ts', ['setupVideoMetadataBridge'], {
      ...bridge,
      window,
      document,
      location: window.location,
      AbortController: window.AbortController,
      CustomEvent: window.CustomEvent,
      queueMicrotask,
    })
    const stop = main.setupVideoMetadataBridge('audit-fixture')
    const changes = []
    const recordChange = event => changes.push(bridge.parseVideoMetadataEvent(event))
    window.addEventListener(bridge.VIDEO_METADATA_CHANGED, recordChange)
    try {
      assert.deepEqual(bridge.readVideoPageMetadata(), { aid: 123, bvid: 'BV1ab411c7mD', pageCount: 2, isCollection: true })
      assert.equal(watchers.size, 1)
      assert.equal(changes.length, 1)
      window.history.replaceState({}, '', '/video/BV1ab411c7mD/?tracking=fixture#same-video')
      assert.equal(bridge.readVideoPageMetadata().pageCount, 2)
      assert.equal(changes.length, 1, 'URL cleanup does not reapply autoplay for unchanged manuscript metadata')
      window.history.replaceState({}, '', '/video/BV1xx411c7mD/')
      assert.equal(bridge.readVideoPageMetadata(), null, 'previous manuscript metadata is rejected immediately')
      element.__vue__.videoData = { aid: 456, bvid: 'BV1xx411c7mD', pages: [{}], videos: 1 }
      element.__vue__.isSection = false
      for (const callback of watchers)
        callback()
      await flush()
      assert.equal(bridge.readVideoPageMetadata().pageCount, 1)
      assert.equal(bridge.readVideoPageMetadata().isCollection, false)
      element.__vue__.videoData.ugc_season = { id: 789 }
      assert.equal(bridge.readVideoPageMetadata().isCollection, true, 'manuscript collection metadata survives a pending native section flag')
      assert.equal(bridge.validateVideoPageMetadata({ aid: 456, bvid: 'BV1xx411c7mD', pageCount: Infinity, isCollection: false }, location.href), null)
      stop()
      assert.equal(watchers.size, 0)
      assert.equal(bridge.readVideoPageMetadata(), null)
    }
    finally {
      stop()
      window.removeEventListener(bridge.VIDEO_METADATA_CHANGED, recordChange)
      element.remove()
      window.history.replaceState({}, '', oldUrl)
      if (originalLocation)
        Object.defineProperty(globalThis, 'location', originalLocation)
      else
        delete globalThis.location
    }
  })

  check('audit 25: UnoCSS emits semantic size and line-height pairs without changing spacing conversion', async () => {
    const { createGenerator } = await import('unocss')
    const { default: config } = await import('../unocss.config')
    const generator = await createGenerator(config)
    const { css } = await generator.generate('text-xs text-sm text-base text-lg p-4 font-semibold')
    for (const role of ['caption', 'control', 'body', 'heading']) {
      assert.ok(css.includes(`font-size:var(--bew-font-size-${role})`))
      assert.ok(css.includes(`line-height:var(--bew-line-height-${role})`))
    }
    assert.match(css, /padding:calc\(var\(--bew-base-font-size\) \* 1\)/)
    assert.ok(css.includes('font-weight:var(--bew-font-weight-semibold)'))
  })
}
