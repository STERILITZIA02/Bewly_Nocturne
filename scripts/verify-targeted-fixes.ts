import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { effectScope, nextTick } from 'vue'

import type { MomentCommentItem } from '../src/components/MomentCard/commentUtils'
import { normalizeMomentComment, normalizeMomentCommentPage, normalizeMomentCommentRepliesPage } from '../src/components/MomentCard/commentUtils'
import {
  buildMomentForwardRequest,
  createMomentForwardSubmissionController,
  createMomentTopicSearchController,
  getCachedMomentDisclosure,
  insertMomentForwardEmoji,
  normalizeForwardCount,
  normalizeMomentForwardEmotePackages,
  normalizeMomentTopics,
  parseMomentForwardTokens,
  resolveForwardCountAfterSuccess,
  serializeMomentForwardContents,
  setCachedMomentDisclosure,
  toggleMomentDisclosure,
} from '../src/components/MomentCard/momentForwardContent'
import type { DisplayMoment } from '../src/components/MomentCard/types'
import type { StorageLocalRuntime } from '../src/composables/useStorageLocal'
import { resolveDockCollapsedShellSize } from '../src/constants/dock'
import { getPageBridgeTargetOrigin, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '../src/constants/pageBridge'
import { AppPage } from '../src/enums/appEnums'
import { loadCommentReplyPagesSequentially, mergeCommentReplyLists } from '../src/inject/commentReplyPagination'
import { isAccountRequestCurrent } from '../src/utils/accountScope'
import { createBooleanSingleFlight, resolveAppAccessTokenFreshness, resolveAppAuthorizationState } from '../src/utils/appAuthTokenPolicy'
import { canCommitWidescreenLayout, clampWidescreenSidebarWidth, isWidescreenBottomControlHoverRegion, isWidescreenPlayerControlHoverRegion, resolveWidescreenAnchoredPlayerGeometry, resolveWidescreenCenterGeometry, resolveWidescreenControlSurfaceState, resolveWidescreenEngagedState, resolveWidescreenSidebarHoverExpanded, resolveWidescreenSidebarResizeWidth, shortenCommentDateText, shouldContinueWidescreenSidebarHydration, shouldScheduleWidescreenRefresh, shouldSuppressWidescreenAutoEntry, WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY, WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY } from '../src/utils/bewlyWidescreenPolicy'
import { isBilibiliRiskControl } from '../src/utils/bilibiliApiError'
import { resolveCanvasCssColor } from '../src/utils/canvasTheme'
import { buildMomentCommentPermalink } from '../src/utils/commentPermalink'
import { buildCommentTree } from '../src/utils/commentTree'
import { resolveDialogKeyboardAction } from '../src/utils/dialogKeyboard'
import { resolveActiveDockItemPage } from '../src/utils/dockActiveItem'
import { isEligibleDrawerEscape, resolveDrawerEscapeBehavior, resolveIframeEscapeAction, shouldHandleDrawerEscape } from '../src/utils/drawerEscape'
import type { EffectiveTopBarSource } from '../src/utils/effectiveTopBarSource'
import { resolveEffectiveTopBarSource } from '../src/utils/effectiveTopBarSource'
import { compileFilterRules, normalizeImportedFilterRules } from '../src/utils/filterRules'
import { computeFloatingMenuPosition } from '../src/utils/floatingMenu'
import { shouldContinueIframeFocusRetry } from '../src/utils/iframeFocusRetryPolicy'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '../src/utils/iframeMessage'
import { resolveInterfaceLanguage } from '../src/utils/interfaceLanguagePolicy'
import { isSentinelWithinLoadThreshold } from '../src/utils/loadMoreSentinel'
import { calculateContainedImageSize, isTopicPage, queryDomUntilFound } from '../src/utils/main'
import { classifyMomentAdditional, resolveMomentVoteStatus } from '../src/utils/momentAdditionalPolicy'
import { shouldUseWideMomentCardLayout, supportsWideMomentCardLayout } from '../src/utils/momentCardLayout'
import { createMomentCommentThreadController } from '../src/utils/momentCommentThread'
import { countVisibleNewMomentItems } from '../src/utils/momentFeedOrder'
import { resolveStableMomentKey } from '../src/utils/momentKey'
import { resolveHorizontalScrollState, resolveMomentCardWidth, resolveMomentGridColumnCount, resolveVirtualSpacerSize, shouldShowMomentsSidebar } from '../src/utils/momentsLayout'
import { normalizeMomentRemoteUrl } from '../src/utils/momentUrl'
import { buildNativeSearchUrl } from '../src/utils/pageMode'
import { createPageSettingsPayload } from '../src/utils/pageSettingsProtocol'
import { applyConfiguredPlaybackRate, resolvePlaybackRateChange } from '../src/utils/playbackRate'
import { RANDOM_PLAY_VIDEO_RETRY_MAX, shouldRetryRandomPlayVideo } from '../src/utils/randomPlayRetry'
import { getRangeProgress } from '../src/utils/range'
import { sanitizeSearchHighlight } from '../src/utils/searchHighlight'
import { isActualHomepage, resolveSearchOpenAction } from '../src/utils/searchNavigationCore'
import { getPluginSearchResultsUrl } from '../src/utils/searchUrl'
import { createSelectOptionKey } from '../src/utils/selectOptionKey'
import { canStartSettingsDependentBoot, shouldShowBewlyBootOverlay } from '../src/utils/settingsBootPolicy'
import {
  classifySettingsCloudSyncSnapshot,
  createSettingsCloudSyncKey,
  resolveSettingsCloudSyncEnableDecision,
  SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
} from '../src/utils/settingsCloudSyncProtocol'
import { normalizeVideoCardCoverRatio } from '../src/utils/videoCardLayout'
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

async function verifyCommentReplyPaginationPolicy() {
  const merged = mergeCommentReplyLists([
    [{ rpid: '1', value: 'first' }, { rpid: '2', value: 'second' }],
    [{ rpid: '2', value: 'duplicate' }, { rpid: '3', value: 'third' }],
  ], reply => reply.rpid)
  assert.deepEqual(merged.map(reply => reply.value), ['first', 'second', 'third'])

  let currentPage = 1
  let inFlight = 0
  let maximumInFlight = 0
  const loadedPages: number[] = []
  const completed = await loadCommentReplyPagesSequentially({
    getCurrentPage: () => currentPage,
    getTotalPage: () => 4,
    isValid: () => true,
    loadNextPage: async (page) => {
      loadedPages.push(page)
      inFlight += 1
      maximumInFlight = Math.max(maximumInFlight, inFlight)
      await Promise.resolve()
      currentPage = page + 1
      inFlight -= 1
    },
  })
  assert.deepEqual(loadedPages, [1, 2, 3])
  assert.equal(maximumInFlight, 1)
  assert.deepEqual(completed, { completed: true, lastPage: 4, reason: 'completed' })

  currentPage = 1
  const stalled = await loadCommentReplyPagesSequentially({
    getCurrentPage: () => currentPage,
    getTotalPage: () => 3,
    isValid: () => true,
    loadNextPage: async () => {},
  })
  assert.deepEqual(stalled, { completed: false, lastPage: 1, reason: 'no-progress' })
}

function verifyFloatingMenuPolicy() {
  const downward = computeFloatingMenuPosition(
    { top: 100, right: 300, bottom: 132 },
    1000,
    800,
  )
  assert.equal(downward.direction, 'down')
  assert.equal(downward.top, '140px')
  assert.equal(downward.bottom, undefined)

  const upward = computeFloatingMenuPosition(
    { top: 700, right: 980, bottom: 732 },
    1000,
    800,
  )
  assert.equal(upward.direction, 'up')
  assert.equal(upward.top, undefined)
  assert.equal(upward.bottom, '108px')
  const shortMenuBottom = 800 - Number.parseFloat(upward.bottom!)
  assert.equal(700 - shortMenuBottom, 8)
}

function verifyWidescreenEngagementPolicy() {
  assert.equal(resolveDockCollapsedShellSize(552, 61), 61)
  assert.equal(resolveDockCollapsedShellSize(60, 61), 60)
  assert.equal(resolveDockCollapsedShellSize(Number.NaN, 51), 51)
  const base = {
    active: false,
    entering: false,
    hasLoadingOverlay: false,
    hasReadyRetry: false,
    waitingForLoad: false,
  }
  assert.equal(resolveWidescreenEngagedState(base), false)
  for (const key of Object.keys(base) as Array<keyof typeof base>)
    assert.equal(resolveWidescreenEngagedState({ ...base, [key]: true }), true)
  assert.equal(shouldSuppressWidescreenAutoEntry('video:1', 'video:1'), true)
  assert.equal(shouldSuppressWidescreenAutoEntry('video:2', 'video:1'), false)
  assert.equal(shouldSuppressWidescreenAutoEntry('video:1', undefined), false)
  assert.equal(canCommitWidescreenLayout({ pageReady: false, playerReady: false, contentReady: false }), false)
  assert.equal(canCommitWidescreenLayout({ pageReady: true, playerReady: false, contentReady: false }), false)
  assert.equal(canCommitWidescreenLayout({ pageReady: false, playerReady: true, contentReady: false }), false)
  assert.equal(canCommitWidescreenLayout({ pageReady: true, playerReady: true, contentReady: false }), false)
  assert.equal(canCommitWidescreenLayout({ pageReady: true, playerReady: true, contentReady: true }), true)
  assert.deepEqual(resolveWidescreenControlSurfaceState({
    bottomControlsHovered: false,
    danmakuControlsReady: false,
    nativeControlsHidden: false,
    nativeControlsReady: true,
    pointerInsidePlayer: true,
    previousHidden: false,
    sidebarExpanded: false,
  }), { hidden: true, ready: false })
  assert.deepEqual(resolveWidescreenControlSurfaceState({
    bottomControlsHovered: false,
    danmakuControlsReady: true,
    nativeControlsHidden: false,
    nativeControlsReady: true,
    pointerInsidePlayer: true,
    previousHidden: true,
    sidebarExpanded: false,
  }), { hidden: false, ready: true })
  assert.deepEqual(resolveWidescreenControlSurfaceState({
    bottomControlsHovered: false,
    danmakuControlsReady: true,
    nativeControlsHidden: true,
    nativeControlsReady: true,
    pointerInsidePlayer: true,
    previousHidden: false,
    sidebarExpanded: false,
  }), { hidden: true, ready: true })
  assert.deepEqual(resolveWidescreenControlSurfaceState({
    bottomControlsHovered: false,
    danmakuControlsReady: true,
    nativeControlsHidden: true,
    nativeControlsReady: true,
    pointerInsidePlayer: false,
    previousHidden: false,
    sidebarExpanded: false,
  }), { hidden: false, ready: true })
  assert.deepEqual(resolveWidescreenControlSurfaceState({
    bottomControlsHovered: false,
    danmakuControlsReady: true,
    nativeControlsHidden: false,
    nativeControlsReady: true,
    pointerInsidePlayer: true,
    previousHidden: false,
    sidebarExpanded: true,
  }), { hidden: true, ready: true })
  assert.deepEqual(resolveWidescreenControlSurfaceState({
    bottomControlsHovered: true,
    danmakuControlsReady: true,
    nativeControlsHidden: true,
    nativeControlsReady: true,
    pointerInsidePlayer: true,
    previousHidden: true,
    sidebarExpanded: false,
  }), { hidden: false, ready: true })
  assert.equal(shouldContinueWidescreenSidebarHydration({ complete: false, now: 100, deadline: 200 }), true)
  assert.equal(shouldContinueWidescreenSidebarHydration({ complete: true, now: 100, deadline: 200 }), false)
  assert.equal(shouldContinueWidescreenSidebarHydration({ complete: false, now: 200, deadline: 200 }), false)
  assert.equal(resolveInterfaceLanguage('zh-CN', []), 'cmn-CN')
  assert.equal(resolveInterfaceLanguage('zh-TW', ['zh-HK', 'zh-TW']), 'jyut')
  assert.equal(resolveInterfaceLanguage('zh-TW', ['zh-TW']), 'cmn-TW')
  assert.equal(resolveInterfaceLanguage('en-NZ', ['en-NZ']), 'en')
}

function verifyBilibiliApiErrorClassification() {
  assert.equal(isBilibiliRiskControl({ code: -412 }), true)
  assert.equal(isBilibiliRiskControl({ isRiskControl: true }), true)
  assert.equal(isBilibiliRiskControl(new Error('Uncaught Error: 检测到风控页面，API返回了HTML而不是JSON')), true)
  assert.equal(isBilibiliRiskControl(new Error('ordinary network failure')), false)
}

function verifyWidescreenSidebarRevealPolicy() {
  assert.equal(isWidescreenPlayerControlHoverRegion({ playerBottom: 1000, playerTop: 0, pointerY: 950 }), true)
  assert.equal(isWidescreenPlayerControlHoverRegion({ playerBottom: 1000, playerTop: 0, pointerY: 900 }), false)
  assert.equal(isWidescreenPlayerControlHoverRegion({ playerBottom: 1000, playerTop: 0, pointerY: 1001 }), false)
  assert.equal(WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY, 320)
  assert.equal(WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY, 240)
  const bottomSurface = {
    pointerX: 900,
    surfaceHeight: 53,
    viewportBottom: 1027,
    viewportLeft: 0,
    viewportRight: 1744,
  }
  assert.equal(isWidescreenBottomControlHoverRegion({ ...bottomSurface, currentlyHovered: false, pointerY: 969 }), false)
  assert.equal(isWidescreenBottomControlHoverRegion({ ...bottomSurface, currentlyHovered: false, pointerY: 970 }), true)
  assert.equal(isWidescreenBottomControlHoverRegion({ ...bottomSurface, currentlyHovered: true, pointerY: 958 }), true)
  assert.equal(isWidescreenBottomControlHoverRegion({ ...bottomSurface, currentlyHovered: true, pointerY: 957 }), false)
  assert.equal(isWidescreenBottomControlHoverRegion({ ...bottomSurface, currentlyHovered: true, pointerX: 1745, pointerY: 1000 }), false)
  const rightSidebar = {
    position: 'right' as const,
    viewportStart: 0,
    viewportEnd: 1920,
    sidebarWidth: 460,
  }
  assert.equal(resolveWidescreenSidebarHoverExpanded({
    ...rightSidebar,
    currentlyExpanded: false,
    pointerX: 1850,
  }), true)
  assert.equal(resolveWidescreenSidebarHoverExpanded({
    ...rightSidebar,
    currentlyExpanded: false,
    pointerX: 1847,
  }), false)
  assert.equal(resolveWidescreenSidebarHoverExpanded({
    ...rightSidebar,
    currentlyExpanded: true,
    pointerX: 1430,
  }), true)
  assert.equal(resolveWidescreenSidebarHoverExpanded({
    ...rightSidebar,
    currentlyExpanded: true,
    pointerX: 1411,
  }), false)

  const leftSidebar = { ...rightSidebar, position: 'left' as const }
  assert.equal(resolveWidescreenSidebarHoverExpanded({
    ...leftSidebar,
    currentlyExpanded: false,
    pointerX: 70,
  }), true)
  assert.equal(resolveWidescreenSidebarHoverExpanded({
    ...leftSidebar,
    currentlyExpanded: true,
    pointerX: 490,
  }), true)
  assert.equal(resolveWidescreenSidebarHoverExpanded({
    ...leftSidebar,
    currentlyExpanded: true,
    pointerX: 509,
  }), false)

  assert.equal(resolveWidescreenSidebarResizeWidth({
    position: 'right',
    pointerX: 1400,
    viewportStart: 0,
    viewportEnd: 1920,
  }), 520)
  assert.equal(resolveWidescreenSidebarResizeWidth({
    position: 'right',
    pointerX: 1000,
    viewportStart: 0,
    viewportEnd: 1920,
  }), 920)
  assert.equal(resolveWidescreenSidebarResizeWidth({
    position: 'right',
    pointerX: 0,
    viewportStart: 0,
    viewportEnd: 1920,
  }), 1280)
  assert.equal(resolveWidescreenSidebarResizeWidth({
    position: 'right',
    pointerX: 1800,
    viewportStart: 0,
    viewportEnd: 1920,
  }), 360)
  assert.equal(resolveWidescreenSidebarResizeWidth({
    position: 'left',
    pointerX: 520,
    viewportStart: 0,
    viewportEnd: 1920,
  }), 520)
  assert.equal(clampWidescreenSidebarWidth(800, 1000), 2000 / 3)
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

function verifyAppAuthorizationStateMachine() {
  const valid = { state: 'valid' as const, invalidToken: '' }
  const invalid = resolveAppAuthorizationState(valid, { type: 'invalid', token: 'expired-token' })
  assert.equal(invalid.state, 'invalid')
  assert.deepEqual(
    resolveAppAuthorizationState(invalid, { type: 'invalid', token: 'expired-token' }),
    invalid,
    'concurrent failures for one token must resolve to one invalid state',
  )

  const authorizing = resolveAppAuthorizationState(invalid, { type: 'authorize', token: 'expired-token' })
  assert.equal(authorizing.state, 'authorizing')
  assert.equal(
    resolveAppAuthorizationState(authorizing, { type: 'invalid', token: 'expired-token' }),
    authorizing,
  )

  const dismissed = resolveAppAuthorizationState(authorizing, { type: 'dismiss' })
  assert.equal(dismissed.state, 'dismissed')
  assert.equal(
    resolveAppAuthorizationState(dismissed, { type: 'invalid', token: 'expired-token' }),
    dismissed,
    'cancelled authorization must not auto-open again for the same token',
  )
  assert.equal(
    resolveAppAuthorizationState(dismissed, { type: 'authorize', token: 'expired-token' }).state,
    'authorizing',
    'an explicit reauthorize action may reopen a dismissed flow',
  )
  assert.equal(
    resolveAppAuthorizationState(authorizing, { type: 'authorized', token: 'new-token' }).state,
    'valid',
  )
}

function verifySettingsCloudSyncConflictPolicy() {
  const key = createSettingsCloudSyncKey('themeColor')
  const compatible = {
    [key]: {
      deleted: false,
      schemaVersion: SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
      value: '#fff',
      version: { counter: 1, deviceId: 'device-a' },
    },
  }
  assert.deepEqual(classifySettingsCloudSyncSnapshot({}), { state: 'empty' })
  assert.deepEqual(classifySettingsCloudSyncSnapshot(compatible), { state: 'compatible' })
  assert.deepEqual(classifySettingsCloudSyncSnapshot({
    [key]: {
      schemaVersion: SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
      value: '#123456',
      deleted: false,
      version: { counter: 'corrupt', deviceId: 'device-a' },
    },
  }), { state: 'incompatible' })
  assert.deepEqual(classifySettingsCloudSyncSnapshot({
    [key]: {
      ...compatible[key],
      schemaVersion: SETTINGS_CLOUD_SYNC_SCHEMA_VERSION + 1,
      unknownFutureField: true,
    },
  }), { state: 'incompatible' })
  assert.deepEqual(resolveSettingsCloudSyncEnableDecision('empty'), { action: 'enable', mode: 'auto' })
  assert.deepEqual(resolveSettingsCloudSyncEnableDecision('compatible'), { action: 'choose' })
  assert.deepEqual(resolveSettingsCloudSyncEnableDecision('compatible', 'pull'), { action: 'enable', mode: 'pull' })
  assert.deepEqual(resolveSettingsCloudSyncEnableDecision('compatible', 'push'), { action: 'enable', mode: 'push' })
  assert.deepEqual(resolveSettingsCloudSyncEnableDecision('compatible', 'cancel'), { action: 'cancel' })
  assert.deepEqual(resolveSettingsCloudSyncEnableDecision('incompatible'), { action: 'blocked' })
}

function verifyMomentAdditionalAndFocusPolicies() {
  assert.equal(classifyMomentAdditional('ADDITIONAL_TYPE_VOTE'), 'vote')
  assert.equal(classifyMomentAdditional('ADDITIONAL_TYPE_RESERVE'), 'reservation')
  assert.equal(classifyMomentAdditional('ADDITIONAL_TYPE_UNKNOWN'), 'other')
  assert.equal(resolveMomentVoteStatus(200, 100), 'ongoing')
  assert.equal(resolveMomentVoteStatus(100, 200), 'ended')
  assert.equal(resolveMomentVoteStatus(0, 200), 'unknown')

  const focusState = {
    attemptCount: 0,
    maxAttempts: 4,
    elapsedMs: 0,
    deadlineMs: 720,
    cancelled: false,
    iframeReplaced: false,
    viewerOpen: false,
    userMovedFocus: false,
  }
  assert.equal(shouldContinueIframeFocusRetry(focusState), true)
  assert.equal(shouldContinueIframeFocusRetry({ ...focusState, cancelled: true }), false)
  assert.equal(shouldContinueIframeFocusRetry({ ...focusState, iframeReplaced: true }), false)
  assert.equal(shouldContinueIframeFocusRetry({ ...focusState, viewerOpen: true }), false)
  assert.equal(shouldContinueIframeFocusRetry({ ...focusState, userMovedFocus: true }), false)
  assert.equal(shouldContinueIframeFocusRetry({ ...focusState, attemptCount: 4 }), false)
  assert.equal(shouldContinueIframeFocusRetry({ ...focusState, elapsedMs: 721 }), false)
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

function verifyDialogKeyboardPolicy() {
  const base = {
    closing: false,
    defaultPrevented: false,
    eventType: 'keydown' as const,
    key: 'Enter',
    loading: false,
    preventCloseWhenLoading: true,
    visible: true,
  }
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, visible: false }), { action: 'ignore', preventDefault: false })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, closing: true }), { action: 'ignore', preventDefault: false })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, loading: true }), { action: 'ignore', preventDefault: false })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, editingContext: true }), { action: 'ignore', preventDefault: false })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, isComposing: true }), { action: 'ignore', preventDefault: false })
  assert.deepEqual(resolveDialogKeyboardAction(base), { action: 'confirm', preventDefault: true })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, key: 'Escape' }), { action: 'close', preventDefault: true })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, key: 'Escape', loading: true }), { action: 'block', preventDefault: true })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, key: 'Escape', defaultPrevented: true }), { action: 'ignore', preventDefault: false })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, key: 'Alt' }), { action: 'show-shortcut', preventDefault: false })
  assert.deepEqual(resolveDialogKeyboardAction({ ...base, key: 'Alt', eventType: 'keyup' }), { action: 'hide-shortcut', preventDefault: false })
}

function verifySettingsBootPolicy() {
  assert.equal(canStartSettingsDependentBoot('loading', false), false)
  assert.equal(canStartSettingsDependentBoot('degraded', false), false)
  assert.equal(canStartSettingsDependentBoot('loaded', true), false)
  assert.equal(canStartSettingsDependentBoot('loaded', false), true)

  assert.equal(shouldShowBewlyBootOverlay('https://www.bilibili.com/?page=SearchResults&keyword=test', false), true)
  assert.equal(shouldShowBewlyBootOverlay('https://www.bilibili.com/index.html?page=Home', false), true)
  assert.equal(shouldShowBewlyBootOverlay('https://www.bilibili.com/', false), false)
  assert.equal(shouldShowBewlyBootOverlay('https://www.bilibili.com/?page=Unknown', false), false)
  assert.equal(shouldShowBewlyBootOverlay('https://search.bilibili.com/all?keyword=test', false), false)
  assert.equal(shouldShowBewlyBootOverlay('https://www.bilibili.com/?page=Home', true), false)
}

function verifySelectOptionKeys() {
  const values = [1, '1', true, 'true', null, 'null', undefined, 'undefined', 0, -0, Number.NaN]
  const keys = values.map((value, index) => createSelectOptionKey(value, index))
  assert.equal(new Set(keys).size, keys.length)
  assert.notEqual(createSelectOptionKey(1, 0), createSelectOptionKey('1', 0))
  assert.notEqual(createSelectOptionKey(true, 0), createSelectOptionKey('true', 0))
}

