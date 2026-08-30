import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

import { nextTick, ref } from 'vue'

import { storeWbiKeys } from '../src/background/wbiSign'

interface MockResponseOptions {
  contentType?: string
  redirected?: boolean
  status?: number
  url?: string
}

interface PrivateMessageModules {
  api: typeof import('../src/background/privateMessage/api')
  experimentalApi: typeof import('../src/background/privateMessage/experimental/api')
  errors: typeof import('../src/background/privateMessage/errors')
  losslessJson: typeof import('../src/background/privateMessage/losslessJson')
  protocol: typeof import('../src/background/privateMessage/protocol')
  transport: typeof import('../src/background/privateMessage/transport')
  types: typeof import('../src/background/privateMessage/types')
  privateSession: typeof import('../src/contentScripts/views/Notifications/whisper/privateSession')
  privateMessage: typeof import('../src/contentScripts/views/Notifications/whisper/privateMessage')
  conversationExpansion: typeof import('../src/contentScripts/views/Notifications/whisper/conversationExpansion')
  usePrivateSessions: typeof import('../src/contentScripts/views/Notifications/whisper/usePrivateSessions')
  usePrivateMessages: typeof import('../src/contentScripts/views/Notifications/whisper/usePrivateMessages')
  experimentalPrivateMessage: typeof import('../src/contentScripts/views/Notifications/whisper/experimental')
  experimentalUsePrivateMessages: typeof import('../src/contentScripts/views/Notifications/whisper/experimental') & {
    usePrivateMessages: typeof import('../src/contentScripts/views/Notifications/whisper/experimental').useExperimentalPrivateMessageWrites
  }
  privateConversationRoute: typeof import('../src/utils/privateConversationRoute')
  notificationSections: typeof import('../src/contentScripts/views/Notifications/notificationSections')
  topBarSharedRefresh: typeof import('../src/stores/topBarSharedRefresh')
  messageServerSettingsProtocol: typeof import('../src/background/messageServerSettings/protocol')
  useMessageServerSettings: typeof import('../src/components/Settings/PluginComponentsAndPages/MessagesPage/useMessageServerSettings')
  privateRecipientSearch: typeof import('../src/contentScripts/views/Notifications/whisper/privateRecipientSearch')
  usePrivateRecipientSearch: typeof import('../src/contentScripts/views/Notifications/whisper/usePrivateRecipientSearch')
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
      api,
      experimentalApi,
      errors,
      losslessJson,
      protocol,
      transport,
      types,
      privateSession,
      privateMessage,
      conversationExpansion,
      usePrivateSessions,
      usePrivateMessages,
      experimentalWrites,
      privateConversationRoute,
      notificationSections,
      topBarSharedRefresh,
      messageServerSettingsProtocol,
      useMessageServerSettings,
      privateRecipientSearch,
      usePrivateRecipientSearch,
    ] = await Promise.all([
      import('../src/background/privateMessage/api'),
      import('../src/background/privateMessage/experimental/api'),
      import('../src/background/privateMessage/errors'),
      import('../src/background/privateMessage/losslessJson'),
      import('../src/background/privateMessage/protocol'),
      import('../src/background/privateMessage/transport'),
      import('../src/background/privateMessage/types'),
      import('../src/contentScripts/views/Notifications/whisper/privateSession'),
      import('../src/contentScripts/views/Notifications/whisper/privateMessage'),
      import('../src/contentScripts/views/Notifications/whisper/conversationExpansion'),
      import('../src/contentScripts/views/Notifications/whisper/usePrivateSessions'),
      import('../src/contentScripts/views/Notifications/whisper/usePrivateMessages'),
      import('../src/contentScripts/views/Notifications/whisper/experimental'),
      import('../src/utils/privateConversationRoute'),
      import('../src/contentScripts/views/Notifications/notificationSections'),
      import('../src/stores/topBarSharedRefresh'),
      import('../src/background/messageServerSettings/protocol'),
      import('../src/components/Settings/PluginComponentsAndPages/MessagesPage/useMessageServerSettings'),
      import('../src/contentScripts/views/Notifications/whisper/privateRecipientSearch'),
      import('../src/contentScripts/views/Notifications/whisper/usePrivateRecipientSearch'),
    ])
    return {
      api,
      experimentalApi,
      errors,
      losslessJson,
      protocol,
      transport,
      types,
      privateSession,
      privateMessage,
      conversationExpansion,
      usePrivateSessions,
      usePrivateMessages,
      experimentalPrivateMessage: experimentalWrites,
      experimentalUsePrivateMessages: {
        ...experimentalWrites,
        usePrivateMessages: experimentalWrites.useExperimentalPrivateMessageWrites,
      },
      privateConversationRoute,
      notificationSections,
      topBarSharedRefresh,
      messageServerSettingsProtocol,
      useMessageServerSettings,
      privateRecipientSearch,
      usePrivateRecipientSearch,
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
  const conversationState = privateConversationRoute.createPrivateConversationHistoryState({ preserved: true })
  assert.deepEqual(conversationState, {
    preserved: true,
    bewlyPrivateConversation: true,
  })
  assert.equal(privateConversationRoute.isPrivateConversationHistoryState(conversationState), true)
  assert.deepEqual(privateConversationRoute.clearPrivateConversationHistoryState(conversationState), {
    preserved: true,
  })
  assert.equal(privateConversationRoute.isPrivateConversationHistoryState(null), false)
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

verify('settings is no longer a notification section and System is Native', ({ notificationSections }) => {
  assert.equal(notificationSections.isNotificationView('settings'), false)
  assert.equal(notificationSections.isNativeNotificationSection('system'), true)
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
  const [storeSource, helperSource, sectionSource, brokerSource] = await Promise.all([
    readFile(new URL('../src/stores/topBarStore.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/stores/topBarSharedRefresh.ts', import.meta.url), 'utf8'),
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
  assert.ok(sectionSource.includes(`id: 'system'`))
  assert.ok(sectionSource.includes(`implementation: 'native'`))
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
    size: 100,
  }), {
    talker_id: '9223372036854775807',
    session_type: 1,
    size: 100,
    sender_device_id: 1,
    build: 0,
    mobi_app: 'web',
    begin_seqno: '0',
    end_seqno: '9223372036854775700',
  })
})

verify('message metadata preserves uint64 floors and normalizes pagination fields', async ({ losslessJson, protocol }) => {
  const response = await losslessJson.parsePrivateMessageResponse(createMockResponse(JSON.stringify({
    code: 0,
    data: {
      messages: [createRawMessage('page-1', '9223372036854775799')],
      e_infos: null,
      has_more: 7,
      min_seqno: '18446744073709551615',
      max_seqno: '9223372036854775807',
    },
  })), 'getPrivateMessages')
  const parsed = protocol.parsePrivateMessagesResponse(response)
  assert.ok(parsed)
  assert.equal(parsed.data.has_more, 1)
  assert.equal(parsed.data.min_seqno, '18446744073709551615')
  assert.equal(parsed.data.max_seqno, '9223372036854775807')

  const rawNumeric = '{"code":0,"data":{"messages":[],"e_infos":[],"has_more":1,"min_seqno":18446744073709551615,"max_seqno":9223372036854775807}}'
  const lossless = protocol.parsePrivateMessagesResponse(
    await losslessJson.parsePrivateMessageResponse(createMockResponse(rawNumeric), 'getPrivateMessages'),
  )
  assert.equal(lossless?.data.min_seqno, '18446744073709551615')
  assert.equal(lossless?.data.max_seqno, '9223372036854775807')

  const malformedMetadata = protocol.parsePrivateMessagesResponse({
    code: 0,
    data: {
      messages: [createRawMessage('page-2', '102')],
      e_infos: [],
      has_more: 'unknown',
      min_seqno: 'not-a-seqno',
      max_seqno: null,
    },
  })
  assert.equal(malformedMetadata?.data.messages.length, 1)
  assert.equal(malformedMetadata?.data.has_more, 0)
  assert.equal(malformedMetadata?.data.min_seqno, '')
  assert.equal(malformedMetadata?.data.max_seqno, '')
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

verify('WBI keys survive worker cold starts with scope and MID isolation', async () => {
  const wbi = await import('../src/background/wbiSign')
  assert.equal(typeof wbi.invalidateWbiMemoryCache, 'function')

  const storage = new Map<string, unknown>()
  let now = 1_000_000
  let navRequests = 0
  const runtime = {
    now: () => now,
    fetch: async () => {
      navRequests++
      return createMockResponse(JSON.stringify({
        code: 0,
        data: {
          wbi_img: {
            img_url: 'https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN.png',
            sub_url: 'https://i0.hdslb.com/bfs/wbi/NMLKJIHGFEDCBA9876543210zyxwvutsrqponmlkjihgfedcba.png',
          },
        },
      }))
    },
    getCookies: async () => [],
    storage: {
      get: async (key: string) => ({ [key]: storage.get(key) }),
      set: async (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values))
          storage.set(key, value)
      },
      remove: async (key: string) => { storage.delete(key) },
    },
  }

  wbi.invalidateWbiMemoryCache()
  assert.equal(await wbi.initWbiKeys({ mid: '100' }, runtime), true)
  assert.equal(navRequests, 1)
  wbi.invalidateWbiMemoryCache()
  runtime.fetch = async () => {
    throw new TypeError('nav unavailable')
  }
  assert.equal(await wbi.initWbiKeys({ mid: '100' }, runtime), true)
  assert.equal(navRequests, 1, 'valid persisted cache avoids nav after a worker restart')

  wbi.invalidateWbiMemoryCache()
  runtime.fetch = async () => {
    navRequests++
    return createMockResponse(JSON.stringify({
      code: 0,
      data: {
        wbi_img: {
          img_url: 'https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN.png',
          sub_url: 'https://i0.hdslb.com/bfs/wbi/NMLKJIHGFEDCBA9876543210zyxwvutsrqponmlkjihgfedcba.png',
        },
      },
    }))
  }
  assert.equal(await wbi.initWbiKeys({ mid: '200' }, runtime), true)
  assert.equal(navRequests, 2, 'a different MID cannot restore the authenticated slot')

  wbi.invalidateWbiMemoryCache()
  now += 24 * 60 * 60 * 1000 + 1
  const concurrent = await Promise.all([
    wbi.initWbiKeys({ mid: '200' }, runtime),
    wbi.initWbiKeys({ mid: '200' }, runtime),
  ])
  assert.deepEqual(concurrent, [true, true])
  assert.equal(navRequests, 3, 'concurrent refreshes share one nav request')

  wbi.invalidateWbiMemoryCache({ noCookie: true })
  assert.equal(await wbi.initWbiKeys({ noCookie: true }, runtime), true)
  assert.equal(navRequests, 4, 'anonymous and authenticated slots initialize independently')
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
  }, controller.signal)

  assert.equal(response.code, 0)
  assert.equal(capturedInit?.method, 'POST')
  assert.ok(capturedInit?.body instanceof FormData)
  assert.equal(Object.keys(capturedInit?.headers as Record<string, string>).some(key => key.toLowerCase() === 'content-type'), false)
  assert.equal(capturedInit?.signal, controller.signal)
})

