import assert from 'node:assert/strict'
import process from 'node:process'

import { nextTick, ref } from 'vue'

import { storeWbiKeys } from '../src/background/wbiSign'
import type { APIClient } from '../src/utils/api'

if (false) {
  const api = null as unknown as APIClient
  void api.privateMessage.getPrivateSessions()
  void api.privateMessage.getPrivateUserCards({ uids: ['1'] })
  void api.privateMessage.getPrivateMessages({ talkerId: '1', endSeqno: '2' })
  void api.privateMessage.ackPrivateSession({ talkerId: '1', ackSeqno: '2', csrf: 'token' })
}

interface MockResponseOptions {
  contentType?: string
  redirected?: boolean
  status?: number
  url?: string
}

interface PrivateMessageModules {
  errors: typeof import('../src/background/privateMessage/errors')
  losslessJson: typeof import('../src/background/privateMessage/losslessJson')
  protocol: typeof import('../src/background/privateMessage/protocol')
  transport: typeof import('../src/background/privateMessage/transport')
  types: typeof import('../src/background/privateMessage/types')
  privateSession: typeof import('../src/contentScripts/views/Notifications/whisper/privateSession')
  usePrivateSessions: typeof import('../src/contentScripts/views/Notifications/whisper/usePrivateSessions')
}

const assertions: Array<{
  name: string
  run: (modules: PrivateMessageModules) => void | Promise<void>
}> = []

function verify(
  name: string,
  run: (modules: PrivateMessageModules) => void | Promise<void>,
) {
  assertions.push({ name, run })
}

function createMockResponse(text: string, options: MockResponseOptions = {}): Response {
  const status = options.status ?? 200
  return {
    headers: new Headers({ 'content-type': options.contentType ?? 'application/json' }),
    ok: status >= 200 && status < 300,
    redirected: options.redirected ?? false,
    status,
    text: async () => text,
    url: options.url ?? 'https://api.vc.bilibili.com/private-message-endpoint?removed=1',
  } as Response
}

async function loadModules(): Promise<PrivateMessageModules> {
  try {
    const [
      errors,
      losslessJson,
      protocol,
      transport,
      types,
      privateSession,
      usePrivateSessions,
    ] = await Promise.all([
      import('../src/background/privateMessage/errors'),
      import('../src/background/privateMessage/losslessJson'),
      import('../src/background/privateMessage/protocol'),
      import('../src/background/privateMessage/transport'),
      import('../src/background/privateMessage/types'),
      import('../src/contentScripts/views/Notifications/whisper/privateSession'),
      import('../src/contentScripts/views/Notifications/whisper/usePrivateSessions'),
    ])
    return {
      errors,
      losslessJson,
      protocol,
      transport,
      types,
      privateSession,
      usePrivateSessions,
    }
  }
  catch {
    assert.fail('private-message production modules must exist before verification can pass')
  }
}

verify('endpoints and request builders match the fixed Web IM contract', ({ protocol, types }) => {
  assert.deepEqual(types.PRIVATE_MESSAGE_ENDPOINTS, {
    getPrivateSessions: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
    getPrivateUserCards: 'https://api.vc.bilibili.com/account/v1/user/cards',
    getPrivateMessages: 'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
    ackPrivateSession: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack',
  })
  assert.deepEqual(protocol.buildPrivateSessionsParams(), {
    session_type: 1,
    group_fold: 1,
    unfollow_fold: 0,
    sort_rule: 2,
    size: 100,
    build: 0,
    mobi_app: 'web',
  })
  assert.deepEqual(protocol.buildPrivateUserCardsParams([
    '9223372036854775807',
    '42',
    '9223372036854775807',
  ]), {
    uids: '9223372036854775807,42',
    build: 0,
    mobi_app: 'web',
  })
})

