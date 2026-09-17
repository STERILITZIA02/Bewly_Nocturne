import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerWhisperInteractionChecks(check, { Vue, compileComponent, flush }) {
  const path = '../src/contentScripts/views/Notifications/whisper/'
  const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((yes, no) => {
      resolve = yes
      reject = no
    })
    return { promise, resolve, reject }
  }
  const catalogResponse = { code: 0, data: { packages: [
    { id: 1, text: '默认', emote: [{ id: 11, text: '[微笑]', url: 'https://i0.hdslb.com/smile.png', type: 1, meta: { size: 1 } }] },
    { id: 2, text: '已购', emote: [{ id: 21, text: '[已购_开心]', gif_url: 'https://i0.hdslb.com/happy.gif', type: 3, meta: { size: 2 } }] },
    { id: 3, text: '收藏', emote: [{ id: 31, text: '[收藏_好耶]', url: 'https://i0.hdslb.com/favorite.png', type: 2 }] },
    { id: 4, text: '颜文字', emote: [{ id: 41, text: '(=・ω・=)', type: 4 }] },
  ] } }
  const i18n = { useI18n: () => ({ t: key => key, locale: Vue.ref('cmn-CN') }) }
  const blank = { render: () => null }
  const inputResizeCallbacks = new Map()
  const useInputResizeObserver = (target, callback) => {
    Vue.watch(target, (element, previous) => {
      if (previous)
        inputResizeCallbacks.delete(previous)
      if (element)
        inputResizeCallbacks.set(element, callback)
    }, { flush: 'post' })
    Vue.onBeforeUnmount(() => inputResizeCallbacks.delete(target.value))
  }
  const button = { props: ['label', 'disabled'], setup: (props, { slots }) => () => Vue.h('button', { 'type': 'button', 'aria-label': props.label, 'disabled': props.disabled }, slots.default?.()) }
  const installLeaves = (app) => {
    for (const name of ['Button', 'IconButton', 'CloseButton'])
      app.component(name, button)
    app.component('Tooltip', { props: ['content', 'placement'], setup: (_, { slots }) => () => slots.default?.() })
    app.component('Empty', { props: ['description'], setup: props => () => Vue.h('p', props.description) })
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
  }

  check('Whisper reading anchor: prepends preserve the visible message; newer reading intent and replaced viewports reject restoration', async () => {
    const frames = new Map()
    let id = 0
    const module = await loadSourceModule(`${path}useConversationViewport.ts`, { vue: Vue, './conversationExpansion': await import(`${path}conversationExpansion`) }, {
      AbortController,
      WheelEvent: window.WheelEvent,
      KeyboardEvent: window.KeyboardEvent,
      PointerEvent: window.PointerEvent ?? class extends window.MouseEvent {},
      TouchEvent: window.TouchEvent,
      requestAnimationFrame: (callback) => {
        frames.set(++id, callback)
        return id
      },
      cancelAnimationFrame: key => frames.delete(key),
    })
    let reading
    const saved = []
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      reading = module.useConversationViewport({ active: () => true, ready: () => true, canProcess: () => true, talkerId: () => 'A', save: (...args) => saved.push(args), onFrame() {} })
      return () => Vue.h('div', { ref: reading.messageScrollRef }, [Vue.h('div', { 'data-message-id': 'first' }), Vue.h('div', { 'data-message-id': 'anchor' })])
    } })
    app.mount(host)
    const viewport = reading.messageScrollRef.value
    viewport.getBoundingClientRect = () => ({ top: 100 })
    let growth = 0
    Object.defineProperties(viewport, { scrollHeight: { get: () => 1000 + growth }, clientHeight: { value: 400 } })
    viewport.scrollTop = 200
    for (const [index, row] of [...viewport.children].entries()) {
      row.getBoundingClientRect = () => {
        const top = 100 + (index ? 230 : 100) + growth - viewport.scrollTop
        return { top, bottom: top + 40 }
      }
    }
    try {
      const anchor = reading.captureReadingAnchor()
      growth = 120
      anchor.restore()
      assert.equal(viewport.scrollTop, 320)
      assert.equal(saved.at(-1)[0], 'A')
      const beforeInteraction = reading.captureReadingAnchor()
      reading.markReadingIntent(new window.WheelEvent('wheel', { deltaY: -1 }))
      viewport.scrollTop = 100
      growth = 200
      beforeInteraction.restore()
      assert.equal(viewport.scrollTop, 100, 'new reading intent wins over pagination restoration')
      const oldViewport = reading.captureReadingAnchor()
      reading.messageScrollRef.value = document.createElement('div')
      oldViewport.restore()
      assert.equal(reading.messageScrollRef.value.scrollTop, 0)
    }
    finally {
      app.unmount()
      host.remove()
    }
    assert.equal(frames.size, 0)
  })

  check('Whisper history: entry gates requests, switching preserves the shell/composer, and late history never crosses conversations', async () => {
    const frames = new Map()
    const timers = new Map()
    let id = 0
    const clock = {
      AbortController,
      KeyboardEvent: window.KeyboardEvent,
      WheelEvent: window.WheelEvent,
      PointerEvent: window.PointerEvent ?? class extends window.MouseEvent {},
      TouchEvent: window.TouchEvent,
      requestAnimationFrame: (run) => {
        frames.set(++id, run)
        return id
      },
      cancelAnimationFrame: id => frames.delete(id),
      setTimeout: (run, delay) => {
        timers.set(++id, { run, delay })
        return id
      },
      clearTimeout: id => timers.delete(id),
      ResizeObserver: class { observe() {} disconnect() {} },
    }
    const stepFrame = () => {
      const batch = [...frames.values()]
      frames.clear()
      batch.forEach(run => run())
    }
    const settleExpansion = () => {
      const timer = [...timers].find(([, value]) => value.delay === 200)
      assert.ok(timer, 'the existing expansion duration owns request release')
      timers.delete(timer[0])
      timer[1].run()
    }
    const oldMatchMedia = window.matchMedia
    const oldRequestFrame = globalThis.requestAnimationFrame
    const oldCancelFrame = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = clock.requestAnimationFrame
    globalThis.cancelAnimationFrame = clock.cancelAnimationFrame
    const oldScrollTo = window.HTMLElement.prototype.scrollTo
    const oldRect = window.HTMLElement.prototype.getBoundingClientRect
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      return { x: 0, y: 0, top: 0, bottom: 600, left: 0, right: 900, width: 900, height: 600 }
    }
    window.matchMedia = () => ({ matches: false, addEventListener() {} })
    window.HTMLElement.prototype.scrollTo = function ({ top }) {
      this.scrollTop = top
    }
    const { usePrivateMessages } = await import(`${path}usePrivateMessages`)
    const scope = Vue.effectScope()
    const account = Vue.ref('1')
    const topBar = Vue.reactive({ userInfo: { mid: 1 } })
    const selected = Vue.ref('2')
    const active = Vue.ref(true)
    const requests = []
    let ackCount = 0
    const reader = scope.run(() => usePrivateMessages(account, selected, {
      fetchMessages: (options) => {
        const task = deferred()
        requests.push({ ...options, ...task })
        return task.promise
      },
      ackSession: async () => {
        ackCount++
        return { code: 0, data: null }
      },
      getCsrf: () => 'fixture',
      markSessionRead() {},
      syncUnread: async () => {},
    }))
    const Content = await compileComponent(`${path}PrivateMessageContent.vue`, {
      'vue-i18n': i18n,
      '~/utils/notificationRoute': await import('../src/utils/notificationRoute'),
    })
    const Item = await compileComponent(`${path}PrivateMessageItem.vue`, {
      'vue-i18n': i18n,
      './PrivateMessageContent.vue': { default: Content },
      './privateSession': await import(`${path}privateSession`),
    })
    const Composer = await compileComponent(`${path}experimental/MessageComposer.vue`, {
      '@vueuse/core': { ...await import('@vueuse/core'), useResizeObserver: useInputResizeObserver },
      'vue-i18n': i18n,
      '../PrivateEmotePicker.vue': { default: blank },
      '../privateMessageRenderers': await import(`${path}privateMessageRenderers`),
      '~/utils/privateMessageImage': await import('../src/utils/privateMessageImage'),
    })
    const writeStates = new Map()
    const writer = {
      getState(talkerId) {
        if (!writeStates.has(talkerId))
          writeStates.set(talkerId, Vue.reactive({ draft: `draft-${talkerId}`, items: [], sending: false, imageDraft: null }))
        return writeStates.get(talkerId)
      },
      setDraft(talkerId, value) { this.getState(talkerId).draft = value },
    }
    const View = await compileComponent(`${path}ConversationView.vue`, {
      'vue-i18n': i18n,
      '~/constants/layout': await import('../src/constants/layout'),
      '~/logic': { settings: Vue.ref({ autoMarkPrivateMessagesRead: true, followNewPrivateMessages: true, autoLoadPrivateMessageImages: true }) },
      '~/stores/topBarStore': { useTopBarStore: () => topBar },
      './conversationExpansion': await import(`${path}conversationExpansion`),
      './useConversationViewport': await loadSourceModule(`${path}useConversationViewport.ts`, { vue: Vue, './conversationExpansion': await import(`${path}conversationExpansion`) }, clock),
      './useConversationPresentation': await loadSourceModule(`${path}useConversationPresentation.ts`, { vue: Vue, '~/constants/layout': await import('../src/constants/layout'), './conversationExpansion': await import(`${path}conversationExpansion`) }, clock),
      './experimental/MessageComposer.vue': { default: Composer },
      './PrivateMessageImageViewer.vue': { default: blank },
      './PrivateMessageItem.vue': { default: Item },
    }, { globals: clock })
    const host = document.body.appendChild(document.createElement('div'))
    let exposed
    const app = Vue.createApp({ render: () => Vue.h(View, {
      key: account.value,
      ref: value => exposed = value,
      active: active.value,
      controller: reader,
      writeController: writer,
      emoteController: { packages: Vue.ref([]), loading: Vue.ref(false), failed: Vue.ref(false), load() {} },
      session: { talkerId: selected.value, name: 'Fixture', ackSeqno: '0', maxSeqno: '1', unreadCount: 1, capabilities: { canAck: true, canSend: true } },
    }) })
    installLeaves(app)
    const response = (text, count = 1, firstSeqno = 1, hasMore = 0) => ({ code: 0, data: { has_more: hasMore, min_seqno: '1', max_seqno: String(firstSeqno + count - 1), e_infos: [], messages: Array.from({ length: count }, (_, index) => ({
      sender_uid: '2',
      receiver_id: '1',
      receiver_type: 1,
      msg_type: 1,
      msg_key: `${text}-${index}`,
      msg_seqno: String(index + firstSeqno),
      timestamp: 1700000000,
      msg_status: 0,
      content: JSON.stringify({ content: text }),
    })) } })
    try {
      app.mount(host)
      await flush()
      assert.equal(requests.length, 0)
      await exposed.refresh()
      assert.equal(requests.length, 0, 'polling/manual refresh cannot bypass the entry phase')
      stepFrame()
      await flush()
      assert.equal(requests.length, 0)
      assert.equal(host.querySelector('[data-expansion-state]').dataset.expansionState, 'expanded')
      selected.value = '3'
      await flush()
      assert.equal(timers.size, 1, 'a switch during entry retains the same expansion and releases only the latest selection')
      settleExpansion()
      await flush()
      assert.deepEqual(requests.map(request => request.talkerId), ['3'])
      assert.equal(host.querySelector('[data-bew-skeleton]'), null)
      requests[0].resolve(response('history-A', 3, 11, 1))
      await flush()
      assert.ok(host.textContent.includes('history-A'))
      stepFrame()
      await flush()
      assert.equal(host.querySelector('[data-expansion-state]').dataset.expansionState, 'expanded', 'initial latest position keeps the entry expanded')
      assert.equal(ackCount, 0, 'transparent entering rows are not acknowledged before reveal')
      const rows = [...host.querySelectorAll('[data-message-id]')]
      assert.deepEqual(rows.map(row => row.style.getPropertyValue('--conversation-message-delay')), ['0ms', '35ms', '70ms'])
      rows[0].dispatchEvent(new Event('animationend', { bubbles: true }))
      await flush()
      assert.equal(ackCount, 0, 'the first row finishing cannot acknowledge still-hidden later rows')
      rows.at(-1).dispatchEvent(new Event('animationend', { bubbles: true }))
      await flush()
      assert.equal(ackCount, 1)
      const viewport = host.querySelector('.conversation-view__messages')
      Object.defineProperties(viewport, { clientHeight: { value: 600 }, scrollHeight: { value: 1600 } })
      const expandedStyle = host.querySelector('.conversation-view').getAttribute('style')
      for (const [top, direction] of [[100, -1], [1000, 1], [0, -1], [1000, 1]]) {
        viewport.scrollTop = top
        viewport.dispatchEvent(new window.WheelEvent('wheel', { deltaY: direction, bubbles: true }))
        viewport.dispatchEvent(new Event('scroll'))
        stepFrame()
        await flush()
        assert.equal(host.querySelector('[data-expansion-state]').dataset.expansionState, 'expanded')
        assert.equal(host.querySelector('.conversation-view').getAttribute('style'), expandedStyle, 'wheel scroll and returning to latest never change the container geometry')
      }
      for (const [key, top] of [['Home', 0], ['End', 1000]]) {
        viewport.scrollTop = top
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
        viewport.dispatchEvent(new Event('scroll'))
        stepFrame()
        await flush()
        assert.equal(host.querySelector('.conversation-view').getAttribute('style'), expandedStyle, 'keyboard history navigation also retains the expanded container')
      }
      reader.getState('3').newMessagesAvailable = true
      await flush()
      host.querySelector('.conversation-view__new-messages').click()
      stepFrame()
      await flush()
      assert.equal(host.querySelector('.conversation-view').getAttribute('style'), expandedStyle, 'the latest-message shortcut only scrolls the timeline')
      assert.equal(requests[1].endSeqno, '11', 'upward reading still requests history from the authoritative boundary')
      requests[1].resolve(response('older-history', 2, 9))
      await flush()
      stepFrame()
      await flush()
      assert.ok(host.textContent.includes('older-history'))
      assert.equal(host.querySelectorAll('[data-message-id]').length, 5)
      assert.equal(host.querySelector('.conversation-view').getAttribute('style'), expandedStyle, 'a late history page and its no-more flag never collapse the container')
      const shell = host.querySelector('.conversation-card')
      const composer = host.querySelector('.conversation-view__floating-composer')
      const textarea = composer.querySelector('textarea')
      assert.equal(host.querySelector('.conversation-view__close'), null)
      textarea.value = 'saved draft for 3'
      textarea.dispatchEvent(new Event('input'))
      const previousHistory = host.querySelector('.conversation-view__history')
      Object.assign(previousHistory.style, { transitionDuration: '1s', transitionProperty: 'opacity', transitionDelay: '0s' })
      selected.value = '4'
      await flush()
      assert.equal(previousHistory.inert, true)
      assert.equal(host.querySelector('.conversation-card'), shell)
      assert.equal(host.querySelector('.conversation-view__floating-composer'), composer)
      assert.equal(composer.querySelector('textarea'), textarea)
      assert.equal(textarea.value, 'draft-4')
      assert.equal(writer.getState('3').draft, 'saved draft for 3')
      assert.ok(host.textContent.includes('history-A'), 'outgoing records remain only during their leave animation')
      await exposed.refresh()
      assert.equal(requests.length, 2)
      selected.value = '5'
      await flush()
      stepFrame()
      await flush()
      stepFrame()
      await flush()
      previousHistory.dispatchEvent(new Event('transitionend'))
      await flush()
      assert.equal(requests[2].talkerId, '5', 'rapid switches skip the intermediate conversation request')
      assert.equal(host.querySelector('.conversation-card'), shell)
      assert.equal(host.querySelector('.conversation-view__floating-composer'), composer)
      assert.equal(host.querySelector('.conversation-view').getAttribute('style'), expandedStyle)
      assert.equal(textarea.value, 'draft-5')
      selected.value = '6'
      await flush()
      stepFrame()
      await flush()
      stepFrame()
      await flush()
      requests[2].resolve(response('stale-B'))
      await flush()
      assert.equal(host.textContent.includes('stale-B'), false)
      const beforeHiddenAck = ackCount
      active.value = false
      await flush()
      requests[3].resolve(response('hidden-C'))
      await flush()
      stepFrame()
      assert.equal(ackCount, beforeHiddenAck, 'hidden history cannot become eligible for ACK')
      assert.equal(timers.size, 0, 'hiding cancels presentation timers')
      active.value = true
      await flush()
      stepFrame()
      await flush()
      settleExpansion()
      await flush()
      assert.equal(requests[4].talkerId, '6')
      requests[4].resolve(response('restored-C'))
      await flush()
      assert.equal(host.querySelector('.conversation-card'), shell, 'hide/reopen also keeps the outer shell')
      assert.equal(writer.getState('3').draft, 'saved draft for 3')
      topBar.userInfo.mid = 9
      account.value = '9'
      app.unmount()
      await flush()
      stepFrame()
      await flush()
      stepFrame()
      assert.equal(reader.states.size, 0, 'outgoing viewport persistence cannot recreate old conversations after account cleanup')
      assert.equal(frames.size, 0)
      assert.equal(timers.size, 0)
      assert.deepEqual(requests.map(request => request.talkerId), ['3', '3', '5', '6', '6'])
    }
    finally {
      if (host.firstChild)
        app.unmount()
      reader.dispose()
      scope.stop()
      host.remove()
      window.matchMedia = oldMatchMedia
      globalThis.requestAnimationFrame = oldRequestFrame
      globalThis.cancelAnimationFrame = oldCancelFrame
      window.HTMLElement.prototype.scrollTo = oldScrollTo
      window.HTMLElement.prototype.getBoundingClientRect = oldRect
    }
  })

  check('Whisper workspace: user switches preserve the detail instance, selected-user toggles close, and account replacement disposes immediately', async () => {
    const frames = new Map()
    let frameId = 0
    const oldRequestFrame = globalThis.requestAnimationFrame
    const oldCancelFrame = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = (run) => {
      frames.set(++frameId, run)
      return frameId
    }
    globalThis.cancelAnimationFrame = id => frames.delete(id)
    const stepFrame = async () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(run => run())
      await flush()
    }
    const sessions = ['2', '3', '4'].map(talkerId => ({ key: `1:${talkerId}`, talkerId, capabilities: { canReadNative: true } }))
    const selected = Vue.ref('')
    const transient = Vue.ref(null)
    const topBar = Vue.reactive({ userInfo: { mid: 1 }, unReadDm: {} })
    const mounts = []
    const disposals = []
    const focused = []
    const restored = []
    // The real Vue Transition reads the leaf's duration. Finish it explicitly
    // with transitionend so no wall-clock sleep determines the selection order.
    const transitionStyle = { transitionDuration: '1s', transitionProperty: 'opacity', transitionDelay: '0s' }
    const Detail = {
      props: ['session', 'recipient'],
      emits: ['back'],
      setup(props, { expose }) {
        const talker = Vue.computed(() => props.session?.talkerId ?? props.recipient.mid)
        const element = Vue.ref(null)
        Vue.onMounted(() => mounts.push(talker.value))
        Vue.onBeforeUnmount(() => disposals.push(talker.value))
        expose({ focusHeading: () => {
          focused.push(talker.value)
          element.value?.focus({ preventScroll: true })
        } })
        return () => Vue.h('section', { 'ref': element, 'data-talker': talker.value, 'tabindex': 0, 'style': transitionStyle })
      },
    }
    const List = {
      props: ['items'],
      emits: ['select', 'selectRecipient'],
      setup(props, { expose, emit }) {
        const element = Vue.ref(null)
        expose({
          getScrollTop: () => 120,
          restoreScrollTop: value => restored.push(value),
          focusSession: key => element.value.querySelector(`[data-session="${key}"]`)?.focus(),
        })
        return () => Vue.h('nav', { ref: element }, [
          ...props.items.map(session => Vue.h('button', { 'data-session': session.key, 'onClick': () => emit('select', session) }, session.talkerId)),
          Vue.h('button', { 'data-recipient': '', 'onClick': () => emit('selectRecipient', { mid: '5', name: 'recipient' }) }, 'recipient'),
        ])
      },
    }
    const reader = {
      selectedSessionKey: selected,
      state: Vue.reactive({ items: sessions, loaded: true, loading: false, scrollTop: 0 }),
      activate() {},
      updateScrollTop(value) { this.state.scrollTop = value },
    }
    const Workspace = await compileComponent(`${path}WhisperWorkspace.vue`, {
      'vue-i18n': i18n,
      '~/logic': { settings: Vue.ref({}) },
      '~/stores/topBarStore': { useTopBarStore: () => topBar },
      '~/utils/notificationRoute': await import('../src/utils/notificationRoute'),
      './ConversationDetailSkeleton.vue': { default: blank },
      './ConversationEmptyState.vue': { default: { render: () => Vue.h('p', { 'data-empty': '', 'style': transitionStyle }, 'empty') } },
      './ConversationList.vue': { default: List },
      './ConversationListSkeleton.vue': { default: blank },
      './ConversationOriginalFallback.vue': { default: blank },
      './ConversationView.vue': { default: Detail },
      './usePrivateMessagePolling': { usePrivateMessagePolling: () => ({ triggerNow() {} }) },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Workspace, {
      accountState: 'ready',
      active: true,
      controller: reader,
      messagesController: {},
      emoteController: {},
      recipientSearch: {},
      transientRecipient: transient.value,
      writeController: null,
      onSelectSession: (session) => {
        selected.value = session.key
        transient.value = null
      },
      onSelectRecipient: (recipient) => {
        selected.value = ''
        transient.value = recipient
      },
      onCloseConversation: () => {
        selected.value = ''
        transient.value = null
      },
    }) })
    installLeaves(app)
    const select = async (key) => {
      host.querySelector(`[data-session="${key}"]`).click()
      await flush()
    }
    const finishTransition = async (element) => {
      await stepFrame()
      await stepFrame()
      element.dispatchEvent(new Event('transitionend'))
      await flush()
    }
    try {
      app.mount(host)
      await flush()
      const empty = host.querySelector('[data-empty]')
      await select('1:2')
      assert.equal(empty.inert, true)
      assert.equal(host.querySelector('[data-talker]'), null)
      await finishTransition(empty)
      const first = host.querySelector('[data-talker="2"]')
      assert.ok(first)
      assert.equal(document.activeElement, first, 'focus waits for the incoming ref rather than being lost during out-in')
      await finishTransition(first)
      await select('1:3')
      assert.deepEqual(disposals, [], 'switching users keeps the existing shell alive')
      assert.notEqual(first.inert, true)
      assert.equal(first.classList.contains('whisper-detail-leave-active'), false)
      assert.equal(host.querySelector('[data-talker="3"]'), first)
      await select('1:4')
      const latest = host.querySelector('[data-talker="4"]')
      assert.equal(latest, first)
      assert.deepEqual(mounts, ['2'])
      assert.deepEqual(focused, ['2', '3', '4'])
      assert.equal(document.activeElement, latest)
      await select('1:4')
      assert.equal(selected.value, '')
      assert.equal(latest.inert, true)
      assert.equal(document.activeElement, host.querySelector('[data-session="1:4"]'))
      assert.deepEqual(restored, [120])
      await finishTransition(latest)
      await finishTransition(host.querySelector('[data-empty]'))
      selected.value = '1:3'
      await flush()
      await finishTransition(host.querySelector('[data-empty]'))
      const restoredDetail = host.querySelector('[data-talker="3"]')
      assert.deepEqual(focused, ['2', '3', '4'], 'route restoration does not steal focus from the list')
      await finishTransition(restoredDetail)
      topBar.userInfo.mid = 9
      selected.value = ''
      await flush()
      assert.equal(restoredDetail.isConnected, false, 'account replacement never animates the previous account into the new one')
      assert.ok(host.querySelector('[data-empty]'))
      host.querySelector('[data-recipient]').click()
      await flush()
      await finishTransition(host.querySelector('[data-empty]'))
      const recipient = host.querySelector('[data-talker="5"]')
      await finishTransition(recipient)
      reader.state.items.push({ key: '1:5', talkerId: '5', capabilities: { canReadNative: true } })
      selected.value = '1:5'
      transient.value = null
      await flush()
      assert.equal(host.querySelector('[data-talker="5"]'), recipient, 'confirmation of a transient recipient preserves its live composer and timeline')
      assert.deepEqual(mounts, ['2', '3', '5'])
      app.unmount()
      await stepFrame()
      await stepFrame()
      assert.equal(host.childElementCount, 0)
    }
    finally {
      if (host.firstChild)
        app.unmount()
      host.remove()
      globalThis.requestAnimationFrame = oldRequestFrame
      globalThis.cancelAnimationFrame = oldCancelFrame
    }
  })

  check('Whisper emotes: actual user catalog preserves native packages and rejects late account/release responses', async () => {
    const { usePrivateEmotePanel } = await import(`${path}usePrivateEmotePanel`)
    const requests = []
    const account = Vue.ref('1')
    const scope = Vue.effectScope()
    const catalog = scope.run(() => usePrivateEmotePanel(account, () => {
      const task = deferred()
      requests.push(task)
      return task.promise
    }))
    try {
      const first = catalog.load()
      assert.equal(catalog.load(), first)
      await flush()
      account.value = '2'
      requests[0].resolve(catalogResponse)
      await first
      assert.equal(catalog.packages.value.length, 0)
      const next = catalog.load()
      await flush()
      requests[1].resolve(catalogResponse)
      await next
      assert.deepEqual(catalog.packages.value.map(pkg => pkg.name), ['默认', '已购', '收藏', '颜文字'])
      assert.equal(catalog.packages.value[3].emotes[0].textOnly, true)
      await catalog.load()
      assert.equal(requests.length, 2)
      catalog.release()
      const failed = catalog.load()
      await flush()
      requests[2].reject(new Error('offline'))
      await failed
      assert.equal(catalog.failed.value, true)
      const retry = catalog.load()
      await flush()
      catalog.release()
      requests[3].resolve(catalogResponse)
      await retry
      assert.equal(catalog.packages.value.length, 0)
    }
    finally {
      catalog.release()
      scope.stop()
    }
  })

  check('Whisper Composer: real picker inserts owned emotes at selection, preserves IME, validates pictures and submits explicitly', async () => {
    const renderers = await import(`${path}privateMessageRenderers`)
    const Picker = await compileComponent(`${path}PrivateEmotePicker.vue`, { 'vue-i18n': i18n })
    const Composer = await compileComponent(`${path}experimental/MessageComposer.vue`, {
      '@vueuse/core': { ...await import('@vueuse/core'), useResizeObserver: useInputResizeObserver },
      'vue-i18n': i18n,
      '../PrivateEmotePicker.vue': { default: Picker },
      '../privateMessageRenderers': renderers,
      '~/utils/privateMessageImage': await import('../src/utils/privateMessageImage'),
    })
    const value = Vue.ref('before after')
    const conversationKey = Vue.ref('first')
    const imageDraft = Vue.ref(null)
    const host = document.body.appendChild(document.createElement('div'))
    let loads = 0
    let submits = 0
    const files = []
    const app = Vue.createApp({ render: () => Vue.h(Composer, {
      modelValue: value.value,
      conversationKey: conversationKey.value,
      sending: false,
      enableImage: true,
      imageDraft: imageDraft.value,
      emotePackages: renderers.parsePrivateEmotePanel(catalogResponse),
      'onUpdate:modelValue': text => value.value = text,
      'onLoadEmotes': () => loads++,
      'onSubmit': () => submits++,
      'onSelectImage': file => files.push(file),
      'onSubmitImage': () => submits++,
    }) })
    installLeaves(app)
    try {
      app.mount(host)
      await flush()
      const textarea = host.querySelector('textarea')
      assert.equal(textarea.rows, 1)
      textarea.style.cssText = 'line-height: 18px; padding-top: 9px; padding-bottom: 9px'
      let inputHeight = 36
      Object.defineProperty(textarea, 'clientHeight', { configurable: true, get: () => inputHeight })
      const resizeInput = inputResizeCallbacks.get(textarea)
      assert.ok(resizeInput)
      resizeInput()
      await flush()
      assert.equal(host.querySelector('.message-composer').dataset.expanded, 'false')
      inputHeight = 54
      resizeInput()
      await flush()
      assert.ok(host.querySelector('.message-composer__inputbar.is-multiline'))
      assert.equal(host.querySelector('.message-composer').dataset.expanded, 'true')
      inputHeight = 36
      resizeInput()
      await flush()
      assert.equal(host.querySelector('.message-composer__inputbar.is-multiline'), null)
      textarea.focus()
      textarea.setSelectionRange(7, 12)
      host.querySelector('[aria-controls="private-message-emote-picker"]').click()
      await flush()
      assert.equal(loads, 1)
      const tabs = host.querySelectorAll('[role="tab"]')
      assert.equal(tabs.length, 4)
      tabs[1].click()
      await flush()
      host.querySelector('[aria-label="[已购_开心]"]').click()
      await flush()
      assert.equal(value.value, 'before [已购_开心]')
      assert.equal(document.activeElement, textarea)
      assert.equal(submits, 0)
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
      assert.equal(host.querySelector('[role="dialog"]'), null)
      assert.equal(document.activeElement, host.querySelector('[aria-controls="private-message-emote-picker"]'))
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      assert.equal(submits, 0)
      const input = host.querySelector('input[type=file]')
      assert.equal(input.accept, 'image/png,image/jpeg,image/gif')
      const file = new File(['fixture'], 'test.png', { type: 'image/png' })
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change'))
      await flush()
      assert.equal(files[0], file)
      assert.equal(submits, 0, 'selection cannot send or upload')
      Object.defineProperty(input, 'files', { configurable: true, value: [{ type: 'image/gif', size: 1024 * 1024 + 1 }] })
      input.dispatchEvent(new Event('change'))
      await flush()
      assert.equal(files.length, 1)
      assert.ok(host.textContent.includes('gif_too_large'))
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flush()
      assert.equal(submits, 1)
      host.querySelector('[aria-controls="private-message-emote-picker"]').click()
      await flush()
      assert.ok(host.querySelector('[role="dialog"]'))
      conversationKey.value = 'second'
      value.value = 'second draft'
      await flush()
      assert.equal(host.querySelector('textarea'), textarea)
      assert.equal(textarea.value, 'second draft')
      assert.equal(host.querySelector('[role="dialog"]'), null)
      assert.equal(host.querySelector('.message-composer__error'), null)
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change'))
      await flush()
      assert.equal(files.length, 1, 'a file dialog opened for the old user cannot attach its result to the new user')
      host.querySelector('[aria-label="notifications.whisper.messages.select_image"]').click()
      input.dispatchEvent(new Event('change'))
      await flush()
      assert.equal(files.length, 2, 'a newly opened picker belongs to the current user')
      assert.equal(submits, 1, 'switching and selecting images never send automatically')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