verify('text form transport signs only WBI identity query fields', async ({ transport }) => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  let signedInput: Record<string, unknown> | undefined
  const body = {
    'msg[sender_uid]': '100',
    'msg[receiver_id]': '200',
    'msg[receiver_type]': 1,
    'msg[msg_type]': 1,
    'msg[msg_status]': 0,
    'msg[dev_id]': '123e4567-e89b-42d3-a456-426614174000',
    'msg[timestamp]': 1755000000,
    'msg[new_face_version]': 1,
    'msg[content]': '{"content":"hello"}',
    from_firework: 0,
    build: 0,
    mobi_app: 'web',
    csrf: 'sanitized-csrf',
    csrf_token: 'sanitized-csrf',
  }
  const request = await transport.buildPrivateMessageFormRequest(
    'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg',
    body,
    async (params) => {
      signedInput = { ...params }
      return { ...params, wts: 1755000000, w_rid: 'signed-rid' }
    },
  )
  const response = await transport.requestPrivateMessageForm({
    endpointName: 'sendPrivateMessage',
    ...request,
  }, {
    fetch: async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init
      return createMockResponse('{"code":0,"data":{"msg_key":9223372036854775807}}')
    },
  })

  assert.equal(response.code, 0)
  assert.equal((response.data as { msg_key?: string }).msg_key, '9223372036854775807')
  assert.deepEqual(signedInput, {
    w_sender_uid: '100',
    w_receiver_id: '200',
    w_dev_id: '123e4567-e89b-42d3-a456-426614174000',
  })
  const url = new URL(capturedUrl)
  assert.equal(`${url.origin}${url.pathname}`, 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg')
  assert.equal(url.searchParams.get('w_sender_uid'), '100')
  assert.equal(url.searchParams.get('w_receiver_id'), '200')
  assert.equal(url.searchParams.get('w_dev_id'), '123e4567-e89b-42d3-a456-426614174000')
  assert.equal(url.searchParams.get('wts'), '1755000000')
  assert.equal(url.searchParams.get('w_rid'), 'signed-rid')
  assert.deepEqual([...url.searchParams.keys()].sort(), [
    'w_dev_id',
    'w_receiver_id',
    'w_rid',
    'w_sender_uid',
    'wts',
  ])
  assert.equal(capturedInit?.method, 'POST')
  assert.equal((capturedInit?.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded')
  const form = new URLSearchParams(String(capturedInit?.body))
  assert.equal(form.get('msg[sender_uid]'), '100')
  assert.equal(form.get('msg[receiver_id]'), '200')
  assert.equal(form.get('msg[dev_id]'), '123e4567-e89b-42d3-a456-426614174000')
  assert.equal(form.get('msg[content]'), '{"content":"hello"}')
  assert.equal(form.get('csrf'), 'sanitized-csrf')
  assert.equal(form.get('csrf_token'), 'sanitized-csrf')
  assert.equal(form.has('wts'), false)
  assert.equal(form.has('w_rid'), false)
  assert.equal(request.query.w_dev_id, request.body['msg[dev_id]'])
})

verify('private-message dev_id is generated once and reused from extension-local storage', async () => {
  const { getPrivateMessageDevId } = await import('../src/background/privateMessage/deviceId')
  let storedValue: unknown
  let randomCalls = 0
  let writeCalls = 0
  const dependencies = {
    read: async () => storedValue,
    write: async (_key: string, value: string) => {
      writeCalls++
      storedValue = value
    },
    randomUUID: () => {
      randomCalls++
      return '123e4567-e89b-42d3-a456-426614174000'
    },
  }

  const first = await getPrivateMessageDevId('100', dependencies)
  const second = await getPrivateMessageDevId('100', dependencies)
  assert.equal(first, '123e4567-e89b-42d3-a456-426614174000')
  assert.equal(second, first)
  assert.equal(randomCalls, 1)
  assert.equal(writeCalls, 1)
})

verify('text and image send_msg share the signed query plus form-body transport', async () => {
  const source = await readFile(
    new URL('../src/background/privateMessage/experimental/api.ts', import.meta.url),
    'utf8',
  )
  assert.equal(source.includes('requestPrivateMessageForm'), false)
  assert.equal((source.match(/requestSignedPrivateMessageForm/g) ?? []).length, 2)
  assert.equal((source.match(/sendPrivateMessageForm\(/g) ?? []).length, 3)
})

verify('Chromium DNR scopes message Origin and Referer rewriting to send_msg POST XHR', async () => {
  const rules = JSON.parse(await readFile(
    new URL('../assets/rules.json', import.meta.url),
    'utf8',
  )) as Array<{
    action?: { requestHeaders?: Array<{ header?: string, operation?: string, value?: string }> }
    condition?: { regexFilter?: string, requestMethods?: string[], resourceTypes?: string[] }
  }>
  const sendRule = rules.find(rule => rule.condition?.regexFilter?.includes('web_im/send_msg'))
  assert.ok(sendRule)
  assert.deepEqual(sendRule.condition?.requestMethods, ['post'])
  assert.deepEqual(sendRule.condition?.resourceTypes, ['xmlhttprequest'])
  assert.equal(
    sendRule.condition?.regexFilter,
    '^https://api\\.vc\\.bilibili\\.com/web_im/v1/web_im/send_msg\\?',
  )
  assert.deepEqual(sendRule.action?.requestHeaders, [
    { header: 'origin', operation: 'set', value: 'https://message.bilibili.com' },
    { header: 'referer', operation: 'set', value: 'https://message.bilibili.com/' },
  ])
  const manifestSource = await readFile(new URL('../src/manifest.ts', import.meta.url), 'utf8')
  assert.equal((manifestSource.match(/'declarativeNetRequest'/g) ?? []).length, 1)
  assert.equal((manifestSource.match(/'\*:\/\/\*\.bilibili\.com\/\*'/g) ?? []).length, 1)
})

verify('send_msg DEV diagnostics distinguish HTTP risk control without exposing values', ({
  errors,
  transport,
}) => {
  const diagnostic = transport.createPrivateMessageSendDiagnostic({
    apiResponse: errors.createPrivateMessageErrorResponse('risk-control', 'sendPrivateMessage', {
      httpStatus: 412,
    }),
    body: {
      'msg[sender_uid]': '100',
      'msg[receiver_id]': '200',
      'msg[dev_id]': '123e4567-e89b-42d3-a456-426614174000',
      'msg[content]': '{"content":"must-not-leak"}',
      csrf: 'must-not-leak',
    },
    endpointName: 'sendPrivateMessage',
    query: {
      w_sender_uid: '100',
      w_receiver_id: '200',
      w_dev_id: '123e4567-e89b-42d3-a456-426614174000',
      wts: 1755000000,
      w_rid: 'must-not-leak',
    },
    responseContentType: 'text/html; charset=utf-8',
    responseStatus: 412,
    url: 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg',
  })

  assert.deepEqual(diagnostic, {
    endpoint: 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg',
    httpStatus: 412,
    apiCode: -412,
    responseContentType: 'text/html; charset=utf-8',
    riskControl: true,
    queryFieldNames: ['w_dev_id', 'w_receiver_id', 'w_rid', 'w_sender_uid', 'wts'],
    bodyFieldNames: [
      'csrf',
      'msg[content]',
      'msg[dev_id]',
      'msg[receiver_id]',
      'msg[sender_uid]',
    ],
    devIdMatches: true,
    transport: 'signed-query-form-body',
  })
  assert.equal(JSON.stringify(diagnostic).includes('must-not-leak'), false)
})

verify('code-zero text send responses without data remain eligible for history confirmation', ({ protocol }) => {
  assert.deepEqual(protocol.parsePrivateSendResponse({ code: 0, data: null }), {
    code: 0,
    data: {},
  })
  assert.deepEqual(protocol.parsePrivateSendResponse({ code: 0, data: {} }), {
    code: 0,
    data: {},
  })
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
  const rawMessagesJson = `{"code":0,"data":{"messages":[{"sender_uid":9223372036854775806,"receiver_type":1,"receiver_id":9223372036854775807,"msg_type":1,"content":"sanitized","msg_seqno":9223372036854775799,"timestamp":1755000000,"at_uids":[],"msg_key":9223372036854775798,"msg_status":0,"notify_code":"","new_face_version":0,"msg_source":0}],"e_infos":[{"text":"sanitized"}],"has_more":1,"min_seqno":18446744073709551615,"max_seqno":9223372036854775799}}`
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
  assert.equal(parsedMessages.data.has_more, 1)
  assert.equal(parsedMessages.data.min_seqno, '18446744073709551615')
  assert.equal(parsedMessages.data.max_seqno, '9223372036854775799')
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
  const preferredUnsigned = await transport.requestPrivateMessage({
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
  assert.equal(preferredUnsigned.code, 0)
  assert.equal(fetchAfterWbiFailure, 1)

  await assert.rejects(
    () => transport.signPrivateMessageParams({}, {}, {
      addWbiSign: params => params,
      initWbiKeys: async () => false,
    }),
    (error: unknown) => errors.isPrivateMessageWbiUnavailableError(error),
  )

  for (const response of [login, loginRedirect, risk, server, invalid, api, network, preferredUnsigned]) {
    assert.equal(Object.hasOwn(response, 'raw'), false)
    assert.equal(Object.hasOwn(response.bewlyError ?? {}, 'url'), false)
    assert.equal(Object.hasOwn(response.bewlyError ?? {}, 'stack'), false)
  }
})

verify('preferred private-message transport retries only an API -403 signature rejection', async ({ errors, transport }) => {
  const { PRIVATE_MESSAGE_SIGNING_POLICIES } = await import('../src/background/privateMessage/types')
  assert.equal(PRIVATE_MESSAGE_SIGNING_POLICIES.getPrivateMessages, 'preferred')
  assert.equal(PRIVATE_MESSAGE_SIGNING_POLICIES.ackPrivateSession, 'preferred')
  assert.equal(PRIVATE_MESSAGE_SIGNING_POLICIES.sendPrivateMessage, 'required')

  let fetchCount = 0
  const signCalls: Array<boolean | undefined> = []
  const response = await transport.requestPrivateMessage({
    endpointName: 'getPrivateMessages',
    params: { talker_id: '200' },
    url: 'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
  }, {
    fetch: async () => {
      fetchCount++
      return createMockResponse(fetchCount === 1
        ? '{"code":-403,"data":null}'
        : '{"code":0,"data":{"messages":[],"e_infos":[]}}')
    },
    signParams: async (params, options) => {
      signCalls.push(options?.forceRefresh)
      return { ...params, wts: signCalls.length, w_rid: `signed-${signCalls.length}` }
    },
  })
  assert.equal(response.code, 0)
  assert.equal(fetchCount, 2)
  assert.deepEqual(signCalls, [undefined, true])

  let riskFetchCount = 0
  const risk = await transport.requestPrivateMessage({
    endpointName: 'getPrivateMessages',
    params: { talker_id: '200' },
    url: 'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
  }, {
    fetch: async () => {
      riskFetchCount++
      return createMockResponse('<html>risk control</html>', { contentType: 'text/html', status: 412 })
    },
    signParams: async params => ({ ...params, wts: 1, w_rid: 'signed' }),
  })
  assert.equal(risk.bewlyError?.kind, 'risk-control')
  assert.equal(riskFetchCount, 1)

  let requiredFetchCount = 0
  const required = await transport.requestSignedPrivateMessageForm({
    endpointName: 'sendPrivateMessage',
    body: {
      'msg[sender_uid]': '100',
      'msg[receiver_id]': '200',
      'msg[dev_id]': '123e4567-e89b-42d3-a456-426614174000',
    },
    url: 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg',
  }, {
    fetch: async () => {
      requiredFetchCount++
      return createMockResponse('{"code":0,"data":{}}')
    },
    signParams: async () => { throw new errors.PrivateMessageWbiUnavailableError() },
  })
  assert.equal(required.bewlyError?.kind, 'wbi-unavailable')
  assert.equal(requiredFetchCount, 0)
})

verify('ACK uses preferred signed form POST with CSRF only in the body contract', async ({ errors, protocol, transport }) => {
  const body = protocol.buildPrivateAckParams({
    talkerId: '9223372036854775807',
    ackSeqno: '9223372036854775799',
    csrf: 'sanitized-csrf',
  })
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const response = await transport.requestPreferredPrivateMessageForm({
    endpointName: 'ackPrivateSession',
    body,
    signingParams: {
      talker_id: body.talker_id,
      session_type: body.session_type,
      ack_seqno: body.ack_seqno,
      build: body.build,
      mobi_app: body.mobi_app,
    },
    url: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack',
  }, {
    fetch: async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init
      return createMockResponse('{"code":0,"data":{}}')
    },
    signParams: async params => ({ ...params, wts: 1, w_rid: 'signed' }),
  })
  assert.equal(response.code, 0)
  assert.equal(capturedInit?.method, 'POST')
  assert.equal((capturedInit?.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded')
  const form = new URLSearchParams(String(capturedInit?.body))
  assert.equal(form.get('talker_id'), '9223372036854775807')
  assert.equal(form.get('ack_seqno'), '9223372036854775799')
  assert.equal(form.get('csrf'), 'sanitized-csrf')
  assert.equal(form.get('csrf_token'), 'sanitized-csrf')
  const url = new URL(capturedUrl)
  assert.equal(url.searchParams.get('wts'), '1')
  assert.equal(url.searchParams.get('w_rid'), 'signed')
  assert.equal(url.searchParams.has('csrf'), false)
  assert.equal(url.searchParams.has('csrf_token'), false)

  let unsignedRequests = 0
  const unsigned = await transport.requestPreferredPrivateMessageForm({
    endpointName: 'ackPrivateSession',
    body,
    signingParams: {},
    url: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack',
  }, {
    fetch: async (requestUrl, init) => {
      unsignedRequests++
      assert.equal(new URL(String(requestUrl)).search, '')
      assert.equal(new URLSearchParams(String(init?.body)).get('csrf'), 'sanitized-csrf')
      return createMockResponse('{"code":0,"data":{}}')
    },
    signParams: async () => { throw new errors.PrivateMessageWbiUnavailableError() },
  })
  assert.equal(unsigned.code, 0)
  assert.equal(unsignedRequests, 1)

  const apiSource = await readFile(new URL('../src/background/privateMessage/api.ts', import.meta.url), 'utf8')
  const ackSource = apiSource.slice(apiSource.indexOf('export async function ackPrivateSession'))
  assert.ok(ackSource.includes('requestPreferredPrivateMessageForm'))
  assert.equal(ackSource.includes('requestPrivateMessage({'), false)
})

verify('Chromium rewrites Origin and Referer only for the exact update_ack POST', async () => {
  const rules = JSON.parse(await readFile(
    new URL('../assets/rules.json', import.meta.url),
    'utf8',
  )) as Array<{
    action?: {
      requestHeaders?: Array<{ header?: string, operation?: string, value?: string }>
      type?: string
    }
    condition?: {
      regexFilter?: string
      requestMethods?: string[]
      resourceTypes?: string[]
    }
  }>
  const ackRules = rules.filter(rule => rule.condition?.regexFilter?.includes('update_ack'))
  assert.equal(ackRules.length, 1)
  const [ackRule] = ackRules
  assert.equal(ackRule?.action?.type, 'modifyHeaders')
  assert.deepEqual(ackRule?.condition?.requestMethods, ['post'])
  assert.deepEqual(ackRule?.condition?.resourceTypes, ['xmlhttprequest'])
  assert.equal(
    ackRule?.condition?.regexFilter,
    '^https://api\\.vc\\.bilibili\\.com/session_svr/v1/session_svr/update_ack(?:\\?|$)',
  )
  const headers = new Map(
    ackRule?.action?.requestHeaders?.map(header => [header.header?.toLowerCase(), header]) ?? [],
  )
  assert.deepEqual(headers.get('origin'), {
    header: 'origin',
    operation: 'set',
    value: 'https://message.bilibili.com',
  })
  assert.deepEqual(headers.get('referer'), {
    header: 'referer',
    operation: 'set',
    value: 'https://message.bilibili.com/',
  })
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
  metadata: {
    hasMore?: number
    maxSeqno?: string
    minSeqno?: string
  } = {},
) {
  const seqnos = messages.map(message => message.msg_seqno).sort((left, right) => {
    if (left.length !== right.length)
      return left.length - right.length
    return left.localeCompare(right)
  })
  return {
    code: 0,
    data: {
      messages,
      e_infos: eInfos,
      has_more: metadata.hasMore ?? (messages.length > 0 ? 1 : 0),
      min_seqno: metadata.minSeqno ?? '',
      max_seqno: metadata.maxSeqno ?? seqnos.at(-1) ?? '',
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
  controller.updateScrollTop(240)

  controller.clearSelectedSession()
  assert.equal(controller.selectedSessionKey.value, '')
  assert.equal(controller.selectedTalkerId.value, '')
  assert.equal(controller.state.scrollTop, 240)

  controller.selectSession(controller.state.items[0]!)
  mid.value = '200'
  await nextTick()
  assert.equal(controller.selectedSessionKey.value, '')
  assert.equal(controller.selectedTalkerId.value, '')
  assert.equal(controller.state.scrollTop, 0)
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
  assert.equal(privateSession.isNativePrivateSession(fallbackItem!), true)
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

  const [user, upAssistant, customerService, unfollowed, intercepted, ...fallbackItems] = items
  assert.equal(privateSession.getPrivateSessionProfileUrl(user!), 'https://space.bilibili.com/1000000000000001')
  assert.equal(user?.capabilities.canReadNative, true)
  assert.equal(user?.capabilities.canAck, true)
  assert.equal(user?.capabilities.canOpenProfile, true)
  assert.deepEqual(Object.keys(user?.capabilities ?? {}).sort(), [
    'canAck',
    'canOpenOriginal',
    'canOpenProfile',
    'canReadNative',
    'canSend',
  ])
  assert.equal(user?.capabilities.canSend, true)

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
    assert.equal(assistant?.capabilities.canSend, false)
    assert.equal(assistant?.capabilities.canOpenProfile, false)
    assert.equal(privateSession.getPrivateSessionProfileUrl(assistant!), '')
  }

  for (const item of [unfollowed, intercepted]) {
    assert.equal(item?.capabilities.canReadNative, true)
    assert.equal(item?.capabilities.canAck, true)
    assert.equal(item?.capabilities.canOpenProfile, true)
    assert.equal(item ? privateSession.getPrivateSessionProfileUrl(item).startsWith('https://space.bilibili.com/') : false, true)
  }
  assert.equal(unfollowed?.capabilities.canSend, true)
  assert.equal(intercepted?.capabilities.canSend, false)

  for (const item of fallbackItems) {
    assert.equal(item.capabilities.canReadNative, false)
    assert.equal(item.capabilities.canAck, false)
    assert.equal(item.capabilities.canSend, false)
    assert.equal(item.capabilities.canOpenProfile, false)
    assert.equal(item.capabilities.canOpenOriginal, true)
  }
  assert.equal(items.every(item => Object.keys(item.capabilities).length === 5), true)
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

verify('private-session UI keeps type filters while moving participant identity onto message rows', async () => {
  const [listSource, itemSource, conversationSource, messageSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationListItem.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/PrivateMessageItem.vue', import.meta.url), 'utf8'),
  ])
  assert.ok(listSource.includes('PrivateSessionTypeFilter'))
  assert.ok(listSource.includes('typeFilter'))
  assert.ok(itemSource.includes('session.assistantType'))
  assert.equal(conversationSource.includes('getPrivateSessionProfileUrl'), false)
  assert.equal(conversationSource.includes('conversation-view__header'), false)
  assert.ok(conversationSource.includes(':sender-avatar-url="message.isSelf ? selfAvatarUrl : avatarUrl"'))
  assert.ok(conversationSource.includes(':sender-name="message.isSelf ? selfDisplayName : displayName"'))
  assert.equal(itemSource.includes('<ALink'), false)
  assert.equal((itemSource.match(/<button\b/g) ?? []).length, 1)
  assert.ok(itemSource.includes(`emit('select', session)`))
  assert.ok(messageSource.includes('message.source'))
  assert.ok(messageSource.includes('private-message-item__avatar'))
  assert.ok(messageSource.includes('private-message-item__sender'))
  assert.ok(messageSource.includes('private-message-item--self .private-message-item__message'))
  assert.ok(messageSource.includes('flex-direction: row-reverse'))

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
      'self_label:',
    ]) {
      assert.ok(localeSource.includes(key), `${localeName}: ${key}`)
    }
  }
})

verify('confirmed outgoing text uses a theme bubble and a compact delivery check', async () => {
  const [conversationSource, itemSource, contentSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/PrivateMessageItem.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/PrivateMessageContent.vue', import.meta.url), 'utf8'),
  ])

  assert.match(itemSource, /<PrivateMessageContent[\s\S]{0,240}:is-self="message\.isSelf"/)
  assert.match(contentSource, /'private-message-content__bubble--self':\s*isSelf/)
  assert.match(contentSource, /\.private-message-content__bubble--self\s*\{[\s\S]{0,160}background:\s*var\(--bew-theme-color\)/)
  assert.match(contentSource, /\.private-message-content__bubble--self\s*\{[\s\S]{0,240}color:\s*var\(--bew-on-theme-color\)/)
  assert.match(contentSource, /\.private-message-content__media-placeholder\s*\{[\s\S]{0,220}width:\s*min\(100%/)
  assert.match(itemSource, /\.private-message-item__failed-actions\s*\{[\s\S]{0,120}max-width:\s*100%/)
  assert.doesNotMatch(contentSource, /:global\(\.private-message-item--self\)/)
  assert.match(itemSource, /v-if="message\.isSelf"/)
  assert.match(itemSource, /i-mingcute:check-line/)
  assert.match(itemSource, /sendState === 'failed'/)
  assert.match(itemSource, /notifications\.whisper\.messages\.test_send_success/)
  assert.doesNotMatch(itemSource, /notifications\.whisper\.messages\.sent/)
  assert.match(conversationSource, /lastTextSendOutcome === 'confirmed'[\s\S]{0,80}return ''/)
})

verify('session kinds and capabilities keep native reads separate from disabled writes', ({
  privateConversationRoute,
  privateSession,
}) => {
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
  assert.equal(items[0]?.capabilities.canSend, true)
  assert.equal(items[0]?.capabilities.canOpenProfile, true)
  assert.equal(items[1]?.capabilities.canReadNative, true)
  assert.equal(items[1]?.capabilities.canAck, true)
  assert.equal(items[1]?.capabilities.canSend, false)
  assert.equal(items[1]?.capabilities.canOpenProfile, false)
  assert.equal(items[2]?.capabilities.canAck, true)
  assert.equal(items[2]?.capabilities.canSend, false)
  assert.equal(items[3]?.capabilities.canAck, true)
  assert.equal(items[3]?.capabilities.canSend, true)
  assert.equal(items[4]?.capabilities.canAck, true)
  assert.equal(items[4]?.capabilities.canSend, true)
  assert.equal(items.every(item => Object.keys(item.capabilities).length === 5), true)
  assert.equal(privateSession.isNativePrivateSession(items[0]!), true)
  assert.equal(privateSession.isNativePrivateSession(items[1]!), true)
  assert.equal(privateSession.isNativePrivateSession(items[2]!), true)
  assert.equal(privateSession.isNativePrivateSession(items[3]!), true)
  assert.equal(privateSession.isNativePrivateSession(items[4]!), true)
  assert.equal(items.slice(5).every(item => !privateSession.isNativePrivateSession(item)), true)

  const [unsupportedDirect] = privateSession.transformPrivateSessions([
    createRawSession('8', { session_type: 1, system_msg_type: -1 }),
  ], createCardsResponse([]))
  assert.equal(unsupportedDirect?.kind, 'unsupported')
  assert.equal(unsupportedDirect?.capabilities.canReadNative, false)
  assert.equal(unsupportedDirect?.capabilities.canSend, false)
  assert.deepEqual(privateConversationRoute.parsePrivateConversationRoute(
    privateConversationRoute.buildPrivateConversationUrl({ talkerId: '8', sessionType: 1 }),
  ), { talkerId: '8', sessionType: 1 })
})

verify('whisper keeps reads stable while exposing confirmed text Composer paths only', async ({ notificationSections }) => {
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.whisper.implementation, 'hybrid')
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.whisper.layout, 'workspace')
  assert.equal(notificationSections.isHybridNotificationView('whisper'), true)
  assert.equal(notificationSections.isNotificationView('settings'), false)
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.reply.layout, 'document')
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.system.implementation, 'native')
  assert.equal(notificationSections.NOTIFICATION_SECTION_BY_ID.system.layout, 'document')

  const notificationsSource = await readFile(
    new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url),
    'utf8',
  )
  const conversationSource = await readFile(
    new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url),
    'utf8',
  )
  const composerSource = await readFile(
    new URL('../src/contentScripts/views/Notifications/whisper/experimental/MessageComposer.vue', import.meta.url),
    'utf8',
  )
  const productionApiSource = await readFile(
    new URL('../src/background/privateMessage/api.ts', import.meta.url),
    'utf8',
  )
  const productionControllerSource = await readFile(
    new URL('../src/contentScripts/views/Notifications/whisper/usePrivateMessages.ts', import.meta.url),
    'utf8',
  )
  for (const writeDependency of [
    'uploadPrivateImage',
    'cancelPrivateImageUpload',
    'sendPrivateImageMessage',
  ]) {
    assert.equal(notificationsSource.includes(writeDependency), true, writeDependency)
  }
  assert.equal(notificationsSource.includes('useExperimentalPrivateMessageWrites'), true)
  assert.equal(notificationsSource.includes('__BEWLY_PRIVATE_TEXT_SEND_PROTOCOL_GATE__'), false)
  assert.equal(notificationsSource.includes('private-text-send-protocol-gate'), false)
  assert.equal(notificationsSource.includes('sendPrivateMessage'), true)
  assert.equal(notificationsSource.includes('import.meta.env.DEV'), false)
  assert.equal(conversationSource.includes('MessageComposer'), true)
  assert.equal(conversationSource.includes('import.meta.env.DEV'), false)
  assert.equal(conversationSource.includes('props.session?.capabilities.canSend'), true)
  assert.equal(conversationSource.includes('sendDraft'), true)
  assert.equal(conversationSource.includes('enable-image'), false)
  assert.equal(conversationSource.includes(':image-draft="writeState.imageDraft"'), true)
  assert.equal(conversationSource.includes('controller.refreshLatest'), true)
  assert.equal(productionControllerSource.includes('sendDraft'), false)
  assert.equal(productionControllerSource.includes('sendImage'), false)
  assert.equal(productionControllerSource.includes('optimistic'), false)
  for (const writeApi of [
    'sendPrivateMessage',
    'uploadPrivateImage',
    'sendPrivateImageMessage',
    'cancelPrivateImageUpload',
  ]) {
    assert.equal(productionApiSource.includes(writeApi), true, writeApi)
  }
  assert.equal(composerSource.includes('notifications.whisper.messages.send'), true)
  assert.equal(composerSource.includes('notifications.whisper.messages.test_send'), false)
  assert.equal(composerSource.includes('notifications.whisper.messages.composer_hint'), false)
  assert.equal(composerSource.includes('notifications.whisper.messages.send_original'), false)
  assert.equal(composerSource.includes('testMode'), false)
  assert.equal(conversationSource.includes('notifications.whisper.messages.readonly'), false)
  assert.equal(conversationSource.includes('notifications.whisper.messages.continue_original'), false)
})

verify('private write assets reuse the existing controller while text and image handlers enter the runtime API path', async ({
  api,
  experimentalApi,
}) => {
  const [experimentalApiSource, experimentalControllerSource, experimentalEntrySource, knipSource] = await Promise.all([
    readFile(new URL('../src/background/privateMessage/experimental/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/experimental/usePrivateMessageWrites.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/experimental/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../knip.json', import.meta.url), 'utf8'),
  ])
  assert.ok(experimentalApiSource.includes('Private-message write API handlers'))
  assert.ok(experimentalControllerSource.includes('Private-message write controller'))
  for (const retainedWrite of [
    'sendPrivateMessage',
    'uploadPrivateImage',
    'sendPrivateImageMessage',
    'cancelPrivateImageUpload',
  ]) {
    assert.ok(experimentalApiSource.includes(retainedWrite), retainedWrite)
  }
  assert.ok(experimentalControllerSource.includes('reconcileOptimisticPrivateMessages'))
  assert.ok(experimentalEntrySource.includes(`export type { default as MessageComposer }`))
  assert.ok(experimentalEntrySource.includes(`export * from './privateMessageWriteProtocolGate'`))
  assert.ok(experimentalEntrySource.includes(`export * from './usePrivateMessageWrites'`))
  assert.ok(knipSource.includes('whisper/experimental/index.ts'))
  assert.equal(knipSource.includes('whisper/experimental/MessageComposer.vue'), false)
  assert.equal(knipSource.includes('whisper/experimental/privateMessageWriteProtocolGate.ts'), false)
  assert.deepEqual(Object.keys(api.default).sort(), [
    'ackPrivateSession',
    'cancelPrivateImageUpload',
    'getNewPrivateSessions',
    'getOlderPrivateSessions',
    'getPrivateMessages',
    'getPrivateSessions',
    'getPrivateUserCards',
    'sendPrivateImageMessage',
    'sendPrivateMessage',
    'uploadPrivateImage',
  ])
  assert.equal(typeof experimentalApi.sendPrivateMessage, 'function')
  assert.equal(typeof experimentalApi.uploadPrivateImage, 'function')
  assert.equal(typeof experimentalApi.sendPrivateImageMessage, 'function')
  assert.equal(typeof experimentalApi.cancelPrivateImageUpload, 'function')
})

verify('native message runtime protects cache limits and browser regression gates', async () => {
  const [agentsSource, regressionSource, notificationsSource, messagesSource, workspaceSource, policyFixtureSource] = await Promise.all([
    readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/notifications/read-only-initial-build-regression.md', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/usePrivateMessages.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../tests/fixtures/private-message/read-only-initial-build.json', import.meta.url), 'utf8'),
  ])
  const policyFixture = JSON.parse(policyFixtureSource) as {
    experimentalEvidence: { status: number, verifiedCodeZero: boolean }
    nativeSections: string[]
    privateWritesEnabled: string[]
    systemImplementation: string
    whisperImplementation: string
  }

  for (const baseline of [
    'Native Message Center',
    '打包构建',
    '页面级 LRU',
    'experimental',
    'HTTP `412`',
  ]) {
    assert.ok(agentsSource.includes(baseline), baseline)
  }
  assert.ok(notificationsSource.includes('privateMessages.release()'))
  assert.ok(notificationsSource.includes('maxCachedPrivateConversations'))
  assert.ok(notificationsSource.includes('maxPrivateMessagesPerConversation'))
  assert.ok(messagesSource.includes('historyBoundarySeqno'))
  assert.ok(messagesSource.includes('ackRequests.has'))
  assert.ok(workspaceSource.includes('usePrivateMessagePolling'))
  assert.equal(regressionSource.includes('只有用户明确提交文本后才允许出现 `web_im/send_msg`'), true)
  assert.deepEqual(policyFixture.nativeSections, ['reply', 'at', 'love', 'system'])
  assert.equal(policyFixture.whisperImplementation, 'hybrid-native-text')
  assert.equal(policyFixture.systemImplementation, 'native')
  assert.deepEqual(policyFixture.privateWritesEnabled, ['text'])
  assert.deepEqual(policyFixture.experimentalEvidence, {
    status: 412,
    verifiedCodeZero: false,
  })
  assert.ok(regressionSource.includes('Chrome'), 'Chrome')
})

