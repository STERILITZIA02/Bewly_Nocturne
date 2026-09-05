import assert from 'node:assert/strict'

import { computed, effectScope, nextTick, ref, watch } from 'vue'

import { decodeHtmlEntities } from '../src/utils/htmlDecode'
import { loadSourceFunctions } from './sourceFunctionHarness'

async function verifySettingsRevealLifecycle() {
  const frames = new Map<number, () => void>()
  let nextFrame = 0
  let reveals = 0
  let highlights = 0
  const target = { isConnected: true, scrollIntoView: () => reveals++ }
  const context = await loadSourceFunctions('../src/components/Settings/Settings.vue', [
    'cancelSettingNavigation',
    'revealSearchTarget',
    'deactivateSettingsModal',
  ], {
    settingsModalActive: true,
    searchNavigationId: 1,
    settingNavigationTimer: undefined,
    settingNavigationFrame: undefined,
    inertSiblingStates: new Map(),
    previouslyFocusedElement: null,
    nextTick,
    clearTimeout: () => {},
    clearSearchTargetHighlight: () => {},
    expandSearchTarget: () => {},
    highlightSearchTarget: () => highlights++,
    cancelAnimationFrame: (id: number) => frames.delete(id),
    window: { requestAnimationFrame: (callback: () => void) => {
      const id = ++nextFrame
      frames.set(id, callback)
      return id
    } },
  })
  const flushFrames = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id)
      callback()
    }
  }
  context.revealSearchTarget(target, 1)
  await nextTick()
  flushFrames()
  assert.equal(reveals, 1)
  assert.equal(highlights, 1)

  context.revealSearchTarget(target, 1)
  context.cancelSettingNavigation()
  await nextTick()
  assert.equal(frames.size, 0, 'a superseded nextTick cannot register a new RAF')
  context.revealSearchTarget(target, 2)
  await nextTick()
  assert.equal(frames.size, 1)
  context.deactivateSettingsModal()
  assert.equal(frames.size, 0, 'KeepAlive deactivation cancels the pending frame')
  flushFrames()
  assert.equal(reveals, 1)
  assert.equal(highlights, 1)
}

async function verifySearchSuggestionLifecycle() {
  let requests = 0
  const suggestions: unknown[] = []
  const context = await loadSourceFunctions('../src/components/SearchBar/SearchBar.vue', ['handleKeywordInput'], {
    useDebounceFn: (callback: unknown) => callback,
    searchBarDisposed: false,
    suggestionRequestId: 2,
    suggestions,
    reportSearchBarFailure: () => {},
    api: { search: { getSearchSuggestion: async () => {
      requests++
      return { code: 0, result: { tag: [{ value: 'current' }, { value: 'current' }] } }
    } } },
  })
  await context.handleKeywordInput('old', 1)
  assert.equal(requests, 0)
  await context.handleKeywordInput('current', 2)
  assert.equal(requests, 1)
  assert.equal(suggestions.length, 1)
  context.searchBarDisposed = true
  await context.handleKeywordInput('closed', 2)
  assert.equal(requests, 1, 'unmounted debounce callback does not send a new API request')
}

async function verifySelectOptionChanges() {
  const selections: string[] = []
  const context = await loadSourceFunctions('../src/components/Select.vue', ['handleOptionKeyDown'], {
    props: { options: [] },
    activeOptionIndex: { value: 2 },
    selectOption: (option: { value: string }) => selections.push(option.value),
  })
  const event = { key: 'Enter', preventDefault: () => {} }
  context.handleOptionKeyDown(event)
  assert.equal(selections.length, 0, 'removing the focused option must not throw or emit undefined')
  context.props.options = [{ value: 'one' }]
  context.activeOptionIndex.value = 0
  context.handleOptionKeyDown(event)
  assert.deepEqual(selections, ['one'])
}

async function verifyRankingLoadingEvents() {
  const events: string[] = []
  const completions: Array<(value: unknown) => void> = []
  const context = await loadSourceFunctions('../src/contentScripts/views/Home/components/Ranking.vue', ['getRankingPgc'], {
    requestGeneration: 1,
    isLoading: { value: false },
    PgcList: [],
    emit: (event: string) => events.push(event),
    api: { ranking: { getRankingPgc: () => new Promise(resolve => completions.push(resolve)) } },
  })
  const first = context.getRankingPgc(1, 1)
  context.requestGeneration = 2
  const second = context.getRankingPgc(2, 4)
  completions[0]({ code: 0, data: { list: ['stale'] } })
  await first
  assert.equal(context.isLoading.value, true)
  completions[1]({ code: 0, data: { list: ['current'] } })
  await second
  assert.equal(context.isLoading.value, false)
  assert.deepEqual(events, ['beforeLoading', 'beforeLoading', 'afterLoading'])
  assert.equal(context.PgcList[0], 'current')
}

