import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { effectScope, nextTick } from 'vue'

import { normalizeMomentCommentPage } from '../src/components/MomentCard/commentUtils'
import type { StorageLocalRuntime } from '../src/composables/useStorageLocal'
import { matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL } from '../src/constants/pageBridge'
import { AppPage } from '../src/enums/appEnums'
import { isAccountRequestCurrent } from '../src/utils/accountScope'
import { createBooleanSingleFlight, resolveAppAccessTokenFreshness } from '../src/utils/appAuthTokenPolicy'
import { shortenCommentDateText, shouldScheduleWidescreenRefresh } from '../src/utils/bewlyWidescreenPolicy'
import { resolveCanvasCssColor } from '../src/utils/canvasTheme'
import { resolveActiveDockItemPage } from '../src/utils/dockActiveItem'
import { compileFilterRules, normalizeImportedFilterRules } from '../src/utils/filterRules'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '../src/utils/iframeMessage'
import { createPageSettingsPayload } from '../src/utils/pageSettingsProtocol'
import { applyConfiguredPlaybackRate, resolvePlaybackRateChange } from '../src/utils/playbackRate'
import { RANDOM_PLAY_VIDEO_RETRY_MAX, shouldRetryRandomPlayVideo } from '../src/utils/randomPlayRetry'
import { getRangeProgress } from '../src/utils/range'
import { sanitizeSearchHighlight } from '../src/utils/searchHighlight'
import { CONTRIBUTORS_IMAGE_URL, prepareContributorsImage } from './contributorsCache'

function verifyAccountScopes() {
  for (const flow of ['History load', 'UserPanel load', 'History delete']) {
    let currentAccountId = 1
    let requestGeneration = 0
    const requestAccountId = currentAccountId
    const generation = requestGeneration
    const state = ['account-b-state']

    currentAccountId = 2
    requestGeneration++
    if (isAccountRequestCurrent(requestAccountId, generation, currentAccountId, requestGeneration))
      state.push('stale-account-a-result')

    assert.deepEqual(state, ['account-b-state'], `${flow} must reject an account A response after switching to B`)
  }
}

function verifyPlaybackRatePolicy() {
  let savedPlaybackRate = 2
  const video = { defaultPlaybackRate: 1, playbackRate: 1 }
  const delayedResetDecision = resolvePlaybackRateChange(video.playbackRate, savedPlaybackRate, false)
  assert.equal(delayedResetDecision.type, 'restore')
  if (delayedResetDecision.type === 'restore')
    applyConfiguredPlaybackRate(video, savedPlaybackRate)
  assert.equal(video.playbackRate, 2)
  assert.equal(video.defaultPlaybackRate, 2)
  assert.equal(savedPlaybackRate, 2)

  video.playbackRate = 1.5
  const userDecision = resolvePlaybackRateChange(video.playbackRate, savedPlaybackRate, true)
  assert.deepEqual(userDecision, { type: 'save', rate: 1.5 })
  if (userDecision.type === 'save')
    savedPlaybackRate = userDecision.rate
  assert.equal(savedPlaybackRate, 1.5)
}

function verifyWidescreenMutationPolicy() {
  assert.equal(shouldScheduleWidescreenRefresh([
    { insideRoot: true, relevant: true },
    { insideRoot: true, relevant: false },
  ]), false)
  assert.equal(shouldScheduleWidescreenRefresh([
    { insideRoot: false, relevant: false },
    { insideRoot: false, relevant: true },
  ]), true)
  assert.equal(shortenCommentDateText('发布于 2026-08-22 12:30'), '发布于 08-22 12:30')
}

function verifyRandomPlayRetryPolicy() {
  assert.equal(shouldRetryRandomPlayVideo(RANDOM_PLAY_VIDEO_RETRY_MAX - 1), true)
  assert.equal(shouldRetryRandomPlayVideo(RANDOM_PLAY_VIDEO_RETRY_MAX), false)
}

function verifyAppAuthTokenPolicy() {
  const now = 1_000_000
  const base = {
    accessToken: 'access',
    refreshToken: 'refresh',
    accessTokenExpiresAt: now + 60_000,
    refreshTokenExpiresAt: now + 120_000,
  }
  assert.equal(resolveAppAccessTokenFreshness(base, now, 10_000), 'valid')
  assert.equal(resolveAppAccessTokenFreshness(base, now, 70_000), 'refresh-required')
  assert.equal(resolveAppAccessTokenFreshness({ ...base, refreshTokenExpiresAt: now }, now, 0), 'refresh-expired')
  assert.equal(resolveAppAccessTokenFreshness({ ...base, accessToken: '' }, now, 0), 'missing')
}

async function verifyAppAuthSingleFlight() {
  const runSingleFlight = createBooleanSingleFlight()
  let refreshCount = 0
  let resolveRefresh!: (value: boolean) => void
  const refreshResult = new Promise<boolean>((resolve) => {
    resolveRefresh = resolve
  })
  const refresh = () => {
    refreshCount++
    return refreshResult
  }
  const first = runSingleFlight(refresh)
  const second = runSingleFlight(refresh)
  assert.equal(first, second)
  assert.equal(refreshCount, 1)
  resolveRefresh(true)
  assert.deepEqual(await Promise.all([first, second]), [true, true])
}