verify('original-fallback sessions keep available avatars instead of always using initials', async () => {
  const source = await readFile(
    new URL('../src/contentScripts/views/Notifications/whisper/ConversationListItem.vue', import.meta.url),
    'utf8',
  )
  assert.equal(
    (source.match(/v-if="session\.avatar && !avatarFailed"/g) ?? []).length,
    1,
  )
})

verify('all locales expose private-message failures and meaningful text-send states only', async () => {
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
    for (const key of [
      'test_send_success:',
      'test_send_accepted_unconfirmed:',
      'test_send_protocol_mismatch:',
    ]) {
      assert.ok(whisperSource.includes(`      ${key}`), `${localeName} ${key}`)
    }
    for (const removedKey of [
      'readonly:',
      'readonly_title:',
      'readonly_description:',
      'continue_original:',
      'composer_hint:',
      'test_send:',
      'send_original:',
      'search_scope:',
      'open_message_settings:',
    ]) {
      assert.equal(whisperSource.includes(removedKey), false, `${localeName} ${removedKey}`)
    }
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

verify('controlled text send risk-control evidence is sanitized and cannot satisfy the send gate', async () => {
  const fixtureName = 'send-text-risk-control'
  const fixtureUrl = new URL(`../tests/fixtures/private-message/runtime/${fixtureName}.json`, import.meta.url)
  const source = await readFile(fixtureUrl, 'utf8')
  const fixture = await readRuntimeFixture(fixtureName) as {
    request?: {
      body_contains_wbi?: unknown
      dev_id_shared?: unknown
      host?: unknown
      method?: unknown
      path?: unknown
      query_fields?: unknown
      text?: unknown
    }
    response?: {
      classified_code?: unknown
      error_kind?: unknown
      http_status?: unknown
      json_code_observed?: unknown
    }
    history?: { server_confirmed?: unknown }
  }

  assert.equal(/SESSDATA|bili_jct|cookie|351609538|test-test/i.test(source), false)
  assert.equal(/https?:\/\/[^"\s]+\?/i.test(source), false)
  assert.equal(fixture.request?.host, 'api.vc.bilibili.com')
  assert.equal(fixture.request?.path, '/web_im/v1/web_im/send_msg')
  assert.equal(fixture.request?.method, 'POST')
  assert.deepEqual(fixture.request?.query_fields, [
    'w_sender_uid',
    'w_receiver_id',
    'w_dev_id',
    'wts',
    'w_rid',
  ])
  assert.equal(fixture.request?.body_contains_wbi, false)
  assert.equal(fixture.request?.dev_id_shared, true)
  assert.equal(fixture.request?.text, '<redacted>')
  assert.equal(fixture.response?.http_status, 412)
  assert.equal(fixture.response?.error_kind, 'risk-control')
  assert.equal(fixture.response?.classified_code, -412)
  assert.equal(fixture.response?.json_code_observed, false)
  assert.equal(fixture.history?.server_confirmed, false)
})

verify('authenticated history and ACK fixtures preserve the real pagination boundary and unread closure', async ({
  losslessJson,
  privateMessage,
  protocol,
}) => {
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

  const [firstRaw, olderRaw] = await Promise.all([
    losslessJson.parsePrivateMessageResponse(createMockResponse(sources[0]!), 'getPrivateMessages'),
    losslessJson.parsePrivateMessageResponse(createMockResponse(sources[1]!), 'getPrivateMessages'),
  ])
  const [ack, unreadBefore, unreadAfter] = await Promise.all(
    fixtureNames.slice(2).map(readRuntimeFixture),
  ) as [
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
  assert.equal(first.data.has_more, 1)
  assert.equal(older.data.has_more, 1)
  assert.equal(first.data.min_seqno, '8000000000000001')
  assert.equal(older.data.min_seqno, '8000000000000001')
  assert.equal(first.data.max_seqno, '8000000000000120')
  assert.equal(older.data.max_seqno, '8000000000000020')
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

verify('confirmed ACK is not overwritten by an eventually consistent incremental session row', async ({ usePrivateSessions }) => {
  const mid = ref('100')
  let initial = createSessionsResponse([
    createRawSession('200', {
      session_ts: 300,
      unread_count: 4,
      ack_seqno: '100',
      max_seqno: '104',
    }),
  ])
  const incremental = [
    createSessionsResponse([
      createRawSession('200', {
        session_ts: 301,
        unread_count: 4,
        ack_seqno: '100',
        max_seqno: '104',
      }),
    ]),
    createSessionsResponse([
      createRawSession('200', {
        session_ts: 302,
        unread_count: 1,
        ack_seqno: '104',
        max_seqno: '105',
      }),
    ]),
  ]
  const controller = usePrivateSessions.usePrivateSessions(mid, {
    fetchSessions: async () => initial,
    fetchOlderSessions: async () => createSessionsResponse([], 0),
    fetchNewSessions: async () => incremental.shift() ?? createSessionsResponse([]),
    fetchUserCards: async () => createCardsResponse([]),
  })

  await controller.loadInitial()
  controller.markSessionRead('200', '104')
  await controller.refreshNew()
  assert.equal(controller.state.items[0]?.unreadCount, 0)
  assert.equal(controller.state.items[0]?.ackSeqno, '104')

  await controller.refreshNew()
  assert.equal(controller.state.items[0]?.unreadCount, 1)
  assert.equal(controller.state.items[0]?.maxSeqno, '105')

  controller.markSessionRead('200', '105')
  mid.value = '101'
  await nextTick()
  initial = createSessionsResponse([
    createRawSession('200', {
      session_ts: 303,
      unread_count: 1,
      ack_seqno: '104',
      max_seqno: '105',
    }),
  ])
  await controller.loadInitial()
  assert.equal(controller.state.items[0]?.unreadCount, 1)
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

  now += usePrivateSessions.PRIVATE_USER_CARD_CACHE_TTL_MS + 1
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

verify('visibility and whisper activation use independent finite stale windows', async ({ usePrivateSessions }) => {
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
  assert.equal(incrementalRequests, 1)

  now += usePrivateSessions.PRIVATE_SESSION_ACTIVATE_STALE_TIME_MS + 1
  await controller.activate(0)
  assert.equal(incrementalRequests, 2)
})

verify('private-message polling is lifecycle-bound, single-flight, and applies bounded backoff', async () => {
  const polling = await import('../src/contentScripts/views/Notifications/whisper/usePrivateMessagePolling')
  assert.equal(polling.PRIVATE_MESSAGE_POLL_INTERVAL_MS, 20_000)
  assert.equal(polling.PRIVATE_MESSAGE_DETAIL_FALLBACK_MS, 60_000)

  let now = 1_000
  let eligible = true
  let currentMid = '100'
  let sessionMaxSeqno = '100'
  let pendingSessionMaxSeqno = ''
  let sessionError: import('../src/background/privateMessage/types').PrivateMessageTransportErrorKind | null = null
  let sessionRefreshes = 0
  let detailRefreshes = 0
  let detailLoadedAt = now
  let invalidations = 0
  let nextTimerId = 0
  const timers = new Map<number, { delay: number, callback: () => void }>()
  let releaseRefresh: (() => void) | null = null
  let blockRefresh = false

  const coordinator = polling.createPrivateMessagePollingCoordinator({
    getActiveConversation: () => ({
      canReadNative: true,
      maxSeqno: sessionMaxSeqno,
      talkerId: '200',
    }),
    getConversationStatus: () => ({
      errorKind: null,
      failedOperation: null,
      loading: false,
      loadedAt: detailLoadedAt,
    }),
    getCurrentMid: () => currentMid,
    getSessionRefreshError: () => sessionError,
    invalidatePendingRequests: () => { invalidations++ },
    isEligible: () => eligible,
    refreshConversation: async () => {
      detailRefreshes++
      detailLoadedAt = now
    },
    refreshSessions: async () => {
      sessionRefreshes++
      if (blockRefresh) {
        await new Promise<void>((resolve) => {
          releaseRefresh = resolve
        })
      }
      if (pendingSessionMaxSeqno) {
        sessionMaxSeqno = pendingSessionMaxSeqno
        pendingSessionMaxSeqno = ''
      }
    },
  }, {
    clearTimeout: id => timers.delete(id as unknown as number),
    now: () => now,
    setTimeout: (callback, delay) => {
      const id = ++nextTimerId
      timers.set(id, { callback, delay })
      return id as unknown as ReturnType<typeof setTimeout>
    },
  })

  coordinator.sync()
  await coordinator.triggerNow()
  assert.equal(sessionRefreshes, 1)
  assert.deepEqual([...timers.values()].map(timer => timer.delay), [20_000])

  pendingSessionMaxSeqno = '101'
  await coordinator.triggerNow()
  assert.equal(detailRefreshes, 1, 'a newer session max_seqno refreshes the selected detail')

  now += 60_000
  await coordinator.triggerNow()
  assert.equal(detailRefreshes, 2, 'the active detail receives a 60 second safety refresh')

  blockRefresh = true
  const first = coordinator.triggerNow()
  const overlapping = coordinator.triggerNow()
  assert.equal(sessionRefreshes, 4, 'overlapping triggers reuse the active poll')
  const unblockRefresh = releaseRefresh as (() => void) | null
  unblockRefresh?.()
  blockRefresh = false
  await Promise.all([first, overlapping])

  sessionError = 'network'
  for (const expectedDelay of [20_000, 40_000, 80_000, 120_000]) {
    await coordinator.triggerNow()
    assert.deepEqual([...timers.values()].map(timer => timer.delay), [expectedDelay])
  }
  sessionError = null
  await coordinator.triggerNow()
  assert.deepEqual([...timers.values()].map(timer => timer.delay), [20_000])

  sessionError = 'risk-control'
  await coordinator.triggerNow()
  assert.deepEqual([...timers.values()].map(timer => timer.delay), [120_000])

  eligible = false
  coordinator.sync()
  assert.equal(timers.size, 0)
  assert.equal(invalidations > 0, true)
  const stoppedCount = sessionRefreshes
  await coordinator.triggerNow()
  assert.equal(sessionRefreshes, stoppedCount)

  eligible = true
  sessionError = null
  coordinator.sync()
  await coordinator.triggerNow()
  assert.equal(sessionRefreshes, stoppedCount + 1, 'resuming eligibility runs one immediate poll')

  const invalidationsBeforeAccountChange = invalidations
  const refreshesBeforeAccountChange = sessionRefreshes
  currentMid = '200'
  coordinator.sync()
  await coordinator.triggerNow()
  assert.equal(invalidations, invalidationsBeforeAccountChange + 1)
  assert.equal(sessionRefreshes, refreshesBeforeAccountChange + 1)
  coordinator.dispose()
  assert.equal(timers.size, 0)
})

verify('private-message polling runtime keeps browser timer receivers bound', async () => {
  const polling = await import('../src/contentScripts/views/Notifications/whisper/usePrivateMessagePolling')
  const createRuntime = Reflect.get(polling, 'createPrivateMessagePollingRuntime')
  assert.equal(typeof createRuntime, 'function')

  const timerHost = {
    clearTimeout(this: unknown, timer: ReturnType<typeof setTimeout>) {
      assert.equal(this, timerHost)
      assert.equal(timer, 7)
    },
    setTimeout(this: unknown, callback: () => void, delay: number) {
      assert.equal(this, timerHost)
      assert.equal(delay, 20_000)
      callback()
      return 7 as unknown as ReturnType<typeof setTimeout>
    },
  }
  const runtime = createRuntime(timerHost) as {
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
    setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  }
  let called = false
  const timer = runtime.setTimeout(() => {
    called = true
  }, 20_000)
  runtime.clearTimeout(timer)
  assert.equal(called, true)
})

verify('Whisper owns the only visibility refresh path and uses recursive timeout polling', async () => {
  const [workspaceSource, conversationSource, pollingSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/usePrivateMessagePolling.ts', import.meta.url), 'utf8'),
  ])
  assert.ok(workspaceSource.includes('usePrivateMessagePolling'))
  assert.equal(conversationSource.includes(`document.addEventListener('visibilitychange'`), false)
  assert.equal(conversationSource.includes(`document.removeEventListener('visibilitychange'`), false)
  assert.ok(pollingSource.includes(`document.addEventListener('visibilitychange'`))
  assert.ok(pollingSource.includes('setTimeout'))
  assert.equal(pollingSource.includes('setInterval'), false)
})

verify('conversation list wires one bottom sentinel without development scope copy', async () => {
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
  assert.equal(listSource.includes(`notifications.whisper.search_scope`), false)
  assert.ok(listSource.includes('onBeforeUnmount(disconnectObserver)'))
  assert.ok(workspaceSource.includes('usePrivateMessagePolling'))
  assert.ok(notificationsSource.includes('getOlderPrivateSessions'))
  assert.ok(notificationsSource.includes('getNewPrivateSessions'))
  assert.equal(`${listSource}\n${workspaceSource}\n${notificationsSource}`.includes('setInterval('), false)
  for (const localeSource of localeSources) {
    assert.equal(localeSource.includes('search_scope:'), false)
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
  assert.ok(notificationsSource.includes('window.history.back()'))
  assert.ok(notificationsSource.includes('createPrivateConversationHistoryState'))
  assert.ok(notificationsSource.includes('isPrivateConversationHistoryState'))
  assert.ok(notificationsSource.includes('window.history.replaceState'))
  assert.ok(notificationsSource.includes('watch(currentMid'))
  assert.ok(workspaceSource.includes(`emit('selectSession'`))
  assert.ok(workspaceSource.includes(`emit('closeConversation'`))
  assert.equal(itemSource.includes('buildOriginalNotificationUrl'), false)
  assert.equal(itemSource.includes('<ALink'), false)
  assert.ok(itemSource.includes(`emit('select', session)`))
  assert.ok(notificationsSource.includes('clearPrivateConversationHistoryState'))
  assert.ok(notificationsSource.includes('sessionType: session.sessionType'))
  assert.equal(notificationsSource.includes(`addEventListener('popstate'`), false)
  assert.equal(workspaceSource.includes(`addEventListener('popstate'`), false)
  assert.equal([notificationsSource, workspaceSource, itemSource].some(source => /#\/whisper\//.test(source)), false)
})

verify('conversation expansion transitions compact, expanding, history-open, and back to compact', ({ conversationExpansion }) => {
  const compact = { ...conversationExpansion.COMPACT_CONVERSATION_EXPANSION }
  const progress = conversationExpansion.calculateConversationTopProgress({
    clientHeight: 600,
    scrollHeight: 1800,
    scrollTop: 80,
  }, {
    atLatest: false,
  })
  assert.equal(progress, 1)

  const expanding = conversationExpansion.reduceConversationExpansion(compact, {
    type: 'scroll',
    atLatest: false,
    noMore: false,
    progress,
  })
  assert.deepEqual(expanding, { state: 'expanding', topExpansionProgress: 1 })

  const loading = conversationExpansion.reduceConversationExpansion(expanding, {
    type: 'load-start',
    noMore: false,
  })
  assert.deepEqual(loading, { state: 'expanding', topExpansionProgress: 1 })

  const historyOpen = conversationExpansion.reduceConversationExpansion(loading, {
    type: 'load-end',
    noMore: false,
  })
  assert.deepEqual(historyOpen, { state: 'history-open', topExpansionProgress: 1 })
  assert.equal(conversationExpansion.getConversationLayoutProgress(historyOpen), 1)

  const atHistoryStart = conversationExpansion.reduceConversationExpansion(historyOpen, {
    type: 'scroll',
    atLatest: false,
    noMore: true,
    progress: 1,
  })
  assert.deepEqual(atHistoryStart, { state: 'history-open', topExpansionProgress: 1 })
  assert.equal(conversationExpansion.getConversationLayoutProgress(atHistoryStart), 1)
  assert.deepEqual(conversationExpansion.reduceConversationExpansion(compact, {
    type: 'scroll',
    atLatest: false,
    noMore: true,
    progress: 1,
  }), { state: 'history-open', topExpansionProgress: 1 })
  assert.equal(conversationExpansion.shouldCollapseConversationAtLatest({
    physicalAtLatest: true,
    requestedLatest: false,
    userHasReadUpward: true,
  }), false)
  assert.equal(conversationExpansion.shouldCollapseConversationAtLatest({
    physicalAtLatest: true,
    requestedLatest: true,
    userHasReadUpward: true,
  }), true)

  const returning = conversationExpansion.reduceConversationExpansion(atHistoryStart, {
    type: 'scroll',
    atLatest: true,
    noMore: true,
    progress: 0,
  })
  assert.deepEqual(returning, { state: 'expanding', topExpansionProgress: 0 })
  assert.deepEqual(
    conversationExpansion.reduceConversationExpansion(returning, { type: 'settle' }),
    compact,
  )
  const expandedGeometry = conversationExpansion.calculateConversationExpandedGeometry({
    bottom: 740,
    top: 140,
    viewportHeight: 900,
  }, false)
  assert.deepEqual(expandedGeometry, {
    extraHeight: 316,
    topLift: -148,
  })
  assert.deepEqual(conversationExpansion.getConversationExpansionGeometry({
    bottom: 1,
    top: 1,
  }, false, expandedGeometry), expandedGeometry)
  assert.deepEqual(conversationExpansion.getConversationExpansionGeometry({
    bottom: 1,
    top: 0,
  }, false, expandedGeometry), {
    extraHeight: 168,
    topLift: 0,
  })
  assert.deepEqual(conversationExpansion.getConversationExpansionGeometry({
    bottom: 1,
    top: 1,
  }, true, expandedGeometry), {
    extraHeight: 0,
    topLift: 0,
  })
  assert.deepEqual(conversationExpansion.getConversationCornerProgress(compact), {
    bottom: 1,
    top: 1,
  })
  assert.deepEqual(conversationExpansion.getConversationCornerProgress(historyOpen), {
    bottom: 0,
    top: 0,
  })
  assert.deepEqual(conversationExpansion.getConversationCornerProgress(atHistoryStart), {
    bottom: 0,
    top: 0,
  })
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

  assert.ok(workspaceSource.includes(`'whisper-workspace--detail': Boolean(selectedSession || transientRecipient)`))
  assert.ok(workspaceSource.includes('breakpoints.$mobile-max'))
  assert.ok(workspaceSource.includes('translateX(100%)'))
  assert.ok(workspaceSource.includes('translateX(-100%)'))
  assert.ok(workspaceSource.includes('var(--bew-duration-normal)'))
  assert.ok(workspaceSource.includes('@media (prefers-reduced-motion: reduce)'))
  assert.ok(workspaceSource.includes('controller.state.scrollTop'))
  assert.ok(workspaceSource.includes('restoreScrollTop'))
  assert.ok(workspaceSource.includes('focusSession'))
  assert.ok(listSource.includes('defineExpose'))
  assert.ok(listSource.includes('getScrollTop'))
  assert.ok(listSource.includes('restoreScrollTop'))
  assert.ok(listSource.includes('focusSession'))
  assert.ok(listSource.includes('handleListKeydown'))
  assert.ok(listSource.includes('@keydown="handleListKeydown"'))
  assert.ok(itemSource.includes(':data-session-key="session.key"'))
  assert.ok(conversationSource.includes('<CloseButton'))
  assert.ok(conversationSource.includes('conversation-view__close'))
  assert.ok(conversationSource.includes(`:label="t('common.close')"`))
  assert.ok(conversationSource.includes('focusHeading'))
  assert.ok(conversationSource.includes('@keydown.esc="handleEscape"'))
  assert.ok(conversationSource.includes('LAYOUT_BREAKPOINTS.mobileMax'))
  assert.equal(conversationSource.includes(`window.addEventListener('keydown'`), false)
  for (const localeSource of localeSources)
    assert.ok(localeSource.includes('back_to_conversations:'))
})

verify('readonly history restores stable message anchors and gates received image loading', async () => {
  const [conversationSource, contentSource, storageSource, ...localeSources] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/PrivateMessageContent.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/logic/storage.ts', import.meta.url), 'utf8'),
    ...['cmn-CN', 'cmn-TW', 'en', 'jyut'].map(locale => (
      readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8')
    )),
  ])

  assert.ok(conversationSource.includes('captureVisibleMessageAnchor'))
  assert.ok(conversationSource.includes('[data-message-id]'))
  assert.ok(conversationSource.includes('viewport.scrollHeight - oldScrollHeight'))
  assert.ok(conversationSource.includes('settings.autoLoadPrivateMessageImages'))
  assert.ok(contentSource.includes('autoLoadImages'))
  assert.ok(contentSource.includes('notifications.whisper.messages.click_load_image'))
  assert.ok(contentSource.includes('notifications.whisper.messages.image_load_failed'))
  assert.ok(contentSource.includes('loading="lazy"'))
  assert.ok(contentSource.includes('decoding="async"'))
  assert.ok(storageSource.includes('autoLoadPrivateMessageImages: boolean'))
  assert.ok(storageSource.includes('autoLoadPrivateMessageImages: true'))
  for (const localeSource of localeSources) {
    assert.ok(localeSource.includes('click_load_image:'))
    assert.ok(localeSource.includes('image_load_failed:'))
  }
})

verify('message settings live in the global Bewly settings page and the old section redirects once', async () => {
  const [
    messagesPageSource,
    navigationSource,
    notificationsSource,
    sectionsSource,
    routeSource,
    searchSource,
    storageSource,
    appProviderSource,
    conversationSource,
    workspaceSource,
    conversationListSource,
    settingsCategorySource,
    ...localeSources
  ] = await Promise.all([
    readFile(new URL('../src/components/Settings/PluginComponentsAndPages/MessagesPage/MessagesPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NotificationsNavigation.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/notificationSections.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/notificationRoute.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Settings/searchCatalog.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/logic/storage.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useAppProvider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Settings/components/SettingsCategoryLayout.vue', import.meta.url), 'utf8'),
    ...['cmn-CN', 'cmn-TW', 'en', 'jyut'].map(locale => (
      readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8')
    )),
  ])

  assert.equal(sectionsSource.includes(`| 'settings'`), false)
  assert.equal(sectionsSource.includes(`id: 'settings'`), false)
  assert.ok(routeSource.includes(`buildOriginalNotificationUrl('settings')`))
  assert.ok(routeSource.includes('ORIGINAL_MESSAGE_SETTINGS_URL'))
  assert.ok(notificationsSource.includes('normalizeNotificationRoute'))
  assert.ok(notificationsSource.includes('routeReady'))
  assert.ok(notificationsSource.includes('openSettingsAt'))
  assert.equal(navigationSource.includes(`(event: 'openSettings'): void`), false)
  assert.equal(navigationSource.includes('notifications-navigation__settings'), false)
  assert.equal(navigationSource.includes(`@click="emit('openSettings')"`), false)
  assert.equal(notificationsSource.includes('handleOpenMessagesSettings'), false)
  assert.equal(notificationsSource.includes('@open-settings="handleOpenMessagesSettings"'), false)
  assert.ok(appProviderSource.includes('openSettingsAt'))
  assert.equal(messagesPageSource.includes('SettingsSectionHeading'), false)
  for (const setting of [
    'autoMarkPrivateMessagesRead',
    'followNewPrivateMessages',
    'autoLoadPrivateMessageImages',
    'showOfficialPrivateAssistants',
    'privateMessageDensity',
    'maxPrivateMessagesPerConversation',
    'maxCachedPrivateConversations',
    'privateMessageMobileOpenMode',
  ]) {
    assert.ok(messagesPageSource.includes(`settings.${setting}`), setting)
    assert.ok(storageSource.includes(`${setting}:`), setting)
  }
  assert.equal(messagesPageSource.includes('ORIGINAL_MESSAGE_SETTINGS_URL'), false)
  assert.ok(messagesPageSource.includes('useMessageServerSettings'))
  assert.ok(messagesPageSource.includes('api.messageServerSettings'))
  assert.ok(searchSource.includes(`secondaryPage: 'messages'`))
  assert.ok(searchSource.includes('settings.messages_auto_mark_read'))
  assert.ok(conversationSource.includes('settings.value.autoMarkPrivateMessagesRead'))
  assert.ok(conversationSource.includes('settings.value.followNewPrivateMessages'))
  assert.ok(workspaceSource.includes('settings.showOfficialPrivateAssistants'))
  assert.ok(workspaceSource.includes('settings.privateMessageDensity'))
  assert.ok(conversationListSource.includes('showOfficialAssistants'))
  assert.ok(conversationListSource.includes('conversation-list--compact'))
  assert.ok(settingsCategorySource.includes('color: var(--bew-theme-color)'))
  assert.ok(settingsCategorySource.includes('background: var(--bew-theme-color-10)'))
  assert.equal(settingsCategorySource.includes('color: var(--bew-theme-foreground)'), false)
  assert.ok(notificationsSource.includes('lastPrivateConversationRoute'))
  assert.ok(notificationsSource.includes('privateMessageMobileOpenMode'))
  for (const localeSource of localeSources) {
    assert.ok(localeSource.includes('messages_auto_mark_read:'))
    assert.ok(localeSource.includes('messages_server_block_words:'))
    assert.equal(localeSource.includes('messages_original_settings:'), false)
    assert.equal(localeSource.includes('open_message_settings:'), false)
  }
})

verify('message interaction shell keeps selection internal, settings typed, and surfaces independently layered', async () => {
  const [
    itemSource,
    listSource,
    workspaceSource,
    emptySource,
    fallbackSource,
    conversationSource,
    notificationsSource,
    navigationSource,
    pageHeaderSource,
    sectionsSource,
    routeSource,
    appProviderSource,
    appSource,
    settingsSource,
    messagesPageSource,
    settingsCategorySource,
  ] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationListItem.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationEmptyState.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationOriginalFallback.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NotificationsNavigation.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NotificationsPageHeader.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/notificationSections.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/notificationRoute.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useAppProvider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Settings/Settings.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Settings/PluginComponentsAndPages/MessagesPage/MessagesPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Settings/components/SettingsCategoryLayout.vue', import.meta.url), 'utf8'),
  ])

  assert.equal((itemSource.match(/<button\b/g) ?? []).length, 1)
  assert.equal(itemSource.includes('<ALink'), false)
  assert.ok(itemSource.includes('type="button"'))
  assert.ok(itemSource.includes(':aria-current="selected'))
  assert.ok(itemSource.includes(`@click="emit('select', session)"`))
  assert.equal((listSource.match(/<ConversationListItem\b/g) ?? []).length, 1)
  assert.ok(listSource.includes('v-for="session in filteredItems"'))
  assert.ok(listSource.includes(`@select="emit('select', $event)"`))

  assert.equal(workspaceSource.includes('OriginalNotificationsFrame'), false)
  assert.ok(workspaceSource.includes('<ConversationEmptyState v-else-if="!selectedSession && !transientRecipient"'))
  assert.ok(workspaceSource.includes('<ConversationView'))
  assert.ok(workspaceSource.includes('<ConversationOriginalFallback'))
  assert.ok(workspaceSource.includes(`'whisper-workspace--detail': Boolean(selectedSession || transientRecipient)`))
  assert.equal(workspaceSource.includes('originalFrameRef'), false)
  assert.equal(workspaceSource.includes('.reload()'), false)
  assert.ok(emptySource.includes('notifications.whisper.select_conversation_empty'))
  assert.ok(fallbackSource.includes('notifications.whisper.open_original_list'))
  assert.ok(fallbackSource.includes('buildOriginalNotificationUrl'))
  assert.ok(fallbackSource.includes('conversation-original-fallback__back'))

  const selectConversationSource = notificationsSource.slice(
    notificationsSource.indexOf('function selectPrivateConversation'),
    notificationsSource.indexOf('function closePrivateConversation'),
  )
  assert.ok(selectConversationSource.includes('sessionType: session.sessionType'))
  assert.ok(selectConversationSource.includes('window.history.pushState'))
  assert.equal(selectConversationSource.includes('canReadNative'), false)
  assert.ok(notificationsSource.includes('window.history.back()'))
  assert.ok(notificationsSource.includes('clearPrivateConversationRoute'))
  assert.ok(notificationsSource.includes('applyPendingPrivateConversationRoute'))
  assert.equal(notificationsSource.includes('originalView'), false)
  assert.equal(notificationsSource.includes('OriginalNotificationsFrame'), false)
  assert.ok(sectionsSource.includes(`export type NativeNotificationSection = 'reply' | 'at' | 'love' | 'system'`))
  assert.equal(sectionsSource.includes(`| 'settings'`), false)

  assert.equal(navigationSource.includes(`(event: 'openSettings'): void`), false)
  assert.equal(navigationSource.includes('notifications-navigation__settings'), false)
  assert.equal(navigationSource.includes(`@click="emit('openSettings')"`), false)
  assert.equal(notificationsSource.includes('@open-settings="handleOpenMessagesSettings"'), false)
  assert.ok(routeSource.includes(`settings: 'config'`))
  assert.ok(routeSource.includes(`view: 'whisper'`))
  assert.ok(routeSource.includes('openMessageSettings: true'))
  assert.ok(notificationsSource.indexOf('v-if="!routeReady"') < notificationsSource.lastIndexOf('<NativeNotificationFeed'))
  assert.ok(notificationsSource.includes(`openSettingsAt({ category: 'bewly-pages', page: 'messages' })`))
  assert.ok(appProviderSource.includes(`category: 'bewly-pages'`))
  assert.ok(appProviderSource.includes(`page: 'messages'`))
  assert.ok(appSource.includes('settingsNavigationRequest'))
  assert.ok(settingsSource.includes('navigationRequest'))
  const primarySelectedStyle = settingsSource.slice(
    settingsSource.indexOf('.menu-item-activated'),
    settingsSource.indexOf('.settings-primary-navigation__list'),
  )
  assert.ok(primarySelectedStyle.includes('background: var(--bew-theme-color)'))
  assert.ok(primarySelectedStyle.includes('color: var(--bew-on-theme-color)'))
  assert.equal(primarySelectedStyle.includes('--bew-theme-color-auto'), false)
  assert.equal(primarySelectedStyle.includes('--bew-text-auto'), false)
  assert.equal(messagesPageSource.includes('SettingsSectionHeading'), false)
  assert.equal(messagesPageSource.includes('ORIGINAL_MESSAGE_SETTINGS_URL'), false)
  assert.ok(messagesPageSource.includes('useMessageServerSettings'))
  assert.ok(settingsCategorySource.includes('color: var(--bew-theme-color)'))
  assert.ok(settingsCategorySource.includes('background: var(--bew-theme-color-10)'))

  const workspaceLayoutStyle = workspaceSource.slice(
    workspaceSource.indexOf('.whisper-workspace {'),
    workspaceSource.indexOf('.whisper-workspace__sessions,'),
  )
  assert.ok(workspaceLayoutStyle.includes('background: transparent'))
  assert.ok(workspaceLayoutStyle.includes('gap: var(--bew-space-4)'))
  assert.equal(workspaceLayoutStyle.includes('border:'), false)
  assert.equal(workspaceLayoutStyle.includes('backdrop-filter:'), false)
  assert.ok(workspaceSource.includes('conversation-list-card'))
  assert.ok(notificationsSource.includes('--notifications-conversation-list-max-width'))
  assert.ok(notificationsSource.includes('--notifications-navigation-width'))
  assert.ok(navigationSource.includes('useResizeObserver(insideRef, measureNavigationWidth)'))
  assert.ok(navigationSource.includes(`emit('widthChange', width)`))
  assert.ok(pageHeaderSource.includes(`emit('navigationWidthChange', $event)`))
  assert.ok(navigationSource.includes('width: min(100%, var(--notifications-conversation-list-width))'))
  assert.ok(workspaceSource.includes('var(--notifications-conversation-list-width)'))
  assert.match(workspaceSource, /\.whisper-workspace__sessions\s*\{[\s\S]{0,180}height:\s*100%/)
  assert.match(workspaceSource, /\.whisper-workspace__detail\s*\{[\s\S]{0,120}height:\s*100%/)
  assert.ok(workspaceSource.includes('background: var(--bew-elevated-alt)'))
  assert.ok(workspaceSource.includes('overflow: hidden'))
  assert.equal(workspaceSource.includes('--bew-homepage-bg'), false)
  assert.ok(emptySource.includes('conversation-empty-state__tips'))
  assert.ok(emptySource.includes('background: transparent'))
  assert.ok(conversationSource.includes('class="conversation-card"'))
  assert.ok(conversationSource.includes('background: var(--bew-elevated-alt)'))
  assert.ok(conversationSource.includes('backdrop-filter: var(--bew-filter-glass-1)'))
  assert.ok(conversationSource.includes('conversation-view__floating-composer'))
  assert.ok(conversationSource.includes('conversation-view__close'))
  assert.equal(conversationSource.includes('conversation-view__header'), false)
  assert.ok(conversationSource.includes('conversation-card__top-edge'))
  assert.ok(conversationSource.includes('conversation-card__bottom-edge'))
  assert.equal(conversationSource.includes('--bew-homepage-bg'), false)
  assert.equal(conversationSource.includes('--bew-elevated-solid'), false)
  assert.ok(fallbackSource.includes('background: transparent'))
  assert.ok(conversationSource.includes(`data-expansion-state`))
  assert.ok(conversationSource.includes('expansionModel.state'))
  assert.ok(conversationSource.includes('requestAnimationFrame(processScrollFrame)'))
  assert.ok(conversationSource.includes('cancelAnimationFrame(scrollFrameId)'))
  assert.ok(conversationSource.includes('new ResizeObserver'))
  assert.ok(conversationSource.includes('conversationResizeObserver.observe(conversationViewRef.value)'))
  assert.equal(conversationSource.includes('conversationResizeObserver.observe(messageScrollRef.value)'), false)
  assert.ok(conversationSource.includes('conversationResizeObserver?.disconnect()'))
  assert.ok(conversationSource.includes('isLayoutTransitioning'))
  assert.ok(conversationSource.includes('beginLayoutTransition('))
  assert.ok(conversationSource.includes('completeLayoutTransition'))
  assert.equal(conversationSource.includes('compactSettlementTimer'), false)
  assert.ok(conversationSource.includes('directScrollGestureActive'))
  assert.ok(conversationSource.includes('layoutTransitionTarget'))
  assert.ok(conversationSource.includes('layoutProgress.value > 0'))
  assert.ok(conversationSource.includes('initialScrollGeneration !== scrollInteractionGeneration'))
  assert.ok(conversationSource.includes('conversationActivationPending'))
  assert.ok(conversationSource.includes('state.value.newMessagesAvailable'))
  assert.match(conversationSource, /function applyReadingDirection\([\s\S]{0,180}scrollInteractionGeneration\+\+/)
  assert.match(conversationSource, /function handleScroll\(\)[\s\S]{0,420}applyReadingDirection/)
  assert.ok(conversationSource.includes('@touchmove.passive="handleDirectGestureMove"'))
  assert.ok(conversationSource.includes(`window.addEventListener('pointerup', endDirectScrollGesture`))
  assert.ok(conversationSource.includes('will-change: height, transform, border-radius'))
  const conversationCardStyle = conversationSource.slice(
    conversationSource.indexOf('.conversation-card {'),
    conversationSource.indexOf('.conversation-view--layout-transitioning'),
  )
  assert.ok(conversationCardStyle.includes('var(--bew-ease-standard)'))
  assert.equal(conversationCardStyle.includes('var(--bew-ease-emphasized)'), false)
  assert.ok(conversationSource.includes('requestLayoutGeneration === layoutGeneration'))
  assert.ok(conversationSource.includes('requestScrollGeneration === scrollInteractionGeneration'))
  assert.ok(conversationSource.includes('requestLifecycleEpoch === props.controller.lifecycleEpoch.value'))
  assert.ok(conversationSource.includes('requestStateGeneration === state.value.generation'))
  assert.ok(conversationSource.includes(`state.value.failedOperation !== 'load-older'`))
  assert.ok(conversationSource.includes('!state.value.paginationStalled'))
  assert.match(conversationSource, /watch\(talkerId,[\s\S]{0,100}resetConversationExpansion\(\)/)
  assert.ok(conversationSource.includes('restoreVisibleMessageAnchor(viewport, anchor)'))
  assert.ok(conversationSource.includes('readVerticalScrollPadding(viewport)'))
  assert.ok(conversationSource.includes('messageContentGrowth'))
  assert.ok(conversationSource.includes('viewport.scrollHeight - oldScrollHeight'))
  assert.ok(conversationSource.includes('lastProcessedScrollTop = viewport.scrollTop'))
  assert.ok(conversationSource.includes('--conversation-top-radius'))
  assert.ok(conversationSource.includes('--conversation-bottom-radius'))
  assert.ok(conversationSource.includes('--conversation-extra-height'))
  assert.match(conversationSource, /--conversation-top-expansion/)
  assert.match(conversationSource, /--conversation-bottom-expansion/)
  assert.match(conversationSource, /\.conversation-view__messages\s*\{[\s\S]{0,520}var\(--conversation-top-expansion, 0px\)/)
  assert.match(conversationSource, /\.conversation-view__messages\s*\{[\s\S]{0,700}var\(--conversation-bottom-expansion, 0px\)/)
  assert.match(conversationSource, /\.conversation-view__messages\s*\{[\s\S]{0,820}overflow-anchor:\s*none/)
  assert.match(conversationSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,160}\.conversation-view__messages/)
  assert.match(conversationSource, /activateConversation\(\)[\s\S]{0,1200}updateConversationGeometry\(\)/)
  assert.match(conversationSource, /\.conversation-view\s*\{[\s\S]{0,240}height:\s*100%/)
  assert.match(conversationSource, /\.conversation-card\s*\{[\s\S]{0,320}height:\s*calc\(100% \+ var\(--conversation-extra-height/)
  assert.ok(notificationsSource.includes('overflow: visible'))
  assert.match(
    notificationsSource,
    /\.bewly-scroll-viewport:has\(\.notifications-page--workspace\)[\s\S]{0,100}overflow-y:\s*hidden/,
  )
  assert.equal(notificationsSource.includes('--notifications-dock-safe-space'), false)
  assert.ok(conversationSource.includes('--conversation-new-message-reserve'))
  assert.match(conversationSource, /\.conversation-view__floating-composer\s*\{[\s\S]{0,120}position:\s*absolute/)
  assert.equal(conversationSource.includes('--conversation-edge-left'), false)
  assert.equal(conversationSource.includes('--conversation-edge-right'), false)
  assert.equal(conversationSource.includes('--conversation-edge-top'), false)
  assert.equal(conversationSource.includes('--conversation-edge-bottom'), false)
  assert.match(conversationSource, /\.conversation-card__top-edge,[\s\S]{0,180}position:\s*absolute/)
  assert.match(conversationSource, /\.conversation-card__top-edge\s*\{[\s\S]{0,180}border-top-left-radius:\s*inherit/)
  assert.match(conversationSource, /\.conversation-card__bottom-edge\s*\{[\s\S]{0,180}border-bottom-right-radius:\s*inherit/)
  assert.ok(conversationSource.includes('top: layoutProgress.value'))
  assert.equal(conversationSource.includes('MutationObserver'), false)
  assert.equal(pageHeaderSource.includes('<ALink'), false)
  assert.equal(pageHeaderSource.includes('<Button'), false)
  assert.equal(pageHeaderSource.includes('descriptionKey'), false)
  assert.equal(pageHeaderSource.includes('--bew-content-solid'), false)

  for (const imageWrite of ['uploadPrivateImage', 'sendPrivateImageMessage']) {
    assert.equal(notificationsSource.includes(imageWrite), true, imageWrite)
    assert.equal(conversationSource.includes(imageWrite), false, imageWrite)
  }
  assert.equal(notificationsSource.includes('upload_bfs'), false)
  assert.equal(conversationSource.includes('upload_bfs'), false)
  assert.equal(notificationsSource.includes('sendPrivateMessage'), true)
  assert.equal(conversationSource.includes('MessageComposer'), true)
  assert.equal(conversationSource.includes('v-if="isTextSendEnabled && writeState"'), true)
  assert.equal(conversationSource.includes('enable-image'), false)
  assert.equal(conversationSource.includes('@select-image="selectImage"'), true)
  assert.equal(conversationSource.includes(`t('notifications.whisper.messages.test_send')`), false)
  assert.equal(conversationSource.includes('notifications.whisper.messages.readonly'), false)
  assert.equal(conversationSource.includes('notifications.whisper.messages.continue_original'), false)
  assert.equal(sectionsSource.includes('notifications.sections.whisper.description'), false)
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
        type: 'emote',
        text: '[smile]',
        url: 'https://i0.hdslb.com/sanitized-emoji.gif',
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
      type: 'emote',
      text: '[smile]',
      url: 'https://i0.hdslb.com/bfs/emote/sanitized.gif',
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

verify('private emote catalog groups default and account-owned token packages without hardcoded assets', ({ privateMessage }) => {
  const packages = privateMessage.collectPrivateEmotePackages([
    {
      text: '[doge]',
      url: 'https://i0.hdslb.com/bfs/emote/default-doge.png',
      size: 1,
    },
    {
      id: 'user-1',
      text: '[my-emote]',
      gif_url: 'https://i0.hdslb.com/bfs/emote/user-emote.gif',
      owner_mid: '100',
      package_id: 'owned-1',
      package_name: 'Owned package',
      type: 'user',
      size: 2,
    },
    {
      text: '[other-account]',
      url: 'https://i0.hdslb.com/bfs/emote/other-account.png',
      owner_mid: '999',
      type: 'user',
    },
    {
      text: '[unsafe]',
      url: 'javascript:alert(1)',
      type: 'user',
    },
  ], '100')
  assert.deepEqual(packages.map(pkg => ({
    id: pkg.id,
    name: pkg.name,
    type: pkg.type,
    tokens: pkg.emotes.map(emote => emote.text),
  })), [
    { id: 'default', name: '', type: 'default', tokens: ['[doge]'] },
    { id: 'owned-1', name: 'Owned package', type: 'user', tokens: ['[my-emote]'] },
  ])
  assert.equal(packages.flatMap(pkg => pkg.emotes).some(emote => emote.text === '[unsafe]'), false)
  assert.equal(packages.flatMap(pkg => pkg.emotes).some(emote => emote.text === '[other-account]'), false)
  assert.deepEqual(privateMessage.insertPrivateEmoteToken('hello world', '[doge]', 6, 11), {
    cursor: 12,
    value: 'hello [doge]',
  })

  const merged = privateMessage.mergePrivateEmotePackages(packages, privateMessage.collectPrivateEmotePackages([{
    id: 'user-2',
    text: '[my-emote-2]',
    uri: 'https://i0.hdslb.com/bfs/emote/user-emote-2.png',
    package_id: 'owned-1',
    package_name: 'Owned package',
    type: 'user',
  }]))
  assert.deepEqual(
    merged.find(pkg => pkg.id === 'owned-1')?.emotes.map(emote => emote.text),
    ['[my-emote]', '[my-emote-2]'],
  )

  const unresolved = privateMessage.transformPrivateMessages([
    createRawMessage('emote-late', '401', { content: '{"content":"late [doge]"}' }),
  ], [], '100')
  const hydrated = privateMessage.hydratePrivateMessageEmotes(unresolved, merged)
  assert.deepEqual(hydrated[0]?.content, {
    type: 'text',
    segments: [
      { type: 'text', text: 'late ' },
      {
        type: 'emote',
        text: '[doge]',
        url: 'https://i0.hdslb.com/bfs/emote/default-doge.png',
        size: 1,
      },
    ],
  })
})

verify('private emote catalog drops stale account responses and resets before loading the next account', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let resolveFirst: ((value: unknown) => void) | undefined
  let requestCount = 0
  const firstResponse = new Promise<unknown>((resolve) => {
    resolveFirst = resolve
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: null }),
    fetchMessages: async () => {
      requestCount++
      return requestCount === 1
        ? firstResponse
        : createMessagesResponse([], [{
            text: '[account-b]',
            url: 'https://i0.hdslb.com/bfs/emote/account-b.png',
            type: 'user',
          }])
    },
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  const staleLoad = controller.loadInitial('200')
  mid.value = '300'
  await nextTick()
  resolveFirst?.(createMessagesResponse([], [{
    text: '[account-a]',
    url: 'https://i0.hdslb.com/bfs/emote/account-a.png',
    type: 'user',
  }]))
  await staleLoad
  assert.equal(controller.emotePackages.value.length, 0)

  await controller.loadInitial('200')
  assert.deepEqual(
    controller.emotePackages.value.flatMap(pkg => pkg.emotes.map(emote => emote.text)),
    ['[account-b]'],
  )
  assert.equal(
    controller.emotePackages.value.some(pkg => pkg.emotes.some(emote => emote.text === '[account-a]')),
    false,
  )
})

verify('Composer emote insertion and inline fallback remain typed and accessible', async () => {
  const [composerSource, pickerSource, contentSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/experimental/MessageComposer.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/PrivateEmotePicker.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/PrivateMessageContent.vue', import.meta.url), 'utf8'),
  ])
  assert.ok(composerSource.includes('selectionStart'))
  assert.ok(composerSource.includes('setSelectionRange'))
  assert.ok(composerSource.includes(`emit('update:modelValue', insertion.value)`))
  assert.ok(composerSource.includes('PrivateEmotePicker'))
  assert.ok(composerSource.includes(':aria-expanded="emotePickerOpen"'))
  assert.ok(composerSource.includes('@keydown.esc.stop="emotePickerOpen = false"'))
  const emoteActionIndex = composerSource.indexOf('class="message-composer__emote-control"')
  const textareaIndex = composerSource.indexOf('<textarea')
  const sendActionIndex = composerSource.indexOf('message-composer__send')
  assert.ok(emoteActionIndex < textareaIndex && textareaIndex < sendActionIndex)
  assert.ok(pickerSource.includes('bew-popover-surface'))
  const pickerStyle = pickerSource.slice(pickerSource.indexOf('.private-emote-picker {'))
  assert.match(pickerStyle, /bottom:\s*calc\(100% \+ var\(--bew-space-2\)\);[\s\S]{0,80}left:\s*0;/)
  assert.doesNotMatch(pickerStyle, /right:\s*0;/)
  assert.ok(pickerSource.includes(`(['default', 'user'] as const)`))
  assert.ok(pickerSource.includes(':aria-label="emote.text"'))
  assert.ok(pickerSource.includes('role="tabpanel"'))
  assert.ok(pickerSource.includes('notifications.whisper.messages.emote_packages'))
  assert.ok(pickerSource.includes('private-emote-picker__package-button'))
  assert.ok(pickerSource.includes('activePackageKey'))
  assert.ok(pickerSource.includes('handleTabKeydown'))
  assert.ok(pickerSource.includes('@error="markImageFailed(emote.id)"'))
  assert.ok(contentSource.includes('failedInlineEmotes.has(index)'))
  assert.ok(contentSource.includes('@error="markInlineEmoteFailed(index)"'))
  assert.equal(contentSource.includes('v-html'), false)
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
  assert.deepEqual(requests[1], { talkerId: '200', endSeqno: '103', size: 20 })

  activeTalkerId.value = '300'
  await nextTick()
  resolveOlder?.(createMessagesResponse([createRawMessage('1', '101')]))
  await loadOlder
  assert.deepEqual(state.items.map(item => item.msgKey), ['1', '3', '4'])
  assert.equal(controller.getState('300').items.length, 0)

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
  assert.equal(state.noMore, false)
  assert.equal(state.paginationStalled, true)
  assert.deepEqual(state.items.map(item => item.msgKey), ['3', '4'])
  await controller.loadOlder('200')
  assert.equal(olderRequests, 1)
})

verify('history pagination consumes has_more and the absolute min_seqno floor without using the floor as a cursor', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const requests: Array<{ endSeqno?: string, size?: number, talkerId: string }> = []
  const pages = [
    createMessagesResponse([
      createRawMessage('3', '103'),
      createRawMessage('4', '104'),
    ], [], { hasMore: 1, minSeqno: '101', maxSeqno: '104' }),
    createMessagesResponse([
      createRawMessage('1', '101'),
      createRawMessage('2', '102'),
    ], [], { hasMore: 1, minSeqno: '101', maxSeqno: '104' }),
  ]
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async (options) => {
      requests.push(options)
      return pages.shift()
    },
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  const state = controller.getState('200')
  assert.equal(state.noMore, false)
  assert.equal(state.historyBoundarySeqno, '103')
  assert.equal(state.historyMinSeqno, '101')
  assert.equal(state.serverMaxSeqno, '104')
  await controller.loadOlder('200')
  assert.deepEqual(requests, [
    { talkerId: '200' },
    { talkerId: '200', endSeqno: '103', size: 20 },
  ])
  assert.equal(state.historyBoundarySeqno, '101')
  assert.equal(state.noMore, true)
  assert.equal(state.paginationStalled, false)
})

verify('non-empty has_more zero pages terminate immediately and do not request an empty sentinel page', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let requestCount = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => {
      requestCount++
      return createMessagesResponse([
        createRawMessage('1', '101'),
        createRawMessage('2', '102'),
      ], [], { hasMore: 0, minSeqno: '101', maxSeqno: '102' })
    },
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })
  await controller.loadInitial('200', '100')
  assert.equal(controller.getState('200').noMore, true)
  await controller.loadOlder('200')
  assert.equal(requestCount, 1)
})

verify('stalled history retries the exact cursor once with size 100 and never jumps to min_seqno', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const requests: Array<{ endSeqno?: string, size?: number, talkerId: string }> = []
  const pages = [
    createMessagesResponse([
      createRawMessage('3', '103'),
      createRawMessage('4', '104'),
    ], [], { hasMore: 1, minSeqno: '1', maxSeqno: '104' }),
    createMessagesResponse([], [], { hasMore: 1, minSeqno: '1', maxSeqno: '104' }),
    createMessagesResponse([
      createRawMessage('1', '101'),
      createRawMessage('2', '102'),
    ], [], { hasMore: 1, minSeqno: '1', maxSeqno: '104' }),
  ]
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async (options) => {
      requests.push(options)
      return pages.shift()
    },
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  await controller.loadOlder('200')
  const state = controller.getState('200')
  assert.equal(state.paginationStalled, true)
  assert.equal(state.stalledEndSeqno, '103')
  await controller.retryLoadOlder('200')
  assert.deepEqual(requests, [
    { talkerId: '200' },
    { talkerId: '200', endSeqno: '103', size: 20 },
    { talkerId: '200', endSeqno: '103', size: 100 },
  ])
  assert.equal(state.paginationStalled, false)
  assert.equal(state.historyBoundarySeqno, '101')

  const stalledPages = [
    createMessagesResponse([
      createRawMessage('3', '103'),
      createRawMessage('4', '104'),
    ], [], { hasMore: 1, minSeqno: '1' }),
    createMessagesResponse([createRawMessage('3', '103')], [], { hasMore: 1, minSeqno: '1' }),
    createMessagesResponse([createRawMessage('3', '103')], [], { hasMore: 1, minSeqno: '1' }),
  ]
  controller.invalidateConversation('200')
  pages.push(...stalledPages)
  await controller.loadInitial('200', '100')
  const beforeSecondStall = requests.length
  await controller.loadOlder('200')
  await controller.retryLoadOlder('200')
  await controller.retryLoadOlder('200')
  assert.equal(requests.length, beforeSecondStall + 2, 'one normal and one expanded older request')
  assert.equal(controller.getState('200').paginationStalled, true)
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

verify('conversation message limits retain the newest items without losing the older-page boundary', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const requests: Array<{ endSeqno?: string, talkerId: string }> = []
  const pages = [
    createMessagesResponse([
      createRawMessage('3', '103'),
      createRawMessage('4', '104'),
    ]),
    createMessagesResponse([
      createRawMessage('1', '101'),
      createRawMessage('2', '102'),
    ]),
    createMessagesResponse([]),
  ]
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async (options) => {
      requests.push(options)
      return pages.shift()
    },
    getCsrf: () => 'csrf',
    getMaxMessagesPerConversation: () => 2,
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '100')
  await controller.loadOlder('200')
  const state = controller.getState('200')
  assert.deepEqual(state.items.map(item => item.msgKey), ['3', '4'])
  assert.equal(state.oldestSeqno, '103')
  assert.equal(state.historyBoundarySeqno, '101')
  assert.equal(state.noMore, false)

  await controller.loadOlder('200')
  assert.deepEqual(requests, [
    { talkerId: '200' },
    { talkerId: '200', endSeqno: '103', size: 20 },
    { talkerId: '200', endSeqno: '101', size: 20 },
  ])
  assert.equal(state.noMore, true)
})

verify('conversation cache evicts the least recently used inactive state and preserves the active state', ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('active')
  let clock = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => createMessagesResponse([]),
    getCsrf: () => 'csrf',
    getMaxCachedConversations: () => 2,
    markSessionRead: () => {},
    now: () => ++clock,
    syncUnread: async () => {},
  })

  controller.getState('old')
  controller.getState('active')
  controller.getState('new')

  assert.equal(controller.states.has('old'), false)
  assert.equal(controller.states.has('active'), true)
  assert.equal(controller.states.has('new'), true)
})

verify('releasing the page cache invalidates in-flight conversation responses', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let resolveMessages: ((value: unknown) => void) | undefined
  const messagesResponse = new Promise<unknown>((resolve) => {
    resolveMessages = resolve
  })
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => messagesResponse,
    getCsrf: () => 'csrf',
    markSessionRead: () => {},
    syncUnread: async () => {},
  })

  assert.equal(controller.lifecycleEpoch.value, 0)
  const request = controller.loadInitial('200', '100')
  controller.release()
  assert.equal(controller.lifecycleEpoch.value, 1)
  resolveMessages?.(createMessagesResponse([createRawMessage('1', '101')]))
  await request

  assert.equal(controller.states.size, 0)
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
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '',
    unreadCount: 0,
    visible: true,
  })

  assert.equal(controller.getState('200').failedOperation, 'refresh')
  assert.equal(acknowledged, false)
  assert.equal(ackRequestCount, 0)
})

verify('authoritative unread state ACKs the server max seqno once even when the cached ack boundary is equal', async ({ usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const ackRequests: Array<{ ackSeqno: string, csrf: string, talkerId: string }> = []
  const readUpdates: Array<{ ackSeqno: string, talkerId: string }> = []
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async (options) => {
      ackRequests.push(options)
      return { code: 0, data: {} }
    },
    fetchMessages: async () => createMessagesResponse(
      [createRawMessage('1', '104')],
      [],
      { maxSeqno: '105' },
    ),
    getCsrf: () => 'csrf-token',
    markSessionRead: (talkerId, ackSeqno) => readUpdates.push({ talkerId, ackSeqno }),
    syncUnread: async () => {},
  })

  await controller.loadInitial('200', '105')
  const eligibility = {
    atLatest: true,
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '105',
    unreadCount: 1,
    visible: true,
  }
  const first = await controller.acknowledgeIfEligible('200', eligibility)
  const repeated = await controller.acknowledgeIfEligible('200', eligibility)

  assert.equal(first, true)
  assert.equal(repeated, false)
  assert.deepEqual(ackRequests, [{
    talkerId: '200',
    ackSeqno: '105',
    csrf: 'csrf-token',
  }])
  assert.deepEqual(readUpdates, [{ talkerId: '200', ackSeqno: '105' }])
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
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '',
    unreadCount: 0,
    visible: true,
  })
  assert.equal(blocked, false)

  const first = await controller.acknowledgeIfEligible('200', {
    atLatest: true,
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '',
    unreadCount: 0,
    visible: true,
  })
  const repeated = await controller.acknowledgeIfEligible('200', {
    atLatest: true,
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '',
    unreadCount: 0,
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
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '',
    unreadCount: 0,
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
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '',
    unreadCount: 0,
    visible: true,
  })
  activeTalkerId.value = '300'
  activeTalkerId.value = '200'
  const repeatedAck = controller.acknowledgeIfEligible('200', {
    atLatest: true,
    canAck: true,
    pageActive: true,
    sessionMaxSeqno: '',
    unreadCount: 0,
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

verify('optimistic text messages reconcile to one server message without duplicates', ({ experimentalPrivateMessage: privateMessage }) => {
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

  optimistic.serverMsgKey = undefined
  const [wrongConversation] = privateMessage.transformPrivateMessages([
    createRawMessage('fallback-wrong-conversation', '104', {
      sender_uid: '100',
      receiver_id: '300',
      content: '{"content":"same text"}',
      timestamp: 1755000001,
    }),
  ], [], '100')
  const wrongConversationResult = privateMessage.reconcileOptimisticPrivateMessages([
    optimistic,
    wrongConversation!,
  ], 'local-1')
  assert.equal(wrongConversationResult.reconciled, false)

  optimistic.serverMsgKey = '9223372036854775807'
  const reconciled = privateMessage.reconcileOptimisticPrivateMessages([
    optimistic,
    server!,
    server!,
  ], 'local-1')

  assert.equal(reconciled.reconciled, true)
  assert.deepEqual(reconciled.items.map(item => item.msgKey), ['9223372036854775807'])
})

verify('send controller inserts one optimistic item, clears draft, and reconciles after code zero', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
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

verify('code-zero text send confirms from finite history retries without resending', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const waits: number[] = []
  let historyRequests = 0
  let sendRequests = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => {
      historyRequests++
      if (historyRequests < 4)
        return createMessagesResponse([])
      return createMessagesResponse([
        createRawMessage('history-fallback-key', '105', {
          sender_uid: '100',
          receiver_id: '200',
          content: '{"content":"controlled text"}',
          timestamp: 1755000002,
        }),
      ])
    },
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    sendMessage: async () => {
      sendRequests++
      return { code: 0, data: {} }
    },
    syncUnread: async () => {},
    createLocalId: () => 'local-history-confirmed',
    nowSeconds: () => 1755000000,
    wait: async delayMs => void waits.push(delayMs),
  })

  await controller.loadInitial('200', '0')
  controller.setDraft('200', 'controlled text')
  assert.equal(await controller.sendDraft('200'), true)
  const state = controller.getState('200')
  assert.equal(sendRequests, 1)
  assert.equal(historyRequests, 4)
  assert.deepEqual(waits, [250, 750])
  assert.equal(state.lastTextSendOutcome, 'confirmed')
  assert.equal(state.items.some(item => item.localId === 'local-history-confirmed'), false)
  assert.deepEqual(state.items.map(item => item.msgKey), ['history-fallback-key'])
})

verify('accepted but unconfirmed text is retained and never automatically resent', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  const waits: number[] = []
  let historyRequests = 0
  let sendRequests = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => {
      historyRequests++
      return createMessagesResponse([])
    },
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    sendMessage: async () => {
      sendRequests++
      return { code: 0, data: {} }
    },
    syncUnread: async () => {},
    createLocalId: () => 'local-unconfirmed',
    nowSeconds: () => 1755000000,
    wait: async delayMs => void waits.push(delayMs),
  })

  await controller.loadInitial('200', '0')
  controller.setDraft('200', 'controlled text')
  assert.equal(await controller.sendDraft('200'), false)
  const state = controller.getState('200')
  assert.equal(sendRequests, 1)
  assert.equal(historyRequests, 5)
  assert.deepEqual(waits, [250, 750, 1500])
  assert.equal(state.lastTextSendOutcome, 'accepted-but-unconfirmed')
  assert.equal(state.items[0]?.sendState, 'accepted-but-unconfirmed')
  assert.equal(await controller.retrySend('200', 'local-unconfirmed'), false)
  assert.equal(sendRequests, 1)
})

verify('a response msg_key missing from bounded history fails the protocol gate without resending', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
  const mid = ref('100')
  const activeTalkerId = ref('200')
  let sendRequests = 0
  const controller = usePrivateMessages.usePrivateMessages(mid, activeTalkerId, {
    ackSession: async () => ({ code: 0, data: {} }),
    fetchMessages: async () => createMessagesResponse([]),
    getCsrf: () => 'csrf-token',
    markSessionRead: () => {},
    sendMessage: async () => {
      sendRequests++
      return { code: 0, data: { msg_key: 'server-key-not-in-history' } }
    },
    syncUnread: async () => {},
    createLocalId: () => 'local-key-mismatch',
    nowSeconds: () => 1755000000,
    wait: async () => {},
  })

  await controller.loadInitial('200', '0')
  controller.setDraft('200', 'controlled text')
  assert.equal(await controller.sendDraft('200'), false)
  const state = controller.getState('200')
  assert.equal(state.lastTextSendOutcome, 'protocol-mismatch')
  assert.equal(state.items[0]?.sendState, 'accepted-but-unconfirmed')
  assert.equal(await controller.retrySend('200', 'local-key-mismatch'), false)
  assert.equal(sendRequests, 1)
})

verify('failed optimistic sends retain text and retry remains single-flight', async ({
  experimentalPrivateMessage: privateMessage,
  experimentalUsePrivateMessages: usePrivateMessages,
}) => {
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
      return sendAttempt === 1
        ? {
            code: -400,
            data: null,
            bewlyError: {
              kind: 'api-error',
              endpointName: 'sendPrivateMessage',
              httpStatus: 200,
              redirected: false,
              finalHost: 'api.vc.bilibili.com',
              apiCode: -400,
            },
          }
        : retryResponse
    },
    syncUnread: async () => {},
    createLocalId: () => 'local-2',
    nowSeconds: () => 1755000000,
  })

  controller.setDraft('200', 'retry me')
  assert.equal(await controller.sendDraft('200'), false)
  const state = controller.getState('200')
  assert.equal(state.items[0]?.sendState, 'failed')
  assert.deepEqual(state.lastTextSendDiagnostic, {
    kind: 'api-error',
    httpStatus: 200,
    redirected: false,
    finalHost: 'api.vc.bilibili.com',
    apiCode: -400,
  })
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

verify('optimistic image messages retain local previews and reconcile by server msg_key or uploaded URL', ({ experimentalPrivateMessage: privateMessage }) => {
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

  const mediaFallback = privateMessage.createOptimisticPrivateImageMessage({
    localId: 'image-local-2',
    senderId: '100',
    receiverId: '200',
    objectUrl: 'blob:https://www.bilibili.com/sanitized-preview-2',
    timestamp: 1755000000,
  })
  mediaFallback.sendState = 'reconciling'
  mediaFallback.serverMediaUrl = 'https://i0.hdslb.com/bfs/im/sanitized.png'
  const mediaReconciled = privateMessage.reconcileOptimisticPrivateMessages([
    mediaFallback,
    server!,
  ], 'image-local-2')
  assert.equal(mediaReconciled.reconciled, true)
  assert.deepEqual(mediaReconciled.items.map(item => item.msgKey), ['9223372036854775807'])
})

verify('image upload failure retries upload while send failure reuses the uploaded server image', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
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

  assert.equal(controller.selectImage('200', image), true)
  const state = controller.getState('200')
  assert.equal(state.imageDraft?.status, 'ready')
  assert.equal(state.items.length, 0, 'selection must not create an optimistic message')
  assert.equal(uploadAttempts, 0, 'selection must not upload immediately')
  assert.equal(await controller.sendImage('200'), false)
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

  assert.equal(controller.selectImage('200', image), true, 'a new draft can be selected after success')
  controller.removeImage('200', 'image-local-1')
  assert.equal(state.imageDraft, null, 'removing a selected draft clears it before upload')
  assert.equal(uploadAttempts, 2, 'removing a selected draft must not upload')
  assert.deepEqual(revoked, [
    'blob:https://www.bilibili.com/sanitized-preview',
    'blob:https://www.bilibili.com/sanitized-preview',
  ])
})

