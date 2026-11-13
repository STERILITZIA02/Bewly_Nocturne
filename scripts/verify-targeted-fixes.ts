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
  createMomentDisclosureCache,
  createMomentForwardSubmissionController,
  createMomentTopicSearchController,
  insertMomentForwardEmoji,
  normalizeForwardCount,
  normalizeMomentForwardEmotePackages,
  normalizeMomentTopics,
  parseMomentForwardTokens,
  resolveForwardCountAfterSuccess,
  serializeMomentForwardContents,
  toggleMomentDisclosure,
} from '../src/components/MomentCard/momentForwardContent'
import type { DisplayMoment } from '../src/components/MomentCard/types'
import type { StorageLocalRuntime } from '../src/composables/useStorageLocal'
import { CONTENT_SCRIPT_PONG, isCurrentContentScriptPong } from '../src/constants/contentScript'
import { resolveDockCollapsedShellSize } from '../src/constants/dock'
import { getPageBridgeTargetOrigin, isPageBridgeMessage, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '../src/constants/pageBridge'
import { createForYouInitialDataCoordinator } from '../src/contentScripts/views/Home/forYouInitialData'
import { AppPage } from '../src/enums/appEnums'
import { applyCommentReplyInteractionOverrides, loadCommentReplyPagesSequentially, mergeCommentReplyLists } from '../src/inject/commentReplyPagination'
import { wakeNativeCommentLists } from '../src/inject/nativeCommentWake'
import { isAccountRequestCurrent } from '../src/utils/accountScope'
import { createBooleanSingleFlight, resolveAppAccessTokenFreshness, resolveAppAuthorizationState } from '../src/utils/appAuthTokenPolicy'
import { canCommitWidescreenLayout, interpolateWidescreenZoomFrame, resolveWidescreenContentWidth, resolveWidescreenEngagedState, resolveWidescreenSidebarHydrationPhase, resolveWidescreenZoomFrame, resolveWidescreenZoomVisual, shortenCommentDateText, shouldScheduleWidescreenRefresh, shouldSuppressWidescreenAutoEntry, WIDESCREEN_IDENTITY_ZOOM_FRAME } from '../src/utils/bewlyWidescreenPolicy'
import { isBilibiliRiskControl } from '../src/utils/bilibiliApiError'
import { parseCommentListParams, toCommentComposerReply } from '../src/utils/commentComposerBridge'
import { buildMomentCommentPermalink } from '../src/utils/commentPermalink'
import { buildCommentTree } from '../src/utils/commentTree'
import { resolveDialogKeyboardAction } from '../src/utils/dialogKeyboard'
import { resolveActiveDockItemPage } from '../src/utils/dockActiveItem'
import { isEligibleDrawerEscape, resolveDrawerEscapeBehavior, resolveIframeEscapeAction, shouldHandleDrawerEscape } from '../src/utils/drawerEscape'
import type { EffectiveTopBarSource } from '../src/utils/effectiveTopBarSource'
import { resolveEffectiveTopBarSource } from '../src/utils/effectiveTopBarSource'
import { getFavoriteFolderEditedAttr, isFavoriteFolderPrivate } from '../src/utils/favoriteFolder'
import { compileFilterRules, normalizeImportedFilterRules } from '../src/utils/filterRules'
import { computeFloatingMenuPosition } from '../src/utils/floatingMenu'
import { getListGridColumnCount } from '../src/utils/gridLayout'
import { isIframeDrawerHost } from '../src/utils/iframeDrawerHost'
import { shouldContinueIframeFocusRetry } from '../src/utils/iframeFocusRetryPolicy'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '../src/utils/iframeMessage'
import { resolveInterfaceLanguage } from '../src/utils/interfaceLanguagePolicy'
import { isSentinelWithinLoadThreshold } from '../src/utils/loadMoreSentinel'
import { isTopicPage } from '../src/utils/main'
import { classifyMomentAdditional, resolveMomentVoteStatus } from '../src/utils/momentAdditionalPolicy'
import { shouldUseWideMomentCardLayout, supportsWideMomentCardLayout } from '../src/utils/momentCardLayout'
import { createMomentCommentThreadController } from '../src/utils/momentCommentThread'
import { isMomentDescriptionOverflowing, resolveMomentTextSources } from '../src/utils/momentDescription'
import { resolveMomentHostFollowState } from '../src/utils/momentHostFollowState'
import { resolveStableMomentKey } from '../src/utils/momentKey'
import { resolveHorizontalScrollState, resolveMomentCardWidth, resolveMomentGridColumnCount, resolveVirtualSpacerSize } from '../src/utils/momentsLayout'
import { normalizeMomentRemoteUrl } from '../src/utils/momentUrl'
import { buildNativeSearchUrl } from '../src/utils/pageMode'
import { createPageSettingsPayload } from '../src/utils/pageSettingsProtocol'
import { applyConfiguredPlaybackRate, resolvePlaybackRateChange } from '../src/utils/playbackRate'
import { RANDOM_PLAY_VIDEO_RETRY_MAX, shouldRetryRandomPlayVideo } from '../src/utils/randomPlayRetry'
import { getRangeProgress } from '../src/utils/range'
import { sanitizeSearchHighlight } from '../src/utils/searchHighlight'
import { isActualHomepage, resolveSearchOpenAction } from '../src/utils/searchNavigationCore'
import { parseSearchShortcuts } from '../src/utils/searchShortcuts'
import { buildPluginSearchResultsUrl, EMPTY_SEARCH_VIDEO_FILTERS, getPluginSearchResultsUrl, readSearchVideoFilters } from '../src/utils/searchUrl'
import { createSelectOptionKey } from '../src/utils/selectOptionKey'
import { canStartSettingsDependentBoot, shouldShowBewlyBootOverlay } from '../src/utils/settingsBootPolicy'
import {
  classifySettingsCloudSyncSnapshot,
  createSettingsCloudSyncKey,
  resolveSettingsCloudSyncEnableDecision,
  SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
} from '../src/utils/settingsCloudSyncProtocol'
import { springTiming, stepCriticalSpring } from '../src/utils/spring'
import { CONTRIBUTORS_IMAGE_URL, prepareContributorsImage } from './contributorsCache'
import { playbackFunctions, readPlaybackSource } from './playbackSource'
import { FOR_YOU_SOURCE_FILES, MOMENTS_SOURCE_FILES, readSourceFiles } from './refactoredSources'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { verifyAuditOptimizations } from './verify-audit-optimizations'
import { verifyFunctionalAuditFixes } from './verify-functional-audit-fixes'
import { verifyMomentPlayerPorts } from './verify-moment-player-ports'

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

async function verifyForYouInitialDataLifecycle() {
  function createDeferred() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    return { promise, resolve }
  }

  let initialized = false
  let committedRequest = ''
  const requests: Array<{ generation: number, name: string, deferred: ReturnType<typeof createDeferred> }> = []
  const coordinator = createForYouInitialDataCoordinator({
    hasInitializedData: () => initialized,
    runInitialData: (generation) => {
      const request = {
        generation,
        name: String.fromCharCode(65 + requests.length),
        deferred: createDeferred(),
      }
      requests.push(request)
      return request.deferred.promise.then(() => {
        if (!coordinator.isCurrent(generation))
          return
        committedRequest = request.name
        initialized = true
      })
    },
  })

  coordinator.activate()
  const requestA = coordinator.ensure()
  coordinator.deactivate()
  coordinator.activate()
  const requestB = coordinator.ensure()
  assert.notEqual(requestA, requestB)
  assert.equal(requests.length, 2, 'reactivation must start a fresh initial request immediately')

  requests[0].deferred.resolve()
  await requestA
  assert.equal(committedRequest, '', 'a late request from the prior activation must not commit')
  requests[1].deferred.resolve()
  await requestB
  assert.equal(committedRequest, 'B')

  initialized = false
  const duplicateDeferred = createDeferred()
  let duplicateRequests = 0
  const duplicateCoordinator = createForYouInitialDataCoordinator({
    hasInitializedData: () => initialized,
    runInitialData: async () => {
      duplicateRequests += 1
      await duplicateDeferred.promise
    },
  })
  const mountedGeneration = duplicateCoordinator.activate()
  const mountedRequest = duplicateCoordinator.ensure()
  assert.equal(duplicateCoordinator.activate(), mountedGeneration)
  const activatedRequest = duplicateCoordinator.ensure()
  assert.equal(mountedRequest, activatedRequest)
  assert.equal(duplicateRequests, 1, 'mounted and activated hooks must share one initial request')
  duplicateDeferred.resolve()
  await mountedRequest
}

