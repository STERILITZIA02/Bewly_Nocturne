import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import { serializeMomentVoteBody } from '../src/background/momentVoteSerializer'
import { normalizeMomentComment } from '../src/components/MomentCard/commentUtils'
import { MOMENTS_DETAIL_LAYOUT } from '../src/constants/layout'
import { shouldSuppressWidescreenAutoEntry } from '../src/utils/bewlyWidescreenPolicy'
import { createMomentCommentSessionCache } from '../src/utils/momentCommentSession'
import { readMomentCommentTarget, resolveMomentCommentTarget } from '../src/utils/momentCommentTarget'
import { createMomentCommentThreadController } from '../src/utils/momentCommentThread'
import { createMomentVoteController, createMomentVoteState, isMomentVoteEnded, normalizeMomentVote } from '../src/utils/momentVote'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { verifyMomentCommentLifecycle } from './verify-moment-comment-lifecycle'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => resolve = done)
  return { promise, resolve }
}

function voteResponse(choiceCount = 1, selected: number[] = [], status = 0) {
  return { code: 0, data: { my_votes: selected, vote_info: {
    title: 'Fixture poll',
    choice_cnt: choiceCount,
    end_time: 4_000_000_000,
    status,
    join_num: 10,
    options: [
      { opt_idx: 1, opt_desc: 'First', cnt: 4 },
      { opt_idx: 2, opt_desc: 'Second', cnt: 6, img_url: 'https://i0.hdslb.com/bfs/test.jpg' },
      { opt_idx: 3, opt_desc: 'Third', cnt: 0 },
    ],
  } } }
}

async function verifyVote() {
  let identity = 'account-a:moment-a:vote-a'
  let loggedIn = true
  let response = voteResponse()
  let fetchVote = async () => response
  let postCount = 0
  let rejectSubmit = false
  const state = createMomentVoteState()
  const controller = createMomentVoteController({
    state,
    getIdentity: () => identity,
    getEndTime: () => 0,
    isLoggedIn: () => loggedIn,
    fetchVote: () => fetchVote(),
    submitVote: async (votes) => {
      postCount += 1
      if (rejectSubmit)
        return { code: -400 }
      response = voteResponse(2, votes)
      return { code: 0 }
    },
  })
  await controller.load()
  assert.equal(state.info?.title, 'Fixture poll')
  assert.match(state.info!.options[1].imageUrl, /^https:/)
  controller.select(1)
  controller.select(2)
  assert.deepEqual(state.selected, [2], 'single choice replaces selection')
  response = voteResponse(2)
  await controller.load()
  controller.select(1)
  controller.select(2)
  controller.select(3)
  assert.deepEqual(state.selected, [1, 2], 'multi-choice limit is enforced')
  controller.select(1)
  assert.deepEqual(state.selected, [2])
  loggedIn = false
  await controller.submit()
  assert.equal(postCount, 0)
  assert.equal(state.submitError, 'login')
  loggedIn = true
  rejectSubmit = true
  await controller.submit()
  assert.equal(state.submitError, 'submit')
  assert.equal(state.submitting, false)
  assert.equal(controller.hasVoted(), false)
  rejectSubmit = false
  await controller.submit()
  assert.equal(controller.hasVoted(), true)
  assert.deepEqual(state.info?.selectedVotes, [2], 'POST is followed by authoritative GET')
  const submittedCount = postCount
  controller.select(1)
  await controller.submit()
  assert.equal(postCount, submittedCount, 'accepted vote cannot be submitted twice')

  controller.invalidate()
  response = voteResponse(1, [1])
  await controller.load()
  assert.equal(controller.hasVoted(), true)
  assert.deepEqual(state.selected, [1], 'already-voted response restores selection')
  controller.invalidate()
  response = voteResponse(1, [], 4)
  await controller.load()
  assert.equal(isMomentVoteEnded(state.info), true)
  controller.select(1)
  assert.deepEqual(state.selected, [])
  assert.equal(isMomentVoteEnded({ ...normalizeMomentVote(voteResponse()), endTime: 1 }), true)

  const late = deferred<ReturnType<typeof voteResponse>>()
  controller.invalidate()
  fetchVote = () => late.promise
  const oldLoad = controller.load()
  identity = 'account-a:moment-b:vote-b'
  controller.invalidate()
  response = voteResponse(2)
  response.data.vote_info.title = 'Current B'
  fetchVote = async () => response
  await controller.load()
  late.resolve(voteResponse())
  await oldLoad
  assert.equal(state.info?.title, 'Current B', 'late A cannot overwrite B')

  fetchVote = async () => {
    throw new Error('offline')
  }
  await controller.load()
  assert.equal(state.loadError, true)
  assert.equal(state.loading, false)
  fetchVote = async () => voteResponse()
  await controller.load()
  assert.equal(state.loadError, false, 'retry recovers load failure')

  const stale = deferred<ReturnType<typeof voteResponse>>()
  fetchVote = () => stale.promise
  const unmountedLoad = controller.load()
  controller.invalidate()
  stale.resolve(voteResponse())
  await unmountedLoad
  assert.equal(state.info, null, 'unmounted vote cannot commit a late response')

  const pendingPost = deferred<unknown>()
  let requestsAfterPost = 0
  const submitState = createMomentVoteState()
  const submitController = createMomentVoteController({
    state: submitState,
    getIdentity: () => identity,
    getEndTime: () => 0,
    isLoggedIn: () => true,
    fetchVote: async () => {
      requestsAfterPost += 1
      return voteResponse()
    },
    submitVote: () => pendingPost.promise,
  })
  await submitController.load()
  submitController.select(1)
  const oldSubmit = submitController.submit()
  identity = 'account-b:moment-b:vote-b'
  submitController.invalidate()
  await submitController.load()
  pendingPost.resolve({ code: 0 })
  await oldSubmit
  assert.equal(submitState.accepted, false)
  assert.equal(requestsAfterPost, 2, 'stale submit cannot reload or mark the next account voted')
}

