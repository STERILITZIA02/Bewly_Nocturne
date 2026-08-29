import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

import { nextTick, ref } from 'vue'

import {
  parseAtNotificationResponse,
  parseLikeNotificationResponse,
  parseReplyNotificationResponse,
  parseSystemHistoryNotificationResponse,
  parseSystemReadResponse,
  parseSystemUnifiedNotificationResponse,
  parseSystemUserNotificationResponse,
} from '../src/background/notificationJson'
import { useNotificationFeeds } from '../src/contentScripts/views/Notifications/composables/useNotificationFeeds'
import type {
  InteractionNotification,
  SystemNotification,
} from '../src/contentScripts/views/Notifications/notification'
import type { NotificationPageResult } from '../src/contentScripts/views/Notifications/notificationFeedParsing'
import {
  buildNextPageParams,
  buildSystemPageResponse,
  classifyApiError,
  dedupeNotifications,
  parseAtPage,
  parseLikePage,
  parseNotificationPage,
  parseReplyPage,
  parseSystemContentSegments,
  parseSystemHistoryPage,
  parseSystemInitialPage,
} from '../src/contentScripts/views/Notifications/notificationFeedParsing'
import {
  createReadCommitId,
  shouldReconcileUnreadBadge,
  shouldRefreshFeed,
} from '../src/contentScripts/views/Notifications/notificationFeedPolicy'
import { reconcileNotificationBadge } from '../src/contentScripts/views/Notifications/notificationReadReconciliation'
import type { NativeNotificationSection } from '../src/contentScripts/views/Notifications/notificationSections'
import { createSystemNotificationPageFetcher } from '../src/contentScripts/views/Notifications/systemNotificationFeed'
import { normalizeNotificationRoute, parseNotificationView } from '../src/utils/notificationRoute'

type FixtureName
  = | 'reply-first.json'
    | 'reply-next.json'
    | 'reply-empty.json'
    | 'reply-same-cursor-empty.json'
    | 'reply-same-cursor-duplicate.json'
    | 'at-first.json'
    | 'at-next.json'
    | 'like-first.json'
    | 'like-next.json'
    | 'like-empty.json'
    | 'large-id.json'
    | 'api-error.json'
    | 'system/api-error.json'
    | 'system/unified-first.json'
    | 'system/user-first.json'
    | 'system/legacy-next.json'
    | 'system/legacy-empty.json'
    | 'system/update-cursor-success.json'
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
  section: Exclude<NativeNotificationSection, 'system'>,
  response: unknown,
): NotificationPageResult & { items: InteractionNotification[] }
function requirePage(
  section: 'system',
  response: unknown,
): NotificationPageResult & { items: SystemNotification[] }
function requirePage(section: NativeNotificationSection, response: unknown): NotificationPageResult {
  const result = parseNotificationPage(section, response)
  assert.ok(result.page, `${section} fixture should parse`)
  return result.page
}

