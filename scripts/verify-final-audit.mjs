import assert from 'node:assert/strict'
import process from 'node:process'

import { dataFormatterFixture, loadSourceModule } from './sourceModuleHarness'

export function registerFinalAuditChecks(check, { Vue, flush }) {
  check('final audit: count formatting and filtering share supported units without inventing digits', async () => {
    const { LanguageType } = await import('../src/enums/appEnums')
    const settings = Vue.ref({ language: LanguageType.English, enableFilterByViewCount: true, filterByViewCount: 1000 })
    const formatter = await dataFormatterFixture({ settings })
    for (const [input, expected] of [['1.2K', 1200], ['2.4 M', 2_400_000], ['1.2千万', 12_000_000], ['1,234', 1234], ['-5', -5], ['--', undefined], ['1,2,3', undefined], ['BV17x411w7KC', undefined]])
      assert.equal(formatter.parseStatNumber(input), expected, input)
    assert.equal(formatter.numFormatter('BV17x411w7KC'), 'BV17x411w7KC')
    for (const language of [LanguageType.English, LanguageType.Mandarin_CN, LanguageType.Mandarin_TW, LanguageType.Cantonese]) {
      settings.value.language = language
      assert.equal(formatter.parseStatNumber(formatter.numFormatter(12_000_000)), 12_000_000)
    }
    const filters = await loadSourceModule('../src/composables/useFilter.ts', {
      '~/logic': { settings },
      '~/utils/dataFormatter': formatter,
      '~/utils/filterRules': await import('../src/utils/filterRules'),
      '~/utils/regexBatchRunner': { createRegexBatchRunner: () => ({ dispose() {} }) },
      '~/utils/uriParse': { isVerticalVideo: () => false },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: assert.fail }) },
    }, Vue)
    const scope = Vue.effectScope()
    try {
      const filter = scope.run(() => filters.useFilter([], [filters.FilterType.viewCountStr], [['view']]))
      assert.deepEqual(await filter.value(['1.2K', '900', '1.2千万', 'BV17'].map(view => ({ view }))), [true, false, true, false])
    }
    finally { scope.stop() }
  })

  check('final audit: Favorites cancels queued reads before API entry while another consumer retains its request', async () => {
    const { createFavoriteReads } = await import('../src/contentScripts/views/Favorites/favoriteReads')
    const calls = []
    const held = Promise.withResolvers()
    const reader = createFavoriteReads({ getFavoriteResources: (params, options) => {
      calls.push({ params, signal: options.signal })
      return held.promise
    } }, () => 1)
    try {
      const first = new AbortController()
      const cancelled = reader.reads.getFavoriteResources({ media_id: 1 }, { signal: first.signal })
      first.abort()
      await assert.rejects(cancelled, { name: 'AbortError' })
      await flush()
      assert.equal(calls.length, 0, 'no abandoned background read starts')
      const second = new AbortController()
      const retired = reader.reads.getFavoriteResources({ media_id: 1 }, { signal: second.signal })
      const retained = reader.reads.getFavoriteResources({ media_id: 1 })
      second.abort()
      await assert.rejects(retired, { name: 'AbortError' })
      await flush()
      assert.equal(calls.length, 1)
      assert.equal(calls[0].signal.aborted, false)
      held.resolve({ code: 0, data: { medias: [], has_more: false, info: { id: 1 } } })
      assert.equal((await retained).code, 0)
    }
    finally { reader.dispose() }
  })

  check('final audit: yesterday follows the local calendar across daylight saving changes', async () => {
    const timezone = process.env.TZ
    process.env.TZ = 'Pacific/Auckland'
    try {
      const now = new Date(2026, 8, 28, 12).getTime()
      class FixedDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])) }
      }
      const formatter = await loadSourceModule('../src/utils/dataFormatter.ts', {
        '~/logic': { settings: { value: { language: 'en' } } },
        '~/utils/i18n': { i18n: { global: { t: key => key } } },
        './../enums/appEnums': await import('../src/enums/appEnums'),
      }, { Date: FixedDate })
      assert.equal(formatter.calcTimeSince(new Date(2026, 8, 27, 12)), 'common.yesterday')
      assert.equal(formatter.calcTimeSince(new Date(2026, 8, 28, 10)), '2 common.hour')
    }
    finally {
      if (timezone === undefined)
        delete process.env.TZ
      else process.env.TZ = timezone
    }
  })

  check('final audit: Navigation events replace route polling and both event/fallback owners release', async () => {
    for (const supported of [true, false]) {
      const events = new Map()
      const timers = new Map()
      const navigation = new window.EventTarget()
      const doc = { hidden: false, addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) }
      const browser = { location: { href: 'https://www.bilibili.com/' }, history: { state: null }, navigation: supported ? navigation : undefined, addEventListener: doc.addEventListener, removeEventListener: doc.removeEventListener }
      const route = await loadSourceModule('../src/composables/useRouteState.ts', { vue: Vue }, {
        window: browser,
        document: doc,
        setTimeout: (callback) => {
          timers.set(callback, true)
          return callback
        },
        clearTimeout: callback => timers.delete(callback),
      })
      const changes = []
      const state = route.useRouteState()
      route.onRouteChange(value => changes.push(value.href))
      assert.equal(timers.size, supported ? 0 : 1)
      browser.location.href = 'https://www.bilibili.com/video/av1/'
      if (supported)
        navigation.dispatchEvent(new Event('currententrychange'))
      else
        events.get('pushstate')()
      await flush()
      assert.equal(state.href, browser.location.href)
      assert.equal(changes.length, 1)
      doc.hidden = true
      events.get('visibilitychange')()
      assert.equal(timers.size, 0)
      route.stopRouteObserver()
      assert.equal(events.size, 0)
      browser.location.href = 'https://www.bilibili.com/video/av2/'
      navigation.dispatchEvent(new Event('currententrychange'))
      await flush()
      assert.equal(changes.length, 1)
    }
  })
}
