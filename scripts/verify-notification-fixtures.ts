import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

import { nextTick, ref } from 'vue'

import {
  parseAtNotificationResponse,
  parseLikeNotificationResponse,
  parseReplyNotificationResponse,
} from '../src/background/notificationJson'
import { useNotificationFeeds } from '../src/contentScripts/views/Notifications/composables/useNotificationFeeds'
import type { DisplayNotification } from '../src/contentScripts/views/Notifications/notification'
import {
  buildNextPageParams,
  classifyApiError,
  dedupeNotifications,
  parseAtPage,
  parseLikePage,
  parseNotificationPage,
  parseReplyPage,
} from '../src/contentScripts/views/Notifications/notificationFeedParsing'
import {
  createReadCommitId,
  shouldReconcileUnreadBadge,
  shouldRefreshFeed,
} from '../src/contentScripts/views/Notifications/notificationFeedPolicy'
import type { NativeNotificationSection } from '../src/contentScripts/views/Notifications/notificationSections'
import { parseNotificationView } from '../src/utils/notificationRoute'

type FixtureName
  = | 'reply-first.json'
    | 'reply-next.json'
    | 'reply-empty.json'
    | 'at-first.json'
    | 'at-next.json'
    | 'like-first.json'
    | 'like-next.json'
    | 'like-empty.json'
    | 'large-id.json'
    | 'api-error.json'
    | 'system/api-error.json'
    | 'html-response.html'

interface MockResponseOptions {
  contentType?: string
  redirected?: boolean
  status?: number
  url?: string
}

const assertions: Array<{
  name: string
  run: () => void | Promise<void>
}> = []

function verify(name: string, run: () => void | Promise<void>) {
  assertions.push({ name, run })
}

function readFixtureText(name: FixtureName): Promise<string> {
  return readFile(new URL(`../tests/fixtures/notifications/${name}`, import.meta.url), 'utf8')
}

async function readFixtureJson(name: Exclude<FixtureName, 'html-response.html' | 'large-id.json'>): Promise<unknown> {
  return JSON.parse(await readFixtureText(name))
}

function createMockResponse(text: string, options: MockResponseOptions = {}): Response {
  const status = options.status ?? 200
  return {
    headers: new Headers({ 'content-type': options.contentType ?? 'application/json' }),
    ok: status >= 200 && status < 300,
    redirected: options.redirected ?? false,
    status,
    text: async () => text,
    url: options.url ?? 'https://api.bilibili.com/x/msgfeed/reply?sanitized=1',
  } as Response
}

function requirePage(
  section: NativeNotificationSection,
  response: unknown,
) {
  const result = parseNotificationPage(section, response)
  assert.ok(result.page, `${section} fixture should parse`)
  return result.page
}

function sampleDisplayNotification(id: string): DisplayNotification {
  return {
    id,
    section: 'reply',
    actors: [],
    actorCount: 1,
    actionTextKey: 'notifications.native.actions.reply',
    body: '',
    quote: '',
    sourceTitle: '',
    sourceImage: '',
    sourceUrl: '',
    originalUrl: 'https://message.bilibili.com/#/reply',
    timestamp: 1,
    unread: false,
  }
}

verify('only the current Native Feed is rendered', async () => {
  const source = await readFile(
    new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url),
    'utf8',
  )
  assert.equal(source.match(/<NativeNotificationFeed\b/g)?.length, 1)
  assert.doesNotMatch(source, /v-for="section in NATIVE_NOTIFICATION_SECTIONS"/)
  assert.doesNotMatch(source, /v-show="currentView === section\.id"/)
  assert.match(source, /v-if="nativeView"/)
})

verify('pure parsing and policy modules have no Vue or Store dependency', async () => {
  const sources = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/notificationFeedParsing.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/notificationFeedPolicy.ts', import.meta.url), 'utf8'),
  ])
  for (const source of sources) {
    assert.doesNotMatch(source, /from ['"]vue['"]|useTopBarStore|useBewlyApp|\bfetch\s*\(/)
  }
})