function verifyMomentDescriptionPolicies() {
  const base = {
    archiveText: '',
    articleText: '',
    commonText: '',
    dynamicText: '',
    isVideo: true,
    opusText: '',
  }

  assert.deepEqual(resolveMomentTextSources({ ...base, dynamicText: 'video copy' }), {
    descInherited: true,
    inheritedText: 'video copy',
    selfText: '',
    text: 'video copy',
  })
  assert.deepEqual(resolveMomentTextSources({ ...base, dynamicText: 'video copy', opusText: 'author post' }), {
    descInherited: false,
    inheritedText: 'video copy',
    selfText: 'author post',
    text: 'author post',
  })
  assert.equal(resolveMomentTextSources({ ...base, archiveText: 'archive', opusText: 'author post' }).text, 'author post')
  assert.deepEqual(resolveMomentTextSources({ ...base, dynamicText: 'image post', isVideo: false }), {
    descInherited: false,
    inheritedText: '',
    selfText: 'image post',
    text: 'image post',
  })

  assert.equal(isMomentDescriptionOverflowing({ clientHeight: 100, scrollHeight: 101 }), false)
  assert.equal(isMomentDescriptionOverflowing({ clientHeight: 100, scrollHeight: 102 }), true)
  assert.equal(isMomentDescriptionOverflowing({ clientHeight: 160, scrollHeight: 102 }), false)
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

  const interactionByRpid = new Map([
    ['2', { action: 1, like: 8 }],
  ])
  const pageOne = [{ rpid: '1', action: 0, like: 2 }, { rpid: '2', action: 0, like: 7 }]
  const pageTwo = [{ rpid: '2', action: 0, like: 7 }, { rpid: '3', action: 0, like: 1 }]
  applyCommentReplyInteractionOverrides(pageOne, interactionByRpid, reply => reply.rpid)
  applyCommentReplyInteractionOverrides(pageTwo, interactionByRpid, reply => reply.rpid)
  assert.deepEqual(pageOne[1], { rpid: '2', action: 1, like: 8 })
  assert.deepEqual(pageTwo[0], { rpid: '2', action: 1, like: 8 })

  const mergedWithLocalInteraction = mergeCommentReplyLists([pageOne, pageTwo], reply => reply.rpid)
  interactionByRpid.set('2', { action: 0, like: 7 })
  const collapsedList = mergedWithLocalInteraction.slice(0, 2)
  const pendingBeforeList = mergedWithLocalInteraction.slice()
  for (const list of [mergedWithLocalInteraction, collapsedList, pendingBeforeList, pageOne, pageTwo])
    applyCommentReplyInteractionOverrides(list, interactionByRpid, reply => reply.rpid)
  assert.equal(mergedWithLocalInteraction.find(reply => reply.rpid === '2')?.action, 0)
  assert.equal(collapsedList.find(reply => reply.rpid === '2')?.like, 7)
  assert.equal(pendingBeforeList.find(reply => reply.rpid === '2')?.action, 0)
}