async function verifyVoteRequest() {
  const payload = {
    vote_id: 42,
    votes: [1, 2],
    voter_uid: 7,
    status: 0,
    op_bit: 0,
    dynamic_id: '1234567890123456789',
    csrf: 'fixture',
    csrf_token: 'fixture',
  }
  const body = serializeMomentVoteBody({ ...payload, text: 'quote"\ntext', nested: { enabled: true } })
  assert.ok(body.includes('"dynamic_id":1234567890123456789'))
  assert.ok(!body.includes('1234567890123456800'))
  const parsed = JSON.parse(body)
  assert.equal(parsed.text, 'quote"\ntext')
  assert.deepEqual(parsed.nested, { enabled: true })
  assert.deepEqual(parsed.votes, [1, 2])
  for (const invalid of [1234567890123456800, '01', '1e6', '1,"injected":true', ''])
    assert.throws(() => serializeMomentVoteBody({ ...payload, dynamic_id: invalid }))

  ;(globalThis as typeof globalThis & { chrome?: unknown }).chrome ??= { runtime: { id: 'semantic-port-test' } }
  const [{ doRequest, AHS }, { default: momentApi }] = await Promise.all([
    import('../src/background/utils'),
    import('../src/background/messageListeners/api/moment'),
  ])
  const originalFetch = globalThis.fetch
  let lastUrl = ''
  let lastInit: RequestInit = {}
  globalThis.fetch = async (url, init) => {
    lastUrl = String(url)
    lastInit = init || {}
    return new Response('{"code":0}', { headers: { 'content-type': 'application/json' } })
  }
  try {
    await doRequest({ contentScriptQuery: 'submitMomentVote', ...payload, unexpected: 'blocked' }, momentApi.submitMomentVote)
    assert.equal(new URL(lastUrl).searchParams.get('csrf'), 'fixture')
    assert.equal(new URL(lastUrl).searchParams.has('unexpected'), false)
    assert.match(String(lastInit.body), /"dynamic_id":1234567890123456789/)
    assert.equal(JSON.parse(String(lastInit.body)).csrf, 'fixture')
    assert.equal(lastInit.credentials, 'include')

    await doRequest({ contentScriptQuery: 'test', keep: 2, csrf: 'token', ignored: 3 }, {
      url: 'https://api.bilibili.com/x/test',
      params: { keep: 0 },
      afterHandle: AHS.J_D,
      _fetch: { method: 'post', strictParams: true, credentials: 'omit', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: { csrf: '' } },
    })
    assert.equal(lastInit.credentials, 'omit')
    assert.equal(lastInit.body instanceof URLSearchParams, true)
    assert.equal(String(lastInit.body), 'csrf=token')
    assert.equal(new URL(lastUrl).searchParams.get('keep'), '2')
    assert.equal(new URL(lastUrl).searchParams.has('ignored'), false)
    await doRequest({ contentScriptQuery: 'test', text: 'hello', extra: 'query' }, {
      url: 'https://api.bilibili.com/x/test',
      params: {},
      afterHandle: AHS.J_D,
      _fetch: { method: 'post', body: { text: '' } },
    })
    assert.equal(lastInit.body, '{"text":"hello"}')
    assert.equal(new URL(lastUrl).searchParams.get('extra'), 'query')
    globalThis.fetch = async () => new Response('<html>risk control</html>', { headers: { 'content-type': 'text/html' } })
    await assert.rejects(doRequest({ contentScriptQuery: 'getMomentVote', vote_id: '42' }, momentApi.getMomentVote), (error: unknown) => Boolean((error as { isRiskControl?: boolean }).isRiskControl))
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

async function verifyCommentSessions() {
  let detailCount = 0
  const detail = async () => {
    detailCount += 1
    return { code: 0, data: { item: { basic: { comment_id_str: '876543210987654321', comment_type: 17 } } } }
  }
  const direct = { id: '123', commentId: '456', commentType: 11 }
  assert.deepEqual(await resolveMomentCommentTarget(direct, detail, () => true), { oid: '456', type: 11 })
  assert.equal(detailCount, 0)
  assert.deepEqual(await resolveMomentCommentTarget({ id: '123' }, detail, () => true), { oid: '876543210987654321', type: 17 })
  assert.equal(detailCount, 1)
  assert.equal(await resolveMomentCommentTarget({ id: '123' }, async () => ({ code: 0, data: { item: {} } }), () => true), null)
  assert.equal(readMomentCommentTarget('0', 11), null)
  const delayed = deferred<Awaited<ReturnType<typeof detail>>>()
  let identity = 'A'
  const requestIdentity = identity
  const pending = resolveMomentCommentTarget({ id: '123' }, () => delayed.promise, () => identity === requestIdentity)
  identity = 'B'
  delayed.resolve(await detail())
  assert.equal(await pending, null)

  const root = normalizeMomentComment({ rpid_str: '100', member: { mid: '1', uname: 'Fixture' }, content: { message: 'Root' }, rcount: 2 })!
  const reply = normalizeMomentComment({ rpid_str: '101', root_str: '100', parent_str: '100', member: { mid: '2' }, content: { message: 'Reply' } })!
  const makeThread = () => createMomentCommentThreadController({
    getIdentity: () => 'account-a:17:123',
    fetchPage: async () => ({ items: [reply], nextPage: 2, hasMore: true }),
  })
  const thread = makeThread()
  thread.seed('100', [], 2)
  await thread.loadMore('100')
  const cache = createMomentCommentSessionCache('account-a')
  const target = { oid: '123', type: 17 }
  const lease = cache.open('account-a', 'moment-a', target)!
  cache.save(lease, { comments: [root], nextPage: 3, hasMore: true, threads: thread.snapshot(), likedIds: ['101'], likeCounts: { 101: 9 }, scrollTop: 144 })
  thread.dispose()
  const restored = cache.restore(cache.open('account-a', 'moment-a', target)!)!
  const remounted = makeThread()
  remounted.restore(restored.threads)
  assert.equal(restored.comments[0].id, '100')
  assert.equal(restored.nextPage, 3)
  assert.equal(restored.hasMore, true)
  assert.equal(restored.scrollTop, 144)
  assert.deepEqual(restored.likedIds, ['101'])
  assert.equal(restored.likeCounts['101'], 9)
  assert.equal(remounted.getState('100')?.items[0].id, '101')
  assert.equal(remounted.getState('100')?.nextPage, 2)
  assert.equal(remounted.getState('100')?.loaded, true)
  assert.equal(remounted.getState('100')?.loading, false)
  assert.equal(remounted.getState('100')?.error, undefined)
  assert.deepEqual(cache.getTarget('account-a', 'moment-a'), target)
  for (let index = 0; index < 16; index++)
    cache.open('account-a', `next-${index}`, target)
  assert.equal(cache.restore(lease), null, '17th entry evicts least recently used')
  const nextLease = cache.open('account-a', 'moment-a', target)!
  cache.save(nextLease, restored)
  cache.setAccount('account-b')
  assert.equal(cache.getTarget('account-b', 'moment-a'), null)
  cache.save(nextLease, restored)
  assert.equal(cache.restore(nextLease), null, 'late unmount cannot resurrect old account')
  const bLease = cache.open('account-b', 'moment-a', target)!
  cache.save(bLease, restored)
  assert.equal(cache.restore(cache.open('account-b', 'moment-a', { oid: '999', type: 1 })!), null)
  cache.clear()
  cache.save(bLease, restored)
  assert.equal(cache.restore(bLease), null, 'feed reset invalidates active leases')
  remounted.dispose()
}

async function verifyDetailGeometryAndWiring() {
  const selectedMoment = { value: { id: 'fixture', images: ['fixture.jpg'], imageRatios: [1] } }
  const layout = await loadSourceFunctions('../src/contentScripts/views/Moments/Moments.vue', [
    'detailViewportGutter',
    'detailViewportSafeWidth',
    'detailReferenceHeight',
    'detailSafeHeight',
    'detailPlayerMaxWidth',
    'opusDetailCommentPageRatio',
    'opusDetailLongImageRatio',
    'opusDetailMaxWidth',
    'opusSplitDetailBaseWidth',
    'opusDetailMaxHeight',
    'isUsableImageRatio',
    'isOpusSplitDetailMoment',
    'getOpusSplitLayoutRatio',
    'detailDialogHeight',
    'detailDialogWidth',
  ], {
    MOMENTS_DETAIL_LAYOUT,
    MIN_SINGLE_IMAGE_RATIO: 0.5,
    selectedMoment,
    coverRatios: {},
    isPlayerMoment: () => false,
    computed: (getter: () => unknown) => ({ get value() { return getter() } }),
  })
  const pixels = (css: string, width: number, height: number) => Number(vm.runInNewContext(css
    .replace(/([\d.]+)(d?vw|d?vh|px)/g, (_match, value, unit) => String(Number(value) * (unit.endsWith('vw') ? width / 100 : unit.endsWith('vh') ? height / 100 : 1)))
    .replace(/\bcalc\(/g, '(')
    .replace(/\b(min|max)\(/g, 'Math.$1(')))
  for (const windowWidth of [1440, 960, 640]) {
    for (const zoom of [1, 1.25, 1.5]) {
      const width = windowWidth / zoom
      const height = 900 / zoom
      const maxWidth = Math.min(width * 0.9, width - MOMENTS_DETAIL_LAYOUT.viewportGutter * 2)
      for (const ratio of [0.3, 1, 16 / 9, 4]) {
        selectedMoment.value.imageRatios = [ratio]
        const dialogWidth = pixels(layout.detailDialogWidth.value, width, height)
        assert.ok(dialogWidth <= maxWidth + 0.01)
        assert.ok(dialogWidth >= Math.min(maxWidth, width * 0.58) - 0.01)
        assert.ok(dialogWidth - width * 0.29 >= width * 0.29 - 0.01, 'portrait media is not squeezed below the base column')
      }
    }
  }
  const vote = await readFile(new URL('../src/components/MomentCard/MomentVote.vue', import.meta.url), 'utf8')
  assert.match(vote, /\.moment-vote\s*\{[^}]*pointer-events: auto/)
  assert.match(vote, /@change="select\(\$event, option.index\)"/)
  assert.match(vote, /emit\('interactiveResize'\)/)
  const boot = await readFile(new URL('../src/contentScripts/index.ts', import.meta.url), 'utf8')
  assert.match(boot, /window.addEventListener\('load',[\s\S]{0,150}waitForPlayerModePageSettle\(false\)/)
}

async function verifyPlayerAndTiming() {
  let pathname = '/video/BVfixture'
  let selectors = new Set<string>()
  let app: unknown = null
  const settings = { value: { autoPlayMultipart: 'loop', autoPlayCollection: 'list' } }
  const player = await loadSourceFunctions('../src/utils/player.ts', ['VideoType', 'isWatchLaterVideo', 'isCollectionVideo', 'detectVideoType', 'getAutoPlayModeForVideoType', 'detectVideoPlayerModeContext'], {
    location: { get pathname() { return pathname } },
    settings,
    document: { querySelector: (selector: string) => selector === '#app' ? app : selector.split(',').some(part => selectors.has(part.trim())) ? {} : null },
  })
  assert.equal(player.detectVideoType(), 'recommend', 'normal single-part video')
  app = { __vue__: { videoData: { pages: [{}, {}] }, isSection: true } }
  selectors = new Set(['.video-pod__list .simple-base-item'])
  assert.equal(player.detectVideoType(), 'multipart', 'real multipart data wins over collection')
  assert.equal(player.getAutoPlayModeForVideoType(), 'loop')
  app = { __vue__: { videoData: { pages: [{}] }, isSection: true } }
  assert.equal(player.detectVideoType(), 'collection')
  app = null
  selectors = new Set(['.view-mode', '.video-pod__item'])
  assert.equal(player.detectVideoType(), 'multipart')
  selectors = new Set(['.video-pod__item', '.video-pod__list .simple-base-item'])
  assert.equal(player.detectVideoType(), 'multipart', 'mixed DOM without view-mode')
  pathname = '/list/watchlater'
  assert.equal(player.detectVideoType(), 'watchLater')
  pathname = '/list/123'
  assert.equal(player.detectVideoType(), 'playlist')
  pathname = '/bangumi/play/ep123'
  assert.equal(player.detectVideoPlayerModeContext(), 'bangumi')

  let now = 0
  let nextId = 0
  let appliedAt = -1
  let drawer = false
  const timers = new Map<number, { at: number, fn: () => void }>()
  const noop = () => {}
  const timing = await loadSourceFunctions('../src/contentScripts/index.ts', [
    'playerModeLoadSettleDelay',
    'playerModeReadinessRetryInterval',
    'videoOwnerAvatarReadyTimeout',
    'clearPlayerModeRetry',
    'schedulePlayerModeRetry',
    'waitForPlayerModePageSettle',
    'applyDefaultPlayerMode',
  ], {
    Date: { now: () => now },
    Number,
    playerModeRetryTimer: undefined,
    playerModeReadyAfter: Infinity,
    videoOwnerAvatarReadyDeadline: Infinity,
    playerModeSettingsReady: true,
    userExitedWidescreenNavigationKey: undefined,
    lastAppliedPlayerModeNavigationKey: undefined,
    autoContinuationNavigationKey: undefined,
    lastVideoEndedAt: 0,
    location: { href: 'https://www.bilibili.com/video/BVfixture' },
    settings: { value: {} },
    document: { readyState: 'complete', visibilityState: 'visible', querySelector: () => null },
    isIframeDrawerHost: () => drawer,
    isVideoOrBangumiPage: () => true,
    isVideoPage: () => true,
    getVideoNavigationKey: () => 'BVfixture',
    isBewlyWidescreenActive: () => false,
    isBewlyWidescreenEngaged: () => false,
    shouldSuppressWidescreenAutoEntry,
    resolveDefaultVideoPlayerMode: () => 'widescreen',
    isFestivalPage: () => false,
    isVideoOwnerAvatarReady: () => now >= 300,
    isPlayerDisplayModeReady: () => true,
    widescreen: () => { appliedAt = now },
    exitBewlyWidescreen: noop,
    cancelPlayerRetryTasks: noop,
    applyDefaultDanmakuState: noop,
    applyDefaultCaptionState: noop,
    resetVerticalVideoZoom: noop,
    scheduleDetachedTimer: noop,
    scheduleAddWatchLaterButton: noop,
    setTimeout: (fn: () => void, delay: number) => {
      const id = ++nextId
      timers.set(id, { at: now + delay, fn })
      return id
    },
    clearTimeout: (id: number) => timers.delete(id),
  })
  assert.equal(timing.videoOwnerAvatarReadyTimeout, 4000)
  timing.waitForPlayerModePageSettle()
  timing.applyDefaultPlayerMode()
  for (const at of [200, 400]) {
    now = at
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id)
        timer.fn()
      }
    }
  }
  assert.equal(appliedAt, 400, 'readiness at 300ms is consumed on 200ms retry cadence')
  now = 1500
  timing.waitForPlayerModePageSettle(false)
  assert.equal(timing.playerModeReadyAfter, 200, 'late window.load preserves settle observation')
  assert.equal(timing.videoOwnerAvatarReadyDeadline, 4000, 'late load does not extend fallback timeout')
  timing.waitForPlayerModePageSettle()
  assert.equal(timing.playerModeReadyAfter, 1700, 'new navigation resets observation')
  appliedAt = -1
  timing.lastAppliedPlayerModeNavigationKey = undefined
  drawer = true
  timing.applyDefaultPlayerMode()
  assert.equal(appliedAt, -1)
  assert.equal(timers.size, 0)
  drawer = false
  timing.userExitedWidescreenNavigationKey = 'BVfixture'
  timing.applyDefaultPlayerMode()
  assert.equal(appliedAt, -1, 'user exit suppresses retry re-entry')
}

export async function verifyMomentPlayerPorts() {
  await verifyVote()
  await verifyVoteRequest()
  await verifyCommentSessions()
  await verifyPlayerAndTiming()
  await verifyDetailGeometryAndWiring()
  await verifyMomentCommentLifecycle()
  console.log('Moment/player semantic port verification passed.')
}