async function verifyImmediateDomQuery() {
  const existingElement = {} as HTMLElement
  let queryCount = 0
  assert.equal(await queryDomUntilFound('.existing', 500, undefined, 10_000, () => {
    queryCount++
    return existingElement
  }), existingElement)
  assert.equal(queryCount, 1)

  const abort = new AbortController()
  const pending = queryDomUntilFound('.missing', 500, abort, 10_000, () => null)
  abort.abort()
  assert.equal(await pending, null)
}

function verifyContainedImageSize() {
  assert.deepEqual(calculateContainedImageSize(2000, 1500, 1000, 500), { width: 667, height: 500 })
  assert.deepEqual(calculateContainedImageSize(900, 1000, 800, 1200), { width: 800, height: 889 })
  assert.deepEqual(calculateContainedImageSize(400, 300, 1000, 500), { width: 400, height: 300 })
  assert.throws(() => calculateContainedImageSize(0, 100, 100, 100), RangeError)
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
  assert.equal(storedRef!.initializationState.value, 'loading')
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

async function verifyStorageDegradedRecoveryState() {
  const { useStorageLocal } = await import('../src/composables/useStorageLocal')
  let readShouldFail = true
  let recoveryTask: (() => void | Promise<void>) | undefined
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const runtime: StorageLocalRuntime = {
    clearTimeout: timer => clearTimeout(timer),
    get: async () => {
      if (readShouldFail)
        throw new Error('temporary storage failure')
      return { degraded: 'stored' }
    },
    remove: async () => {},
    set: async () => {},
    setTimeout: (callback) => {
      recoveryTask = callback
      const timer = setTimeout(() => {}, 60_000)
      timer.unref()
      return timer
    },
    sleep: async () => {},
    subscribe: () => () => {},
  }
  const scope = effectScope()
  let storedRef: ReturnType<typeof useStorageLocal<string>> | undefined
  scope.run(() => {
    storedRef = useStorageLocal('degraded', 'initial', {
      onError: () => {},
      onReady: resolveReady,
      runtime,
      writeDefaults: false,
    })
  })

  assert.equal(storedRef!.initializationState.value, 'loading')
  await ready
  assert.equal(storedRef!.initializationState.value, 'degraded')
  readShouldFail = false
  await recoveryTask?.()
  await nextTick()
  assert.equal(storedRef!.initializationState.value, 'loaded')
  assert.equal(storedRef!.value, 'stored')
  scope.stop()
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
  assert.equal(storedRef!.initializationState.value, 'loaded')
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
  assert.equal(getPageBridgeTargetOrigin('https://www.bilibili.com'), 'https://www.bilibili.com')
  assert.equal(getPageBridgeTargetOrigin('http://localhost:5173'), 'http://localhost:5173')
  assert.equal(getPageBridgeTargetOrigin('null'), undefined)
  assert.equal(getPageBridgeTargetOrigin('about:blank'), undefined)
  assert.equal(getPageBridgeTargetOrigin('https://www.bilibili.com/path'), undefined)
  assert.equal(getPageBridgeTargetOrigin('not a URL'), undefined)

  const source = {} as Window
  const channelId = 'channel-id'
  const data = {
    protocol: PAGE_BRIDGE_PROTOCOL,
    channelId,
    type: PAGE_BRIDGE_MESSAGE.SETTINGS_UPDATE,
    data: {},
  } as const
  const expected = {
    source,
    origin: 'https://www.bilibili.com',
    channelId,
    type: PAGE_BRIDGE_MESSAGE.SETTINGS_UPDATE,
  } as const
  const validEvent = { data, origin: expected.origin, source }
  const postedMessages: Array<{ message: unknown, origin: string }> = []
  const target = {
    postMessage(message: unknown, origin: string) {
      postedMessages.push({ message, origin })
    },
  }

  assert.equal(postPageBridgeMessage(target, data, expected.origin), true)
  assert.deepEqual(postedMessages, [{ message: data, origin: expected.origin }])
  assert.equal(postPageBridgeMessage(target, data, 'null'), false)
  assert.equal(postedMessages.length, 1)
  assert.equal(postPageBridgeMessage({
    postMessage() {
      throw new SyntaxError('Invalid target origin')
    },
  }, data, expected.origin), false)

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
      hots: [{
        rpid_str: '90071992547409930',
        ctime: 99,
        member: { mid: 10, uname: 'Duplicate', avatar: '' },
        content: { message: 'duplicate hot copy' },
      }],
      replies: [{
        rpid_str: '90071992547409930',
        root: 0,
        parent: 0,
        action: 1,
        like: 7,
        ctime: 100,
        member: { mid: 10, uname: 'Author', avatar: 'author.webp', vip: {} },
        content: {
          message: 'plain [doge] @Alice [unknown]',
          emote: { '[doge]': { url: 'https://i.example/doge.webp' } },
          members: [{ mid: 20, uname: 'Alice' }],
          pictures: [{
            img_src: '//i.example/comment.webp',
            img_width: 1280,
            img_height: 720,
            img_size: 88,
          }],
        },
        replies: [{
          rpid_str: '90071992547409931',
          root_str: '90071992547409930',
          parent_str: '90071992547409930',
          action: 0,
          like: 2,
          ctime: 101,
          member: { mid: 11, uname: 'Reply', avatar: 'reply.webp', vip: {} },
          content: {
            message: 'nested [tv]',
            emote: { '[tv]': { url: 'https://i.example/tv.webp' } },
            pictures: [{ img_src: 'http://i.example/nested.webp', img_width: 320, img_height: 640 }],
          },
        }],
      }],
    },
  }

  const page = normalizeMomentCommentPage(response, 1, 8)
  assert.equal(page.items.length, 1)
  const comment = page.items[0]
  assert.ok(comment)
  assert.equal(comment.rpid, '90071992547409930')
  assert.equal(comment.rootRpid, '90071992547409930')
  assert.equal(comment.parentRpid, '')
  assert.equal(comment.isLiked, true)
  assert.equal(comment.likeCount, 7)
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('plain')))
  assert.ok(comment.segments.some(segment => segment.type === 'emote' && segment.text === '[doge]'))
  assert.ok(comment.segments.some(segment => segment.type === 'mention' && segment.mid === '20'))
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('[unknown]')))
  assert.deepEqual(comment.pictures, [{
    url: 'https://i.example/comment.webp',
    width: 1280,
    height: 720,
    sizeKb: 88,
  }])
  assert.equal(comment.replies[0]?.rootRpid, '90071992547409930')
  assert.equal(comment.replies[0]?.parentRpid, '90071992547409930')
  assert.equal(comment.replies[0]?.isLiked, false)
  assert.equal(comment.replies[0]?.likeCount, 2)
  assert.ok(comment.replies[0]?.segments.some(segment => segment.type === 'emote' && segment.text === '[tv]'))
  assert.equal(comment.replies[0]?.pictures[0]?.url, 'https://i.example/nested.webp')

  const pictureOnly = normalizeMomentComment({
    rpid_str: 'picture-only',
    ctime: 102,
    member: { mid: 12, uname: 'Picture', avatar: '' },
    content: {
      message: '',
      pictures: [{ img_src: 'https://i.example/pure.webp', img_width: 0, img_height: Number.NaN }],
    },
  })
  assert.ok(pictureOnly)
  assert.equal(pictureOnly.message, '')
  assert.equal(pictureOnly.segments.length, 0)
  assert.deepEqual(pictureOnly.pictures, [{ url: 'https://i.example/pure.webp', width: 0, height: 0 }])

  const invalidPictureOnly = normalizeMomentComment({
    rpid_str: 'invalid-picture',
    member: { mid: 13, uname: 'Invalid', avatar: '' },
    content: { message: '', pictures: [{ img_src: 'javascript:alert(1)' }] },
  })
  assert.equal(invalidPictureOnly, null)
}

function createMomentCommentFixture(
  id: string,
  rootRpid = id,
  parentRpid = '',
  createdAt = 1,
): MomentCommentItem {
  return {
    id,
    rpid: id,
    rootRpid,
    parentRpid,
    author: { id: `author-${id}`, name: id, avatar: '' },
    message: id,
    segments: [{ type: 'text', text: id }],
    pictures: [],
    createdAt,
    likeCount: 0,
    isLiked: false,
    replyCount: 0,
    replies: [],
  }
}

async function verifyMomentCommentTreeAndThread() {
  const layout = buildCommentTree([
    { id: 'root', rootId: 'root', parentId: '', createdAt: 1, originalOrder: 0 },
    { id: 'child', rootId: 'root', parentId: 'root', createdAt: 2, originalOrder: 1 },
    { id: 'grandchild', rootId: 'root', parentId: 'child', createdAt: 3, originalOrder: 2 },
    { id: 'orphan', rootId: 'root', parentId: 'missing', createdAt: 4, originalOrder: 3 },
    { id: 'child', rootId: 'root', parentId: 'root', createdAt: 99, originalOrder: 4 },
  ])
  assert.deepEqual(layout.map(node => node.id), ['root', 'child', 'grandchild', 'orphan'])
  assert.deepEqual(layout.map(node => node.depth), [0, 1, 2, 1])
  assert.equal(layout.find(node => node.id === 'orphan')?.parentId, 'root')
  assert.equal(layout.find(node => node.id === 'orphan')?.directParentVisible, false)
  assert.deepEqual(layout.find(node => node.id === 'grandchild')?.ancestorContinuationDepths, [1])
  assert.deepEqual(layout.map(node => node.visualOrder), [0, 1, 2, 3])

  const cycleLayout = buildCommentTree([
    { id: 'a', rootId: 'b', parentId: 'b', createdAt: 1, originalOrder: 0 },
    { id: 'b', rootId: 'a', parentId: 'a', createdAt: 2, originalOrder: 1 },
  ])
  assert.equal(cycleLayout.length, 2)
  assert.equal(cycleLayout[0]?.depth, 0)
  assert.equal(cycleLayout[1]?.depth, 1)

  const preview = createMomentCommentFixture('preview', 'root', 'root', 2)
  const loaded = createMomentCommentFixture('loaded', 'root', 'preview', 3)
  let resolvePage!: (page: { items: MomentCommentItem[], hasMore: boolean, nextPage: number }) => void
  let activeRequests = 0
  let maxActiveRequests = 0
  let requestCount = 0
  const controller = createMomentCommentThreadController({
    getIdentity: () => 'account-a:1:100',
    fetchPage: () => {
      requestCount += 1
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
      return new Promise((resolve) => {
        resolvePage = (page) => {
          activeRequests -= 1
          resolve(page)
        }
      })
    },
  })
  controller.seed('root', [preview], 3)
  const firstLoad = controller.loadMore('root')
  const repeatedLoad = controller.loadMore('root')
  assert.equal(firstLoad, repeatedLoad)
  resolvePage({ items: [preview, loaded], hasMore: true, nextPage: 2 })
  await firstLoad
  assert.equal(requestCount, 1)
  assert.equal(maxActiveRequests, 1)
  assert.deepEqual(controller.getState('root')?.items.map(item => item.id), ['preview', 'loaded'])
  assert.equal(controller.getState('root')?.nextPage, 2)
  const stagnantLoad = controller.loadMore('root')
  resolvePage({ items: [preview], hasMore: true, nextPage: 2 })
  await stagnantLoad
  assert.equal(controller.getState('root')?.hasMore, false)
  assert.equal(controller.getState('root')?.nextPage, 2)
  controller.dispose()
  controller.seed('root', [loaded], 1)
  assert.equal(controller.states.size, 0)

  const failedController = createMomentCommentThreadController({
    getIdentity: () => 'account-a:1:101',
    fetchPage: async () => {
      throw new Error('failed page')
    },
  })
  failedController.seed('root', [], 2)
  await assert.rejects(failedController.loadMore('root'), /failed page/)
  assert.equal(failedController.getState('root')?.nextPage, 1)
  assert.equal(failedController.getState('root')?.items.length, 0)

  let identity = 'account-a:1:102'
  let resolveStalePage!: (page: { items: MomentCommentItem[], hasMore: boolean, nextPage: number }) => void
  const staleController = createMomentCommentThreadController({
    getIdentity: () => identity,
    fetchPage: () => new Promise((resolve) => {
      resolveStalePage = resolve
    }),
  })
  staleController.seed('root', [], 1)
  const staleLoad = staleController.loadMore('root')
  identity = 'account-b:1:102'
  assert.equal(staleController.getState('root'), undefined)
  resolveStalePage({ items: [loaded], hasMore: false, nextPage: 2 })
  await staleLoad
  assert.equal(staleController.getState('root'), undefined)

  let failingIdentity = 'account-a:1:103'
  let rejectStalePage!: (error: Error) => void
  const staleFailureController = createMomentCommentThreadController({
    getIdentity: () => failingIdentity,
    fetchPage: () => new Promise((_resolve, reject) => {
      rejectStalePage = reject
    }),
  })
  staleFailureController.seed('root', [], 1)
  const staleFailure = staleFailureController.loadMore('root')
  failingIdentity = 'account-b:1:103'
  assert.equal(staleFailureController.getState('root'), undefined)
  rejectStalePage(new Error('stale failure'))
  await assert.rejects(staleFailure, /stale failure/)
  assert.equal(staleFailureController.getState('root'), undefined)

  const normalizedReplies = normalizeMomentCommentRepliesPage({
    code: 0,
    data: {
      page: { num: 1, size: 20, count: 2 },
      replies: [
        { rpid_str: 'preview', root_str: 'root', parent_str: 'root', ctime: 2, member: { mid: 2, uname: 'preview' }, content: { message: 'preview' } },
        { rpid_str: 'loaded', root_str: 'root', parent_str: 'preview', ctime: 3, member: { mid: 3, uname: 'loaded' }, content: { message: 'loaded' } },
      ],
    },
  }, 1, 20)
  assert.deepEqual(normalizedReplies.items.map(item => item.id), ['preview', 'loaded'])
  assert.equal(normalizedReplies.hasMore, false)

  const videoMoment = {
    id: '9000',
    commentType: 1,
    videoUrl: 'https://www.bilibili.com/video/BV1TEST/?p=2',
    bvid: 'BV1TEST',
    aid: 123,
    url: 'https://www.bilibili.com/opus/9000',
  } as DisplayMoment
  const rootComment = createMomentCommentFixture('100')
  const childComment = createMomentCommentFixture('101', '100', '100')
  const videoRootUrl = new URL(buildMomentCommentPermalink(videoMoment, rootComment))
  assert.equal(videoRootUrl.pathname, '/video/BV1TEST/')
  assert.equal(videoRootUrl.searchParams.get('p'), '2')
  assert.equal(videoRootUrl.searchParams.get('comment_on'), '1')
  assert.equal(videoRootUrl.searchParams.get('comment_root_id'), '100')
  assert.equal(videoRootUrl.searchParams.has('comment_secondary_id'), false)
  assert.equal(videoRootUrl.hash, '#reply100')
  const videoChildUrl = new URL(buildMomentCommentPermalink(videoMoment, childComment))
  assert.equal(videoChildUrl.searchParams.get('comment_root_id'), '100')
  assert.equal(videoChildUrl.searchParams.get('comment_secondary_id'), '101')
  assert.equal(videoChildUrl.hash, '#reply101')

  const dynamicMoment = {
    ...videoMoment,
    id: '9001',
    commentType: 11,
    videoUrl: undefined,
    bvid: undefined,
    aid: undefined,
    url: 'https://www.bilibili.com/opus/9001',
  } as DisplayMoment
  const dynamicRootUrl = new URL(buildMomentCommentPermalink(dynamicMoment, rootComment))
  assert.equal(dynamicRootUrl.origin, 'https://t.bilibili.com')
  assert.equal(dynamicRootUrl.pathname, '/9001')
  assert.equal(dynamicRootUrl.searchParams.get('comment_on'), '1')
  assert.equal(dynamicRootUrl.searchParams.get('comment_root_id'), '100')
  assert.equal(dynamicRootUrl.searchParams.has('comment_secondary_id'), false)
  assert.equal(dynamicRootUrl.hash, '#reply100')
  const dynamicChildUrl = new URL(buildMomentCommentPermalink(dynamicMoment, childComment))
  assert.equal(dynamicChildUrl.searchParams.get('comment_secondary_id'), '101')
  assert.equal(dynamicChildUrl.hash, '#reply101')
  const articleUrl = new URL(buildMomentCommentPermalink({
    ...dynamicMoment,
    isArticle: true,
    url: 'https://www.bilibili.com/read/cv123?from=dynamic',
  }, rootComment))
  assert.equal(articleUrl.pathname, '/read/cv123')
  assert.equal(articleUrl.searchParams.get('from'), 'dynamic')
  assert.equal(articleUrl.searchParams.get('comment_root_id'), '100')

  const bvidFallbackUrl = new URL(buildMomentCommentPermalink({
    ...videoMoment,
    videoUrl: 'https://example.com/video/BV1BAD',
  }, rootComment))
  assert.equal(bvidFallbackUrl.hostname, 'www.bilibili.com')
  assert.equal(bvidFallbackUrl.pathname, '/video/BV1TEST')
  const aidFallbackUrl = new URL(buildMomentCommentPermalink({
    ...videoMoment,
    videoUrl: undefined,
    bvid: undefined,
  }, rootComment))
  assert.equal(aidFallbackUrl.pathname, '/video/av123')

  const mainSource = await readFile(`${process.cwd()}/src/utils/main.ts`, 'utf8')
  assert.match(mainSource, /noopener[\s\S]*noreferrer/)
  assert.match(mainSource, /openedWindow\.opener = null/)
}