verify('Reply first page preserves IDs, timestamps, and unread state', async () => {
  const page = requirePage('reply', await readFixtureJson('reply-first.json'))
  assert.equal(page.items.length, 2)
  assert.equal(page.items[0]?.id, '7849910264738201602')
  assert.equal(page.items[1]?.id, '420001')
  assert.equal(typeof page.items[0]?.timestamp, 'number')
  assert.equal(page.items[0]?.unread, true)
  assert.equal(page.items[1]?.unread, false)
})

verify('Reply next-page cursor and tail-page data are retained', async () => {
  const firstPage = requirePage('reply', await readFixtureJson('reply-first.json'))
  assert.deepEqual(buildNextPageParams('reply', firstPage.cursorId, firstPage.cursorTime), {
    id: '7849910264738201601',
    reply_time: 1754902800,
  })

  const nextPage = requirePage('reply', await readFixtureJson('reply-next.json'))
  assert.equal(nextPage.items.length, 1)
  assert.equal(nextPage.items[0]?.id, '7849910264738201604')
  assert.equal(nextPage.noMore, true)
})

verify('At first and next pages use the confirmed cursor shape', async () => {
  const firstPage = requirePage('at', await readFixtureJson('at-first.json'))
  assert.equal(firstPage.items[0]?.section, 'at')
  assert.deepEqual(buildNextPageParams('at', firstPage.cursorId, firstPage.cursorTime), {
    id: '7850010264738201701',
    at_time: 1754903800,
  })

  const nextPage = requirePage('at', await readFixtureJson('at-next.json'))
  assert.equal(nextPage.items.length, 1)
  assert.equal(nextPage.noMore, true)
})

verify('Like latest and total streams merge without duplicate aggregate entries', async () => {
  const page = requirePage('love', await readFixtureJson('like-first.json'))
  assert.deepEqual(page.items.map(item => item.id), [
    '7850110264738201801',
    '7850110264738201804',
  ])
  assert.equal(page.items[0]?.actorCount, 5)
  assert.equal(page.items[0]?.actors.length, 3)
  assert.equal(page.items[0]?.unread, true)
})

verify('Like pagination uses only the total cursor and retains the tail item', async () => {
  const firstPage = requirePage('love', await readFixtureJson('like-first.json'))
  assert.deepEqual(buildNextPageParams('love', firstPage.cursorId, firstPage.cursorTime), {
    id: '7850110264738201803',
    like_time: 1754904500,
  })

  const nextPage = requirePage('love', await readFixtureJson('like-next.json'))
  assert.deepEqual(nextPage.items.map(item => item.id), ['7850110264738201806'])
  assert.equal(nextPage.noMore, true)
})

verify('empty Reply and Like pages are valid tail pages', async () => {
  const replyPage = requirePage('reply', await readFixtureJson('reply-empty.json'))
  const likePage = requirePage('love', await readFixtureJson('like-empty.json'))
  assert.deepEqual(replyPage.items, [])
  assert.deepEqual(likePage.items, [])
  assert.equal(replyPage.noMore, true)
  assert.equal(likePage.noMore, true)
})

verify('notification ID dedupe is stable and non-mutating', () => {
  const first = sampleDisplayNotification('duplicate')
  const second = sampleDisplayNotification('duplicate')
  const unique = sampleDisplayNotification('unique')
  const input = [first, second, unique]
  const result = dedupeNotifications(input)
  assert.deepEqual(result.map(item => item.id), ['duplicate', 'unique'])
  assert.equal(input.length, 3)
})

verify('lossless transport preserves unsafe numeric identifiers as strings', async () => {
  const response = await parseReplyNotificationResponse(createMockResponse(
    await readFixtureText('large-id.json'),
  ))
  const page = requirePage('reply', response)
  assert.equal(page.cursorId, '9223372036854775806')
  assert.equal(page.items[0]?.id, '9223372036854775807')
  assert.equal(page.items[0]?.actors[0]?.id, '9223372036854775805')
})