function sampleDisplayNotification(id: string): InteractionNotification {
  return {
    kind: 'interaction',
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

interface NotificationReliabilityPolicy {
  applyNotificationFirstPage: (...args: unknown[]) => unknown
  evaluatePaginationProgress: (...args: unknown[]) => unknown
  resolveNotificationAccountState: (...args: unknown[]) => unknown
}

async function loadNotificationReliabilityPolicy(): Promise<NotificationReliabilityPolicy> {
  const policy = await import('../src/contentScripts/views/Notifications/notificationFeedPolicy')
  const applyNotificationFirstPage = Reflect.get(policy, 'applyNotificationFirstPage')
  const evaluatePaginationProgress = Reflect.get(policy, 'evaluatePaginationProgress')
  const resolveNotificationAccountState = Reflect.get(policy, 'resolveNotificationAccountState')

  assert.equal(typeof applyNotificationFirstPage, 'function', 'applyNotificationFirstPage must be exported')
  assert.equal(typeof evaluatePaginationProgress, 'function', 'evaluatePaginationProgress must be exported')
  assert.equal(typeof resolveNotificationAccountState, 'function', 'resolveNotificationAccountState must be exported')
  return {
    applyNotificationFirstPage: applyNotificationFirstPage as NotificationReliabilityPolicy['applyNotificationFirstPage'],
    evaluatePaginationProgress: evaluatePaginationProgress as NotificationReliabilityPolicy['evaluatePaginationProgress'],
    resolveNotificationAccountState: resolveNotificationAccountState as NotificationReliabilityPolicy['resolveNotificationAccountState'],
  }
}

function getRetryFailedOperation(controller: ReturnType<typeof useNotificationFeeds>) {
  const retry = Reflect.get(controller, 'retryFailedOperation')
  assert.equal(typeof retry, 'function', 'controller.retryFailedOperation must exist')
  return retry as (section: NativeNotificationSection, unreadCount?: number) => Promise<void>
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

verify('notification headers keep only titles and delegate refresh to the Dock control', async () => {
  const [headerSource, navigationSource, sectionsSource, pageSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/components/NotificationsPageHeader.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NotificationsNavigation.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/notificationSections.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(headerSource, /descriptionKey|notifications\.actions\.refresh|notifications\.actions\.open_original/)
  assert.doesNotMatch(headerSource, /<Button\b|<ALink\b/)
  assert.doesNotMatch(navigationSource, /descriptionKey/)
  assert.match(navigationSource, /\.notifications-navigation__badge \{[\s\S]{0,220}box-sizing: border-box/)
  assert.match(navigationSource, /\.notifications-navigation__badge \{[\s\S]{0,260}width: var\(--bew-space-8\)/)
  assert.match(navigationSource, /\.notifications-navigation__badge \{[\s\S]{0,420}white-space: nowrap/)
  assert.match(navigationSource, /notifications-navigation__badge--empty/)
  assert.match(navigationSource, /function revealActiveSection\(\)/)
  assert.match(navigationSource, /scrollTo\(\{ left:[\s\S]{0,120}behavior: 'auto'/)
  assert.match(navigationSource, /\.notifications-navigation__inside \{[\s\S]{0,260}padding-inline: var\(--bew-space-0-5\)/)
  assert.match(headerSource, /\.notifications-page-header \{[\s\S]{0,100}width: 100%/)
  assert.doesNotMatch(sectionsSource, /descriptionKey/)
  assert.doesNotMatch(pageSource, /<NotificationsPageHeader[^>]*@refresh/)
  assert.match(pageSource, /handlePageRefresh\.value\s*=\s*refreshCurrentView/)
})

verify('Native Feed retry, account pending, and scroll anchor wiring are explicit', async () => {
  const [feedSource, itemSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/components/NativeNotificationFeed.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NativeNotificationItem.vue', import.meta.url), 'utf8'),
  ])
  assert.doesNotMatch(feedSource, /state\.items\.length\s*>\s*0[\s\S]{0,120}loadMore/)
  assert.match(feedSource, /retryFailedOperation/)
  assert.match(feedSource, /accountState === 'profile-pending'/)
  assert.match(feedSource, /captureScrollAnchor/)
  assert.match(feedSource, /restoreScrollAnchor/)
  assert.match(itemSource, /data-notification-id/)
})

verify('all Native Feed items share the smooth glass card surface and top-align identities', async () => {
  const [mainStyles, interactionItemSource, systemItemSource] = await Promise.all([
    readFile(new URL('../src/styles/main.scss', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NativeNotificationItem.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NativeSystemNotificationItem.vue', import.meta.url), 'utf8'),
  ])

  for (const source of [interactionItemSource, systemItemSource]) {
    assert.match(source, /native-notification-surface bew-shape-smooth-rect/)
  }
  assert.match(mainStyles, /\.native-notification-surface \{[\s\S]{0,420}background: var\(--bew-elevated-alt\)/)
  assert.match(mainStyles, /border-radius: var\(--bew-card-radius\)/)
  assert.match(mainStyles, /backdrop-filter: var\(--bew-filter-glass-1\)/)
  assert.match(interactionItemSource, /\.native-notification-item__avatars \{[\s\S]{0,120}align-self: start;[\s\S]{0,80}align-items: flex-start;/)
  assert.match(systemItemSource, /\.native-system-notification__icon \{[\s\S]{0,100}align-self: start;/)
})

verify('all message-page data loading states use feed-shaped skeletons', async () => {
  const [
    pageSource,
    pageSkeletonSource,
    feedSource,
    feedSkeletonSource,
    skeletonBlockSource,
    workspaceSource,
    listSource,
    listSkeletonSource,
    conversationDetailSkeletonSource,
    conversationSource,
    historySkeletonSource,
    timelineSkeletonSource,
  ] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Notifications/Notifications.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NotificationsPageSkeleton.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NativeNotificationFeed.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/components/NativeNotificationFeedSkeleton.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SkeletonBlock.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationListSkeleton.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationDetailSkeleton.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationHistorySkeleton.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/contentScripts/views/Notifications/whisper/ConversationTimelineSkeleton.vue', import.meta.url), 'utf8'),
  ])

  assert.match(pageSource, /v-if="!routeReady"[\s\S]{0,220}<NotificationsPageSkeleton/)
  assert.match(pageSkeletonSource, /<ConversationListSkeleton[\s\S]{0,180}:announce="false"/)
  assert.match(pageSkeletonSource, /<ConversationDetailSkeleton[\s\S]{0,100}:announce="false"/)
  assert.match(feedSource, /accountState === 'profile-pending'[\s\S]{0,180}:label="feedAriaLabel"/)
  assert.match(feedSource, /v-if="state\.loadingMore"[\s\S]{0,120}:count="2"/)
  assert.match(workspaceSource, /<ConversationListSkeleton[\s\S]{0,120}v-else-if="controller\.state\.loading && !controller\.state\.loaded"/)
  assert.match(workspaceSource, /<ConversationDetailSkeleton[\s\S]{0,180}controller\.state\.loading && !controller\.state\.loaded/)
  assert.match(listSource, /<ConversationListSkeleton[\s\S]{0,100}v-if="loadingMore"/)
  assert.match(listSource, /<ConversationListSkeleton[\s\S]{0,100}v-if="recipientSearch\.state\.loading"/)
  assert.match(conversationSource, /v-if="state\.loadingInitial && !state\.loaded"[\s\S]{0,520}<ConversationTimelineSkeleton/)
  assert.match(conversationSource, /<ConversationHistorySkeleton[\s\S]{0,100}:announce="false"/)
  assert.match(conversationSource, /<ConversationHistorySkeleton[\s\S]{0,120}v-if="historyLoading"/)
  assert.match(feedSkeletonSource, /native-notification-surface bew-shape-smooth-rect/)
  assert.match(feedSkeletonSource, /native-notification-feed-skeleton__reference[\s\S]{0,520}native-notification-feed-skeleton__reference-source/)
  assert.match(feedSkeletonSource, /width="96px"[\s\S]{0,100}height="var\(--bew-line-height-control\)"/)
  assert.match(listSkeletonSource, /conversation-list-skeleton__item/)
  assert.match(conversationDetailSkeletonSource, /<ConversationTimelineSkeleton[\s\S]{0,100}:announce="announce"/)
  assert.match(historySkeletonSource, /height: var\(--bew-control-height\)/)
  assert.match(timelineSkeletonSource, /conversation-timeline-skeleton__item--self/)
  assert.match(skeletonBlockSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,120}animation: none/)

  for (const source of [pageSource, feedSource, workspaceSource, listSource, conversationSource]) {
    assert.doesNotMatch(source, /<Loading\b/)
  }
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

verify('first-page apply policy merges new head data without losing a loaded tail', async () => {
  const { applyNotificationFirstPage } = await loadNotificationReliabilityPolicy()
  const oldHead = { ...sampleDisplayNotification('head'), actorCount: 1, body: 'old' }
  const tail = { ...sampleDisplayNotification('tail'), body: 'history' }
  const newHead = { ...sampleDisplayNotification('new'), body: 'new' }
  const updatedHead = {
    ...sampleDisplayNotification('head'),
    actorCount: 5,
    body: 'updated',
    unread: true,
  }
  const current = {
    items: [oldHead, tail],
    cursorId: 'tail-cursor',
    cursorTime: 10,
    noMore: false,
    hasLoadedMore: true,
    paginationStalled: false,
  }
  const page = {
    items: [newHead, updatedHead],
    cursorId: 'head-cursor',
    cursorTime: 20,
    noMore: true,
  }

  const merged = applyNotificationFirstPage(current, page, 'merge-head') as typeof current
  assert.deepEqual(merged.items.map(item => item.id), ['new', 'head', 'tail'])
  assert.equal(merged.items[1]?.body, 'updated')
  assert.equal(merged.items[1]?.actorCount, 5)
  assert.equal(merged.items[1]?.unread, true)
  assert.equal(merged.cursorId, 'tail-cursor')
  assert.equal(merged.cursorTime, 10)
  assert.equal(merged.noMore, false)
  assert.equal(merged.hasLoadedMore, true)

  const replaced = applyNotificationFirstPage(current, page, 'replace') as typeof current
  assert.deepEqual(replaced.items.map(item => item.id), ['new', 'head'])
  assert.equal(replaced.cursorId, 'head-cursor')
  assert.equal(replaced.cursorTime, 20)
  assert.equal(replaced.noMore, true)
  assert.equal(replaced.hasLoadedMore, false)
})

verify('pagination progress policy stops unchanged cursors but accepts tails and cursor advances', async () => {
  const { evaluatePaginationProgress } = await loadNotificationReliabilityPolicy()
  assert.deepEqual(evaluatePaginationProgress({
    previousCursorId: 'cursor',
    previousCursorTime: 10,
    nextCursorId: 'cursor',
    nextCursorTime: 10,
    newUniqueItemCount: 0,
    noMore: false,
  }), { madeProgress: false, stalled: true })
  assert.deepEqual(evaluatePaginationProgress({
    previousCursorId: 'cursor',
    previousCursorTime: 10,
    nextCursorId: 'cursor',
    nextCursorTime: 10,
    newUniqueItemCount: 0,
    noMore: true,
  }), { madeProgress: false, stalled: false })
  assert.deepEqual(evaluatePaginationProgress({
    previousCursorId: 'cursor',
    previousCursorTime: 10,
    nextCursorId: 'next',
    nextCursorTime: 9,
    newUniqueItemCount: 0,
    noMore: false,
  }), { madeProgress: true, stalled: false })
})

verify('account policy distinguishes logged out, pending profile, and ready MID', async () => {
  const { resolveNotificationAccountState } = await loadNotificationReliabilityPolicy()
  assert.equal(resolveNotificationAccountState(false, ''), 'logged-out')
  assert.equal(resolveNotificationAccountState(true, ''), 'profile-pending')
  assert.equal(resolveNotificationAccountState(true, '100'), 'ready')
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

verify('System initial streams preserve lossless IDs, merge by cursor, and dedupe by ID', async () => {
  const [unified, user] = await Promise.all([
    parseSystemUnifiedNotificationResponse(createMockResponse(
      await readFixtureText('system/unified-first.json'),
      { url: 'https://message.bilibili.com/x/sys-msg/query_unified_notify?page_size=10' },
    )),
    parseSystemUserNotificationResponse(createMockResponse(
      await readFixtureText('system/user-first.json'),
      { url: 'https://message.bilibili.com/x/sys-msg/query_user_notify?page_size=20' },
    )),
  ])
  const page = parseSystemInitialPage(unified, user)
  assert.ok(page)
  assert.deepEqual(page.items.map(item => item.id), [
    '881234567890123401',
    '881234567890123403',
    '881234567890123402',
  ])
  assert.deepEqual(page.items.map(item => item.cursor), [
    '991234567890123401',
    '991234567890123400',
    '991234567890123398',
  ])
  assert.equal(page.cursorId, '991234567890123398')
  assert.equal(page.readCursor, '991234567890123401')
  assert.equal(page.noMore, false)
  assert.equal(page.items[0]?.kind, 'system')
  assert.equal(typeof page.items[0]?.timestamp, 'number')
})

verify('System accepts current-client compatible string timestamps without dropping history', () => {
  const unified = {
    code: 0,
    data: {
      system_notify_list: [{
        id: '881234567890123406',
        cursor: '991234567890123395',
        title: '脱敏系统通知',
        content: '脱敏通知正文',
        time_at: '2026-08-17T10:20:30+12:00',
      }],
    },
  }
  const user = {
    code: 0,
    data: {
      system_notify_list: [{
        id: '881234567890123407',
        cursor: '991234567890123394',
        title: '脱敏历史通知',
        content: '脱敏历史正文',
        time_at: '1786926030000',
      }],
    },
  }

  const initialPage = parseSystemInitialPage(unified, user)
  assert.ok(initialPage)
  assert.equal(initialPage.items.length, 2)
  assert.deepEqual(initialPage.items.map(item => item.timestamp), [
    Math.floor(Date.parse('2026-08-17T10:20:30+12:00') / 1000),
    1786926030,
  ])

  const historyPage = parseSystemHistoryPage({
    code: 0,
    data: [{
      id: '881234567890123408',
      cursor: '991234567890123393',
      title: '脱敏更早通知',
      content: '脱敏更早正文',
      time_at: '2026-08-16T10:20:30+12:00',
    }],
  })
  assert.ok(historyPage)
  assert.equal(historyPage.items.length, 1)
})

verify('System keeps otherwise valid history when its display timestamp is malformed', () => {
  const malformedTimestamp = {
    code: 0,
    data: {
      system_notify_list: [{
        id: '881234567890123409',
        cursor: '991234567890123392',
        title: '脱敏通知',
        content: '脱敏正文',
        time_at: 'invalid-time',
      }],
    },
  }
  const emptyItems = {
    code: 0,
    data: { system_notify_list: [] },
  }

  const page = parseSystemInitialPage(malformedTimestamp, emptyItems)
  assert.ok(page)
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.timestamp, 0)
})

verify('non-empty System payloads cannot silently degrade into an empty state', () => {
  const malformedIdentity = {
    code: 0,
    data: {
      system_notify_list: [{
        title: '脱敏通知',
        content: '脱敏正文',
        time_at: 1786926030000,
      }],
    },
  }
  const emptyItems = {
    code: 0,
    data: { system_notify_list: [] },
  }

  assert.equal(parseSystemInitialPage(malformedIdentity, emptyItems), null)
})

verify('System legacy pagination uses only its confirmed cursor and accepts an empty tail', async () => {
  const nextResponse = await parseSystemHistoryNotificationResponse(createMockResponse(
    await readFixtureText('system/legacy-next.json'),
    { url: 'https://message.bilibili.com/x/sys-msg/query_notify_list?cursor=sanitized' },
  ))
  const nextPage = parseSystemHistoryPage(nextResponse)
  assert.ok(nextPage)
  assert.deepEqual(nextPage.items.map(item => item.id), [
    '881234567890123404',
    '881234567890123405',
  ])
  assert.equal(nextPage.cursorId, '991234567890123396')
  assert.equal(nextPage.noMore, false)
  assert.deepEqual(buildNextPageParams('system', nextPage.cursorId, nextPage.cursorTime), {
    cursor: '991234567890123396',
  })

  const emptyResponse = await parseSystemHistoryNotificationResponse(createMockResponse(
    await readFixtureText('system/legacy-empty.json'),
    { url: 'https://message.bilibili.com/x/sys-msg/query_notify_list?cursor=sanitized' },
  ))
  const emptyPage = parseSystemHistoryPage(emptyResponse)
  assert.ok(emptyPage)
  assert.deepEqual(emptyPage.items, [])
  assert.equal(emptyPage.noMore, true)
})

verify('System content parsing emits safe text and http links without HTML execution', () => {
  assert.deepEqual(parseSystemContentSegments('#{查看详情}{https://www.bilibili.com/video/BV1xx411c7mD}'), [
    { type: 'link', text: '查看详情', href: 'https://www.bilibili.com/video/BV1xx411c7mD' },
  ])
  assert.deepEqual(parseSystemContentSegments(JSON.stringify({
    web: '通知正文 https://www.bilibili.com/read/cv1',
  })), [
    { type: 'text', text: '通知正文 ' },
    { type: 'link', text: 'https://www.bilibili.com/read/cv1', href: 'https://www.bilibili.com/read/cv1' },
  ])
  assert.deepEqual(parseSystemContentSegments('#{危险链接}{javascript:alert(1)}'), [
    { type: 'text', text: '#{危险链接}{javascript:alert(1)}' },
  ])
  assert.deepEqual(parseSystemContentSegments('{"unknown_module":{"private":"redacted"}}'), [])
  assert.deepEqual(parseSystemContentSegments('{invalid-json'), [])
})

verify('System first-page adapter commits the confirmed read cursor once before publishing success', async () => {
  const [unified, user, history, readSuccess] = await Promise.all([
    parseSystemUnifiedNotificationResponse(createMockResponse(await readFixtureText('system/unified-first.json'))),
    parseSystemUserNotificationResponse(createMockResponse(await readFixtureText('system/user-first.json'))),
    parseSystemHistoryNotificationResponse(createMockResponse(await readFixtureText('system/legacy-next.json'))),
    parseSystemReadResponse(createMockResponse(await readFixtureText('system/update-cursor-success.json'))),
  ])
  const calls: Array<{ name: string, cursor?: string }> = []
  const fetchPage = createSystemNotificationPageFetcher({
    fetchUnified: async () => {
      calls.push({ name: 'unified' })
      return unified
    },
    fetchUser: async () => {
      calls.push({ name: 'user' })
      return user
    },
    fetchHistory: async (cursor) => {
      calls.push({ name: 'history', cursor })
      return history
    },
    markRead: async (cursor) => {
      calls.push({ name: 'read', cursor })
      return readSuccess
    },
  })

  const first = await fetchPage()
  const parsedFirst = parseNotificationPage('system', first)
  assert.ok(parsedFirst.page)
  assert.equal(parsedFirst.page.serverReadCommitted, true)
  assert.deepEqual(calls.slice(0, 3), [
    { name: 'unified' },
    { name: 'user' },
    { name: 'read', cursor: '991234567890123401' },
  ])

  const next = await fetchPage({ cursor: '991234567890123398' })
  assert.ok(parseNotificationPage('system', next).page)
  assert.deepEqual(calls.at(-1), {
    name: 'history',
    cursor: '991234567890123398',
  })
})

verify('System read failure does not publish a first page or fake local success', async () => {
  const [unified, user, readFailure] = await Promise.all([
    parseSystemUnifiedNotificationResponse(createMockResponse(await readFixtureText('system/unified-first.json'))),
    parseSystemUserNotificationResponse(createMockResponse(await readFixtureText('system/user-first.json'))),
    parseSystemReadResponse(createMockResponse(await readFixtureText('system/api-error.json'))),
  ])
  let readCount = 0
  const fetchPage = createSystemNotificationPageFetcher({
    fetchUnified: async () => unified,
    fetchUser: async () => user,
    fetchHistory: async () => ({ code: 0, data: [] }),
    markRead: async () => {
      readCount++
      return readFailure
    },
  })
  const result = parseNotificationPage('system', await fetchPage())
  assert.equal(readCount, 1)
  assert.equal(result.page, undefined)
  assert.equal(result.errorKind, 'login-required')
})

verify('empty System first pages do not manufacture a server read commit', async () => {
  const emptyResponse = {
    code: 0,
    data: { system_notify_list: [] },
  }
  let readCalls = 0
  const fetchPage = createSystemNotificationPageFetcher({
    fetchUnified: () => Promise.resolve(emptyResponse),
    fetchUser: () => Promise.resolve(emptyResponse),
    fetchHistory: () => Promise.resolve({ code: 0, data: [] }),
    markRead: () => {
      readCalls++
      return Promise.resolve({ code: 0, data: null })
    },
  })
  const response = await fetchPage()
  const parsed = parseNotificationPage('system', response)
  assert.ok(parsed.page)
  assert.equal(parsed.page.serverReadCommitted, false)
  assert.equal(readCalls, 0)

  const mid = ref('100')
  const controller = useNotificationFeeds(mid, {
    fetchPage: () => Promise.resolve(response),
  })
  await controller.loadInitial('system')
  assert.equal(controller.states.system.loaded, true)
  assert.equal(controller.states.system.serverReadCommitted, false)
  assert.equal(controller.getReadCandidate('system'), null)
})

verify('System fixtures are sanitized and contain only currently observed item fields', async () => {
  for (const name of [
    'system/unified-first.json',
    'system/user-first.json',
    'system/legacy-next.json',
    'system/legacy-empty.json',
    'system/update-cursor-success.json',
  ] as const) {
    const source = await readFixtureText(name)
    assert.equal(/SESSDATA|bili_jct|csrf|cookie|mid|uid|uname|avatar/i.test(source), false, name)
    assert.equal(/https?:\/\/[^"\s]+\?/i.test(source), false, name)
    assert.equal(/"(?:modules|actions|fields|image|cover)"\s*:/i.test(source), false, name)
  }
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
  const firstSystem = createReadCommitId('system', '100', 2, 1)
  assert.notEqual(firstReply, secondReply)
  assert.equal(new Set([firstReply, firstAt, firstLike, firstSystem]).size, 4)
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

verify('retry dispatch follows the failed operation instead of item count', async () => {
  const firstFixture = await readFixtureJson('reply-first.json')
  const nextFixture = await readFixtureJson('reply-next.json')
  const apiError = await readFixtureJson('api-error.json')

  const initialParams: Array<unknown> = []
  const initialResponses = [apiError, firstFixture]
  const initialController = useNotificationFeeds(ref('100'), {
    fetchPage: (_section, params) => {
      initialParams.push(params)
      return Promise.resolve(initialResponses.shift())
    },
  })
  await initialController.loadInitial('reply')
  assert.equal(Reflect.get(initialController.states.reply, 'failedOperation'), 'initial')
  await getRetryFailedOperation(initialController).call(initialController, 'reply')
  assert.deepEqual(initialParams, [undefined, undefined])
  assert.equal(initialController.states.reply.loaded, true)

  const refreshParams: Array<unknown> = []
  const refreshResponses = [firstFixture, apiError, firstFixture]
  const refreshController = useNotificationFeeds(ref('100'), {
    fetchPage: (_section, params) => {
      refreshParams.push(params)
      return Promise.resolve(refreshResponses.shift())
    },
  })
  await refreshController.loadInitial('reply')
  const oldRefreshItems = refreshController.states.reply.items.map(item => item.id)
  await refreshController.refresh('reply')
  assert.equal(Reflect.get(refreshController.states.reply, 'failedOperation'), 'refresh')
  assert.deepEqual(refreshController.states.reply.items.map(item => item.id), oldRefreshItems)
  await getRetryFailedOperation(refreshController).call(refreshController, 'reply')
  assert.deepEqual(refreshParams, [undefined, undefined, undefined])

  const loadMoreParams: Array<unknown> = []
  const loadMoreResponses = [firstFixture, apiError, nextFixture]
  const loadMoreController = useNotificationFeeds(ref('100'), {
    fetchPage: (_section, params) => {
      loadMoreParams.push(params)
      return Promise.resolve(loadMoreResponses.shift())
    },
  })
  await loadMoreController.loadInitial('reply')
  await loadMoreController.loadMore('reply')
  assert.equal(Reflect.get(loadMoreController.states.reply, 'failedOperation'), 'load-more')
  await getRetryFailedOperation(loadMoreController).call(loadMoreController, 'reply')
  assert.equal(loadMoreParams.length, 3)
  assert.equal(loadMoreParams[0], undefined)
  assert.ok(loadMoreParams[1])
  assert.ok(loadMoreParams[2])
})

verify('same-cursor pages stop automatic pagination and allow one explicit retry', async () => {
  const firstFixture = await readFixtureJson('reply-first.json')
  const stalledEmpty = await readFixtureJson('reply-same-cursor-empty.json')
  const stalledDuplicate = await readFixtureJson('reply-same-cursor-duplicate.json')
  const responses = [firstFixture, stalledEmpty, stalledDuplicate]
  let requestCount = 0
  const controller = useNotificationFeeds(ref('100'), {
    fetchPage: () => {
      requestCount++
      return Promise.resolve(responses.shift())
    },
  })

  await controller.loadInitial('reply')
  await controller.loadMore('reply')
  assert.equal(Reflect.get(controller.states.reply, 'paginationStalled'), true)
  assert.equal(Reflect.get(controller.states.reply, 'failedOperation'), 'load-more')
  await controller.loadMore('reply')
  assert.equal(requestCount, 2)

  await getRetryFailedOperation(controller).call(controller, 'reply')
  assert.equal(requestCount, 3)
  assert.equal(Reflect.get(controller.states.reply, 'paginationStalled'), true)
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
    now: 300_999,
    reason: 'activate',
    unreadCount: 0,
  }), false)
  assert.equal(shouldRefreshFeed(state, {
    now: 301_000,
    reason: 'activate',
    unreadCount: 0,
  }), true)
  assert.equal(shouldRefreshFeed(state, {
    force: true,
    now: 1_001,
    reason: 'manual',
    unreadCount: 0,
  }), true)
})

verify('zero authoritative unread reconciles without a redundant global sync', async () => {
  let syncCount = 0
  let waitCount = 0
  const result = await reconcileNotificationBadge({
    getUnreadCount: () => 0,
    isCurrent: () => true,
    retryDelays: [250, 750],
    sync: async () => {
      syncCount++
    },
    wait: async () => {
      waitCount++
      return true
    },
  })
  assert.equal(result, 'reconciled')
  assert.equal(syncCount, 0)
  assert.equal(waitCount, 0)
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
  const systemPage = parseSystemHistoryPage(await parseSystemHistoryNotificationResponse(createMockResponse(
    await readFixtureText('system/legacy-next.json'),
  )))
  assert.ok(systemPage)
  const fixtures = {
    reply: await readFixtureJson('reply-first.json'),
    at: await readFixtureJson('at-first.json'),
    love: await readFixtureJson('like-first.json'),
    system: buildSystemPageResponse(systemPage),
  }
  const mid = ref('100')
  const controller = useNotificationFeeds(mid, {
    fetchPage: section => Promise.resolve(fixtures[section]),
  })

  await Promise.all([
    controller.loadInitial('reply'),
    controller.loadInitial('at'),
    controller.loadInitial('love'),
    controller.loadInitial('system'),
  ])
  controller.states.reply.scrollTop = 480
  controller.states.at.scrollTop = 320
  controller.states.love.scrollTop = 160
  controller.states.system.scrollTop = 80

  assert.equal(controller.states.reply.cursorId, '7849910264738201601')
  assert.equal(controller.states.at.cursorId, '7850010264738201701')
  assert.equal(controller.states.love.cursorId, '7850110264738201803')
  assert.equal(controller.states.system.cursorId, '991234567890123396')
  assert.deepEqual([
    controller.states.reply.scrollTop,
    controller.states.at.scrollTop,
    controller.states.love.scrollTop,
    controller.states.system.scrollTop,
  ], [480, 320, 160, 80])
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

  for (const section of ['reply', 'at', 'love', 'system'] as const) {
    assert.equal(controller.states[section].loaded, false)
    assert.equal(controller.states[section].items.length, 0)
    assert.equal(controller.states[section].generation, 1)
  }
})

verify('invalid notificationView values safely fall back to whisper', () => {
  for (const value of ['', 'unknown', 'settings', 'toString', 'constructor', '__proto__', '**proto**', 'valueOf']) {
    assert.equal(parseNotificationView(`https://www.bilibili.com/?notificationView=${encodeURIComponent(value)}`), 'whisper')
  }
  for (const value of ['whisper', 'reply', 'at', 'love', 'system']) {
    assert.equal(parseNotificationView(`https://www.bilibili.com/?notificationView=${value}`), value)
  }
  assert.equal(parseNotificationView('not a valid absolute URL'), 'whisper')
})

verify('legacy message settings routes normalize before the notification outlet renders', () => {
  const legacy = normalizeNotificationRoute(
    'https://www.bilibili.com/?page=Notifications&notificationView=settings',
  )
  assert.deepEqual(legacy, {
    view: 'whisper',
    openMessageSettings: true,
    normalizedUrl: 'https://www.bilibili.com/?page=Notifications&notificationView=whisper',
  })
  assert.deepEqual(normalizeNotificationRoute(
    'https://message.bilibili.com/#/config',
  ), legacy)
  const valid = normalizeNotificationRoute(
    'https://www.bilibili.com/?page=Notifications&notificationView=reply',
  )
  assert.equal(valid.view, 'reply')
  assert.equal(valid.openMessageSettings, false)
})

verify('System transport emulates only the verified message-site GET request context', async () => {
  const rules = JSON.parse(await readFile(
    new URL('../assets/rules.json', import.meta.url),
    'utf8',
  )) as Array<{
    action?: { requestHeaders?: Array<{ header?: string, operation?: string, value?: string }> }
    condition?: { regexFilter?: string, requestMethods?: string[], resourceTypes?: string[] }
  }>
  const systemRule = rules.find(rule => rule.condition?.regexFilter?.includes('/x/sys-msg/'))
  assert.ok(systemRule)
  assert.equal(
    systemRule.condition?.regexFilter,
    '^https://message\\.bilibili\\.com/x/sys-msg/(?:query_unified_notify|query_user_notify|query_notify_list|update_cursor)\\?',
  )
  assert.deepEqual(systemRule.condition?.requestMethods, ['get'])
  assert.deepEqual(systemRule.condition?.resourceTypes, ['xmlhttprequest'])
  assert.deepEqual(systemRule.action?.requestHeaders, [
    { header: 'origin', operation: 'set', value: 'https://message.bilibili.com' },
    { header: 'referer', operation: 'set', value: 'https://message.bilibili.com/' },
  ])
})

verify('restored whisper routes do not focus the conversation heading without an explicit selection', async () => {
  const source = await readFile(
    new URL('../src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', import.meta.url),
    'utf8',
  )
  assert.ok(source.includes('pendingDetailFocusKey'))
  assert.ok(source.includes('pendingDetailFocusKey = session.key'))
  assert.ok(source.includes('pendingDetailFocusKey = `transient:' + '$' + '{recipient.mid}`'))
  assert.ok(source.includes('nextSessionKey === pendingDetailFocusKey'))
  assert.equal(source.includes('if (nextSessionKey) {\n    conversationDetailRef.value?.focusHeading()'), false)
})

verify('transient home and search failures never emit raw Error objects', async () => {
  const [homeSource, searchSource, searchBarSource] = await Promise.all([
    readFile(new URL('../src/contentScripts/views/Home/components/ForYou.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/logic/searchExperience.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SearchBar/SearchBar.vue', import.meta.url), 'utf8'),
  ])
  const homeFailureLogger = homeSource.slice(
    homeSource.indexOf('function logRecommendRequestFailure'),
    homeSource.indexOf('// 当前使用的视频列表'),
  )
  assert.ok(homeFailureLogger.includes('debugLog'))
  assert.equal(homeFailureLogger.includes('console.error'), false)
  assert.equal(homeFailureLogger.includes('...details'), false)
  assert.ok(searchSource.includes('isExtensionContextInvalidatedError'))
  assert.ok(searchSource.includes('extensionContextInvalidated'))
  assert.equal(searchSource.includes('console.error(\'Failed to load hot search list:\''), false)
  assert.ok(searchBarSource.includes('isExtensionContextInvalidatedError'))
})

verify('extension-invalidated empty and loading states do not throw during setup', async () => {
  const [loadingSource, emptySource, messagingSource] = await Promise.all([
    readFile(new URL('../src/components/Loading.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Empty.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/messaging.ts', import.meta.url), 'utf8'),
  ])
  assert.ok(messagingSource.includes('export function getExtensionAssetUrl'))
  assert.equal(loadingSource.includes('browser.runtime.getURL'), false)
  assert.equal(emptySource.includes('browser.runtime.getURL'), false)
  assert.match(loadingSource, /<PageLoadingIndicator/)
  assert.doesNotMatch(loadingSource, /loading\.gif|<img\b/)
  assert.ok(emptySource.includes('v-if="emptyImg"'))
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