function verifyCanvasThemeResolution() {
  const style = {
    getPropertyValue: (name: string) => name === '--bew-theme-color' ? '  rgb(1, 2, 3)  ' : '',
  }
  assert.equal(resolveCanvasCssColor(style, '--bew-theme-color', '#00a1d6'), 'rgb(1, 2, 3)')
  assert.equal(resolveCanvasCssColor(style, '--missing', '#fallback'), '#fallback')
  assert.equal(resolveCanvasCssColor({ getPropertyValue: () => 'var(--other)' }, '--theme', '#fallback'), '#fallback')
}

function verifyFilterRuleImport() {
  const result = normalizeImportedFilterRules([
    { keyword: '  Hello  ', remark: '  title  ' },
    { keyword: '/foo\\d+/', remark: ' regex ' },
    { keyword: 'hello', remark: 'duplicate' },
    { keyword: '/[/', remark: 'invalid regex' },
    { keyword: '', remark: 'empty' },
    JSON.parse('{"keyword":"blocked","remark":"x","__proto__":{}}'),
    { keyword: 1, remark: '' },
  ])
  assert.equal(result.valid, true)
  assert.deepEqual(result.rules, [
    { keyword: 'Hello', remark: 'title' },
    { keyword: '/foo\\d+/', remark: 'regex' },
  ])
  assert.equal(result.duplicates, 1)
  assert.equal(result.ignored, 4)
  assert.doesNotThrow(() => compileFilterRules(null))
  assert.doesNotThrow(() => compileFilterRules([
    { keyword: '/[/' },
    { keyword: 'safe' },
  ]))
  const compiled = compileFilterRules(result.rules)
  assert.equal(compiled.stringValues.includes('HELLO'), true)
  assert.equal(compiled.regExpValues[0]?.test('foo123'), true)
}

function verifySliderProgress() {
  let parentValue = 1
  parentValue = 50
  assert.equal(getRangeProgress(parentValue, 0, 100), 50)
  parentValue = 20
  assert.equal(getRangeProgress(parentValue, 0, 100), 20)
  assert.equal(getRangeProgress(20, 10, 10), 0)
}

async function verifyStorageScopeLifecycle() {
  ;(globalThis as typeof globalThis & { chrome?: unknown }).chrome ??= { runtime: { id: 'targeted-test' } }
  const { useStorageLocal } = await import('../src/composables/useStorageLocal')

  let resolveInitialRead!: (value: Record<string, unknown>) => void
  const initialRead = new Promise<Record<string, unknown>>((resolve) => {
    resolveInitialRead = resolve
  })
  let subscribeCount = 0
  let persistCount = 0
  let onReadyCount = 0
  const runtime: StorageLocalRuntime = {
    clearTimeout: timer => clearTimeout(timer),
    get: () => initialRead,
    remove: async () => {},
    set: async () => {
      persistCount++
    },
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    sleep: async () => {},
    subscribe: () => {
      subscribeCount++
      return () => {
        subscribeCount--
      }
    },
  }

  const scope = effectScope()
  let storedRef: ReturnType<typeof useStorageLocal<string>> | undefined
  scope.run(() => {
    storedRef = useStorageLocal<string>('scope-disposal', 'initial', {
      onReady: () => {
        onReadyCount++
      },
      runtime,
      writeDefaults: false,
    })
  })
  scope.stop()
  resolveInitialRead({ 'scope-disposal': 'stored' })
  await Promise.resolve()
  await nextTick()

  storedRef!.value = 'local-edit'
  await nextTick()
  assert.equal(subscribeCount, 0)
  assert.equal(persistCount, 0)
  assert.equal(onReadyCount, 0)
}

async function verifyStorageSuppressionRecovery() {
  const { useStorageLocal } = await import('../src/composables/useStorageLocal')
  let storageListener: ((changes: Record<string, any>, areaName: string) => void | Promise<void>) | undefined
  let persistCount = 0
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const runtime: StorageLocalRuntime = {
    clearTimeout: timer => clearTimeout(timer),
    get: async () => ({}),
    remove: async () => {},
    set: async () => {
      persistCount++
    },
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    sleep: async () => {},
    subscribe: (listener) => {
      storageListener = listener
      return () => {
        storageListener = undefined
      }
    },
  }
  const scope = effectScope()
  let storedRef: ReturnType<typeof useStorageLocal<string>> | undefined
  scope.run(() => {
    storedRef = useStorageLocal('suppression', 'initial', {
      onError: () => {},
      onReady: resolveReady,
      runtime,
      serializer: {
        read: (raw) => {
          if (raw === 'malformed')
            throw new Error('malformed')
          return raw
        },
        write: value => value,
      },
      writeDefaults: false,
    })
  })
  await ready
  await storageListener?.({ suppression: { newValue: 'malformed' } }, 'local')
  storedRef!.value = 'local-edit'
  await nextTick()
  await Promise.resolve()
  assert.equal(persistCount, 1)
  scope.stop()
}

