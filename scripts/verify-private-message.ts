import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

import { nextTick, ref } from 'vue'

import { storeWbiKeys } from '../src/background/wbiSign'
import type { APIClient } from '../src/utils/api'

if (false) {
  const api = null as unknown as APIClient
  void api.privateMessage.getPrivateSessions()
  void api.privateMessage.getOlderPrivateSessions({ endTs: 1755000000000000 })
  void api.privateMessage.getNewPrivateSessions({ beginTs: 1755000000000000 })
  void api.privateMessage.getPrivateUserCards({ uids: ['1'] })
  void api.privateMessage.getPrivateMessages({ talkerId: '1', endSeqno: '2' })
  void api.privateMessage.ackPrivateSession({ talkerId: '1', ackSeqno: '2', csrf: 'token' })
  void api.privateMessage.sendPrivateMessage({ senderId: '1', talkerId: '2', text: 'hello', csrf: 'token' })
  void api.privateMessage.uploadPrivateImage({
    requestId: 'request-1',
    fileName: 'image.png',
    mimeType: 'image/png',
    bytes: [1, 2, 3],
    csrf: 'token',
  })
  void api.privateMessage.sendPrivateImageMessage({
    senderId: '1',
    talkerId: '2',
    csrf: 'token',
    uploaded: {
      url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
      width: 1,
      height: 1,
      size: 3,
      imageType: 'png',
    },
  })
  void api.privateMessage.cancelPrivateImageUpload({ requestId: 'request-1' })
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
  privateMessage: typeof import('../src/contentScripts/views/Notifications/whisper/privateMessage')
  usePrivateSessions: typeof import('../src/contentScripts/views/Notifications/whisper/usePrivateSessions')
  usePrivateMessages: typeof import('../src/contentScripts/views/Notifications/whisper/usePrivateMessages')
  privateConversationRoute: typeof import('../src/utils/privateConversationRoute')
  notificationSections: typeof import('../src/contentScripts/views/Notifications/notificationSections')
  topBarSharedRefresh: typeof import('../src/stores/topBarSharedRefresh')
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

interface PrivateMessageRendererFixture {
  msg_type: number
  content: string
  e_infos?: unknown[]
  [key: string]: unknown
}

async function readRendererFixture(name: string): Promise<PrivateMessageRendererFixture> {
  const fixtureUrl = new URL(`../tests/fixtures/private-message/renderers/${name}.json`, import.meta.url)
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as PrivateMessageRendererFixture
}

async function readRuntimeFixture(name: string): Promise<unknown> {
  const fixtureUrl = new URL(`../tests/fixtures/private-message/runtime/${name}.json`, import.meta.url)
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as unknown
}

async function readSessionKindFixture(name: string): Promise<unknown> {
  const fixtureUrl = new URL(`../tests/fixtures/private-message/session-kinds/${name}.json`, import.meta.url)
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as unknown
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
      privateMessage,
      usePrivateSessions,
      usePrivateMessages,
      privateConversationRoute,
      notificationSections,
      topBarSharedRefresh,
    ] = await Promise.all([
      import('../src/background/privateMessage/errors'),
      import('../src/background/privateMessage/losslessJson'),
      import('../src/background/privateMessage/protocol'),
      import('../src/background/privateMessage/transport'),
      import('../src/background/privateMessage/types'),
      import('../src/contentScripts/views/Notifications/whisper/privateSession'),
      import('../src/contentScripts/views/Notifications/whisper/privateMessage'),
      import('../src/contentScripts/views/Notifications/whisper/usePrivateSessions'),
      import('../src/contentScripts/views/Notifications/whisper/usePrivateMessages'),
      import('../src/utils/privateConversationRoute'),
      import('../src/contentScripts/views/Notifications/notificationSections'),
      import('../src/stores/topBarSharedRefresh'),
    ])
    return {
      errors,
      losslessJson,
      protocol,
      transport,
      types,
      privateSession,
      privateMessage,
      usePrivateSessions,
      usePrivateMessages,
      privateConversationRoute,
      notificationSections,
      topBarSharedRefresh,
    }
  }
  catch {
    assert.fail('private-message production modules must exist before verification can pass')
  }
}

verify('private conversation routes only preserve validated session identity', ({ privateConversationRoute }) => {
  const listUrl = 'https://www.bilibili.com/?page=Notifications&notificationView=whisper'
  const conversationUrl = privateConversationRoute.buildPrivateConversationUrl({
    talkerId: '90071992547409931234',
    sessionType: 1,
  })
  const parsedUrl = new URL(conversationUrl)

  assert.deepEqual(privateConversationRoute.parsePrivateConversationRoute(conversationUrl), {
    talkerId: '90071992547409931234',
    sessionType: 1,
  })
  assert.equal(parsedUrl.searchParams.get('page'), 'Notifications')
  assert.equal(parsedUrl.searchParams.get('notificationView'), 'whisper')
  assert.equal(parsedUrl.searchParams.get('notificationTalker'), '90071992547409931234')
  assert.equal(parsedUrl.searchParams.get('notificationSessionType'), '1')
  assert.deepEqual([...parsedUrl.searchParams.keys()], [
    'page',
    'notificationView',
    'notificationTalker',
    'notificationSessionType',
  ])
  assert.deepEqual(privateConversationRoute.parsePrivateConversationRoute(
    `${listUrl}&notificationTalker=42&notificationSessionType=2`,
  ), { talkerId: '42', sessionType: 2 })
  assert.equal(privateConversationRoute.clearPrivateConversationRoute(conversationUrl), listUrl)
})

verify('invalid private conversation route values safely fall back to the list route', ({ privateConversationRoute }) => {
  const listUrl = 'https://www.bilibili.com/?page=Notifications&notificationView=whisper'
  for (const query of [
    'notificationTalker=&notificationSessionType=1',
    'notificationTalker=-1&notificationSessionType=1',
    'notificationTalker=1e3&notificationSessionType=1',
    'notificationTalker=constructor&notificationSessionType=1',
    'notificationTalker=42',
    'notificationSessionType=1',
    'notificationTalker=42&notificationSessionType=0',
    'notificationTalker=42&notificationSessionType=1.5',
    'notificationTalker=42&notificationSessionType=3',
  ]) {
    const url = `${listUrl}&${query}`
    assert.equal(privateConversationRoute.parsePrivateConversationRoute(url), null, query)
    assert.equal(privateConversationRoute.clearPrivateConversationRoute(url), listUrl, query)
  }
  assert.equal(privateConversationRoute.parsePrivateConversationRoute('not a valid absolute URL'), null)
})

verify('settings original frame cannot mutate unread state', ({ notificationSections }) => {
  assert.equal(notificationSections.canOriginalNotificationMutateUnread('settings'), false)
  assert.equal(notificationSections.canOriginalNotificationMutateUnread('whisper'), true)
  assert.equal(notificationSections.canOriginalNotificationMutateUnread('system'), true)
})

verify('shared refresh retries one transient failure without exposing the raw error', async ({ topBarSharedRefresh }) => {
  let attempts = 0
  const diagnostics: unknown[] = []
  const result = await topBarSharedRefresh.runSharedRefreshRequest(
    'getWatchLaterCount',
    async () => {
      attempts++
      if (attempts === 1)
        throw new TypeError('Failed to fetch sensitive stack')
      return true
    },
    {
      report: diagnostic => diagnostics.push(diagnostic),
      wait: async () => {},
    },
  )
  assert.equal(result, true)
  assert.equal(attempts, 2)
  assert.deepEqual(diagnostics, [])
})

verify('shared unread leaves settle independently and require all successes', async ({ topBarSharedRefresh }) => {
  const executed: string[] = []
  const result = await topBarSharedRefresh.settleSharedRefreshTasks([
    async () => {
      executed.push('message')
      return false
    },
    async () => {
      executed.push('dm')
      return true
    },
  ])
  assert.deepEqual(executed.sort(), ['dm', 'message'])
  assert.equal(result, false)
})

verify('failed shared refresh releases its lease without publishing a fresh snapshot', async ({ topBarSharedRefresh }) => {
  let released = 0
  let published = 0
  const result = await topBarSharedRefresh.completeSharedRefreshLease({
    refresh: async () => false,
    isCurrent: () => true,
    release: async () => { released++ },
    publish: async () => { published++ },
  })
  assert.equal(result, false)
  assert.equal(released, 1)
  assert.equal(published, 0)
})

verify('shared refresh production wiring is concurrent, gated, and free of raw Error logging', async () => {
  const [storeSource, helperSource, frameSource, sectionSource, brokerSource] = await Promise.all([
    readFile(new URL('../src/stores/topBarStore.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/stores/topBarSharedRefresh.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/OriginalNotificationsFrame.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/notificationSections.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/background/topBarStateBroker.ts', import.meta.url), 'utf8'),
  ])
  const unreadStart = storeSource.indexOf('async function getUnreadMessageCount')
  const unreadEnd = storeSource.indexOf('// B币和大会员经验领取状态检查', unreadStart)
  const unreadSource = storeSource.slice(unreadStart, unreadEnd)
  const watchStart = storeSource.indexOf('async function getWatchLaterCount')
  const watchEnd = storeSource.indexOf('// 获取稍后再看列表', watchStart)
  const watchSource = storeSource.slice(watchStart, watchEnd)

  assert.ok(unreadSource.includes('settleTopBarSharedRefreshTasks'))
  assert.ok(unreadSource.includes(`'getUnreadMsg'`))
  assert.ok(unreadSource.includes(`'getUnreadDm'`))
  assert.equal(unreadSource.includes('console.error'), false)
  assert.equal(watchSource.includes('console.error'), false)
  assert.equal(helperSource.includes('console.error'), false)
  assert.ok(helperSource.includes('Promise.allSettled'))
  assert.ok(frameSource.includes('canOriginalNotificationMutateUnread(props.view)'))
  assert.ok(sectionSource.includes(`value === 'whisper' || value === 'system'`))
  assert.equal((brokerSource.match(/entry\.updatedAt = Date\.now\(\)/g) ?? []).length, 1)
})