async function verifyScrollOwnerCleanup() {
  const frames = new Map<number, () => void>()
  const timers = new Map<number, () => void>()
  let nextId = 0
  let mount: () => void = () => {}
  const events: number[] = []
  const createElement = (scrollTop: number) => {
    const listeners = new Set<() => void>()
    return {
      scrollTop,
      scrollHeight: 100,
      clientHeight: 100,
      addEventListener: (_name: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_name: string, callback: () => void) => listeners.delete(callback),
      scroll: () => [...listeners].forEach(callback => callback()),
      listeners,
    }
  }
  const context = await loadSourceFunctions('../src/composables/useOptimizedScroll.ts', ['useOptimizedScroll'], {
    ref,
    watch,
    onMounted: (callback: () => void) => mount = callback,
    Date,
    requestAnimationFrame: (callback: () => void) => {
      frames.set(++nextId, callback)
      return nextId
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (callback: () => void) => {
      timers.set(++nextId, callback)
      return nextId
    },
    clearTimeout: (id: number) => timers.delete(id),
  })
  const first = createElement(0)
  const second = createElement(0)
  const element = ref(first)
  const scope = effectScope()
  scope.run(() => {
    context.useOptimizedScroll(element, { onScroll: (info: { percentage: number }) => events.push(info.percentage) })
    mount()
  })
  assert.deepEqual(events, [0], 'a non-scrollable popover reports a finite percentage')
  first.scroll()
  assert.equal(frames.size, 1)
  element.value = second
  await nextTick()
  assert.equal(first.listeners.size, 0)
  assert.equal(second.listeners.size, 1)
  assert.equal(frames.size, 0, 'replacing the node cancels its queued scroll frame')
  assert.equal(timers.size, 0)
  second.scroll()
  scope.stop()
  assert.equal(second.listeners.size, 0)
  assert.equal(frames.size, 0, 'disposing a popover cannot invoke its paging callback later')
  assert.equal(timers.size, 0)
}

async function verifyImageReleaseBatch() {
  let now = 0
  let nextId = 0
  let timerCreations = 0
  const timers = new Map<number, { callback: () => void, deadline: number }>()
  const released: number[] = []
  const context = await loadSourceFunctions('../src/components/LazyPicture.vue', [
    'runReleaseSweep',
    'scheduleImageRelease',
    'cancelImageRelease',
  ], {
    pendingImageReleases: new Map(),
    releaseSweepTimer: null,
    releaseSweepDeadline: Number.POSITIVE_INFINITY,
    Date: { now: () => now },
    setTimeout: (callback: () => void, delay: number) => {
      timerCreations++
      timers.set(++nextId, { callback, deadline: now + delay })
      return nextId
    },
    clearTimeout: (id: number) => timers.delete(id),
  })
  const covers = Array.from({ length: 200 }, () => ({}))
  covers.forEach((cover, index) => context.scheduleImageRelease(cover, 2000, () => released.push(index)))
  assert.equal(timerCreations, 1, 'one offscreen batch schedules one shared wakeup')
  const advance = (time: number) => {
    now = time
    for (const [id, timer] of [...timers]) {
      if (timer.deadline <= now) {
        timers.delete(id)
        timer.callback()
      }
    }
  }
  context.scheduleImageRelease(covers[0], 500, () => released.push(0))
  context.cancelImageRelease(covers[1])
  advance(499)
  assert.equal(released.length, 0)
  advance(500)
  assert.deepEqual(released, [0], 'an earlier deadline reschedules the shared wakeup')
  advance(2000)
  assert.equal(released.length, 199)
  assert.equal(released.includes(1), false, 'returning to view cancels that cover release')
  assert.equal(timers.size, 0)
  context.scheduleImageRelease(covers[0], 2000, () => released.push(0))
  context.cancelImageRelease(covers[0])
  assert.equal(timers.size, 0, 'cancelling the final cover leaves no idle timer')
}

async function verifyVideoIdentityReuse() {
  let detailRequests = 0
  const resolver = await loadSourceFunctions('../src/utils/watchLater.ts', [
    'getDirectWatchLaterAid',
    'resolveWatchLaterAid',
  ], {
    api: { video: { getVideoInfo: async () => {
      detailRequests++
      return { code: 0, data: { aid: 123 } }
    } } },
    resolvePgcEpisodeVideoIds: async () => ({ aid: 456 }),
  })
  const fixture = {
    aid: 123,
    bvid: 'BV-fixture',
    cid: 456,
    title: 'Title',
    desc: '',
    pic: '',
    owner: { name: 'Author', face: '', mid: 42 },
    stat: {},
    rcmd_reason: { content: '' },
    args: { aid: 123 },
  }
  for (const [file, name] of [
    ['Trending', 'transformTrendingVideo'],
    ['Weekly', 'transformWeeklyVideo'],
    ['Ranking', 'transformRankingVideo'],
    ['Precious', 'transformPreciousVideo'],
    ['ForYou', 'transformAppVideo'],
  ]) {
    const context = await loadSourceFunctions(file === 'ForYou'
      ? '../src/contentScripts/views/Home/adapters/recommendationVideo.ts'
      : `../src/contentScripts/views/Home/components/${file}.vue`, [name], {
      decodeHtmlEntities,
      isVerticalVideo: () => false,
    })
    const video = context[name](file === 'Trending' ? { item: fixture } : fixture, 1)
    assert.equal(await resolver.resolveWatchLaterAid(video), 123, `${file} preserves the authoritative aid`)
  }
  assert.equal(detailRequests, 0, 'known video IDs require no per-card detail API calls')
  assert.equal(await resolver.resolveWatchLaterAid({ id: 999, roomid: 999 }), undefined)
  assert.equal(await resolver.resolveWatchLaterAid({ id: 999, epid: 1 }), 456)
  assert.equal(await resolver.resolveWatchLaterAid({ bvid: 'BV-fixture' }), 123)
  assert.equal(detailRequests, 1, 'a BV without an authoritative aid still resolves normally')
}

async function verifySharedVideoStyles() {
  const settings = ref({ videoCardTitleFontSize: 'base', videoCardAuthorFontSize: 'sm', videoCardMetaFontSize: 'xs' })
  const context = await loadSourceFunctions('../src/composables/useVideoCardSharedStyles.ts', [
    'VIDEO_CARD_FONT_SIZE_MAP',
    'VIDEO_CARD_LINE_HEIGHT_MAP',
    'titleFontSizeClass',
    'titleStyle',
    'authorFontSizeClass',
    'metaFontSizeClass',
    'metaStyle',
    'useVideoCardSharedStyles',
  ], { computed, settings })
  const cards = Array.from({ length: 200 }, () => context.useVideoCardSharedStyles())
  assert.equal(new Set(cards.map(card => card.titleFontSizeClass)).size, 1)
  settings.value.videoCardTitleFontSize = 'lg'
  assert.equal(cards[0].titleFontSizeClass.value, 'text-lg')
  assert.equal(cards[199].titleFontSizeClass.value, 'text-lg', 'all cards still react to settings updates')
}

async function verifyHorizontalWheelBoundary() {
  const context = await loadSourceFunctions('../src/components/HorizontalScrollView.vue', ['handleMouseScroll'], {})
  const element = { scrollLeft: 0, scrollWidth: 600, clientWidth: 200 }
  let prevented = false
  const wheel = (deltaY: number, deltaX = 0, ctrlKey = false) => {
    prevented = false
    context.handleMouseScroll({ currentTarget: element, deltaY, deltaX, ctrlKey, preventDefault: () => prevented = true })
    return prevented
  }
  assert.equal(wheel(-20), false, 'the start boundary lets the page scroll up')
  assert.equal(wheel(20), true)
  assert.equal(element.scrollLeft, 20)
  assert.equal(wheel(20, 100), false, 'horizontal trackpad gestures remain native')
  assert.equal(wheel(20, 0, true), false, 'pinch zoom is not swallowed')
  element.scrollLeft = 400
  assert.equal(wheel(20), false, 'the end boundary lets the page scroll down')
  element.scrollWidth = element.clientWidth
  assert.equal(wheel(20), false, 'a row without overflow never traps scrolling')
}

export async function verifyFunctionalAuditFixes() {
  await verifySettingsRevealLifecycle()
  await verifySearchSuggestionLifecycle()
  await verifySelectOptionChanges()
  await verifyRankingLoadingEvents()
  await verifyScrollOwnerCleanup()
  await verifyImageReleaseBatch()
  await verifyVideoIdentityReuse()
  await verifySharedVideoStyles()
  await verifyHorizontalWheelBoundary()
  assert.equal(decodeHtmlEntities('&#x1F63A; &#128570; &#x20000;'), '😺 😺 𠀀')
  assert.equal(decodeHtmlEntities('&amp; &copy;'), '& ©')
  assert.equal(decodeHtmlEntities('&#12ab; &#x110000;'), '&#12ab; &#x110000;')
  console.log('Functional audit fix verification passed.')
}
