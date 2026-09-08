import assert from 'node:assert/strict'

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
  const button = { props: ['label', 'disabled'], setup: (props, { slots }) => () => Vue.h('button', { 'type': 'button', 'aria-label': props.label, 'disabled': props.disabled }, slots.default?.()) }
  const installLeaves = (app) => {
    for (const name of ['Button', 'IconButton', 'CloseButton'])
      app.component(name, button)
    app.component('Tooltip', { props: ['content', 'placement'], setup: (_, { slots }) => () => slots.default?.() })
    app.component('Empty', { props: ['description'], setup: props => () => Vue.h('p', props.description) })
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
  }

  check('Whisper entry: actual view expands before fetching, reveals history, and cancels unopened/stale conversations', async () => {
    const frames = new Map()
    const timers = new Map()
    let id = 0
    const clock = {
      AbortController,
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
    const selected = Vue.ref('2')
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
    const View = await compileComponent(`${path}ConversationView.vue`, {
      'vue-i18n': i18n,
      '~/constants/layout': await import('../src/constants/layout'),
      '~/logic': { settings: Vue.ref({ autoMarkPrivateMessagesRead: true, followNewPrivateMessages: true, autoLoadPrivateMessageImages: true }) },
      '~/stores/topBarStore': { useTopBarStore: () => ({ userInfo: { mid: 1 } }) },
      './conversationExpansion': await import(`${path}conversationExpansion`),
      './experimental/MessageComposer.vue': { default: blank },
      './PrivateMessageImageViewer.vue': { default: blank },
      './PrivateMessageItem.vue': { default: Item },
    }, { globals: clock })
    const host = document.body.appendChild(document.createElement('div'))
    let exposed
    const app = Vue.createApp({ render: () => Vue.h(View, {
      key: `${account.value}:${selected.value}`,
      ref: value => exposed = value,
      active: true,
      controller: reader,
      writeController: null,
      emoteController: { packages: Vue.ref([]), loading: Vue.ref(false), failed: Vue.ref(false), load() {} },
      session: { talkerId: selected.value, name: 'Fixture', ackSeqno: '0', maxSeqno: '1', unreadCount: 1, capabilities: { canAck: true } },
    }) })
    installLeaves(app)
    const response = text => ({ code: 0, data: { has_more: 0, min_seqno: '1', max_seqno: '1', e_infos: [], messages: [{
      sender_uid: '2',
      receiver_id: '1',
      receiver_type: 1,
      msg_type: 1,
      msg_key: text,
      msg_seqno: '1',
      timestamp: 1700000000,
      msg_status: 0,
      content: JSON.stringify({ content: text }),
    }] } })
    try {
      app.mount(host)
      await flush()
      assert.equal(requests.length, 0)
      await exposed.refresh()
      assert.equal(requests.length, 0, 'polling/manual refresh cannot bypass the entry phase')
      stepFrame()
      await flush()
      assert.equal(requests.length, 0)
      assert.equal(host.querySelector('[data-expansion-state]').dataset.expansionState, 'history-open')
      selected.value = '3'
      await flush()
      assert.equal(timers.size, 0, 'switching during expansion cancels its request release')
      stepFrame()
      settleExpansion()
      await flush()
      assert.deepEqual(requests.map(request => request.talkerId), ['3'])
      assert.equal(host.querySelector('[data-bew-skeleton]'), null)
      requests[0].resolve(response('history-A'))
      await flush()
      assert.ok(host.textContent.includes('history-A'))
      stepFrame()
      await flush()
      assert.equal(host.querySelector('[data-expansion-state]').dataset.expansionState, 'history-open', 'initial latest position keeps the entry expanded')
      assert.equal(ackCount, 0, 'transparent entering rows are not acknowledged before reveal')
      host.querySelector('[data-message-id]').dispatchEvent(new Event('animationend', { bubbles: true }))
      await flush()
      assert.equal(ackCount, 1)
      selected.value = '4'
      await flush()
      stepFrame()
      settleExpansion()
      await flush()
      selected.value = '5'
      await flush()
      requests[1].resolve(response('stale-B'))
      await flush()
      assert.equal(host.textContent.includes('stale-B'), false)
      app.unmount()
      stepFrame()
      assert.equal(frames.size, 0)
      assert.equal(timers.size, 0)
      assert.equal(requests.length, 2, 'unmounting never fetches the unopened selection')
    }
    finally {
      if (host.firstChild)
        app.unmount()
      reader.dispose()
      scope.stop()
      host.remove()
      window.matchMedia = oldMatchMedia
      window.HTMLElement.prototype.scrollTo = oldScrollTo
      window.HTMLElement.prototype.getBoundingClientRect = oldRect
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
      'vue-i18n': i18n,
      '../PrivateEmotePicker.vue': { default: Picker },
      '../privateMessageRenderers': renderers,
      '~/utils/privateMessageImage': await import('../src/utils/privateMessageImage'),
    })
    const value = Vue.ref('before after')
    const imageDraft = Vue.ref(null)
    const host = document.body.appendChild(document.createElement('div'))
    let loads = 0
    let submits = 0
    const files = []
    const app = Vue.createApp({ render: () => Vue.h(Composer, {
      modelValue: value.value,
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
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