verify('endpoints and request builders match the fixed Web IM contract', ({ protocol, types }) => {
  assert.deepEqual(types.PRIVATE_MESSAGE_ENDPOINTS, {
    uploadPrivateImage: 'https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs',
    getPrivateSessions: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
    getNewPrivateSessions: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/new_sessions',
    getPrivateUserCards: 'https://api.vc.bilibili.com/account/v1/user/cards',
    getPrivateMessages: 'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
    ackPrivateSession: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack',
    sendPrivateMessage: 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg',
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
  assert.deepEqual(protocol.buildPrivateSessionsParams({ endTs: 1755000000000000 }), {
    session_type: 1,
    group_fold: 1,
    unfollow_fold: 0,
    sort_rule: 2,
    size: 100,
    build: 0,
    mobi_app: 'web',
    end_ts: 1755000000000000,
  })
  assert.deepEqual(protocol.buildNewPrivateSessionsParams({ beginTs: 1755000000000100 }), {
    begin_ts: 1755000000000100,
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

verify('text send builder creates a flat bracket form with UUID, seconds, JSON content, and dual CSRF', ({ protocol }) => {
  const params = protocol.createPrivateTextMessageParams({
    senderId: '9223372036854775806',
    talkerId: '9223372036854775807',
    text: 'hello\nworld',
    csrf: 'sanitized-csrf',
  }, {
    now: () => 1755000000123,
    randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
  })

  assert.deepEqual(params, {
    'msg[sender_uid]': '9223372036854775806',
    'msg[receiver_id]': '9223372036854775807',
    'msg[receiver_type]': 1,
    'msg[msg_type]': 1,
    'msg[msg_status]': 0,
    'msg[dev_id]': '123e4567-e89b-42d3-a456-426614174000',
    'msg[timestamp]': 1755000000,
    'msg[new_face_version]': 1,
    'msg[content]': '{"content":"hello\\nworld"}',
    from_firework: 0,
    build: 0,
    mobi_app: 'web',
    csrf_token: 'sanitized-csrf',
    csrf: 'sanitized-csrf',
  })
  assert.match(String(params['msg[dev_id]']), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  assert.equal(typeof params['msg[timestamp]'], 'number')
})

verify('image upload builder uses file_up, biz=im, csrf, and parses fixed upload fields', ({ protocol }) => {
  const file = new File([new Uint8Array([1, 2, 3])], 'sanitized.png', { type: 'image/png' })
  const form = protocol.buildPrivateImageUploadForm(file, 'sanitized-csrf')
  const uploadedFile = form.get('file_up')

  assert.ok(uploadedFile instanceof File)
  assert.equal(uploadedFile.name, 'sanitized.png')
  assert.equal(uploadedFile.type, 'image/png')
  assert.equal(form.get('biz'), 'im')
  assert.equal(form.get('csrf'), 'sanitized-csrf')
  assert.equal(protocol.getPrivateImageType('image/jpeg'), 'jpg')
  assert.equal(protocol.getPrivateImageType('image/png'), 'png')
  assert.equal(protocol.getPrivateImageType('image/gif'), 'gif')
  assert.equal(protocol.getPrivateImageType('image/webp'), 'webp')
  assert.equal(protocol.getPrivateImageType('image/svg+xml'), 'svg')
  assert.throws(() => protocol.getPrivateImageType('application/pdf'))

  assert.deepEqual(protocol.parsePrivateImageUploadResponse({
    code: 0,
    data: {
      image_url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
      image_height: 720,
      image_width: 1280,
      img_size: 4096,
    },
  }, 'png'), {
    code: 0,
    data: {
      url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
      height: 720,
      width: 1280,
      size: 4096,
      imageType: 'png',
    },
  })
})

verify('image send builder creates msg_type two content with upload metadata and shared WBI-ready fields', ({ protocol }) => {
  const params = protocol.createPrivateImageMessageParams({
    senderId: '9223372036854775806',
    talkerId: '9223372036854775807',
    csrf: 'sanitized-csrf',
    uploaded: {
      url: 'https://i0.hdslb.com/bfs/im/sanitized.webp',
      width: 1280,
      height: 720,
      size: 4096,
      imageType: 'webp',
    },
  }, {
    now: () => 1755000000123,
    randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
  })

  assert.equal(params['msg[msg_type]'], 2)
  assert.equal(params['msg[sender_uid]'], '9223372036854775806')
  assert.equal(params['msg[receiver_id]'], '9223372036854775807')
  assert.equal(params.csrf_token, 'sanitized-csrf')
  assert.equal(params.csrf, 'sanitized-csrf')
  assert.deepEqual(JSON.parse(String(params['msg[content]'])), {
    url: 'https://i0.hdslb.com/bfs/im/sanitized.webp',
    height: 720,
    width: 1280,
    imageType: 'webp',
    original: 1,
    size: 4096,
  })
})

verify('multipart upload transport does not set a multipart boundary and preserves the abort signal', async ({ transport }) => {
  let capturedInit: RequestInit | undefined
  const controller = new AbortController()
  const response = await transport.requestPrivateImageUpload({
    endpointName: 'uploadPrivateImage',
    form: new FormData(),
    url: 'https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs',
  }, {
    fetch: async (_url, init) => {
      capturedInit = init
      return createMockResponse('{"code":0,"data":{"image_url":"https://i0.hdslb.com/bfs/im/sanitized.png","image_height":1,"image_width":1,"img_size":3}}')
    },
  }, undefined, controller.signal)

  assert.equal(response.code, 0)
  assert.equal(capturedInit?.method, 'POST')
  assert.ok(capturedInit?.body instanceof FormData)
  assert.equal(Object.keys(capturedInit?.headers as Record<string, string>).some(key => key.toLowerCase() === 'content-type'), false)
  assert.equal(capturedInit?.signal, controller.signal)
})

verify('form transport signs the flat send body and posts it as form-urlencoded', async ({ transport }) => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const response = await transport.requestPrivateMessageForm({
    endpointName: 'sendPrivateMessage',
    params: {
      'msg[sender_uid]': '100',
      'msg[receiver_id]': '200',
      'msg[dev_id]': '123e4567-e89b-42d3-a456-426614174000',
      'msg[content]': '{"content":"hello"}',
    },
    url: 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg',
  }, {
    fetch: async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init
      return createMockResponse('{"code":0,"data":{"msg_key":9223372036854775807}}')
    },
    signParams: async params => ({ ...params, wts: 1755000000, w_rid: 'signed-rid' }),
  })

  assert.equal(response.code, 0)
  assert.equal((response.data as { msg_key?: string }).msg_key, '9223372036854775807')
  assert.equal(capturedUrl, 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg')
  assert.equal(capturedInit?.method, 'POST')
  assert.equal((capturedInit?.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded')
  const form = new URLSearchParams(String(capturedInit?.body))
  assert.equal(form.get('msg[sender_uid]'), '100')
  assert.equal(form.get('msg[receiver_id]'), '200')
  assert.equal(form.get('msg[dev_id]'), '123e4567-e89b-42d3-a456-426614174000')
  assert.equal(form.get('msg[content]'), '{"content":"hello"}')
  assert.equal(form.get('wts'), '1755000000')
  assert.equal(form.get('w_rid'), 'signed-rid')
})

verify('lossless parser preserves only confirmed IDs and seqnos as strings', async ({ losslessJson, protocol }) => {
  const rawSessionJson = `{"code":0,"data":{"has_more":1,"session_list":[{"talker_id":9223372036854775807,"session_type":1,"at_seqno":0,"top_ts":1755000000000000,"group_name":"","group_cover":"","is_follow":0,"is_dnd":0,"ack_seqno":9223372036854775700,"ack_ts":1755000000000001,"session_ts":1755000000000002,"unread_count":3,"last_msg":{"sender_uid":9223372036854775806,"receiver_type":1,"receiver_id":9223372036854775807,"msg_type":1,"content":"sanitized","msg_seqno":9223372036854775799,"timestamp":1755000000,"at_uids":[],"msg_key":9223372036854775798,"msg_status":0,"notify_code":"","new_face_version":0,"msg_source":0},"group_type":0,"can_fold":0,"status":0,"max_seqno":9223372036854775799,"new_push_msg":0,"setting":0,"is_guardian":0,"is_intercept":0,"is_trust":0}]}}`
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
  assert.equal(parsedSessions.data.has_more, 1)
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

verify('private session parser keeps valid rows and normalizes nullable real response fields', async ({ protocol }) => {
  const parsed = protocol.parsePrivateSessionsResponse(
    await readRuntimeFixture('sessions-mixed') as import('../src/background/privateMessage/types').PrivateMessageApiResponse,
  )
  assert.ok(parsed)
  assert.equal(parsed.data.session_list.length, 4)
  assert.deepEqual(parsed.data.session_list.map(session => session.session_type), [1, 1, 2, 1])
  assert.deepEqual(parsed.data.session_list[0]?.last_msg?.at_uids, [])
  assert.equal(parsed.data.session_list[0]?.last_msg?.notify_code, '')
  assert.equal(parsed.data.session_list[1]?.last_msg?.new_face_version, 0)
  assert.equal(parsed.data.session_list[1]?.last_msg?.msg_source, 0)
  assert.equal(parsed.data.session_list[1]?.system_msg_type, 7)
  assert.equal(parsed.data.session_list[1]?.account_info?.name, 'Sanitized Assistant')
  assert.equal(parsed.data.session_list[3]?.last_msg, null)
})

verify('private list parsers accept null collections and skip only malformed rows', async ({ protocol }) => {
  const emptySessions = protocol.parsePrivateSessionsResponse(
    await readRuntimeFixture('sessions-null') as import('../src/background/privateMessage/types').PrivateMessageApiResponse,
  )
  const mixedMessages = protocol.parsePrivateMessagesResponse(
    await readRuntimeFixture('messages-mixed') as import('../src/background/privateMessage/types').PrivateMessageApiResponse,
  )
  const emptyMessages = protocol.parsePrivateMessagesResponse(
    await readRuntimeFixture('messages-null') as import('../src/background/privateMessage/types').PrivateMessageApiResponse,
  )
  assert.deepEqual(emptySessions?.data.session_list, [])
  assert.equal(mixedMessages?.data.messages.length, 2)
  assert.deepEqual(mixedMessages?.data.e_infos, [])
  assert.deepEqual(mixedMessages?.data.messages[0]?.at_uids, [])
  assert.equal(mixedMessages?.data.messages[0]?.notify_code, '')
  assert.equal(mixedMessages?.data.messages[1]?.new_face_version, 0)
  assert.equal(mixedMessages?.data.messages[1]?.msg_source, 0)
  assert.deepEqual(emptyMessages?.data.messages, [])
  assert.deepEqual(emptyMessages?.data.e_infos, [])
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
    is_follow: 1,
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
    system_msg_type: 0,
    account_info: null,
    live_status: 0,
    biz_msg_unread_count: 0,
    ...overrides,
  }
}

function createSessionsResponse(
  sessions: import('../src/background/privateMessage/types').PrivateSession[],
  hasMore = 0,
) {
  return {
    code: 0,
    data: {
      session_list: sessions,
      has_more: hasMore,
    },
  }
}

function createCardsResponse(cards: Array<{ face: string, mid: string, name: string }>) {
  return {
    code: 0,
    data: cards,
  }
}

function createRawMessage(
  msgKey: string,
  seqno: string,
  overrides: Partial<import('../src/background/privateMessage/types').PrivateMessage> = {},
): import('../src/background/privateMessage/types').PrivateMessage {
  return {
    sender_uid: '200',
    receiver_type: 1,
    receiver_id: '100',
    msg_type: 1,
    content: JSON.stringify({ content: `message ${msgKey}` }),
    msg_seqno: seqno,
    timestamp: 1755000000,
    at_uids: [],
    msg_key: msgKey,
    msg_status: 0,
    notify_code: '',
    new_face_version: 0,
    msg_source: 0,
    ...overrides,
  }
}

function createMessagesResponse(
  messages: import('../src/background/privateMessage/types').PrivateMessage[],
  eInfos: unknown[] = [],
) {
  return {
    code: 0,
    data: {
      messages,
      e_infos: eInfos,
    },
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

verify('session identity keeps the same talker separate across session types', ({ privateSession }) => {
  const display = privateSession.transformPrivateSessions([
    createRawSession('30', { session_type: 1 }),
    createRawSession('30', { session_type: 2 }),
  ], createCardsResponse([]))
  assert.deepEqual(display.map(item => item.key), ['1:30', '2:30'])
})

verify('session selection uses a composite key and clears with the active account', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse([
      createRawSession('30', { session_type: 1 }),
      createRawSession('30', { session_type: 2 }),
    ]),
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => createSessionsResponse([]),
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  controller.selectSession(controller.state.items[0]!)
  assert.equal(controller.selectedSessionKey.value, '1:30')
  assert.equal(controller.selectedTalkerId.value, '30')

  controller.clearSelectedSession()
  assert.equal(controller.selectedSessionKey.value, '')
  assert.equal(controller.selectedTalkerId.value, '')

  controller.selectSession(controller.state.items[0]!)
  mid.value = '200'
  await nextTick()
  assert.equal(controller.selectedSessionKey.value, '')
  assert.equal(controller.selectedTalkerId.value, '')
})

verify('user card response shapes are optional enhancements with stable fallbacks', ({ privateSession }) => {
  const session = createRawSession('42', { group_name: 'Group fallback' })
  const cardsArray = privateSession.transformPrivateSessions([session], {
    code: 0,
    data: { cards: [{ mid: '42', name: 'Cards array user', face: 'https://i0.hdslb.com/cards-array.png' }] },
  })
  const keyedCards = privateSession.transformPrivateSessions([session], {
    code: 0,
    data: { 42: { mid: '42', name: 'Keyed user', avatar: 'https://i0.hdslb.com/keyed.png' } },
  })
  const fallback = privateSession.transformPrivateSessions(
    [createRawSession('43')],
    { code: -1, data: null },
    talkerId => `User ${talkerId}`,
  )
  assert.equal(cardsArray[0]?.name, 'Cards array user')
  assert.equal(keyedCards[0]?.name, 'Keyed user')
  assert.equal(keyedCards[0]?.avatar, 'https://i0.hdslb.com/keyed.png')
  assert.equal(fallback[0]?.name, 'User 43')
})

verify('user card batches are best effort and never block the primary session list', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  const sessions = Array.from({ length: 31 }, (_, index) => createRawSession(String(index + 1), {
    group_name: `Fallback ${index + 1}`,
  }))
  const requestedChunks: string[][] = []
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse(sessions),
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => createSessionsResponse([]),
    fetchUserCards: async (uids) => {
      requestedChunks.push(uids)
      if (requestedChunks.length === 1)
        throw new TypeError('sanitized profile enhancement failure')
      return {
        code: 0,
        data: { 31: { mid: '31', name: 'Enhanced 31', face: '' } },
      }
    },
    getFallbackName: talkerId => `User ${talkerId}`,
  })

  await controller.loadInitial()
  assert.deepEqual(requestedChunks.map(chunk => chunk.length), [30, 1])
  assert.equal(controller.state.errorKind, null)
  assert.equal(controller.state.items.length, 31)
  assert.equal(controller.state.items[0]?.name, 'Fallback 1')
  assert.equal(controller.state.items[30]?.name, 'Enhanced 31')

  const allFailed = usePrivateSessions.usePrivateSessions(ref('200'), {
    fetchSessions: async () => createSessionsResponse([createRawSession('55', { group_name: 'Still visible' })]),
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => createSessionsResponse([]),
    fetchUserCards: async () => { throw new TypeError('sanitized profile enhancement failure') },
  })
  await allFailed.loadInitial()
  assert.equal(allFailed.state.errorKind, null)
  assert.equal(allFailed.state.items[0]?.name, 'Still visible')
})

verify('local session filters combine all, unread, pinned, and username search', ({ privateSession }) => {
  const items = privateSession.transformPrivateSessions([
    createRawSession('1', { group_name: 'Alpha', unread_count: 2 }),
    createRawSession('2', { group_name: 'Beta', top_ts: 1 }),
    createRawSession('3', { group_name: 'Gamma' }),
  ], createCardsResponse([]))

  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'all', typeFilter: 'all', query: 'a' }).map(item => item.talkerId),
    ['1', '2', '3'],
  )
  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'unread', typeFilter: 'all', query: '' }).map(item => item.talkerId),
    ['1'],
  )
  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'pinned', typeFilter: 'all', query: 'bet' }).map(item => item.talkerId),
    ['2'],
  )
  assert.equal(privateSession.normalizePrivateSessionLocale('jyut'), 'zh-HK')
  assert.equal(privateSession.isNativePrivateSession(items[0]!), true)
  const [fallbackItem] = privateSession.transformPrivateSessions([
    createRawSession('4', { is_follow: 0 }),
  ], createCardsResponse([]))
  assert.equal(privateSession.isNativePrivateSession(fallbackItem!), false)
})

