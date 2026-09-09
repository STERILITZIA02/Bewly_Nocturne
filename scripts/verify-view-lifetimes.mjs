import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerViewLifetimeChecks(check, { Vue, compileComponent, flush }) {
  check('A24 real URL cleaner removes hcfrom only on Bilibili targets while preserving navigation semantics', async () => {
    const { cleanBilibiliUrl, cleanBilibiliShareText } = await import('../src/utils/bilibiliUrl')
    assert.equal(cleanBilibiliUrl('https://www.bilibili.com/video/BVfixture/?hcfrom=share&p=2&t=45#reply'), 'https://www.bilibili.com/video/BVfixture/?p=2&t=45#reply')
    assert.equal(cleanBilibiliUrl('https://b23.tv/fixture?hcfrom=share&t=30'), 'https://b23.tv/fixture?t=30')
    const external = 'https://bilibili.com.example.org/video/?hcfrom=keep&p=3'
    assert.equal(cleanBilibiliUrl(external), external)
    assert.equal(cleanBilibiliShareText('【标题】https://www.bilibili.com/video/BVfixture?hcfrom=share&p=2', { includeTitle: true }), '标题 https://www.bilibili.com/video/BVfixture?p=2')
  })
  check('A14/A15 actual IframePage owns loading, cross-origin commands, URL replacement and teardown', async () => {
    const events = await import('../src/constants/globalEvents')
    const timers = new Map()
    let nextTimer = 0
    const sent = []
    const errors = []
    const released = []
    const reachTop = Vue.ref(true)
    const advance = () => {
      for (const [id, callback] of [...timers]) {
        if (timers.delete(id))
          callback()
      }
    }
    const page = await compileComponent('../src/components/IframePage.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: message => errors.push(message) }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ reachTop }) },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false), isOledDark: Vue.ref(false) }) },
      '~/constants/globalEvents': events,
      '~/logic': { settings: Vue.ref({}) },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getEffectiveTopBarSource: () => 'bewly' }) },
      '~/utils/effectiveTopBarSource': { showNativeBilibiliTopBar: () => false },
      '~/utils/iframeMessage': {
        markIframeReadyForMessaging: () => {},
        getIframeMessageData: event => event.valid ? event.data : undefined,
        postMessageToIframe: (_frame, message) => {
          sent.push(message)
          return true
        },
      },
      '~/utils/mediaResources': { releaseIframeMedia: frame => released.push(frame) },
      '~/utils/main': { isVideoOrBangumiPage: () => false },
    }, { renderTemplate: false, globals: {
      setTimeout: (callback) => {
        timers.set(++nextTimer, callback)
        return nextTimer
      },
      clearTimeout: id => timers.delete(id),
    } })
    const url = Vue.ref('https://t.bilibili.com/')
    let state
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(page, { url: url.value, ref: (value) => {
      if (value)
        state = value.$.setupState
    } }) })
    app.mount(host)
    await flush()
    const oldFrame = document.createElement('iframe')
    const restrictedWindow = {
      get document() {
        throw new Error('cross-origin')
      },
    }
    Object.defineProperty(oldFrame, 'contentWindow', { value: restrictedWindow })
    state.iframeRef = oldFrame
    advance()
    assert.equal(state.showLoading, true)
    state.handleIframeLoad({ currentTarget: oldFrame })
    assert.equal(state.showLoading, false)
    state.handleRefresh()
    const reload = sent.at(-1)
    assert.equal(reload.action, 'reload')
    state.handleBackToTop()
    assert.equal(sent.at(-1), reload, 'scroll cannot swallow the pending refresh deadline')
    state.handleNavigationAck({ valid: false, data: { type: events.IFRAME_NAVIGATION_ACK, requestId: reload.requestId } })
    advance()
    assert.deepEqual(errors, ['common.operation_failed'])
    assert.equal(state.showLoading, false)
    errors.length = 0
    state.handleRefresh()
    const retry = sent.at(-1)
    state.handleNavigationAck({ valid: true, data: { type: events.IFRAME_NAVIGATION_ACK, requestId: retry.requestId } })
    advance()
    assert.equal(state.showLoading, true)
    state.handleIframeLoad({ currentTarget: oldFrame })
    assert.equal(state.showLoading, false)
    assert.equal(errors.length, 0)
    state.handleBackToTop()
    assert.equal(sent.at(-1).action, 'top')
    url.value = 'https://space.bilibili.com/1'
    await flush()
    const newFrame = document.createElement('iframe')
    state.iframeRef = newFrame
    advance()
    state.handleIframeLoad({ currentTarget: oldFrame })
    assert.equal(state.showLoading, true, 'old frame load cannot settle the new navigation')
    assert.equal(released[0], oldFrame)
    assert.equal(state.currentUrl, url.value)
    app.unmount()
    assert.equal(timers.size, 0)
    advance()
    assert.equal(errors.length, 0)
    assert.equal(released.at(-1), newFrame)
    assert.equal(reachTop.value, true)
    host.remove()
  })

  check('A14 child navigation uses the existing parent bridge and preserves the child current URL', async () => {
    const events = await import('../src/constants/globalEvents')
    const actions = []
    const bridge = await loadSourceModule('../src/utils/iframeNavigation.ts', {
      '~/constants/globalEvents': events,
      '~/utils/iframeMessage': {
        getParentMessageData: (event, types) => event.valid && types.includes(event.data.type) ? event.data : undefined,
        postMessageToParent: message => actions.push(message),
      },
    }, { window: { location: { reload: () => actions.push('reload-current') }, scrollTo: options => actions.push(options.top) } })
    bridge.handleIframeNavigationRequest({ valid: false, data: { type: events.IFRAME_NAVIGATION_REQUEST, requestId: 1, action: 'reload' } })
    assert.equal(actions.length, 0)
    bridge.handleIframeNavigationRequest({ valid: true, data: { type: events.IFRAME_NAVIGATION_REQUEST, requestId: 2, action: 'reload' } })
    assert.equal(actions[0].requestId, 2)
    assert.equal(actions[1], 'reload-current')
    bridge.handleIframeNavigationRequest({ valid: true, data: { type: events.IFRAME_NAVIGATION_REQUEST, requestId: 3, action: 'top' } })
    assert.equal(actions[3], 0)
  })

  check('A11 mounted tab lifetimes transfer lists/history exclusively and invalidate late continuations', async () => {
    const { provideHomeTabCache, useHomeTabState } = await import('../src/composables/useHomeTabState')
    const { useRecommendationHistory } = await import('../src/contentScripts/views/Home/useRecommendationHistory')
    const key = Vue.ref('forYou:web')
    const generation = Vue.ref(0)
    let active
    let cache
    let mounted = 0
    const tab = {
      setup() {
        mounted++
        const lifetime = useHomeTabState()
        const items = lifetime.ref('items', [{ id: 'initial' }])
        const history = useRecommendationHistory(lifetime)
        active = { lifetime, items, history }
        Vue.onBeforeUnmount(() => mounted--)
        return () => Vue.h('div', { 'data-tab': key.value }, String(items.value.length))
      },
    }
    const app = Vue.createApp({ setup() {
      cache = provideHomeTabCache(() => key.value, () => {})
      return () => Vue.h(tab, { key: `${generation.value}:${key.value}` })
    } })
    const host = document.body.appendChild(document.createElement('div'))
    app.mount(host)
    active.items.value = Array.from({ length: 2000 }, (_, id) => ({ id }))
    const first = active
    const data = Vue.toRaw(first.items.value)
    first.history.remember({ videoList: data, appVideoList: [], webShowlistGroups: [], refreshIdx: 1 })
    key.value = 'trending'
    assert.equal(first.lifetime.isCurrent(), false)
    await flush()
    assert.equal(mounted, 1)
    assert.equal(host.querySelectorAll('[data-tab]').length, 1)
    key.value = 'forYou:web'
    await flush()
    assert.equal(Vue.toRaw(active.items.value), data)
    assert.equal(active.history.canUndo.value, true)
    const restored = active.history.undo({ videoList: [{ id: 'new' }], appVideoList: [], webShowlistGroups: [] })
    assert.equal(restored.videoList.length, 2000)
    assert.equal(active.history.canRedo.value, true)
    assert.equal(active.history.redo(restored).videoList[0].id, 'new')
    assert.equal(cache.take(key.value), undefined, 'active snapshot was consumed')
    const oldOwner = active
    let obsoleteReads = 0
    const releaseSnapshot = oldOwner.lifetime.capture('expensive', () => {
      obsoleteReads++
      return []
    })
    cache.clear()
    releaseSnapshot()
    generation.value++
    await flush()
    assert.equal(oldOwner.lifetime.isCurrent(), false)
    assert.equal(obsoleteReads, 0, 'invalid generations exit before evaluating snapshot getters')
    assert.equal(active.items.value.length, 1)
    app.unmount()
    assert.equal(mounted, 0)
    host.remove()
  })
}
