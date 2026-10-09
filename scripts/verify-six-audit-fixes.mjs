import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

export function registerSixAuditFixChecks(check, { Vue, compileComponent, flush }) {
  const accountScope = () => import('../src/utils/accountScope')

  check('C02/C03: subscribed series consumes terminal pages once, deduplicates stalled cursors and rejects cookie changes', async () => {
    const calls = []
    const store = Vue.reactive({ userInfo: { mid: 100 } })
    let cookie = '100'
    const Series = await compileComponent('../src/contentScripts/views/Home/components/SubscribedSeries.vue', {
      '~/components/VideoCardGrid.vue': { default: { render: () => null } },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ handleReachBottom: Vue.ref(), handlePageRefresh: Vue.ref() }) },
      '~/composables/useHomeTabState': await import('../src/composables/useHomeTabState'),
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/accountScope': await accountScope(),
      '~/utils/api': { default: { moment: { getMoments: (params) => {
        const request = deferred()
        calls.push({ ...request, params })
        return request.promise
      } } } },
      '~/utils/htmlDecode': { decodeHtmlEntities: value => value },
      '~/utils/main': { getUserID: () => cookie },
      '~/utils/messaging': { reportRuntimeFailure() {} },
    }, { renderTemplate: false })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Series, { gridLayout: 'adaptive' })
    const instance = app.mount(host)
    const state = instance.$.setupState
    const item = id => ({ id_str: id, modules: { module_author: { mid: 10, name: 'fixture' }, module_dynamic: { major: { pgc: { title: id, stat: {}, epid: 1 } } } } })
    const response = (ids, offset, hasMore) => ({ code: 0, data: { items: ids.map(item), offset, has_more: hasMore, update_baseline: '' } })
    try {
      calls[0].resolve(response(['one'], 'terminal', false))
      await flush()
      assert.equal(calls.length, 1)
      assert.equal(state.videoList.length, 1)
      assert.equal(state.noMoreContent, true)
      const refresh = state.initData()
      calls[1].resolve(response(['one', 'one'], 'cursor', true))
      await flush()
      calls[2].resolve(response(['one', 'two'], 'cursor', true))
      await refresh
      assert.deepEqual(Array.from(state.videoList, entry => entry.uniqueId), ['one', 'two'])
      assert.equal(state.noMoreContent, true, 'a cursor that does not advance stops automatic requests')
      const stale = state.initData()
      cookie = '200'
      calls[3].resolve(response(['old-account'], 'next', true))
      await stale
      assert.equal(state.videoList.length, 0)
      assert.equal(state.isLoading, false)
      await state.initData()
      assert.equal(calls.length, 4, 'profile/Cookie disagreement sends no new request')
      store.userInfo.mid = 200
      await flush()
      calls[4].resolve(response(['new-account'], 'end', false))
      await flush()
      assert.equal(state.videoList[0].uniqueId, 'new-account')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('C03: anime drops old-account reads before profile refresh and releases its loading state', async () => {
    const calls = []
    const store = Vue.reactive({ userInfo: { mid: 100 } })
    let cookie = '100'
    const Anime = await compileComponent('../src/contentScripts/views/Anime/Anime.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ handleReachBottom: Vue.ref(), handlePageRefresh: Vue.ref() }) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/models/anime/watchList': await import('../src/models/anime/watchList'),
      '~/utils/accountScope': await accountScope(),
      '~/utils/api': { default: { anime: {
        getAnimeWatchList: (params) => {
          const request = deferred()
          calls.push({ ...request, params })
          return request.promise
        },
        getPopularAnimeList: async () => ({ code: 0, result: { list: [] } }),
        getRecommendAnimeList: async () => ({ code: 0, data: { items: [], has_next: false } }),
      } } },
      '~/utils/dataFormatter': { numFormatter: String },
      '~/utils/main': { getUserID: () => cookie, openLinkToNewTab() {} },
      '~/utils/messaging': { reportRuntimeFailure() {} },
      './components/AnimeTimeTable.vue': { default: { render: () => null } },
    }, { renderTemplate: false })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Anime)
    const state = app.mount(host).$.setupState
    try {
      assert.equal(calls[0].params.vmid, '100')
      cookie = '200'
      calls[0].resolve({ code: 0, data: { list: [{ title: 'old' }] } })
      await flush()
      assert.equal(state.animeWatchList.length, 0)
      assert.equal(state.isLoadingAnimeWatchList, false)
      await state.getAnimeWatchList()
      assert.equal(calls.length, 1)
      store.userInfo.mid = 200
      await flush()
      assert.equal(calls[1].params.vmid, '200')
      calls[1].resolve({ code: 0, data: { list: [{ title: 'new' }] } })
      await flush()
      assert.equal(state.animeWatchList[0].title, 'new')
      cookie = undefined
      store.userInfo.mid = 0
      await flush()
      assert.equal(calls.length, 2, 'anonymous pages do not fetch a personal watchlist')
      assert.equal(state.animeWatchList.length, 0)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  async function storageModule() {
    const messaging = await loadSourceModule('../src/utils/messaging.ts', { 'webextension-polyfill': { default: {} }, '~/utils/abort': await import('../src/utils/abort'), '~/constants/apiRequest': await import('../src/constants/apiRequest') })
    return loadSourceModule('../src/composables/useStorageLocal.ts', {
      'vue': Vue,
      'webextension-polyfill': { default: {} },
      '~/utils/messaging': messaging,
      '~/utils/storageInitialization': await import('../src/utils/storageInitialization'),
    })
  }
  function storageRuntime(read) {
    const timers = new Map()
    const writes = []
    const errors = []
    let listener
    let id = 0
    return {
      timers,
      writes,
      errors,
      changed: change => listener?.({ fixture: change }, 'local'),
      subscribed: () => !!listener,
      runtime: {
        get: read,
        set: async value => writes.push(value),
        remove: async () => writes.push(null),
        subscribe: (callback) => {
          listener = callback
          return () => {
            listener = undefined
          }
        },
        setTimeout: (callback) => {
          timers.set(++id, callback)
          return id
        },
        clearTimeout: timer => timers.delete(timer),
        sleep: async () => {},
      },
    }
  }

  check('C04: initial storage read reconciles updates, deletion and async decoding without losing local edits', async () => {
    const { useStorageLocal } = await storageModule()
    for (const kind of ['update', 'delete', 'decode', 'local-edit']) {
      const initial = deferred()
      const decode = deferred()
      const fixture = storageRuntime(() => initial.promise)
      const scope = Vue.effectScope()
      const value = scope.run(() => useStorageLocal('fixture', 'default', {
        runtime: fixture.runtime,
        writeDefaults: false,
        onError: error => fixture.errors.push(error),
        serializer: { read: raw => raw === 'slow' ? decode.promise : raw, write: raw => raw },
      }))
      assert.equal(fixture.subscribed(), true)
      if (kind === 'decode') {
        initial.resolve({ fixture: 'slow' })
        await flush()
        await fixture.changed({ newValue: 'latest' })
        decode.reject(new Error('superseded decode'))
      }
      else {
        if (kind === 'local-edit')
          value.value = 'local'
        await fixture.changed({ newValue: 'intermediate' })
        await fixture.changed(kind === 'delete' ? { oldValue: 'intermediate' } : { newValue: 'latest' })
        initial.resolve({ fixture: 'stale' })
      }
      await flush()
      assert.equal(value.value, kind === 'local-edit' ? 'local' : kind === 'delete' ? 'default' : 'latest')
      assert.equal(value.initializationState.value, 'loaded')
      assert.equal(fixture.writes.length, kind === 'local-edit' ? 1 : 0)
      assert.equal(fixture.errors.length, 0)
      scope.stop()
      assert.equal(fixture.subscribed(), false)
    }
  })

  check('C05: invalid storage context terminates initial read, recovery and writes while ordinary failure remains recoverable', async () => {
    const { useStorageLocal } = await storageModule()
    for (const phase of ['initial', 'recovery', 'write']) {
      let reads = 0
      let failure = phase === 'initial' ? 'Extension context invalidated.' : phase === 'recovery' ? 'temporary failure' : ''
      const fixture = storageRuntime(async () => {
        reads++
        if (failure)
          throw new Error(failure)
        return { fixture: 'stored' }
      })
      const scope = Vue.effectScope()
      const value = scope.run(() => useStorageLocal('fixture', 'default', { runtime: fixture.runtime, writeDefaults: false, onError: error => fixture.errors.push(error) }))
      await flush()
      await flush()
      if (phase === 'recovery') {
        assert.equal(value.initializationState.value, 'degraded')
        assert.equal(reads, 3)
        assert.equal(fixture.errors.length, 1)
        failure = 'Extension context invalidated.'
        const [timer, callback] = [...fixture.timers][0]
        fixture.timers.delete(timer)
        await callback()
      }
      if (phase === 'write') {
        fixture.runtime.set = async () => {
          throw new Error('Extension context invalidated.')
        }
        value.value = 'edit'
        await flush()
      }
      assert.equal(value.initializationState.value, 'invalidated')
      assert.equal(fixture.subscribed(), false)
      assert.equal(fixture.timers.size, 0)
      assert.equal(fixture.errors.length, phase === 'recovery' ? 1 : 0)
      const stoppedReads = reads
      value.value = 'after invalidation'
      await flush()
      assert.equal(reads, stoppedReads)
      assert.equal(fixture.writes.length, 0)
      scope.stop()
    }
  })

  check('C06: episode links support keyboard opening, Escape, outside click and focus leave with original destinations', async () => {
    const popupHost = document.body.appendChild(document.createElement('div'))
    const outside = document.body.appendChild(document.createElement('button'))
    const EpisodeSelect = await compileComponent('../src/components/MediaEpisodeSelect/MediaEpisodeSelect.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(popupHost) }) },
      '~/composables/useFloatingMenuPosition': { useFloatingMenuPosition: () => ({ position: Vue.ref({ top: 0, left: 0, width: 200, maxHeight: 300 }), start() {}, stop() {}, scheduleUpdate() {} }) },
      '~/constants/layout': { MEDIA_EPISODE_MENU_MAX_HEIGHT: 300 },
    }, { globals: { URL } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(EpisodeSelect, { episodes: [{ id: '1', title: 'One', url: '/bangumi/play/ep1' }, { id: '2', title: 'Two', url: '/bangumi/play/ep2' }] })
    const Link = await compileComponent('../src/components/ALink.vue', {
      '~/components/TopBar/composables/useTopBarInteraction': { resetTopBarTransientInteraction() {} },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ openIframeDrawer() {}, activatedPage: Vue.ref('SearchResults') }) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.ref(window.location.href) },
      '~/logic': { settings: Vue.ref({ videoCardLinkOpenMode: 'newTab' }) },
      '~/utils/configuredLinkNavigation': { resolveConfiguredLinkAction: mode => mode },
      '~/utils/linkNavigation': await import('../src/utils/linkNavigation'),
      '~/utils/main': { openLinkToNewTab() {} },
      '~/utils/tabs': { openLinkInBackground() {} },
    })
    app.component('ALink', Link)
    app.mount(host)
    const trigger = host.querySelector('button')
    const key = (target, name) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
    try {
      trigger.focus()
      trigger.click()
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      assert.equal(document.activeElement.textContent.trim(), 'One')
      // Let the mount event task finish before dispatching the next user event;
      // Vue guards newly attached parent listeners against the original event.
      await new Promise(resolve => setTimeout(resolve, 2))
      key(document.activeElement, 'ArrowDown')
      await flush()
      assert.equal(document.activeElement.textContent.trim(), 'Two')
      assert.equal(document.activeElement.getAttribute('href'), '/bangumi/play/ep2')
      assert.equal(document.activeElement.getAttribute('target'), '_blank')
      key(document.activeElement, 'Escape')
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      trigger.click()
      await flush()
      await new Promise(resolve => setTimeout(resolve, 2))
      document.activeElement.addEventListener('click', event => event.preventDefault(), { once: true })
      document.activeElement.click()
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'configured navigation still closes its owning episode popup')
      assert.equal(document.activeElement, trigger)
      key(trigger, 'ArrowUp')
      await flush()
      assert.equal(document.activeElement.textContent.trim(), 'Two')
      outside.click()
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'outside click does not require mouseleave')
      trigger.click()
      await flush()
      outside.focus()
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    }
    finally {
      app.unmount()
      host.remove()
      popupHost.remove()
      outside.remove()
    }
  })
}