verify('session-kind fixtures enforce classification, capabilities, profiles, and original fallback', async ({ privateSession, protocol }) => {
  const fixtureCases = [
    ['user', 'user'],
    ['up-assistant', 'official-assistant'],
    ['customer-service', 'official-assistant'],
    ['unfollowed-user', 'unfollowed-user'],
    ['intercepted-user', 'intercepted-user'],
    ['fan-group', 'fan-group'],
    ['unsupported', 'unsupported'],
  ] as const
  const items: import('../src/contentScripts/views/Notifications/whisper/privateSession').DisplayPrivateSession[] = []

  for (const [fixtureName, expectedKind] of fixtureCases) {
    const fixture = await readSessionKindFixture(fixtureName)
    const parsed = protocol.parsePrivateSessionsResponse(fixture as import('../src/background/privateMessage/types').PrivateMessageApiResponse)
    assert.ok(parsed, fixtureName)
    const [item] = privateSession.transformPrivateSessions(parsed.data.session_list, { code: 0, data: [] })
    assert.ok(item, fixtureName)
    assert.equal(item.kind, expectedKind, fixtureName)
    items.push(item)
  }

  const [user, upAssistant, customerService, ...fallbackItems] = items
  assert.equal(privateSession.getPrivateSessionProfileUrl(user!), 'https://space.bilibili.com/1000000000000001')
  assert.equal(user?.capabilities.canReadNative, true)
  assert.equal(user?.capabilities.canAck, true)
  assert.equal(user?.capabilities.canOpenProfile, true)
  assert.equal(user?.capabilities.canSendText, false)
  assert.equal(user?.capabilities.canSendImage, false)

  assert.equal(upAssistant?.assistantType, 'up-assistant')
  assert.equal(upAssistant?.name, 'Sanitized UP Assistant')
  assert.equal(upAssistant?.avatar, 'https://i0.hdslb.com/bfs/face/sanitized-up-assistant.webp')
  assert.equal(customerService?.assistantType, 'customer-service')
  assert.equal(privateSession.getOfficialAssistantType(1), 'streamer-assistant')
  assert.equal(privateSession.getOfficialAssistantType(7), 'up-assistant')
  assert.equal(privateSession.getOfficialAssistantType(8), 'customer-service')
  assert.equal(privateSession.getOfficialAssistantType(9), 'payment-assistant')
  assert.equal(privateSession.getOfficialAssistantType(99), 'official-assistant')
  assert.equal(privateSession.getOfficialAssistantType(0), null)
  const [invalidSystemType] = privateSession.transformPrivateSessions([
    createRawSession('8', { system_msg_type: -1 }),
  ], createCardsResponse([]))
  assert.equal(invalidSystemType?.kind, 'unsupported')
  for (const assistant of [upAssistant, customerService]) {
    assert.equal(assistant?.capabilities.canReadNative, true)
    assert.equal(assistant?.capabilities.canAck, true)
    assert.equal(assistant?.capabilities.canOpenProfile, false)
    assert.equal(privateSession.getPrivateSessionProfileUrl(assistant!), '')
  }

  for (const item of fallbackItems) {
    assert.equal(item.capabilities.canReadNative, false)
    assert.equal(item.capabilities.canAck, false)
    assert.equal(item.capabilities.canOpenProfile, false)
    assert.equal(item.capabilities.canOpenOriginal, true)
  }
  assert.equal(items.every(item => !item.capabilities.canPin), true)
  assert.equal(items.every(item => !item.capabilities.canMute), true)
  assert.equal(items.every(item => !item.capabilities.canRemove), true)
})

verify('session type filter composes with unread, pinned, and search filters', ({ privateSession }) => {
  const items = privateSession.transformPrivateSessions([
    createRawSession('1', { group_name: 'Alpha', unread_count: 2 }),
    createRawSession('2', { system_msg_type: 7, account_info: { name: 'Creator Helper', pic_url: '' }, top_ts: 1 }),
    createRawSession('3', { is_follow: 0, group_name: 'Other Alpha', unread_count: 3 }),
    createRawSession('4', { session_type: 2, group_name: 'Fan Group' }),
  ], createCardsResponse([]))

  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'all', typeFilter: 'user', query: '' }).map(item => item.talkerId),
    ['1'],
  )
  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'pinned', typeFilter: 'official-assistant', query: '' }).map(item => item.talkerId),
    ['2'],
  )
  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'unread', typeFilter: 'other', query: 'alpha' }).map(item => item.talkerId),
    ['3'],
  )
  assert.deepEqual(
    privateSession.filterPrivateSessions(items, { filter: 'all', typeFilter: 'other', query: '' }).map(item => item.talkerId),
    ['3', '4'],
  )
})

verify('confirmed private-message source values map to weak display identifiers only', ({ privateMessage }) => {
  const sources = [8, 11, 13, 17, 18, 19, 7]
  const display = privateMessage.transformPrivateMessages(
    sources.map((msgSource, index) => createRawMessage(
      String(index + 1),
      String(index + 1),
      { msg_source: msgSource },
    )),
    [],
    '100',
  )
  assert.deepEqual(display.map(item => item.source), [
    'auto-reply',
    'auto-reply',
    'fan-group-system',
    'mutual-follow',
    'system',
    'ai',
    null,
  ])
})

verify('private-session UI consumes type filters, assistant labels, profile links, and source labels', async () => {
  const [listSource, itemSource, conversationSource, messageSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationListItem.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/PrivateMessageItem.vue', import.meta.url), 'utf8'),
  ])
  assert.ok(listSource.includes('PrivateSessionTypeFilter'))
  assert.ok(listSource.includes('typeFilter'))
  assert.ok(itemSource.includes('session.assistantType'))
  assert.ok(conversationSource.includes('getPrivateSessionProfileUrl'))
  assert.ok(conversationSource.includes(':href="profileUrl"'))
  assert.ok(itemSource.includes(':href="originalUrl"'))
  assert.ok(messageSource.includes('message.source'))

  for (const localeName of ['cmn-CN', 'cmn-TW', 'en', 'jyut']) {
    const localeSource = await readFile(new URL(`../src/_locales/${localeName}.yml`, import.meta.url), 'utf8')
    for (const key of [
      'type_filters:',
      'up-assistant:',
      'customer-service:',
      'message_sources:',
      'auto-reply:',
      'fan-group-system:',
      'mutual-follow:',
    ]) {
      assert.ok(localeSource.includes(key), `${localeName}: ${key}`)
    }
  }
})

verify('session kinds and capabilities keep native reads separate from disabled writes', ({ privateSession }) => {
  const items = privateSession.transformPrivateSessions([
    createRawSession('1'),
    createRawSession('2', {
      system_msg_type: 7,
      account_info: {
        name: 'Sanitized Assistant',
        pic_url: 'https://i0.hdslb.com/assistant.png',
      },
    }),
    createRawSession('3', { is_intercept: 1 }),
    createRawSession('4', { is_follow: 0 }),
    createRawSession('5', { can_fold: 1 }),
    createRawSession('6', { session_type: 2 }),
    createRawSession('7', { session_type: 99 }),
  ], createCardsResponse([
    { mid: '2', name: 'Card must not override assistant', face: 'https://i0.hdslb.com/card.png' },
  ]), talkerId => `User ${talkerId}`)

  assert.deepEqual(items.map(item => item.kind), [
    'user',
    'official-assistant',
    'intercepted-user',
    'unfollowed-user',
    'unfollowed-user',
    'fan-group',
    'unsupported',
  ])
  assert.equal(items[1]?.name, 'Sanitized Assistant')
  assert.equal(items[1]?.avatar, 'https://i0.hdslb.com/assistant.png')
  assert.equal(items[0]?.capabilities.canReadNative, true)
  assert.equal(items[0]?.capabilities.canAck, true)
  assert.equal(items[0]?.capabilities.canOpenProfile, true)
  assert.equal(items[1]?.capabilities.canReadNative, true)
  assert.equal(items[1]?.capabilities.canAck, true)
  assert.equal(items[1]?.capabilities.canOpenProfile, false)
  assert.equal(items.every(item => !item.capabilities.canSendText), true)
  assert.equal(items.every(item => !item.capabilities.canSendImage), true)
  assert.equal(items.every(item => !item.capabilities.canPin), true)
  assert.equal(items.every(item => !item.capabilities.canMute), true)
  assert.equal(items.every(item => !item.capabilities.canRemove), true)
  assert.equal(privateSession.isNativePrivateSession(items[0]!), true)
  assert.equal(privateSession.isNativePrivateSession(items[1]!), true)
  assert.equal(items.slice(2).every(item => !privateSession.isNativePrivateSession(item)), true)
})

verify('whisper is a workspace hybrid and native writes are unreachable from the page shell', async ({ notificationSections }) => {
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.whisper.implementation, 'hybrid')
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.whisper.layout, 'workspace')
  assert.equal(notificationSections.isHybridNotificationView('whisper'), true)
  assert.equal(notificationSections.isOriginalFrameCapableView('whisper'), true)
  assert.equal(notificationSections.isOriginalOnlyNotificationView('whisper'), false)
  assert.equal(notificationSections.isOriginalOnlyNotificationView('settings'), true)
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.reply.layout, 'document')

  const notificationsSource = await readFile(
    new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url),
    'utf8',
  )
  const conversationSource = await readFile(
    new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url),
    'utf8',
  )
  for (const writeDependency of [
    'sendPrivateMessage',
    'uploadPrivateImage',
    'cancelPrivateImageUpload',
    'sendPrivateImageMessage',
  ]) {
    assert.equal(notificationsSource.includes(writeDependency), false, writeDependency)
  }
  assert.equal(
    conversationSource.includes('v-if="session.capabilities.canSendText || session.capabilities.canSendImage"'),
    true,
  )
  assert.equal(conversationSource.includes('notifications.whisper.messages.readonly'), true)
})