verify('transport classifies API, HTML, server, risk, and login failures', async () => {
  const apiError = await parseReplyNotificationResponse(createMockResponse(
    await readFixtureText('api-error.json'),
  ))
  assert.equal(classifyApiError(apiError), 'api-error')
  assert.equal(apiError.bewlyError?.apiCode, -400)

  const html = await readFixtureText('html-response.html')
  const invalidHtml = await parseReplyNotificationResponse(createMockResponse(html, {
    contentType: 'text/html',
    status: 404,
  }))
  assert.equal(invalidHtml.bewlyError?.kind, 'invalid-response')

  const serverError = await parseAtNotificationResponse(createMockResponse(html, {
    contentType: 'text/html',
    status: 503,
    url: 'https://api.bilibili.com/x/msgfeed/at?private=removed',
  }))
  assert.equal(serverError.bewlyError?.kind, 'server-error')
  assert.equal(serverError.bewlyError?.finalHost, 'api.bilibili.com')

  const riskError = await parseLikeNotificationResponse(createMockResponse(html, {
    contentType: 'text/html',
    status: 412,
  }))
  assert.equal(riskError.bewlyError?.kind, 'risk-control')

  const loginError = await parseReplyNotificationResponse(createMockResponse(html, {
    contentType: 'text/html',
    redirected: true,
    url: 'https://passport.bilibili.com/login?private=removed',
  }))
  assert.equal(loginError.bewlyError?.kind, 'login-required')
  assert.deepEqual(Object.keys(loginError.bewlyError ?? {}).sort(), [
    'apiCode',
    'endpointName',
    'finalHost',
    'httpStatus',
    'kind',
    'redirected',
  ])
})

verify('System anonymous probe fixture preserves the confirmed login error', async () => {
  const response = await readFixtureJson('system/api-error.json') as { code?: unknown, message?: unknown }
  assert.equal(response.code, -101)
  assert.equal(response.message, '-101')
})

verify('invalid JSON and invalid response shapes are rejected', async () => {
  const malformed = await parseReplyNotificationResponse(createMockResponse('{not-json'))
  assert.equal(malformed.bewlyError?.kind, 'invalid-response')
  assert.equal(parseNotificationPage('reply', { code: 0, data: [] }).errorKind, 'invalid-response')
  assert.equal(parseReplyPage({ cursor: {}, items: 'invalid' }), null)
  assert.equal(parseAtPage({ cursor: {}, items: 'invalid' }), null)
  assert.equal(parseLikePage({ latest: {}, total: {} }), null)
})

verify('read commit IDs are unique per first-page request and independent per section', () => {
  const firstReply = createReadCommitId('reply', '100', 2, 1)
  const secondReply = createReadCommitId('reply', '100', 2, 2)
  const firstAt = createReadCommitId('at', '100', 2, 1)
  const firstLike = createReadCommitId('love', '100', 2, 1)
  assert.notEqual(firstReply, secondReply)
  assert.equal(new Set([firstReply, firstAt, firstLike]).size, 3)
})

verify('pagination does not create a new read commit', async () => {
  const firstFixture = await readFixtureJson('reply-first.json')
  const nextFixture = await readFixtureJson('reply-next.json')
  const controller = useNotificationFeeds(ref('100'), {
    fetchPage: (_section, params) => Promise.resolve(params ? nextFixture : firstFixture),
  })
  await controller.loadInitial('reply')
  const readCommitId = controller.states.reply.currentReadCommitId
  const serial = controller.states.reply.firstPageRequestSerial
  await controller.loadMore('reply')
  assert.equal(controller.states.reply.currentReadCommitId, readCommitId)
  assert.equal(controller.states.reply.firstPageRequestSerial, serial)
  assert.equal(controller.states.reply.items.length, 3)
})

verify('feed freshness policy covers load, unread, visibility, and manual refresh', () => {
  const state = {
    loaded: true,
    loadedAt: 1_000,
    unreadCountAtFetch: 0,
    lastObservedUnreadCount: 0,
  }
  assert.equal(shouldRefreshFeed({ ...state, loaded: false }, {
    now: 1_001,
    reason: 'activate',
    unreadCount: 0,
  }), true)
  assert.equal(shouldRefreshFeed(state, {
    now: 1_001,
    reason: 'unread-change',
    unreadCount: 1,
  }), true)
  assert.equal(shouldRefreshFeed({ ...state, unreadCountAtFetch: 1, lastObservedUnreadCount: 1 }, {
    now: 1_001,
    reason: 'activate',
    unreadCount: 1,
  }), false)
  assert.equal(shouldRefreshFeed(state, {
    now: 61_000,
    reason: 'visibility',
    unreadCount: 0,
  }), true)
  assert.equal(shouldRefreshFeed(state, {
    force: true,
    now: 1_001,
    reason: 'manual',
    unreadCount: 0,
  }), true)
})