function verifyDockReorderPolicy() {
  const initial = [AppPage.Home, AppPage.Anime, AppPage.History].map(page => ({ page }))
  const reordered = [AppPage.Anime, AppPage.History, AppPage.Home].map(page => ({ page }))
  assert.equal(resolveActiveDockItemPage(initial, AppPage.Home, true, true), AppPage.Home)
  assert.equal(resolveActiveDockItemPage(reordered, AppPage.Home, true, true), AppPage.Home)
  assert.equal(reordered.findIndex(item => item.page === AppPage.Home), 2)

  const hidden = reordered.filter(item => item.page !== AppPage.Home)
  assert.equal(resolveActiveDockItemPage(hidden, AppPage.Home, true, true), undefined)
  assert.equal(resolveActiveDockItemPage(reordered, AppPage.Home, true, true), AppPage.Home)

  const nonActiveReorder = [AppPage.History, AppPage.Anime, AppPage.Home].map(page => ({ page }))
  assert.equal(resolveActiveDockItemPage(nonActiveReorder, AppPage.Home, true, true), AppPage.Home)
}

function verifyPageSettingsPayload() {
  const value = {
    adjustCommentImageHeight: true,
    cleanShareLinkIncludeTitle: false,
    cleanShareLinkRemoveTrackingParams: true,
    commentReplyPaginationMode: 'pagination',
    commentReplyTreeMode: 'lineKeepMain',
    depersonalizeSearchResults: true,
    enableCleanShareLink: true,
    enableCommentReplyTreeDisplay: true,
    language: 'cmn-CN',
    preventMobileRedirect: false,
    secretSetting: 'must-not-leak',
    showCommentHostTag: true,
    showIPLocation: false,
    showSex: true,
  }
  assert.deepEqual(createPageSettingsPayload(value), {
    adjustCommentImageHeight: true,
    cleanShareLinkIncludeTitle: false,
    cleanShareLinkRemoveTrackingParams: true,
    commentReplyPaginationMode: 'pagination',
    commentReplyTreeMode: 'lineKeepMain',
    enableCleanShareLink: true,
    enableCommentReplyTreeDisplay: true,
    language: 'cmn-CN',
    preventMobileRedirect: false,
    showCommentHostTag: true,
    showIPLocation: false,
    showSex: true,
  })
  assert.equal(createPageSettingsPayload({ ...value, commentReplyTreeMode: 'invalid' }), null)
  assert.equal(createPageSettingsPayload({ ...value, language: 'invalid' }), null)
  assert.equal(createPageSettingsPayload({ ...value, showSex: 'true' }), null)
  assert.equal(createPageSettingsPayload([]), null)
}

function verifyPageBridgeBoundary() {
  const source = {} as Window
  const channelId = 'channel-id'
  const data = {
    protocol: PAGE_BRIDGE_PROTOCOL,
    channelId,
    type: PAGE_BRIDGE_MESSAGE.SETTINGS_UPDATE,
    data: {},
  }
  const expected = {
    source,
    origin: 'https://www.bilibili.com',
    channelId,
    type: PAGE_BRIDGE_MESSAGE.SETTINGS_UPDATE,
  } as const
  const validEvent = { data, origin: expected.origin, source }

  assert.equal(matchesPageBridgeEvent(validEvent, expected), true)
  assert.equal(matchesPageBridgeEvent({ ...validEvent, data: { ...data, protocol: 'wrong' } }, expected), false)
  assert.equal(matchesPageBridgeEvent({ ...validEvent, data: { ...data, channelId: 'wrong' } }, expected), false)
  assert.equal(matchesPageBridgeEvent({ ...validEvent, origin: 'https://evil.example' }, expected), false)
  assert.equal(matchesPageBridgeEvent({ ...validEvent, source: {} as Window }, expected), false)
}