function verifyIncrementalCorrectnessPolicies() {
  const currentPong = {
    type: CONTENT_SCRIPT_PONG,
    name: 'Bewly Nocturne',
    version: '0.1.1',
    runtimeUrl: 'chrome-extension://current/',
  }
  assert.equal(isCurrentContentScriptPong(currentPong, currentPong), true)
  assert.equal(isCurrentContentScriptPong({ ...currentPong, runtimeUrl: 'chrome-extension://old/' }, currentPong), false)
  assert.equal(isCurrentContentScriptPong({ ...currentPong, name: 'BewlyCat' }, currentPong), false)
  assert.equal(isCurrentContentScriptPong(CONTENT_SCRIPT_PONG, currentPong), false)

  const classNames = new Set(['bewly-iframe-drawer-host'])
  assert.equal(isIframeDrawerHost({ classList: { contains: value => classNames.has(value) } }), true)
  classNames.clear()
  assert.equal(isIframeDrawerHost({ classList: { contains: value => classNames.has(value) } }), false)

  assert.equal(isFavoriteFolderPrivate({ attr: 1 }), true)
  assert.equal(isFavoriteFolderPrivate({ attr: 2 }), false)
  assert.equal(getFavoriteFolderEditedAttr(3, true), 2)
  assert.equal(getFavoriteFolderEditedAttr(2, false), 3)

  assert.equal(resolveMomentHostFollowState({ code: 0, data: { 42: { attribute: 1 } } }, '42'), 'followed')
  assert.equal(resolveMomentHostFollowState({ code: 0, data: { 42: { attribute: 2 } } }, '42'), 'followed')
  assert.equal(resolveMomentHostFollowState({ code: 0, data: { 42: { attribute: 6 } } }, '42'), 'followed')
  assert.equal(resolveMomentHostFollowState({ code: 0, data: { 42: { attribute: 0 } } }, '42'), 'unfollowed')
  assert.equal(resolveMomentHostFollowState({ code: -1, data: { 42: { attribute: 0 } } }, '42'), 'unknown')
  assert.equal(resolveMomentHostFollowState({ code: 0, data: {} }, '42'), 'unknown')
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
  // Visible time only. The notice waits for an in-flight native request, then
  // hydration keeps watching so a late node clears it, and finally stops.
  const phase = (elapsed: number, nativeRequestPending = false, complete = false) => resolveWidescreenSidebarHydrationPhase({ complete, elapsed, nativeRequestPending })
  assert.equal(phase(0, false, true), 'complete')
  assert.equal(phase(70_000, true, true), 'complete')
  assert.equal(phase(11_999), 'hydrating')
  assert.equal(phase(12_000), 'recovering')
  assert.equal(phase(12_000, true), 'pending')
  assert.equal(phase(29_999, true), 'pending')
  assert.equal(phase(30_000, true), 'recovering')
  assert.equal(phase(59_999), 'recovering')
  assert.equal(phase(60_000), 'stopped')
  // A list waiting below the fold for its lazy-load hit is released exactly as
  // its observer would; only a reload request restarts a first page that spins.
  const released: string[] = []
  const reloaded: string[] = []
  const lazyList = { lazyLoadDP: { resolve: () => released.push('lazy') } as { resolve: () => void } | null, shadowRoot: { querySelector: () => ({}) }, reload: async () => reloaded.push('lazy') }
  const spinningList = { lazyLoadDP: null, shadowRoot: { querySelector: (selector: string) => selector === '#spinner-container' ? {} : null }, reload: async () => reloaded.push('spinning') }
  const loadedList = { lazyLoadDP: null, shadowRoot: { querySelector: () => null }, reload: async () => reloaded.push('loaded') }
  const previousDocument = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = { querySelectorAll: (selector: string) => selector === 'bili-comments' ? [lazyList, spinningList, loadedList] : [] }
  try {
    assert.equal(wakeNativeCommentLists({ reload: false }), 1)
    assert.deepEqual(released, ['lazy'])
    assert.equal(lazyList.lazyLoadDP, null)
    assert.deepEqual(reloaded, [])
    assert.equal(wakeNativeCommentLists({ reload: true }), 2)
    assert.deepEqual(reloaded, ['lazy', 'spinning'])
    assert.equal(wakeNativeCommentLists(null), 0)
  }
  finally {
    ;(globalThis as { document?: unknown }).document = previousDocument
  }
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

function verifyWidescreenZoomPolicy() {
  const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`)
  const nearRect = (actual: { left: number, top: number, width: number, height: number }, expected: typeof actual) => {
    near(actual.left, expected.left)
    near(actual.top, expected.top)
    near(actual.width, expected.width)
    near(actual.height, expected.height)
  }
  const widescreen = 16 / 9
  const card = { left: 24, top: 24, width: 864, height: 486 }
  const viewport = { left: 0, top: 0, width: 1440, height: 900 }
  const cardVisual = { rect: card, contentWidth: resolveWidescreenContentWidth(card, widescreen) }
  const viewportContentWidth = resolveWidescreenContentWidth(viewport, widescreen)
  near(viewportContentWidth, 1440)
  // Card → fill: the filled box starts with its video at the card's size and
  // its letterbox clipped, so the first frame is exactly the card.
  const grow = resolveWidescreenZoomFrame(cardVisual, viewport, viewportContentWidth)!
  near(grow.scale, 0.6)
  near(grow.clipX, 0)
  near(grow.clipY, 45)
  nearRect(resolveWidescreenZoomVisual(viewport, grow, viewportContentWidth).rect, card)
  // Fill → card: the card starts scaled to the filled video, centred, which is
  // where the letterboxed video was; the window letterbox is the backdrop's.
  const shrink = resolveWidescreenZoomFrame({ rect: viewport, contentWidth: viewportContentWidth }, card, cardVisual.contentWidth)!
  near(shrink.scale, 1440 / 864)
  assert.deepEqual([shrink.clipX, shrink.clipY], [0, 0])
  near(shrink.x + card.left, 0)
  near(shrink.y + card.top + (card.height * shrink.scale) / 2, 450)
  nearRect(resolveWidescreenZoomVisual(card, WIDESCREEN_IDENTITY_ZOOM_FRAME, cardVisual.contentWidth).rect, card)
  // A wide window pillarboxes instead; the clip moves to the sides.
  const ultrawide = { left: 0, top: 0, width: 2560, height: 1080 }
  const wide = resolveWidescreenZoomFrame(cardVisual, ultrawide, resolveWidescreenContentWidth(ultrawide, widescreen))!
  near(wide.scale, 0.45)
  near(wide.clipY, 0)
  near(wide.clipX, 320)
  // A portrait video keeps its on-screen size: matched by picture, not box.
  const portrait = 9 / 16
  const portraitFrame = resolveWidescreenZoomFrame(
    { rect: card, contentWidth: resolveWidescreenContentWidth(card, portrait) },
    viewport,
    resolveWidescreenContentWidth(viewport, portrait),
  )!
  near(resolveWidescreenContentWidth(viewport, portrait) * portraitFrame.scale, 486 * portrait)
  // A reversal starts from the interpolated frame on screen.
  const halfway = interpolateWidescreenZoomFrame(grow, WIDESCREEN_IDENTITY_ZOOM_FRAME, 0.5)
  near(halfway.scale, 0.8)
  near(halfway.clipY, 22.5)
  const halfwayVisual = resolveWidescreenZoomVisual(viewport, halfway, viewportContentWidth)
  near(halfwayVisual.contentWidth, 1152)
  const back = resolveWidescreenZoomFrame(halfwayVisual, card, cardVisual.contentWidth)!
  nearRect(resolveWidescreenZoomVisual(card, back, cardVisual.contentWidth).rect, {
    ...halfwayVisual.rect,
    // The card is shorter than the half-zoomed letterbox; the backdrop fills the rest.
    top: halfwayVisual.rect.top + (halfwayVisual.rect.height - card.height * back.scale) / 2,
    height: card.height * back.scale,
  })
  assert.deepEqual(interpolateWidescreenZoomFrame(grow, WIDESCREEN_IDENTITY_ZOOM_FRAME, 2), WIDESCREEN_IDENTITY_ZOOM_FRAME)
  assert.equal(resolveWidescreenZoomFrame(cardVisual, { ...viewport, width: 0 }, viewportContentWidth), null)
  assert.equal(resolveWidescreenZoomFrame({ ...cardVisual, rect: { ...card, height: Number.NaN } }, viewport, viewportContentWidth), null)
  assert.equal(resolveWidescreenZoomFrame(cardVisual, viewport, 0), null)
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
  const readingAndAudio = { playerAdjustmentEnabled: true, commentReplyBatchPages: 5, enableCommentReplyTreeContainer: false, commentReplyTreeContainerHeight: 480, localLoudnessEnabled: false, localLoudnessTarget: -18, localLoudnessStrength: 75 }
  const value = {
    ...readingAndAudio,
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
    ...readingAndAudio,
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
  for (const field of ['commentReplyBatchPages', 'commentReplyTreeContainerHeight', 'localLoudnessTarget', 'localLoudnessStrength'])
    assert.equal(createPageSettingsPayload({ ...value, [field]: Number.POSITIVE_INFINITY }), null)
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

  let src = 'https://www.bilibili.com/opus/123?inDrawer=true'
  const redirectedOrigins: string[] = []
  const redirectedWindow = {
    get location() { throw new DOMException('Cross-origin access', 'SecurityError') },
    postMessage: (_message: unknown, origin: string) => redirectedOrigins.push(origin),
  } as unknown as Window
  const redirectedFrame = { getAttribute: () => src, contentWindow: redirectedWindow }
  const ready = {
    source: redirectedWindow,
    origin: 'https://t.bilibili.com',
    data: { type: 'BEWLY_OPUS_LAYOUT_READY', href: 'https://t.bilibili.com/123' },
  }
  assert.equal(markIframeReadyForMessaging(redirectedFrame), false)
  assert.equal(postMessageToIframe(redirectedFrame, { type: 'BEWLY_OPUS_VIEWPORT' }), false)
  assert.deepEqual(redirectedOrigins, [])
  assert.equal(getIframeMessageData({ ...ready, source: {} as Window }, redirectedFrame), undefined)
  assert.equal(getIframeMessageData({ ...ready, origin: 'https://evil.example' }, redirectedFrame), undefined)
  assert.equal(getIframeMessageData({ ...ready, data: { ...ready.data, href: 'https://t.bilibili.com/456' } }, redirectedFrame), undefined)
  assert.deepEqual(getIframeMessageData(ready, redirectedFrame), ready.data)
  assert.equal(markIframeReadyForMessaging(redirectedFrame), true)
  assert.equal(postMessageToIframe(redirectedFrame, { type: 'BEWLY_OPUS_VIEWPORT' }), true)
  assert.deepEqual(redirectedOrigins, ['https://t.bilibili.com'])
  assert.deepEqual(getIframeMessageData({ ...ready, data: { type: 'BEWLY_DRAWER_CLOSE_REQUEST' } }, redirectedFrame), { type: 'BEWLY_DRAWER_CLOSE_REQUEST' })
  src = 'https://www.bilibili.com/opus/456'
  assert.equal(getIframeMessageData(ready, redirectedFrame), undefined)
  assert.equal(markIframeReadyForMessaging(redirectedFrame), false)
  assert.equal(postMessageToIframe(redirectedFrame, { type: 'BEWLY_OPUS_VIEWPORT' }), false)
  assert.equal(redirectedOrigins.length, 1)
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
  let staleSignal: AbortSignal | undefined
  let resolveStalePage!: (page: { items: MomentCommentItem[], hasMore: boolean, nextPage: number }) => void
  const staleController = createMomentCommentThreadController({
    getIdentity: () => identity,
    fetchPage: (_root, _page, signal) => new Promise((resolve) => {
      staleSignal = signal
      resolveStalePage = resolve
    }),
  })
  staleController.seed('root', [], 1)
  const staleLoad = staleController.loadMore('root')
  identity = 'account-b:1:102'
  assert.equal(staleController.getState('root'), undefined)
  assert.equal(staleSignal?.aborted, true)
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
  await staleFailure
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
  assert.deepEqual(serializeMomentForwardContents([{ type: 'mention', text: '@UP', mid: '42' }]), [{ raw_text: '@UP', type: 2, biz_id: '42' }])
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
  const disclosures = createMomentDisclosureCache()
  disclosures.set('test:moment', 'forward')
  assert.equal(disclosures.get('test:moment'), 'forward')
  assert.equal(createMomentDisclosureCache().get('test:moment'), 'none')
  disclosures.set('test:moment', 'none')
  assert.equal(disclosures.get('test:moment'), 'none')
  disclosures.set('test:moment', 'comments')
  disclosures.clear()
  assert.equal(disclosures.get('test:moment'), 'none')
}

async function verifyComponentContracts() {
  const root = process.cwd()
  const [
    dock,
    sidebar,
    slider,
    commentSection,
    forwardComposer,
    emojiPicker,
    topicPicker,
    momentsPage,
    momentApi,
    bootOverlay,
    layoutEdit,
    dockSettings,
    storage,
    searchCatalog,
  ] = await Promise.all([
    readFile(`${root}/src/components/Dock/Dock.vue`, 'utf8'),
    readFile(`${root}/src/components/SideBar/SideBar.vue`, 'utf8'),
    readFile(`${root}/src/components/Slider.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCommentSection.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentForwardComposer.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentForwardEmojiPicker.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentForwardTopicPicker.vue`, 'utf8'),
    readSourceFiles(MOMENTS_SOURCE_FILES),
    readFile(`${root}/src/background/messageListeners/api/moment.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/bewlyBootOverlay.ts`, 'utf8'),
    readFile(`${root}/src/logic/layoutEdit.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue`, 'utf8'),
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/searchCatalog.ts`, 'utf8'),
  ])

  assert.doesNotMatch(dock, /<Tooltip|import Tooltip/)
  assert.equal((dock.match(/class="dock-tab[ "]/g) ?? []).length, 4, 'tabs, theme, settings and collapse are all Dock tabs')
  assert.doesNotMatch(dock, /layout-edit-button|toggleLayoutEditMode|showLayoutEditButton/)
  assert.doesNotMatch(sidebar, /layout-edit-button|toggleLayoutEditMode|showLayoutEditButton/)
  assert.doesNotMatch(dockSettings, /showLayoutEditButton|show_layout_edit_button/)
  assert.doesNotMatch(storage, /showLayoutEditButton/)
  assert.doesNotMatch(layoutEdit, /navigation\.dock\.showLayoutEditButton|show_layout_edit_button/)
  assert.doesNotMatch(searchCatalog, /settings\.show_layout_edit_button/)

  assert.doesNotMatch(slider, /ref\(props\.modelValue\)/)
  assert.doesNotMatch(slider, /addEventListener\('input'/)

  assert.doesNotMatch(commentSection, /openLinkToNewTab/)
  assert.doesNotMatch(commentSection, /replyDraft|replyComposerRootId|<textarea|addMomentCommentReply/)
  assert.doesNotMatch(momentApi, /x\/v2\/reply\/add/)
  const disclosureStyle = await readFile(new URL('../src/styles/momentDisclosure.scss', import.meta.url), 'utf8')
  assert.doesNotMatch(disclosureStyle, /opacity:|transform:|ease-emphasized|grid-template-rows/)
  assert.doesNotMatch(forwardComposer, /\.moment-forward-composer \{[\s\S]{0,220}background: var\(--bew-fill-1\)/)
  assert.doesNotMatch(emojiPicker, /position: absolute/)
  assert.doesNotMatch(topicPicker, /position: absolute/)
  assert.doesNotMatch(emojiPicker, /backdrop-filter/)
  assert.doesNotMatch(topicPicker, /backdrop-filter/)
  const openMomentDetailSection = momentsPage.slice(
    momentsPage.indexOf('function openMomentDetail'),
    momentsPage.indexOf('function handleDetailIframeLoad'),
  )
  assert.ok(openMomentDetailSection.indexOf('openVideoLink') < openMomentDetailSection.indexOf('selectedMoment.value = moment'))
  assert.doesNotMatch(momentsPage, /async function prepareMomentCovers/)
  assert.doesNotMatch(momentsPage, /moments\.loading_more/, 'the tail shows only the ring')
  assert.doesNotMatch(momentsPage, /feedCache\./, 'the retired duplicate feed cache must not retain a second copy of moments')
  assert.doesNotMatch(momentsPage, /moment-image-viewer|detailImageViewer/, 'moment images open in the shared viewer')
  // The up-list has no container, edge fade or mask (see verify-sidebar-continuity).
  assert.doesNotMatch(momentsPage, /moments-up-list__fade|--moments-up-list-base-mask/)
  const momentsSidebar = await readFile(`${root}/src/contentScripts/views/Moments/MomentsSidebar.vue`, 'utf8')
  assert.doesNotMatch(momentsSidebar, /backdrop-filter/)
  assert.doesNotMatch(bootOverlay, /radial-gradient|box-shadow/)
  // History loading branches are exercised by the real component in verify-maintenance-integration.mjs.
}

async function verifyAuthCloudMomentsContracts() {
  const root = process.cwd()
  const [
    app,
    appAuthorizationDialog,
    necessarySettingsWatchers,
    userPanelPop,
    settingsHome,
    forYou,
    cloudBackground,
    moments,
    momentCard,
  ] = await Promise.all([
    readFile(`${root}/src/contentScripts/views/App.vue`, 'utf8'),
    readFile(`${root}/src/components/AppAuthorizationDialog.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/necessarySettingsWatchers.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/UserPanelPop.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/Home/Home.vue`, 'utf8'),
    readSourceFiles(FOR_YOU_SOURCE_FILES),
    readFile(`${root}/src/background/settingsCloudSync.ts`, 'utf8'),
    readSourceFiles(MOMENTS_SOURCE_FILES),
    readFile(`${root}/src/components/MomentCard/MomentCard.vue`, 'utf8'),
  ])

  assert.equal((app.match(/<AppAuthorizationDialog\b/g) || []).length, 1)
  assert.doesNotMatch(settingsHome, /<AppAuthorizationDialog\b|<QRCodeVue\b|authorizationTimer/)
  assert.doesNotMatch(forYou, /<AppAuthorizationDialog\b/)
  assert.doesNotMatch(appAuthorizationDialog, /setInterval/)
  assert.doesNotMatch(necessarySettingsWatchers, /appAuthTokens\.value\.accessToken\s*=\s*''/)
  assert.doesNotMatch(necessarySettingsWatchers, /Clear accessKey if not logged in/)
  assert.doesNotMatch(userPanelPop, /revokeAccessKey/)

  assert.doesNotMatch(cloudBackground, /remoteChanges\[field\] = normalizeSettingsCloudSyncEntry/)

  assert.doesNotMatch(moments, /setInterval/)
  assert.doesNotMatch(momentCard, /openImagePreview/, 'card images open the shared viewer from the media stage')
  assert.doesNotMatch(momentCard, /--moment-card-text-body-min-height|min-height: var\(--moment-card-text-body-min-height|moment-card--text[\s\S]{0,80}min-height: 240px/)
}

async function verifyLoadingContracts() {
  const root = process.cwd()
  const [
    loading,
    smoothLoading,
  ] = await Promise.all([
    readFile(`${root}/src/components/Loading.vue`, 'utf8'),
    readFile(`${root}/src/components/SmoothLoading.vue`, 'utf8'),
  ])

  for (const source of [loading, smoothLoading]) {
    assert.doesNotMatch(source, /loading\.gif|<img\b/)
  }
}

async function verifyP1Contracts() {
  const root = process.cwd()
  const [
    storageLocal,
    widescreen,
    player,
    authProvider,
    background,
    manifest,
    forYou,
    dislikeDialog,
    videoCardLogic,
    searchExperience,
  ] = await Promise.all([
    readFile(`${root}/src/composables/useStorageLocal.ts`, 'utf8'),
    readPlaybackSource(),
    readFile(`${root}/src/utils/player.ts`, 'utf8'),
    readFile(`${root}/src/utils/authProvider.ts`, 'utf8'),
    readFile(`${root}/src/background/index.ts`, 'utf8'),
    readFile(`${root}/src/manifest.ts`, 'utf8'),
    readSourceFiles(FOR_YOU_SOURCE_FILES),
    readFile(`${root}/src/components/VideoCard/VideoCardContextMenu/components/DislikeDialog.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/composables/useVideoCardLogic.ts`, 'utf8'),
    readFile(`${root}/src/logic/searchExperience.ts`, 'utf8'),
  ])

  assert.doesNotMatch(storageLocal, /suppressedWriteCount/)

  assert.doesNotMatch(widescreen, /currentState\.(?:colorProbe|themeObserver)/, 'action colours derive from shared theme tokens without a second probe or observer')

  assert.doesNotMatch(player, /autoExitFullscreenRetryTimer/)

  assert.doesNotMatch(background, /setupAppAuthScheduler/)
  // Cloud-quota recovery now needs a one-shot MV3 wakeup; App auth remains on demand.
  assert.match(manifest, /['"]alarms['"]/)
  assert.doesNotMatch(authProvider, /browser\.alarms|setInterval\(/)
  for (const source of [forYou, dislikeDialog, videoCardLogic]) {
    assert.doesNotMatch(source, /getTvSign/)
  }

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
  const [videoInfo, history, en, cn, tw, yue] = await Promise.all([
    readFile(`${root}/src/components/VideoCard/components/VideoCardInfo.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/History/History.vue`, 'utf8'),
    readFile(`${root}/src/_locales/en.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-CN.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-TW.yml`, 'utf8'),
    readFile(`${root}/src/_locales/jyut.yml`, 'utf8'),
  ])

  // Card actions live in the right-click menu; the info row has no more button.
  assert.doesNotMatch(videoInfo, /video-card__more-btn|aria-haspopup/)

  assert.doesNotMatch(history, /history-list-card__delete/)
  assert.doesNotMatch(history, /common\.remove/)

  const localeKeySets = [en, cn, tw, yue].map(collectLocaleKeys)
  for (const keys of localeKeySets.slice(1))
    assert.deepEqual([...keys].sort(), [...localeKeySets[0]].sort())
  for (const key of [
    'widescreen.enter',
    'widescreen.fill_window',
    'widescreen.exit_fill_window',
    'widescreen.comments_loading',
    'settings.maintenance.build_id',
    'search_bar.input_label',
    'video_card.operation.advanced_options',
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
  const [storage, contentScript, videoPlayback, playbackPage, maintenance, catalog, widescreen, watchLaterButton, tsconfig, about, prepare, sideBar, cmnCn, cmnTw, jyut, en, nativeAdaptation] = await Promise.all([
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/PluginComponentsAndPages/PlaybackPage/PlaybackPage.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/Advanced/Maintenance.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/searchCatalog.ts`, 'utf8'),
    readPlaybackSource(),
    readFile(`${root}/src/utils/watchLaterButton.ts`, 'utf8'),
    readFile(`${root}/tsconfig.json`, 'utf8'),
    readFile(`${root}/src/components/Settings/About/About.vue`, 'utf8'),
    readFile(`${root}/scripts/prepare.ts`, 'utf8'),
    readFile(`${root}/src/components/SideBar/SideBar.vue`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-CN.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-TW.yml`, 'utf8'),
    readFile(`${root}/src/_locales/jyut.yml`, 'utf8'),
    readFile(`${root}/src/_locales/en.yml`, 'utf8'),
    readFile(`${root}/docs/maintenance/widescreen-native-adaptation.md`, 'utf8'),
  ])

  assert.doesNotMatch(storage, /showBewlyWidescreenButton/)
  // The card layout retired the overlay sidebar's priority, centering and width.
  for (const field of ['bewlyWidescreenLayoutPriority', 'bewlyWidescreenCenterVideo', 'bewlyWidescreenSidebarWidth']) {
    assert.doesNotMatch(storage, new RegExp(field))
    assert.doesNotMatch(playbackPage, new RegExp(field))
    assert.doesNotMatch(maintenance, new RegExp(field))
  }
  assert.doesNotMatch(playbackPage, /settings\.showBewlyWidescreenButton/)
  assert.doesNotMatch(videoPlayback, /settings\.(?:defaultVideoPlayerMode|showBewlyWidescreenButton|bewlyWidescreenCenterVideo|bewlyWidescreenLayoutPriority)/)
  assert.doesNotMatch(videoPlayback, /sidebar_expansion_mode/)
  assert.doesNotMatch(catalog, /settings\.show_bewly_widescreen_button/)
  assert.doesNotMatch(catalog, /bewly_widescreen_(?:layout_priority|center_video)/)
  await assert.rejects(stat(`${root}/src/contentScripts/bewlyWidescreenControl.ts`))
  assert.doesNotMatch(contentScript, /BewlyWidescreenControl|bewlyWidescreenControl|bewly-widescreen-entry-control/)
  const settingsReadySection = contentScript.slice(
    contentScript.indexOf('void settingsReady.then(async'),
    contentScript.indexOf('function setupPluginSearchLinkNavigation'),
  )
  assert.ok(settingsReadySection.indexOf('await ensureInterfaceLanguage()') < settingsReadySection.indexOf('playerModeSettingsReady = true'))
  const modeControls = await loadSourceFunctions('../src/utils/playerMedia.ts', ['PLAYER_MODE_CONTROL_SELECTORS'], {})
  const hiddenControls = await loadSourceFunctions('../src/utils/bewlyWidescreen/constants.ts', ['HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS'], modeControls)
  for (const selector of ['.bpx-player-ctrl-wide', '.bpx-player-ctrl-web', '.bpx-player-ctrl-full', '.bilibili-player-video-btn-fullscreen', '.squirtle-video-fullscreen'])
    assert.ok(hiddenControls.HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS.includes(selector))
  assert.doesNotMatch(widescreen, /window\.innerHeight - rootRect\.bottom \+ \(dockRect\.height - controlHeight\)/)
  // Split layout: a flush, square video pane about half the window wide and
  // the column beside it with the info on top; no edge reveal, resizer,
  // centering or collapse toggle remains.
  for (const retired of [/data-sidebar-layout/, /data-sidebar-hover-expanded/, /data-centered/, /sidebar-resizer/, /sidebar-toggle/, /bewly-widescreen-close/, /--bewly-widescreen-sidebar-(?:user|full|reserved|panel)-width/, /center-offset/])
    assert.doesNotMatch(widescreen, retired)
  // The rounded card, its border, the info below it and the bleeding column are gone.
  for (const retired of [/--bewly-widescreen-card-radius/, /--bewly-widescreen-rail-bleed/, /--bewly-widescreen-rail-top/, /--bewly-widescreen-row-gap/, /--bewly-widescreen-column-gap/, /--bewly-widescreen-info-min-height/, /NATIVE_PLAYER_CLASS\}::after/, /readPlayerRadius/, /round \$\{radius\}/])
    assert.doesNotMatch(widescreen, retired)
  // Mode and zoom state never touch <body>: there a class change restyles the
  // whole Bilibili document at the start and end of every zoom.
  assert.doesNotMatch(widescreen, /CARD_MODE_CLASS|ZOOMING_CLASS|body\.classList\.(?:add|remove|toggle)\([^)]*(?:card|zoom)/i)
  // The rule's body, template placeholders included.
  assert.doesNotMatch(widescreen, /\.bewly-widescreen-sidebar::before/)
  assert.doesNotMatch(widescreen, /--bewly-widescreen-surface-bg/)
  assert.doesNotMatch(widescreen, /\.bpx-player-filter-wrap\.bpx-player-dm \{\s*display: flex !important;/)
  assert.doesNotMatch(widescreen, /visibility 0s linear/)
  // A native re-render after commit is re-anchored in the observer microtask,
  // before the replacement paints at its native place.
  // The tabs head the column. Info and playlists belong to the first panel.
  assert.doesNotMatch(widescreen, /READY_WAIT_TIMEOUT|BEWLY_WIDESCREEN_FAILED/)
  assert.doesNotMatch(contentScript, /BEWLY_WIDESCREEN_FAILED/)
  assert.doesNotMatch(widescreen, /moveNode\(player, playerFrame/)
  assert.doesNotMatch(widescreen, /hasLoadedImage|readyAssetHandler/)
  assert.doesNotMatch(widescreen, /restoreCommentPrewarm\(\)[\s\S]{0,160}applyNow\(pendingSidebarPosition\)/)
  // Current comment identity, layout selection and cancellation are exercised
  // through the production module in verify-player-maintenance.mjs.
  assert.doesNotMatch(widescreen, /skeleton-list-row|skeleton-list-avatar|panel-skeleton__row'[\s\S]{0,20}'comment'/)
  // Native loaders inside the shell become the same ring (MAIN).
  assert.doesNotMatch(widescreen, /\.bewly-widescreen-panel-danmaku \.bui-collapse-header[\s\S]{0,80}display: none !important/)
  assert.doesNotMatch(widescreen, /\.bewly-widescreen-panel-danmaku \.bpx-player-filter(?!-wrap)/)
  assert.doesNotMatch(widescreen, /--bew-comment-replies-loading-animation/)
  assert.doesNotMatch(widescreen, /i18n\.global\.t\(key, settings\.value\.language\)/)
  assert.doesNotMatch(widescreen, /startAfterPageLoad|loadFallbackTimer|clearLoadFallbackTimer/)
  assert.doesNotMatch(widescreen, /titleNotice|video-argue|argue_info/)
  // The fold moves the rail content below on its own layer (no per-frame
  // repaint of the tall list), and waits only on the folding parts.
  const widescreenShell = await readFile(new URL('../src/utils/bewlyWidescreen/shell.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(widescreenShell, /getAnimations\(\{ subtree: true \}\)/)
  assert.doesNotMatch(widescreen, /max-width: calc\(var\(--bew-space-12\) \* 5\) !important/)

  // Like / coin / collect / share roll between their count and their action
  // name on hover; the row's resize watch ignores the fold's height changes.
  // The comment panel docks the dynamic-card composer; native boxes stay
  // hidden and native "reply" clicks retarget it (see maintenance 05b).
  assert.doesNotMatch(widescreen, /COMMENT_COMPOSER_HOST_CLASS\} \{\s*position: sticky/)
  // Playback type ramp: one heading (the video title), section titles at
  // 15/22, reading text at body 15/24, controls 13/18, metadata as 12/16 captions.
  {
    const commentStyles = await readFile(new URL('../src/inject/index.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(commentStyles, /font-size: var\(--bew-font-size-heading\)/, 'only the video title is a heading')
  }
  assert.equal((widescreen.match(/border-radius: var\(--bew-surface-radius\) !important;\s*corner-shape: var\(--bew-corner-shape\);\s*box-shadow: var\(--bew-popover-surface-shadow\) !important;/g) ?? []).length, 1, 'the popover surface is declared once')
  // The flush pane has no card border, on the player or on the skeleton.
  assert.doesNotMatch(widescreen, /\.bewly-widescreen-loading-skeleton-player::after/)
  assert.doesNotMatch(widescreen, /bewly-widescreen-loading-skeleton-composer/)
  assert.deepEqual(parseCommentListParams('1,117354126115716'), { type: 1, oid: '117354126115716' })
  for (const invalid of [null, '', '0,1', '1,', '1,abc', 'x,1'])
    assert.equal(parseCommentListParams(invalid), null)
  const composerTarget = toCommentComposerReply({ rpid: 12, root: 0, oid: 34, type: 1, member: { mid: 5, uname: 'A' }, content: { message: 'm', pictures: [{ img_src: 'https://i0.hdslb.com/a.jpg' }, {}] }, replies: [{}] })
  assert.deepEqual(composerTarget, { rpid_str: '12', root_str: '0', parent_str: '0', oid_str: '34', type: 1, mid_str: '5', ctime: 0, member: { mid: '5', uname: 'A' }, content: { message: 'm', pictures: [{ img_src: 'https://i0.hdslb.com/a.jpg' }] } })
  assert.equal(toCommentComposerReply({ rpid_str: 'x', oid_str: '1', type: 1 }), null)
  assert.equal(toCommentComposerReply({ rpid_str: '1', oid_str: '1', type: 0 }), null)
  for (const type of [PAGE_BRIDGE_MESSAGE.COMMENT_COMPOSER_TARGET, PAGE_BRIDGE_MESSAGE.COMMENT_COMPOSER_INSERT]) {
    assert.equal(isPageBridgeMessage({ protocol: PAGE_BRIDGE_PROTOCOL, channelId: 'c', type, data: {} }), true)
    assert.equal(isPageBridgeMessage({ protocol: PAGE_BRIDGE_PROTOCOL, channelId: 'c', type }), false, 'composer messages carry data')
  }
  // The fill control replaces the hidden native wide / web / full buttons, and
  // the zoom keeps URL, player tree and a single native resize.
  // Bpx zeroes the control font size and sizes its icon box from an SVG; the
  // mask glyph needs both a box height and its own size or it collapses to 0.
  // The fill and listen controls share one rule (videoPlayer.scss).
  assert.doesNotMatch(widescreen, /\.bpx-player-subtitle-wrap\s*\{/)
  assert.doesNotMatch(widescreen, /will-change: bottom/)
  // The project no longer draws glow effects, including the progress bar.
  assert.doesNotMatch(widescreen, /--bewly-widescreen-progress-glow/)
  // Native SVG fill/stroke semantics are covered with matched DOM/CSS in verify-player-maintenance.mjs.
  assert.doesNotMatch(widescreen, /BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS/)
  assert.doesNotMatch(widescreen, /--bewly-widescreen-danmaku-bar-bg: var\(--bew-content-solid/)
  assert.match(cmnCn, /bewly_widescreen: Bewly播放页/)
  assert.match(cmnCn, /loading: 正在加载 Bewly 播放页…/)
  assert.doesNotMatch(cmnCn, /Bewly ?宽屏|宽屏模式/)
  assert.match(cmnTw, /bewly_widescreen: Bewly播放頁/)
  assert.match(cmnTw, /loading: 正在載入 Bewly 播放頁…/)
  assert.doesNotMatch(cmnTw, /Bewly ?寬螢幕|寬螢幕模式/)
  assert.match(jyut, /bewly_widescreen: Bewly播放頁/)
  assert.match(jyut, /loading: 載入緊 Bewly 播放頁…/)
  assert.doesNotMatch(jyut, /Bewly ?闊螢幕|闊螢幕模式/)
  assert.match(en, /bewly_widescreen: Bewly Playback Page/)
  assert.match(en, /loading: Loading Bewly Playback Page…/)
  assert.doesNotMatch(en, /Bewly Widescreen|Widescreen mode/)
  assert.doesNotMatch(widescreen, /Failed to load widescreen video information/)
  assert.doesNotMatch(nativeAdaptation, /Bewly Widescreen/)
  assert.doesNotMatch(widescreen, /\.\$\{NATIVE_PLAYER_CLASS\}\.player-wrap[\s\S]{0,100}clip-path: inset/)
  assert.doesNotMatch(widescreen, /data-danmaku-dock-ready|--bewly-widescreen-danmaku-overlay-(?:bottom|gap|height)/)
  assert.doesNotMatch(widescreen, /function syncDanmakuOverlayGeometry/)
  assert.doesNotMatch(widescreen, /\.bpx-player-dm-switch:hover[\s\S]{0,120}transform: scale/)
  assert.doesNotMatch(widescreen, /\.bpx-player-dm-switch:active[\s\S]{0,120}transform: scale/)
  assert.doesNotMatch(widescreen, /:is\(\.bpx-player-dm-switch, \.bpx-player-dm-setting\) > :not\(\.bpx-player-dm-setting-box\)/)
  assert.doesNotMatch(widescreen, /:is\(\.bpx-player-dm-switch, \.bpx-player-dm-setting\):focus-within/)
  // One fold control for the info card, a collection and each bangumi section.
  assert.doesNotMatch(widescreen, /bewly-widescreen-(?:playlist|info)-toggle/)
  assert.doesNotMatch(widescreen, /syncPlaylistToggleInsets|bewly-widescreen-playlist-toggle-inset/)
  assert.match(cmnCn, /player_feedback: 播放反馈/)
  assert.match(cmnTw, /player_feedback: 播放回饋/)
  assert.match(jyut, /player_feedback: 播放回報/)
  assert.match(en, /player_feedback: Playback feedback/)
  assert.doesNotMatch(widescreen, /\.bewly-widescreen-fallback-stat:hover/)
  assert.doesNotMatch(widescreen, /previousHidden/)
  assert.doesNotMatch(widescreen, /body\.\$\{BODY_CLASS\}[.:]/)
  assert.doesNotMatch(widescreen, /sidebarExpanded|isWidescreenSidebarExpanded/)
  const applyNowSection = playbackFunctions(widescreen, 'applyNow')
  assert.ok(
    applyNowSection.indexOf('syncNativePlayerControlVisibility(nextState)')
    < applyNowSection.indexOf('document.body.classList.add(BODY_CLASS)'),
  )
  assert.doesNotMatch(widescreen, /setupSidebarInteractionTracking|SidebarEdgeReveal|setupSidebarToggleAutoHide/)
  assert.doesNotMatch(widescreen, /function setupDanmakuControlEventBridge|function withOriginalDanmakuEventRoot/)
  assert.doesNotMatch(sideBar, /translate3d\(0, calc\(100% \+ var\(--bew-space-2\)\), 0\)/)
  assert.doesNotMatch(widescreen, /READY_RETRY_INTERVAL|sidebarExpansionMode|data-sidebar-mode|setSidebarMode/)
  assert.doesNotMatch(watchLaterButton, /setTimeout\([^)]*,\s*(?:500|1000)\)/)
  assert.equal(JSON.parse(tsconfig).compilerOptions.noImplicitAny, true)
  assert.equal((about.match(/contributorRemoteFallbackUsed = true/g) ?? []).length, 1)
  assert.match(prepare, /\.cache\/bewly-nocturne\/contributors\.svg/)
}

function verifyStageRouteAndTopBarPolicies() {
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

  // Search bar scope and pre-filters: a filtered combined search opens the video
  // results, carries through both result pages, and the native URL maps back.
  assert.equal(new URL(buildPluginSearchResultsUrl('k', 'live')).searchParams.get('category'), 'live')
  assert.equal(new URL(buildPluginSearchResultsUrl('k')).searchParams.has('category'), false)
  const filteredSearch = new URL(buildPluginSearchResultsUrl('k', 'all', { ...EMPTY_SEARCH_VIDEO_FILTERS, order: 'click', duration: 2, timeRange: 'week', tids: 17 }))
  assert.equal(filteredSearch.searchParams.get('category'), 'video')
  assert.deepEqual(readSearchVideoFilters(filteredSearch.searchParams), { order: 'click', duration: 2, timeRange: 'week', customStartDate: '', customEndDate: '', tids: 17 })
  assert.equal(new URL(buildPluginSearchResultsUrl('k', 'user', { ...EMPTY_SEARCH_VIDEO_FILTERS, order: 'click' })).searchParams.has('order'), false, 'video filters stay off other scopes')
  const nativeFiltered = new URL(buildNativeSearchUrl(filteredSearch.href))
  assert.equal(nativeFiltered.pathname, '/video')
  assert.equal(nativeFiltered.searchParams.get('order'), 'click')
  assert.equal(nativeFiltered.searchParams.get('duration'), '2')
  assert.equal(nativeFiltered.searchParams.get('tids'), '17')
  assert.ok(Number(nativeFiltered.searchParams.get('pubtime_end_s')) - Number(nativeFiltered.searchParams.get('pubtime_begin_s')) === 7 * 24 * 3600)
  const nativeToPlugin = new URL(getPluginSearchResultsUrl('https://search.bilibili.com/all?keyword=k&order=dm&duration=4&tids=3')!)
  assert.equal(nativeToPlugin.searchParams.get('category'), 'video')
  assert.equal(nativeToPlugin.searchParams.get('order'), 'dm')
  assert.equal(nativeToPlugin.searchParams.get('duration'), '4')
  assert.equal(nativeToPlugin.searchParams.get('tids'), '3')
  assert.equal(new URL(getPluginSearchResultsUrl('https://search.bilibili.com/pgc?keyword=k')!).searchParams.get('category'), 'media_ft')
  assert.equal(readSearchVideoFilters(new URLSearchParams('order=bogus&duration=9&time_range=custom')).timeRange, 'all')

  assert.deepEqual(parseSearchShortcuts('bv1GJ411x7h7').map(item => item.url), ['https://www.bilibili.com/video/BV1GJ411x7h7'])
  assert.deepEqual(parseSearchShortcuts('BV1Il411x7h7'), [], 'base58 has no I or l')
  assert.deepEqual(parseSearchShortcuts('ep12').map(item => item.url), ['https://www.bilibili.com/bangumi/play/ep12'])
  assert.deepEqual(parseSearchShortcuts('uid: 2').map(item => item.url), ['https://space.bilibili.com/2'])
  assert.deepEqual(parseSearchShortcuts('2').map(item => item.kind), ['space', 'live'])
  assert.deepEqual(parseSearchShortcuts('https://evil.example/b23.tv'), [])
  assert.deepEqual(parseSearchShortcuts('原神'), [])

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

  assert.equal(getListGridColumnCount('oneColumn', 1200, 20, 320), 1)
  assert.equal(getListGridColumnCount('twoColumns', 659, 20, 320), 1)
  assert.equal(getListGridColumnCount('twoColumns', 660, 20, 320), 2)
  assert.equal(getListGridColumnCount('twoColumns', 660, 24, 320), 1)
  assert.equal(getListGridColumnCount('twoColumns', 664, 24, 320), 2)
}

async function verifyUpstreamReliabilityContracts() {
  const root = process.cwd()
  const [watchLater, searchBar, searchNavigation, contentScript, momentsPop, videoCard, videoCardCover, storage] = await Promise.all([
    readFile(`${root}/src/contentScripts/views/WatchLater/WatchLater.vue`, 'utf8'),
    readFile(`${root}/src/components/SearchBar/SearchBar.vue`, 'utf8'),
    readFile(`${root}/src/utils/searchNavigation.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/MomentsPop.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCard.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/components/VideoCardCover.vue`, 'utf8'),
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
  ])
  const [adaptedStyles, topBar, removeTopBarStyles, screenshotControl, videoPlayerStyles, topBarHeader, cmnCn, cmnTw, jyut, en, topBarRight] = await Promise.all([
    readFile(`${root}/src/styles/adaptedStyles/index.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/TopBar.vue`, 'utf8'),
    readFile(`${root}/src/styles/removeTopBar.scss`, 'utf8'),
    readFile(`${root}/src/contentScripts/videoScreenshotControl.ts`, 'utf8'),
    readFile(`${root}/src/styles/adaptedStyles/common/videoPlayer.scss`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/TopBarHeader.vue`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-CN.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-TW.yml`, 'utf8'),
    readFile(`${root}/src/_locales/jyut.yml`, 'utf8'),
    readFile(`${root}/src/_locales/en.yml`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/TopBarRight.vue`, 'utf8'),
  ])

  const watchLaterLoadSection = watchLater.slice(
    watchLater.indexOf('async function getWatchLaterListByPage'),
    watchLater.indexOf('async function deleteWatchLaterItem'),
  )
  assert.ok(
    watchLaterLoadSection.indexOf('if (settleExtensionContextInvalidation(error))')
    < watchLaterLoadSection.indexOf('console.error(\'[WatchLater] Failed to load list:\''),
  )
  assert.doesNotMatch(searchNavigation, /\.then\([\s\S]*?openSearchResultsInCurrentTab/)
  assert.doesNotMatch(searchBar, /async function navigateToSearchResultPage|window\.open|openLinkInBackground/)
  assert.doesNotMatch(searchNavigation, /dispatchEvent\(new Event\('pushstate'\)\)/)
  assert.doesNotMatch(momentsPop, /:key="index"/)

  assert.doesNotMatch(videoCard, /highlightTags|durationTag/)
  // Covers carry no view/like/danmaku/duration overlay (album-art presentation).
  assert.doesNotMatch(videoCardCover, /video-card-cover-stats|cover-stat-/)
  assert.doesNotMatch(storage, /videoCardCoverRatio(?:One|Two)Column|autoSwitchListLayout/)

  assert.ok(adaptedStyles.indexOf('clearRouteStyles()') < adaptedStyles.indexOf('import(\'./pages/homePage.scss?inline\')'))
  assert.doesNotMatch(adaptedStyles, /addEventListener\(['"](?:pushstate|replacestate|popstate|hashchange)/)

  // The top bar no longer hides itself (scroll, video page modes or the native bar).
  assert.doesNotMatch(topBar, /VideoPageTopBarConfig|autoHideTopBar|setupScrollListeners|toggleTopBarVisible/)
  assert.doesNotMatch(removeTopBarStyles, /bewly-original-video-top-bar/)
  assert.doesNotMatch(removeTopBarStyles, /body > \.bili-header ~ #app \.bili-header/)
  assert.doesNotMatch(contentScript, /browser\.runtime\.getURL\('dist\/contentScripts\/style\.css'\)/)

  assert.doesNotMatch(topBarRight, /CountBadge|watchLaterCount/)
  // There is no bar: the header paints neither a gradient nor a solid band.
  assert.doesNotMatch(topBarHeader, /useLinearGradientThemeColorBackground|top-bar-header--solid|disableFrostedGlass/)

  assert.doesNotMatch(screenshotControl, /\.title\s*=/)
  assert.doesNotMatch(videoPlayerStyles, /bewly-widescreen-entry-control/)
  for (const locale of [cmnCn, cmnTw, jyut, en])
    assert.doesNotMatch(locale, /show_bewly_widescreen_button/)
}

async function verifyIncrementalInteractionContracts() {
  const root = process.cwd()
  const [
    injectScript,
    contextMenu,
    widescreen,
    contentScript,
  ] = await Promise.all([
    readFile(`${root}/src/inject/index.ts`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue`, 'utf8'),
    readPlaybackSource(),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
  ])

  assert.doesNotMatch(injectScript, /container\.insertBefore\(renderer/)
  assert.doesNotMatch(injectScript, /function reorderCommentReplyRenderers/)
  // Pagination budgets, cancellation and confirmed native writes are exercised
  // against the actual renderer adapter in verify-comment-reading.mjs.
  assert.doesNotMatch(injectScript, /bewly-comment-replies-skeleton|bew-comment-replies-mask-bg|bew-comment-replies-loading-animation/)

  // The card menu is shared frosted glass (global blur token) with edge blurs instead of arrows.
  assert.doesNotMatch(contextMenu, /translateY\(-100%\)|--b-context-menu-glass|scroll-indicator/)
  // The card menu opens at the pointer, so it grows from its left corner. Video
  // cards and moment covers share the placement.

  // Escape never leaves the Bewly page; it only returns a filled video to its card.
  assert.doesNotMatch(widescreen, /pendingEscape|event\.key !== 'Escape'/)
  assert.equal(widescreen.match(/event\.key === 'Escape'/g)?.length, 1)
  assert.doesNotMatch(contentScript, /TopBarModeSwitcher|showBewlyOrBiliTopBarSwitcher/)
}

async function verifySecurityContracts() {
  const root = process.cwd()
  const [contentScript, injectScript, allSearchPage, searchBar] = await Promise.all([
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/inject/index.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/SearchResults/pages/AllSearchPage.vue`, 'utf8'),
    readFile(`${root}/src/components/SearchBar/SearchBar.vue`, 'utf8'),
  ])

  assert.ok(
    contentScript.indexOf('MAIN world 在 document_start 阶段发起握手')
    < contentScript.indexOf(`if (document.readyState !== 'loading')`),
  )
  assert.doesNotMatch(injectScript, /data as Settings|enableCommentReplyTree\?:/)

  assert.doesNotMatch(allSearchPage, /v-html="item\.title"/)
  assert.doesNotMatch(searchBar, /DOMPurify\.sanitize\(item\.name\)/)
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
  const [iframeDrawer, moments, widescreen] = await Promise.all([
    readFile(`${root}/src/components/IframeDrawer.vue`, 'utf8'),
    readSourceFiles(MOMENTS_SOURCE_FILES),
    readPlaybackSource(),
  ])
  assert.equal((iframeDrawer.match(/addEventListener\('keydown'/g) || []).length, 1)
  const drawerMountedSection = iframeDrawer.slice(iframeDrawer.indexOf('onMounted(() => {'), iframeDrawer.indexOf('onBeforeUnmount'))
  assert.ok(drawerMountedSection.indexOf('claimIframeDrawerHost()') < drawerMountedSection.indexOf('history.pushState('))
  assert.ok(drawerMountedSection.includes('createIframeDrawerHistory'))
  const drawerReleaseSection = iframeDrawer.slice(iframeDrawer.indexOf('function releaseIframeDrawerHost'), iframeDrawer.indexOf('function updateCurrentUrl'))
  assert.ok(drawerReleaseSection.indexOf('restoreOriginUrl()') < drawerReleaseSection.indexOf('classList.remove(BEWLY_IFRAME_DRAWER_HOST_CLASS)'))
  assert.doesNotMatch(moments, /momentsContentStyle/)
  assert.doesNotMatch(moments, /showMomentsSidebar|moments-filter-header/)
  assert.doesNotMatch(moments, /addEventListener\('scroll', handleViewportScroll/)
  assert.doesNotMatch(moments, /MOMENTS_MEMORY_MAX_ITEMS/)
  assert.doesNotMatch(moments, /MOMENTS_CACHE_MAX_ITEMS|useMomentsFeedCache/)
  assert.doesNotMatch(widescreen, /explicit priority ownership—not defaultPrevented alone|escapeArbitrationTimer/)
}

async function verifyIncrementalCorrectnessContracts() {
  const root = process.cwd()
  const [videoCard, videoCardInfo, videoCardTypes, contentScript, viteContent, manifest, cmnCn, cmnTw, jyut, en, moments, injectScript] = await Promise.all([
    readFile(`${root}/src/components/VideoCard/VideoCard.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/components/VideoCardInfo.vue`, 'utf8'),
    readFile(`${root}/src/components/VideoCard/types.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/vite.config.content.ts`, 'utf8'),
    readFile(`${root}/src/manifest.ts`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-CN.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-TW.yml`, 'utf8'),
    readFile(`${root}/src/_locales/jyut.yml`, 'utf8'),
    readFile(`${root}/src/_locales/en.yml`, 'utf8'),
    readSourceFiles(MOMENTS_SOURCE_FILES),
    readFile(`${root}/src/inject/index.ts`, 'utf8'),
  ])

  // Video cards show no tags or badges; only "followed" sits beside the author name.
  assert.doesNotMatch(videoCardInfo, /VideoCardMeta|VideoWatchedTag|tagPolicy|VideoCardAuthorAvatar/)
  assert.doesNotMatch([videoCard, videoCardInfo, videoCardTypes].join('\n'), /MAX_INTERFACE_TAG_COUNT|typename.*displayTags|category.*displayTags/i)

  assert.doesNotMatch(contentScript, /createElement\('link'\)[\s\S]{0,180}dist\/contentScripts\/style\.css/)
  assert.match(viteContent, /__BEWLY_NOCTURNE_BUNDLED_STYLE_TEXT__/)
  const webAccessibleResources = manifest.slice(manifest.indexOf('web_accessible_resources'), manifest.indexOf('content_security_policy'))
  assert.doesNotMatch(webAccessibleResources, /dist\/contentScripts\/style\.css/)
  assert.match(webAccessibleResources, /assets\/\*/)

  for (const locale of [cmnCn, cmnTw, jyut, en]) {
    assert.match(locale, /edit_folder:/)
    assert.match(locale, /folder_visibility:/)
    assert.match(locale, /folder_public:/)
    assert.match(locale, /folder_private:/)
    assert.doesNotMatch(locale, /folder_public_desc:/)
  }

  assert.ok(moments.indexOf('api.user.getRelations({ fids: requestHostMid }, readOptions)') < moments.indexOf('api.moment.getMomentsByUp({'))
  assert.doesNotMatch(injectScript, /commentpc\/bili-comments\.[a-f0-9]+\.js/)
}

async function verifyAuditRemediationContracts() {
  const root = process.cwd()
  const viteConfig = await readFile(`${root}/vite.config.ts`, 'utf8')

  assert.match(viteConfig, /__BEWLY_BUILD_ID__/)
}

async function verifyP4CleanupContracts() {
  const root = process.cwd()
  const [widescreen, videoPageStyles, pipWindow, iframeDrawer, lazyLoad, knipConfig, packageJson, prepareScript] = await Promise.all([
    readPlaybackSource(),
    readFile(`${root}/src/styles/adaptedStyles/pages/videoPage.scss`, 'utf8'),
    readFile(`${root}/src/components/PipWindow.vue`, 'utf8'),
    readFile(`${root}/src/components/IframeDrawer.vue`, 'utf8'),
    readFile(`${root}/src/utils/lazyLoad.ts`, 'utf8'),
    import('../knip'),
    readFile(`${root}/package.json`, 'utf8'),
    readFile(`${root}/scripts/prepare.ts`, 'utf8'),
  ])

  const segmentStyles = await readFile(`${root}/src/styles/segmentControl.scss`, 'utf8')
  assert.doesNotMatch(segmentStyles, /\[data-active="true"\] \{[^}]*font-weight:/)
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
  assert.doesNotMatch(pipWindow, /TODO:|isEscPressed|onKeyStroke|<kbd>Esc<\/kbd>/)
  assert.doesNotMatch(iframeDrawer, /TODO: support shortcuts|Ctrl\+Alt\+T/)
  assert.doesNotMatch(lazyLoad, /TODO: handle error|copy with vscode/)

  const knip = knipConfig.default
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
  assert.match(prepareScript, /execFileSync\(process\.execPath, \[\.\.\.process\.execArgv, r\('scripts\/manifest\.ts'\)\]/)
  assert.doesNotMatch(prepareScript, /console\.error\([^\n]*,\s*error\)/)
}

async function verifySemanticPortContracts() {
  const root = process.cwd()
  const [forYou, cmnCn, cmnTw, jyut, en] = await Promise.all([
    readSourceFiles(FOR_YOU_SOURCE_FILES),
    readFile(`${root}/src/_locales/cmn-CN.yml`, 'utf8'),
    readFile(`${root}/src/_locales/cmn-TW.yml`, 'utf8'),
    readFile(`${root}/src/_locales/jyut.yml`, 'utf8'),
    readFile(`${root}/src/_locales/en.yml`, 'utf8'),
  ])

  assert.doesNotMatch(forYou, /initializationPending/)
  assert.doesNotMatch(forYou, /scheduleTimer\(\(\) => \{[\s\S]{0,120}void initData\(\)[\s\S]{0,40}\}, 200\)/)

  const momentsSidebarSource = await readFile(`${root}/src/contentScripts/views/Moments/MomentsSidebar.vue`, 'utf8')
  for (const path of ['fans/follow', 'fans/fans', 'dynamic'])
    assert.ok(momentsSidebarSource.includes(`path: '${path}'`))

  for (const locale of [cmnCn, cmnTw, jyut, en]) {
    assert.match(locale, /expand_text:/)
    assert.match(locale, /collapse_text:/)
    assert.match(locale, /added:/)
    assert.match(locale, /watch_later:/)
  }

  await assert.rejects(stat(`${root}/src/components/MomentCard/MomentVideoStrip.vue`))
  assert.equal((await import('../src/utils/momentsLayout')).MOMENT_GRID_DIMENSIONS.gap, (await import('../src/constants/layout')).GRID_GUTTER)
}

// Track selectors (2026-10-20): every surfaced choice row slides one plate
// 2px inside its track, hover only lifts a label, and the playback rail tabs
// reuse the shared indicator through a teleport instead of painting their own.
async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? listSourceFiles(path.join(directory, entry.name))
    : Promise.resolve([path.join(directory, entry.name)])))
  return nested.flat()
}

async function verifyTrackSegmentControls() {
  const root = process.cwd()
  const segmentControl = await readFile(`${root}/src/styles/segmentControl.scss`, 'utf8')
  assert.doesNotMatch(segmentControl, /--flush/)
  // The danmaku panel's views are the same track, driving Bpx's own menu.

  // Repository audit: every surfaced choice row is a track with the shared
  // indicator. Pinned channels are shortcut links (no selection) and the
  // channels menu is one menu trigger whose open state paints itself.
  const sources = (await listSourceFiles(`${root}/src`)).filter(file => /\.(?:vue|ts)$/.test(file))
  const surfacedExceptions = new Set(['src/components/TopBar/components/TopBarPinnedChannels.vue', 'src/contentScripts/views/Home/components/HomeChannelsMenu.vue'])
  const tracks: string[] = []
  for (const file of sources) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    const content = await readFile(file, 'utf8')
    assert.doesNotMatch(content, /bew-segment-control--flush/, `${relative} still uses the retired flush modifier`)
    if (!/(?:components\/LiquidSegmentIndicator\.vue|composables\/useLiquidSegmentIndicator\.ts)$/.test(relative))
      assert.doesNotMatch(content, /\buseLiquidSegmentIndicator\(/, `${relative} must render LiquidSegmentIndicator instead of calling the composable`)
    for (const match of content.matchAll(/(?:class="|className = ')([^"']*\bbew-segment-control--surface\b[^"']*)/g)) {
      const classes = match[1]
      if (surfacedExceptions.has(relative))
        continue
      assert.match(classes, /\bbew-segment-control--track\b/, `${relative}: a surfaced choice row must be a track (${classes})`)
      assert.doesNotMatch(classes, /\bbew-segment-control--static\b/, `${relative}: a track row slides its selection (${classes})`)
      tracks.push(relative)
    }
  }
  assert.ok(tracks.includes('src/utils/bewlyWidescreen/shell.ts'))
  assert.ok(tracks.length >= 13, `expected every known track row, found ${tracks.length}`)

  const { railTabs } = await import('../src/utils/bewlyWidescreen/railTabs')
  const { clear: clearRailTabs, state: playbackRailTabs, publish: publishRailTabs } = railTabs
  const first = { id: 'first' } as unknown as HTMLElement
  const second = { id: 'second' } as unknown as HTMLElement
  publishRailTabs(first, 'comment')
  const initial = playbackRailTabs.value!
  publishRailTabs(first, 'comment')
  assert.equal(playbackRailTabs.value, initial, 'an unchanged tab publishes nothing')
  publishRailTabs(first, 'danmaku')
  assert.equal(playbackRailTabs.value!.activeKey, 'danmaku')
  assert.equal(playbackRailTabs.value!.generation, initial.generation, 'a tab change keeps the mounted indicator')
  publishRailTabs(second, 'comment')
  assert.notEqual(playbackRailTabs.value!.generation, initial.generation, 'a new tab list remounts the indicator')
  clearRailTabs(first)
  assert.equal(playbackRailTabs.value!.tablist, second, 'a departed shell cannot clear its replacement')
  clearRailTabs(second)
  assert.equal(playbackRailTabs.value, null)
}

async function verifyRefreshRateMotion() {
  // Springs are pure functions of elapsed time: one 1/30 s step equals two 1/60 s steps.
  const coarse = stepCriticalSpring(0, 0, 100, 1 / 30, 0.3)
  const half = stepCriticalSpring(0, 0, 100, 1 / 60, 0.3)
  const fine = stepCriticalSpring(half.position, half.velocity, 100, 1 / 60, 0.3)
  assert.ok(Math.abs(coarse.position - fine.position) < 1e-9 && Math.abs(coarse.velocity - fine.velocity) < 1e-9)

  const previousCSS = globalThis.CSS
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports: () => true } })
  try {
    const curve = (timing: { easing: string }) => timing.easing.slice('linear('.length, -1).split(', ').map(Number)
    const rest = springTiming(0.3, 100)
    assert.equal(rest.duration, 300, 'a spring lands within its stated duration')
    assert.equal(springTiming(0.6, 100).duration, 300, 'no animation runs longer than 300ms')
    assert.ok(curve(rest).at(-2)! > 0.999, 'the last sampled point is already on the target')
    assert.match(rest.easing, /^linear\(0, /)
    assert.equal(curve(rest).at(-1), 1)
    assert.ok(curve(rest).every(point => point >= 0 && point <= 1), 'from rest a critically damped spring never overshoots')
    const flung = curve(springTiming(0.3, 100, 1e6))
    assert.ok(Math.max(...flung) <= 1.026, 'a fling overshoots at most 2.5%')
    assert.ok(flung[1] > curve(rest)[1], 'the release speed carries into the start')
    assert.ok(Math.min(...curve(springTiming(0.3, 100, -1000))) < 0, 'an interrupted reverse first keeps its momentum')
  }
  finally {
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: previousCSS })
  }

  const root = process.cwd()
  const [indicatorView, app] = await Promise.all([
    'src/components/LiquidSegmentIndicator.vue',
    'src/contentScripts/views/App.vue',
  ].map(file => readFile(`${root}/${file}`, 'utf8')))
  assert.doesNotMatch(indicatorView, /:style="indicatorStyle"[\s\S]*width/)
  assert.doesNotMatch(app, /registerSidebarWidth|--bew-active-sidebar-width/, 'no inherited width transition on the app wrapper')
}

async function verify() {
  await verifyAuditOptimizations()
  verifyAccountScopes()
  await verifyTrackSegmentControls()
  await verifyForYouInitialDataLifecycle()
  verifyMomentDescriptionPolicies()
  verifyPlaybackRatePolicy()
  verifyWidescreenMutationPolicy()
  await verifyCommentReplyPaginationPolicy()
  verifyIncrementalCorrectnessPolicies()
  verifyFloatingMenuPolicy()
  verifyWidescreenEngagementPolicy()
  verifyBilibiliApiErrorClassification()
  verifyWidescreenZoomPolicy()
  verifyRandomPlayRetryPolicy()
  verifyAppAuthTokenPolicy()
  await verifyAppAuthSingleFlight()
  verifyAppAuthorizationStateMachine()
  verifySettingsCloudSyncConflictPolicy()
  verifyMomentAdditionalAndFocusPolicies()
  verifyFilterRuleImport()
  verifySliderProgress()
  verifyDialogKeyboardPolicy()
  verifySettingsBootPolicy()
  verifySelectOptionKeys()
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
  await verifyIncrementalCorrectnessContracts()
  await verifyAuditRemediationContracts()
  await verifyP4CleanupContracts()
  await verifySemanticPortContracts()
  await verifySecurityContracts()
  await verifyMomentPlayerPorts()
  await verifyFunctionalAuditFixes()
  await verifyRefreshRateMotion()
  console.log('Targeted fix verification passed.')
}

void verify()