verify('original-fallback sessions keep available avatars instead of always using initials', async () => {
  const source = await readFile(
    new URL('../src/contentScripts/views/Notifications/whisper/ConversationListItem.vue', import.meta.url),
    'utf8',
  )
  assert.equal(
    (source.match(/v-if="session\.avatar && !avatarFailed"/g) ?? []).length,
    2,
  )
})

verify('all locales expose private-message-specific failures and the read-only fallback', async () => {
  const localeNames = ['cmn-CN', 'cmn-TW', 'en', 'jyut']
  const requiredKeys = [
    'login-required:',
    'risk-control:',
    'server-error:',
    'network:',
    'invalid-response:',
    'api-error:',
    'wbi-unavailable:',
  ]
  for (const localeName of localeNames) {
    const source = await readFile(new URL(`../src/_locales/${localeName}.yml`, import.meta.url), 'utf8')
    const whisperStart = source.indexOf('  whisper:\n', source.indexOf('notifications:\n'))
    const nativeStart = source.indexOf('  native:\n', whisperStart)
    const whisperSource = source.slice(whisperStart, nativeStart)
    for (const key of requiredKeys)
      assert.ok(whisperSource.includes(`      ${key}`), `${localeName} ${key}`)
    assert.ok(whisperSource.includes('user_fallback:'), `${localeName} user_fallback`)
    assert.ok(whisperSource.includes('readonly:'), `${localeName} readonly`)
  }
})

verify('runtime response fixtures are sanitized and preserve only confirmed real shapes', async () => {
  const fixtureNames = ['sessions-mixed', 'sessions-null', 'messages-mixed', 'messages-null']
  for (const fixtureName of fixtureNames) {
    const fixtureUrl = new URL(`../tests/fixtures/private-message/runtime/${fixtureName}.json`, import.meta.url)
    const source = await readFile(fixtureUrl, 'utf8')
    assert.equal(/SESSDATA|bili_jct|csrf|cookie/i.test(source), false, fixtureName)
    assert.equal(/https?:\/\/[^"\s]+\?/i.test(source), false, fixtureName)
  }
  const sessions = await readRuntimeFixture('sessions-mixed') as {
    data?: { session_list?: unknown[] }
  }
  const messages = await readRuntimeFixture('messages-mixed') as {
    data?: { e_infos?: unknown, messages?: unknown[] }
  }
  assert.equal(sessions.data?.session_list?.length, 5)
  assert.equal(messages.data?.messages?.length, 3)
  assert.equal(messages.data?.e_infos, null)
})

verify('authenticated history and ACK fixtures preserve the real pagination boundary and unread closure', async ({ privateMessage, protocol }) => {
  const fixtureNames = [
    'messages-real-first',
    'messages-real-older',
    'ack-real-success',
    'unread-real-before',
    'unread-real-after',
  ]
  const sources = await Promise.all(fixtureNames.map(async (fixtureName) => {
    const fixtureUrl = new URL(`../tests/fixtures/private-message/runtime/${fixtureName}.json`, import.meta.url)
    return readFile(fixtureUrl, 'utf8')
  }))
  for (const [index, source] of sources.entries()) {
    assert.equal(/SESSDATA|bili_jct|csrf|cookie/i.test(source), false, fixtureNames[index])
    assert.equal(/https?:\/\/[^"\s]+\?/i.test(source), false, fixtureNames[index])
  }

  const [firstRaw, olderRaw, ack, unreadBefore, unreadAfter] = await Promise.all(
    fixtureNames.map(readRuntimeFixture),
  ) as [
    import('../src/background/privateMessage/types').PrivateMessageApiResponse,
    import('../src/background/privateMessage/types').PrivateMessageApiResponse,
    { code?: unknown },
    { code?: unknown, data?: Record<string, unknown> },
    { code?: unknown, data?: Record<string, unknown> },
  ]
  const first = protocol.parsePrivateMessagesResponse(firstRaw)
  const older = protocol.parsePrivateMessagesResponse(olderRaw)
  assert.ok(first)
  assert.ok(older)
  assert.equal(first.code, 0)
  assert.equal(older.code, 0)
  assert.equal(first.data.messages.length, 20)
  assert.equal(older.data.messages.length, 20)
  assert.equal(first.data.e_infos.length, 1)
  assert.equal(older.data.e_infos.length, 4)
  assert.equal(first.data.messages.every(message => message.msg_seqno.length === 16), true)
  assert.equal(older.data.messages.every(message => message.msg_seqno.length === 16), true)
  assert.equal(first.data.messages.every(message => message.msg_key.length === 19), true)
  assert.equal(older.data.messages.every(message => message.msg_key.length === 19), true)
  for (const messages of [first.data.messages, older.data.messages]) {
    assert.equal(messages.every((message, index) => (
      index === 0
      || privateMessage.comparePrivateMessageSeqno(messages[index - 1]!.msg_seqno, message.msg_seqno) > 0
    )), true)
    assert.equal(messages.every((message, index) => (
      index === 0 || messages[index - 1]!.timestamp > message.timestamp
    )), true)
  }

  const firstDisplay = privateMessage.transformPrivateMessages(first.data.messages, first.data.e_infos, '8000000000000000001')
  const olderDisplay = privateMessage.transformPrivateMessages(older.data.messages, older.data.e_infos, '8000000000000000001')
  const firstBoundary = privateMessage.getOldestPrivateMessageSeqno(firstDisplay)
  assert.ok(firstBoundary)
  assert.equal(
    olderDisplay.every(message => privateMessage.comparePrivateMessageSeqno(message.seqno, firstBoundary) < 0),
    true,
  )
  const merged = privateMessage.mergePrivateMessages(firstDisplay, olderDisplay)
  assert.equal(merged.length, 40)
  assert.equal(new Set(merged.map(message => message.msgKey)).size, 40)

  assert.equal(ack.code, 0)
  assert.equal(unreadBefore.code, 0)
  assert.equal(unreadAfter.code, 0)
  assert.equal(unreadBefore.data?.follow_unread, 1)
  assert.equal(unreadAfter.data?.follow_unread, 0)
  assert.equal(unreadAfter.data?.unfollow_unread, unreadBefore.data?.unfollow_unread)
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

verify('older session pages append new rows and update duplicates in place', ({ privateSession }) => {
  const current = privateSession.transformPrivateSessions([
    createRawSession('1', { group_name: 'Alpha', session_ts: 300 }),
    createRawSession('2', { group_name: 'Old Beta', session_ts: 200 }),
  ], createCardsResponse([]))
  const older = privateSession.transformPrivateSessions([
    createRawSession('2', { group_name: 'Updated Beta', session_ts: 200, unread_count: 3 }),
    createRawSession('3', { group_name: 'Gamma', session_ts: 100 }),
  ], createCardsResponse([]))

  const appended = privateSession.appendPrivateSessions(current, older)
  assert.deepEqual(appended.map(item => item.key), ['1:1', '1:2', '1:3'])
  assert.equal(appended[1]?.name, 'Updated Beta')
  assert.equal(appended[1]?.unreadCount, 3)
  assert.deepEqual(privateSession.getPrivateSessionTimeBounds(appended), {
    newestSessionTs: 300,
    oldestSessionTs: 100,
  })
})

verify('session pagination advances only after success and stops a repeated end_ts', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  const olderBoundaries: number[] = []
  const olderPages = [
    createSessionsResponse([
      createRawSession('2', { group_name: 'Updated Beta', session_ts: 200, unread_count: 2 }),
      createRawSession('3', { group_name: 'Gamma', session_ts: 100 }),
    ], 1),
    createSessionsResponse([
      createRawSession('3', { group_name: 'Gamma', session_ts: 100 }),
    ], 1),
    createSessionsResponse([], 0),
  ]
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse([
      createRawSession('1', { group_name: 'Alpha', session_ts: 300 }),
      createRawSession('2', { group_name: 'Beta', session_ts: 200 }),
    ], 1),
    fetchOlderSessions: async (endTs) => {
      olderBoundaries.push(endTs)
      return olderPages.shift()
    },
    fetchNewSessions: async () => createSessionsResponse([]),
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  assert.equal(controller.state.oldestSessionTs, 200)
  assert.equal(controller.state.newestSessionTs, 300)
  assert.equal(controller.state.loadedPageCount, 1)
  assert.equal(controller.state.noMore, false)

  await controller.loadMore()
  assert.deepEqual(controller.state.items.map(item => item.key), ['1:1', '1:2', '1:3'])
  assert.equal(controller.state.items[1]?.name, 'Updated Beta')
  assert.equal(controller.state.oldestSessionTs, 100)
  assert.equal(controller.state.loadedPageCount, 2)

  await controller.loadMore()
  assert.equal(controller.state.paginationStalled, true)
  assert.equal(controller.state.failedOperation, 'load-more')
  assert.equal(controller.state.errorKind, 'invalid-response')
  assert.deepEqual(olderBoundaries, [200, 100])

  await controller.loadMore({ retry: true })
  assert.equal(controller.state.paginationStalled, false)
  assert.equal(controller.state.noMore, true)
  assert.equal(controller.state.failedOperation, null)
  assert.deepEqual(olderBoundaries, [200, 100, 100])
})

verify('failed older-session requests preserve the successful pagination boundary', async ({ usePrivateSessions }) => {
  const boundaries: number[] = []
  const olderResponses = [
    { code: -500, data: null },
    createSessionsResponse([createRawSession('2', { session_ts: 100 })], 0),
  ]
  const controller = usePrivateSessions.usePrivateSessions(ref('100'), {
    fetchSessions: async () => createSessionsResponse([
      createRawSession('1', { session_ts: 200 }),
    ], 1),
    fetchOlderSessions: async (endTs) => {
      boundaries.push(endTs)
      return olderResponses.shift()
    },
    fetchNewSessions: async () => createSessionsResponse([]),
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  await controller.loadMore()
  assert.equal(controller.state.oldestSessionTs, 200)
  assert.equal(controller.state.loadedPageCount, 1)
  assert.equal(controller.state.failedOperation, 'load-more')

  await controller.loadMore({ retry: true })
  assert.deepEqual(boundaries, [200, 200])
  assert.equal(controller.state.oldestSessionTs, 100)
  assert.equal(controller.state.loadedPageCount, 2)
  assert.equal(controller.state.noMore, true)
})

verify('manual replace invalidates an in-flight older-session response', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  const firstPages = [
    createSessionsResponse([createRawSession('1', { session_ts: 300 })], 1),
    createSessionsResponse([createRawSession('9', { session_ts: 900 })], 0),
  ]
  let resolveOlder: ((value: unknown) => void) | undefined
  const olderResponse = new Promise<unknown>((resolve) => {
    resolveOlder = resolve
  })
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => firstPages.shift(),
    fetchOlderSessions: async () => olderResponse,
    fetchNewSessions: async () => createSessionsResponse([]),
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  const olderRequest = controller.loadMore()
  await controller.refresh()
  resolveOlder?.(createSessionsResponse([createRawSession('2', { session_ts: 200 })], 0))
  await olderRequest

  assert.deepEqual(controller.state.items.map(item => item.key), ['1:9'])
  assert.equal(controller.state.loadingMore, false)
  assert.equal(controller.state.loadedPageCount, 1)
})

verify('an in-flight replace blocks incremental and older session requests', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  let firstPageRequests = 0
  let incrementalRequests = 0
  let olderRequests = 0
  let resolveReplacement: ((value: unknown) => void) | undefined
  const replacementResponse = new Promise<unknown>((resolve) => {
    resolveReplacement = resolve
  })
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => {
      firstPageRequests++
      return firstPageRequests === 1
        ? createSessionsResponse([createRawSession('1', { session_ts: 300 })], 1)
        : replacementResponse
    },
    fetchOlderSessions: async () => {
      olderRequests++
      return createSessionsResponse([], 0)
    },
    fetchNewSessions: async () => {
      incrementalRequests++
      return createSessionsResponse([])
    },
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  const replacement = controller.refresh()
  const incremental = controller.refreshNew()
  const older = controller.loadMore()
  assert.equal(incrementalRequests, 0)
  assert.equal(olderRequests, 0)
  resolveReplacement?.(createSessionsResponse([createRawSession('9', { session_ts: 900 })], 0))
  await Promise.all([replacement, incremental, older])
  assert.deepEqual(controller.state.items.map(item => item.key), ['1:9'])
})

verify('new sessions merge at the head with a single-flight begin_ts request', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  const beginBoundaries: number[] = []
  let resolveIncremental: ((value: unknown) => void) | undefined
  const incrementalResponse = new Promise<unknown>((resolve) => {
    resolveIncremental = resolve
  })
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse([
      createRawSession('1', { group_name: 'Old Alpha', session_ts: 300 }),
      createRawSession('2', { group_name: 'Beta', session_ts: 200 }),
    ], 1),
    fetchOlderSessions: async () => createSessionsResponse([
      createRawSession('4', { group_name: 'Historical', session_ts: 100 }),
    ], 0),
    fetchNewSessions: async (beginTs) => {
      beginBoundaries.push(beginTs)
      return incrementalResponse
    },
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  await controller.loadMore()
  const first = controller.refreshNew()
  const repeated = controller.refreshNew()
  assert.deepEqual(beginBoundaries, [300])
  resolveIncremental?.(createSessionsResponse([
    createRawSession('3', { group_name: 'Gamma', session_ts: 400 }),
    createRawSession('1', { group_name: 'New Alpha', session_ts: 350, unread_count: 5 }),
  ]))
  await Promise.all([first, repeated])

  assert.deepEqual(controller.state.items.map(item => item.key), ['1:3', '1:1', '1:2', '1:4'])
  assert.equal(controller.state.items[1]?.name, 'New Alpha')
  assert.equal(controller.state.newestSessionTs, 400)
  assert.equal(controller.state.oldestSessionTs, 100)
  assert.equal(controller.state.loadedPageCount, 2)
  assert.equal(controller.state.noMore, true)
})

verify('private user-card cache is TTL-bound, best effort, and cleared by MID changes', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  let now = 1_000
  let firstPage = [createRawSession('1', { session_ts: 300 })]
  let incremental = [createRawSession('2', { session_ts: 400 })]
  const requestedChunks: string[][] = []
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse(firstPage),
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => createSessionsResponse(incremental),
    fetchUserCards: async (uids) => {
      requestedChunks.push(uids)
      return createCardsResponse(uids.map(uid => ({
        mid: uid,
        name: `Cached ${uid}`,
        face: `https://i0.hdslb.com/${uid}.png`,
      })))
    },
    now: () => now,
  })

  await controller.loadInitial()
  await controller.refreshNew()
  assert.deepEqual(requestedChunks, [['1'], ['2']])

  incremental = [createRawSession('1', { session_ts: 500 })]
  await controller.refreshNew()
  assert.deepEqual(requestedChunks, [['1'], ['2']])

  now += usePrivateSessions.PRIVATE_SESSION_USER_CARD_CACHE_TTL_MS + 1
  await controller.refreshNew()
  assert.deepEqual(requestedChunks, [['1'], ['2'], ['1']])

  mid.value = '200'
  await nextTick()
  firstPage = [createRawSession('1', { session_ts: 600 })]
  await controller.loadInitial()
  assert.deepEqual(requestedChunks, [['1'], ['2'], ['1'], ['1']])
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
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => createSessionsResponse([]),
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
  const firstPages = [
    [createRawSession('1'), createRawSession('2')],
    [createRawSession('4')],
  ]
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse(firstPages.shift() ?? []),
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => createSessionsResponse([createRawSession('3')]),
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  await controller.refreshNew()
  assert.deepEqual(controller.state.items.map(item => item.talkerId), ['3', '1', '2'])

  await controller.refresh()
  assert.deepEqual(controller.state.items.map(item => item.talkerId), ['4'])
  assert.equal(controller.state.loadedPageCount, 1)
  assert.equal(controller.state.noMore, true)
})

verify('authoritative DM unread changes trigger one merge refresh per observed value', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  let initialRequests = 0
  let incrementalRequests = 0
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => {
      initialRequests++
      return createSessionsResponse([createRawSession('1')])
    },
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => {
      incrementalRequests++
      return createSessionsResponse([createRawSession('2', { session_ts: 1755000000000002 })])
    },
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.observeUnreadCount(0)
  assert.equal(initialRequests, 1)
  await controller.observeUnreadCount(0)
  assert.equal(incrementalRequests, 0)
  await controller.observeUnreadCount(2)
  assert.equal(incrementalRequests, 1)
  await controller.observeUnreadCount(2)
  assert.equal(incrementalRequests, 1)
  assert.deepEqual(controller.state.items.map(item => item.talkerId), ['2', '1'])
})