verify('message request builder keeps first-page and older-history boundaries distinct', ({ protocol }) => {
  assert.deepEqual(protocol.buildPrivateMessagesParams({
    talkerId: '9223372036854775807',
  }), {
    talker_id: '9223372036854775807',
    session_type: 1,
    size: 20,
    sender_device_id: 1,
    build: 0,
    mobi_app: 'web',
  })
  assert.deepEqual(protocol.buildPrivateMessagesParams({
    talkerId: '9223372036854775807',
    endSeqno: '9223372036854775700',
  }), {
    talker_id: '9223372036854775807',
    session_type: 1,
    size: 20,
    sender_device_id: 1,
    build: 0,
    mobi_app: 'web',
    begin_seqno: '0',
    end_seqno: '9223372036854775700',
  })
})

verify('ACK request builder sends both CSRF fields and preserves seqno strings', ({ protocol }) => {
  assert.deepEqual(protocol.buildPrivateAckParams({
    talkerId: '9223372036854775807',
    ackSeqno: '9223372036854775799',
    csrf: 'sanitized-csrf',
  }), {
    talker_id: '9223372036854775807',
    session_type: 1,
    ack_seqno: '9223372036854775799',
    build: 0,
    mobi_app: 'web',
    csrf_token: 'sanitized-csrf',
    csrf: 'sanitized-csrf',
  })
})

verify('private-message WBI signing reuses the shared signer and adds wts/w_rid', async ({ transport }) => {
  storeWbiKeys(
    'https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN.png',
    'https://i0.hdslb.com/bfs/wbi/NMLKJIHGFEDCBA9876543210zyxwvutsrqponmlkjihgfedcba.png',
  )
  const original = { talker_id: '9223372036854775807', size: 20 }
  const signed = await transport.signPrivateMessageParams(original)
  assert.equal(signed.talker_id, original.talker_id)
  assert.equal(signed.size, original.size)
  assert.equal(typeof signed.wts, 'number')
  assert.match(String(signed.w_rid), /^[a-f\d]{32}$/)
  assert.equal(Object.hasOwn(original, 'wts'), false)
  assert.equal(Object.hasOwn(original, 'w_rid'), false)
})

verify('lossless parser preserves only confirmed IDs and seqnos as strings', async ({ losslessJson, protocol }) => {
  const rawSessionJson = `{"code":0,"data":{"session_list":[{"talker_id":9223372036854775807,"session_type":1,"at_seqno":0,"top_ts":1755000000000000,"group_name":"","group_cover":"","is_follow":0,"is_dnd":0,"ack_seqno":9223372036854775700,"ack_ts":1755000000000001,"session_ts":1755000000000002,"unread_count":3,"last_msg":{"sender_uid":9223372036854775806,"receiver_type":1,"receiver_id":9223372036854775807,"msg_type":1,"content":"sanitized","msg_seqno":9223372036854775799,"timestamp":1755000000,"at_uids":[],"msg_key":9223372036854775798,"msg_status":0,"notify_code":"","new_face_version":0,"msg_source":0},"group_type":0,"can_fold":0,"status":0,"max_seqno":9223372036854775799,"new_push_msg":0,"setting":0,"is_guardian":0,"is_intercept":0,"is_trust":0}]}}`
  const parsedSessions = protocol.parsePrivateSessionsResponse(
    await losslessJson.parsePrivateMessageResponse(createMockResponse(rawSessionJson), 'getPrivateSessions'),
  )
  assert.ok(parsedSessions)
  const session = parsedSessions.data.session_list[0]
  assert.equal(session?.talker_id, '9223372036854775807')
  assert.equal(session?.ack_seqno, '9223372036854775700')
  assert.equal(session?.max_seqno, '9223372036854775799')
  assert.equal(session?.last_msg?.sender_uid, '9223372036854775806')
  assert.equal(session?.last_msg?.msg_key, '9223372036854775798')
  assert.equal(typeof session?.session_ts, 'number')
  assert.equal(typeof session?.unread_count, 'number')
})