function verifyIframeBoundary() {
  const contentWindow = {} as Window
  const iframe = {
    contentWindow,
    getAttribute: (name: string) => name === 'src' ? 'https://message.bilibili.com/' : null,
  }
  const validEvent = {
    data: { type: 'BEWLY_DRAWER_CLOSE_REQUEST' },
    origin: 'https://message.bilibili.com',
    source: contentWindow,
  }

  assert.deepEqual(getIframeMessageData(validEvent, iframe, 'https://www.bilibili.com/'), validEvent.data)
  assert.equal(getIframeMessageData({ ...validEvent, source: {} as Window }, iframe), undefined)
  assert.equal(getIframeMessageData({ ...validEvent, origin: 'https://www.bilibili.com' }, iframe), undefined)
  assert.equal(getIframeMessageData(validEvent, { ...iframe, getAttribute: () => '' }), undefined)
  assert.equal(getIframeMessageData(validEvent, { ...iframe, getAttribute: () => 'about:blank' }), undefined)
  assert.equal(getIframeMessageData(validEvent, { ...iframe, getAttribute: () => 'http://[invalid' }), undefined)
  assert.equal(getIframeMessageData({ ...validEvent, data: [] }, iframe), undefined)

  const targetOrigins: string[] = []
  const postTarget = {
    getAttribute: () => 'https://s1.hdslb.com/frame.html',
    contentWindow: {
      postMessage: (_message: unknown, targetOrigin: string) => targetOrigins.push(targetOrigin),
    } as unknown as Window,
  }
  assert.equal(postMessageToIframe(postTarget, { type: 'test' }), false)
  assert.equal(markIframeReadyForMessaging(postTarget), true)
  assert.equal(postMessageToIframe(postTarget, { type: 'test' }), true)
  assert.deepEqual(targetOrigins, ['https://s1.hdslb.com'])
  assert.equal(postMessageToIframe({
    ...postTarget,
    contentWindow: {
      location: {
        href: 'about:blank',
        origin: 'https://www.bilibili.com',
      },
      postMessage: () => assert.fail('initial about:blank must not receive a message'),
    } as unknown as Window,
  }, { type: 'test' }), false)
  const mismatchedTarget = {
    ...postTarget,
    contentWindow: {
      postMessage: () => {
        throw new DOMException('Origin mismatch')
      },
    } as unknown as Window,
  }
  assert.equal(markIframeReadyForMessaging(mismatchedTarget), true)
  assert.equal(postMessageToIframe(mismatchedTarget, { type: 'test' }), false)
}

function verifySearchHighlightSanitizer() {
  assert.equal(
    sanitizeSearchHighlight('<em class="keyword">test</em>'),
    '<em class="keyword">test</em>',
  )
  const sanitized = sanitizeSearchHighlight(
    '<img src=x onerror=alert(1)>plain<script>alert(1)</script><a href="javascript:alert(1)">link</a>',
  )
  assert.equal(sanitized.includes('<img'), false)
  assert.equal(sanitized.includes('<script'), false)
  assert.equal(sanitized.includes('<a'), false)
  assert.equal(sanitized.includes('onerror'), false)
  assert.equal(sanitized.includes('javascript:'), false)
  assert.ok(sanitized.includes('plain'))
  assert.ok(sanitized.includes('link'))

  const restricted = sanitizeSearchHighlight(
    '<em class="keyword" onclick="alert(1)">test</em><em data-secret="x">value</em>',
  )
  assert.equal(restricted.includes('onclick'), false)
  assert.equal(restricted.includes('data-secret'), false)
  assert.ok(restricted.includes('test'))
  assert.ok(restricted.includes('value'))
}

function verifyCommentRichText() {
  const response = {
    code: 0,
    data: {
      page: { num: 1, size: 8, count: 1 },
      replies: [{
        rpid: 1,
        ctime: 100,
        member: { mid: 10, uname: 'Author', avatar: 'author.webp', vip: {} },
        content: {
          message: 'plain [doge] @Alice [unknown]',
          emote: { '[doge]': { url: 'https://i.example/doge.webp' } },
          members: [{ mid: 20, uname: 'Alice' }],
        },
        replies: [{
          rpid: 2,
          ctime: 101,
          member: { mid: 11, uname: 'Reply', avatar: 'reply.webp', vip: {} },
          content: {
            message: 'nested [tv]',
            emote: { '[tv]': { url: 'https://i.example/tv.webp' } },
          },
        }],
      }],
    },
  }

  const page = normalizeMomentCommentPage(response, 1, 8)
  const comment = page.items[0]
  assert.ok(comment)
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('plain')))
  assert.ok(comment.segments.some(segment => segment.type === 'emote' && segment.text === '[doge]'))
  assert.ok(comment.segments.some(segment => segment.type === 'mention' && segment.mid === '20'))
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('[unknown]')))
  assert.ok(comment.replies[0]?.segments.some(segment => segment.type === 'emote' && segment.text === '[tv]'))
}