verify('visibility refresh uses a finite TTL while whisper activation always checks new sessions', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  let now = 1_000
  let incrementalRequests = 0
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse([
      createRawSession('1', { session_ts: 300 }),
    ]),
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => {
      incrementalRequests++
      return createSessionsResponse([])
    },
    fetchUserCards: async () => createCardsResponse([]),
    now: () => now,
  })

  await controller.loadInitial()
  await controller.refreshIfStale()
  assert.equal(incrementalRequests, 0)

  now += usePrivateSessions.PRIVATE_SESSION_VISIBILITY_STALE_TIME_MS + 1
  await controller.refreshIfStale()
  assert.equal(incrementalRequests, 1)

  await controller.activate(0)
  assert.equal(incrementalRequests, 2)
})

verify('conversation list wires one bottom sentinel and localized loaded-list scope', async () => {
  const [listSource, workspaceSource, notificationsSource, ...localeSources] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
    ...['cmn-CN', 'cmn-TW', 'en', 'jyut'].map(locale => (
      readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8')
    )),
  ])

  assert.equal((listSource.match(/new IntersectionObserver/g) ?? []).length, 1)
  assert.ok(listSource.includes('conversation-list__sentinel'))
  assert.ok(listSource.includes(`emit('loadMore')`))
  assert.ok(listSource.includes(`emit('retryLoadMore')`))
  assert.ok(listSource.includes(`notifications.whisper.search_scope`))
  assert.ok(listSource.includes('onBeforeUnmount(disconnectObserver)'))
  assert.ok(workspaceSource.includes(`document.addEventListener('visibilitychange'`))
  assert.ok(workspaceSource.includes('controller.refreshIfStale()'))
  assert.ok(notificationsSource.includes('getOlderPrivateSessions'))
  assert.ok(notificationsSource.includes('getNewPrivateSessions'))
  assert.equal(`${listSource}\n${workspaceSource}\n${notificationsSource}`.includes('setInterval('), false)
  for (const localeSource of localeSources) {
    assert.ok(localeSource.includes('search_scope:'))
    assert.ok(localeSource.includes('loading_more_sessions:'))
    assert.ok(localeSource.includes('earliest_session:'))
    assert.ok(localeSource.includes('load_more_failed:'))
  }
})

verify('whisper conversation routing reuses route state and never guesses original deep links', async () => {
  const [notificationsSource, workspaceSource, itemSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationListItem.vue', import.meta.url), 'utf8'),
  ])

  assert.ok(notificationsSource.includes('parsePrivateConversationRoute'))
  assert.ok(notificationsSource.includes('buildPrivateConversationUrl'))
  assert.ok(notificationsSource.includes('clearPrivateConversationRoute'))
  assert.ok(notificationsSource.includes('privateSessions.selectedSessionKey'))
  assert.ok(notificationsSource.includes(`watch(() => routeState.navigationId`))
  assert.ok(notificationsSource.includes('window.history.pushState'))
  assert.ok(notificationsSource.includes('window.history.replaceState'))
  assert.ok(notificationsSource.includes('watch(currentMid'))
  assert.ok(workspaceSource.includes(`emit('selectSession'`))
  assert.ok(workspaceSource.includes(`emit('closeConversation'`))
  assert.ok(itemSource.includes('notifications.whisper.open_original_list'))
  assert.equal(notificationsSource.includes(`addEventListener('popstate'`), false)
  assert.equal(workspaceSource.includes(`addEventListener('popstate'`), false)
  assert.equal([notificationsSource, workspaceSource, itemSource].some(source => /#\/whisper\//.test(source)), false)
})

verify('mobile whisper master-detail preserves scroll and focus with reduced-motion support', async () => {
  const [workspaceSource, listSource, itemSource, conversationSource, ...localeSources] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationListItem.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    ...['cmn-CN', 'cmn-TW', 'en', 'jyut'].map(locale => (
      readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8')
    )),
  ])

  assert.ok(workspaceSource.includes(`'whisper-workspace--detail': Boolean(nativeSelectedSession)`))
  assert.ok(workspaceSource.includes('breakpoints.$mobile-max'))
  assert.ok(workspaceSource.includes('translateX(100%)'))
  assert.ok(workspaceSource.includes('translateX(-100%)'))
  assert.ok(workspaceSource.includes('var(--bew-duration-normal)'))
  assert.ok(workspaceSource.includes('@media (prefers-reduced-motion: reduce)'))
  assert.ok(workspaceSource.includes('listScrollTop'))
  assert.ok(workspaceSource.includes('restoreScrollTop'))
  assert.ok(workspaceSource.includes('focusSession'))
  assert.ok(listSource.includes('defineExpose'))
  assert.ok(listSource.includes('getScrollTop'))
  assert.ok(listSource.includes('restoreScrollTop'))
  assert.ok(listSource.includes('focusSession'))
  assert.ok(itemSource.includes(':data-session-key="session.key"'))
  assert.ok(conversationSource.includes('conversation-view__back'))
  assert.ok(conversationSource.includes('focusHeading'))
  assert.ok(conversationSource.includes('@keydown.esc="handleEscape"'))
  assert.ok(conversationSource.includes('LAYOUT_BREAKPOINTS.mobileMax'))
  assert.equal(conversationSource.includes(`window.addEventListener('keydown'`), false)
  for (const localeSource of localeSources)
    assert.ok(localeSource.includes('back_to_conversations:'))
})

verify('private message parser supports text, image, recall, custom emoji, tip, and safe unknown fallback', ({ privateMessage }) => {
  const eInfos = [{
    text: '[smile]',
    uri: 'https://i0.hdslb.com/sanitized-emoji.png',
    gif_url: 'https://i0.hdslb.com/sanitized-emoji.gif',
    size: 2,
  }]
  const raw = [
    createRawMessage('1', '101', { content: '{"content":"hello [smile]"}' }),
    createRawMessage('2', '102', {
      msg_type: 2,
      content: '{"url":"https://i0.hdslb.com/sanitized-image.jpg","width":640,"height":360}',
    }),
    createRawMessage('3', '103', { msg_type: 5, content: '{}' }),
    createRawMessage('4', '104', {
      msg_type: 6,
      content: '{"url":"https://i0.hdslb.com/sanitized-sticker.gif","width":120,"height":120}',
    }),
    createRawMessage('5', '105', {
      msg_type: 18,
      content: '{"content":"[{\\"text\\":\\"system notice\\"}]"}',
    }),
    createRawMessage('6', '106', { msg_type: 99, content: '{"private":"must not render"}' }),
  ]

  const display = privateMessage.transformPrivateMessages(raw, eInfos, '100')
  assert.deepEqual(display.map(item => item.msgKey), ['1', '2', '3', '4', '5', '6'])
  assert.equal(display[0]?.isSelf, false)
  assert.deepEqual(display[0]?.content, {
    type: 'text',
    segments: [
      { type: 'text', text: 'hello ' },
      {
        type: 'emoji',
        alt: '[smile]',
        src: 'https://i0.hdslb.com/sanitized-emoji.gif',
        size: 2,
      },
    ],
  })
  assert.deepEqual(display[1]?.content, {
    type: 'image',
    src: 'https://i0.hdslb.com/sanitized-image.jpg',
    width: 640,
    height: 360,
  })
  assert.deepEqual(display[2]?.content, { type: 'recalled' })
  assert.deepEqual(display[3]?.content, {
    type: 'emoticon',
    src: 'https://i0.hdslb.com/sanitized-sticker.gif',
    width: 120,
    height: 120,
  })
  assert.deepEqual(display[4]?.content, { type: 'tip', lines: ['system notice'] })
  assert.deepEqual(display[5]?.content, { type: 'unknown' })
  assert.equal(JSON.stringify(display).includes('must not render'), false)
})

verify('renderer registry contains exactly the supported private-message types', ({ privateMessage }) => {
  assert.deepEqual(
    Object.keys(privateMessage.PRIVATE_MESSAGE_RENDERERS).map(Number).sort((left, right) => left - right),
    [1, 2, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 18],
  )
})