verify('message parser retains e_infos and numeric timestamps without ID precision loss', async ({ losslessJson, protocol }) => {
  const rawMessagesJson = `{"code":0,"data":{"messages":[{"sender_uid":9223372036854775806,"receiver_type":1,"receiver_id":9223372036854775807,"msg_type":1,"content":"sanitized","msg_seqno":9223372036854775799,"timestamp":1755000000,"at_uids":[],"msg_key":9223372036854775798,"msg_status":0,"notify_code":"","new_face_version":0,"msg_source":0}],"e_infos":[{"text":"sanitized"}]}}`
  const parsedMessages = protocol.parsePrivateMessagesResponse(
    await losslessJson.parsePrivateMessageResponse(createMockResponse(rawMessagesJson), 'getPrivateMessages'),
  )
  assert.ok(parsedMessages)
  const message = parsedMessages.data.messages[0]
  assert.equal(message?.sender_uid, '9223372036854775806')
  assert.equal(message?.receiver_id, '9223372036854775807')
  assert.equal(message?.msg_seqno, '9223372036854775799')
  assert.equal(message?.msg_key, '9223372036854775798')
  assert.equal(typeof message?.timestamp, 'number')
  assert.deepEqual(parsedMessages.data.e_infos, [{ text: 'sanitized' }])
})

verify('transport errors are structured without raw response data', async ({ errors, losslessJson, transport }) => {
  const login = await losslessJson.parsePrivateMessageResponse(createMockResponse(
    '{"code":-101,"message":"not logged in","data":null}',
  ), 'getPrivateSessions')
  assert.equal(login.bewlyError?.kind, 'login-required')

  const loginRedirect = await losslessJson.parsePrivateMessageResponse(createMockResponse(
    '{"code":0,"data":null}',
    {
      redirected: true,
      url: 'https://passport.bilibili.com/login?removed=1',
    },
  ), 'getPrivateSessions')
  assert.equal(loginRedirect.bewlyError?.kind, 'login-required')

  const risk = await losslessJson.parsePrivateMessageResponse(createMockResponse(
    '<html>risk control</html>',
    { contentType: 'text/html', status: 412 },
  ), 'getPrivateMessages')
  assert.equal(risk.bewlyError?.kind, 'risk-control')

  const server = await losslessJson.parsePrivateMessageResponse(createMockResponse(
    '<html>unavailable</html>',
    { contentType: 'text/html', status: 503 },
  ), 'ackPrivateSession')
  assert.equal(server.bewlyError?.kind, 'server-error')

  const invalid = await losslessJson.parsePrivateMessageResponse(createMockResponse(
    '<html>not found</html>',
    { contentType: 'text/html', status: 404 },
  ), 'getPrivateUserCards')
  assert.equal(invalid.bewlyError?.kind, 'invalid-response')

  const api = await losslessJson.parsePrivateMessageResponse(createMockResponse(
    '{"code":-400,"message":"invalid","data":null}',
  ), 'getPrivateMessages')
  assert.equal(api.bewlyError?.kind, 'api-error')

  const network = await transport.requestPrivateMessage({
    endpointName: 'getPrivateSessions',
    params: {},
    url: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
  }, {
    fetch: async () => { throw new TypeError('sensitive network detail') },
    signParams: async params => ({ ...params, wts: 1, w_rid: 'signed' }),
  })
  assert.equal(network.bewlyError?.kind, 'network')

  let fetchAfterWbiFailure = 0
  const wbiUnavailable = await transport.requestPrivateMessage({
    endpointName: 'getPrivateSessions',
    params: {},
    url: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
  }, {
    fetch: async () => {
      fetchAfterWbiFailure++
      return createMockResponse('{"code":0,"data":null}')
    },
    signParams: () => Promise.reject(new errors.PrivateMessageWbiUnavailableError()),
  })
  assert.equal(wbiUnavailable.bewlyError?.kind, 'wbi-unavailable')
  assert.equal(fetchAfterWbiFailure, 0)

  await assert.rejects(
    () => transport.signPrivateMessageParams({}, {
      addWbiSign: params => params,
      initWbiKeys: async () => false,
    }),
    (error: unknown) => errors.isPrivateMessageWbiUnavailableError(error),
  )

  for (const response of [login, loginRedirect, risk, server, invalid, api, network, wbiUnavailable]) {
    assert.equal(Object.hasOwn(response, 'raw'), false)
    assert.equal(Object.hasOwn(response.bewlyError ?? {}, 'url'), false)
    assert.equal(Object.hasOwn(response.bewlyError ?? {}, 'stack'), false)
  }
})