async function verifyComponentContracts() {
  const root = process.cwd()
  const [
    dock,
    sidebar,
    slider,
    watchLater,
    gridCard,
    commentSection,
    commentRichText,
    layoutEdit,
    historyPop,
    userPanelPop,
    player,
  ] = await Promise.all([
    readFile(`${root}/src/components/Dock/Dock.vue`, 'utf8'),
    readFile(`${root}/src/components/SideBar/SideBar.vue`, 'utf8'),
    readFile(`${root}/src/components/Slider.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/WatchLater/WatchLater.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/WatchLater/WatchLaterGridCard.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCommentSection.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCommentRichText.vue`, 'utf8'),
    readFile(`${root}/src/logic/layoutEdit.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/HistoryPop.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/UserPanelPop.vue`, 'utf8'),
    readFile(`${root}/src/utils/player.ts`, 'utf8'),
  ])

  assert.match(dock, /ref="dockIndicatorRef"/)
  assert.match(dock, /updateIndicator\(false\)/)
  assert.match(dock, /:aria-label="\$t\(dockItem\.i18nKey\)"/)
  assert.match(dock, /dock-theme-toggle/)
  assert.match(dock, /dock-collapse-toggle/)
  assert.match(dock, /dock-refresh-back-to-top-action/)
  assert.match(sidebar, /sidebar-theme-toggle/)
  assert.match(sidebar, /sidebar-auto-hide/)
  assert.match(sidebar, /:aria-label="isLayoutEditing/)

  assert.doesNotMatch(slider, /ref\(props\.modelValue\)/)
  assert.doesNotMatch(slider, /addEventListener\('input'/)
  assert.match(slider, /v-model\.number="model"/)
  assert.match(slider, /--slider-progress/)

  assert.match(watchLater, /function playAndRemove/)
  assert.match(watchLater, /function playInWatchLater/)
  assert.match(watchLater, /function remove/)
  assert.match(watchLater, /<IconButton/)
  assert.match(gridCard, /:disabled="disabled"/)

  assert.match(commentSection, /tabindex="-1"/)
  assert.match(commentSection, /aria-hidden="true"/)
  assert.match(commentSection, /MomentCommentRichText :segments="reply\.segments"/)
  assert.match(commentRichText, /@error="markEmoteFailed/)

  assert.match(historyPop, /watch\(currentAccountId/)
  assert.match(historyPop, /async function deleteHistoryItem[\s\S]*isAccountRequestCurrent/)
  assert.match(userPanelPop, /watch\(\[currentAccountId, shouldLoadLoginLog\]/)
  assert.match(userPanelPop, /function clearAccountData/)
  assert.match(player, /PLAYBACK_RATE_USER_INTENT_DURATION_MS/)
  assert.match(player, /bpx-player-ctrl-playbackrate-menu-item/)
  assert.match(player, /playbackRateEnhancementTimers/)
  assert.match(player, /playbackRateLifecycleActive = false/)
  assert.match(player, /resolvePlaybackRateChange/)

  for (const id of [
    'dock-theme-toggle',
    'dock-collapse-toggle',
    'dock-refresh-action',
    'dock-back-to-top-action',
    'dock-refresh-back-to-top-action',
    'dock-undo-refresh-action',
    'dock-forward-refresh-action',
    'sidebar-theme-toggle',
    'sidebar-auto-hide',
  ]) {
    assert.match(layoutEdit, new RegExp(`id: '${id}'`))
  }
}

async function verifyP1Contracts() {
  const root = process.cwd()
  const [
    storageLocal,
    widescreen,
    randomPlay,
    player,
    authProvider,
    background,
    manifest,
    forYou,
    dislikeDialog,
    videoCardLogic,
    shadowCurve,
    homeSettings,
  ] = await Promise.all([
    readFile(`${root}/src/composables/useStorageLocal.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/utils/randomPlay.ts`, 'utf8'),
    readFile(`${root}/src/utils/player.ts`, 'utf8'),
    readFile(`${root}/src/utils/authProvider.ts`, 'utf8'),
    readFile(`${root}/src/background/index.ts`, 'utf8'),
    readFile(`${root}/src/manifest.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Home/components/ForYou.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCardContextMenu/components/DislikeDialog.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/composables/useVideoCardLogic.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/components/ShadowCurveEditor.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/Home/Home.vue`, 'utf8'),
  ])

  assert.match(storageLocal, /const ownerScope = getCurrentScope\(\)/)
  assert.match(storageLocal, /ownerScope\.run\(register\)/)
  assert.match(storageLocal, /if \(!isOwnerActive\(\)\)/)
  assert.doesNotMatch(storageLocal, /suppressedWriteCount/)

  assert.match(widescreen, /new MutationObserver\(\(records\)/)
  assert.match(widescreen, /shouldScheduleWidescreenRefresh\(origins\)/)
  assert.match(widescreen, /querySelectorAll<HTMLElement>\(COMMENT_TIME_SELECTOR\)/)
  assert.match(widescreen, /currentState\.colorProbe\?\.remove\(\)/)

  assert.match(randomPlay, /videoListenerRetryCount\+\+/)
  assert.match(randomPlay, /generation !== videoListenerGeneration/)
  assert.match(randomPlay, /initializationRetryCount >= RANDOM_PLAY_UI_RETRY_MAX/)
  assert.match(randomPlay, /function invalidateVideoListenerRetry/)
  assert.match(randomPlay, /function destroyRandomPlay[\s\S]{0,180}invalidateVideoListenerRetry/)
  assert.match(randomPlay, /function resetRandomPlayInitialization[\s\S]{0,240}stopRandomPlayVideoMonitoring\(\)/)
  assert.match(randomPlay, /function resetRandomPlayInitialization[\s\S]{0,420}clearCustomEpisodeVisualOrder\(\)/)
  assert.match(randomPlay, /observePlayerDom\([\s\S]{0,240}videoListenerRetryCount = 0/)
  assert.match(player, /AUTO_EXIT_FULLSCREEN_RETRY_MAX = 20/)
  assert.match(player, /export function cancelPlayerRetryTasks/)
  assert.match(player, /private timer: ReturnType<typeof setTimeout> \| null = null/)
  assert.match(player, /generation !== autoExitFullscreenGeneration/)

  assert.match(authProvider, /let ensureFreshAppAccessTokenPromise: Promise<boolean> \| null = null/)
  assert.match(authProvider, /function refreshAppAccessTokenSingleFlight/)
  assert.match(authProvider, /finally\(\(\) =>/)
  assert.match(authProvider, /appAuthTokens\.value\.refreshToken !== refreshToken/)
  assert.doesNotMatch(background, /setupAppAuthScheduler/)
  assert.doesNotMatch(manifest, /['"]alarms['"]/)
  for (const source of [forYou, dislikeDialog, videoCardLogic]) {
    assert.match(source, /ensureFreshAppAccessToken/)
    assert.match(source, /refreshInvalidAppAccessToken/)
    assert.match(source, /getTvSign\(params\)/)
  }

  assert.doesNotMatch(shadowCurve, /document\.addEventListener\('keydown'/)
  assert.match(shadowCurve, /@keydown="handleKeyDown"/)
  assert.match(shadowCurve, /tabindex="0"/)
  assert.match(shadowCurve, /resolveCanvasCssColor/)
  assert.match(homeSettings, /normalizeImportedFilterRules/)
  assert.match(homeSettings, /filter_import_result/)
}

function collectLocaleKeys(source: string) {
  const keys = new Set<string>()
  const parents: Array<{ indent: number, key: string }> = []
  let blockIndent: number | undefined

  for (const line of source.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#'))
      continue
    const indent = line.length - line.trimStart().length
    if (blockIndent !== undefined) {
      if (indent > blockIndent)
        continue
      blockIndent = undefined
    }
    const trimmed = line.trim()
    if (trimmed.startsWith('-') || !trimmed.includes(':'))
      continue
    const separator = trimmed.indexOf(':')
    const key = trimmed.slice(0, separator).trim().replace(/^['"]|['"]$/g, '')
    if (!key || key.includes(' '))
      continue
    while (parents.at(-1)?.indent !== undefined && parents.at(-1)!.indent >= indent)
      parents.pop()
    const fullKey = [...parents.map(parent => parent.key), key].join('.')
    keys.add(fullKey)
    const value = trimmed.slice(separator + 1).trim()
    if (!value) {
      parents.push({ indent, key })
    }
    else if (/^[>|][-+]?$/.test(value)) {
      blockIndent = indent
    }
  }
  return keys
}

async function verifyP2AccessibilityAndLocales() {
  const root = process.cwd()
  const [searchBar, select, contextMenu, videoInfo, en, cn, tw, yue] = await Promise.all([
    readFile(`${root}/src/components/SearchBar/SearchBar.vue`, 'utf8'),
    readFile(`${root}/src/components/Select.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/components/VideoCardInfo.vue`, 'utf8'),
    readFile(`${root}/src/_locales/en.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-CN.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-TW.yml`, 'utf8'),
    readFile(`${root}/src/_locales/jyut.yml`, 'utf8'),
  ])

  assert.match(searchBar, /role="combobox"/)
  assert.match(searchBar, /aria-autocomplete="list"/)
  assert.match(searchBar, /:aria-activedescendant="activeDescendantId"/)
  assert.match(searchBar, /:key="item\.value"/)
  assert.match(searchBar, /role="option"/)
  assert.match(searchBar, /:aria-selected=/)
  assert.match(searchBar, /keyword\.value = value\n {2}suggestions\.length = 0/)
  assert.match(searchBar, /event\.isComposing \|\| event\.keyCode === 229/)
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'])
    assert.match(searchBar, new RegExp(`case '${key}'`))

  assert.match(select, /<button[\s\S]{0,240}aria-haspopup="listbox"/)
  assert.match(select, /role="listbox"/)
  assert.match(select, /role="option"/)
  assert.match(select, /:aria-selected="Object\.is\(option\.value, modelValue\)"/)
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'])
    assert.match(select, new RegExp(`case '${key}'`))
  assert.match(select, /nextTick\(\(\) => triggerRef\.value\?\.focus\(\)\)/)

  assert.match(videoInfo, /aria-haspopup="menu"/)
  assert.match(contextMenu, /role="menu"/)
  assert.match(contextMenu, /role="menuitem"/)
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'])
    assert.match(contextMenu, new RegExp(`case '${key}'`))

  const localeKeySets = [en, cn, tw, yue].map(collectLocaleKeys)
  for (const keys of localeKeySets.slice(1))
    assert.deepEqual([...keys].sort(), [...localeKeySets[0]].sort())
  for (const key of [
    'widescreen.enter',
    'widescreen.comments_loading',
    'settings.show_bewly_widescreen_button',
    'search_bar.input_label',
    'video_card.operation.scroll_to_bottom',
  ]) {
    localeKeySets.forEach(keys => assert.equal(keys.has(key), true, `missing locale key: ${key}`))
  }
}

async function verifyContributorCache() {
  const root = await mkdtemp(path.join(tmpdir(), 'bewly-contributors-'))
  const cachePath = path.join(root, '.cache', 'contributors.svg')
  const outputPath = path.join(root, 'extension', 'assets', 'contributors.svg')
  const warnings: string[] = []
  const networkBytes = new TextEncoder().encode('<svg id="network"/>')
  const responseBytes = (bytes: Uint8Array) => bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer

  try {
    const networkSource = await prepareContributorsImage({
      cachePath,
      outputPath,
      warn: message => warnings.push(message),
      fetchImage: async (url) => {
        assert.equal(url, CONTRIBUTORS_IMAGE_URL)
        return {
          ok: true,
          arrayBuffer: async () => responseBytes(networkBytes),
        }
      },
    })
    assert.equal(networkSource, 'network')
    assert.equal(await readFile(cachePath, 'utf8'), '<svg id="network"/>')
    assert.equal(await readFile(outputPath, 'utf8'), '<svg id="network"/>')

    await rm(outputPath)
    await writeFile(cachePath, '<svg id="cache"/>')
    const cacheSource = await prepareContributorsImage({
      cachePath,
      outputPath,
      warn: message => warnings.push(message),
      fetchImage: async () => ({
        ok: false,
        status: 503,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    })
    assert.equal(cacheSource, 'cache')
    assert.equal(await readFile(outputPath, 'utf8'), '<svg id="cache"/>')

    await rm(outputPath)
    const atomicFallbackSource = await prepareContributorsImage({
      cachePath,
      outputPath,
      warn: message => warnings.push(message),
      fetchImage: async () => ({
        ok: true,
        arrayBuffer: async () => responseBytes(networkBytes),
      }),
      replaceFile: async () => {
        throw new Error('atomic replace failed')
      },
    })
    assert.equal(atomicFallbackSource, 'cache')
    assert.equal(await readFile(cachePath, 'utf8'), '<svg id="cache"/>')
    assert.equal(await readFile(outputPath, 'utf8'), '<svg id="cache"/>')
    assert.deepEqual((await readdir(path.dirname(cachePath))).filter(name => name.endsWith('.tmp')), [])

    const missingCachePath = path.join(root, 'missing', 'contributors.svg')
    const missingOutputPath = path.join(root, 'missing-output', 'contributors.svg')
    await mkdir(path.dirname(missingOutputPath), { recursive: true })
    await writeFile(missingOutputPath, 'stale')
    const missingSource = await prepareContributorsImage({
      cachePath: missingCachePath,
      outputPath: missingOutputPath,
      warn: message => warnings.push(message),
      fetchImage: async () => {
        throw new Error('offline')
      },
    })
    assert.equal(missingSource, 'missing')
    await assert.rejects(stat(missingOutputPath))

    const emptyCachePath = path.join(root, 'empty', 'contributors.svg')
    const emptyOutputPath = path.join(root, 'empty-output', 'contributors.svg')
    const emptySource = await prepareContributorsImage({
      cachePath: emptyCachePath,
      outputPath: emptyOutputPath,
      warn: message => warnings.push(message),
      fetchImage: async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    })
    assert.equal(emptySource, 'missing')
    await assert.rejects(stat(emptyOutputPath))
    assert.equal(warnings.length, 4)
  }
  finally {
    await rm(root, { force: true, recursive: true })
  }
}

async function verifyP2WidescreenControl() {
  const root = process.cwd()
  const [storage, control, contentScript, videoPlayback, catalog, widescreen, tsconfig, about, prepare] = await Promise.all([
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/bewlyWidescreenControl.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/searchCatalog.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/tsconfig.json`, 'utf8'),
    readFile(`${root}/src/components/Settings/About/About.vue`, 'utf8'),
    readFile(`${root}/scripts/prepare.ts`, 'utf8'),
  ])

  assert.match(storage, /showBewlyWidescreenButton: boolean/)
  assert.match(storage, /showBewlyWidescreenButton: true/)
  assert.match(videoPlayback, /settings\.showBewlyWidescreenButton/)
  assert.match(catalog, /settings\.show_bewly_widescreen_button/)
  assert.match(control, /settings\.value\.showBewlyWidescreenButton/)
  assert.match(control, /stopPlayerObserver\?\.\(\)/)
  assert.match(control, /controlButtonAbortController\?\.abort\(\)/)
  assert.match(control, /addEventListener\('click',[\s\S]{0,180}signal: controlButtonAbortController\.signal/)
  assert.match(control, /document\.querySelectorAll<HTMLElement>\(`\.\$\{CONTROL_CLASS\}`\)/)
  assert.match(control, /stopPlayerObserver = observePlayerDom\(injectControl\)/)
  const releaseStart = control.indexOf('function releaseControlDiscovery')
  const releaseSection = control.slice(releaseStart, control.indexOf('export function stopBewlyWidescreenControl', releaseStart))
  assert.doesNotMatch(releaseSection, /exitBewlyWidescreen/)
  assert.match(contentScript, /stopBewlyWidescreenControl/)
  assert.match(contentScript, /if \(!isVideoOrBangumiPage\(\)\) \{[\s\S]{0,260}stopAutoExitFullscreenMonitoring\(\)[\s\S]{0,120}resetRandomPlayInitialization\(\)/)
  assert.match(widescreen, /stopLanguageWatch = watch/)
  assert.equal(JSON.parse(tsconfig).compilerOptions.noImplicitAny, true)
  assert.match(about, /contributorsRemoteImageUrl = 'https:\/\/contrib\.rocks\/image\?repo=STERILITZIA02\/Bewly_Nocturne'/)
  assert.match(about, /contributorsImageUrl = ref\(getExtensionAssetUrl\('\/assets\/contributors\.svg'\)\)/)
  assert.match(about, /if \(!contributorRemoteFallbackUsed\) \{[\s\S]{0,140}contributorsImageUrl\.value = contributorsRemoteImageUrl/)
  assert.equal((about.match(/contributorRemoteFallbackUsed = true/g) ?? []).length, 1)
  assert.match(prepare, /\.cache\/bewly-nocturne\/contributors\.svg/)
}

async function verifySecurityContracts() {
  const root = process.cwd()
  const [contentScript, injectScript, allSearchPage, searchBar, searchHistoryProvider, notificationsDrawer] = await Promise.all([
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/inject/index.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/SearchResults/pages/AllSearchPage.vue`, 'utf8'),
    readFile(`${root}/src/components/SearchBar/SearchBar.vue`, 'utf8'),
    readFile(`${root}/src/components/SearchBar/searchHistoryProvider.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/NotificationsDrawer.vue`, 'utf8'),
  ])

  const sendSettingsStart = contentScript.indexOf('function sendSettingsToPage')
  const sendSettingsSection = contentScript.slice(
    sendSettingsStart,
    contentScript.indexOf('void settingsReady.then', sendSettingsStart),
  )
  assert.match(sendSettingsSection, /createPageSettingsPayload\(value\)/)
  assert.match(sendSettingsSection, /window\.location\.origin/)
  assert.doesNotMatch(sendSettingsSection, /JSON\.parse|JSON\.stringify|['"]\*['"]/)
  assert.match(contentScript, /matchesPageBridgeEvent\(event/)
  assert.ok(
    contentScript.indexOf('MAIN world 在 document_start 阶段发起握手')
    < contentScript.indexOf(`if (document.readyState !== 'loading')`),
  )
  assert.match(injectScript, /let currentSettings: PageSettingsPayload \| null/)
  assert.match(injectScript, /createPageSettingsPayload\(event\.data\.data\)/)
  assert.match(injectScript, /origin: window\.location\.origin/)
  assert.match(injectScript, /SETTINGS_REQUEST,[\s\S]{0,80}window\.location\.origin/)
  assert.match(injectScript, /for \(const delay of \[100, 300, 700\]\)/)
  assert.doesNotMatch(injectScript, /data as Settings|enableCommentReplyTree\?:/)

  assert.match(allSearchPage, /v-html="sanitizeSearchHighlight\(item\.title\)"/)
  assert.doesNotMatch(allSearchPage, /v-html="item\.title"/)
  assert.match(searchBar, /v-html="sanitizeSearchHighlight\(item\.name\)"/)
  assert.doesNotMatch(searchBar, /DOMPurify\.sanitize\(item\.name\)/)
  assert.match(searchHistoryProvider, /const loadedPromise = new Promise<boolean>/)
  assert.match(searchHistoryProvider, /markIframeReadyForMessaging\(iframe\)[\s\S]{0,80}isIframeReadyForMessaging\(iframe\)/)
  assert.ok(searchHistoryProvider.indexOf('iframe.addEventListener(\'load\', handleLoad)') < searchHistoryProvider.indexOf('iframe.src = BilibiliStorageProvider.BILIBILI_COLS_IFRAME_URL'))
  assert.match(searchHistoryProvider, /if \(!loaded\) \{[\s\S]{0,80}iframe\.remove\(\)/)
  assert.match(searchHistoryProvider, /if \(!postMessageToIframe\(iframe/)
  assert.match(notificationsDrawer, /markIframeReadyForMessaging\(iframe\)/)
  assert.match(notificationsDrawer, /getIframeMessageData\(event, iframeRef\.value\)/)
}

async function verify() {
  verifyAccountScopes()
  verifyPlaybackRatePolicy()
  verifyWidescreenMutationPolicy()
  verifyRandomPlayRetryPolicy()
  verifyAppAuthTokenPolicy()
  await verifyAppAuthSingleFlight()
  verifyCanvasThemeResolution()
  verifyFilterRuleImport()
  verifySliderProgress()
  await verifyStorageScopeLifecycle()
  await verifyStorageSuppressionRecovery()
  verifyDockReorderPolicy()
  verifyPageSettingsPayload()
  verifyPageBridgeBoundary()
  verifyIframeBoundary()
  verifySearchHighlightSanitizer()
  verifyCommentRichText()
  await verifyComponentContracts()
  await verifyP1Contracts()
  await verifyP2AccessibilityAndLocales()
  await verifyContributorCache()
  await verifyP2WidescreenControl()
  await verifySecurityContracts()
  console.log('Targeted fix verification passed.')
}

void verify()
