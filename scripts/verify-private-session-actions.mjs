import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadSourceModule } from './sourceModuleHarness'

export function registerPrivateSessionActionChecks(check, { Vue }) {
  check('session action headers cover only the four native POST endpoints', async () => {
    const rules = JSON.parse(await readFile(new URL('../assets/rules.json', import.meta.url), 'utf8'))
    const rule = rules.find(item => item.id === 6)
    assert.deepEqual(rule.condition.requestMethods, ['post'])
    assert.deepEqual(rule.condition.resourceTypes, ['xmlhttprequest'])
    const pattern = new RegExp(rule.condition.regexFilter)
    const paths = ['session_svr/v1/session_svr/set_top', 'link_setting/v1/link_setting/set_msg_dnd', 'link_setting/v1/link_setting/set_push_ss', 'x/bplus/im/report/add']
    for (const path of paths) {
      assert.equal(pattern.test(`https://api.vc.bilibili.com/${path}`), true)
      assert.equal(pattern.test(`https://api.vc.bilibili.com/${path}?build=0`), true)
      assert.equal(pattern.test(`https://api.vc.bilibili.com/${path}/extra`), false)
      assert.equal(pattern.test(`https://example.com/?https://api.vc.bilibili.com/${path}`), false)
    }
    assert.equal(pattern.test('https://api.vc.bilibili.com/web_im/v1/web_im/send_msg?wts=1'), false)
    assert.equal(pattern.test('https://api.bilibili.com/x/relation/modify'), false)
    assert.deepEqual(rule.action.requestHeaders.map(item => [item.header, item.value]), [['origin', 'https://message.bilibili.com'], ['referer', 'https://message.bilibili.com/']])
  })

  check('menu detail reads accept only their required metadata and never forward message bodies', async () => {
    const { parsePrivateMessageResponse } = await import('../src/background/privateMessage/losslessJson')
    let payload = { code: 0, data: { talker_id: 2, session_type: 1, top_ts: 0, is_dnd: 0, last_msg: { content: 'fixture-private-text' } } }
    const api = await loadSourceModule('../src/background/privateMessage/sessionActions.ts', {
      './errors': await import('../src/background/privateMessage/errors'),
      './protocol': await import('../src/background/privateMessage/protocol'),
      './types': await import('../src/background/privateMessage/types'),
      './transport': { requestPrivateMessage: async () => parsePrivateMessageResponse(new Response(JSON.stringify(payload)), 'getPrivateSessionDetail') },
    })
    assert.deepEqual(JSON.parse(JSON.stringify(await api.getPrivateSessionDetail({ talkerId: '2', sessionType: 1 }))), { code: 0, data: { talker_id: '2', session_type: 1, top_ts: 0, is_dnd: 0 } })
    payload.data.talker_id = 3
    assert.notEqual((await api.getPrivateSessionDetail({ talkerId: '2', sessionType: 1 })).code, 0)
    payload = { code: -101 }
    assert.equal((await api.getPrivateSessionDetail({ talkerId: '2', sessionType: 1 })).code, -101)
  })

  check('private session actions use the published native payloads and reject malformed writes before transport', async () => {
    const requests = []
    const api = await loadSourceModule('../src/background/privateMessage/sessionActions.ts', {
      './errors': await import('../src/background/privateMessage/errors'),
      './protocol': await import('../src/background/privateMessage/protocol'),
      './types': await import('../src/background/privateMessage/types'),
      './transport': { requestPrivateMessageForm: async (request) => {
        requests.push(request)
        return { code: 0 }
      }, requestPrivateMessage: async () => ({ code: 0 }) },
    })
    const input = { talkerId: '2', sessionType: 1, uid: '1', enabled: true, csrf: 'fixture-csrf' }
    await api.setPrivateSessionTop(input)
    await api.setPrivateSessionDnd(input)
    await api.setPrivateSessionPush(input)
    assert.equal(requests[0].body.op_type, 0)
    assert.equal(requests[1].body.dnd_uid, '2')
    assert.equal(requests[1].body.setting, 1)
    assert.equal(requests[2].body.setting, 0)
    await api.setPrivateSessionDnd({ ...input, sessionType: 2, enabled: false })
    assert.equal(requests[3].body.dnd_group_id, '2')
    assert.equal(requests[3].body.setting, 0)
    assert.equal('dnd_uid' in requests[3].body, false)
    const count = requests.length
    await api.setPrivateSessionPush({ ...input, sessionType: 2 })
    await api.setPrivateSessionTop({ ...input, csrf: '' })
    await api.reportPrivateUser({ talkerId: '2', csrf: 'fixture', reason: 7, description: 'invalid', messageKeys: [] })
    assert.equal(requests.length, count)
    await api.reportPrivateUser({ talkerId: '2', csrf: 'fixture', reason: 4, description: 'Advertising harassment', messageKeys: ['18446744073709551615'] })
    const report = requests.at(-1)
    assert.equal(report.body.biz_code, 4)
    assert.equal(report.body.module, 607)
    assert.equal(report.body.accused_uid, '2')
    assert.equal(report.body.object_id, '2')
    assert.deepEqual(JSON.parse(report.body.extra), { msg_keys: ['18446744073709551615'] })
    assert.deepEqual(JSON.parse(report.body.comment), { group_id: 0, msg_key: '' })
    assert.equal(report.body.csrf, report.body.csrf_token)
  })

  check('conversation operations reconcile server state, isolate accounts, and never repeat an accepted unconfirmed write', async () => {
    const { usePrivateSessionActions } = await import('../src/contentScripts/views/Notifications/whisper/usePrivateSessionActions')
    const mid = Vue.ref('1')
    const scope = Vue.effectScope()
    const session = { key: '1:2', talkerId: '2', sessionType: 1, kind: 'user', name: 'Fixture' }
    const server = { talker_id: '2', session_type: 1, top_ts: 0, is_dnd: 0 }
    let push = 0
    let blocked = false
    let reconciled = 0
    let removed = 0
    let writes = 0
    let changeServer = true
    let reports = 0
    let release
    const owner = scope.run(() => usePrivateSessionActions(mid, {
      active: () => true,
      getCsrf: () => 'fixture-csrf',
      detail: async () => ({ code: 0, data: { ...server } }),
      settings: async () => ({ code: 0, data: { show_push_setting: 1, push_setting: push } }),
      relation: async () => ({ code: 0, data: blocked ? { 2: { attribute: 128 } } : {} }),
      mutate: async (action, input) => {
        writes++
        if (release === null)
          await new Promise(resolve => release = resolve)
        if (changeServer) {
          if (action === 'top')
            server.top_ts = input.enabled ? 100 : 0
          if (action === 'dnd')
            server.is_dnd = Number(input.enabled)
          if (action === 'push')
            push = input.enabled ? 0 : 1
        }
        return { code: 0 }
      },
      block: async () => {
        writes++
        blocked = true
        return { code: 0 }
      },
      report: async (input) => {
        reports++
        assert.deepEqual(input.messageKeys, ['21', '20'])
        assert.equal(input.reason, 4)
        return { code: 0 }
      },
      messages: async () => ({ code: 0, data: { messages: [{ msg_key: '21' }, { msg_key: '20' }] } }),
      reconcile: () => reconciled++,
      blocked: () => removed++,
    }))
    try {
      await owner.open(session)
      assert.equal(writes, 0, 'opening the menu is read-only')
      assert.equal(owner.state.ready, true, 'missing relation entries mean no relation, matching the shared relation reader')
      assert.equal(await owner.perform('top'), true)
      assert.equal(owner.state.pinned, true)
      assert.equal(await owner.perform('dnd'), true)
      assert.equal(owner.state.muted, true)
      assert.equal(await owner.perform('push'), true)
      assert.equal(owner.state.pushEnabled, false)
      changeServer = false
      assert.equal(await owner.perform('top'), false)
      assert.equal(owner.state.unconfirmed, true)
      const written = writes
      await owner.perform('top')
      assert.equal(writes, written)
      await owner.refresh()
      assert.equal(owner.state.unconfirmed, true, 'an unchanged readback must not unlock a repeated accepted mutation')
      server.top_ts = 0
      await owner.refresh()
      assert.equal(owner.state.unconfirmed, false)
      assert.equal(owner.state.pinned, false)
      assert.equal(await owner.perform('report', { reason: 4, description: 'Advertising' }), false)
      assert.equal(reports, 0, 'report evidence must be prepared before explicit submission')
      await owner.prepareReport()
      assert.equal(reports, 0)
      await owner.perform('report', { reason: 4, description: 'Advertising' })
      await owner.perform('report', { reason: 4, description: 'Advertising' })
      assert.equal(reports, 1)
      owner.close()
      await owner.open(session)
      await owner.perform('block')
      assert.equal(removed, 1)
      assert.equal(owner.state.blocked, true)
      owner.close()
      await owner.open(session)
      release = null
      const inFlight = owner.perform('dnd')
      const before = reconciled
      mid.value = '9'
      release()
      await inFlight
      assert.equal(reconciled, before, 'an old account cannot reconcile into a new account view')
      assert.equal(owner.state.target, null)
    }
    finally { scope.stop() }
  })

  check('optional push failures do not disable independent actions and rejected writes keep their API code', async () => {
    const { usePrivateSessionActions } = await import('../src/contentScripts/views/Notifications/whisper/usePrivateSessionActions')
    const scope = Vue.effectScope()
    const server = { talker_id: '2', session_type: 1, top_ts: 0, is_dnd: 0 }
    let reject = false
    let blocked = false
    let reports = 0
    const owner = scope.run(() => usePrivateSessionActions(Vue.ref('1'), {
      active: () => true,
      getCsrf: () => 'fixture',
      detail: async () => ({ code: 0, data: { ...server } }),
      settings: async () => { throw new Error('fixture unavailable') },
      relation: async () => ({ code: 0, data: blocked ? { 2: { attribute: 128 } } : {} }),
      mutate: async (action, input) => {
        if (reject)
          return { code: -111, bewlyError: { kind: 'api-error' } }
        if (action === 'top')
          server.top_ts = input.enabled ? 1 : 0
        else
          server.is_dnd = Number(input.enabled)
        return { code: 0 }
      },
      block: async () => {
        blocked = true
        return { code: 0 }
      },
      report: async () => {
        reports++
        return { code: 0 }
      },
      messages: async () => ({ code: 0, data: { messages: [] } }),
      reconcile() {},
      blocked() {},
    }))
    try {
      await owner.open({ talkerId: '2', sessionType: 1, kind: 'user', pinned: false, muted: false })
      assert.equal(owner.state.ready, true)
      assert.equal(owner.state.detailReady, true)
      assert.equal(owner.state.relationReady, true)
      assert.equal(owner.state.settingsReady, false)
      assert.equal(await owner.perform('top'), true)
      assert.equal(await owner.perform('dnd'), true)
      reject = true
      assert.equal(await owner.perform('top'), false)
      assert.equal(owner.state.errorCode, -111)
      assert.equal(owner.state.pinned, true)
      assert.equal(await owner.perform('block'), true)
      assert.equal(await owner.prepareReport(), true)
      assert.equal(await owner.perform('report', { reason: 4, description: 'Fixture only' }), true)
      assert.equal(reports, 1)
    }
    finally { scope.stop() }
  })
}