verify('badge reconciliation policy rejects stale account, section, and commit state', () => {
  const readCommitId = createReadCommitId('love', '100', 2, 4)
  const base = {
    active: true,
    visible: true,
    accountMid: '100',
    currentSection: 'love' as const,
    currentGeneration: 2,
    currentReadCommitId: readCommitId,
    badgeReconciled: false,
    candidate: {
      readCommitId,
      mid: '100',
      section: 'love' as const,
      generation: 2,
      serverReadCommitted: true as const,
    },
  }
  assert.equal(shouldReconcileUnreadBadge(base), true)
  assert.equal(shouldReconcileUnreadBadge({ ...base, accountMid: '200' }), false)
  assert.equal(shouldReconcileUnreadBadge({ ...base, currentSection: 'reply' }), false)
  assert.equal(shouldReconcileUnreadBadge({ ...base, currentReadCommitId: 'stale' }), false)
  assert.equal(shouldReconcileUnreadBadge({ ...base, badgeReconciled: true }), false)
})

verify('controller preserves independent section state and scroll positions', async () => {
  const fixtures = {
    reply: await readFixtureJson('reply-first.json'),
    at: await readFixtureJson('at-first.json'),
    love: await readFixtureJson('like-first.json'),
  }
  const mid = ref('100')
  const controller = useNotificationFeeds(mid, {
    fetchPage: section => Promise.resolve(fixtures[section]),
  })

  await Promise.all([
    controller.loadInitial('reply'),
    controller.loadInitial('at'),
    controller.loadInitial('love'),
  ])
  controller.states.reply.scrollTop = 480
  controller.states.at.scrollTop = 320
  controller.states.love.scrollTop = 160

  assert.equal(controller.states.reply.cursorId, '7849910264738201601')
  assert.equal(controller.states.at.cursorId, '7850010264738201701')
  assert.equal(controller.states.love.cursorId, '7850110264738201803')
  assert.deepEqual([
    controller.states.reply.scrollTop,
    controller.states.at.scrollTop,
    controller.states.love.scrollTop,
  ], [480, 320, 160])
})

verify('MID change clears all states and rejects old account responses', async () => {
  const mid = ref('100')
  let resolveReply: ((value: unknown) => void) | undefined
  const controller = useNotificationFeeds(mid, {
    fetchPage: section => section === 'reply'
      ? new Promise(resolve => resolveReply = resolve)
      : Promise.resolve({ code: 0, data: null }),
  })

  const oldRequest = controller.loadInitial('reply')
  mid.value = '200'
  await nextTick()
  resolveReply?.(await readFixtureJson('reply-first.json'))
  await oldRequest

  for (const section of ['reply', 'at', 'love'] as const) {
    assert.equal(controller.states[section].loaded, false)
    assert.equal(controller.states[section].items.length, 0)
    assert.equal(controller.states[section].generation, 1)
  }
})

verify('invalid notificationView values safely fall back to whisper', () => {
  for (const value of ['', 'unknown', 'toString', 'constructor', '__proto__', '**proto**', 'valueOf']) {
    assert.equal(parseNotificationView(`https://www.bilibili.com/?notificationView=${encodeURIComponent(value)}`), 'whisper')
  }
  for (const value of ['whisper', 'reply', 'at', 'love', 'system', 'settings']) {
    assert.equal(parseNotificationView(`https://www.bilibili.com/?notificationView=${value}`), value)
  }
  assert.equal(parseNotificationView('not a valid absolute URL'), 'whisper')
})

async function main() {
  const failed: string[] = []
  for (const assertion of assertions) {
    try {
      await assertion.run()
      console.log(`PASS ${assertion.name}`)
    }
    catch (error) {
      failed.push(assertion.name)
      console.error(`FAIL ${assertion.name}`)
      console.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (failed.length > 0) {
    console.error(`Notification verification failed: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

void main()
