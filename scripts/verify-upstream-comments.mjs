import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerUpstreamCommentChecks(check) {
  check('missing parents: shared placeholders preserve known chains, real arrivals, ordering and unknown metadata', async () => {
    const model = await import('../src/utils/commentMissingParents')
    const dom = await loadSourceModule('../src/inject/commentMissingParents.ts', {})
    const tree = await import('../src/utils/commentTree')
    const order = await loadSourceFunctions('../src/inject/index.ts', ['buildCommentReplyTreeOrder', 'getCommentReplyTreeNodeKey'], { buildCommentTree: tree.buildCommentTree, MAX_COMMENT_REPLY_TREE_DEPTH: 10 })
    const container = document.body.appendChild(document.createElement('div'))
    const native = id => ({ rpid: id, rootRpid: '1000', parentRpid: '1002', ctime: Number(id), originalOrder: Number(id), authorName: `author-${id}`, children: [], renderer: container.appendChild(document.createElement('bili-comment-reply-renderer')) })
    const replies = [native('1003'), native('1004')]
    const cache = new Map([
      ['1002', { parentRpid: '1001', rootRpid: '1000', authorName: 'known', messageText: 'known body', ctime: 2 }],
      ['1001', { parentRpid: '1000', rootRpid: '1000', authorName: null, messageText: null, ctime: null }],
    ])
    const parents = model.resolveMissingCommentParents(replies, cache)
    const placeholders = dom.syncMissingCommentParents(container, parents, 'cmn-CN')
    const observer = new MutationObserver(() => {})
    observer.observe(container, { childList: true, subtree: true })
    try {
      assert.equal(placeholders.length, 2)
      assert.equal(container.querySelectorAll(dom.MISSING_COMMENT_PARENT_SELECTOR).length, 2)
      assert.equal(parents.find(parent => parent.rpid === '1001').authorName, null)
      assert.equal(parents.find(parent => parent.rpid === '1001').ctime, null, 'layout anchoring does not invent the missing timestamp')
      assert.doesNotMatch(container.textContent, /已删除|@…/)
      assert.match(container.textContent, /未在本页加载/)
      const again = dom.syncMissingCommentParents(container, parents, 'cmn-CN')
      assert.equal(again[0].renderer, placeholders[0].renderer)
      assert.equal(observer.takeRecords().length, 0, 'an unchanged placeholder pass does not feed the observer back into itself')
      const nodes = [...replies, ...placeholders.map(parent => ({ ...parent, children: [], directParentVisible: true }))]
      const ordered = order.buildCommentReplyTreeOrder(nodes)
      assert.deepEqual(Array.from(ordered, entry => entry.node.rpid), ['1001', '1002', '1003', '1004'])
      assert.deepEqual(Array.from(nodes.find(node => node.rpid === '1002').children, node => node.rpid), ['1003', '1004'])
      const real = native('1002')
      real.parentRpid = '1001'
      let clicks = 0
      real.renderer.addEventListener('click', () => clicks++)
      const next = dom.syncMissingCommentParents(container, model.resolveMissingCommentParents([...replies, real], cache), 'en')
      assert.equal(next.length, 1)
      assert.equal(placeholders[0].renderer.isConnected, false, 'the real parent replaces the shared placeholder')
      real.renderer.click()
      assert.equal(clicks, 1, 'native renderer/listeners are retained')
      const records = observer.takeRecords().filter(record => [...record.addedNodes, ...record.removedNodes].every(dom.isMissingCommentParentMutationNode))
      assert.ok(records.length > 0)
      const large = '900719925474099312345'
      const unknown = model.resolveMissingCommentParents([{ ...replies[0], parentRpid: large }], new Map())
      assert.equal(unknown[0].rpid, large)
      assert.equal(unknown[0].parentRpid, null)
      assert.equal(unknown[0].messageText, null)
      const cyclic = new Map([
        ['1002', { ...cache.get('1002'), parentRpid: '1001' }],
        ['1001', { ...cache.get('1001'), parentRpid: '1002' }],
      ])
      const cycleParents = dom.syncMissingCommentParents(container, model.resolveMissingCommentParents(replies, cyclic), 'cmn-TW')
      const cycleOrder = order.buildCommentReplyTreeOrder([...replies, ...cycleParents.map(parent => ({ ...parent, children: [] }))])
      assert.equal(cycleOrder.length, 4)
      assert.equal(cycleOrder.find(item => item.node.rpid === '1002').node.children.some(node => node.rpid === '1003'), true)
      const seen = new Set()
      function visit(node) {
        assert.equal(seen.has(node.rpid), false, 'collapse traversal cannot enter a parent cycle')
        seen.add(node.rpid)
        node.children.forEach(visit)
      }
      cycleOrder.filter(item => item.depth === 0).forEach(item => visit(item.node))
      assert.equal(seen.size, 4)
      dom.clearMissingCommentParents(container)
      assert.equal(container.querySelectorAll(dom.MISSING_COMMENT_PARENT_SELECTOR).length, 0)
    }
    finally {
      observer.disconnect()
      container.remove()
    }
  })

  check('native comment state: account/oid identity clears placeholders, cache and queued tree work', async () => {
    const missing = await loadSourceModule('../src/inject/commentMissingParents.ts', {})
    const component = document.body.appendChild(document.createElement('bili-comment-replies-renderer'))
    const container = document.createElement('div')
    container.id = 'expander-contents'
    component.attachShadow({ mode: 'open' }).append(container)
    component.oid = '11'
    component.root = '12'
    let account = '1'
    const states = new WeakMap()
    const epochs = new WeakMap()
    const frames = []
    let updates = 0
    const functions = await loadSourceFunctions('../src/inject/index.ts', ['getCommentReplyTreeIdentity', 'getCommentReplyTreeState', 'clearCommentReplyTreeState', 'scheduleCommentReplyTreeLayoutUpdate'], {
      HTMLElement,
      document,
      ...missing,
      getUserID: () => account,
      getCommentReplyData: () => ({}),
      commentReplyTreeStates: states,
      commentReplyTreeEpochs: epochs,
      commentRepliesRenderers: new Set(),
      pendingCommentReplyTreeLayoutUpdates: new WeakSet(),
      disconnectCommentReplyTreeResizeObserver() {},
      removeCommentReplyTreeGuides() {},
      isCommentReplyRenderer: () => false,
      getCommentReplyTreeRootRenderer: () => null,
      requestAnimationFrame: fn => frames.push(fn),
      updateCommentReplyTree: () => updates++,
    })
    try {
      const first = functions.getCommentReplyTreeState(component)
      first.replyMetaByRpid.set('13', {})
      const placeholder = container.appendChild(document.createElement('div'))
      placeholder.className = missing.MISSING_COMMENT_PARENT_SELECTOR.slice(1)
      functions.scheduleCommentReplyTreeLayoutUpdate(component)
      account = '2'
      frames.shift()()
      assert.equal(updates, 0)
      const second = functions.getCommentReplyTreeState(component)
      assert.notEqual(second, first)
      assert.equal(first.replyMetaByRpid.size, 0)
      assert.equal(container.children.length, 0)
      assert.equal(epochs.get(component), 1)
      assert.equal(functions.getCommentReplyTreeState(component), second)
      component.oid = '99'
      assert.notEqual(functions.getCommentReplyTreeState(component), second)
      functions.clearCommentReplyTreeState(component)
      assert.equal(states.has(component), false)
    }
    finally {
      component.remove()
    }
  })

  check('native reply pagination: a late native getList cannot restore another account history', async () => {
    let resolve
    const response = new Promise(done => resolve = done)
    let account = '1'
    const module = await loadSourceModule('../src/inject/commentReplyPagination.ts', {})
    const controller = module.createCommentReplyPaginationController({
      getAccountId: () => account,
      getData: () => ({}),
      getOid: () => '1',
      getRootRpid: () => '2',
      getRpid: row => row.rpid,
      getMode: () => 'loadMore',
      isTreeEnabled: () => true,
      shouldShowExpandAll: () => false,
      getLabels: () => ({ expandAll: 'all', expandingAll: 'loading', loadMore: 'more', loading: 'loading', noMore: 'done' }),
      scheduleTreeUpdate() {},
    })
    class Renderer {
      oid = '1'
      root = '2'
      type = 1
      list = [{ rpid: 'old' }]
      currentPage = 1
      totalPage = 2
      isConnected = true
      requestUpdate() {}
      async getList() { this.list = await response }
      handleChangePage() {}
      get paginationItems() { return [{ idx: 1, clickable: true }] }
    }
    const originalGetList = Renderer.prototype.getList
    controller.patchPrototype(Renderer)
    assert.notEqual(Renderer.prototype.getList, originalGetList)
    const renderer = new Renderer()
    controller.sync(renderer)
    const old = renderer.getList()
    account = '2'
    renderer.list = [{ rpid: 'new-account' }]
    controller.sync(renderer)
    resolve([{ rpid: 'old-account-result' }])
    await old
    assert.deepEqual(renderer.list, [{ rpid: 'new-account' }])
    controller.dispose(renderer)
  })
}