verify('image reconcile failure retries only history and resource cleanup cancels stale uploads', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
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

  assert.equal(controller.selectImage('200', image), true)
  assert.equal(await controller.sendImage('200'), false, 'first send must stop at reconciliation')
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
  assert.equal(staleController.selectImage('200', image), true)
  const staleSend = staleController.sendImage('200')
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
  assert.equal(staleController.selectImage('200', image), true)
  const disposeSend = staleController.sendImage('200')
  staleController.dispose()
  assert.ok(cancelled.includes('upload-stale'), 'dispose keeps upload cancellation invariant')
  resolveUpload?.({ code: -1, data: null })
  await disposeSend
})

verify('image send waits for a valid account before allocating preview resources', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
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

  assert.equal(controller.selectImage('200', image), false)
  assert.equal(await controller.sendImage('200'), false)
  assert.equal(objectUrlsCreated, 0)
  assert.equal(controller.states.size, 0)
})

verify('account changes cancel an active image upload and reject the old account response', async ({ experimentalUsePrivateMessages: usePrivateMessages }) => {
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

  assert.equal(controller.selectImage('200', image), true)
  const send = controller.sendImage('200')
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

verify('message server settings preserve current enum contracts and submit one field at a time', ({ messageServerSettingsProtocol: protocol }) => {
  assert.deepEqual(protocol.buildMessageServerSettingsGetParams(), {
    msg_notify: 1,
    show_unfollowed_msg: 1,
    build: 0,
    mobi_app: 'web',
  })
  assert.deepEqual(protocol.MESSAGE_SERVER_SETTING_VALUES, {
    msg_notify: [1, 3],
    ai_intercept: [0, 1],
    set_comment: [0, 1, 2],
    set_at: [0, 1, 2],
    set_like: [0, 5],
    show_unfollowed_msg: [0, 1],
  })

  const update = protocol.buildMessageServerSettingUpdate('set_comment', 2)
  assert.equal(update.url, 'https://api.vc.bilibili.com/link_setting/v1/link_setting/set')
  assert.deepEqual(update.body, {
    set_comment: 2,
    build: 0,
    mobi_app: 'web',
  })
  assert.throws(() => protocol.buildMessageServerSettingUpdate('set_comment', 3))

  const settings = protocol.parseMessageServerSettingsResponse({
    code: 0,
    data: {
      msg_notify: 1,
      ai_intercept: 0,
      set_comment: 2,
      set_at: 1,
      set_like: 5,
      show_unfollowed_msg: 1,
      should_receive_group: 1,
      receive_unfollow_msg: 1,
    },
  })
  assert.deepEqual(settings, {
    msg_notify: 1,
    ai_intercept: 0,
    set_comment: 2,
    set_at: 1,
    set_like: 5,
    show_unfollowed_msg: 1,
  })

  const blockWords = protocol.parseMessageBlockWordsResponse({
    code: 0,
    data: {
      words: [{ content: 'sanitized-one' }, { content: 'sanitized-two' }],
      max_word_length: 20,
      max_words_size: 10,
    },
  })
  assert.deepEqual(blockWords, {
    words: ['sanitized-one', 'sanitized-two'],
    maxWordLength: 20,
    maxWordsSize: 10,
  })
  assert.deepEqual(protocol.buildMessageBlockWordMutation('add', ' sanitized-one ').body, {
    content: 'sanitized-one',
  })
})

verify('message server settings keep confirmed values and reconcile each mutation independently', async ({ useMessageServerSettings }) => {
  let confirmedComment = 0
  const submissions: Array<{ field: string, value: number }> = []
  let rejectLike = true
  const controller = useMessageServerSettings.useMessageServerSettings({
    fetchSettings: async () => ({
      code: 0,
      data: {
        msg_notify: 1,
        ai_intercept: 1,
        set_comment: confirmedComment,
        set_at: 0,
        set_like: 0,
        show_unfollowed_msg: 1,
      },
    }),
    setSetting: async (field, value) => {
      submissions.push({ field, value })
      if (field === 'set_like' && rejectLike)
        return { code: -1, data: null }
      if (field === 'set_comment')
        confirmedComment = value
      return { code: 0, data: null }
    },
    fetchBlockWords: async () => ({
      code: 0,
      data: { words: [{ content: 'one' }], max_word_length: 12, max_words_size: 3 },
    }),
    addBlockWord: async () => ({ code: 0, data: null }),
    deleteBlockWord: async () => ({ code: 0, data: null }),
  })

  await controller.load()
  assert.equal(controller.state.settings.set_comment.serverValue, 0)
  assert.equal(await controller.updateSetting('set_comment', 2), true)
  assert.equal(controller.state.settings.set_comment.serverValue, 2)
  assert.equal(controller.state.settings.set_comment.pending, false)
  assert.equal(await controller.updateSetting('set_like', 5), false)
  assert.equal(controller.state.settings.set_like.serverValue, 0)
  assert.equal(controller.state.settings.set_like.pending, false)
  assert.deepEqual(submissions, [
    { field: 'set_comment', value: 2 },
    { field: 'set_like', value: 5 },
  ])
  rejectLike = false
})

verify('private recipient search normalizes, bounds, parses, and reuses authoritative sessions', ({ privateRecipientSearch, privateSession }) => {
  assert.equal(privateRecipientSearch.normalizePrivateRecipientQuery('  Alice  Example '), 'Alice Example')
  assert.equal(privateRecipientSearch.normalizePrivateRecipientQuery('  Ａｌｉｃｅ　Example '), 'Alice Example')
  assert.equal(privateRecipientSearch.canSearchPrivateRecipients('a'), false)
  assert.equal(privateRecipientSearch.canSearchPrivateRecipients('9'), true)
  assert.equal(privateRecipientSearch.canSearchPrivateRecipients('ab'), true)
  assert.deepEqual(privateRecipientSearch.buildFollowingRecipientSearchParams('100', ' Alice ', 2), {
    vmid: '100',
    name: 'Alice',
    pn: 2,
    ps: 10,
  })
  assert.deepEqual(privateRecipientSearch.buildGlobalRecipientSearchParams(' Alice ', 3), {
    keyword: 'Alice',
    page: 3,
    pagesize: 10,
  })

  const following = privateRecipientSearch.parseFollowingRecipientSearch({
    code: 0,
    data: {
      list: [
        { mid: 42, uname: 'Follower', face: 'https://i0.hdslb.com/follower.png' },
        { mid: '42', uname: 'Duplicate', face: '' },
      ],
      total: 25,
    },
  }, 1)
  const global = privateRecipientSearch.parseGlobalRecipientSearch({
    code: 0,
    data: {
      result: [{ mid: '43', uname: '<em class="keyword">Global</em>', upic: 'https://i0.hdslb.com/global.png' }],
      numPages: 4,
    },
  }, 1)
  assert.ok(following)
  assert.ok(global)
  assert.deepEqual(following.items.map(item => item.mid), ['42'])
  assert.equal(following.hasMore, true)
  assert.deepEqual(global.items, [{
    mid: '43',
    name: 'Global',
    avatar: 'https://i0.hdslb.com/global.png',
    source: 'global',
  }])
  assert.equal(global.hasMore, true)

  const [session] = privateSession.transformPrivateSessions(
    [createRawSession('42', { group_name: 'Existing' })],
    createCardsResponse([]),
  )
  assert.deepEqual(
    privateRecipientSearch.resolvePrivateRecipientSelection(following.items[0]!, [session!]),
    { session },
  )
  assert.deepEqual(
    privateRecipientSearch.resolvePrivateRecipientSelection(global.items[0]!, [session!]),
    { recipient: global.items[0] },
  )
})

verify('private recipient remote search is explicit, single-flight, account-safe, cached, and capped', async ({ usePrivateRecipientSearch }) => {
  const mid = ref('100')
  let now = 1000
  let followingRequests = 0
  let globalRequests = 0
  let releaseStale: ((value: unknown) => void) | undefined
  let releaseChangedQuery: ((value: unknown) => void) | undefined
  const controller = usePrivateRecipientSearch.usePrivateRecipientSearch(mid, {
    fetchFollowing: async ({ name, pn }) => {
      followingRequests++
      if (name === 'stale')
        return await new Promise((resolve) => { releaseStale = resolve })
      if (name === 'changed-query-old')
        return await new Promise((resolve) => { releaseChangedQuery = resolve })
      return {
        code: 0,
        data: {
          list: [{ mid: `${pn}01`, uname: `${name}-${pn}`, face: '' }],
          total: 30,
        },
      }
    },
    fetchGlobal: async ({ keyword, page }) => {
      globalRequests++
      return {
        code: 0,
        data: {
          result: [{ mid: `${page}02`, uname: `${keyword}-${page}`, upic: '' }],
          numPages: 6,
        },
      }
    },
    now: () => now,
  })

  controller.setQuery('Alice')
  assert.equal(followingRequests, 0, 'typing is local-only')
  await controller.searchFollowing()
  assert.equal(followingRequests, 1)
  assert.equal(controller.state.source, 'following')
  assert.equal(controller.state.items.length, 1)
  await controller.loadMore()
  await controller.loadMore()
  await controller.loadMore()
  assert.equal(followingRequests, 3, 'one query is capped at three pages')
  assert.equal(controller.state.items.length, 3)
  assert.equal(controller.state.hasMore, false)

  controller.setQuery('Other')
  controller.setQuery('Alice')
  await controller.searchFollowing()
  assert.equal(followingRequests, 3, 'fresh cached results avoid a network request')
  now += usePrivateRecipientSearch.PRIVATE_RECIPIENT_SEARCH_CACHE_TTL_MS + 1
  await controller.searchFollowing()
  assert.equal(followingRequests, 4, 'expired cache is refreshed')

  controller.setQuery('Nobody')
  await controller.searchGlobal()
  assert.equal(globalRequests, 1)
  assert.equal(controller.state.source, 'global')

  const requestsBeforeQueryChange = followingRequests
  controller.setQuery('changed-query-old')
  const changedQueryOld = controller.searchFollowing()
  controller.setQuery('changed-query-new')
  const changedQueryNew = controller.searchFollowing()
  assert.equal(followingRequests, requestsBeforeQueryChange + 1)
  releaseChangedQuery?.({
    code: 0,
    data: { list: [{ mid: '998', uname: 'Discarded', face: '' }], total: 1 },
  })
  await Promise.all([changedQueryOld, changedQueryNew])
  assert.equal(followingRequests, requestsBeforeQueryChange + 2)
  assert.equal(controller.state.items[0]?.name, 'changed-query-new-1')

  controller.setQuery('stale')
  const stale = controller.searchFollowing()
  mid.value = '200'
  await nextTick()
  releaseStale?.({
    code: 0,
    data: { list: [{ mid: '999', uname: 'Old account', face: '' }], total: 1 },
  })
  await stale
  assert.equal(controller.state.query, '')
  assert.deepEqual(controller.state.items, [])
  assert.equal(controller.cacheSize(), 0)
})

verify('native server settings and recipient search remain isolated from local settings and frozen send transport', async () => {
  const [
    settingsPageSource,
    settingsControllerSource,
    apiCollectionSource,
    userApiSource,
    listSource,
    searchControllerSource,
    notificationsSource,
  ] = await Promise.all([
    readFile(new URL('../src/components/Settings/PluginComponentsAndPages/MessagesPage/MessagesPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Settings/PluginComponentsAndPages/MessagesPage/useMessageServerSettings.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/background/messageListeners/api/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/background/messageListeners/api/user.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/usePrivateRecipientSearch.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
  ])

  assert.ok(apiCollectionSource.includes('MESSAGE_SERVER_SETTINGS: API_MESSAGE_SERVER_SETTINGS'))
  assert.ok(settingsPageSource.includes('api.messageServerSettings'))
  assert.equal(settingsPageSource.includes('ORIGINAL_MESSAGE_SETTINGS_URL'), false)
  assert.equal(settingsControllerSource.includes(`from '~/logic'`), false)
  assert.equal(settingsControllerSource.includes('browser.storage'), false)
  assert.equal(settingsControllerSource.includes('settings.value'), false)
  assert.ok(userApiSource.includes('/x/relation/followings/search'))
  assert.ok(userApiSource.includes('ps: 10'))
  assert.ok(listSource.includes(`watch(query, value => props.recipientSearch.setQuery(value)`))
  assert.ok(listSource.includes('@click="recipientSearch.searchFollowing()"'))
  assert.ok(listSource.includes('@click="recipientSearch.searchGlobal()"'))
  assert.ok(listSource.includes('@click="recipientSearch.loadMore()"'))
  assert.equal(searchControllerSource.includes('setInterval'), false)
  assert.equal(searchControllerSource.includes('fetchUserCards'), false)
  assert.ok(notificationsSource.includes('transientPrivateRecipient'))
  assert.ok(notificationsSource.includes('api.privateMessage.sendPrivateMessage(options)'))
  assert.equal(notificationsSource.includes('state.items.push(transient'), false)
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