verify('renderer fixtures parse every supported private-message type into typed display content', async ({ privateMessage }) => {
  const fixtureNames = [
    'text',
    'pic',
    'draw-back',
    'custom-face',
    'share-v2',
    'notify-msg',
    'video-card',
    'article-card',
    'picture-card',
    'common-share-card',
    'text-share',
    'business-card',
    'tip-message',
  ] as const
  const expectedTypes = [
    'text',
    'image',
    'recalled',
    'emoticon',
    'share-v2',
    'notification',
    'video-card',
    'article-card',
    'picture-card',
    'common-share-card',
    'text-share',
    'business-card',
    'tip',
  ] as const

  for (const [index, fixtureName] of fixtureNames.entries()) {
    const fixture = await readRendererFixture(fixtureName)
    const content = privateMessage.parsePrivateMessageContent(
      createRawMessage(`fixture-${fixtureName}`, String(200 + index), fixture),
      privateMessage.collectPrivateMessageEmotions(fixture.e_infos ?? []),
    )
    assert.equal(content.type, expectedTypes[index], `${fixtureName} parser`)
  }
})

verify('text renderer preserves newlines and creates safe ALink-ready URL segments', async ({ privateMessage }) => {
  const fixture = await readRendererFixture('text')
  const content = privateMessage.parsePrivateMessageContent(
    createRawMessage('text-fixture', '300', fixture),
    privateMessage.collectPrivateMessageEmotions(fixture.e_infos ?? []),
  )
  assert.equal(content.type, 'text')
  if (content.type !== 'text')
    return
  assert.deepEqual(content.segments, [
    { type: 'text', text: 'Hello ' },
    {
      type: 'emoji',
      alt: '[smile]',
      src: 'https://i0.hdslb.com/bfs/emote/sanitized.gif',
      size: 2,
    },
    { type: 'text', text: '\n' },
    {
      type: 'link',
      href: 'https://www.bilibili.com/video/BV1Fixture',
      text: 'https://www.bilibili.com/video/BV1Fixture',
    },
  ])
})

verify('rich private-message fixtures retain only safe typed fields and links', async ({ privateMessage }) => {
  const fixtureNames = [
    'share-v2',
    'notify-msg',
    'video-card',
    'article-card',
    'picture-card',
    'common-share-card',
    'text-share',
    'business-card',
    'tip-message',
  ] as const
  const parsed = await Promise.all(fixtureNames.map(async (fixtureName, index) => {
    const fixture = await readRendererFixture(fixtureName)
    return privateMessage.parsePrivateMessageContent(
      createRawMessage(`rich-${fixtureName}`, String(400 + index), fixture),
      new Map(),
    )
  }))

  assert.deepEqual(parsed[0], {
    type: 'share-v2',
    source: 'video',
    sourceId: 'sanitized-id',
    bvid: 'BV1Fixture',
    cover: 'https://i0.hdslb.com/bfs/archive/sanitized-cover.jpg',
    title: 'Sanitized video',
    headline: 'Sanitized headline',
    author: 'Sanitized creator',
    href: 'https://www.bilibili.com/video/BV1Fixture',
  })
  assert.deepEqual(parsed[1], {
    type: 'notification',
    title: 'Sanitized notice',
    text: 'Sanitized details',
    modules: [{ title: 'Status', detail: 'Completed' }],
    links: [
      { text: 'Open history', href: 'https://www.bilibili.com/account/history' },
      { text: 'Open account', href: 'https://www.bilibili.com/account' },
    ],
  })
  assert.deepEqual(parsed[2], {
    type: 'video-card',
    bvid: 'BV1Fixture',
    cover: 'https://i0.hdslb.com/bfs/archive/sanitized-video.jpg',
    title: 'Sanitized video card',
    times: 42,
    attachMessage: 'Sanitized note',
    href: 'https://www.bilibili.com/video/BV1Fixture',
  })
  assert.deepEqual(parsed[3], {
    type: 'article-card',
    rid: '123456789012345678',
    images: ['https://i0.hdslb.com/bfs/article/sanitized-article.jpg'],
    title: 'Sanitized article',
    summary: 'Sanitized article summary',
    href: 'https://www.bilibili.com/read/cv123456789012345678',
  })
  assert.deepEqual(parsed[4], {
    type: 'picture-card',
    src: 'https://i0.hdslb.com/bfs/im/sanitized-card.jpg',
    href: 'https://www.bilibili.com/opus/123456789012345678',
  })
  assert.deepEqual(parsed[5], {
    type: 'common-share-card',
    source: 'article',
    sourceId: '123456789012345678',
    cover: 'https://i0.hdslb.com/bfs/article/sanitized-common.jpg',
    title: 'Sanitized shared article',
    author: 'Sanitized author',
    href: 'https://www.bilibili.com/read/cv123456789012345678',
  })
  assert.deepEqual(parsed[6], {
    type: 'text-share',
    title: 'Sanitized shared text',
    text: 'Sanitized shared summary',
    href: 'https://www.bilibili.com/opus/123456789012345678',
  })
  assert.deepEqual(parsed[7], {
    type: 'business-card',
    title: 'Sanitized business message',
    cards: [{
      href: 'https://www.bilibili.com/video/BV1Fixture',
      cover: 'https://i0.hdslb.com/bfs/archive/sanitized-business.jpg',
      fields: ['Sanitized field one', 'Sanitized field two', 'Sanitized field three'],
    }],
  })
  assert.deepEqual(parsed[8], {
    type: 'tip',
    lines: ['Sanitized tip one', 'Sanitized tip two'],
  })
})

verify('real notification null modules and recalled status remain renderable', async ({ privateMessage }) => {
  const nullModules = await readRendererFixture('notify-msg-null-modules')
  const recalledStatus = await readRendererFixture('recalled-status')
  const notification = privateMessage.parsePrivateMessageContent(
    createRawMessage('notify-null-modules', '480', nullModules),
    new Map(),
  )
  const recalledByStatus = privateMessage.parsePrivateMessageContent(
    createRawMessage('recalled-status', '481', recalledStatus),
    new Map(),
  )
  const recalledByType = privateMessage.parsePrivateMessageContent(
    createRawMessage('recalled-type', '482', { msg_type: 5, content: '' }),
    new Map(),
  )
  const partiallyMalformedModules = privateMessage.parsePrivateMessageContent(
    createRawMessage('notify-partial-modules', '483', {
      msg_type: 10,
      content: JSON.stringify({
        title: 'Sanitized partial notice',
        modules: [
          { title: 'Accepted', detail: 'Sanitized detail' },
          { title: 'Skipped' },
        ],
      }),
    }),
    new Map(),
  )

  assert.deepEqual(notification, {
    type: 'notification',
    title: 'Sanitized assistant notice',
    text: '',
    modules: [],
    links: [{
      text: 'Open configured destination',
      href: 'https://www.bilibili.com/account/history',
    }],
  })
  assert.deepEqual(recalledByStatus, { type: 'recalled' })
  assert.deepEqual(recalledByType, { type: 'recalled' })
  assert.deepEqual(partiallyMalformedModules, {
    type: 'notification',
    title: 'Sanitized partial notice',
    text: '',
    modules: [{ title: 'Accepted', detail: 'Sanitized detail' }],
    links: [],
  })
})

verify('malformed JSON, unsafe links, unknown sources, and unknown types fall back per message', async ({ privateMessage }) => {
  const unknownFixture = await readRendererFixture('unknown')
  const unknownCases = [
    createRawMessage('bad-json', '501', { msg_type: 11, content: '{' }),
    createRawMessage('bad-recall-json', '502', { msg_type: 5, content: '{' }),
    createRawMessage('unsafe-link', '503', {
      msg_type: 13,
      content: '{"pic_url":"https://i0.hdslb.com/safe.jpg","jump_url":"javascript:alert(1)"}',
    }),
    createRawMessage('unknown-source', '504', {
      msg_type: 7,
      content: '{"source":"unverified","id":"1","bvid":"BV1Private","title":"private"}',
    }),
    createRawMessage('unknown-type', '505', unknownFixture),
    ...[3, 4, 8, 9, 19, 50].map((msgType, index) => createRawMessage(
      `unknown-type-${msgType}`,
      String(506 + index),
      { msg_type: msgType, content: '{"private":"must not render"}' },
    )),
  ]
  const display = privateMessage.transformPrivateMessages(unknownCases, [], '100')
  assert.equal(display.length, 11)
  assert.equal(display[0]?.content.type, 'unknown')
  assert.equal(display[1]?.content.type, 'recalled')
  assert.equal(display.slice(2).every(item => item.content.type === 'unknown'), true)
  assert.equal(JSON.stringify(display).includes('private'), false)
})

verify('private message parsing rejects unsafe media URLs and preserves large string IDs', ({ privateMessage }) => {
  const [display] = privateMessage.transformPrivateMessages([
    createRawMessage('9223372036854775807', '9223372036854775700', {
      msg_type: 2,
      content: '{"url":"javascript:alert(1)","width":640,"height":360}',
      sender_uid: '9223372036854775806',
      receiver_id: '9223372036854775805',
    }),
  ], [], '9223372036854775806')

  assert.equal(display?.msgKey, '9223372036854775807')
  assert.equal(display?.seqno, '9223372036854775700')
  assert.equal(display?.senderId, '9223372036854775806')
  assert.equal(display?.receiverId, '9223372036854775805')
  assert.equal(display?.isSelf, true)
  assert.deepEqual(display?.content, { type: 'unknown' })
})

verify('older pages prepend in seqno order and dedupe by msgKey', ({ privateMessage }) => {
  const current = privateMessage.transformPrivateMessages([
    createRawMessage('3', '103'),
    createRawMessage('4', '104'),
  ], [], '100')
  const older = privateMessage.transformPrivateMessages([
    createRawMessage('1', '101'),
    createRawMessage('2', '102'),
    createRawMessage('3', '103', { content: '{"content":"updated duplicate"}' }),
  ], [], '100')

  const merged = privateMessage.mergePrivateMessages(current, older)
  assert.deepEqual(merged.map(item => item.msgKey), ['1', '2', '3', '4'])
  assert.deepEqual(merged[2]?.content, {
    type: 'text',
    segments: [{ type: 'text', text: 'updated duplicate' }],
  })
  assert.equal(privateMessage.getOldestPrivateMessageSeqno(merged), '101')
  assert.equal(privateMessage.getLatestPrivateMessageSeqno(merged), '104')
})

verify('conversation controller uses end_seqno for history and rejects old account or conversation generations', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const requests: Array<{ endSeqno?: string, talkerId: string }> = []
  let resolveOlder: ((value: unknown) => void) | undefined
  const olderResponse = new Promise<unknown>((resolve) => {
    resolveOlder = resolve
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async (options) => {
      requests.push(options)
      if (options.endSeqno)
        return olderResponse
      return createMessagesResponse([
        createRawMessage('3', '103'),
        createRawMessage('4', '104'),
      ])
    },
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  const firstLoad = controller.loadInitial('200', '100')
  const repeatedLoad = controller.loadInitial('200', '100')
  await Promise.all([firstLoad, repeatedLoad])
  assert.deepEqual(requests, [{ talkerId: '200' }])

  const state = controller.getState('200')
  assert.deepEqual(state.items.map(item => item.msgKey), ['3', '4'])
  const loadOlder = controller.loadOlder('200')
  assert.deepEqual(requests[1], { talkerId: '200', endSeqno: '103' })

  activeTalkerId.value = '300'
  await nextTick()
  resolveOlder?.(createMessagesResponse([createRawMessage('1', '101')]))
  await loadOlder
  assert.deepEqual(state.items.map(item => item.msgKey), ['3', '4'])

  mid.value = '300'
  await nextTick()
  controller.updateViewport('200', { atLatest: false, scrollTop: 88 })
  assert.equal(controller.states.has('200'), false)
  assert.equal(controller.getState('200').items.length, 0)
})

verify('older-history requests are single-flight and stop after a page makes no seqno progress', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let olderRequests = 0
  let resolveOlder: ((value: unknown) => void) | undefined
  const olderResponse = new Promise<unknown>((resolve) => {
    resolveOlder = resolve
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async (options) => {
      if (!options.endSeqno) {
        return createMessagesResponse([
          createRawMessage('3', '103'),
          createRawMessage('4', '104'),
        ])
      }
      olderRequests++
      return olderResponse
    },
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  const firstRequest = controller.loadOlder('200')
  const repeatedRequest = controller.loadOlder('200')
  assert.equal(olderRequests, 1)
  resolveOlder?.(createMessagesResponse([
    createRawMessage('3', '103'),
  ]))
  await Promise.all([firstRequest, repeatedRequest])

  const state = controller.getState('200')
  assert.equal(state.noMore, true)
  assert.deepEqual(state.items.map(item => item.msgKey), ['3', '4'])
  await controller.loadOlder('200')
  assert.equal(olderRequests, 1)
})

verify('latest refresh merges to the tail and reports new messages without discarding history', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const pages = [
    createMessagesResponse([createRawMessage('2', '102'), createRawMessage('3', '103')]),
    createMessagesResponse([createRawMessage('1', '101')]),
    createMessagesResponse([createRawMessage('3', '103'), createRawMessage('4', '104')]),
  ]
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => pages.shift(),
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  await controller.loadOlder('200')
  const state = controller.getState('200')
  controller.updateViewport('200', { atLatest: false, scrollTop: 40 })
  await controller.refreshLatest('200')

  assert.deepEqual(state.items.map(item => item.msgKey), ['1', '2', '3', '4'])
  assert.equal(state.newMessagesAvailable, true)
  assert.equal(state.scrollTop, 40)
})

verify('conversation failures retain the exact initial, refresh, or load-older retry operation', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const initialController = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => ({ code: -400, data: null }),
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })
  await initialController.loadInitial('200', '100')
  assert.equal(initialController.getState('200').failedOperation, 'initial')

  const responses = [
    createMessagesResponse([createRawMessage('2', '102')]),
    { code: -400, data: null },
    { code: -400, data: null },
  ]
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => responses.shift(),
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  await controller.loadOlder('200')
  assert.equal(controller.getState('200').failedOperation, 'load-older')
  await controller.refreshLatest('200')
  assert.equal(controller.getState('200').failedOperation, 'refresh')
})

