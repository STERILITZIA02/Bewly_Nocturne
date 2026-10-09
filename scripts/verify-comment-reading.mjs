import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

export function registerCommentReadingChecks(check, { flush }) {
  check('comment reading: native children stay owned, edge keyboard scroll escapes and container geometry follows content without scroll measurement', async () => {
    const scroll = await import('../src/utils/scrollIntent')
    const anchor = await loadSourceModule('../src/utils/commentReadingAnchor.ts', { './abort': await import('../src/utils/abort'), './scrollIntent': scroll })
    const reading = await loadSourceModule('../src/inject/commentReplyReading.ts', { '~/utils/commentReadingAnchor': anchor, '~/utils/scrollIntent': scroll }, { DOMRect: window.DOMRect })
    const outer = document.body.appendChild(document.createElement('div'))
    outer.style.overflowY = 'auto'
    Object.defineProperties(outer, { clientHeight: { value: 600 }, scrollHeight: { value: 1800 } })
    outer.scrollTo = ({ top }) => outer.scrollTop = top
    const renderer = outer.appendChild(document.createElement('section'))
    const root = renderer.attachShadow({ mode: 'open' })
    root.innerHTML = '<div id="expander-contents"><article>Reply</article><svg id="guides"></svg></div><div id="expander-footer"><button>Collapse</button></div>'
    const contents = root.getElementById('expander-contents')
    const reply = contents.firstElementChild
    let reads = 0
    contents.getBoundingClientRect = () => new window.DOMRect(10, 20, 400, 200)
    reply.getBoundingClientRect = () => {
      reads++
      return new window.DOMRect(10, 20 - contents.scrollTop, 400, 600)
    }
    Object.defineProperties(contents, { clientHeight: { value: 200 }, clientWidth: { value: 400 }, scrollHeight: { value: 600 } })
    contents.scrollTo = ({ top }) => contents.scrollTop = top
    const collapsed = new Set(['thread-root', 'child'])
    const tails = new Set(['tail:thread-root:after:123', 'tail:child:after:124'])
    const options = { enabled: true, maxHeight: 480, label: 'Replies' }
    const controller = reading.createCommentReplyReadingController(() => options, 'thread-root')
    try {
      controller.sync(renderer, collapsed, tails)
      assert.equal(reply.parentElement, contents)
      assert.equal(root.getElementById('expander-footer').parentElement, null, 'footer remains a native shadow child, outside scrolling contents')
      assert.equal(collapsed.has('thread-root'), false)
      assert.equal(collapsed.has('child'), true)
      assert.equal(contents.tabIndex, 0)
      contents.scrollTop = 400
      const guide = reading.getCommentReplyGuideCoordinates(renderer, contents, root, 'guides')
      assert.equal(guide.rect.top, -380)
      assert.equal(guide.rect.height, 600)
      assert.equal(guide.includeRoot, false)
      const beforeScroll = reads
      contents.dispatchEvent(new Event('scroll', { bubbles: true }))
      assert.equal(reads, beforeScroll)
      contents.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      assert.equal(outer.scrollTop, 40, 'keyboard at bottom hands scrolling to outer reading surface')
      contents.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
      assert.equal(contents.scrollTop, 360)
      contents.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, isComposing: true }))
      assert.equal(contents.scrollTop, 360)
      options.enabled = false
      controller.sync(renderer, collapsed, tails)
      assert.equal(contents.hasAttribute('tabindex'), false)
      assert.equal(collapsed.has('thread-root'), true)
      assert.equal(tails.has('tail:thread-root:after:123'), true)
      assert.equal(reply.parentElement, contents)
      assert.equal(root.querySelector('style'), null)
    }
    finally {
      controller.clear(renderer)
      outer.remove()
    }
  })

  check('comment anchor: a late parent keeps the visible reply, while subsequent user/deep-link intent cancels restoration', async () => {
    const frames = new Map()
    let frame = 0
    const scroll = await import('../src/utils/scrollIntent')
    const anchor = await loadSourceModule('../src/utils/commentReadingAnchor.ts', { './abort': await import('../src/utils/abort'), './scrollIntent': scroll }, {
      requestAnimationFrame: (callback) => {
        frames.set(++frame, callback)
        return frame
      },
      cancelAnimationFrame: id => frames.delete(id),
    })
    const tick = async () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback())
      await flush()
    }
    const list = document.body.appendChild(document.createElement('div'))
    const reply = list.appendChild(document.createElement('article'))
    let offset = 0
    list.getBoundingClientRect = () => new window.DOMRect(0, 0, 300, 300)
    list.scrollTo = ({ top }) => list.scrollTop = top
    reply.getBoundingClientRect = () => new window.DOMRect(0, offset - list.scrollTop, 300, 40)
    try {
      const lease = anchor.captureCommentReadingAnchor(list, list)
      offset = 80
      const restore = lease.restore()
      await tick()
      await tick()
      await restore
      assert.equal(list.scrollTop, 80)
      const canceled = anchor.captureCommentReadingAnchor(list, list)
      offset = 160
      const pending = canceled.restore()
      window.dispatchEvent(new Event('wheel'))
      await pending
      assert.equal(list.scrollTop, 80)
      assert.equal(frames.size, 0)
      const deepLink = anchor.captureCommentReadingAnchor(list, list)
      scroll.scrollToPosition(list, 220)
      const later = deepLink.restore()
      await tick()
      await tick()
      await later
      assert.equal(list.scrollTop, 220)
    }
    finally { list.remove() }
  })

  async function nativeFixture() {
    const frames = new Map()
    let frameId = 0
    const clock = { requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback)
      return frameId
    }, cancelAnimationFrame: id => frames.delete(id) }
    const anchor = await loadSourceModule('../src/utils/commentReadingAnchor.ts', { './abort': await import('../src/utils/abort'), './scrollIntent': await import('../src/utils/scrollIntent') }, clock)
    const controllerModule = await loadSourceModule('../src/inject/commentReplyPagination.ts', {
      '~/constants/commentReading': await import('../src/constants/commentReading'),
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/utils/commentReadingAnchor': anchor,
      '~/utils/commentReplyPageCache': await import('../src/utils/commentReplyPageCache'),
      '~/utils/iframeDrawerHost': { isIframeDrawerHost: () => false },
      './commentReplyControls': await import('../src/inject/commentReplyControls'),
    }, clock)
    const calls = []
    let account = '1'
    let auto = false
    let mode = 'loadMore'
    class Replies extends HTMLElement {
      oid = '123'
      type = 1
      root = '99'
      mode = 3
      currentPage = 1
      pageSize = 10
      count = 1000000
      totalPage = 100000
      list = []
      newItems = []
      cacheList = []
      invisibleID = {}
      showPagination = false
      showViewMore = true
      showSpinner = false
      data = { rpid_str: '99', oid_str: '123', type: 1 }
      constructor() {
        super()
        this.attachShadow({ mode: 'open' }).innerHTML = '<div id="expander"><div id="expander-contents"><div id="spinner"><bili-comments-spinner></bili-comments-spinner></div></div><div id="expander-footer"><div id="pagination"><div id="pagination-head"></div><div id="pagination-body"></div></div></div></div>'
      }

      // Only the published renderer contract is represented here. The actual
      // controller owns all reads, page choice, cancellation and merging.
      getList() { assert.fail('An enabled, recognized renderer must use the cancellable read bridge') }
      handleViewMore() {
        this.cacheList = this.list.slice()
        this.showPagination = true
        this.getList()
      }

      handleChangePage({ idx }) {
        if (this.currentPage !== idx + 1) {
          this.currentPage = idx + 1
          this.getList()
        }
      }

      handleRevert() {
        this.list = this.cacheList.slice()
        this.showPagination = false
        this.showViewMore = true
      }

      get paginationItems() { return [{ idx: this.currentPage, clickable: this.currentPage < this.totalPage, text: 'Next' }] }
      requestUpdate() { this.updateComplete = Promise.resolve() }
    }
    window.customElements.define(`bew-replies-${crypto.randomUUID()}`, Replies)
    const page = (number, ids = Array.from({ length: 10 }, (_, index) => number * 10 + index)) => ({ page: number, pageSize: 10, totalPages: 100000, count: 1000000, items: ids.map(id => ({ rpid_str: String(id), root_str: '99', oid_str: '123', action: 0, like: 0 })) })
    const controller = controllerModule.createCommentReplyPaginationController({
      getAccountId: () => account,
      getContextId: () => 'document-context',
      getBatchPages: () => 5,
      getData: renderer => renderer.data,
      getMode: () => mode,
      getOid: reply => reply.oid_str,
      getRpid: reply => reply.rpid_str,
      getRootRpid: reply => reply.root_str,
      getLabels: () => ({ expandAll: 'Batch', expandingAll: 'Loading', loadMore: 'Next batch', loading: 'Loading', noMore: 'End', page: 'Page', go: 'Go', failed: 'Failed', retry: 'Retry' }),
      isTreeEnabled: () => true,
      scheduleTreeUpdate: renderer => renderer.requestUpdate(),
      readPage: (identity, number, signal) => {
        const task = deferred()
        calls.push({ ...task, identity, page: number, signal })
        return auto ? Promise.resolve(page(number)) : task.promise
      },
    })
    controller.patchPrototype(Replies)
    const renderers = []
    return {
      calls,
      page,
      frames,
      controller,
      setAccount(value) {
        account = value
        controller.reset()
      },
      setAuto(value) { auto = value },
      setMode(value) { mode = value },
      create() {
        const renderer = document.body.appendChild(new Replies())
        renderers.push(renderer)
        controller.sync(renderer)
        return renderer
      },
      close() {
        renderers.forEach((renderer) => {
          controller.dispose(renderer)
          renderer.remove()
        })
        frames.clear()
      },
    }
  }

  check('comment renderer: initial read is one page; direct jumps replace, old reads abort and each explicit batch is bounded', async () => {
    const fixture = await nativeFixture()
    const { controller, calls, page } = fixture
    const renderer = fixture.create()
    const spinner = renderer.shadowRoot.querySelector('bili-comments-spinner')
    try {
      assert.equal(calls.length, 0)
      renderer.handleViewMore()
      await flush()
      assert.equal(calls.length, 1)
      assert.equal(calls[0].page, 1)
      assert.equal(calls[0].identity.pageSize, 10)
      calls[0].resolve(page(1))
      await flush()
      assert.equal(renderer.list.length, 10)
      assert.equal(renderer.shadowRoot.querySelector('bili-comments-spinner'), spinner)
      const old = controller.requestPage(renderer, 50)
      await flush()
      const current = controller.requestPage(renderer, 7)
      await flush()
      assert.equal(calls[1].signal.aborted, true)
      calls[2].resolve(page(7))
      await current
      calls[1].resolve(page(50))
      await old
      assert.equal(renderer.currentPage, 7)
      assert.deepEqual([...renderer.list.map(item => item.rpid_str)], page(7).items.map(item => item.rpid_str))
      await controller.requestPage(renderer, 1)
      assert.equal(calls.length, 3, 'a completed visited page comes from cache')
      fixture.setAuto(true)
      await renderer.handleChangePage({ idx: 1 })
      assert.equal(calls.length, 8, 'one More action reads at most five additional pages')
      assert.equal(renderer.currentPage, 6)
      assert.equal(renderer.list.length, 60)
      assert.match(renderer.shadowRoot.querySelector('.bewly-comment-reply-page-status').textContent, /1–6/)
      fixture.setMode('pagination')
      controller.sync(renderer)
      assert.equal(renderer.list.length, 10)
      const input = renderer.shadowRoot.querySelector('input')
      input.value = '9'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      await flush()
      assert.equal(renderer.currentPage, 6)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flush()
      assert.equal(renderer.currentPage, 9)
      assert.equal(renderer.list.length, 10)
      renderer.handleRevert()
      assert.equal(renderer.showPagination, false)
    }
    finally { fixture.close() }
  })

  check('comment writes: a native in-flight like survives closure and stale page reads, but never crosses accounts', async () => {
    const fixture = await nativeFixture()
    const first = fixture.create()
    const { controller, calls, page } = fixture
    const interactions = await import('../src/inject/commentReplyInteraction')
    const write = deferred()
    let writes = 0
    class Action extends HTMLElement {
      data = { rpid_str: '10' }
      isLike = false
      isDislike = false
      likeCount = 0
      handleLike() {
        writes++
        return write.promise.then(() => {
          this.isLike = true
          this.likeCount = 1
        })
      }
    }
    window.customElements.define(`bew-action-${crypto.randomUUID()}`, Action)
    interactions.patchCommentReplyInteraction(Action, () => controller.captureInteraction(first, '10'))
    const action = new Action()
    try {
      first.handleViewMore()
      await flush()
      calls[0].resolve(page(1))
      await flush()
      const mutation = action.handleLike()
      const second = fixture.create()
      second.mode = 2
      second.currentPage = 2
      second.showPagination = true
      const pending = second.getList()
      await flush()
      controller.dispose(first)
      first.remove()
      write.resolve()
      await mutation
      assert.equal(writes, 1, 'the wrapper never sends or replays writes')
      calls[1].resolve(page(2, [10, 20]))
      await pending
      assert.equal(second.list.find(item => item.rpid_str === '10').action, 1)
      const staleCommit = controller.captureInteraction(second, '10')
      fixture.setAccount('2')
      staleCommit({ action: 0, like: 0 })
      assert.equal(controller.getKnownReplies(second).length, 0)
    }
    finally { fixture.close() }
  })

  check('comment renderer cancellation: route changes abort reads, tracking cleanup retains them, and collapse/reopen reuses bounded visited pages', async () => {
    const href = window.location.href
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    window.history.replaceState(null, '', '/video/BV1dpBoB7EMV/?spm_id_from=test')
    const fixture = await nativeFixture()
    const renderer = fixture.create()
    try {
      renderer.handleViewMore()
      await flush()
      window.dispatchEvent(new Event('replacestate'))
      window.history.replaceState(null, '', '/video/BV1dpBoB7EMV/')
      await flush()
      assert.equal(fixture.calls[0].signal.aborted, false)
      fixture.calls[0].resolve(fixture.page(1))
      await flush()
      renderer.handleRevert()
      renderer.handleViewMore()
      await flush()
      assert.equal(fixture.calls.length, 1)
      const pending = fixture.controller.requestPage(renderer, 2)
      await flush()
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      await pending
      assert.equal(fixture.calls[1].signal.aborted, true)
      assert.equal(renderer.currentPage, 1, 'cancelled navigation retains the last confirmed page number')
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      const navigating = fixture.controller.requestPage(renderer, 3)
      await flush()
      window.dispatchEvent(new Event('pushstate'))
      window.history.pushState(null, '', '/video/BV1fYes6xEmq/')
      await flush()
      assert.equal(fixture.calls[2].signal.aborted, true)
      await navigating
      assert.equal(renderer.showSpinner, false)
      assert.equal(renderer.list[0].rpid_str, '10')
    }
    finally {
      fixture.close()
      if (hidden)
        Object.defineProperty(document, 'hidden', hidden)
      else delete document.hidden
      window.history.replaceState(null, '', href)
    }
  })

  check('comment pages: explicit reads share an abort owner, keep consumers isolated and obey thread/page/item budgets', async () => {
    const { createCommentReplyPageCache } = await import('../src/utils/commentReplyPageCache')
    const identity = { context: 'regular-document', account: '1', oid: '123', type: 1, root: '99', sort: 3, pageSize: 2 }
    const page = number => ({ page: number, pageSize: 2, count: 200000, totalPages: 100000, items: [{ rpid_str: String(number * 2), like: 0 }, { rpid_str: String(number * 2 + 1), like: 0 }] })
    const cache = createCommentReplyPageCache({ threads: 2, pages: 2, items: 3 })
    const first = new AbortController()
    const second = new AbortController()
    let requests = 0
    let signal
    const response = deferred()
    const load = (owner) => {
      requests++
      signal = owner
      return response.promise
    }
    const a = cache.read(identity, 1, load, first.signal).catch(error => error.name)
    const b = cache.read(identity, 1, load, second.signal)
    await flush()
    assert.equal(requests, 1, '100000 available pages still produce one explicitly requested read')
    first.abort()
    assert.equal(await a, 'AbortError')
    assert.equal(signal.aborted, false)
    response.resolve(page(1))
    const result = await b
    result.items[0].like = 100
    assert.equal(cache.get(identity, 1).items[0].like, 0)
    cache.update(identity, '2', item => item.rpid_str === '2' ? { ...item, like: 1 } : item)
    assert.equal(cache.get(identity, 1).items[0].like, 1)
    await cache.read(identity, 2, async () => page(2), new AbortController().signal)
    assert.equal(cache.get(identity, 1), undefined)
    assert.equal(cache.itemCount, 2)
    assert.equal(cache.pageCount, 1)
    const privateIdentity = { ...identity, context: 'private-document' }
    await cache.read(privateIdentity, 1, async () => page(1), new AbortController().signal)
    assert.equal(cache.get(privateIdentity, 1).items[0].like, 0)
    await cache.read({ ...identity, account: '2' }, 1, async () => page(1), new AbortController().signal)
    assert.equal(cache.size, 2)
    assert.equal(cache.get(identity, 2), undefined)
    const pending = deferred()
    const consumer = new AbortController()
    const waiting = cache.read(privateIdentity, 2, (owner) => {
      signal = owner
      return pending.promise
    }, consumer.signal).catch(error => error.name)
    await flush()
    cache.clear()
    assert.equal(signal.aborted, true)
    pending.resolve(page(2))
    assert.equal(await waiting, 'AbortError')
    assert.equal(cache.size, 0)
  })

  check('comment read bridge: actual MAIN client uses typed extension reads and cancellation reaches its API owner', async () => {
    const protocol = await import('../src/constants/pageBridge')
    const events = new Map()
    const docEvents = new Map()
    const window = {
      addEventListener: (name, fn) => {
        const listeners = events.get(name) ?? new Set()
        listeners.add(fn)
        events.set(name, listeners)
      },
      removeEventListener: (name, fn) => events.get(name)?.delete(fn),
      postMessage: (data, origin) => queueMicrotask(() => events.get('message')?.forEach(fn => fn({ data: structuredClone(data), source: window, origin }))),
    }
    const document = { hidden: false, addEventListener: (name, fn) => docEvents.set(name, fn), removeEventListener: name => docEvents.delete(name) }
    const location = { origin: 'https://www.bilibili.com' }
    const pageBridge = await loadSourceModule('../src/constants/pageBridge.ts', {}, { location, Object })
    const requests = []
    const api = { moment: { getMomentCommentReplies: (params, { signal }) => new Promise((resolve, reject) => {
      requests.push({ params, signal, resolve, reject })
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }) } }
    const requestModel = await import('../src/utils/commentReplyRequest')
    const bridge = await loadSourceModule('../src/contentScripts/features/commentReplyApiBridge.ts', {
      '~/constants/pageBridge': pageBridge,
      '~/utils/api': { default: api },
      '~/utils/commentReplyRequest': requestModel,
      '~/utils/main': { getUserID: () => '1' },
      '~/utils/messaging': { isExtensionContextInvalidatedError: error => error?.message === 'Extension context invalidated.' },
      '~/utils/pageBridgeChannel': { getPageBridgeChannelId: () => 'channel' },
    }, { window, document })
    const reader = await loadSourceModule('../src/inject/commentReplyReader.ts', {
      '~/constants/pageBridge': pageBridge,
      '~/utils/abort': await import('../src/utils/abort'),
      '~/utils/commentReplyRequest': requestModel,
    }, { window, location, crypto })
    const stop = bridge.setupCommentReplyApiBridge()
    const read = reader.createNativeCommentReplyReader('channel')
    const identity = { context: 'channel', account: '1', oid: '123', type: 1, root: '99', sort: 3, pageSize: 10 }
    const controller = new AbortController()
    let activeRead
    try {
      const result = read(identity, 4, controller.signal)
      activeRead = result
      await flush()
      assert.deepEqual(JSON.parse(JSON.stringify(requests[0].params)), { oid: '123', type: 1, root: '99', pn: 4, ps: 10 })
      requests[0].resolve({ code: 0, data: { replies: [{ rpid_str: '40' }], page: { num: 4, size: 10, count: 91 } } })
      assert.equal((await result).totalPages, 10)
      const abort = new AbortController()
      const pending = read(identity, 5, abort.signal).catch(error => error.name)
      await flush()
      abort.abort()
      assert.equal(await pending, 'AbortError')
      await flush()
      assert.equal(requests[1].signal.aborted, true)
      window.postMessage({ protocol: protocol.PAGE_BRIDGE_PROTOCOL, channelId: 'channel', type: protocol.PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_REQUEST, data: { requestId: 'foreign', identity: { ...identity, account: '2' }, page: 1 } }, location.origin)
      await flush()
      assert.equal(requests.length, 2)
      assert.throws(() => requestModel.normalizeNativeCommentReplyPage({ code: 0, data: { replies: [], page: { num: 9, size: 10, count: 91 } } }, { identity, page: 4, requestId: 'bad' }))
      const invalidated = read(identity, 6, controller.signal).catch(error => error.message)
      await flush()
      requests[2].reject(new Error('Extension context invalidated.'))
      assert.equal(await invalidated, 'context-invalidated')
      await assert.rejects(read(identity, 7, controller.signal), /unavailable/)
      assert.equal(requests.length, 3, 'an invalidated bridge cannot restart reads')
    }
    finally {
      controller.abort()
      await activeRead?.catch(() => {})
      stop()
      assert.equal(events.get('message').size, 0)
      assert.equal(docEvents.size, 0)
    }
  })
}
