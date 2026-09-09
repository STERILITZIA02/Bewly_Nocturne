import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function registerUpstreamTransactionChecks(check, { Vue, flush, compileComponent }) {
  check('relations: shared readers preserve newer writes, concurrent queries and account ownership', async () => {
    const VueUse = await import('@vueuse/core')
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    let cookie = '1'
    const listeners = new Set()
    const reads = []
    const writes = []
    const api = { user: {
      getRelations: (params) => {
        const request = deferred()
        reads.push({ ...request, params })
        return request.promise
      },
      relationModify: (params) => {
        const request = deferred()
        writes.push({ ...request, params })
        return request.promise
      },
    } }
    const relation = await loadSourceModule('../src/utils/userRelation.ts', {
      vue: Vue,
      '~/utils/api': { default: api },
      '~/utils/main': { getUserID: () => cookie, getCSRF: () => 'csrf' },
      '~/utils/mitt': { default: { on: (_event, fn) => listeners.add(fn), off: (_event, fn) => listeners.delete(fn), emit: (_event, value) => listeners.forEach(fn => fn(value)) } },
    })
    const module = await loadSourceModule('../src/composables/useUserRelations.ts', {
      '@vueuse/core': VueUse,
      'vue': Vue,
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: api },
      '~/utils/userRelation': relation,
      '~/utils/main': { getUserID: () => cookie },
    })
    const a = Vue.effectScope()
    const b = Vue.effectScope()
    const first = a.run(module.useUserRelations)
    const second = b.run(module.useUserRelations)
    try {
      assert.equal(first.userRelations, second.userRelations, 'cards/search use one relationship state owner')
      assert.equal(listeners.size, 1)
      const before = first.batchQueryUserRelations([10])
      const another = second.batchQueryUserRelations([20])
      const write = relation.changeUserRelation(1, 10, 1)
      assert.deepEqual({ ...writes[0].params }, { fid: '10', act: 1, re_src: 11, csrf: 'csrf' })
      writes[0].resolve({ code: 0 })
      await write
      reads[0].resolve({ code: 0, data: { 10: { attribute: 0 } } })
      reads[1].resolve({ code: 0, data: { 20: { attribute: 6 } } })
      await Promise.all([before, another])
      assert.equal(first.userRelations.value[10].isFollowing, true)
      assert.equal(first.userRelations.value[20].isFollowing, true, 'independent relation queries do not cancel each other')
      first.reset()
      assert.equal(second.userRelations.value[10].isFollowing, true, 'resetting one search query cannot erase the shared confirmed relationship')
      const failure = relation.changeUserRelation(1, 10, 2)
      writes[1].resolve({ code: -500, message: 'failure' })
      await failure
      assert.equal(first.userRelations.value[10].isFollowing, true)
      const stale = relation.changeUserRelation(1, 10, 5)
      cookie = '2'
      account.userInfo.mid = 2
      writes[2].resolve({ code: 0 })
      await stale
      assert.deepEqual(Object.keys(first.userRelations.value), [])
      assert.equal(relation.getUserRelationRevision(), 1)
      a.stop()
      assert.equal(listeners.size, 1)
      b.stop()
      assert.equal(listeners.size, 0, 'the last consumer releases the shared account effects')
    }
    finally {
      a.stop()
      b.stop()
    }
  })

  check('moment forward: issued writes outlive cards, join on remount, and preserve later draft revisions', async () => {
    const content = await import('../src/components/MomentCard/momentForwardContent')
    let account = 1
    const creates = []
    const checks = []
    const api = { moment: {
      checkMomentCreate() {
        const request = deferred()
        checks.push(request)
        return request.promise
      },
      createMoment(params) {
        const request = deferred()
        creates.push({ ...request, params })
        return request.promise
      },
    } }
    const transactions = await loadSourceModule('../src/components/MomentCard/momentForwardTransactions.ts', {
      vue: Vue,
      '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
      '~/utils/api': { default: api },
      '~/utils/main': { getCSRF: () => 'csrf', getUserID: () => String(account) },
      './momentForwardContent': content,
    })
    const commits = []
    const page = transactions.createMomentForwardTransactions(() => account, (...args) => commits.push(args))
    const text = value => [{ type: 'text', text: value }]
    const component = await loadSourceModule('../src/components/MomentCard/useMomentForwardComposer.ts', {
      'vue': Vue,
      '~/utils/api': { default: api },
      '~/utils/main': { getUserID: () => String(account) },
      './momentForwardContent': content,
      './momentForwardTransactions': transactions,
    })
    function mountComposer(owner = page) {
      let composer
      const host = document.body.appendChild(document.createElement('div'))
      const app = Vue.createApp({
        setup() {
          composer = component.useMomentForwardComposer(Vue.ref({ id: '100', forwardCount: 5 }), Vue.ref(1), {
            accountUnavailable: 'account',
            csrfUnavailable: 'csrf',
            momentUnavailable: 'moment',
            forwardFailed: 'failed',
          })
          return () => Vue.h('div')
        },
      })
      app.provide(transactions.MOMENT_FORWARD_TRANSACTIONS, owner)
      app.mount(host)
      return { composer, dispose() {
        app.unmount()
        host.remove()
      } }
    }
    const first = mountComposer()
    first.composer.setTokens(text('submitted'))
    const sending = first.composer.submit()
    checks[0].resolve({ code: 0 })
    await flush()
    assert.equal(creates.length, 1)
    first.dispose()
    const second = mountComposer()
    assert.equal(second.composer.state.status, 'submitting')
    creates[0].resolve({ code: 0 })
    await sending
    await flush()
    assert.equal(second.composer.state.tokens.length, 0)
    assert.equal(creates.length, 1, 'joining a pending transaction never sends again')
    assert.deepEqual(commits, [['100', 6]])
    second.dispose()
    const after = mountComposer()
    assert.equal(after.composer.state.tokens.length, 0, 'unmount cannot save the already committed draft back into cache')
    after.dispose()

    const pending = page.submit('101', text('old'), null, 7, () => true)
    checks[1].resolve({ code: 0 })
    await flush()
    page.save(page.keyOf('101'), text('new draft'), null)
    page.dispose()
    creates[1].resolve({ code: 0 })
    await pending
    assert.equal(page.read('1:101').tokens[0].text, 'new draft')
    assert.equal(commits.length, 1, 'a disposed page never mutates the next feed')

    const nextPage = transactions.createMomentForwardTransactions(() => account, () => {})
    const notIssued = nextPage.submit('102', text('cancel before send'), null, 0, () => true)
    nextPage.dispose()
    checks[2].resolve({ code: 0 })
    await notIssued
    assert.equal(creates.length, 2, 'unmount cancels the step after submit_check')
    const accountPage = transactions.createMomentForwardTransactions(() => account, () => {})
    const oldAccountWrite = accountPage.submit('103', [], null, 0, () => true)
    account = 2
    accountPage.invalidate()
    accountPage.save('2:103', text('account two'), null)
    creates[2].resolve({ code: 0 })
    await oldAccountWrite
    assert.equal(accountPage.read('1:103'), undefined)
    assert.equal(accountPage.read('2:103').tokens[0].text, 'account two')
    accountPage.dispose()
  })

  check('forward editor: cached expansion does not steal focus; active pickers and actual submissions release retention when finished', async () => {
    const content = await import('../src/components/MomentCard/momentForwardContent')
    const sent = deferred()
    const api = { moment: { checkMomentCreate: async () => ({ code: 0 }), createMoment: () => sent.promise } }
    const transactions = await loadSourceModule('../src/components/MomentCard/momentForwardTransactions.ts', {
      'vue': Vue,
      '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
      '~/utils/api': { default: api },
      '~/utils/main': { getUserID: () => '1', getCSRF: () => 'csrf' },
      './momentForwardContent': content,
    })
    const controller = await loadSourceModule('../src/components/MomentCard/useMomentForwardComposer.ts', {
      'vue': Vue,
      '~/utils/api': { default: api },
      '~/utils/main': { getUserID: () => '1' },
      './momentForwardContent': content,
      './momentForwardTransactions': transactions,
    })
    const Component = await compileComponent('../src/components/MomentCard/MomentForwardComposer.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ success() {}, error() {} }) },
      '~/stores/topBarStore': { useTopBarStore: () => ({ isLogin: true, userInfo: { mid: 1 } }) },
      './momentForwardContent': content,
      './useMomentForwardComposer': controller,
      './MomentForwardEmojiPicker.vue': { default: { render: () => null } },
      './MomentForwardTopicPicker.vue': { default: { render: () => null } },
    })
    const page = transactions.createMomentForwardTransactions(() => 1, () => {})
    page.save(page.keyOf('204'), [{ type: 'text', text: 'kept draft' }], null)
    const props = Vue.reactive({ moment: { id: '204', forwardCount: 0 }, active: true, autofocus: false })
    const held = []
    const origin = document.body.appendChild(document.createElement('button'))
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Component, { ...props, onInteractionChange: value => held.push(value), onClose: () => props.active = false }) })
    app.provide(transactions.MOMENT_FORWARD_TRANSACTIONS, page)
    origin.focus()
    app.mount(host)
    try {
      await flush()
      assert.equal(document.activeElement, origin)
      assert.equal(held.at(-1), false)
      assert.equal(host.querySelector('textarea').value, 'kept draft')
      props.autofocus = true
      await flush()
      assert.equal(document.activeElement, host.querySelector('textarea'))
      host.querySelector('.moment-forward-composer__tools button').click()
      await flush()
      assert.equal(held.at(-1), true)
      host.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(held.at(-1), false)
      origin.focus()
      host.querySelector('.moment-forward-composer__submit').click()
      await flush()
      assert.equal(held.at(-1), true)
      sent.resolve({ code: 0 })
      await flush()
      assert.equal(held.at(-1), false)
      assert.equal(page.read('1:204'), undefined)
    }
    finally {
      app.unmount()
      page.dispose()
      origin.remove()
      host.remove()
    }
  })
}