function createRawSession(
  talkerId: string,
  overrides: Partial<import('../src/background/privateMessage/types').PrivateSession> = {},
): import('../src/background/privateMessage/types').PrivateSession {
  return {
    talker_id: talkerId,
    session_type: 1,
    at_seqno: 0,
    top_ts: 0,
    group_name: '',
    group_cover: '',
    is_follow: 0,
    is_dnd: 0,
    ack_seqno: '9223372036854775700',
    ack_ts: 1755000000000000,
    session_ts: 1755000000000001,
    unread_count: 0,
    last_msg: {
      sender_uid: talkerId,
      receiver_type: 1,
      receiver_id: '1',
      msg_type: 1,
      content: '{"content":"sanitized summary"}',
      msg_seqno: '9223372036854775799',
      timestamp: 1755000000,
      at_uids: [],
      msg_key: '9223372036854775798',
      msg_status: 0,
      notify_code: '',
      new_face_version: 0,
      msg_source: 0,
    },
    group_type: 0,
    can_fold: 0,
    status: 0,
    max_seqno: '9223372036854775799',
    new_push_msg: 0,
    setting: 0,
    is_guardian: 0,
    is_intercept: 0,
    is_trust: 0,
    ...overrides,
  }
}

function createSessionsResponse(
  sessions: import('../src/background/privateMessage/types').PrivateSession[],
) {
  return {
    code: 0,
    data: {
      session_list: sessions,
    },
  }
}

function createCardsResponse(cards: Array<{ face: string, mid: string, name: string }>) {
  return {
    code: 0,
    data: cards,
  }
}

verify('session transform preserves IDs and maps cards, flags, unread, and summaries', ({ privateSession }) => {
  const raw = createRawSession('9223372036854775807', {
    top_ts: 1755000000000002,
    is_dnd: 1,
    is_follow: 1,
    unread_count: 7,
  })
  const [display] = privateSession.transformPrivateSessions(
    [raw],
    createCardsResponse([{
      mid: '9223372036854775807',
      name: 'Sanitized User',
      face: 'https://i0.hdslb.com/sanitized-avatar.webp',
    }]),
  )

  assert.ok(display)
  assert.equal(display.key, '1:9223372036854775807')
  assert.equal(display.talkerId, '9223372036854775807')
  assert.equal(display.name, 'Sanitized User')
  assert.equal(display.avatar, 'https://i0.hdslb.com/sanitized-avatar.webp')
  assert.equal(display.summary, 'sanitized summary')
  assert.equal(display.timestamp, 1755000000000001)
  assert.equal(display.unreadCount, 7)
  assert.equal(display.ackSeqno, '9223372036854775700')
  assert.equal(display.maxSeqno, '9223372036854775799')
  assert.equal(display.pinned, true)
  assert.equal(display.muted, true)
  assert.equal(display.followed, true)
  assert.equal(display.original, raw)
})

verify('session helpers batch and dedupe UIDs while preserving server order', ({ privateSession }) => {
  const sessions = [
    createRawSession('30', { top_ts: 3 }),
    createRawSession('20'),
    createRawSession('30', { unread_count: 9 }),
    createRawSession('10'),
  ]
  assert.deepEqual(privateSession.collectPrivateSessionUids(sessions), ['30', '20', '10'])

  const display = privateSession.transformPrivateSessions(sessions, createCardsResponse([]))
  assert.deepEqual(display.map(item => item.talkerId), ['30', '20', '10'])
  assert.equal(display[0]?.pinned, true)
})