async function verifyMomentForwardContracts() {
  assert.equal(normalizeForwardCount(12), 12)
  assert.equal(normalizeForwardCount(Number.NaN), 0)
  assert.equal(normalizeForwardCount(-1), 0)
  assert.equal(normalizeMomentRemoteUrl('javascript:alert(1)'), '')
  assert.equal(normalizeMomentRemoteUrl('http://www.bilibili.com/opus/1'), 'https://www.bilibili.com/opus/1')
  assert.equal(normalizeMomentRemoteUrl('//i0.hdslb.com/test.webp'), 'https://i0.hdslb.com/test.webp')

  const textTokens = parseMomentForwardTokens('hello', [])
  assert.deepEqual(serializeMomentForwardContents(textTokens), [{ raw_text: 'hello', type: 1, biz_id: '' }])
  const mixedTokens = parseMomentForwardTokens('hello[doge]world', ['[doge]'])
  assert.deepEqual(mixedTokens, [
    { type: 'text', text: 'hello' },
    { type: 'emoji', text: '[doge]' },
    { type: 'text', text: 'world' },
  ])
  assert.deepEqual(serializeMomentForwardContents(mixedTokens), [
    { raw_text: 'hello', type: 1, biz_id: '' },
    { raw_text: '[doge]', type: 9, biz_id: '' },
    { raw_text: 'world', type: 1, biz_id: '' },
  ])
  assert.deepEqual(serializeMomentForwardContents([]), [])
  const insertion = insertMomentForwardEmoji(
    [{ type: 'text', text: 'hello world' }],
    '[doge]',
    6,
    11,
    ['[doge]'],
  )
  assert.equal(insertion.value, 'hello [doge]')
  assert.equal(insertion.caret, 12)
  assert.equal(insertion.tokens[1]?.type, 'emoji')

  const topic = { id: 42, name: 'Topic' }
  const requestWithTopic = buildMomentForwardRequest({
    momentId: '9001',
    mid: 100,
    tokens: mixedTokens,
    topic,
    now: 123456789,
    random: 0,
  })
  assert.equal(requestWithTopic.dyn_req.scene, 4)
  assert.equal(requestWithTopic.web_repost_src.dyn_id_str, '9001')
  assert.equal(requestWithTopic.dyn_req.upload_id, '100_123456789_1000')
  assert.deepEqual(requestWithTopic.dyn_req.topic, {
    id: 42,
    name: 'Topic',
    from_source: 'dyn.web.list',
    from_topic_id: 0,
  })
  const emptyRequest = buildMomentForwardRequest({
    momentId: '9002',
    mid: 100,
    tokens: [],
    topic: null,
    now: 1,
    random: 0,
  })
  assert.deepEqual(emptyRequest.dyn_req.content.contents, [])
  assert.equal('topic' in emptyRequest.dyn_req, false)

  assert.deepEqual(normalizeMomentForwardEmotePackages({
    code: 0,
    data: {
      packages: [{
        id: 1,
        text: 'Basic',
        url: '//i.example/package.webp',
        emote: [{ id: 2, text: '[doge]', url: 'http://i.example/doge.webp' }],
      }],
    },
  }), [{
    id: 1,
    name: 'Basic',
    iconUrl: 'https://i.example/package.webp',
    emotes: [{ id: 2, text: '[doge]', url: 'https://i.example/doge.webp' }],
  }])
  assert.deepEqual(normalizeMomentTopics({
    code: 0,
    data: {
      topic_items: [
        { id: 1, name: 'One' },
        { id: 1, name: 'Duplicate' },
        { id: 2, name: 'Two' },
      ],
    },
  }), [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }])

  let resolveTopicA!: (topics: Array<{ id: number, name: string }>) => void
  let resolveTopicB!: (topics: Array<{ id: number, name: string }>) => void
  const topicController = createMomentTopicSearchController({
    search: query => new Promise((resolve) => {
      if (query === 'a')
        resolveTopicA = resolve
      else
        resolveTopicB = resolve
    }),
  })
  const topicRequestA = topicController.search('a', '')
  const topicRequestB = topicController.search('abc', '')
  resolveTopicB([{ id: 2, name: 'ABC' }])
  await topicRequestB
  resolveTopicA([{ id: 1, name: 'A' }])
  await topicRequestA
  assert.deepEqual(topicController.state.results, [{ id: 2, name: 'ABC' }])
  topicController.invalidate()
  assert.deepEqual(topicController.state.results, [])

  let failureResolve!: (response: unknown) => void
  let submitCalls = 0
  const failureController = createMomentForwardSubmissionController({
    getIdentity: () => 'account-a:moment-a',
    submit: () => {
      submitCalls += 1
      return new Promise(resolve => failureResolve = resolve)
    },
  })
  failureController.setTokens(mixedTokens)
  failureController.selectTopic(topic)
  const failedSubmit = failureController.submit()
  const duplicateSubmit = failureController.submit()
  assert.equal(failedSubmit, duplicateSubmit)
  failureResolve({ code: -412, message: 'risk control' })
  const failedResult = await failedSubmit
  assert.equal(submitCalls, 1)
  assert.equal(failedResult.success, false)
  assert.equal(failureController.state.status, 'error')
  assert.deepEqual(failureController.state.tokens, mixedTokens)
  assert.deepEqual(failureController.state.selectedTopic, topic)
  failureController.clearTopic()
  assert.equal(failureController.state.selectedTopic, null)
  assert.equal(failureController.state.error, undefined)

  const successController = createMomentForwardSubmissionController({
    getIdentity: () => 'account-a:moment-b',
    submit: async () => ({ code: 0, data: { forward_count: 99 } }),
  })
  successController.setTokens(textTokens)
  successController.selectTopic(topic)
  const successResult = await successController.submit()
  assert.equal(successResult.success, true)
  assert.equal(successController.state.status, 'success')
  assert.deepEqual(successController.state.tokens, [])
  assert.equal(successController.state.selectedTopic, null)
  assert.equal(resolveForwardCountAfterSuccess(successResult.response, 7), 99)
  assert.equal(resolveForwardCountAfterSuccess({ code: 0, data: {} }, 7), 8)

  let identity = 'account-a:moment-c'
  let staleResolve!: (response: unknown) => void
  const staleController = createMomentForwardSubmissionController({
    getIdentity: () => identity,
    submit: () => new Promise(resolve => staleResolve = resolve),
  })
  staleController.setTokens(textTokens)
  const staleSubmit = staleController.submit()
  identity = 'account-b:moment-c'
  staleResolve({ code: 0 })
  const staleResult = await staleSubmit
  assert.equal(staleResult.applied, false)
  assert.deepEqual(staleController.state.tokens, textTokens)

  let invalidatedResolve!: (response: unknown) => void
  const invalidatedController = createMomentForwardSubmissionController({
    getIdentity: () => 'account-a:moment-d',
    submit: () => new Promise(resolve => invalidatedResolve = resolve),
  })
  invalidatedController.setTokens(textTokens)
  const invalidatedSubmit = invalidatedController.submit()
  invalidatedController.invalidate()
  const repeatedAfterInvalidate = invalidatedController.submit()
  assert.equal(invalidatedSubmit, repeatedAfterInvalidate)
  invalidatedResolve({ code: 0 })
  await invalidatedSubmit

  assert.equal(toggleMomentDisclosure('none', 'forward'), 'forward')
  assert.equal(toggleMomentDisclosure('forward', 'forward'), 'none')
  assert.equal(toggleMomentDisclosure('comments', 'forward'), 'forward')
  assert.equal(toggleMomentDisclosure('forward', 'comments'), 'comments')
  setCachedMomentDisclosure('test:moment', 'forward')
  assert.equal(getCachedMomentDisclosure('test:moment'), 'forward')
  setCachedMomentDisclosure('test:moment', 'none')
  assert.equal(getCachedMomentDisclosure('test:moment'), 'none')
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
    commentMedia,
    momentCard,
    forwardComposer,
    emojiPicker,
    topicPicker,
    forwardContent,
    forwardComposable,
    momentsPage,
    momentApi,
    conversationView,
    bootOverlay,
    skeletonBlock,
    historyPage,
    layoutEdit,
    generalSettings,
    settingsShell,
    dockSettings,
    storage,
    searchCatalog,
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
    readFile(`${root}/src/components/MomentCard/MomentCommentMedia.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCard.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentForwardComposer.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentForwardEmojiPicker.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentForwardTopicPicker.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/momentForwardContent.ts`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/useMomentForwardComposer.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Moments/Moments.vue`, 'utf8'),
    readFile(`${root}/src/background/messageListeners/api/moment.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Notifications/whisper/ConversationView.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/bewlyBootOverlay.ts`, 'utf8'),
    readFile(`${root}/src/components/SkeletonBlock.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/History/History.vue`, 'utf8'),
    readFile(`${root}/src/logic/layoutEdit.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/General/General.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/Settings.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue`, 'utf8'),
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/searchCatalog.ts`, 'utf8'),
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
  assert.doesNotMatch(dock, /layout-edit-button|toggleLayoutEditMode|showLayoutEditButton/)
  assert.doesNotMatch(sidebar, /layout-edit-button|toggleLayoutEditMode|showLayoutEditButton/)
  assert.doesNotMatch(dockSettings, /showLayoutEditButton|show_layout_edit_button/)
  assert.doesNotMatch(storage, /showLayoutEditButton/)
  assert.doesNotMatch(layoutEdit, /navigation\.dock\.showLayoutEditButton|show_layout_edit_button/)
  assert.doesNotMatch(searchCatalog, /settings\.show_layout_edit_button/)
  assert.match(generalSettings, /layout_editor\.quick_edit/)
  assert.match(generalSettings, /layout_editor\.quick_edit_desc/)
  assert.match(generalSettings, /layout_editor\.start_quick_edit/)
  assert.match(generalSettings, /inject<\(\) => void>\('startQuickLayoutEdit'\)/)
  assert.match(settingsShell, /provide\('startQuickLayoutEdit', startQuickLayoutEdit\)/)
  assert.match(settingsShell, /enterLayoutEditMode\('page'\)/)
  assert.match(searchCatalog, /layout_editor\.quick_edit/)

  assert.doesNotMatch(slider, /ref\(props\.modelValue\)/)
  assert.doesNotMatch(slider, /addEventListener\('input'/)
  assert.match(slider, /v-model\.number="model"/)
  assert.match(slider, /--slider-progress/)

  assert.match(watchLater, /function playAndRemove/)
  assert.match(watchLater, /function playInWatchLater/)
  assert.match(watchLater, /function remove/)
  assert.match(watchLater, /<IconButton/)
  assert.match(watchLater, /handleReachBottom\.value === handleWatchLaterReachBottom/)
  assert.match(watchLater, /handlePageRefresh\.value === handleWatchLaterPageRefresh/)
  assert.match(gridCard, /:disabled="disabled"/)

  assert.match(commentSection, /buildCommentTree/)
  assert.match(commentSection, /MomentCommentRichText/)
  assert.match(commentSection, /MomentCommentMedia/)
  assert.match(commentSection, /comments_reply_new_tab/)
  assert.match(commentSection, /openLinkToNewTab\(buildMomentCommentPermalink/)
  assert.match(commentSection, /loadMoreReplies/)
  assert.match(commentSection, /ancestorContinuationDepths/)
  assert.match(commentSection, /onBeforeUnmount\(\(\) =>/)
  assert.match(commentSection, /requestIdentity !== getCommentIdentity\(\)/)
  assert.match(commentSection, /page\.hasMore && madeProgress && pageAdvanced/)
  assert.match(commentSection, /aria-pressed="likedIds\.has\(node\.comment\.id\)"/)
  assert.doesNotMatch(commentSection, /replyDraft|replyTarget|replyComposerRootId|<textarea|addMomentCommentReply/)
  assert.match(commentMedia, /pictures: MomentCommentPicture\[\]/)
  assert.match(commentMedia, /moment-comment-media--four/)
  assert.match(commentMedia, /:width="picture\.width \|\| undefined"/)
  assert.match(commentMedia, /getMomentThumbnailUrl\(picture\.url\)/)
  assert.match(commentMedia, /moment-comment-media__fallback/)
  assert.match(commentMedia, /openImagePreview: \[urls: string\[\], index: number, trigger: HTMLElement\]/)
  assert.match(commentRichText, /@error="markEmoteFailed/)
  assert.match(momentApi, /x\/v2\/reply\/action[\s\S]{0,260}application\/x-www-form-urlencoded/)
  assert.match(momentApi, /x\/v2\/reply\/reply[\s\S]{0,260}root:/)
  assert.doesNotMatch(momentApi, /x\/v2\/reply\/add/)
  assert.match(momentCard, /i-tabler-repeat/)
  assert.match(momentCard, /displayedForwardCount/)
  assert.match(momentCard, /aria-controls="forwardSectionId"/)
  assert.match(momentCard, /toggleMomentDisclosure/)
  assert.match(momentCard, /MomentForwardComposer/)
  assert.match(momentCard, /moment-card__forward-disclosure/)
  assert.match(momentCard, /grid-template-rows: 0fr/)
  assert.match(momentCard, /\.moment-card__disclosure \{[\s\S]{0,100}pointer-events: auto/)
  assert.match(momentCard, /displayedDisclosure/)
  assert.match(momentCard, /handleDisclosureTransitionEnd/)
  assert.match(momentCard, /@transitionend="handleDisclosureTransitionEnd"/)
  assert.match(momentCard, /\.moment-card__disclosure-inner \{[\s\S]{0,220}opacity: 0[\s\S]{0,220}transform: translateY/)
  assert.match(momentCard, /\.moment-card__disclosure\.is-open \.moment-card__disclosure-inner/)
  assert.match(commentSection, /\.moment-comments \{[\s\S]{0,220}background: transparent/)
  assert.match(forwardComposer, /\.moment-forward-composer \{[\s\S]{0,220}background: transparent/)
  assert.doesNotMatch(forwardComposer, /\.moment-forward-composer \{[\s\S]{0,220}background: var\(--bew-fill-1\)/)
  assert.match(momentCard, /forwardCountChange/)
  assert.match(forwardComposer, /field-sizing: content/)
  assert.match(forwardComposer, /event\.ctrlKey \|\| event\.metaKey/)
  assert.match(forwardComposer, /insertMomentForwardEmoji/)
  assert.match(forwardComposer, /resolveForwardCountAfterSuccess/)
  assert.match(emojiPicker, /loadMomentForwardEmotes/)
  assert.doesNotMatch(emojiPicker, /position: absolute/)
  assert.match(topicPicker, /setTimeout\([\s\S]{0,160}280/)
  assert.match(topicPicker, /createMomentTopicSearchController/)
  assert.match(topicPicker, /state: searchState/)
  assert.doesNotMatch(topicPicker, /position: absolute/)
  assert.doesNotMatch(emojiPicker, /backdrop-filter/)
  assert.doesNotMatch(topicPicker, /backdrop-filter/)
  assert.match(forwardContent, /scene: 4/)
  assert.match(forwardContent, /web_repost_src/)
  assert.match(forwardContent, /type: token\.type === 'emoji' \? 9 as const : 1 as const/)
  assert.match(forwardComposable, /business: 'dynamic'/)
  assert.match(forwardComposable, /momentEmotesRequest/)
  assert.match(forwardComposable, /momentForwardDraftCache/)
  assert.match(forwardComposable, /MAX_CACHED_MOMENT_FORWARD_DRAFTS/)
  assert.match(forwardComposable, /storeMid !== cookieMid/)
  assert.match(forwardComposable, /state,\n\s+fallbackError/)
  assert.match(forwardComposable, /if \(!context\.isCurrent\(\)\)[\s\S]{0,100}Stale moment forward request/)
  assert.match(momentApi, /x\/dynamic\/feed\/create\/submit_check[\s\S]{0,420}application\/json/)
  assert.match(momentApi, /x\/dynamic\/feed\/create\/dyn[\s\S]{0,420}application\/json/)
  assert.match(momentApi, /x-bili-device-req-json/)
  assert.match(momentApi, /x\/emote\/user\/panel\/web[\s\S]{0,180}business: 'dynamic'/)
  assert.match(momentApi, /x\/topic\/pub\/search/)
  const openMomentDetailSection = momentsPage.slice(
    momentsPage.indexOf('function openMomentDetail'),
    momentsPage.indexOf('function handleDetailIframeLoad'),
  )
  assert.match(openMomentDetailSection, /if \(moment\.isVideo && !moment\.isLive\) \{[\s\S]{0,160}openMomentInNewTab\(moment\)[\s\S]{0,40}return/)
  assert.ok(openMomentDetailSection.indexOf('openMomentInNewTab(moment)') < openMomentDetailSection.indexOf('selectedMoment.value = moment'))
  const loadMomentsSection = momentsPage.slice(
    momentsPage.indexOf('async function loadMoments'),
    momentsPage.indexOf('function clearMomentsPortalState'),
  )
  assert.match(loadMomentsSection, /if \(reset\) \{[\s\S]{0,260}isInitialLoading\.value = true/)
  assert.doesNotMatch(loadMomentsSection, /await prepareMomentCovers/)
  assert.doesNotMatch(momentsPage, /async function prepareMomentCovers/)
  assert.match(momentsPage, /<div v-if="isInitialLoading" class="moments-page__initial-loading">/)
  assert.match(momentsPage, /forwardCount: resolveMomentForwardCount\(id, raw\.modules\?\.module_stat\?\.forward\?\.count\)/)
  assert.match(momentsPage, /function handleMomentForwardCountChange/)
  assert.match(momentsPage, /forwardCountOverrides/)
  assert.match(momentsPage, /canonicalMoment/)
  assert.match(momentsPage, /momentColumns\.value = momentColumns\.value\.map\(updateItems\)/)
  assert.match(momentsPage, /momentsFeedCache\.value = \{[\s\S]{0,120}entries: nextEntries/)
  assert.match(momentsPage, /saveMomentsCache\(filter, entry\)/)
  assert.match(momentsPage, /@forward-count-change="handleMomentForwardCountChange"/)
  assert.match(momentsPage, /bewly-moment-image-viewer-open/)
  assert.match(momentsPage, /moment-image-viewer__nav:focus-visible/)
  assert.doesNotMatch(conversationView, /\benable-image\b/)
  assert.match(momentsPage, /<span\s+class="moments-up-list__fade moments-up-list__fade--prev"/)
  assert.match(momentsPage, /\.moments-up-list__track \{[\s\S]{0,180}padding-block: 6px var\(--bew-space-1\)/)
  assert.match(momentsPage, /\.moments-up-list__item:hover:not\(:disabled\)/)
  assert.match(momentsPage, /@property --moments-up-list-left-clear[\s\S]*@property --moments-up-list-right-clear/)
  assert.match(momentsPage, /\.moments-up-list__scroller \{[\s\S]*--moments-up-list-base-mask:[\s\S]*-webkit-mask-image:/)
  assert.match(momentsPage, /\.moments-up-list__fade \{[\s\S]{0,460}background: radial-gradient\([\s\S]{0,260}filter: var\(--bew-filter-glass-1\)/)
  assert.match(momentsPage, /handleReachBottom\.value === handleMomentsReachBottom/)
  assert.match(momentsPage, /handlePageRefresh\.value === refresh/)
  assert.match(momentsPage, /\.moments-publish-link \{[\s\S]{0,240}border: 1px solid var\(--bew-surface-border-color\)/)
  assert.doesNotMatch(bootOverlay, /radial-gradient|box-shadow/)
  assert.match(bootOverlay, /border-top-color: var\(--bew-theme-color/)
  assert.match(skeletonBlock, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,120}animation: none/)
  assert.match(historyPage, /<VideoListSkeleton v-else-if="isLoading && historyList\.length === 0"/)

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

async function verifyAuthCloudMomentsContracts() {
  const root = process.cwd()
  const [
    app,
    appAuthorizationDialog,
    authProvider,
    necessarySettingsWatchers,
    userPanelPop,
    dialog,
    settingsHome,
    forYou,
    cloudProtocol,
    cloudBackground,
    cloudCoordinator,
    about,
    moments,
    momentCard,
    opusLayout,
  ] = await Promise.all([
    readFile(`${root}/src/contentScripts/views/App.vue`, 'utf8'),
    readFile(`${root}/src/components/AppAuthorizationDialog.vue`, 'utf8'),
    readFile(`${root}/src/utils/authProvider.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/necessarySettingsWatchers.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/UserPanelPop.vue`, 'utf8'),
    readFile(`${root}/src/components/Dialog.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/Home/Home.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Home/components/ForYou.vue`, 'utf8'),
    readFile(`${root}/src/utils/settingsCloudSyncProtocol.ts`, 'utf8'),
    readFile(`${root}/src/background/settingsCloudSync.ts`, 'utf8'),
    readFile(`${root}/src/background/settingsStorageCoordinator.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/About/About.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Moments/Moments.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCard.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/features/opusDetailDrawerLayout.ts`, 'utf8'),
  ])

  assert.equal((app.match(/<AppAuthorizationDialog\b/g) || []).length, 1)
  assert.match(app, /completeExternalAppAuthorization/)
  assert.doesNotMatch(settingsHome, /<AppAuthorizationDialog\b|<QRCodeVue\b|authorizationTimer/)
  assert.doesNotMatch(forYou, /<AppAuthorizationDialog\b/)
  assert.match(forYou, /function requireAppAuthorization\(\)[\s\S]{0,220}reportAppAuthorizationInvalid/)
  assert.match(forYou, /watch\(appAuthorizationSuccessVersion,[\s\S]{0,360}void initData\(\)/)
  assert.match(forYou, /noMoreContent\.value = recommendationDataState\.value === 'empty'/)
  assert.match(forYou, /else if \(response\.code === 62011\)[\s\S]{0,220}requireAppAuthorization\(\)/)
  assert.match(appAuthorizationDialog, /AUTHORIZATION_DEADLINE/)
  assert.match(appAuthorizationDialog, /setTimeout\(async \(\) =>/)
  assert.doesNotMatch(appAuthorizationDialog, /setInterval/)
  assert.match(appAuthorizationDialog, /@before-close="handleBeforeClose"/)
  assert.match(dialog, /defineExpose\(\{ close: handleClose \}\)/)
  assert.doesNotMatch(necessarySettingsWatchers, /appAuthTokens\.value\.accessToken\s*=\s*''/)
  assert.doesNotMatch(necessarySettingsWatchers, /Clear accessKey if not logged in/)
  assert.doesNotMatch(userPanelPop, /revokeAccessKey/)
  assert.match(authProvider, /accessTokenExpiresAt > Date\.now\(\)/)

  assert.match(cloudProtocol, /function classifySettingsCloudSyncSnapshot/)
  assert.match(cloudProtocol, /function resolveSettingsCloudSyncEnableDecision/)
  assert.match(cloudBackground, /SETTINGS_CLOUD_SYNC_AVAILABILITY_MESSAGE/)
  assert.match(cloudBackground, /SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE/)
  assert.match(cloudBackground, /if \(entry\) \{[\s\S]{0,100}remoteChanges\[field\] = entry/)
  assert.match(cloudBackground, /hasIncompatibleChange = true/)
  assert.match(cloudBackground, /enableIntentGeneration/)
  assert.match(cloudBackground, /incompatibleFieldGenerations/)
  assert.match(cloudBackground, /while \(pendingInitializationFields\.size > 0\)/)
  assert.match(cloudBackground, /preferenceReadSucceeded/)
  assert.match(cloudBackground, /resolvedIncompatibleChange/)
  assert.match(cloudBackground, /scheduleRuntimeRecovery/)
  assert.match(cloudBackground, /enabled && ready && \[\.\.\.blockedUploads\.values\(\)\]/)
  assert.doesNotMatch(cloudBackground, /remoteChanges\[field\] = normalizeSettingsCloudSyncEntry/)
  assert.match(cloudCoordinator, /mode: SettingsCloudSyncMode = 'auto'/)
  assert.match(cloudCoordinator, /mode === 'pull'/)
  assert.match(cloudCoordinator, /mode === 'push'/)
  assert.match(cloudCoordinator, /mode === 'push' \|\| bootstrapDirtyFields\.has\(field\)/)
  assert.match(cloudCoordinator, /if \(!meta\.fieldVersions\[field\]\)/)
  assert.match(about, /resolveSettingsCloudSyncEnableDecision/)
  assert.match(about, /enableSettingsCloudSync\('pull'\)/)
  assert.match(about, /enableSettingsCloudSync\('push'\)/)
  assert.match(about, /common\.operation\.cancel/)
  assert.match(about, /cloudSyncControlRevision/)
  assert.match(cloudBackground, /cloudSyncStatusWriteQueue/)
  assert.match(cloudBackground, /writeVersion !== cloudSyncStatusWriteVersion/)
  assert.match(about, /cloud-sync-warning/)

  assert.match(moments, /classifyMomentAdditional\(additional\.type\)/)
  assert.match(moments, /RICH_TEXT_NODE_TYPE_VOTE/)
  assert.match(moments, /imageRatios:/)
  assert.match(moments, /type: 'BEWLY_OPUS_VIEWPORT'/)
  assert.match(moments, /clearDetailFocusRetry\(\)/)
  assert.match(moments, /function resetMomentsAccountState\(\) \{[\s\S]{0,80}closeMomentDetail\(\)/)
  assert.match(moments, /Failed to load Moments feed/)
  assert.match(moments, /isExtensionContextInvalidatedError/)
  assert.match(moments, /if \(momentsExtensionContextInvalidated\)[\s\S]{0,80}return/)
  assert.match(moments, /if \(isExtensionContextInvalidatedError\(error\)\) \{[\s\S]{0,180}momentsExtensionContextInvalidated = true[\s\S]{0,180}return/)
  assert.match(moments, /clearMomentPresentationForRefresh\(items\)/)
  assert.match(moments, /isInitialLoading\.value = moments\.value\.length === 0/)
  assert.match(moments, /likingMomentRequests\.get\(moment\.id\) === requestId/)
  assert.match(moments, /const cursorAdvanced = nextOffset !== requestOffset/)
  assert.match(moments, /if \(!pageApplied && previousPagination\)/)
  assert.match(moments, /isMomentMutationCurrent\(requestAccountId\)/)
  assert.match(moments, /shouldContinueIframeFocusRetry/)
  assert.doesNotMatch(moments, /setInterval/)
  assert.match(momentCard, /role="button"[\s\S]{0,180}@click="handleForwardOriginClick"/)
  assert.match(momentCard, /@click\.stop="handleImagePreview/)
  assert.match(momentCard, /moment-card__additional-vote-icon/)
  assert.match(momentCard, /const primaryActionLabel/)
  assert.match(momentCard, /i-tabler-repeat/)
  assert.doesNotMatch(momentCard, /--moment-card-text-body-min-height|min-height: var\(--moment-card-text-body-min-height|moment-card--text[\s\S]{0,80}min-height: 240px/)
  assert.match(opusLayout, /--bewly-opus-comment-width/)
  assert.match(opusLayout, /getParentMessageData\(event,[\s\S]{0,120}'BEWLY_OPUS_VIEWPORT'/)
  assert.match(opusLayout, /window\.removeEventListener\('message', handleOpusParentMessage\)/)
  assert.match(opusLayout, /bewly-opus-media-origin/)
}

async function verifyLoadingContracts() {
  const root = process.cwd()
  const [
    loading,
    smoothLoading,
    app,
    home,
    watchLater,
    favorites,
    anime,
    animeTimetable,
    articleSearch,
    userSearch,
    mediaSearch,
    allSearch,
  ] = await Promise.all([
    readFile(`${root}/src/components/Loading.vue`, 'utf8'),
    readFile(`${root}/src/components/SmoothLoading.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/App.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Home/Home.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/WatchLater/WatchLater.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Favorites/FavoritesPage.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Anime/Anime.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Anime/components/AnimeTimeTable.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/SearchResults/pages/ArticleSearchPage.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/SearchResults/pages/UserSearchPage.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/SearchResults/pages/MediaFtSearchPage.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/SearchResults/pages/AllSearchPage.vue`, 'utf8'),
  ])

  for (const source of [loading, smoothLoading]) {
    assert.match(source, /<PageLoadingIndicator/)
    assert.doesNotMatch(source, /loading\.gif|<img\b/)
  }
  assert.match(app, /loadingComponent: PageAsyncLoading/)
  assert.match(app, /watch\([\s\S]{0,160}\(\) => activatedPage\.value,[\s\S]{0,180}handleReachBottom\.value = undefined/)
  assert.match(home, /loadingComponent: PageAsyncLoading/)
  assert.match(watchLater, /<VideoListSkeleton[\s\S]{0,180}:action-count="3"/)
  assert.match(favorites, /<ArticleCardSkeleton/)
  assert.match(anime, /<BangumiCardSkeleton/)
  assert.match(animeTimetable, /<AnimeTimeTableSkeleton v-if="isLoading"/)
  assert.match(articleSearch, /<ArticleCardSkeleton/)
  assert.match(userSearch, /<UserCardSkeleton/)
  assert.match(mediaSearch, /<MediaHighlightSkeleton/)
  assert.match(allSearch, /<AllSearchSkeleton v-if="isLoading && !results"/)
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
    searchExperience,
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
    readFile(`${root}/src/logic/searchExperience.ts`, 'utf8'),
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

  assert.match(searchExperience, /isExtensionContextInvalidatedError\(error\)/)
  assert.match(searchExperience, /extensionContextInvalidated = true[\s\S]{0,80}clearRefreshTimer\(\)/)
  assert.doesNotMatch(searchExperience, /Failed to load hot search list|console\.error/)
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
  const [searchBar, select, contextMenu, videoInfo, history, en, cn, tw, yue] = await Promise.all([
    readFile(`${root}/src/components/SearchBar/SearchBar.vue`, 'utf8'),
    readFile(`${root}/src/components/Select.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/components/VideoCardInfo.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/History/History.vue`, 'utf8'),
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

  assert.match(history, /:aria-label="\$t\('common\.operation\.delete'\)"/)
  assert.doesNotMatch(history, /common\.remove/)

  const localeKeySets = [en, cn, tw, yue].map(collectLocaleKeys)
  for (const keys of localeKeySets.slice(1))
    assert.deepEqual([...keys].sort(), [...localeKeySets[0]].sort())
  for (const key of [
    'widescreen.enter',
    'widescreen.close_sidebar',
    'widescreen.resize_sidebar',
    'widescreen.comments_loading',
    'settings.maintenance.build_id',
    'search_bar.input_label',
    'video_card.operation.scroll_to_bottom',
    'common.operation.delete',
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
  const [storage, contentScript, videoPlayback, playbackPage, maintenance, catalog, widescreen, pageModeSwitcher, watchLaterButton, tsconfig, about, prepare, dock, dockPolicy, bilibiliTopBar, sideBar] = await Promise.all([
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/PlaybackPage/PlaybackPage.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/Advanced/Maintenance.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/searchCatalog.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/composables/usePageModeSwitcher.ts`, 'utf8'),
    readFile(`${root}/src/utils/watchLaterButton.ts`, 'utf8'),
    readFile(`${root}/tsconfig.json`, 'utf8'),
    readFile(`${root}/src/components/Settings/About/About.vue`, 'utf8'),
    readFile(`${root}/scripts/prepare.ts`, 'utf8'),
    readFile(`${root}/src/components/Dock/Dock.vue`, 'utf8'),
    readFile(`${root}/src/constants/dock.ts`, 'utf8'),
    readFile(`${root}/src/utils/bilibiliTopBar.ts`, 'utf8'),
    readFile(`${root}/src/components/SideBar/SideBar.vue`, 'utf8'),
  ])

  assert.doesNotMatch(storage, /showBewlyWidescreenButton/)
  assert.match(storage, /bewlyWidescreenLayoutPriority: BewlyWidescreenLayoutPriority/)
  assert.match(storage, /bewlyWidescreenLayoutPriority: 'video-first'/)
  assert.match(storage, /bewlyWidescreenCenterVideo: false/)
  assert.match(playbackPage, /settings\.defaultVideoPlayerMode/)
  assert.doesNotMatch(playbackPage, /settings\.showBewlyWidescreenButton/)
  assert.match(playbackPage, /settings\.bewlyWidescreenCenterVideo/)
  assert.match(playbackPage, /settings\.bewlyWidescreenLayoutPriority/)
  assert.doesNotMatch(videoPlayback, /settings\.(?:defaultVideoPlayerMode|showBewlyWidescreenButton|bewlyWidescreenCenterVideo|bewlyWidescreenLayoutPriority)/)
  assert.doesNotMatch(videoPlayback, /sidebar_expansion_mode/)
  assert.match(maintenance, /bewlyWidescreenLayoutPriority: \['video-first', 'sidebar-first'\]/)
  assert.match(maintenance, /const developmentBuildId = __DEV__ \? __BEWLY_BUILD_ID__ : ''/)
  assert.match(maintenance, /v-if="developmentBuildId"/)
  assert.doesNotMatch(catalog, /settings\.show_bewly_widescreen_button/)
  assert.match(catalog, /bewly_widescreen_layout_priority/)
  await assert.rejects(stat(`${root}/src/contentScripts/bewlyWidescreenControl.ts`))
  assert.doesNotMatch(contentScript, /BewlyWidescreenControl|bewlyWidescreenControl|bewly-widescreen-entry-control/)
  assert.match(pageModeSwitcher, /isVideoOrBangumiPage\(currentLocationHref\.value\)/)
  assert.match(pageModeSwitcher, /isBewlyWidescreenEngaged\(\)/)
  assert.match(pageModeSwitcher, /BEWLY_WIDESCREEN_MANUAL_TOGGLE/)
  assert.match(pageModeSwitcher, /applyBewlyWidescreen\(settings\.value\.bewlyWidescreenSidebarPosition\)/)
  assert.match(pageModeSwitcher, /exitBewlyWidescreen\(\{ userInitiated: true \}\)/)
  const cyclePageModeStart = pageModeSwitcher.indexOf('async function cyclePageMode')
  const videoModeSwitchStart = pageModeSwitcher.indexOf('if (videoPlaybackPage.value)', cyclePageModeStart)
  const videoModeSwitchSection = pageModeSwitcher.slice(
    videoModeSwitchStart,
    pageModeSwitcher.indexOf('const currentHref', videoModeSwitchStart),
  )
  assert.doesNotMatch(videoModeSwitchSection, /settings\.value\s*=/)
  assert.match(contentScript, /if \(!isVideoOrBangumiPage\(\)\) \{[\s\S]{0,260}stopAutoExitFullscreenMonitoring\(\)[\s\S]{0,120}resetRandomPlayInitialization\(\)/)
  const earlyWidescreenStart = contentScript.indexOf(`if (targetPlayerMode === 'bewlyWidescreen'`)
  const earlyWidescreenEnd = contentScript.indexOf(`if (document.readyState !== 'complete')`, earlyWidescreenStart)
  const earlyWidescreenSection = contentScript.slice(earlyWidescreenStart, earlyWidescreenEnd)
  assert.match(earlyWidescreenSection, /prepareBewlyWidescreenLoading/)
  assert.match(earlyWidescreenSection, /applyBewlyWidescreen/)
  const settingsReadySection = contentScript.slice(
    contentScript.indexOf('void settingsReady.then(async'),
    contentScript.indexOf('function setupPluginSearchLinkNavigation'),
  )
  assert.match(settingsReadySection, /await ensureInterfaceLanguage\(\)/)
  assert.ok(settingsReadySection.indexOf('await ensureInterfaceLanguage()') < settingsReadySection.indexOf('playerModeSettingsReady = true'))
  assert.match(widescreen, /stopLanguageWatch = watch/)
  const hiddenNativeControlSelectors = widescreen.slice(
    widescreen.indexOf('const HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS'),
    widescreen.indexOf('const MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR'),
  )
  assert.match(hiddenNativeControlSelectors, /\.bpx-player-ctrl-wide/)
  assert.match(hiddenNativeControlSelectors, /\.bpx-player-ctrl-web/)
  assert.doesNotMatch(hiddenNativeControlSelectors, /\.bpx-player-ctrl-full/)
  const hiddenNativeControlStyles = widescreen.slice(
    widescreen.indexOf('${HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS'),
    widescreen.indexOf(`#\${ROOT_ID} {`, widescreen.indexOf('${HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS')),
  )
  assert.match(hiddenNativeControlStyles, /\.map\(selector => `body\.\$\{BODY_CLASS\} \$\{selector\}`\)/)
  assert.match(hiddenNativeControlStyles, /display: none !important/)
  assert.match(widescreen, /data-sidebar-layout/)
  assert.match(widescreen, /data-sidebar-hover-expanded/)
  assert.match(widescreen, /resolveWidescreenSidebarHoverExpanded/)
  assert.match(widescreen, /grid-template-columns: minmax\(0, 100vw\) 0/)
  assert.doesNotMatch(widescreen, /data-sidebar-layout="expanded"[^}]*--bewly-widescreen-player-target-width/)
  assert.doesNotMatch(widescreen, /--bewly-widescreen-sidebar-compact-width/)
  const sidebarSurfaceStyles = widescreen.slice(
    widescreen.indexOf(`.bewly-widescreen-sidebar {`),
    widescreen.indexOf(`[data-sidebar-layout="expanded"] .bewly-widescreen-sidebar`),
  )
  assert.match(sidebarSurfaceStyles, /visibility: hidden/)
  assert.match(sidebarSurfaceStyles, /pointer-events: none/)
  assert.match(sidebarSurfaceStyles, /height: calc\(100dvh - var\(--bewly-widescreen-sidebar-floating-inset\) \* 2\)/)
  assert.match(sidebarSurfaceStyles, /margin: var\(--bewly-widescreen-sidebar-floating-inset\)/)
  assert.match(sidebarSurfaceStyles, /background: transparent/)
  assert.match(sidebarSurfaceStyles, /border: 1px solid var\(--bew-surface-border-color\)/)
  assert.match(sidebarSurfaceStyles, /border-radius: var\(--bew-panel-radius\)/)
  assert.match(sidebarSurfaceStyles, /corner-shape: var\(--bew-corner-shape\)/)
  assert.match(sidebarSurfaceStyles, /box-shadow: var\(--bew-shadow-3\), var\(--bew-shadow-edge-glow-1\)/)
  assert.match(sidebarSurfaceStyles, /backdrop-filter: none/)
  assert.match(sidebarSurfaceStyles, /transform: translate3d\(var\(--bewly-widescreen-sidebar-offset\), 0, 0\)/)
  assert.match(sidebarSurfaceStyles, /transform var\(--bew-duration-moderate, 300ms\)/)
  assert.match(sidebarSurfaceStyles, /backface-visibility: hidden/)
  const sidebarGlassLayerStyles = widescreen.slice(
    widescreen.indexOf('.bewly-widescreen-sidebar::before'),
    widescreen.indexOf('.bewly-widescreen-sidebar-resizer'),
  )
  assert.match(sidebarGlassLayerStyles, /background: var\(--bew-elevated-alt\)/)
  assert.match(sidebarGlassLayerStyles, /backdrop-filter: var\(--bew-filter-glass-1\)/)
  assert.match(sidebarSurfaceStyles, /--bewly-widescreen-sidebar-offset: var\(--bewly-widescreen-sidebar-reserved-width\)/)
  assert.doesNotMatch(sidebarSurfaceStyles, /-12px 0 28px|12px 0 28px/)
  assert.match(widescreen, /data-centered="true"\] \.bewly-widescreen-player-frame > \*[\s\S]{0,220}100vw - var\(--bewly-widescreen-sidebar-reserved-width\)/)
  assert.match(widescreen, /sidebarWidth: sidebarRect\.width \+ sidebarFloatingInset \* 2/)
  const sidebarToolbarSection = widescreen.slice(
    widescreen.indexOf('function createSidebarToolbar'),
    widescreen.indexOf('function createTabButton'),
  )
  assert.doesNotMatch(sidebarToolbarSection, /exitBewlyWidescreen/)
  assert.match(sidebarToolbarSection, /setSidebarLayout\('compact', currentState, true\)/)
  assert.match(sidebarToolbarSection, /sidebarToggleButton\.focus\(\{ preventScroll: true \}\)/)
  const sidebarTopStyles = widescreen.slice(
    widescreen.indexOf(`.bewly-widescreen-sidebar-top {`),
    widescreen.indexOf(`.bewly-widescreen-toolbar {`),
  )
  assert.match(sidebarTopStyles, /z-index: 1/)
  assert.match(sidebarTopStyles, /flex: 0 0 auto/)
  assert.match(sidebarTopStyles, /max-height: 52%/)
  const sidebarPanelStyles = widescreen.slice(
    widescreen.indexOf(`.bewly-widescreen-panels {`),
    widescreen.indexOf(`.bewly-widescreen-panel {`),
  )
  assert.match(sidebarPanelStyles, /z-index: 0/)
  assert.match(sidebarPanelStyles, /flex: 1 1 0/)
  assert.match(widescreen, /resolveWidescreenCenterGeometry/)
  assert.match(widescreen, /setupActionGeometryObservers/)
  assert.match(widescreen, /waitForReadyLayout/)
  assert.match(widescreen, /canCommitWidescreenLayout\(\{[\s\S]{0,220}pageReady:[\s\S]{0,220}playerReady:[\s\S]{0,220}contentReady:/)
  assert.match(widescreen, /contentReadyForLayout = isWidescreenTransferContentReady\(\)[\s\S]{0,160}hasWidescreenTransferSettleElapsed\(\)/)
  assert.match(widescreen, /function isWidescreenTransferContentReady/)
  assert.match(widescreen, /const TRANSFER_SETTLE_DELAY = 1200/)
  assert.match(widescreen, /const PAGE_READY_FALLBACK_DELAY = 3000/)
  assert.match(widescreen, /function hasWidescreenTransferSettleElapsed/)
  assert.doesNotMatch(widescreen, /READY_WAIT_TIMEOUT|BEWLY_WIDESCREEN_FAILED/)
  assert.match(widescreen, /const READY_POLL_SLOW_INTERVAL = 500/)
  assert.match(widescreen, /if \(enteringWidescreen\)\s*return[\s\S]{0,180}loadingSuppressedUntilExit = true/)
  assert.doesNotMatch(contentScript, /BEWLY_WIDESCREEN_FAILED/)
  assert.match(widescreen, /selectors\.metadata/)
  assert.match(widescreen, /function syncVideoMetadata/)
  assert.match(widescreen, /loadFallbackVideoInfo\(nextState\)/)
  const fallbackVideoInfoSection = widescreen.slice(
    widescreen.indexOf('async function loadFallbackVideoInfo'),
    widescreen.indexOf('function fillSidebar'),
  )
  assert.match(fallbackVideoInfoSection, /if \(!isBilibiliRiskControl\(error\)\)/)
  assert.match(fallbackVideoInfoSection, /reportRuntimeFailure\('Failed to load widescreen video information', error\)/)
  assert.doesNotMatch(widescreen, /moveNode\(player, playerFrame/)
  assert.match(widescreen, /NATIVE_PLAYER_CLASS/)
  assert.match(widescreen, /function syncAnchoredPlayerGeometry/)
  assert.match(widescreen, /player\.classList\.add\(NATIVE_PLAYER_CLASS\)/)
  assert.match(widescreen, /playerEl\.classList\.remove\(NATIVE_PLAYER_CLASS\)/)
  assert.match(widescreen, /function exitNativeMiniPlayer/)
  assert.match(widescreen, /\.bpx-player-mini-close/)
  assert.match(widescreen, /attributeFilter: \['class', 'data-screen', 'data-ctrl-hidden', 'style'\]/)
  assert.match(widescreen, /startSidebarHydration\(nextState\)/)
  assert.doesNotMatch(widescreen, /hasLoadedImage|readyAssetHandler/)
  assert.match(widescreen, /pageReadyForLayout = document\.readyState === 'complete'/)
  assert.match(widescreen, /window\.addEventListener\('load'/)
  assert.match(widescreen, /pageReadyFallbackTimer = setTimeout/)
  const layoutReadinessSection = widescreen.slice(
    widescreen.indexOf('function isReadyForLayout'),
    widescreen.indexOf('function restoreCommentPrewarm'),
  )
  assert.match(layoutReadinessSection, /HAVE_METADATA/)
  assert.doesNotMatch(layoutReadinessSection, /backgroundImage|naturalWidth/)
  assert.match(widescreen, /const READY_STABILITY_DELAY = 160/)
  assert.match(widescreen, /readinessStableSince/)
  assert.match(widescreen, /function startCommentPrewarm/)
  assert.match(widescreen, /function restoreCommentPrewarm/)
  const readinessAttemptSection = widescreen.slice(
    widescreen.indexOf('const scheduleAttempt = () =>'),
    widescreen.indexOf('readyObserver = new MutationObserver', widescreen.indexOf('const scheduleAttempt = () =>')),
  )
  assert.match(readinessAttemptSection, /startCommentPrewarm\(\)[\s\S]{0,160}playerReadyForLayout = isReadyForLayout\(\)/)
  assert.doesNotMatch(readinessAttemptSection, /if \(pageReadyForLayout\)\s*startCommentPrewarm\(\)/)
  assert.match(widescreen, /readyPollTimer/)
  assert.match(widescreen, /clearTimeout\(readyPollTimer\)/)
  assert.match(widescreen, /window\.removeEventListener\('load', pageReadyHandler\)/)
  assert.match(widescreen, /styleAttribute: commentRoot\.getAttribute\('style'\)/)
  assert.doesNotMatch(widescreen, /restoreCommentPrewarm\(\)[\s\S]{0,160}applyNow\(pendingSidebarPosition\)/)
  const moveCommentRootSection = widescreen.slice(
    widescreen.indexOf('function moveCommentRoot'),
    widescreen.indexOf('function movePlaylistControls'),
  )
  assert.match(moveCommentRootSection, /commentPrewarmState\?\.root === next[\s\S]{0,120}restoreCommentPrewarm\(\)/)
  assert.match(widescreen, /function startSidebarHydration/)
  assert.match(widescreen, /sidebarHydrationTimer/)
  assert.match(widescreen, /function runSidebarHydration/)
  assert.match(widescreen, /Sidebar hydration failed; retrying within the bounded hydration window/)
  assert.match(widescreen, /else if \(!currentState\.sidebarHydrationTimer\) \{[\s\S]{0,80}startSidebarHydration\(currentState\)/)
  assert.match(widescreen, /syncSidebarReadiness\(nextState, \{[\s\S]{0,180}complete: false/)
  assert.match(dockPolicy, /function resolveDockCollapsedShellSize/)
  assert.match(dock, /resolveDockCollapsedShellSize/)
  assert.match(dock, /expectedDockShellSize/)
  assert.match(dock, /resolveDockCollapsedShellSize\(measuredSize, expectedDockShellSize\)/)
  const moveNodeSection = widescreen.slice(
    widescreen.indexOf('function moveNode'),
    widescreen.indexOf('function moveMatchingNodes'),
  )
  assert.match(moveNodeSection, /document\.createElement\('span'\)/)
  assert.match(moveNodeSection, /bewly-widescreen-origin-placeholder/)
  const restoreMovedNodesSection = widescreen.slice(
    widescreen.indexOf('function restoreMovedNodes'),
    widescreen.indexOf('function removeMovedNode'),
  )
  assert.doesNotMatch(restoreMovedNodesSection, /document\.body\.appendChild/)
  assert.match(restoreMovedNodesSection, /node\.remove\(\)/)
  const keepOriginalTopBarSection = bilibiliTopBar.slice(
    bilibiliTopBar.indexOf('function keepOriginalTopBarAvailable'),
    bilibiliTopBar.indexOf('function restoreOriginalTopBarVisibility'),
  )
  assert.doesNotMatch(keepOriginalTopBarSection, /doc\.body\.(?:prepend|append)/)
  const ensureOriginalTopBarSection = bilibiliTopBar.slice(
    bilibiliTopBar.indexOf('export function ensureOriginalBilibiliTopBarAppended'),
    bilibiliTopBar.indexOf('export function restoreOriginalBilibiliTopBarParent'),
  )
  assert.doesNotMatch(ensureOriginalTopBarSection, /doc\.body\.prepend/)
  assert.match(widescreen, /shadowRoot\.childElementCount/)
  assert.match(widescreen, /bili-comment-box, bili-comment-renderer, bili-comment-thread-renderer/)
  assert.match(widescreen, /interface WidescreenSidebarReadiness/)
  assert.match(widescreen, /dataset\.sidebarTopReady/)
  assert.match(widescreen, /setAttribute\('aria-busy'/)
  assert.match(widescreen, /setAttribute\('aria-controls'/)
  assert.match(widescreen, /setAttribute\('aria-labelledby'/)
  assert.match(widescreen, /case 'ArrowRight'/)
  assert.match(widescreen, /z-index: var\(--bew-z-widescreen\)/)
  assert.match(widescreen, /z-index: var\(--bew-z-widescreen-loading\)/)
  assert.match(widescreen, /@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(widescreen, /\.bewly-widescreen-panel-danmaku \.bui-collapse-header[\s\S]{0,80}display: none !important/)
  assert.match(widescreen, /\.bewly-widescreen-panel-danmaku \.bui-collapse-header[\s\S]{0,260}background: var\(--bewly-widescreen-sidebar-bg\) !important/)
  assert.match(widescreen, /\.bewly-widescreen-panel-danmaku \.bui-collapse-arrow[\s\S]{0,80}display: none !important/)
  assert.match(widescreen, /\.bewly-widescreen-panel-danmaku \.bpx-player-filter[\s\S]{0,80}pointer-events: auto/)
  assert.match(widescreen, /\.bewly-widescreen-panel-danmaku \.bpx-player-wraplist[\s\S]{0,180}display: flex[\s\S]{0,180}height: 100% !important/)
  assert.match(widescreen, /\.bewly-widescreen-panel-danmaku \.bpx-player-dm-function[\s\S]{0,160}background: var\(--bewly-widescreen-sidebar-bg\) !important/)
  assert.match(widescreen, /\.bewly-widescreen-panel-danmaku \.bpx-player-dm-wrap[\s\S]{0,260}background: var\(--bewly-widescreen-sidebar-bg\) !important/)
  const danmakuPanelStyles = widescreen.slice(
    widescreen.indexOf(`.bewly-widescreen-panel-danmaku {`),
    widescreen.indexOf('/* B 站表情面板可能向上展开'),
  )
  assert.doesNotMatch(danmakuPanelStyles, /max-height: none !important/)
  assert.doesNotMatch(widescreen, /--bew-comment-replies-(?:mask-bg|loading-animation)/)
  assert.match(widescreen, /danmakuFocusable:/)
  const danmakuSelectorSection = widescreen.slice(
    widescreen.indexOf('danmaku: ['),
    widescreen.indexOf('playlist: [', widescreen.indexOf('danmaku: [')),
  )
  assert.doesNotMatch(danmakuSelectorSection, /'\.bpx-player-dm-wrap'/)
  assert.match(widescreen, /const DANMAKU_RESIZE_DELAYS = \[0, 80, 180, 360, 720\]/)
  assert.match(widescreen, /function activateDanmakuTab/)
  assert.match(widescreen, /focusable\.click\(\)/)
  assert.match(widescreen, /danmakuPendingSource\?: HTMLElement/)
  assert.match(widescreen, /currentState\.danmakuActivationTimer\s*&& currentState\.danmakuPendingSource === source/)
  assert.match(widescreen, /function isDanmakuPanelReady/)
  const danmakuReadySection = widescreen.slice(
    widescreen.indexOf('function isDanmakuPanelReady'),
    widescreen.indexOf('function activateDanmakuTab'),
  )
  assert.match(widescreen, /DANMAKU_LIST_VIEWPORT_SELECTOR = '\.bui-long-list-list, \.bpx-player-dm-container'/)
  assert.match(widescreen, /DANMAKU_LIST_ITEM_SELECTOR = '\.bui-long-list-item, \.bpx-player-dm-item,[^']*\[data-index\]'/)
  assert.match(danmakuReadySection, /querySelector<HTMLElement>\(DANMAKU_LIST_VIEWPORT_SELECTOR\)/)
  assert.match(danmakuReadySection, /querySelector\(DANMAKU_LIST_ITEM_SELECTOR\)/)
  assert.match(danmakuReadySection, /return false/)
  assert.match(widescreen, /activeTab === 'danmaku'[\s\S]{0,480}activateDanmakuTab\(currentState\)/)
  assert.match(widescreen, /const DANMAKU_SKELETON_CLASS = 'bewly-widescreen-danmaku-skeleton'/)
  assert.match(widescreen, /function createDanmakuSkeleton\(label: string\)/)
  assert.match(widescreen, /function getDanmakuSkeletonHost\(panel: HTMLElement\)/)
  assert.match(widescreen, /panel\.querySelector<HTMLElement>\('\.bpx-player-dm-wrap'\) \?\? panel/)
  assert.match(widescreen, /function ensureDanmakuSkeleton\(panel: HTMLElement, label: string\)/)
  assert.match(widescreen, /function clearDanmakuSkeleton\(panel: HTMLElement\)/)
  const ensureDanmakuSkeletonSection = widescreen.slice(
    widescreen.indexOf('function ensureDanmakuSkeleton'),
    widescreen.indexOf('function ensureEmptyPanel'),
  )
  assert.match(ensureDanmakuSkeletonSection, /const host = getDanmakuSkeletonHost\(panel\)/)
  assert.match(ensureDanmakuSkeletonSection, /host\.appendChild\(existing\)/)
  assert.match(ensureDanmakuSkeletonSection, /host\.appendChild\(createDanmakuSkeleton\(label\)\)/)
  const danmakuHydrationStart = widescreen.indexOf(`if (activeTab === 'danmaku')`)
  const danmakuHydrationSection = widescreen.slice(
    danmakuHydrationStart,
    widescreen.indexOf('let existingPlaylist', danmakuHydrationStart),
  )
  assert.match(danmakuHydrationSection, /ensureDanmakuSkeleton\(currentState\.panels\.danmaku/)
  assert.match(danmakuHydrationSection, /clearDanmakuSkeleton\(currentState\.panels\.danmaku\)/)
  assert.doesNotMatch(danmakuHydrationSection, /ensureEmptyPanel/)
  const danmakuSkeletonStyles = widescreen.slice(
    widescreen.indexOf('.bewly-widescreen-danmaku-skeleton {'),
    widescreen.indexOf('/* B 站表情面板可能向上展开'),
  )
  assert.match(danmakuSkeletonStyles, /grid-template-columns:/)
  assert.match(danmakuSkeletonStyles, /background: var\(--bew-skeleton\)/)
  assert.match(danmakuSkeletonStyles, /\.bewly-widescreen-danmaku-skeleton__block[\s\S]{0,420}animation: bewly-widescreen-skeleton-shimmer/)
  assert.doesNotMatch(danmakuSkeletonStyles, /\.bewly-widescreen-danmaku-skeleton::after/)
  assert.match(widescreen, /@keyframes bewly-widescreen-skeleton-shimmer/)
  assert.match(danmakuPanelStyles, /\.bpx-player-dm-wrap[\s\S]{0,180}position: relative !important/)
  assert.match(danmakuPanelStyles, /\.bui-collapse-header[\s\S]{0,320}height: auto !important/)
  assert.match(danmakuPanelStyles, /\.bui-collapse-body[\s\S]{0,320}display: block !important[\s\S]{0,180}flex: 1 1 0 !important/)
  assert.match(widescreen, /return String\(i18n\.global\.t\(key\)\)/)
  assert.doesNotMatch(widescreen, /i18n\.global\.t\(key, settings\.value\.language\)/)
  assert.doesNotMatch(widescreen, /startAfterPageLoad|loadFallbackTimer|clearLoadFallbackTimer/)
  assert.match(widescreen, /initVerticalVideoZoom\(\)/)
  assert.match(widescreen, /data-sidebar-position="left"\] \.bewly-widescreen-stage/)
  assert.match(widescreen, /titleNotice: \[[\s\S]{0,80}'\.video-argue'/)
  assert.match(widescreen, /titleNoticeSlot: HTMLElement/)
  assert.match(widescreen, /function syncSidebarTitleNotice\(currentState: BewlyWidescreenState\)/)
  assert.match(widescreen, /currentState\.videoInfoData\?\.title\?\.trim\(\) \|\| getTitleText\(\)/)
  assert.match(widescreen, /currentState\.videoInfoData\?\.argue_info\?\.argue_msg/)
  assert.match(widescreen, /syncSidebarTitleNotice\(currentState\)/)
  const widescreenTitleStyles = widescreen.slice(
    widescreen.indexOf('.bewly-widescreen-title {'),
    widescreen.indexOf('.bewly-widescreen-metadata-slot {'),
  )
  assert.match(widescreenTitleStyles, /display: block/)
  assert.match(widescreenTitleStyles, /overflow: visible/)
  assert.match(widescreenTitleStyles, /overflow-wrap: anywhere/)
  assert.doesNotMatch(widescreenTitleStyles, /line-clamp/)
  assert.match(widescreen, /className = 'bewly-widescreen-sidebar-resizer'/)
  assert.match(widescreen, /role', 'separator'/)
  assert.match(widescreen, /setPointerCapture\(event\.pointerId\)/)
  assert.match(widescreen, /resolveWidescreenSidebarResizeWidth/)
  assert.match(widescreen, /WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY/)
  assert.match(widescreen, /data-sidebar-resizing="true"/)
  assert.match(widescreen, /--bewly-widescreen-sidebar-resize-accent: var\(--bew-text-1, #fff\)/)
  assert.doesNotMatch(widescreen, /--bewly-widescreen-sidebar-resize-accent: var\(--Wh0/)
  assert.match(widescreen, /html:not\(\.dark\) #\$\{ROOT_ID\}[\s\S]{0,100}--bewly-widescreen-sidebar-resize-accent: var\(--bew-theme-color/)
  assert.match(widescreen, /data-sidebar-resizing="true"\] \.bewly-widescreen-sidebar[\s\S]{0,100}border-color: var\(--bewly-widescreen-sidebar-resize-accent\)/)
  assert.match(widescreen, /data-sidebar-resizing="true"\] \.bewly-widescreen-sidebar[\s\S]{0,180}border-width: var\(--bew-space-0-5, 2px\)/)
  assert.match(widescreen, /data-sidebar-resizing="true"\] \.bewly-widescreen-sidebar[\s\S]{0,320}color-mix\(in oklab, var\(--bewly-widescreen-sidebar-resize-accent\) 42%, transparent\)/)
  const sidebarInteractionSection = widescreen.slice(
    widescreen.indexOf('function setupSidebarInteractionTracking'),
    widescreen.indexOf('function setupSidebarToggleAutoHide'),
  )
  assert.match(sidebarInteractionSection, /root\.dataset\.sidebarHoverExpanded !== nextValue/)
  assert.match(sidebarInteractionSection, /window\.addEventListener\('pointermove', handlePointerMove/)
  assert.match(sidebarInteractionSection, /isWidescreenPlayerControlHoverRegion/)
  assert.match(sidebarInteractionSection, /pendingPointerPosition = \{ x: event\.clientX, y: event\.clientY, type: event\.pointerType \}/)
  assert.match(sidebarInteractionSection, /if \(!currentlyExpanded && pointerIsInPlayerControls\)/)
  assert.match(sidebarInteractionSection, /document\.documentElement\.addEventListener\('pointerleave', handlePointerLeave/)
  assert.doesNotMatch(sidebarInteractionSection, /root\.addEventListener\('pointermove'/)
  assert.match(sidebarInteractionSection, /clearCollapseTimer\(\)/)
  assert.match(sidebarInteractionSection, /releasePointerCapture/)
  assert.match(sidebarInteractionSection, /removeEventListener\('pointerdown', handleResizePointerDown\)/)
  assert.match(sidebarInteractionSection, /cancelAnimationFrame\(resizeFrame\)/)
  const applySidebarWidthSection = sidebarInteractionSection.slice(
    sidebarInteractionSection.indexOf('function applySidebarWidth'),
    sidebarInteractionSection.indexOf('function flushPendingSidebarWidth'),
  )
  assert.doesNotMatch(applySidebarWidthSection, /schedulePlayerResizeSync/)
  const finishResizeSection = sidebarInteractionSection.slice(
    sidebarInteractionSection.indexOf('function finishResize'),
    sidebarInteractionSection.indexOf('function handleResizeKeydown'),
  )
  assert.match(finishResizeSection, /schedulePlayerResizeSync\(currentState\)/)
  const sidebarToggleAutoHideSection = widescreen.slice(
    widescreen.indexOf('function setupSidebarToggleAutoHide'),
    widescreen.indexOf('function setupDomRefreshObserver'),
  )
  assert.match(sidebarToggleAutoHideSection, /playerEl\.addEventListener\('pointermove', showToggle/)
  assert.doesNotMatch(sidebarToggleAutoHideSection, /playerSlot\.addEventListener\('pointermove'/)
  const danmakuSurfaceMarker = '$' + '{DANMAKU_SURFACE_SELECTOR}'
  const danmakuSurfaceStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} {`),
    widescreen.indexOf(`${danmakuSurfaceMarker}::before`),
  )
  assert.match(danmakuSurfaceStyles, /position: absolute !important/)
  assert.match(danmakuSurfaceStyles, /bottom: 0 !important/)
  assert.match(danmakuSurfaceStyles, /height: var\(--bewly-widescreen-bottom-controls-height\) !important/)
  assert.match(danmakuSurfaceStyles, /width: 100% !important/)
  assert.match(danmakuSurfaceStyles, /z-index: 4 !important/)
  assert.match(danmakuSurfaceStyles, /padding: var\(--bew-space-2, 8px\) var\(--bew-space-8, 32px\) !important/)
  assert.match(danmakuSurfaceStyles, /background: transparent !important/)
  assert.match(danmakuSurfaceStyles, /backdrop-filter: none !important/)
  assert.match(danmakuSurfaceStyles, /isolation: auto !important/)
  assert.doesNotMatch(danmakuSurfaceStyles, /isolation: isolate/)
  assert.match(danmakuSurfaceStyles, /transform: none !important/)
  assert.match(danmakuSurfaceStyles, /will-change: auto/)
  assert.doesNotMatch(danmakuSurfaceStyles, /border-top: 1px solid var\(--bew-border-color\) !important/)
  assert.match(danmakuSurfaceStyles, /pointer-events: auto !important/)
  assert.match(widescreen, /const DANMAKU_GLASS_CLASS = 'bewly-widescreen-danmaku-glass'/)
  const danmakuSurfaceBackgroundStyles = widescreen.slice(
    widescreen.indexOf(`body.\${BODY_CLASS} .\${DANMAKU_GLASS_CLASS} {`),
    widescreen.indexOf(`#\${ROOT_ID}[data-player-controls-hidden="true"]`, widescreen.indexOf(`body.\${BODY_CLASS} .\${DANMAKU_GLASS_CLASS} {`)),
  )
  assert.match(danmakuSurfaceBackgroundStyles, /position: absolute !important/)
  assert.match(danmakuSurfaceBackgroundStyles, /right: 0 !important/)
  assert.match(danmakuSurfaceBackgroundStyles, /bottom: 0 !important/)
  assert.match(danmakuSurfaceBackgroundStyles, /left: 0 !important/)
  assert.match(danmakuSurfaceBackgroundStyles, /z-index: calc\(var\(--bew-z-popover\) - 1\) !important/)
  assert.match(danmakuSurfaceBackgroundStyles, /background: var\(--bewly-widescreen-danmaku-bar-bg\) !important/)
  assert.match(danmakuSurfaceBackgroundStyles, /border-top: 1px solid var\(--bew-border-color\) !important/)
  assert.match(danmakuSurfaceBackgroundStyles, /backdrop-filter: var\(--bew-filter-glass-1\) !important/)
  const hiddenGlassStyles = widescreen.slice(
    widescreen.indexOf(`body.\${BODY_CLASS}.\${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS} .\${DANMAKU_GLASS_CLASS}`),
    widescreen.indexOf(`#\${ROOT_ID} .bewly-widescreen-danmaku-dock {`),
  )
  assert.match(hiddenGlassStyles, /translate3d\(0, 100%, 0\)/)
  assert.match(widescreen, /host\.parentElement\?\.insertBefore\(glass, host\)/)
  assert.match(widescreen, /currentState\.danmakuGlass\?\.remove\(\)/)
  const danmakuDockStyles = widescreen.slice(
    widescreen.indexOf(`#\${ROOT_ID} .bewly-widescreen-danmaku-dock {`),
    widescreen.indexOf(`${danmakuSurfaceMarker}:empty`),
  )
  assert.match(danmakuDockStyles, /background: transparent/)
  assert.match(danmakuDockStyles, /pointer-events: none/)
  assert.match(widescreen, /const DANMAKU_SOURCE_CLASS = 'bewly-widescreen-danmaku-source'/)
  assert.match(widescreen, /const DANMAKU_SOURCE_HOST_CLASS = 'bewly-widescreen-danmaku-source-host'/)
  assert.match(widescreen, /\$\{DANMAKU_SURFACE_SELECTOR\}\.\$\{DANMAKU_SOURCE_HOST_CLASS\} \{[\s\S]{0,120}z-index: var\(--bew-z-popover\) !important/)
  const hiddenDanmakuSourceStyles = widescreen.slice(
    widescreen.indexOf(`body.\${BODY_CLASS}.\${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}\n      \${DANMAKU_SURFACE_SELECTOR}.\${DANMAKU_SOURCE_HOST_CLASS}`),
    widescreen.indexOf(`#\${ROOT_ID} .bewly-widescreen-danmaku-dock {`),
  )
  assert.match(hiddenDanmakuSourceStyles, /transform: translate3d\(0, 100%, 0\)/)
  assert.match(hiddenDanmakuSourceStyles, /pointer-events: none/)
  assert.match(widescreen, /\.bpx-player-control-wrap[\s\S]{0,260}bottom: var\(--bewly-widescreen-bottom-controls-height\) !important/)
  assert.match(widescreen, /body\.\$\{BODY_CLASS\}\.\$\{BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS\}[\s\S]{0,260}bottom: 0 !important/)
  assert.match(widescreen, /--bewly-widescreen-danmaku-bar-bg: var\(--bew-elevated-alt\)/)
  assert.doesNotMatch(widescreen, /--bewly-widescreen-danmaku-bar-bg: var\(--bew-content-solid/)
  assert.doesNotMatch(widescreen, /html\.dark\.oled-dark #\$\{ROOT_ID\}[\s\S]{0,160}--bewly-widescreen-danmaku-bar-bg/)
  const playerSlotStyles = widescreen.slice(
    widescreen.indexOf('.bewly-widescreen-player-slot {'),
    widescreen.indexOf('.bewly-widescreen-player-frame {'),
  )
  assert.match(playerSlotStyles, /isolation: isolate/)
  assert.match(playerSlotStyles, /z-index: 0/)
  assert.match(playerSlotStyles, /background: transparent/)
  assert.match(playerSlotStyles, /pointer-events: none/)
  const widescreenSidebarLayerStyles = widescreen.slice(
    widescreen.indexOf('.bewly-widescreen-sidebar {'),
    widescreen.indexOf('.bewly-widescreen-sidebar-resizer {'),
  )
  assert.match(widescreenSidebarLayerStyles, /z-index: 2/)
  const playerFrameStyles = widescreen.slice(
    widescreen.indexOf('.bewly-widescreen-player-frame {'),
    widescreen.indexOf('.bewly-widescreen-player-frame > *'),
  )
  assert.match(playerFrameStyles, /height: auto/)
  assert.match(playerFrameStyles, /flex: 1 1 0/)
  const anchoredPlayerStyles = widescreen.slice(
    widescreen.indexOf(`body.\${BODY_CLASS} .\${NATIVE_PLAYER_CLASS} {`),
    widescreen.indexOf(`body.\${BODY_CLASS} .\${NATIVE_PLAYER_CLASS} > #bilibili-player`),
  )
  assert.match(anchoredPlayerStyles, /clip-path: none !important/)
  assert.doesNotMatch(anchoredPlayerStyles, /clip-path: inset/)
  assert.doesNotMatch(widescreen, /\.\$\{NATIVE_PLAYER_CLASS\}\.player-wrap[\s\S]{0,100}clip-path: inset/)
  assert.doesNotMatch(widescreen, /data-danmaku-dock-ready|--bewly-widescreen-danmaku-overlay-(?:bottom|gap|height)/)
  assert.doesNotMatch(widescreen, /function syncDanmakuOverlayGeometry/)
  const danmakuSendingBarStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-sending-bar`),
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(\n      .bpx-player-video-info`),
  )
  assert.match(danmakuSendingBarStyles, /background: transparent !important/)
  const danmakuModuleSurfaceStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(\n      .bpx-player-video-info`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-video-info`),
  )
  assert.match(danmakuModuleSurfaceStyles, /background: var\(--bew-popover-surface-background\) !important/)
  assert.match(danmakuModuleSurfaceStyles, /border: 1px solid var\(--bew-surface-border-color\) !important/)
  assert.match(danmakuModuleSurfaceStyles, /box-shadow: var\(--bew-popover-surface-shadow\) !important/)
  assert.match(danmakuModuleSurfaceStyles, /backdrop-filter: var\(--bew-filter-glass-1\)/)
  const danmakuViewerInfoStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-video-info`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-root`),
  )
  assert.match(danmakuViewerInfoStyles, /border-radius: var\(--bew-badge-radius\)/)
  assert.match(danmakuViewerInfoStyles, /corner-shape: var\(--bew-corner-shape-round\)/)
  assert.match(widescreen, /--bewly-widescreen-aux-controls-width/)
  assert.match(widescreen, /var\(--bew-control-height, 36px\) \* 3 \+ var\(--bew-space-2, 8px\) \* 3/)
  assert.match(widescreen, /body\.\$\{BODY_CLASS\} #bewly[\s\S]{0,180}z-index: calc\(var\(--bew-z-widescreen\) \+ 1\)/)
  assert.match(widescreen, /\.bpx-player-dm-root[\s\S]{0,220}margin-left: var\(--bewly-widescreen-aux-controls-width/)
  assert.match(sideBar, /useMutationObserver/)
  assert.match(sideBar, /widescreen-docked/)
  assert.match(sideBar, /flex-direction: row/)
  assert.match(sideBar, /--bewly-widescreen-aux-controls-left/)
  const danmakuIconControlStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(.bpx-player-dm-switch, .bpx-player-dm-setting)`),
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(.bpx-player-dm-switch, .bpx-player-dm-setting):hover`),
  )
  assert.match(danmakuIconControlStyles, /border-radius: 50%/)
  assert.match(danmakuIconControlStyles, /corner-shape: var\(--bew-corner-shape-round\)/)
  assert.match(danmakuIconControlStyles, /cursor: pointer/)
  assert.match(danmakuIconControlStyles, /position: relative !important/)
  assert.match(danmakuIconControlStyles, /margin: 0 !important/)
  assert.match(danmakuIconControlStyles, /background: var\(--bew-elevated\) !important/)
  assert.match(danmakuIconControlStyles, /box-shadow: var\(--bew-shadow-1\) !important/)
  assert.match(danmakuIconControlStyles, /transform var\(--bew-duration-moderate/)
  const danmakuIconHoverStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(.bpx-player-dm-switch, .bpx-player-dm-setting):hover`),
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(.bpx-player-dm-switch, .bpx-player-dm-setting):active`),
  )
  assert.match(danmakuIconHoverStyles, /box-shadow: var\(--bew-shadow-2\) !important/)
  assert.doesNotMatch(danmakuIconHoverStyles, /transform: scale/)
  assert.match(widescreen, /\.bpx-player-dm-switch:hover[\s\S]{0,120}transform: scale\(1\.1\)/)
  assert.match(widescreen, /\.bpx-player-dm-switch:active[\s\S]{0,120}transform: scale\(0\.9\)/)
  assert.match(widescreen, /:is\(\.bpx-player-dm-setting, \.bpx-player-video-btn-dm\):hover[\s\S]{0,160}transform: none !important/)
  assert.match(widescreen, /:is\(\.bpx-player-dm-setting, \.bpx-player-video-btn-dm\):active[\s\S]{0,160}transform: none !important/)
  assert.match(widescreen, /\.bpx-player-video-info \{[\s\S]{0,260}margin: 0 !important/)
  const danmakuIconContentStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-switch > *`),
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(.bpx-player-dm-switch, .bpx-player-dm-setting) svg`),
  )
  assert.match(danmakuIconContentStyles, /\.bpx-player-dm-setting > :not\(\.bpx-player-dm-setting-wrap, \.bpx-player-dm-setting-box\)/)
  assert.match(danmakuIconContentStyles, /\.bpx-player-dm-setting-box/)
  assert.match(danmakuIconContentStyles, /\.bpx-player-dm-setting-wrap/)
  assert.match(danmakuIconContentStyles, /position: absolute !important/)
  assert.match(danmakuIconContentStyles, /top: 50% !important/)
  assert.match(danmakuIconContentStyles, /left: 50% !important/)
  assert.match(danmakuIconContentStyles, /translate: -50% -50% !important/)
  assert.match(danmakuIconContentStyles, /transform: none !important/)
  assert.match(danmakuIconContentStyles, /display: inline-flex !important/)
  assert.match(danmakuIconContentStyles, /align-items: center !important/)
  assert.match(danmakuIconContentStyles, /justify-content: center !important/)
  assert.match(danmakuIconContentStyles, /width: var\(--bew-icon-size-md, 20px\) !important/)
  assert.doesNotMatch(widescreen, /:is\(\.bpx-player-dm-switch, \.bpx-player-dm-setting\) > :not\(\.bpx-player-dm-setting-box\)/)
  assert.match(widescreen, /\.bpx-player-dm-switch \.bui-danmaku-switch-label[\s\S]{0,360}position: absolute !important[\s\S]{0,160}inset: 0 !important/)
  assert.match(widescreen, /\.bpx-player-dm-switch > \.bui-area[\s\S]{0,360}inset: 0 !important[\s\S]{0,160}width: 100% !important[\s\S]{0,120}height: 100% !important/)
  assert.match(widescreen, /\.bpx-player-dm-switch \.bui-danmaku-switch-input[\s\S]{0,360}inset: 0 !important[\s\S]{0,160}width: 100% !important[\s\S]{0,120}height: 100% !important/)
  assert.match(widescreen, /\.bpx-player-dm-switch :is\([\s\S]{0,240}\.bui-danmaku-switch-off[\s\S]{0,360}width: 100% !important[\s\S]{0,120}height: 100% !important/)
  assert.match(widescreen, /\.bpx-player-dm-switch :is\([\s\S]{0,240}\.bui-danmaku-switch-off[\s\S]{0,700}svg[\s\S]{0,280}top: 50% !important[\s\S]{0,120}left: 50% !important[\s\S]{0,160}translate: -50% -50% !important/)
  assert.match(widescreen, /\.bpx-player-dm-switch:has\(\.bui-danmaku-switch-input:focus-visible\)/)
  assert.doesNotMatch(widescreen, /:is\(\.bpx-player-dm-switch, \.bpx-player-dm-setting\):focus-within/)
  const danmakuSettingButtonGlassStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-setting {`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-setting::before`),
  )
  assert.match(danmakuSettingButtonGlassStyles, /backdrop-filter: none !important/)
  const danmakuSettingButtonGlassLayerStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-setting::before`),
    widescreen.indexOf(`${danmakuSurfaceMarker} :is(.bpx-player-dm-switch, .bpx-player-dm-setting) svg`),
  )
  assert.match(danmakuSettingButtonGlassLayerStyles, /inset: 0/)
  assert.match(danmakuSettingButtonGlassLayerStyles, /backdrop-filter: var\(--bew-filter-glass-1\)/)
  const danmakuInputbarStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-video-inputbar {`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-video-inputbar:focus-within`),
  )
  assert.match(danmakuInputbarStyles, /border-radius: var\(--bew-interactive-radius\)/)
  assert.match(danmakuInputbarStyles, /overflow: visible !important/)
  assert.match(danmakuInputbarStyles, /background: transparent !important/)
  assert.match(danmakuInputbarStyles, /backdrop-filter: none !important/)
  assert.match(widescreen, /\.bpx-player-video-inputbar::before[\s\S]{0,500}background: var\(--bew-popover-surface-background\) !important[\s\S]{0,240}backdrop-filter: var\(--bew-filter-glass-1\) !important/)
  assert.match(widescreen, /\.bpx-player-video-inputbar > \*[\s\S]{0,160}z-index: 1 !important/)
  assert.match(widescreen, /\.bpx-player-mode-selection-container[\s\S]{0,320}z-index: var\(--bew-z-popover\) !important/)
  assert.match(widescreen, /\.bpx-player-mode-selection-container[\s\S]{0,320}background: transparent !important/)
  assert.match(widescreen, /\.bpx-player-mode-selection-container \{[\s\S]{0,100}display: none !important/)
  assert.match(widescreen, /\.bpx-player-mode-selection-container\.active[\s\S]{0,80}display: block !important/)
  assert.match(widescreen, /\.bpx-player-mode-selection-panel[\s\S]{0,500}background: var\(--bew-elevated-alt\) !important[\s\S]{0,280}border-radius: var\(--bew-popover-radius\) !important/)
  assert.match(widescreen, /\.bpx-player-mode-selection-panel[\s\S]{0,700}backdrop-filter: var\(--bew-filter-glass-1\) !important/)
  const danmakuSendButtonStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-btn-send {`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-btn-send:hover`),
  )
  assert.match(danmakuSendButtonStyles, /background: var\(--bew-theme-color/)
  assert.match(danmakuSendButtonStyles, /display: inline-flex !important/)
  assert.match(danmakuSendButtonStyles, /align-items: center !important/)
  assert.match(danmakuSendButtonStyles, /justify-content: center !important/)
  const danmakuInputStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-input {`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-btn-send {`),
  )
  assert.match(danmakuInputStyles, /font-family: var\(--bew-font-family\) !important/)
  assert.match(danmakuInputStyles, /::placeholder[\s\S]{0,160}color: var\(--bew-text-3\) !important/)
  const danmakuSettingWrapStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-setting-wrap {`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-setting-box {`),
  )
  assert.match(danmakuSettingWrapStyles, /top: auto !important/)
  assert.match(danmakuSettingWrapStyles, /bottom: calc\(100% \+ var\(--bew-space-2, 8px\)\) !important/)
  assert.match(danmakuSettingWrapStyles, /left: 50% !important/)
  assert.match(danmakuSettingWrapStyles, /translate: -50% 0 !important/)
  assert.match(danmakuSettingWrapStyles, /max-width: calc\(100vw - var\(--bew-space-8, 32px\)\) !important/)
  assert.match(widescreen, /\.bpx-player-dm-setting-wrap \{[\s\S]{0,180}display: none !important/)
  assert.match(widescreen, /\.bpx-player-dm-setting\[aria-expanded="true"\] > \.bpx-player-dm-setting-wrap[\s\S]{0,80}display: block !important/)
  const danmakuSettingPanelStyles = widescreen.slice(
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-setting-box {`),
    widescreen.indexOf(`${danmakuSurfaceMarker} .bpx-player-dm-setting-box .bui-panel-wrap`),
  )
  assert.match(danmakuSettingPanelStyles, /background: var\(--bew-elevated-alt\) !important/)
  assert.match(danmakuSettingPanelStyles, /box-shadow: var\(--bew-popover-surface-shadow\) !important/)
  assert.match(danmakuSettingPanelStyles, /backdrop-filter: var\(--bew-filter-glass-1\)/)
  assert.match(danmakuSettingPanelStyles, /backdrop-filter: var\(--bew-filter-glass-1\) !important/)
  assert.match(danmakuSettingPanelStyles, /max-height: calc\(/)
  assert.match(danmakuSettingPanelStyles, /overflow-y: auto !important/)
  assert.doesNotMatch(danmakuSettingPanelStyles, /--bewly-widescreen-player-available-height/)
  assert.match(widescreen, /\.bpx-player-dm-setting-right \{[\s\S]{0,200}padding-top: var\(--bew-space-3, 12px\) !important/)
  assert.match(widescreen, /\.bpx-player-dm-setting-right-more \{[\s\S]{0,260}align-items: center !important[\s\S]{0,160}gap: var\(--bew-space-1, 4px\) !important/)
  assert.match(widescreen, /\.bpx-player-dm-setting-right-more > \.bpx-common-svg-icon[\s\S]{0,360}width: var\(--bew-icon-size-md, 20px\) !important[\s\S]{0,120}height: var\(--bew-icon-size-md, 20px\) !important/)
  assert.match(widescreen, /\.bpx-player-dm-setting-right-more-text[\s\S]{0,240}line-height: var\(--bew-line-height-control, 18px\) !important/)
  assert.match(widescreen, /\.bpx-player-dm-setting-left-block-content[\s\S]{0,220}height: var\(--bew-space-12, 48px\) !important[\s\S]{0,120}overflow: visible !important/)
  assert.match(widescreen, /\.bpx-player-dm-setting-left-block \{[\s\S]{0,100}overflow: visible !important/)
  assert.match(widescreen, /body\.\$\{BODY_CLASS\} \.bpx-player-tooltip-item[\s\S]{0,100}z-index: var\(--bew-z-hud\) !important/)
  const playlistToggleStyles = widescreen.slice(
    widescreen.indexOf('.bewly-widescreen-playlist-toggle {'),
    widescreen.indexOf('.bewly-widescreen-playlist-toggle[hidden]'),
  )
  assert.match(playlistToggleStyles, /min-height: var\(--bew-control-height, 36px\)/)
  assert.match(playlistToggleStyles, /border-radius: var\(--bew-interactive-radius\)/)
  assert.match(playlistToggleStyles, /font-size: var\(--bew-font-size-control, 13px\)/)
  assert.match(playlistToggleStyles, /width: auto !important/)
  assert.match(playlistToggleStyles, /var\(--bewly-widescreen-playlist-toggle-inset-start, 0px\)/)
  assert.match(playlistToggleStyles, /border: 0/)
  assert.doesNotMatch(playlistToggleStyles, /position: sticky|top: 0/)
  assert.match(widescreen, /episodeSection\.prepend\(currentState\.playlistToggleButton\)/)
  assert.match(widescreen, /\.is-episode-section-collapsed \.\$\{EPISODE_SECTION_CLASS\}[\s\S]{0,180}max-height: calc\(var\(--bew-control-height, 36px\) \+ var\(--bew-space-2, 8px\)\) !important/)
  const collapsedEpisodeStyles = widescreen.slice(
    widescreen.indexOf(`.is-episode-section-collapsed .\${EPISODE_SECTION_CLASS}`),
    widescreen.indexOf('.bewly-widescreen-panel .video-page-card-small'),
  )
  assert.doesNotMatch(collapsedEpisodeStyles, /opacity: 0|pointer-events: none/)
  assert.match(widescreen, /--bew-duration-moderate, 300ms/)
  assert.match(widescreen, /playlistToggleButton: HTMLButtonElement/)
  assert.match(widescreen, /playlistCollapsed: boolean/)
  assert.match(widescreen, /playlistToggleCleanup\?: \(\) => void/)
  assert.match(widescreen, /function setupPlaylistToggle/)
  assert.match(widescreen, /function syncPlaylistToggleButton/)
  assert.match(widescreen, /function syncPlaylistToggleInsets/)
  assert.match(widescreen, /--bewly-widescreen-playlist-toggle-inset-start/)
  assert.match(widescreen, /--bewly-widescreen-playlist-toggle-inset-end/)
  assert.match(widescreen, /playlistToggleButton\.setAttribute\('aria-expanded'/)
  assert.match(widescreen, /playlistToggleButton\.addEventListener\('click'/)
  assert.match(widescreen, /playlistToggleButton\.removeEventListener\('click'/)
  assert.match(widescreen, /syncEpisodeSectionMarker\(currentState\)/)
  assert.match(widescreen, /function syncNativePlayerControlVisibility\([\s\S]{0,80}currentState: BewlyWidescreenState/)
  assert.match(widescreen, /resolveWidescreenControlSurfaceState\(\{/)
  assert.match(widescreen, /bottomControlsHovered: currentState\.bottomControlsHovered/)
  assert.match(widescreen, /pointerInsidePlayer: currentState\.playerPointerInside/)
  assert.match(widescreen, /previousHidden: currentState\.root\.dataset\.playerControlsHidden !== 'false'/)
  assert.match(widescreen, /sidebarExpanded: isWidescreenSidebarExpanded\(currentState\)/)
  assert.match(widescreen, /dataset\.playerControlsReady = String\(ready\)/)
  const applyNowSection = widescreen.slice(
    widescreen.indexOf('function applyNow'),
    widescreen.indexOf('function clearReadyWait'),
  )
  assert.ok(
    applyNowSection.indexOf('syncNativePlayerControlVisibility(nextState)')
    < applyNowSection.indexOf('document.body.classList.add(BODY_CLASS)'),
  )
  assert.match(widescreen, /function forwardNativePlayerPointerActivity\(/)
  const pointerBridgeSection = widescreen.slice(
    widescreen.indexOf('function forwardNativePlayerPointerActivity'),
    widescreen.indexOf('function setupAspectObservers'),
  )
  assert.match(pointerBridgeSection, /if \(!event\.isTrusted \|\| \(!allowSidebarExpanded && isWidescreenSidebarExpanded\(currentState\)\)\)/)
  assert.match(pointerBridgeSection, /isWidescreenPlayerControlHoverRegion\(\{[\s\S]{0,180}playerBottom: rootRect\.bottom/)
  assert.match(pointerBridgeSection, /new PointerEvent\('pointermove'/)
  assert.match(pointerBridgeSection, /new MouseEvent\('mousemove'/)
  assert.match(pointerBridgeSection, /querySelector<HTMLElement>\('\.bpx-player-video-area'\) \?\? playerContainer/)
  assert.match(pointerBridgeSection, /allowSidebarExpanded = false/)
  assert.match(pointerBridgeSection, /!allowSidebarExpanded && isWidescreenSidebarExpanded\(currentState\)/)
  assert.match(widescreen, /window\.addEventListener\('pointermove', handleBottomPointerActivity, \{ passive: true \}\)/)
  assert.match(widescreen, /const handleBottomPointerActivity = \(event: PointerEvent\) => \{\s*if \(!event\.isTrusted\)/)
  assert.match(widescreen, /window\.removeEventListener\('pointermove', handleBottomPointerActivity\)/)
  assert.match(widescreen, /document\.documentElement\.addEventListener\('pointerleave', clearPlayerPointerState\)/)
  assert.match(widescreen, /document\.documentElement\.removeEventListener\('pointerleave', clearPlayerPointerState\)/)
  assert.match(widescreen, /playerPointerInside: false/)
  const sidebarHoverStateSection = widescreen.slice(
    widescreen.indexOf('function setHoverExpanded'),
    widescreen.indexOf('function collapseSidebar'),
  )
  assert.match(sidebarHoverStateSection, /syncNativePlayerControlVisibility\(currentState\)/)
  assert.match(widescreen, /bottomControlsHovered: false/)
  assert.match(widescreen, /dataset\.bottomControlsHovered = String\(hovered\)/)
  assert.match(widescreen, /isWidescreenBottomControlHoverRegion\(\{/)
  assert.match(widescreen, /const pointerInBottomControlTree = event\.composedPath\(\)\.some/)
  assert.match(widescreen, /currentState\.danmakuDock\.contains\(node\)/)
  assert.match(widescreen, /WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY/)
  assert.match(widescreen, /bottomControlsLeaveTimer/)
  assert.match(sidebarInteractionSection, /function handlePointerMove\(event: PointerEvent\) \{\s*if \(!event\.isTrusted\)/)
  assert.match(sidebarInteractionSection, /forwardNativePlayerPointerActivity\([\s\S]{0,200}true\)[\s\S]{0,160}setHoverExpanded\(false\)/)
  assert.doesNotMatch(sidebarInteractionSection, /bottomControlHandoffTimer|SIDEBAR_BOTTOM_CONTROL_HANDOFF_DELAY|clearBottomControlHandoffTimer/)
  assert.doesNotMatch(widescreen, /function setupDanmakuControlEventBridge|function withOriginalDanmakuEventRoot/)
  const danmakuSettingsToggleSection = widescreen.slice(
    widescreen.indexOf('function setupDanmakuSettingsClickToggle'),
    widescreen.indexOf('function syncDanmakuInputSource'),
  )
  assert.match(danmakuSettingsToggleSection, /currentPanel\.style\.display = nextPinned \? 'block' : 'none'/)
  assert.match(danmakuSettingsToggleSection, /function dispatchNativeSettingHover/)
  assert.match(danmakuSettingsToggleSection, /dispatchNativeSettingHover\(currentSetting, true\)/)
  assert.match(danmakuSettingsToggleSection, /let stylePinned = false/)
  assert.match(danmakuSettingsToggleSection, /currentPanel\?\.classList\.toggle\('active', nextPinned\)/)
  assert.match(danmakuSettingsToggleSection, /source\.addEventListener\('mouseover', handleStyleHover, true\)/)
  assert.match(danmakuSettingsToggleSection, /event\.stopImmediatePropagation\(\)/)
  assert.match(danmakuSettingsToggleSection, /source\.addEventListener\('click', handleClick, true\)/)
  assert.match(danmakuSettingsToggleSection, /document\.addEventListener\('click', handleOutsideClick, true\)/)
  assert.doesNotMatch(danmakuSettingsToggleSection, /blockSettingsHover/)
  const danmakuSourceSyncSection = widescreen.slice(
    widescreen.indexOf('function syncDanmakuInputSource'),
    widescreen.indexOf('function clearDanmakuActivation'),
  )
  assert.match(danmakuSourceSyncSection, /findFirst\(selectors\.danmakuInput, currentState\.playerEl\)/)
  assert.match(danmakuSourceSyncSection, /source\.classList\.add\(DANMAKU_SOURCE_CLASS\)/)
  assert.match(danmakuSourceSyncSection, /setupWidescreenDanmakuSemantics\(\s*source/)
  assert.doesNotMatch(danmakuSourceSyncSection, /moveNode\(|dispatchEvent\(new MouseEvent/)
  assert.match(widescreen, /currentState\.danmakuSemanticsSource\?\.classList\.remove\(DANMAKU_SOURCE_CLASS\)/)
  assert.match(widescreen, /dataset\.ctrlHidden === 'true'/)
  assert.match(widescreen, /dataset\.playerControlsHidden = String\(hidden\)/)
  assert.match(widescreen, /BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS/)
  assert.match(sideBar, /BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS/)
  assert.match(sideBar, /widescreenControlsHidden/)
  assert.match(sideBar, /widescreen-controls-hidden/)
  assert.match(sideBar, /translate3d\(0, calc\(100% \+ var\(--bew-space-2\)\), 0\)/)
  assert.match(widescreen, /@media \(max-width: \$\{MOBILE_BREAKPOINT\}px\)[\s\S]{0,900}\$\{DANMAKU_SURFACE_SELECTOR\}[\s\S]{0,180}padding-inline: var\(--bew-space-4, 16px\)/)
  assert.doesNotMatch(widescreen, /READY_RETRY_INTERVAL|sidebarExpansionMode|data-sidebar-mode|setSidebarMode/)
  const watchLaterScheduleSection = contentScript.slice(
    contentScript.indexOf('function scheduleAddWatchLaterButton'),
    contentScript.indexOf('// 初始化随机播放功能'),
  )
  assert.doesNotMatch(watchLaterScheduleSection, /setTimeout|scheduleDetachedTimer/)
  assert.match(watchLaterScheduleSection, /mountWatchLaterButtonWhenToolbarReady/)
  assert.match(watchLaterButton, /MutationObserver/)
  assert.match(watchLaterButton, /requestPending/)
  assert.match(watchLaterButton, /state\.isInWatchLater = previousState/)
  assert.match(watchLaterButton, /topBarStore\.userInfo\.mid !== accountId/)
  assert.match(watchLaterButton, /isWatchLaterAccountCurrent\(accountId, csrf\)/)
  assert.match(watchLaterButton, /mountedButtons/)
  assert.match(watchLaterButton, /toolbarLifecycleEventCleanup/)
  const watchLaterInitializationSection = watchLaterButton.slice(
    watchLaterButton.indexOf('async function initializeButtonState'),
    watchLaterButton.indexOf('async function toggleWatchLater'),
  )
  assert.match(watchLaterInitializationSection, /if \(!isExtensionContextInvalidatedError\(error\) && !isBilibiliRiskControl\(error\)\)/)
  assert.doesNotMatch(watchLaterButton, /setTimeout\([^)]*,\s*(?:500|1000)\)/)
  assert.equal(JSON.parse(tsconfig).compilerOptions.noImplicitAny, true)
  assert.match(about, /contributorsRemoteImageUrl = 'https:\/\/contrib\.rocks\/image\?repo=STERILITZIA02\/Bewly_Nocturne'/)
  assert.match(about, /contributorsImageUrl = ref\(getExtensionAssetUrl\('\/assets\/contributors\.svg'\)\)/)
  assert.match(about, /if \(!contributorRemoteFallbackUsed\) \{[\s\S]{0,140}contributorsImageUrl\.value = contributorsRemoteImageUrl/)
  assert.equal((about.match(/contributorRemoteFallbackUsed = true/g) ?? []).length, 1)
  assert.match(prepare, /\.cache\/bewly-nocturne\/contributors\.svg/)
}

function verifyStageRouteAndTopBarPolicies() {
  assert.deepEqual(resolveWidescreenAnchoredPlayerGeometry({
    centered: false,
    frameHeight: 900,
    frameLeft: 0,
    frameTop: 0,
    frameWidth: 1920,
    sidebarPosition: 'right',
    sidebarReservedWidth: 480,
  }), { height: 900, left: 0, top: 0, width: 1920 })
  assert.deepEqual(resolveWidescreenAnchoredPlayerGeometry({
    centered: true,
    frameHeight: 900,
    frameLeft: 10,
    frameTop: 20,
    frameWidth: 1920,
    sidebarPosition: 'right',
    sidebarReservedWidth: 480,
  }), { height: 900, left: 10, top: 20, width: 1440 })
  assert.deepEqual(resolveWidescreenAnchoredPlayerGeometry({
    centered: true,
    frameHeight: 900,
    frameLeft: 10,
    frameTop: 20,
    frameWidth: 1920,
    sidebarPosition: 'left',
    sidebarReservedWidth: 480,
  }), { height: 900, left: 490, top: 20, width: 1440 })
  assert.deepEqual(resolveWidescreenCenterGeometry({
    centerEnabled: true,
    compactLayout: true,
    horizontalLayout: true,
    viewportWidth: 3840,
    playerHeight: 900,
    visualAspect: 16 / 9,
    sidebarWidth: 460,
  }), { enabled: true, offset: 230, sideGap: 1120 })
  assert.equal(resolveWidescreenCenterGeometry({
    centerEnabled: true,
    compactLayout: true,
    horizontalLayout: true,
    viewportWidth: 1920,
    playerHeight: 900,
    visualAspect: 16 / 9,
    sidebarWidth: 460,
  }).enabled, false)
  assert.equal(resolveWidescreenCenterGeometry({
    centerEnabled: true,
    compactLayout: false,
    horizontalLayout: true,
    viewportWidth: 3840,
    playerHeight: 900,
    visualAspect: 16 / 9,
    sidebarWidth: 460,
  }).enabled, false)
  assert.equal(resolveWidescreenCenterGeometry({
    centerEnabled: true,
    compactLayout: true,
    horizontalLayout: false,
    viewportWidth: 720,
    playerHeight: 400,
    visualAspect: 1,
    sidebarWidth: 720,
  }).enabled, false)

  assert.equal(isTopicPage('https://www.bilibili.com/v/topic/detail?topic_id=123'), true)
  assert.equal(isTopicPage('https://bilibili.com/v/topic/detail?topic_id=456#feed'), true)
  assert.equal(isTopicPage('https://www.bilibili.com/v/topic'), false)
  assert.equal(isTopicPage('https://www.bilibili.com/v/topic/detail/123'), false)
  assert.equal(isTopicPage('https://example.com/v/topic/detail?topic_id=123'), false)

  const effectiveSources: Array<[Parameters<typeof resolveEffectiveTopBarSource>[0], boolean, EffectiveTopBarSource]> = [
    ['bewly', true, 'bewly'],
    ['original', false, 'bilibili-native'],
    ['custom', false, 'bewly'],
    ['custom', true, 'bilibili-native'],
  ]
  for (const [pageMode, customNative, expected] of effectiveSources)
    assert.equal(resolveEffectiveTopBarSource(pageMode, customNative), expected)

  const apiItems = [
    { id: 'new-video-a', bvid: 'BV1', type: 8 },
    { id: 'new-article', type: 64 },
    { id: 'new-video-a-collaborator', bvid: 'BV1', type: 8 },
    { id: 'old-video', bvid: 'BV2', type: 8 },
  ]
  assert.equal(
    countVisibleNewMomentItems(apiItems, apiItems, 3, item => item.bvid ?? null),
    2,
    'new-moment dots must follow the filtered API prefix while collaborative duplicates collapse',
  )
  assert.equal(
    countVisibleNewMomentItems(apiItems, apiItems.filter(item => item.type === 8), 3, item => item.bvid ?? null),
    1,
    'filtered articles must not shift the unread boundary onto old videos',
  )
}

function verifyUpstreamReliabilityPolicies() {
  const viewport = { top: 100, bottom: 700 }
  assert.equal(isSentinelWithinLoadThreshold(viewport, { top: 850, bottom: 851 }, 200), true)
  assert.equal(isSentinelWithinLoadThreshold(viewport, { top: 901, bottom: 902 }, 200), false)
  assert.equal(isSentinelWithinLoadThreshold(viewport, { top: 50, bottom: 99 }, 200), false)

  assert.equal(isActualHomepage('https://www.bilibili.com/'), true)
  assert.equal(isActualHomepage('https://www.bilibili.com/index.html?page=Home'), true)
  assert.equal(isActualHomepage('https://www.bilibili.com/?page=SearchResults&keyword=test'), false)
  assert.equal(isActualHomepage('https://www.bilibili.com/?page=History'), false)
  assert.equal(resolveSearchOpenAction('currentTab', 'https://www.bilibili.com/'), 'currentTab')
  assert.equal(resolveSearchOpenAction('currentTabIfNotHomepage', 'https://www.bilibili.com/'), 'newTab')
  assert.equal(resolveSearchOpenAction('currentTabIfNotHomepage', 'https://www.bilibili.com/?page=SearchResults&keyword=test'), 'currentTab')
  assert.equal(resolveSearchOpenAction('newTab', 'https://www.bilibili.com/?page=History'), 'newTab')
  assert.equal(resolveSearchOpenAction('background', 'https://www.bilibili.com/?page=History'), 'background')
  const pagedPluginSearchUrl = getPluginSearchResultsUrl('https://search.bilibili.com/video?keyword=test&page=3')
  assert.ok(pagedPluginSearchUrl)
  assert.equal(new URL(pagedPluginSearchUrl).searchParams.get('pn'), '3')
  assert.equal(getPluginSearchResultsUrl('https://search.bilibili.com/photo?keyword=test'), null)

  const userPluginSearchUrl = getPluginSearchResultsUrl('https://search.bilibili.com/upuser?keyword=test&page=3&order=fans&order_sort=1&user_type=2')
  assert.ok(userPluginSearchUrl)
  const userPluginSearchParams = new URL(userPluginSearchUrl).searchParams
  assert.equal(userPluginSearchParams.get('category'), 'user')
  assert.equal(userPluginSearchParams.get('user_order'), 'fans_desc')
  assert.equal(userPluginSearchParams.get('user_type'), '2')
  const nativeSearchUrl = new URL(buildNativeSearchUrl(userPluginSearchUrl))
  assert.equal(nativeSearchUrl.pathname, '/upuser')
  assert.equal(nativeSearchUrl.searchParams.get('page'), '3')
  assert.equal(nativeSearchUrl.searchParams.get('order'), 'fans')
  assert.equal(nativeSearchUrl.searchParams.get('order_sort'), '1')
  assert.equal(nativeSearchUrl.searchParams.get('user_type'), '2')

  assert.equal(resolveStableMomentKey({ id_str: 'dynamic-1', rid: 2 }, 'moment'), 'moment:api:dynamic-1')
  assert.equal(resolveStableMomentKey({ type: 8, rid: 2 }, 'moment'), 'moment:8:2')
  assert.equal(resolveStableMomentKey({ roomid: 7 }, 'live'), 'live:live:7')
  const compositeKey = resolveStableMomentKey({ title: 'same', pub_time: 'now' }, 'moment')
  assert.equal(resolveStableMomentKey({ title: 'same', pub_time: 'now' }, 'moment'), compositeKey)
  assert.notEqual(resolveStableMomentKey({ title: 'different', pub_time: 'now' }, 'moment'), compositeKey)
  assert.notEqual(
    resolveStableMomentKey({ title: 'same', desc: 'first', pub_time: 'now' }, 'moment'),
    resolveStableMomentKey({ title: 'same', desc: 'second', pub_time: 'now' }, 'moment'),
  )

  assert.equal(normalizeVideoCardCoverRatio(undefined, 40), 40)
  assert.equal(normalizeVideoCardCoverRatio(29, 40), 30)
  assert.equal(normalizeVideoCardCoverRatio(73, 40), 70)
  assert.equal(normalizeVideoCardCoverRatio(47, 40), 45)
}

async function verifyUpstreamReliabilityContracts() {
  const root = process.cwd()
  const [app, watchLater, input, comments, searchBar, searchHistoryProvider, searchNavigation, searchResults, contentScript, momentsPage, momentsPop, favoritesPop, videoCardGrid, videoCard, videoCardCover, videoCardSkeleton, topBarStyles, storage] = await Promise.all([
    readFile(`${root}/src/contentScripts/views/App.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/WatchLater/WatchLater.vue`, 'utf8'),
    readFile(`${root}/src/components/Input.vue`, 'utf8'),
    readFile(`${root}/src/styles/adaptedStyles/common/comments.scss`, 'utf8'),
    readFile(`${root}/src/components/SearchBar/SearchBar.vue`, 'utf8'),
    readFile(`${root}/src/components/SearchBar/searchHistoryProvider.ts`, 'utf8'),
    readFile(`${root}/src/utils/searchNavigation.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/SearchResults/SearchResults.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Moments/Moments.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/MomentsPop.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/FavoritesPop.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCardGrid.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCard.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/components/VideoCardCover.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCardSkeleton.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/styles/index.scss`, 'utf8'),
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
  ])
  const searchResultPageSources = await Promise.all([
    'AllSearchPage.vue',
    'ArticleSearchPage.vue',
    'BangumiSearchPage.vue',
    'LiveSearchPage.vue',
    'MediaFtSearchPage.vue',
    'UserSearchPage.vue',
    'VideoSearchPage.vue',
  ].map(file => readFile(`${root}/src/contentScripts/views/SearchResults/pages/${file}`, 'utf8')))
  const [adaptedStyles, topicStyles, topBarUrls, necessaryWatchers, topBar, removeTopBarStyles, bilibiliTopBar, bewlyWidescreen, screenshotControl, playerTooltip, videoPlayerStyles, topBarStore, topBarVisualConfig, searchCatalog, topBarHeader, variables, popoverCards, favoritesPopSource, historyPopSource, watchLaterPopSource, cmnCn, cmnTw, jyut, en] = await Promise.all([
    readFile(`${root}/src/styles/adaptedStyles/index.ts`, 'utf8'),
    readFile(`${root}/src/styles/adaptedStyles/pages/topicPage.scss`, 'utf8'),
    readFile(`${root}/src/components/TopBar/constants/urls.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/necessarySettingsWatchers.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/TopBar.vue`, 'utf8'),
    readFile(`${root}/src/styles/removeTopBar.scss`, 'utf8'),
    readFile(`${root}/src/utils/bilibiliTopBar.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/videoScreenshotControl.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/playerControlTooltip.ts`, 'utf8'),
    readFile(`${root}/src/styles/adaptedStyles/common/videoPlayer.scss`, 'utf8'),
    readFile(`${root}/src/stores/topBarStore.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/TopBar/TopBarVisualConfig.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/searchCatalog.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/TopBarHeader.vue`, 'utf8'),
    readFile(`${root}/src/styles/variables.scss`, 'utf8'),
    readFile(`${root}/src/components/TopBar/styles/popoverCards.scss`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/FavoritesPop.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/HistoryPop.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/WatchLaterPop.vue`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-CN.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-TW.yml`, 'utf8'),
    readFile(`${root}/src/_locales/jyut.yml`, 'utf8'),
    readFile(`${root}/src/_locales/en.yml`, 'utf8'),
  ])

  assert.match(app, /watch\([\s\S]{0,80}activatedPage\.value[\s\S]{0,700}scheduleLoadMoreSentinelCheck\(\)/)
  assert.match(app, /handleThrottledLoadMoreGeometryCheck\(\)/)
  assert.match(app, /const requestStarted = await handler\(\)[\s\S]{0,100}requestStarted === true[\s\S]{0,80}scheduleLoadMoreSentinelCheck\(\)/)
  assert.match(app, /pageParam \?\? \(isHomePage\(href\) \? getDefaultAppPage\(\) : null\)/)
  assert.match(app, /availablePage !== AppPage\.SearchResults[\s\S]{0,140}clearSearchParamsFromUrl\(\)/)
  assert.match(app, /isSentinelWithinLoadThreshold/)
  assert.match(watchLater, /handleReachBottom\.value === handleWatchLaterReachBottom/)
  assert.match(watchLater, /async function handleWatchLaterReachBottom\(\): Promise<boolean>[\s\S]{0,420}return getData\(\)/)
  assert.match(watchLater, /payload\.list\.every\(isValidWatchLaterItem\)/)
  assert.match(watchLater, /mergedList\.length >= payload\.count[\s\S]{0,80}!madeProgress/)
  assert.match(input, /w-inherit min-w-0 h-inherit/)
  assert.match(input, /\.prefix,[\s\S]{0,120}flex: 0 0 auto;[\s\S]{0,80}white-space: nowrap;/)
  assert.match(comments, /^\.bewly-design \{/)
  assert.match(comments, /&\.bewly-hide-comment-image-scrollbar/)
  assert.match(comments, /color: var\(--bew-on-theme-color\) !important;/)
  assert.match(searchBar, /function navigateToSearchResultPage\(rawKeyword: string\)/)
  assert.match(searchBar, /openSearchResults\(buildKeywordHref\(normalized\), \{ persistHistory \}\)/)
  assert.match(searchHistoryProvider, /let searchHistoryMutationQueue: Promise<void> = Promise\.resolve\(\)/)
  assert.match(searchHistoryProvider, /enqueueSearchHistoryMutation/)
  assert.match(searchHistoryProvider, /const confirmation = await this\.operate\('COLS_GET'\)[\s\S]{0,100}confirmation\?\.value !== value/)
  assert.match(searchNavigation, /if \(action === 'currentTab'\)[\s\S]{0,220}persistSearchHistory\(options\)[\s\S]{0,160}openSearchResultsInCurrentTab\(destination\)/)
  assert.match(searchResults, /const needsPageRestore = filters\.page > 1/)
  for (const searchResultPage of searchResultPageSources)
    assert.match(searchResultPage, /if \(paginationMode\.value === 'pagination'\)[\s\S]{0,180}updatePage\(page\)[\s\S]{0,80}return performSearch\(false\)/)
  assert.match(searchBar, /openSearchResults/)
  assert.doesNotMatch(searchBar, /async function navigateToSearchResultPage|window\.open|openLinkInBackground/)
  assert.doesNotMatch(searchNavigation, /dispatchEvent\(new Event\('pushstate'\)\)/)
  assert.match(contentScript, /openSearchResults\(pluginSearchResultsUrl\)/)
  assert.match(momentsPage, /<span\s+class="moments-up-list__fade moments-up-list__fade--prev"/)
  assert.doesNotMatch(momentsPage, /v-show="canScrollUpList(?:Left|Right)"\s+class="moments-up-list__fade/)
  assert.match(momentsPage, /\.moments-up-list__scroller \{[\s\S]{0,2500}scroll-padding-inline: var\(--bew-space-2\);/)
  assert.match(momentsPage, /\.moments-up-list__track \{[\s\S]{0,180}padding-block: 6px var\(--bew-space-1\);/)
  const momentsScrollerSection = momentsPage.slice(
    momentsPage.indexOf('.moments-up-list__scroller {'),
    momentsPage.indexOf('.moments-up-list__scroller::-webkit-scrollbar'),
  )
  assert.doesNotMatch(momentsScrollerSection, /^\s*padding-inline:/m)
  assert.match(momentsScrollerSection, /--moments-up-list-left-clear-mask:/)
  assert.match(momentsScrollerSection, /--moments-up-list-right-clear-mask:/)
  assert.match(momentsScrollerSection, /--moments-up-list-base-mask:/)
  const momentsFadeSection = momentsPage.slice(
    momentsPage.indexOf('.moments-up-list__fade {'),
    momentsPage.indexOf('.moments-up-list__arrow {'),
  )
  assert.match(momentsFadeSection, /width: calc\(var\(--bew-space-12\) \+ var\(--bew-space-12\) \+ var\(--bew-space-12\)\)/)
  assert.match(momentsFadeSection, /background: radial-gradient\([\s\S]{0,260}filter: var\(--bew-filter-glass-1\)/)
  assert.doesNotMatch(momentsFadeSection, /backdrop-filter:/)
  assert.match(momentsFadeSection, /left: calc\(0px - var\(--bew-space-12\) - var\(--bew-space-6\)\)/)
  assert.match(momentsFadeSection, /right: calc\(0px - var\(--bew-space-12\) - var\(--bew-space-6\)\)/)
  assert.match(momentsPop, /:key="moment\.id_str"/)
  assert.doesNotMatch(momentsPop, /:key="index"/)

  const refreshStart = favoritesPop.indexOf('function refreshFavoriteResources')
  const refreshSection = favoritesPop.slice(refreshStart, favoritesPop.indexOf('function changeCategory', refreshStart))
  assert.match(refreshSection, /getFavoriteResources\(true, true, 1\)/)
  assert.doesNotMatch(refreshSection, /favoriteResources\.length = 0/)
  assert.match(favoritesPop, /favoriteResources\.splice\(0, favoriteResources\.length, \.\.\.uniqueMedias\)/)
  assert.match(favoritesPop, /isLoadingCategories/)
  assert.match(favoritesPop, /if \(!data \|\| !\('medias' in data\)\)/)
  assert.match(favoritesPop, /rawMedias\.every\(isValidFavoriteResource\)/)

  assert.match(videoCardGrid, /--video-card-cover-max-width/)
  assert.match(videoCard, /max-width: var\(--video-card-cover-max-width, 400px\)/)
  assert.match(videoCardSkeleton, /flex: var\(--video-card-cover-flex, 50\) 1 0/)
  assert.match(videoCardSkeleton, /max-width: var\(--video-card-cover-max-width, 400px\)/)
  assert.match(videoCard, /--video-card-cover-flex/)
  assert.match(videoCard, /--video-card-info-flex/)
  assert.match(videoCard, /if \(viewCount <= 0\)[\s\S]{0,80}return durationTag \? \[durationTag\] : tags/)
  assert.match(videoCardCover, /\.video-card-cover-stats__items \{[\s\S]{0,260}flex: 1 1 0;[\s\S]{0,260}overflow: hidden;/)
  assert.match(videoCardCover, /\.video-card-cover-stats__item--duration \{[\s\S]{0,160}flex-shrink: 0;/)
  assert.doesNotMatch(videoCardCover, /@media \(min-width:.*cover-stat-danmaku/)
  assert.match(topBarStyles, /\.right-side-item \.login \{[\s\S]{0,400}height: var\(--bew-control-height\);/)
  assert.match(storage, /videoCardCoverRatioOneColumn: 50/)
  assert.match(storage, /record\.videoCardCoverRatioOneColumn = normalizeVideoCardCoverRatio/)
  assert.match(storage, /record\.videoCardCoverRatioTwoColumns = normalizeVideoCardCoverRatio/)

  assert.match(adaptedStyles, /const revision = \+\+styleSetupRevision/)
  assert.match(adaptedStyles, /revision === styleSetupRevision && window\.location\.href === currentUrl/)
  assert.ok(adaptedStyles.indexOf('clearRouteStyles()') < adaptedStyles.indexOf('await import(\'./pages/homePage.scss\')'))
  assert.match(adaptedStyles, /if \(!isCurrentSetup\(\)\)\s*return/)
  assert.match(adaptedStyles, /onRouteChange\(\(\{ href \}\) => \{[\s\S]{0,100}setupStyles\(href\)[\s\S]{0,40}\}, true\)/)
  assert.match(adaptedStyles, /export function stopAdaptedStyles\(\)[\s\S]{0,140}clearRouteStyles\(\)/)
  assert.doesNotMatch(adaptedStyles, /addEventListener\(['"](?:pushstate|replacestate|popstate|hashchange)/)
  assert.match(adaptedStyles, /else if \(isTopicPage\(currentUrl\)\)/)
  const routeCleanupSection = adaptedStyles.slice(
    adaptedStyles.indexOf('function clearRouteStyles'),
    adaptedStyles.indexOf('async function setupStyles'),
  )
  assert.doesNotMatch(routeCleanupSection, /drawer|remove-top-bar-without-placeholder/)
  assert.match(topicStyles, /html\.topicPage\.remove-top-bar:not\(\.remove-top-bar-without-placeholder\)/)
  assert.match(topicStyles, /#bili-header-container[\s\S]{0,80}display: none !important/)
  assert.match(topicStyles, /\.topic-detail__header[\s\S]{0,80}padding-top: var\(--bew-top-bar-height\) !important/)
  assert.match(topBarUrls, /v\(\?!\\\/topic\)/)
  assert.match(necessaryWatchers, /currentLocationHref,[\s\S]{0,300}isOriginalMomentsFeed && !showUserCard/)

  assert.match(topBar, /settingsStore\.getEffectiveTopBarSource\(\)/)
  assert.match(topBar, /configuredMode === VideoPageTopBarConfig\.ShowOnMouse[\s\S]{0,100}VideoPageTopBarConfig\.AlwaysShow/)
  assert.match(topBar, /syncOriginalVideoTopBarVisibility\(shouldShow\)/)
  assert.match(topBar, /settings\.value\.videoPageTopBarConfig !== VideoPageTopBarConfig\.ShowOnMouse/)
  assert.match(topBar, /clearOriginalVideoTopBarVisibility\(\)/)
  const topBarMountSection = topBar.slice(topBar.indexOf('onMounted(() =>'), topBar.indexOf('function handleVisibilityChange'))
  assert.ok(topBarMountSection.indexOf('setupScrollListeners()') < topBarMountSection.indexOf('await topBarStore.initData()'))
  assert.match(removeTopBarStyles, /\.bewly-original-video-top-bar-controlled[\s\S]{0,500}\.bewly-original-video-top-bar-hidden/)
  assert.doesNotMatch(removeTopBarStyles, /body > \.bili-header ~ #app \.bili-header/)
  assert.match(bilibiliTopBar, /const header = getNativeDocumentTopBar\(doc\)/)
  assert.match(bilibiliTopBar, /Keep Bilibili's Vue-owned header in its native application tree/)
  assert.match(bilibiliTopBar, /export function restorePreparedOriginalBilibiliTopBars/)
  assert.match(bilibiliTopBar, /topBarDocumentObservers\.get\(doc\)\?\.disconnect\(\)/)
  assert.match(bilibiliTopBar, /hoverHeaderCleanups\.get\(header\)\?\.\(\)/)
  assert.match(bilibiliTopBar, /\.bewly-bili-logo-entry, \.bewly-home-entry-arrow, \.bewly-bili-channel-panel, \[data-bewly-channel-icons\]/)
  assert.match(contentScript, /bewly-outer-top-bars-suppressed/)
  assert.match(contentScript, /restorePreparedOriginalBilibiliTopBars\(document\)/)
  assert.match(contentScript, /restoreOriginalBilibiliTopBarParent\(document\)/)
  assert.match(contentScript, /stopAdaptedStyles/)
  const styleFailureSection = contentScript.slice(
    contentScript.indexOf('const handleStyleFailure'),
    contentScript.indexOf('styleEl.addEventListener(\'load\'', contentScript.indexOf('const handleStyleFailure')),
  )
  assert.match(styleFailureSection, /disposeContentScriptRuntime\(\)/)
  assert.match(removeTopBarStyles, /\.bili-header > \.bili-header__bar/)
  const widescreenHeaderSection = bewlyWidescreen.slice(
    bewlyWidescreen.indexOf(`body.\${BODY_CLASS} .bili-header`),
    bewlyWidescreen.indexOf(`body.\${BODY_CLASS} .bpx-player-container`),
  )
  assert.doesNotMatch(widescreenHeaderSection, /#biliMainHeader|#bili-header-container/)

  const mixedMomentSection = topBarStore.slice(
    topBarStore.indexOf('// 联合投稿只会按 bvid'),
    topBarStore.indexOf('// 如果是第一次加载', topBarStore.indexOf('// 联合投稿只会按 bvid')),
  )
  assert.match(mixedMomentSection, /mergeCollaborativeVideos\(filteredItems\)/)
  assert.doesNotMatch(mixedMomentSection, /filter\(\(item: any\) => item\.type|mergedVideos|articles/)
  assert.match(topBarStore, /const requestGeneration = momentsRequestGeneration/)
  assert.match(topBarStore, /requestGeneration === momentsRequestGeneration/)
  assert.match(topBarStore, /const cursorAdvanced = offset !== requestOffset/)
  assert.match(topBarStore, /liveMoments\.length === 0/)
  assert.match(topBarStore, /isLoadingMomentsCount/)
  assert.match(topBarStore, /requestGeneration === momentsCountRequestGeneration/)
  assert.match(topBarStore, /countVisibleNewMomentItems\([\s\S]{0,180}extractBvid/)

  assert.match(topBarVisualConfig, /key: 'favorites',[\s\S]{0,120}supportsBadge: false/)
  assert.match(topBarVisualConfig, /key: 'history',[\s\S]{0,120}supportsBadge: false/)
  assert.match(storage, /key: 'favorites', visible: true, badgeType: 'none'/)
  assert.match(storage, /key: 'history', visible: true, badgeType: 'none'/)
  assert.match(storage, /unsupportedBadgeKeys[\s\S]{0,500}badgeType: unsupportedBadgeKeys\.has\(component\.key\) \? 'none'/)
  assert.match(searchCatalog, /\['moments', 'topbar\.moments'\],[\s\S]{0,100}\['watchLater',[\s\S]{0,100}\['notifications'/)
  assert.match(searchCatalog, /\['favorites', 'topbar\.favorites'\],[\s\S]{0,100}\['history',[\s\S]{0,300}keywordKeys: \['settings\.visibility'\]/)
  const gradientCondition = topBarHeader.match(/v-if="[^"]*useLinearGradientThemeColorBackground[^"]*"/)?.[0] ?? ''
  assert.doesNotMatch(gradientCondition, /forceWhiteIcon/)
  assert.match(gradientCondition, /disableFrostedGlass/)

  assert.match(variables, /--bew-media-pop-title-font-size: 14px/)
  assert.match(variables, /--bew-media-pop-title-line-height: 20px/)
  assert.match(variables, /--bew-media-pop-title-font-weight: var\(--bew-font-weight-regular\)/)
  assert.match(popoverCards, /\.popover-card__title[\s\S]{0,260}var\(--bew-media-pop-title-font-size\)[\s\S]{0,160}var\(--bew-media-pop-title-line-height\)/)
  assert.match(favoritesPopSource, /\.favorites-pop[\s\S]{0,120}width: 450px/)
  assert.match(historyPopSource, /\.history-pop[\s\S]{0,120}width: 380px/)
  assert.match(momentsPop, /\.moments-pop[\s\S]{0,120}width: 380px/)
  assert.match(watchLaterPopSource, /\.watchLater-pop[\s\S]{0,120}width: 380px/)

  assert.match(playerTooltip, /createPlayerControlTooltip/)
  assert.match(playerTooltip, /tooltip && tooltip\.textContent !== label/)
  assert.match(screenshotControl, /createPlayerControlTooltip/)
  assert.doesNotMatch(screenshotControl, /\.title\s*=/)
  assert.match(screenshotControl, /querySelectorAll<HTMLElement>\('\.bewly-video-screenshot-control'\)/)
  assert.match(screenshotControl, /settings\.value\.language/)
  assert.doesNotMatch(videoPlayerStyles, /bewly-widescreen-entry-control/)
  assert.match(videoPlayerStyles, /\.bewly-video-screenshot-control/)
  assert.match(videoPlayerStyles, /> \.bewly-player-tooltip[\s\S]{0,180}right: 0/)
  for (const locale of [cmnCn, cmnTw, jyut, en])
    assert.doesNotMatch(locale, /show_bewly_widescreen_button/)
}

async function verifyIncrementalInteractionContracts() {
  const root = process.cwd()
  const [
    commentPagination,
    injectScript,
    contextMenu,
    videoCardLogic,
    momentCard,
    topBarInteraction,
    topBar,
    aLink,
    widescreen,
    pageModeSwitcher,
    contentScript,
  ] = await Promise.all([
    readFile(`${root}/src/inject/commentReplyPagination.ts`, 'utf8'),
    readFile(`${root}/src/inject/index.ts`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/composables/useVideoCardLogic.ts`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCard.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/composables/useTopBarInteraction.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/TopBar.vue`, 'utf8'),
    readFile(`${root}/src/components/ALink.vue`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/composables/usePageModeSwitcher.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
  ])

  assert.doesNotMatch(injectScript, /container\.insertBefore\(renderer/)
  assert.doesNotMatch(injectScript, /function reorderCommentReplyRenderers/)
  assert.match(injectScript, /display: flex;[\s\S]{0,80}flex-direction: column;/)
  assert.match(injectScript, /order: var\(--bew-comment-reply-order, 0\)/)
  assert.match(injectScript, /--bew-comment-reply-order', String\(visualOrder\)/)
  assert.match(commentPagination, /if \(state\.expandAllPromise\)[\s\S]{0,80}return state\.expandAllPromise/)
  assert.match(commentPagination, /const expandAllTasks = new WeakMap/)
  assert.match(commentPagination, /expandAllTasks\.delete\(renderer\)/)
  assert.match(commentPagination, /if \(runningTask\)[\s\S]{0,40}return runningTask/)
  assert.match(commentPagination, /loadCommentReplyPagesSequentially/)
  assert.match(commentPagination, /idx: pageIndex/)
  assert.match(commentPagination, /state\.allRepliesExpanded = result\.completed/)
  assert.match(commentPagination, /state\.expandAllLoading \|\| state\.allRepliesExpanded\)[\s\S]{0,40}return \[\]/)
  assert.match(commentPagination, /shouldShowExpandAll\?:/)
  assert.match(commentPagination, /adapter\.shouldShowExpandAll\?\.\(renderer\) === false/)
  assert.match(injectScript, /function isInsideBewlyWidescreen/)
  assert.match(injectScript, /shouldShowExpandAll: renderer => !isInsideBewlyWidescreen\(renderer\)/)
  assert.match(injectScript, /expandAll: '展开全部回复'/)
  assert.match(injectScript, /expandAll: '展開全部回覆'/)
  assert.match(injectScript, /expandAll: 'Expand all replies'/)
  assert.doesNotMatch(injectScript, /bewly-comment-replies-skeleton|bew-comment-replies-mask-bg|bew-comment-replies-loading-animation/)
  assert.match(injectScript, /#spinner \{[\s\S]{0,420}position: relative !important;[\s\S]{0,420}display: grid;[\s\S]{0,420}min-height: var\(--bew-comment-replies-loading-height, var\(--bew-space-12, 48px\)\) !important;[\s\S]{0,420}background-color: transparent !important;/)
  assert.match(injectScript, /beforeUpdate\?: \(component: any\) => void/)
  assert.match(injectScript, /function captureCommentReplyMotion/)
  assert.match(injectScript, /function animateCommentReplyMotion/)
  assert.match(injectScript, /--bew-duration-moderate/)
  assert.match(injectScript, /--bew-ease-standard/)
  assert.match(injectScript, /target\.animate\(\[[\s\S]{0,260}height: `\$\{motionState\.fromHeight\}px`[\s\S]{0,260}height: `\$\{targetHeight\}px`/)
  const branchReplyMotionSection = injectScript.slice(
    injectScript.indexOf('function toggleCommentReplyTreeBranch'),
    injectScript.indexOf('function toggleCommentReplyTreeTail'),
  )
  const tailReplyMotionSection = injectScript.slice(
    injectScript.indexOf('function toggleCommentReplyTreeTail'),
    injectScript.indexOf('function createCommentReplyTreeTailElement'),
  )
  for (const section of [branchReplyMotionSection, tailReplyMotionSection]) {
    assert.match(section, /captureCommentReplyMotion\(component\)/)
    assert.match(section, /updateCommentReplyTree\(component\)/)
    assert.match(section, /animateCommentReplyMotion\(component\)/)
  }

  assert.match(contextMenu, /context-menu-container bew-popover-surface/)
  assert.doesNotMatch(contextMenu, /translateY\(-100%\)|--b-context-menu-glass|backdrop-filter/)
  assert.match(contextMenu, /window\.addEventListener\('resize', handleViewportResize\)/)
  assert.match(contextMenu, /window\.removeEventListener\('resize', handleViewportResize\)/)
  assert.match(contextMenu, /observedVisualViewport\?\.addEventListener\('resize', handleViewportResize\)/)
  assert.match(contextMenu, /observedVisualViewport\?\.removeEventListener\('resize', handleViewportResize\)/)
  assert.match(videoCardLogic, /bottom: position\.bottom[\s\S]{0,160}bottom right' : 'top right'/)
  assert.match(momentCard, /bottom: position\.bottom[\s\S]{0,160}bottom right' : 'top right'/)

  assert.match(topBarInteraction, /export function resetTopBarTransientInteraction\(\)/)
  assert.match(topBarInteraction, /controller\.triggerHovered = false/)
  assert.match(topBarInteraction, /controller\.popupHovered = false/)
  assert.match(topBarInteraction, /resetTopBarTransientInteraction\(\)[\s\S]{0,80}openLinkInBackground/)
  assert.match(topBar, /window\.addEventListener\('blur', resetTopBarTransientInteraction\)/)
  assert.match(topBar, /window\.removeEventListener\('blur', resetTopBarTransientInteraction\)/)
  assert.match(aLink, /action === 'newTab' \|\| action === 'background'[\s\S]{0,80}resetTopBarTransientInteraction\(\)/)

  assert.match(widescreen, /export function isBewlyWidescreenEngaged\(\)/)
  assert.match(widescreen, /enteringWidescreen \|\| waitingForLoad/)
  assert.match(widescreen, /exitBewlyWidescreen\(\{ userInitiated: true \}\)/)
  assert.doesNotMatch(widescreen, /pendingEscape|event\.key !== 'Escape'|event\.key === 'Escape'/)
  assert.match(widescreen, /event\.key\.toLowerCase\(\) === 'f'/)
  assert.match(widescreen, /addEventListener\('keydown', handleWidescreenKeydown, \{ capture: true \}\)/)
  assert.match(pageModeSwitcher, /if \(widescreenEngaged\.value\)/)
  assert.match(contentScript, /shouldSuppressWidescreenAutoEntry\(currentNavigationKey, userExitedWidescreenNavigationKey\)/)
  assert.match(contentScript, /detail\?\.action === 'exit'/)
  assert.doesNotMatch(contentScript, /TopBarModeSwitcher|showBewlyOrBiliTopBarSwitcher/)
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
  assert.match(sendSettingsSection, /postPageBridgeMessage\(window/)
  assert.match(sendSettingsSection, /\}, window\.location\.origin\)/)
  assert.doesNotMatch(sendSettingsSection, /JSON\.parse|JSON\.stringify|['"]\*['"]|window\.postMessage/)
  assert.match(contentScript, /matchesPageBridgeEvent\(event/)
  assert.ok(
    contentScript.indexOf('MAIN world 在 document_start 阶段发起握手')
    < contentScript.indexOf(`if (document.readyState !== 'loading')`),
  )
  assert.match(injectScript, /let currentSettings: PageSettingsPayload \| null/)
  assert.match(injectScript, /createPageSettingsPayload\(event\.data\.data\)/)
  assert.match(injectScript, /const targetOrigin = getPageBridgeTargetOrigin\(window\.location\.origin\)/)
  assert.match(injectScript, /origin: targetOrigin/)
  assert.match(injectScript, /postPageBridgeMessage\(window,[\s\S]{0,160}SETTINGS_REQUEST,[\s\S]{0,80}window\.location\.origin/)
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

async function verifyDrawerAndMomentsLayoutContracts() {
  assert.equal(isEligibleDrawerEscape({ key: 'Escape', repeat: false, isComposing: false }), true)
  assert.equal(isEligibleDrawerEscape({ key: 'Escape', repeat: true, isComposing: false }), false)
  assert.equal(isEligibleDrawerEscape({ key: 'Escape', repeat: false, isComposing: true }), false)
  assert.equal(isEligibleDrawerEscape({ key: 'Enter', repeat: false, isComposing: false }), false)

  const drawerEscapeBase = {
    active: true,
    defaultPrevented: false,
    propagationStopped: false,
    hadPriorityState: false,
    hasPriorityState: false,
    iframeHandled: false,
  }
  assert.equal(shouldHandleDrawerEscape(drawerEscapeBase), true)
  assert.equal(shouldHandleDrawerEscape({ ...drawerEscapeBase, defaultPrevented: true }), false)
  assert.equal(shouldHandleDrawerEscape({ ...drawerEscapeBase, propagationStopped: true }), false)
  assert.equal(shouldHandleDrawerEscape({ ...drawerEscapeBase, hadPriorityState: true }), false)
  assert.equal(shouldHandleDrawerEscape({ ...drawerEscapeBase, hasPriorityState: true }), false)
  assert.equal(shouldHandleDrawerEscape({ ...drawerEscapeBase, iframeHandled: true }), false)
  assert.equal(resolveDrawerEscapeBehavior('immediate', false), 'close')
  assert.equal(resolveDrawerEscapeBehavior('secondPress', false), 'arm-second-press')
  assert.equal(resolveDrawerEscapeBehavior('secondPress', true), 'close')
  assert.equal(resolveIframeEscapeAction({
    defaultPrevented: true,
    propagationStopped: false,
    hadPriorityState: false,
    hasPriorityState: false,
    editableActiveElement: false,
  }), 'handled')
  assert.equal(resolveIframeEscapeAction({
    defaultPrevented: false,
    propagationStopped: false,
    hadPriorityState: false,
    hasPriorityState: false,
    editableActiveElement: false,
  }), 'request-close')

  assert.deepEqual(resolveHorizontalScrollState({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 400 }), {
    canScrollLeft: false,
    canScrollRight: true,
  })
  assert.equal(resolveHorizontalScrollState({ scrollLeft: 1.9, scrollWidth: 1000, clientWidth: 400 }).canScrollLeft, false)
  assert.equal(resolveHorizontalScrollState({ scrollLeft: 2.1, scrollWidth: 1000, clientWidth: 400 }).canScrollLeft, true)
  assert.equal(resolveHorizontalScrollState({ scrollLeft: 598.1, scrollWidth: 1000, clientWidth: 400 }).canScrollRight, false)
  assert.equal(resolveHorizontalScrollState({ scrollLeft: 597.9, scrollWidth: 1000, clientWidth: 400 }).canScrollRight, true)
  assert.equal(resolveHorizontalScrollState({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 }).canScrollRight, false)

  assert.equal(resolveMomentGridColumnCount({ containerWidth: 1592, preferredColumns: 1, minCardWidth: 360, gap: 16 }), 1)
  assert.equal(resolveMomentGridColumnCount({ containerWidth: 1592, preferredColumns: 2, minCardWidth: 360, gap: 16 }), 2)
  assert.equal(resolveMomentGridColumnCount({ containerWidth: 1592, preferredColumns: 3, minCardWidth: 360, gap: 16 }), 3)
  assert.equal(resolveMomentGridColumnCount({ containerWidth: 800, preferredColumns: 3, minCardWidth: 360, gap: 16 }), 2)
  assert.equal(resolveMomentGridColumnCount({ containerWidth: 700, preferredColumns: 3, minCardWidth: 360, gap: 16 }), 1)
  assert.equal(resolveMomentCardWidth({ gridClientWidth: 1592, columns: 1, gap: 16 }), 1592)
  assert.equal(resolveMomentCardWidth({ gridClientWidth: 1592, columns: 2, gap: 16 }), 788)
  assert.equal(resolveMomentCardWidth({ gridClientWidth: 1592, columns: 3, gap: 16 }), 520)
  assert.equal(resolveVirtualSpacerSize(0, 16), 0)
  assert.equal(resolveVirtualSpacerSize(116, 16), 100)
  assert.equal(resolveVirtualSpacerSize(232, 16), 216)
  assert.equal(shouldShowMomentsSidebar({ layoutWidth: 999, sidebarWidth: 248, gap: 16, minMainWidth: 736, hasContent: true }), false)
  assert.equal(shouldShowMomentsSidebar({ layoutWidth: 1000, sidebarWidth: 248, gap: 16, minMainWidth: 736, hasContent: true }), true)

  const videoMoment = {
    additional: undefined,
    forward: undefined,
    images: ['cover'],
    isChargeExclusive: false,
    isLive: false,
    isVideo: true,
  }
  assert.equal(supportsWideMomentCardLayout(videoMoment), true)
  assert.equal(shouldUseWideMomentCardLayout(videoMoment, 879), false)
  assert.equal(shouldUseWideMomentCardLayout(videoMoment, 880), true)
  assert.equal(supportsWideMomentCardLayout({ ...videoMoment, isVideo: false, images: ['one'] }), true)
  assert.equal(supportsWideMomentCardLayout({ ...videoMoment, isVideo: false, images: ['one', 'two'] }), false)
  assert.equal(supportsWideMomentCardLayout({ ...videoMoment, images: ['cover', 'gallery'] }), false)
  assert.equal(supportsWideMomentCardLayout({ ...videoMoment, isChargeExclusive: true }), false)
  assert.equal(supportsWideMomentCardLayout({ ...videoMoment, additional: { isVote: true } }), false)

  const root = process.cwd()
  const [app, iframeDrawer, notificationsDrawer, contentScript, escapePriority, photoViewerDetector, moments, momentCard, photoViewer, randomPlay, widescreen] = await Promise.all([
    readFile(`${root}/src/contentScripts/views/App.vue`, 'utf8'),
    readFile(`${root}/src/components/IframeDrawer.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/NotificationsDrawer.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/utils/escapePriority.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/features/iframePhotoViewerDetector.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Moments/Moments.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCard.vue`, 'utf8'),
    readFile(`${root}/src/utils/photoViewer.ts`, 'utf8'),
    readFile(`${root}/src/utils/randomPlay.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
  ])
  assert.equal((iframeDrawer.match(/addEventListener\('keydown'/g) || []).length, 1)
  assert.equal((notificationsDrawer.match(/addEventListener\('keydown'/g) || []).length, 1)
  assert.doesNotMatch(notificationsDrawer, /@keydown="handleKeydown"/)
  assert.match(iframeDrawer, /window\.setTimeout\(\(\) => \{[\s\S]*event\.defaultPrevented[\s\S]*event\.cancelBubble/)
  assert.match(notificationsDrawer, /window\.setTimeout\(\(\) => \{[\s\S]*event\.defaultPrevented[\s\S]*event\.cancelBubble/)
  assert.match(iframeDrawer, /name="bewly-iframe-drawer"/)
  assert.match(contentScript, /window\.name === 'bewly-iframe-drawer'/)
  assert.match(escapePriority, /rect\.width > 0[\s\S]*rect\.height > 0/)
  assert.match(contentScript, /resolveIframeEscapeAction\([\s\S]*BEWLY_DRAWER_ESCAPE_HANDLED[\s\S]*BEWLY_DRAWER_CLOSE_REQUEST/)
  assert.match(photoViewer, /\.pswp\.pswp--open[\s\S]*\.photo-imager-container/)
  assert.match(photoViewerDetector, /cleanupIframePhotoViewerDetector\(\)[\s\S]*IFRAME_PHOTO_VIEWER_STATE[\s\S]*isOpen: false/)
  assert.match(app, /configuredUrl !== expectedUrl/)
  assert.match(app, /watch\(iframePageURL,[\s\S]*hideUIForIframePhotoViewer\.value = false/)
  assert.match(randomPlay, /event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)[\s\S]*stopNativePlaylistEditing\(\)/)
  assert.doesNotMatch(moments, /momentsContentStyle/)
  assert.match(moments, /moments-layout--with-sidebar/)
  assert.match(moments, /padding: var\(--bew-space-2\) 0 var\(--bew-space-12\)/)
  assert.match(moments, /grid-template-columns: var\(--bew-layout-moments-sidebar-width\) minmax\(0, 1fr\)/)
  assert.match(moments, /row-gap: var\(--bew-space-8\)/)
  assert.match(moments, /grid-template-columns:\s*repeat\(var\(--moments-columns\), minmax\(0, 1fr\)\)/)
  assert.match(moments, /class="moments-up-list__track"/)
  assert.match(moments, /'can-scroll-left': canScrollUpListLeft[\s\S]*'can-scroll-right': canScrollUpListRight/)
  assert.match(moments, /transition:\s*opacity 700ms var\(--bew-ease-standard\)/)
  assert.match(moments, /--moments-up-list-left-clear 700ms var\(--bew-ease-standard\)/)
  assert.match(moments, /@scroll="scheduleUpListStateUpdate"/)
  assert.match(moments, /upListResizeObserver\.observe\(upListTrackRef\.value\)/)
  assert.match(moments, /gridClientWidth = gridRef\.value\?\.clientWidth \|\| mainRailWidth/)
  assert.match(moments, /:style="momentsGridStyle"/)
  assert.match(moments, /resolveVirtualSpacerSize\(topPad, gap\)/)
  assert.match(moments, /clearMomentPresentationForRefresh\(items\)/)
  assert.match(moments, /reapplyMomentFiltersFromCache\([\s\S]*maybeLoadMoreNearBottom\(\)/)
  assert.match(momentCard, /moment-card--supports-wide-layout/)
  assert.match(momentCard, /moment-card--wide-single-image \.moment-card__gallery--1/)
  assert.match(momentCard, /@container \(min-width: 880px\)/)
  assert.doesNotMatch(widescreen, /explicit priority ownership—not defaultPrevented alone|escapeArbitrationTimer/)
}

async function verifyAuditRemediationContracts() {
  const root = process.cwd()
  const [widescreen, nativeAdapter, moments, settingsComponent, anime, subscribedSeries, messaging, contentScript, viteConfig, globals] = await Promise.all([
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreenNative.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Moments/Moments.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/Settings.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Anime/Anime.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/Home/components/SubscribedSeries.vue`, 'utf8'),
    readFile(`${root}/src/utils/messaging.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/vite.config.ts`, 'utf8'),
    readFile(`${root}/src/global.d.ts`, 'utf8'),
  ])

  assert.match(widescreen, /\.bewly-widescreen-panel-danmaku \.bpx-docker/)
  assert.match(widescreen, /\.bpx-docker[\s\S]{0,420}height: 100% !important[\s\S]{0,180}overflow: hidden !important/)
  assert.match(widescreen, /\.bui-collapse-wrap[\s\S]{0,180}display: flex !important[\s\S]{0,120}flex-direction: column/)
  assert.match(widescreen, /\.bui-collapse-header[\s\S]{0,120}flex: 0 0 auto/)
  assert.match(widescreen, /hydratedTabs: Set<BewlyWidescreenTab>/)
  assert.match(widescreen, /function scheduleInitialPanelScrollReset/)
  assert.match(widescreen, /startSidebarHydration\(state\)/)
  assert.match(widescreen, /pointerTrackingFrame = requestAnimationFrame/)
  assert.match(widescreen, /setupWidescreenDanmakuSemantics/)
  assert.match(widescreen, /syncDanmakuInputSource\(currentState, true\)/)
  assert.match(widescreen, /currentState\.activeTab === 'comment' && !findCommentRoot/)
  assert.match(nativeAdapter, /role', 'button'/)
  assert.match(nativeAdapter, /event\.key !== 'Enter' && event\.key !== ' '/)
  assert.match(nativeAdapter, /removeEventListener\('keydown', handleKeydown\)/)
  assert.match(nativeAdapter, /restoreAttribute/)
  assert.match(nativeAdapter, /new MutationObserver\(refresh\)/)
  assert.match(nativeAdapter, /enhancedControls = new Map/)

  assert.match(moments, /const feedRequestFailed = ref\(false\)/)
  assert.match(moments, /clearMomentPresentationForRefresh\(\[\]\)/)
  assert.match(moments, /moments-page__error/)
  assert.match(moments, /feedRequestFailed\.value = reset \|\| moments\.value\.length === 0/)

  assert.match(settingsComponent, /role="dialog"/)
  assert.match(settingsComponent, /aria-modal="true"/)
  assert.match(settingsComponent, /function trapSettingsFocus/)
  assert.match(settingsComponent, /sibling\.inert = true/)
  assert.match(settingsComponent, /onDeactivated\(deactivateSettingsModal\)/)

  assert.match(anime, /requestGeneration/)
  assert.match(anime, /requestAccountId/)
  assert.match(anime, /isAnimeRequestCurrent/)
  assert.match(subscribedSeries, /requestAccountId/)
  assert.match(subscribedSeries, /isSubscribedSeriesRequestCurrent/)

  assert.match(messaging, /export function reportRuntimeFailure/)
  assert.match(messaging, /isExtensionContextInvalidatedError\(error\)/)
  assert.match(contentScript, /__BEWLY_BUILD_ID__/)
  assert.match(contentScript, /dataset\.bewlyBuildId/)
  assert.match(viteConfig, /__BEWLY_BUILD_ID__/)
  assert.match(globals, /__BEWLY_BUILD_ID__/)
}

async function verifyP4CleanupContracts() {
  const root = process.cwd()
  const [widescreen, videoPageStyles, pipWindow, iframeDrawer, lazyLoad, knipConfig, packageJson, prepareScript] = await Promise.all([
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/styles/adaptedStyles/pages/videoPage.scss`, 'utf8'),
    readFile(`${root}/src/components/PipWindow.vue`, 'utf8'),
    readFile(`${root}/src/components/IframeDrawer.vue`, 'utf8'),
    readFile(`${root}/src/utils/lazyLoad.ts`, 'utf8'),
    readFile(`${root}/knip.json`, 'utf8'),
    readFile(`${root}/package.json`, 'utf8'),
    readFile(`${root}/scripts/prepare.ts`, 'utf8'),
  ])

  const widescreenTabStyles = widescreen.slice(
    widescreen.indexOf(`#\${ROOT_ID} .bewly-widescreen-tab {`),
    widescreen.indexOf(`#\${ROOT_ID} .bewly-widescreen-tab.is-active::after`),
  )
  assert.match(widescreenTabStyles, /font-size: var\(--bew-font-size-control/)
  assert.match(widescreenTabStyles, /font-weight: var\(--bew-font-weight-semibold/)
  assert.doesNotMatch(widescreenTabStyles, /\.is-active \{[\s\S]*font-weight:/)
  for (const legacyStyle of [
    'padding: 8px 10px 8px',
    'font-size: 18px',
    'font-size: 14px',
    'font-size: 12px !important',
    'min-height: 160px',
  ]) {
    assert.doesNotMatch(widescreen, new RegExp(legacyStyle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.doesNotMatch(widescreen, /暂无简介/)

  assert.doesNotMatch(videoPageStyles, /transition:\s*all\b/)
  const favoriteDialogStyles = videoPageStyles.slice(
    videoPageStyles.indexOf('.group-list {'),
    videoPageStyles.indexOf('.video-argue .video-argue-inner.strong'),
  )
  assert.doesNotMatch(favoriteDialogStyles, /(?:font-size|font-weight|border-radius|padding|gap|margin(?:-\w+)?|(?:min-)?height|(?:min-)?width):\s*\d+(?:\.\d+)?px/)
  assert.doesNotMatch(favoriteDialogStyles, /\bcolor:\s*white\b|\bfill:\s*white\b/)
  assert.doesNotMatch(pipWindow, /TODO:|isEscPressed|onKeyStroke|<kbd>Esc<\/kbd>/)
  assert.doesNotMatch(iframeDrawer, /TODO: support shortcuts|Ctrl\+Alt\+T/)
  assert.doesNotMatch(lazyLoad, /TODO: handle error|copy with vscode/)

  const knip = JSON.parse(knipConfig) as {
    entry?: string[]
    ignoreExportsUsedInFile?: boolean
    rules?: Record<string, string>
  }
  assert.equal(knip.entry?.includes('.github/scripts/pr-policy-check.mjs'), false)
  assert.equal(knip.ignoreExportsUsedInFile, true)
  assert.notEqual(knip.rules?.exports, 'off')
  assert.notEqual(knip.rules?.types, 'off')
  assert.notEqual(knip.rules?.enumMembers, 'off')

  const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> }
  assert.match(pkg.scripts?.knip ?? '', /--treat-config-hints-as-errors/)
  assert.equal(pkg.scripts?.['dev:js'], 'pnpm run build:js --mode development')
  assert.equal(pkg.scripts?.['dev:inject'], 'pnpm run build:inject --mode development')
  Object.entries(pkg.scripts ?? {}).forEach(([name, command]) => {
    assert.doesNotMatch(command, /\bnpm run\b|\bnpx\b/, `script ${name} must use the pnpm toolchain`)
  })
  assert.doesNotMatch(prepareScript, /\bnpm run\b|\bnpx\b/)
  assert.match(prepareScript, /execFileSync\('pnpm', \['exec', 'esno'/)
  assert.doesNotMatch(prepareScript, /console\.error\([^\n]*,\s*error\)/)
}

async function verify() {
  verifyAccountScopes()
  verifyPlaybackRatePolicy()
  verifyWidescreenMutationPolicy()
  await verifyCommentReplyPaginationPolicy()
  verifyFloatingMenuPolicy()
  verifyWidescreenEngagementPolicy()
  verifyBilibiliApiErrorClassification()
  verifyWidescreenSidebarRevealPolicy()
  verifyRandomPlayRetryPolicy()
  verifyAppAuthTokenPolicy()
  await verifyAppAuthSingleFlight()
  verifyAppAuthorizationStateMachine()
  verifySettingsCloudSyncConflictPolicy()
  verifyMomentAdditionalAndFocusPolicies()
  verifyCanvasThemeResolution()
  verifyFilterRuleImport()
  verifySliderProgress()
  verifyDialogKeyboardPolicy()
  verifySettingsBootPolicy()
  verifySelectOptionKeys()
  await verifyImmediateDomQuery()
  verifyContainedImageSize()
  await verifyStorageScopeLifecycle()
  await verifyStorageDegradedRecoveryState()
  await verifyStorageSuppressionRecovery()
  verifyDockReorderPolicy()
  verifyPageSettingsPayload()
  verifyPageBridgeBoundary()
  verifyIframeBoundary()
  verifySearchHighlightSanitizer()
  verifyCommentRichText()
  await verifyMomentCommentTreeAndThread()
  await verifyMomentForwardContracts()
  verifyStageRouteAndTopBarPolicies()
  verifyUpstreamReliabilityPolicies()
  await verifyUpstreamReliabilityContracts()
  await verifyComponentContracts()
  await verifyAuthCloudMomentsContracts()
  await verifyLoadingContracts()
  await verifyP1Contracts()
  await verifyP2AccessibilityAndLocales()
  await verifyContributorCache()
  await verifyP2WidescreenControl()
  await verifyIncrementalInteractionContracts()
  await verifyDrawerAndMomentsLayoutContracts()
  await verifyAuditRemediationContracts()
  await verifyP4CleanupContracts()
  await verifySecurityContracts()
  console.log('Targeted fix verification passed.')
}

void verify()
