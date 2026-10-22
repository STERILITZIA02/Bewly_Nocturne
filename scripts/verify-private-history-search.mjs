import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'

export function registerPrivateHistorySearchChecks(check, { Vue, flush }) {
  const path = '../src/contentScripts/views/Notifications/whisper/'
  const session = id => ({ key: `1:${id}`, talkerId: id, name: `User ${id}`, sessionType: 1, capabilities: { canReadNative: true } })
  const message = (talkerId, seq, text) => ({ sender_uid: talkerId, receiver_id: '1', receiver_type: 1, msg_key: `${talkerId}-${seq}`, msg_seqno: String(seq), msg_type: 1, msg_status: 0, msg_source: 0, timestamp: seq, content: JSON.stringify({ content: text }) })
  const page = (messages, has_more = 0) => ({ code: 0, data: { messages, e_infos: [], has_more, min_seqno: '1', max_seqno: '100' } })
  const deferred = () => {
    let resolve
    const promise = new Promise(yes => resolve = yes)
    return { promise, resolve }
  }

  check('Private history search covers later sessions and older pages, locates context without ACKs, and serializes rapid navigation', async () => {
    const { usePrivateHistorySearch } = await import(`${path}usePrivateHistorySearch`)
    const mid = Vue.ref('1')
    const active = Vue.ref(true)
    let acks = 0
    const sessions = {
      state: Vue.reactive({ items: [session('2'), session('3')], loaded: true, noMore: false }),
      async loadMore() {
        this.state.items.push(session('4'), { ...session('5'), sessionType: 2, capabilities: { canReadNative: false } })
        this.state.noMore = true
      },
      markSessionRead() { acks++ },
    }
    const contexts = []
    const data = { 2: [message('2', 100, 'Needle new'), message('2', 50, 'needle old')], 3: [message('3', 80, 'other')], 4: [message('4', 70, 'needle later session')] }
    const scope = Vue.effectScope()
    const search = scope.run(() => usePrivateHistorySearch(mid, { sessions, active: () => active.value, fetchMessages: async (options) => {
      assert.equal(options.size, 20, 'use the verified native-client page size')
      if (['111', '81', '61'].includes(options.endSeqno)) {
        const task = deferred()
        contexts.push({ ...task, options })
        return task.promise
      }
      if (options.talkerId === '2')
        return page(options.endSeqno ? [data[2][1]] : [data[2][0]], options.endSeqno ? 0 : 1)
      return page(data[options.talkerId])
    } }))
    try {
      await search.search('Ｎｅｅｄｌｅ')
      assert.deepEqual(search.state.results.map(item => item.message.msgKey), ['2-100', '4-70', '2-50'])
      assert.equal(Vue.isReactive(search.state.results), false, 'sorted results use immutable shallow updates')
      assert.equal(Vue.isReactive(search.state.results[0].message), false, 'read-only message content is not deeply proxied')
      assert.equal(search.state.complete, true)
      assert.equal(search.state.skippedSessions, 1)
      assert.equal(acks, 0)
      const choices = search.state.results.map(item => item.key)
      search.choose(choices[0])
      assert.equal(contexts.length, 0, 'choosing a result defers the context GET until the conversation finishes opening')
      const first = search.select(choices[0])
      const second = search.select(choices[1])
      const third = search.select(choices[2])
      assert.equal(contexts.length, 1)
      contexts[0].resolve(page(data[2]))
      await flush()
      assert.equal(contexts.length, 2, 'only the latest queued context request is sent')
      assert.equal(contexts[1].options.endSeqno, '61')
      contexts[1].resolve(page([message('2', 60, 'newer context'), data[2][1]]))
      await Promise.all([first, second, third])
      assert.equal(search.state.context.key, choices[2])
      assert.deepEqual(search.state.context.items.map(item => item.seqno), ['50', '60'])
      assert.equal(search.selectedIndex.value, 2)
      const context = search.state.context
      search.choose(choices[2])
      assert.equal(search.state.context, context, 'choosing the current match reuses its context and only repositions it')
      assert.equal(search.nextKey(1), choices[0])
      const stale = search.select(choices[0])
      mid.value = '9'
      contexts[2].resolve(page(data[2]))
      await stale
      assert.equal(search.state.context, null)
      assert.equal(search.state.results.length, 0)
      assert.equal(acks, 0, 'search never commits read state')
    }
    finally { scope.stop() }
  })

  check('Private history search has a resumable request budget, handles empty history floors and drops results after cancellation', async () => {
    const { usePrivateHistorySearch } = await import(`${path}usePrivateHistorySearch`)
    const mid = Vue.ref('1')
    const active = Vue.ref(true)
    const sessions = { state: Vue.reactive({ items: [session('2')], loaded: true, noMore: true }) }
    let reads = 0
    let gate
    const scope = Vue.effectScope()
    const search = scope.run(() => usePrivateHistorySearch(mid, { sessions, active: () => active.value, fetchMessages: async ({ endSeqno }) => {
      reads++
      if (gate)
        return gate.promise
      const seq = endSeqno ? Number(endSeqno) - 1 : 50
      return page([message('2', seq, seq === 5 ? 'needle' : 'other')], seq > 1 ? 1 : 0)
    } }))
    try {
      await search.search('needle')
      assert.equal(reads, 20)
      assert.equal(search.state.complete, false)
      assert.equal(search.state.running, true)
      search.stop()
      await new Promise(resolve => setTimeout(resolve, 550))
      assert.equal(reads, 20, 'pause cancels the scheduled continuation')
      await search.resume()
      assert.equal(reads, 40)
      await search.resume()
      assert.equal(reads, 50)
      assert.equal(search.state.complete, true)
      assert.equal(search.state.results[0].message.seqno, '5')
      gate = deferred()
      const pending = search.search('secret')
      active.value = false
      gate.resolve(page([message('2', 99, 'secret')], 1))
      await pending
      assert.equal(reads, 51)
      assert.equal(search.state.results.length, 0)
      assert.equal(search.state.query, '')
    }
    finally { scope.stop() }
  })

  check('Private history result windows can continue beyond their display limit without truncating the corpus', async () => {
    const { usePrivateHistorySearch } = await import(`${path}usePrivateHistorySearch`)
    const scope = Vue.effectScope()
    const search = scope.run(() => usePrivateHistorySearch(Vue.ref('1'), {
      sessions: { state: { items: [session('2')], loaded: true, noMore: true } },
      fetchMessages: async ({ endSeqno, size }) => {
        const start = endSeqno ? Number(endSeqno) - 1 : 2050
        const values = Array.from({ length: Math.min(size, start) }, (_, i) => message('2', start - i, 'needle'))
        return page(values, start > size ? 1 : 0)
      },
    }))
    try {
      await search.search('needle')
      while (!search.state.limited && !search.state.complete)
        await search.resume()
      assert.equal(search.state.results.length, 2000)
      assert.equal(search.state.limited, true)
      assert.equal(search.state.complete, false)
      await search.nextBatch()
      assert.equal(search.state.batch, 2)
      assert.equal(search.state.results.length, 50)
      assert.equal(search.state.complete, true)
      assert.equal(search.state.results.at(-1).message.seqno, '1')
    }
    finally { scope.stop() }
  })

  check('Combined user search finishes all following pages before global search and preserves both groups', async () => {
    const { usePrivateRecipientSearch } = await import(`${path}usePrivateRecipientSearch`)
    const scope = Vue.effectScope()
    const pages = []
    const search = scope.run(() => usePrivateRecipientSearch(Vue.ref('1'), {
      fetchFollowing: async ({ pn, ps, name }) => {
        assert.equal(name, '猫')
        pages.push(`following:${pn}`)
        return { code: 0, data: { total: 47, list: Array.from({ length: Math.min(ps, 47 - (pn - 1) * ps) }, (_, i) => ({ mid: String((pn - 1) * ps + i + 2), uname: `猫${i}` })) } }
      },
      fetchGlobal: async ({ keyword, page }) => {
        assert.equal(keyword, '猫')
        pages.push(`global:${page}`)
        return { code: 0, data: { result: [{ mid: String(900 + page), uname: '猫Global' }], numPages: 2 } }
      },
    }))
    try {
      search.setQuery('猫')
      await Promise.all([search.searchAll(), search.searchAll()])
      assert.deepEqual(pages, ['following:1', 'following:2', 'following:3', 'following:4', 'following:5', 'global:1'])
      assert.equal(search.state.groups.following.items.length, 47)
      assert.equal(search.state.groups.global.items.length, 1)
      assert.equal(search.state.complete, true)
      await search.loadMore('global')
      assert.equal(search.state.groups.following.items.length, 47)
      assert.equal(search.state.groups.global.items.length, 2)
      await search.searchAll()
      assert.equal(pages.length, 7, 'both groups reuse their query-scoped cache')
      const cachedGlobal = search.state.groups.global.items
      search.pause()
      search.setQuery('猫')
      await search.resume()
      assert.equal(pages.length, 7, 'returning to the same user query performs no requests')
      assert.equal(search.state.groups.global.items, cachedGlobal, 'retain the loaded pages instead of rebuilding the result array')
    }
    finally { scope.stop() }
  })

  check('Combined user search isolates cancelled same-key requests and keeps global results after a following failure', async () => {
    const { usePrivateRecipientSearch } = await import(`${path}usePrivateRecipientSearch`)
    const scope = Vue.effectScope()
    const waiting = deferred()
    const requests = []
    const search = scope.run(() => usePrivateRecipientSearch(Vue.ref('1'), {
      fetchFollowing: async () => {
        requests.push('following')
        if (requests.length === 1)
          return waiting.promise
        return { code: -1 }
      },
      fetchGlobal: async () => {
        requests.push('global')
        return { code: 0, data: { result: [{ mid: '8', uname: 'Current' }], numPages: 1 } }
      },
    }))
    try {
      search.setQuery('same')
      const stale = search.searchAll()
      search.setQuery('')
      search.setQuery('same')
      const current = search.searchAll()
      waiting.resolve({ code: 0, data: { list: [{ mid: '2', uname: 'Stale' }], total: 1 } })
      await Promise.all([stale, current])
      assert.deepEqual(requests, ['following', 'following', 'global'])
      assert.equal(search.state.groups.following.errorKind, 'api-error')
      assert.equal(search.state.groups.following.items.length, 0)
      assert.equal(search.state.groups.global.items[0].name, 'Current')
    }
    finally { scope.stop() }
  })

  check('User result groups deduplicate followed users and filter local plus remote matches by session type', async () => {
    const { matchesPrivateSessionType } = await import(`${path}privateSession`)
    const sessions = [
      { ...session('2'), name: 'local followed', kind: 'user', followed: true },
      { ...session('3'), name: 'assistant', kind: 'official-assistant' },
    ]
    const typeFilter = Vue.ref('all')
    const group = items => ({ items })
    const { recipientGroups } = await loadSourceFunctions(`${path}ConversationList.vue`, ['recipientGroups'], {
      computed: Vue.computed,
      props: { items: sessions, showOfficialAssistants: true, recipientSearch: { state: { groups: {
        following: group([{ mid: '2', name: 'duplicate' }, { mid: '4', name: 'remote followed' }]),
        global: group([{ mid: '2', name: 'duplicate' }, { mid: '4', name: 'duplicate' }, { mid: '5', name: 'new' }, { mid: '6', name: 'fuzzy followed', followed: true }]),
      } } } },
      filteredItems: Vue.computed(() => sessions.filter(item => matchesPrivateSessionType(item.kind, typeFilter.value))),
      typeFilter,
      matchesPrivateSessionType,
    })
    assert.deepEqual(Array.from(recipientGroups.value[0].items, row => row.recipient.mid), ['2', '4', '6'])
    assert.deepEqual(Array.from(recipientGroups.value[1].items, row => row.recipient.mid), ['3', '5'])
    typeFilter.value = 'official-assistant'
    assert.equal(recipientGroups.value[0].items.length, 0)
    assert.deepEqual(Array.from(recipientGroups.value[1].items, row => row.recipient.mid), ['3'])
    typeFilter.value = 'other'
    assert.equal(recipientGroups.value.flatMap(group => group.items).length, 0)
  })

  check('History type filters keep the match count, selection and navigation in the same subset without rescanning', async () => {
    const { usePrivateHistorySearch } = await import(`${path}usePrivateHistorySearch`)
    const scope = Vue.effectScope()
    const search = scope.run(() => usePrivateHistorySearch(Vue.ref('1'), { sessions: { state: { items: [] } }, fetchMessages: () => assert.fail('filtering must not refetch history') }))
    try {
      search.state.results = [
        { key: 'a', session: { ...session('2'), kind: 'user' } },
        { key: 'b', session: { ...session('3'), kind: 'official-assistant' } },
        { key: 'c', session: { ...session('4'), kind: 'user' } },
      ]
      search.choose('b')
      search.state.visibleResultCount = 100
      search.setTypeFilter('user')
      assert.equal(search.state.visibleResultCount, 50)
      assert.equal(search.state.selectedKey, '')
      assert.equal(search.filteredResults.value.length, 2)
      assert.equal(search.nextKey(1), 'a')
      search.choose('a')
      assert.equal(search.nextKey(1), 'c')
      search.choose('c')
      assert.equal(search.selectedIndex.value, 1)
      search.setTypeFilter('other')
      assert.equal(search.nextKey(1), '')
      assert.equal(search.filteredResults.value.length, 0)
      search.setTypeFilter('all')
      assert.equal(search.filteredResults.value.length, 3)
    }
    finally { scope.stop() }
  })

  check('History search debounces query edits and preserves completed results and context across suspension', async () => {
    const { usePrivateHistorySearch } = await import(`${path}usePrivateHistorySearch`)
    const scope = Vue.effectScope()
    let reads = 0
    const search = scope.run(() => usePrivateHistorySearch(Vue.ref('1'), {
      sessions: { state: { items: [session('2')], loaded: true, noMore: true } },
      fetchMessages: async () => {
        reads++
        return page([message('2', 10, 'final keyword')])
      },
    }))
    try {
      await search.search('discarded', 40)
      await search.search('final', 20)
      await new Promise(resolve => setTimeout(resolve, 300))
      await flush()
      assert.equal(reads, 1)
      assert.equal(search.state.results.length, 1)
      assert.equal(search.state.complete, true)
      const key = search.state.results[0].key
      search.choose(key)
      await search.select(key)
      const cachedResults = search.state.results
      const cachedContext = search.state.context
      search.state.visibleResultCount = 100
      search.suspend()
      await search.resume()
      assert.equal(reads, 2, 'returning to completed history does not refetch results or context')
      assert.equal(search.state.results, cachedResults)
      assert.equal(search.state.context, cachedContext)
      assert.equal(search.state.selectedKey, key)
      assert.equal(search.state.visibleResultCount, 100)
      await search.search('cancelled before debounce', 20)
      search.stop()
      await new Promise(resolve => setTimeout(resolve, 40))
      assert.equal(reads, 2, 'pause cancels the pending automatic search too')
    }
    finally { scope.stop() }
  })

  check('Search context blocks ordinary history polling and read ACKs in the real conversation functions', async () => {
    let called = 0
    const functions = await loadSourceFunctions(`${path}ConversationView.vue`, ['acknowledgeIfEligible', 'loadOlderMessages', 'refreshLatest'], {
      props: { searchMode: true, controller: {
        acknowledgeIfEligible() { called++ },
        loadOlder() { called++ },
        refreshLatest() { called++ },
      } },
    })
    await functions.acknowledgeIfEligible()
    await functions.loadOlderMessages()
    await functions.refreshLatest()
    assert.equal(called, 0)
    const states = new Map()
    const viewState = await loadSourceFunctions(`${path}ConversationView.vue`, ['state'], {
      computed: Vue.computed,
      talkerId: Vue.ref('uncached'),
      props: { searchMode: true, controller: { states, getState: () => assert.fail('search must not create normal reader entries') } },
    })
    assert.equal(viewState.state.value.items.length, 0)
    assert.equal(states.size, 0)
  })
}