verify('local session filters combine all, unread, pinned, and username search', ({ privateSession }) => {
  const items = privateSession.transformPrivateSessions([
    createRawSession('1', { group_name: 'Alpha', unread_count: 2 }),
    createRawSession('2', { group_name: 'Beta', top_ts: 1 }),
    createRawSession('3', { group_name: 'Gamma' }),
  ], createCardsResponse([]))

  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'all', query: 'a' }).map(item => item.talkerId),
    ['1', '2', '3'],
  )
  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'unread', query: '' }).map(item => item.talkerId),
    ['1'],
  )
  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'pinned', query: 'bet' }).map(item => item.talkerId),
    ['2'],
  )
  assert.equal(privateSession.normalizePrivateSessionLocale('jyut'), 'zh-HK')
})

verify('automatic session merge updates head data without discarding existing rows', ({ privateSession }) => {
  const previous = privateSession.transformPrivateSessions([
    createRawSession('1', { group_name: 'Old Alpha' }),
    createRawSession('2', { group_name: 'Beta' }),
  ], createCardsResponse([]))
  const incoming = privateSession.transformPrivateSessions([
    createRawSession('3', { group_name: 'Gamma', top_ts: 1 }),
    createRawSession('1', { group_name: 'New Alpha', unread_count: 4 }),
  ], createCardsResponse([]))

  const merged = privateSession.mergePrivateSessions(previous, incoming)
  assert.deepEqual(merged.map(item => item.talkerId), ['3', '1', '2'])
  assert.equal(merged[1]?.name, 'New Alpha')
  assert.equal(merged[1]?.unreadCount, 4)
})

verify('session controller is single-flight and drops old-account responses', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  let resolveFirst: ((value: unknown) => void) | undefined
  let sessionRequestCount = 0
  const firstResponse = new Promise<unknown>((resolve) => {
    resolveFirst = resolve
  })
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => {
      sessionRequestCount++
      if (sessionRequestCount === 1)
        return firstResponse
      return createSessionsResponse([createRawSession('300')])
    },
    fetchUserCards: async uids => createCardsResponse(
      uids.map(uid => ({ mid: uid, name: `User ${uid}`, face: '' })),
    ),
  })

  const firstLoad = controller.loadInitial()
  const repeatedLoad = controller.loadInitial()
  assert.equal(sessionRequestCount, 1)

  mid.value = '200'
  await nextTick()
  resolveFirst?.(createSessionsResponse([createRawSession('999')]))
  await Promise.all([firstLoad, repeatedLoad])
  assert.equal(controller.state.items.length, 0)

  await controller.loadInitial()
  assert.equal(sessionRequestCount, 2)
  assert.deepEqual(controller.state.items.map(item => item.talkerId), ['300'])
  assert.equal(controller.state.items[0]?.name, 'User 300')
})

verify('manual session refresh replaces while automatic refresh merges', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  const pages = [
    [createRawSession('1'), createRawSession('2')],
    [createRawSession('3')],
    [createRawSession('4')],
  ]
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse(pages.shift() ?? []),
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  await controller.refresh('merge')
  assert.deepEqual(controller.state.items.map(item => item.talkerId), ['3', '1', '2'])

  await controller.refresh('replace')
  assert.deepEqual(controller.state.items.map(item => item.talkerId), ['4'])
})

verify('authoritative DM unread changes trigger one merge refresh per observed value', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  let requests = 0
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => {
      requests++
      return createSessionsResponse([createRawSession(String(requests))])
    },
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.observeUnreadCount(0)
  assert.equal(requests, 1)
  await controller.observeUnreadCount(0)
  assert.equal(requests, 1)
  await controller.observeUnreadCount(2)
  assert.equal(requests, 2)
  await controller.observeUnreadCount(2)
  assert.equal(requests, 2)
  assert.deepEqual(controller.state.items.map(item => item.talkerId), ['2', '1'])
})

async function main() {
  const modules = await loadModules()
  const failed: string[] = []

  for (const assertion of assertions) {
    try {
      await assertion.run(modules)
      console.log(`PASS ${assertion.name}`)
    }
    catch (error) {
      failed.push(assertion.name)
      console.error(`FAIL ${assertion.name}`)
      console.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (failed.length > 0) {
    console.error(`Private-message verification failed: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

void main()
