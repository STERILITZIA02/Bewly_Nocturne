import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import * as sass from 'sass'
import { computed, effectScope, nextTick, ref, watch } from 'vue'

import { decodeHtmlEntities } from '../src/utils/htmlDecode'
import { isPortraitDimension } from '../src/utils/portraitMedia'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

// Settings reveal/KeepAlive coverage now mounts the actual Settings component
// and navigation module in verify-maintenance-integration.mjs.

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
    tabState: { isCurrent: () => true },
    hasSettled: { value: false },
    requestFailed: { value: false },
    requestGeneration: 1,
    isLoading: { value: false },
    PgcList: { value: [] },
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
  assert.deepEqual(context.PgcList.value, ['current'])
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
    findWatchLaterEntry: () => undefined,
  })
  const fixture = {
    card_goto: 'av',
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
    const context = file === 'ForYou'
      ? await loadSourceModule('../src/contentScripts/views/Home/adapters/recommendationVideo.ts', {
          '~/utils/advertising': await import('../src/utils/advertising'),
          '~/utils/htmlDecode': await import('../src/utils/htmlDecode'),
          '~/utils/uriParse': await import('../src/utils/uriParse'),
          './appRecommendationItem': await import('../src/contentScripts/views/Home/adapters/appRecommendationItem'),
        })
      : await loadSourceFunctions(`../src/contentScripts/views/Home/components/${file}.vue`, [name], { decodeHtmlEntities, isPortraitDimension })
    const appItem = file === 'ForYou'
      ? await loadSourceModule('../src/contentScripts/views/Home/adapters/appRecommendationItem.ts', { '~/utils/bvid': await import('../src/utils/bvid') })
      : null
    const video = context[name](file === 'Trending' ? { item: fixture } : appItem ? appItem.normalizeAppVideoItem(fixture) : fixture, 1)
    assert.equal(await resolver.resolveWatchLaterAid(video), 123, `${file} preserves the authoritative aid`)
  }
  assert.equal(detailRequests, 0, 'known video IDs require no per-card detail API calls')
  assert.equal(await resolver.resolveWatchLaterAid({ id: 999, roomid: 999 }), undefined)
  assert.equal(await resolver.resolveWatchLaterAid({ id: 999, epid: 1 }), 456)
  assert.equal(await resolver.resolveWatchLaterAid({ bvid: 'BV-fixture' }), 123)
  assert.equal(detailRequests, 1, 'a BV without an authoritative aid still resolves normally')
}

async function verifySharedVideoStyles() {
  const settings = ref({ videoCardTitleFontSize: 'base', videoCardAuthorFontSize: 'sm' })
  const context = await loadSourceFunctions('../src/composables/useVideoCardSharedStyles.ts', [
    'VIDEO_CARD_TYPE_ROLES',
    'typeRole',
    'textStyle',
    'useVideoCardSharedStyles',
  ], { computed, settings })
  const cards = Array.from({ length: 200 }, () => context.useVideoCardSharedStyles())
  assert.equal(new Set(cards.map(card => card.textStyle)).size, 1)
  assert.equal(cards[0].textStyle.value['--video-card-title-size'], 'var(--bew-font-size-title)', 'sizes are type tokens that follow the browser font scale')
  settings.value.videoCardTitleFontSize = 'lg'
  assert.equal(cards[199].textStyle.value['--video-card-title-size'], 'var(--bew-font-size-subheading)', 'all cards still react to settings updates')

  for (const [path, title, details, coverGap] of [
    ['../src/components/VideoCard/components/VideoCardInfo.vue', '.video-card-info-title', '.video-card-info', '.video-card-info'],
    ['../src/contentScripts/views/WatchLater/WatchLaterGridCard.vue', '.watch-later-grid-card__title', '.watch-later-grid-card__body', '.watch-later-grid-card'],
  ]) {
    const url = new URL(path, import.meta.url)
    const source = await readFile(url, 'utf8')
    const scss = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1]
    const css = sass.compileString(scss, { url, logger: sass.Logger.silent }).css
    const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replaceAll('.', '\\.')}\\s*\\{([^}]*)\\}`))![1]
    assert.doesNotMatch(rule(title), /(?:^|;)\s*(?:min-|max-)?height\s*:/, `${path}: uploader follows actual title height`)
    assert.match(rule(title), /font-size: var\(--video-card-title-size\)/, `${path}: shared title size`)
    assert.match(rule(title), /font-weight: var\(--bew-font-weight-regular\)/, `${path}: regular album title`)
    assert.match(rule(details), /gap: var\(--bew-space-1\)/, `${path}: consistent title/uploader gap`)
    assert.match(rule(coverGap), /(?:margin-top|gap): var\(--bew-space-3\)/, `${path}: cover gap exceeds text gap`)
  }
  // History rows render the shared video card itself, not a look-alike.
  const history = await readFile(new URL('../src/contentScripts/views/History/History.vue', import.meta.url), 'utf8')
  assert.match(history, /<VideoCard\b[\s\S]{0,400}:video="getHistoryVideo\(item\)"/)
  assert.doesNotMatch(history, /history-list-card/)
}

async function verifyPreferredFontScale() {
  let fontSize = '16px'
  let preferred = '1'
  let mounted = 0
  const context = await loadSourceFunctions('../src/utils/browserFontScale.ts', ['readBrowserFontScale'], {
    document: {
      createElement: () => ({ style: { cssText: '' }, remove: () => mounted-- }),
      documentElement: { append: () => mounted++ },
    },
    getComputedStyle: () => ({ fontSize, getPropertyValue: () => preferred }),
  })
  for (const [pixels, systemScale, expected] of [
    ['16px', '1', 1],
    ['20px', '1', 1.25],
    ['20px', '', 1.25],
    ['24px', '1.5', 1.5],
    ['16px', '0.8', 0.8],
  ] as const) {
    fontSize = pixels
    preferred = systemScale
    assert.equal(context.readBrowserFontScale(), expected, 'OS and browser scaling must not multiply each other')
    assert.equal(mounted, 0, 'the one-shot preference probe is removed')
  }
}

export async function verifyFunctionalAuditFixes() {
  await verifyPreferredFontScale()
  // Search suggestions now mount the real component in verify-maintenance-review.mjs.
  await verifySelectOptionChanges()
  await verifyRankingLoadingEvents()
  await verifyScrollOwnerCleanup()
  await verifyImageReleaseBatch()
  await verifyVideoIdentityReuse()
  await verifySharedVideoStyles()
  // Horizontal rows mount the real component in verify-platform-compatibility.mjs.
  assert.equal(decodeHtmlEntities('&#x1F63A; &#128570; &#x20000;'), '😺 😺 𠀀')
  assert.equal(decodeHtmlEntities('&amp; &copy;'), '& ©')
  assert.equal(decodeHtmlEntities('&#12ab; &#x110000;'), '&#12ab; &#x110000;')
  console.log('Functional audit fix verification passed.')
}