verify('a failed latest refresh blocks ACK against stale cached history', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let ackRequestCount = 0
  const responses = [
    createMessagesResponse([createRawMessage('1', '104')]),
    { code: -400, data: null },
  ]
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => {
      ackRequestCount++
      return { code: 0, data: {} }
    },
    fetchMessages: async () => responses.shift(),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  await controller.refreshLatest('200')
  const acknowledged = await controller.acknowledgeIfEligible('200', {
    atLatest: true,
    pageActive: true,
    visible: true,
  })

  assert.equal(controller.getState('200').failedOperation, 'refresh')
  assert.equal(acknowledged, false)
  assert.equal(ackRequestCount, 0)
})

verify('ACK requires an active visible latest conversation and dedupes successful seqnos', async ({ privateMessage, usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const ackRequests: Array<{ ackSeqno: string, csrf: string, talkerId: string }> = []
  const readUpdates: Array<{ ackSeqno: string, talkerId: string }> = []
  let unreadSyncs = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async (options) => {
      ackRequests.push(options)
      return { code: 0, data: {} }
    },
    fetchMessages: async () => createMessagesResponse([
      createRawMessage('1', '9223372036854775799'),
    ]),
    getCsrf: () => 'csrf-token',
    markSessionRead: (talkerId, ackSeqno) => readUpdates.push({ talkerId, ackSeqno }),
    syncUnread: async () => { unreadSyncs++ },
  })

  await controller.loadInitial('200', '9223372036854775700')
  const blocked = await controller.acknowledgeIfEligible('200', {
    atLatest: false,
    pageActive: true,
    visible: true,
  })
  assert.equal(blocked, false)

  const first = await controller.acknowledgeIfEligible('200', {
    atLatest: true,
    pageActive: true,
    visible: true,
  })
  const repeated = await controller.acknowledgeIfEligible('200', {
    atLatest: true,
    pageActive: true,
    visible: true,
  })
  assert.equal(first, true)
  assert.equal(repeated, false)
  assert.deepEqual(ackRequests, [{
    talkerId: '200',
    ackSeqno: '9223372036854775799',
    csrf: 'csrf-token',
  }])
  assert.deepEqual(readUpdates, [{ talkerId: '200', ackSeqno: '9223372036854775799' }])
  assert.equal(unreadSyncs, 1)
  assert.equal(controller.getState('200').lastAckSeqno, '9223372036854775799')
  assert.equal(privateMessage.comparePrivateMessageSeqno('9223372036854775799', '9223372036854775700') > 0, true)
})

verify('failed ACK never clears local unread state or advances lastAckSeqno', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let localReadUpdates = 0
  let unreadSyncs = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: -400, data: null }),
    fetchMessages: async () => createMessagesResponse([createRawMessage('1', '104')]),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => { localReadUpdates++ },
    syncUnread: async () => { unreadSyncs++ },
  })

  await controller.loadInitial('200', '100')
  const acknowledged = await controller.acknowledgeIfEligible('200', {
    atLatest: true,
    pageActive: true,
    visible: true,
  })

  assert.equal(acknowledged, false)
  assert.equal(controller.getState('200').lastAckSeqno, '100')
  assert.equal(localReadUpdates, 0)
  assert.equal(unreadSyncs, 0)
})

verify('in-flight ACK remains single-flight across a temporary conversation switch', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let ackRequestCount = 0
  let resolveAck: ((value: unknown) => void) | undefined
  const ackResponse = new Promise<unknown>((resolve) => {
    resolveAck = resolve
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => {
      ackRequestCount++
      return ackResponse
    },
    fetchMessages: async () => createMessagesResponse([createRawMessage('1', '104')]),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  const firstAck = controller.acknowledgeIfEligible('200', {
    atLatest: true,
    pageActive: true,
    visible: true,
  })
  activeTalkerId.value = '300'
  activeTalkerId.value = '200'
  const repeatedAck = controller.acknowledgeIfEligible('200', {
    atLatest: true,
    pageActive: true,
    visible: true,
  })

  assert.equal(ackRequestCount, 1)
  resolveAck?.({ code: 0, data: {} })
  assert.deepEqual(await Promise.all([firstAck, repeatedAck]), [true, true])
  assert.equal(controller.getState('200').lastAckSeqno, '104')
})

verify('session controller clears unread only after confirmed ACK', ({ privateSession, usePrivateSessions }) => {
  const mid = ref('100')
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => createSessionsResponse([]),
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => createSessionsResponse([]),
    fetchUserCards: async () => createCardsResponse([]),
  })
  controller.state.items = privateSession.transformPrivateSessions([
    createRawSession('200', {
      unread_count: 4,
      ack_seqno: '100',
      max_seqno: '104',
      group_name: 'User 200',
    }),
  ], createCardsResponse([]))

  controller.markSessionRead('200', '104')
  assert.equal(controller.state.items[0]?.unreadCount, 0)
  assert.equal(controller.state.items[0]?.ackSeqno, '104')

  controller.markSessionSent('200', 'sent summary', 1755000005)
  assert.equal(controller.state.items[0]?.summary, 'sent summary')
  assert.equal(controller.state.items[0]?.timestamp, 1755000005000000)
  assert.equal(controller.state.items[0]?.original.session_ts, 1755000005000000)
})

verify('optimistic text messages reconcile to one server message without duplicates', ({ privateMessage }) => {
  const optimistic = privateMessage.createOptimisticPrivateTextMessage({
    localId: 'local-1',
    senderId: '100',
    receiverId: '200',
    text: 'same text',
    timestamp: 1755000000,
  })
  assert.equal(optimistic.sendState, 'pending')
  assert.equal(optimistic.msgType, 1)
  assert.deepEqual(optimistic.content, {
    type: 'text',
    segments: [{ type: 'text', text: 'same text' }],
  })

  optimistic.sendState = 'reconciling'
  optimistic.serverMsgKey = '9223372036854775807'
  const [server] = privateMessage.transformPrivateMessages([
    createRawMessage('9223372036854775807', '105', {
      sender_uid: '100',
      receiver_id: '200',
      content: '{"content":"same text"}',
      timestamp: 1755000002,
    }),
  ], [], '100')
  const [sameContentWrongKey] = privateMessage.transformPrivateMessages([
    createRawMessage('different-server-key', '104', {
      sender_uid: '100',
      receiver_id: '200',
      content: '{"content":"same text"}',
      timestamp: 1755000001,
    }),
  ], [], '100')
  const notReconciled = privateMessage.reconcileOptimisticPrivateMessages([
    optimistic,
    sameContentWrongKey!,
  ], 'local-1')
  assert.equal(notReconciled.reconciled, false)
  assert.equal(notReconciled.items.some(item => item.localId === 'local-1'), true)

  const reconciled = privateMessage.reconcileOptimisticPrivateMessages([
    optimistic,
    server!,
    server!,
  ], 'local-1')

  assert.equal(reconciled.reconciled, true)
  assert.deepEqual(reconciled.items.map(item => item.msgKey), ['9223372036854775807'])
})

verify('send controller inserts one optimistic item, clears draft, and reconciles after code zero', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let resolveSend: ((value: unknown) => void) | undefined
  const sendResponse = new Promise<unknown>((resolve) => {
    resolveSend = resolve
  })
  let sendRequests = 0
  let sessionRefreshes = 0
  const sessionUpdates: Array<{ talkerId: string, summary: string, timestamp: number }> = []
  const historyResponses = [
    createMessagesResponse([]),
    createMessagesResponse([
      createRawMessage('server-1', '105', {
        sender_uid: '100',
        receiver_id: '200',
        content: '{"content":"hello"}',
        timestamp: 1755000002,
      }),
    ]),
  ]
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => historyResponses.shift(),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    markSessionSent: (talkerId, summary, timestamp) => sessionUpdates.push({ talkerId, summary, timestamp }),
    refreshSessions: async () => { sessionRefreshes++ },
    sendMessage: async () => {
      sendRequests++
      return sendResponse
    },
    syncUnread: async () => {},
    createLocalId: () => 'local-1',
    nowSeconds: () => 1755000000,
  })

  await controller.loadInitial('200', '0')
  controller.setDraft('200', 'hello')
  const firstSend = controller.sendDraft('200')
  const repeatedSend = controller.sendDraft('200')
  const state = controller.getState('200')
  assert.equal(sendRequests, 1)
  assert.equal(state.draft, '')
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0]?.sendState, 'pending')

  resolveSend?.({ code: 0, data: { msg_key: 'server-1' } })
  assert.deepEqual(await Promise.all([firstSend, repeatedSend]), [true, true])
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0]?.msgKey, 'server-1')
  assert.equal(state.items[0]?.sendState, 'sent')
  assert.deepEqual(sessionUpdates, [{ talkerId: '200', summary: 'hello', timestamp: 1755000000 }])
  assert.equal(sessionRefreshes, 1)
})

