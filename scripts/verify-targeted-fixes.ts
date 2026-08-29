import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { effectScope, nextTick } from 'vue'

import { normalizeMomentCommentPage } from '../src/components/MomentCard/commentUtils'
import type { StorageLocalRuntime } from '../src/composables/useStorageLocal'
import { getPageBridgeTargetOrigin, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '../src/constants/pageBridge'
import { AppPage } from '../src/enums/appEnums'
import { loadCommentReplyPagesSequentially, mergeCommentReplyLists } from '../src/inject/commentReplyPagination'
import { isAccountRequestCurrent } from '../src/utils/accountScope'
import { createBooleanSingleFlight, resolveAppAccessTokenFreshness, resolveAppAuthorizationState } from '../src/utils/appAuthTokenPolicy'
import { resolveWidescreenCenterGeometry, resolveWidescreenEngagedState, shortenCommentDateText, shouldScheduleWidescreenRefresh, shouldSuppressWidescreenAutoEntry } from '../src/utils/bewlyWidescreenPolicy'
import { resolveCanvasCssColor } from '../src/utils/canvasTheme'
import { resolveDialogKeyboardAction } from '../src/utils/dialogKeyboard'
import { resolveActiveDockItemPage } from '../src/utils/dockActiveItem'
import type { EffectiveTopBarSource } from '../src/utils/effectiveTopBarSource'
import { resolveEffectiveTopBarSource } from '../src/utils/effectiveTopBarSource'
import { compileFilterRules, normalizeImportedFilterRules } from '../src/utils/filterRules'
import { computeFloatingMenuPosition } from '../src/utils/floatingMenu'
import { shouldContinueIframeFocusRetry } from '../src/utils/iframeFocusRetryPolicy'
import { getIframeMessageData, markIframeReadyForMessaging, postMessageToIframe } from '../src/utils/iframeMessage'
import { isSentinelWithinLoadThreshold } from '../src/utils/loadMoreSentinel'
import { calculateContainedImageSize, isTopicPage, queryDomUntilFound } from '../src/utils/main'
import { classifyMomentAdditional, resolveMomentVoteStatus } from '../src/utils/momentAdditionalPolicy'
import { countVisibleNewMomentItems } from '../src/utils/momentFeedOrder'
import { resolveStableMomentKey } from '../src/utils/momentKey'
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
          },
        }],
      }],
    },
  }

  const page = normalizeMomentCommentPage(response, 1, 8)
  const comment = page.items[0]
  assert.ok(comment)
  assert.equal(comment.rpid, '90071992547409930')
  assert.equal(comment.rootRpid, '')
  assert.equal(comment.parentRpid, '')
  assert.equal(comment.isLiked, true)
  assert.equal(comment.likeCount, 7)
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('plain')))
  assert.ok(comment.segments.some(segment => segment.type === 'emote' && segment.text === '[doge]'))
  assert.ok(comment.segments.some(segment => segment.type === 'mention' && segment.mid === '20'))
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('[unknown]')))
  assert.equal(comment.replies[0]?.rootRpid, '90071992547409930')
  assert.equal(comment.replies[0]?.parentRpid, '90071992547409930')
  assert.equal(comment.replies[0]?.isLiked, false)
  assert.equal(comment.replies[0]?.likeCount, 2)
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
    momentsPage,
    momentApi,
    bootOverlay,
    skeletonBlock,
    historyPage,
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
    readFile(`${root}/src/contentScripts/views/Moments/Moments.vue`, 'utf8'),
    readFile(`${root}/src/background/messageListeners/api/moment.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/bewlyBootOverlay.ts`, 'utf8'),
    readFile(`${root}/src/components/SkeletonBlock.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/History/History.vue`, 'utf8'),
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
  assert.match(watchLater, /handleReachBottom\.value === handleWatchLaterReachBottom/)
  assert.match(watchLater, /handlePageRefresh\.value === handleWatchLaterPageRefresh/)
  assert.match(gridCard, /:disabled="disabled"/)

  assert.match(commentSection, /tabindex="-1"/)
  assert.match(commentSection, /aria-hidden="true"/)
  assert.match(commentSection, /MomentCommentRichText :segments="reply\.segments"/)
  assert.match(commentSection, /setMomentCommentLike/)
  assert.match(commentSection, /addMomentCommentReply/)
  assert.match(commentSection, /:aria-pressed="comment\.isLiked"/)
  assert.match(commentSection, /moment-comment__reply-composer/)
  assert.match(commentSection, /function setReplyInputRef\(element: Element \| ComponentPublicInstance \| null\)/)
  assert.match(commentSection, /:ref="setReplyInputRef"/)
  assert.doesNotMatch(commentSection, /ref="replyInputRef"/)
  assert.match(commentRichText, /@error="markEmoteFailed/)
  assert.match(momentApi, /x\/v2\/reply\/action[\s\S]{0,260}application\/x-www-form-urlencoded/)
  assert.match(momentApi, /x\/v2\/reply\/add[\s\S]{0,360}root:/)
  assert.match(momentsPage, /<span\s+class="moments-up-list__fade moments-up-list__fade--prev"/)
  assert.match(momentsPage, /\.moments-up-list__scroller \{[\s\S]{0,180}padding-inline: var\(--bew-space-4\)/)
  assert.match(momentsPage, /\.moments-up-list__item:hover:not\(:disabled\)/)
  assert.match(momentsPage, /\.moments-up-list__scroller \{[\s\S]{0,1000}mask-image: linear-gradient\(\s*90deg,[\s\S]{0,160}rgb\(0 0 0 \/ 16%\) var\(--bew-space-4\)/)
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
  assert.match(about, /cloud-sync-warning/)

  assert.match(moments, /classifyMomentAdditional\(additional\.type\)/)
  assert.match(moments, /RICH_TEXT_NODE_TYPE_VOTE/)
  assert.match(moments, /imageRatios:/)
  assert.match(moments, /type: 'BEWLY_OPUS_VIEWPORT'/)
  assert.match(moments, /clearDetailFocusRetry\(\)/)
  assert.match(moments, /function resetMomentsAccountState\(\) \{[\s\S]{0,80}closeMomentDetail\(\)/)
  assert.match(moments, /Failed to load Moments feed/)
  assert.match(moments, /clearMomentPresentationForRefresh\(\)/)
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
  assert.match(momentCard, /moment\.isVideo && !moment\.isLive && settings\.momentsCardOpenMode === 'dialog'/)
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
    'widescreen.comments_loading',
    'settings.show_bewly_widescreen_button',
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
  const [storage, control, contentScript, videoPlayback, maintenance, catalog, widescreen, watchLaterButton, tsconfig, about, prepare] = await Promise.all([
    readFile(`${root}/src/logic/storage.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/bewlyWidescreenControl.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/index.ts`, 'utf8'),
    readFile(`${root}/src/components/Settings/BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/Advanced/Maintenance.vue`, 'utf8'),
    readFile(`${root}/src/components/Settings/searchCatalog.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/utils/watchLaterButton.ts`, 'utf8'),
    readFile(`${root}/tsconfig.json`, 'utf8'),
    readFile(`${root}/src/components/Settings/About/About.vue`, 'utf8'),
    readFile(`${root}/scripts/prepare.ts`, 'utf8'),
  ])

  assert.match(storage, /showBewlyWidescreenButton: boolean/)
  assert.match(storage, /showBewlyWidescreenButton: true/)
  assert.match(storage, /bewlyWidescreenLayoutPriority: BewlyWidescreenLayoutPriority/)
  assert.match(storage, /bewlyWidescreenLayoutPriority: 'video-first'/)
  assert.match(storage, /bewlyWidescreenCenterVideo: false/)
  assert.match(videoPlayback, /settings\.showBewlyWidescreenButton/)
  assert.match(videoPlayback, /settings\.bewlyWidescreenCenterVideo/)
  assert.match(videoPlayback, /settings\.bewlyWidescreenLayoutPriority/)
  assert.doesNotMatch(videoPlayback, /sidebar_expansion_mode/)
  assert.match(maintenance, /bewlyWidescreenLayoutPriority: \['video-first', 'sidebar-first'\]/)
  assert.match(catalog, /settings\.show_bewly_widescreen_button/)
  assert.match(catalog, /bewly_widescreen_layout_priority/)
  assert.match(control, /settings\.value\.showBewlyWidescreenButton/)
  assert.match(control, /stopPlayerObserver\?\.\(\)/)
  assert.match(control, /controlButtonAbortController\?\.abort\(\)/)
  const controlClickStart = control.indexOf('button.addEventListener(\'click\'')
  const controlClickSection = control.slice(controlClickStart, control.indexOf('return button', controlClickStart))
  assert.match(controlClickSection, /signal: controlButtonAbortController\.signal/)
  assert.match(control, /document\.querySelectorAll<HTMLElement>\(`\.\$\{CONTROL_CLASS\}`\)/)
  assert.match(control, /stopPlayerObserver = observePlayerDom\(injectControl\)/)
  const releaseStart = control.indexOf('function releaseControlDiscovery')
  const releaseSection = control.slice(releaseStart, control.indexOf('export function stopBewlyWidescreenControl', releaseStart))
  assert.doesNotMatch(releaseSection, /exitBewlyWidescreen/)
  assert.match(contentScript, /stopBewlyWidescreenControl/)
  assert.match(contentScript, /if \(!isVideoOrBangumiPage\(\)\) \{[\s\S]{0,260}stopAutoExitFullscreenMonitoring\(\)[\s\S]{0,120}resetRandomPlayInitialization\(\)/)
  assert.match(widescreen, /stopLanguageWatch = watch/)
  assert.match(widescreen, /data-sidebar-layout/)
  assert.match(widescreen, /data-sidebar-hover-expanded/)
  assert.match(widescreen, /resolveWidescreenCenterGeometry/)
  assert.match(widescreen, /setupActionGeometryObservers/)
  assert.match(widescreen, /waitForReadyLayout/)
  assert.match(widescreen, /HTMLMediaElement\.HAVE_METADATA/)
  assert.match(widescreen, /initVerticalVideoZoom\(\)/)
  assert.match(widescreen, /data-sidebar-position="left"\] \.bewly-widescreen-stage/)
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
  assert.doesNotMatch(watchLaterButton, /setTimeout\([^)]*,\s*(?:500|1000)\)/)
  assert.equal(JSON.parse(tsconfig).compilerOptions.noImplicitAny, true)
  assert.match(about, /contributorsRemoteImageUrl = 'https:\/\/contrib\.rocks\/image\?repo=STERILITZIA02\/Bewly_Nocturne'/)
  assert.match(about, /contributorsImageUrl = ref\(getExtensionAssetUrl\('\/assets\/contributors\.svg'\)\)/)
  assert.match(about, /if \(!contributorRemoteFallbackUsed\) \{[\s\S]{0,140}contributorsImageUrl\.value = contributorsRemoteImageUrl/)
  assert.equal((about.match(/contributorRemoteFallbackUsed = true/g) ?? []).length, 1)
  assert.match(prepare, /\.cache\/bewly-nocturne\/contributors\.svg/)
}

function verifyStageRouteAndTopBarPolicies() {
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
  const [adaptedStyles, topicStyles, topBarUrls, necessaryWatchers, topBar, removeTopBarStyles, bilibiliTopBar, bewlyWidescreen, widescreenControl, screenshotControl, playerTooltip, videoPlayerStyles, topBarStore, topBarVisualConfig, searchCatalog, topBarHeader, variables, popoverCards, favoritesPopSource, historyPopSource, watchLaterPopSource, cmnCn, cmnTw, jyut, en] = await Promise.all([
    readFile(`${root}/src/styles/adaptedStyles/index.ts`, 'utf8'),
    readFile(`${root}/src/styles/adaptedStyles/pages/topicPage.scss`, 'utf8'),
    readFile(`${root}/src/components/TopBar/constants/urls.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/necessarySettingsWatchers.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/TopBar.vue`, 'utf8'),
    readFile(`${root}/src/styles/removeTopBar.scss`, 'utf8'),
    readFile(`${root}/src/utils/bilibiliTopBar.ts`, 'utf8'),
    readFile(`${root}/src/utils/bewlyWidescreen.ts`, 'utf8'),
    readFile(`${root}/src/contentScripts/bewlyWidescreenControl.ts`, 'utf8'),
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
  assert.match(momentsPage, /\.moments-up-list__scroller \{[\s\S]{0,180}padding-inline: var\(--bew-space-4\);[\s\S]{0,180}scroll-padding-inline: var\(--bew-space-4\);/)
  const momentsScrollerSection = momentsPage.slice(
    momentsPage.indexOf('.moments-up-list__scroller {'),
    momentsPage.indexOf('.moments-up-list__scroller::-webkit-scrollbar'),
  )
  assert.match(momentsScrollerSection, /-webkit-mask-image: linear-gradient\(\s*90deg,[\s\S]{0,220}rgb\(0 0 0 \/ 16%\) var\(--bew-space-4\)/)
  assert.match(momentsScrollerSection, /#000 calc\(var\(--bew-space-12\) \+ var\(--bew-space-10\)\)/)
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
  assert.match(removeTopBarStyles, /body > \.bili-header ~ #app \.bili-header/)
  assert.match(bilibiliTopBar, /if \(!header \|\| header === cachedOriginalTopBar\)\s*return/)
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
  assert.match(widescreenControl, /createPlayerControlTooltip/)
  assert.match(screenshotControl, /createPlayerControlTooltip/)
  assert.doesNotMatch(widescreenControl, /\.title\s*=/)
  assert.doesNotMatch(screenshotControl, /\.title\s*=/)
  assert.match(screenshotControl, /querySelectorAll<HTMLElement>\('\.bewly-video-screenshot-control'\)/)
  assert.match(screenshotControl, /settings\.value\.language/)
  assert.match(videoPlayerStyles, /\.bewly-widescreen-entry-control,[\s\S]{0,80}\.bewly-video-screenshot-control/)
  assert.match(videoPlayerStyles, /> \.bewly-player-tooltip[\s\S]{0,180}right: 0/)
  assert.match(cmnCn, /show_bewly_widescreen_button: 显示播放器 Bewly 宽屏按钮/)
  assert.match(cmnTw, /show_bewly_widescreen_button: 顯示播放器 Bewly 寬螢幕按鈕/)
  assert.match(jyut, /show_bewly_widescreen_button: 顯示播放器 Bewly 闊螢幕按鈕/)
  assert.match(en, /show_bewly_widescreen_button: Show player Bewly Widescreen button/)
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
    widescreenControl,
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
    readFile(`${root}/src/contentScripts/bewlyWidescreenControl.ts`, 'utf8'),
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
  assert.match(injectScript, /expandAll: '展开全部回复'/)
  assert.match(injectScript, /expandAll: '展開全部回覆'/)
  assert.match(injectScript, /expandAll: 'Expand all replies'/)

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
  assert.match(widescreen, /event\.key !== 'Escape' \|\| event\.repeat/)
  assert.match(widescreen, /event\.key\.toLowerCase\(\) === 'f'/)
  assert.match(widescreen, /addEventListener\('keydown', handleWidescreenKeydown, \{ capture: true \}\)/)
  assert.match(widescreenControl, /if \(isBewlyWidescreenEngaged\(\)\)/)
  assert.match(widescreenControl, /if \(!event\.repeat/)
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

async function verify() {
  verifyAccountScopes()
  verifyPlaybackRatePolicy()
  verifyWidescreenMutationPolicy()
  await verifyCommentReplyPaginationPolicy()
  verifyFloatingMenuPolicy()
  verifyWidescreenEngagementPolicy()
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
  await verifySecurityContracts()
  console.log('Targeted fix verification passed.')
}

void verify()