verify('failed optimistic sends retain text and retry remains single-flight', async ({ privateMessage, usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let sendAttempt = 0
  let resolveRetry: ((value: unknown) => void) | undefined
  const retryResponse = new Promise<unknown>((resolve) => {
    resolveRetry = resolve
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => createMessagesResponse([
      createRawMessage('server-2', '106', {
        sender_uid: '100',
        receiver_id: '200',
        content: '{"content":"retry me"}',
        timestamp: 1755000003,
      }),
    ]),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    markSessionSent: () => {},
    refreshSessions: async () => {},
    sendMessage: async () => {
      sendAttempt++
      return sendAttempt === 1 ? { code: -400, data: null } : retryResponse
    },
    syncUnread: async () => {},
    createLocalId: () => 'local-2',
    nowSeconds: () => 1755000000,
  })

  controller.setDraft('200', 'retry me')
  assert.equal(await controller.sendDraft('200'), false)
  const state = controller.getState('200')
  assert.equal(state.items[0]?.sendState, 'failed')
  assert.deepEqual(state.items[0]?.content, {
    type: 'text',
    segments: [{ type: 'text', text: 'retry me' }],
  })

  const firstRetry = controller.retrySend('200', 'local-2')
  const repeatedRetry = controller.retrySend('200', 'local-2')
  assert.equal(sendAttempt, 2)
  resolveRetry?.({ code: 0, data: { msg_key: 'server-2' } })
  assert.deepEqual(await Promise.all([firstRetry, repeatedRetry]), [true, true])
  assert.equal(sendAttempt, 2)
  assert.deepEqual(state.items.map(item => item.msgKey), ['server-2'])

  controller.setDraft('200', 'editable')
  const failed = privateMessage.createOptimisticPrivateTextMessage({
    localId: 'local-3',
    senderId: '100',
    receiverId: '200',
    text: 'failed text',
    timestamp: 1755000004,
  })
  failed.sendState = 'failed'
  state.items.push(failed)
  controller.editFailed('200', 'local-3')
  assert.equal(state.draft, 'failed text')
  assert.equal(state.items.some(item => item.localId === 'local-3'), false)
  state.items.push(failed)
  controller.deleteFailed('200', 'local-3')
  assert.equal(state.items.some(item => item.localId === 'local-3'), false)

  controller.setDraft('200', 'account-scoped draft')
  mid.value = '300'
  await nextTick()
  assert.equal(controller.states.has('200'), false)
})

verify('optimistic image messages retain local previews and reconcile by server msg_key', ({ privateMessage }) => {
  const optimistic = privateMessage.createOptimisticPrivateImageMessage({
    localId: 'image-local-1',
    senderId: '100',
    receiverId: '200',
    objectUrl: 'blob:https://www.bilibili.com/sanitized-preview',
    timestamp: 1755000000,
  })
  assert.equal(optimistic.msgType, 2)
  assert.equal(optimistic.sendState, 'preparing')
  assert.deepEqual(optimistic.content, {
    type: 'image',
    src: 'blob:https://www.bilibili.com/sanitized-preview',
    width: 0,
    height: 0,
  })

  optimistic.sendState = 'reconciling'
  optimistic.serverMsgKey = '9223372036854775807'
  const [server] = privateMessage.transformPrivateMessages([
    createRawMessage('9223372036854775807', '105', {
      sender_uid: '100',
      receiver_id: '200',
      msg_type: 2,
      content: '{"url":"https://i0.hdslb.com/bfs/im/sanitized.png","width":1280,"height":720}',
      timestamp: 1755000002,
    }),
  ], [], '100')
  const reconciled = privateMessage.reconcileOptimisticPrivateMessages([
    optimistic,
    server!,
  ], 'image-local-1')
  assert.equal(reconciled.reconciled, true)
  assert.deepEqual(reconciled.items.map(item => item.msgKey), ['9223372036854775807'])
})

verify('image upload failure retries upload while send failure reuses the uploaded server image', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const revoked: string[] = []
  const cancelled: string[] = []
  let uploadAttempts = 0
  let sendAttempts = 0
  let sessionRefreshes = 0
  const serverImage = createRawMessage('server-image-1', '105', {
    sender_uid: '100',
    receiver_id: '200',
    msg_type: 2,
    content: '{"url":"https://i0.hdslb.com/bfs/im/sanitized.png","width":1280,"height":720}',
    timestamp: 1755000002,
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    cancelImageUpload: async (requestId) => { cancelled.push(requestId) },
    createLocalId: () => 'image-local-1',
    createObjectUrl: () => 'blob:https://www.bilibili.com/sanitized-preview',
    createUploadRequestId: () => `upload-${uploadAttempts + 1}`,
    fetchMessages: async () => createMessagesResponse([serverImage]),
    getCsrf: () => 'csrf-token',
    getImageSummary: () => '[image]',
    markSessionRead: () => {},
    markSessionSent: () => {},
    readFileBytes: async () => [1, 2, 3],
    refreshSessions: async () => { sessionRefreshes++ },
    revokeObjectUrl: url => revoked.push(url),
    sendImageMessage: async () => {
      sendAttempts++
      return sendAttempts === 1
        ? { code: -400, data: null }
        : { code: 0, data: { msg_key: 'server-image-1' } }
    },
    syncUnread: async () => {},
    uploadImage: async () => {
      uploadAttempts++
      return uploadAttempts === 1
        ? { code: -1, data: null }
        : {
            code: 0,
            data: {
              url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
              width: 1280,
              height: 720,
              size: 3,
              imageType: 'png',
            },
          }
    },
  })
  const image = new File([new Uint8Array([1, 2, 3])], 'sanitized.png', { type: 'image/png' })

  assert.equal(await controller.sendImage('200', image), false)
  const state = controller.getState('200')
  assert.equal(state.imageDraft?.failureKind, 'upload-failed')
  assert.equal(state.items[0]?.sendState, 'failed')
  assert.equal(uploadAttempts, 1)
  assert.equal(sendAttempts, 0)

  assert.equal(await controller.retryImage('200', 'image-local-1'), false)
  assert.equal(state.imageDraft?.failureKind, 'send-failed')
  assert.equal(uploadAttempts, 2)
  assert.equal(sendAttempts, 1)

  assert.equal(await controller.retryImage('200', 'image-local-1'), true)
  assert.equal(uploadAttempts, 2)
  assert.equal(sendAttempts, 2)
  assert.deepEqual(state.items.map(item => item.msgKey), ['server-image-1'])
  assert.equal(state.imageDraft, null)
  assert.deepEqual(revoked, ['blob:https://www.bilibili.com/sanitized-preview'])
  assert.deepEqual(cancelled, [])
  assert.equal(sessionRefreshes, 1)
})

verify('image reconcile failure retries only history and resource cleanup cancels stale uploads', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const revoked: string[] = []
  const cancelled: string[] = []
  let historyRequests = 0
  let uploadAttempts = 0
  let sendAttempts = 0
  let resolveUpload: ((value: unknown) => void) | undefined
  let resolveUploadStarted: (() => void) | undefined
  const deferredUpload = new Promise<unknown>((resolve) => {
    resolveUpload = resolve
  })
  const uploadStarted = new Promise<void>((resolve) => {
    resolveUploadStarted = resolve
  })
  const serverImage = createRawMessage('server-image-2', '106', {
    sender_uid: '100',
    receiver_id: '200',
    msg_type: 2,
    content: '{"url":"https://i0.hdslb.com/bfs/im/sanitized.png","width":1280,"height":720}',
    timestamp: 1755000002,
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    cancelImageUpload: async (requestId) => { cancelled.push(requestId) },
    createLocalId: () => 'image-local-2',
    createObjectUrl: () => 'blob:https://www.bilibili.com/reconcile-preview',
    createUploadRequestId: () => 'upload-reconcile',
    fetchMessages: async () => {
      historyRequests++
      return historyRequests === 1
        ? createMessagesResponse([])
        : createMessagesResponse([serverImage])
    },
    getCsrf: () => 'csrf-token',
    getImageSummary: () => '[image]',
    markSessionRead: () => {},
    markSessionSent: () => {},
    readFileBytes: async () => [1, 2, 3],
    refreshSessions: async () => {},
    revokeObjectUrl: url => revoked.push(url),
    sendImageMessage: async () => {
      sendAttempts++
      return { code: 0, data: { msg_key: 'server-image-2' } }
    },
    syncUnread: async () => {},
    uploadImage: async () => {
      uploadAttempts++
      return {
        code: 0,
        data: {
          url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
          width: 1280,
          height: 720,
          size: 3,
          imageType: 'png',
        },
      }
    },
  })
  const image = new File([new Uint8Array([1, 2, 3])], 'sanitized.png', { type: 'image/png' })

  assert.equal(await controller.sendImage('200', image), false, 'first send must stop at reconciliation')
  const state = controller.getState('200')
  assert.equal(state.imageDraft?.failureKind, 'reconcile-failed', 'failure stage')
  assert.equal(uploadAttempts, 1, 'initial upload count')
  assert.equal(sendAttempts, 1, 'initial send count')
  assert.equal(historyRequests, 1, 'initial reconciliation history count')

  assert.equal(await controller.retryImage('200', 'image-local-2'), true, 'reconcile retry result')
  assert.equal(uploadAttempts, 1, 'retry must not upload')
  assert.equal(sendAttempts, 1, 'retry must not send')
  assert.equal(historyRequests, 2, 'retry must only fetch history')
  assert.equal(state.imageDraft, null, 'draft clears after reconciliation')
  assert.deepEqual(revoked, ['blob:https://www.bilibili.com/reconcile-preview'], 'object URL cleanup')

  const staleController = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    cancelImageUpload: async (requestId) => { cancelled.push(requestId) },
    createLocalId: () => 'image-local-stale',
    createObjectUrl: () => 'blob:https://www.bilibili.com/stale-preview',
    createUploadRequestId: () => 'upload-stale',
    fetchMessages: async () => createMessagesResponse([]),
    getCsrf: () => 'csrf-token',
    getImageSummary: () => '[image]',
    markSessionRead: () => {},
    readFileBytes: async () => [1, 2, 3],
    revokeObjectUrl: url => revoked.push(url),
    sendImageMessage: async () => ({ code: 0, data: { msg_key: 'never' } }),
    syncUnread: async () => {},
    uploadImage: async () => {
      resolveUploadStarted?.()
      return deferredUpload
    },
  })
  const staleSend = staleController.sendImage('200', image)
  await uploadStarted
  activeTalkerId.value = '300'
  await nextTick()
  resolveUpload?.({
    code: 0,
    data: {
      url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
      width: 1280,
      height: 720,
      size: 3,
      imageType: 'png',
    },
  })
  assert.equal(await staleSend, false, 'stale upload result')
  assert.ok(cancelled.includes('upload-stale'), 'conversation switch cancels background upload')
  assert.ok(revoked.includes('blob:https://www.bilibili.com/stale-preview'), 'conversation switch revokes preview')

  activeTalkerId.value = '200'
  const disposeSend = staleController.sendImage('200', image)
  staleController.dispose()
  assert.ok(cancelled.includes('upload-stale'), 'dispose keeps upload cancellation invariant')
  resolveUpload?.({ code: -1, data: null })
  await disposeSend
})

verify('image send waits for a valid account before allocating preview resources', async ({ usePrivateMessages }) => {
  const mid = ref('')
  const activeTalkerId = ref('200')
  let objectUrlsCreated = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    createObjectUrl: () => {
      objectUrlsCreated++
      return 'blob:https://www.bilibili.com/pending-account'
    },
    fetchMessages: async () => createMessagesResponse([]),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    sendImageMessage: async () => ({ code: 0, data: { msg_key: 'unused' } }),
    syncUnread: async () => {},
    uploadImage: async () => ({
      code: 0,
      data: {
        url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
        width: 1280,
        height: 720,
        size: 3,
        imageType: 'png',
      },
    }),
  })
  const image = new File([new Uint8Array([1, 2, 3])], 'sanitized.png', { type: 'image/png' })

  assert.equal(await controller.sendImage('200', image), false)
  assert.equal(objectUrlsCreated, 0)
  assert.equal(controller.states.size, 0)
})

verify('account changes cancel an active image upload and reject the old account response', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const cancelled: string[] = []
  const revoked: string[] = []
  let resolveUpload: ((value: unknown) => void) | undefined
  let resolveUploadStarted: (() => void) | undefined
  const uploadResponse = new Promise<unknown>((resolve) => {
    resolveUpload = resolve
  })
  const uploadStarted = new Promise<void>((resolve) => {
    resolveUploadStarted = resolve
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    cancelImageUpload: async requestId => void cancelled.push(requestId),
    createLocalId: () => 'image-account-change',
    createObjectUrl: () => 'blob:https://www.bilibili.com/account-change',
    createUploadRequestId: () => 'upload-account-change',
    fetchMessages: async () => createMessagesResponse([]),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    readFileBytes: async () => [1, 2, 3],
    revokeObjectUrl: url => revoked.push(url),
    sendImageMessage: async () => ({ code: 0, data: { msg_key: 'unused' } }),
    syncUnread: async () => {},
    uploadImage: async () => {
      resolveUploadStarted?.()
      return uploadResponse
    },
  })
  const image = new File([new Uint8Array([1, 2, 3])], 'sanitized.png', { type: 'image/png' })

  const send = controller.sendImage('200', image)
  await uploadStarted
  mid.value = '300'
  await nextTick()
  resolveUpload?.({
    code: 0,
    data: {
      url: 'https://i0.hdslb.com/bfs/im/sanitized.png',
      width: 1280,
      height: 720,
      size: 3,
      imageType: 'png',
    },
  })

  assert.equal(await send, false)
  assert.deepEqual(cancelled, ['upload-account-change'])
  assert.deepEqual(revoked, ['blob:https://www.bilibili.com/account-change'])
  assert.equal(controller.states.size, 0)
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
