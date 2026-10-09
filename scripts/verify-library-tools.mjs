import assert from 'node:assert/strict'

import { countOpenTabsTask, selectOpenTabsTaskItems } from '../src/constants/openTabsWatchLater'
import { historyDateBounds, matchesHistoryFilters } from '../src/contentScripts/views/History/historyFilters'
import { filterWatchLaterItems, watchLaterPlaybackState } from '../src/contentScripts/views/WatchLater/watchLaterFilters'

export function registerLibraryToolChecks(check, { Vue, compileComponent, flush }) {
  const translation = { useI18n: () => ({ t: (key, values) => values ? `${key}:${JSON.stringify(values)}` : key }) }
  const Button = { props: ['disabled'], setup: (props, { slots }) => () => Vue.h('button', { disabled: props.disabled }, slots.default?.()) }
  const Dialog = { emits: ['close'], setup: (_props, { slots, emit, expose }) => {
    expose({ close: () => emit('close') })
    return () => Vue.h('section', slots.default?.())
  } }
  function mount(component, props) {
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(component, props)
    const errors = []
    app.config.errorHandler = error => errors.push(error)
    app.config.globalProperties.$t = translation.useI18n().t
    app.component('Dialog', Dialog)
    app.component('Button', Button)
    app.mount(host)
    return { host, errors, close() {
      app.unmount()
      host.remove()
    } }
  }
  const historyItem = (id, business = 'archive', time = 1) => ({ title: `item-${id}`, view_at: time, history: { oid: id, business } })
  check('library history: clearing search replaces the submitted query, cancels old reads and shares date/type pagination', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    const reads = []
    const request = kind => (params, options) => new Promise(resolve => reads.push({ kind, params, options, resolve }))
    const timeline = useHistoryTimeline({
      api: { getHistoryList: request('list'), searchHistoryList: request('search'), getHistoryPauseStatus: async () => ({ code: 0, data: false }) },
      getAccountId: () => 1,
      getCSRF: () => 'csrf',
      haveScrollbar: async () => true,
      onWriteError: assert.fail,
    })
    try {
      timeline.activate()
      timeline.keyword.value = 'music'
      timeline.handleSearch()
      assert.equal(reads[0].options.signal.aborted, true)
      reads[1].resolve({ code: 0, data: { list: [historyItem(1)] } })
      await flush()
      assert.equal(timeline.submittedKeyword.value, 'music')
      timeline.clearSearch()
      assert.equal(timeline.keyword.value, '')
      assert.equal(timeline.submittedKeyword.value, '')
      assert.equal(reads[2].kind, 'list')
      reads[0].resolve({ code: 0, data: { list: [historyItem(999)] } })
      reads[2].resolve({ code: 0, data: { list: [historyItem(2)] } })
      await flush()
      assert.deepEqual(timeline.historyList.map(item => item.history.oid), [2])
      timeline.date.value = '2026-09-29'
      timeline.contentType.value = 'pgc'
      timeline.handleSearch()
      const bounds = historyDateBounds(timeline.date.value)
      assert.equal(reads[3].params.view_at, bounds.end)
      reads[3].resolve({ code: 0, data: { list: [historyItem(3, 'archive', bounds.start + 1), historyItem(4, 'pgc', bounds.end), historyItem(5, 'pgc', bounds.start - 1)] } })
      await flush()
      assert.deepEqual(timeline.historyList.map(item => item.history.oid), [4])
      assert.equal(matchesHistoryFilters(historyItem(6, 'article-list', bounds.start), 'article', bounds), true)
      assert.equal(historyDateBounds('2026-02-30'), undefined)
    }
    finally { timeline.dispose() }
  })

  check('library history: a sparse filter reads at most three pages per action and unmount aborts a pending page', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    let requests = 0
    let pending
    const timeline = useHistoryTimeline({ api: {
      getHistoryList: async (_params, options) => {
        requests++
        if (requests === 4)
          return new Promise((resolve) => { pending = { resolve, signal: options.signal } })
        return { code: 0, data: { list: Array.from({ length: 20 }, (_, index) => historyItem(requests * 20 + index, 'archive', 10_000 - requests * 20 - index)) } }
      },
    }, getAccountId: () => 1, getCSRF: () => '', haveScrollbar: async () => false, onWriteError: assert.fail })
    timeline.contentType.value = 'live'
    await timeline.load()
    assert.equal(requests, 3)
    assert.equal(timeline.noMoreContent.value, false)
    const more = timeline.load()
    timeline.dispose()
    assert.equal(pending.signal.aborted, true)
    pending.resolve({ code: 0, data: { list: [historyItem(1, 'live')] } })
    await more
    assert.equal(timeline.historyList.length, 0)
  })

  check('library Watch Later filters: titles/authors, duration boundaries and real completion evidence share one view', async () => {
    const items = [
      { aid: 1, title: 'Hello World', owner: { name: 'Alice' }, progress: 0, duration: 600 },
      { aid: 2, title: 'Long lesson', owner: { name: 'Bob' }, progress: 10, duration: 1800 },
      { aid: 3, title: 'Finished', owner: { name: 'Alice' }, progress: -1, duration: 1801 },
      { aid: 4, title: 'Unknown', owner: { name: 'Carol' }, duration: 0 },
    ]
    const none = () => undefined
    assert.deepEqual(filterWatchLaterItems(items, 'ＡＬＩＣＥ', 'all', 'all', none).map(item => item.aid), [1, 3])
    assert.deepEqual(filterWatchLaterItems(items, '', 'unstarted', 'short', none).map(item => item.aid), [1])
    assert.deepEqual(filterWatchLaterItems(items, '', 'watching', 'medium', none).map(item => item.aid), [2])
    assert.deepEqual(filterWatchLaterItems(items, '', 'completed', 'long', none).map(item => item.aid), [3])
    assert.equal(watchLaterPlaybackState(items[3]), 'unknown')
    assert.equal(watchLaterPlaybackState({ ...items[1], progress: 1800 }), 'watching', 'position at the end alone is not completion')
    assert.equal(watchLaterPlaybackState(items[3], { status: 'played', completed: true }), 'completed')
    assert.equal(watchLaterPlaybackState(items[0], { status: 'played', completed: true }), 'unstarted', 'explicit server progress keeps priority')
  })

  check('library batch selection: actual preview checkboxes, all/none and task replacement submit only checked snapshot ids', async () => {
    const task = Vue.shallowRef(null)
    const calls = []
    const component = await compileComponent('../src/components/WatchLater/OpenTabsDialog.vue', {
      '~/components/Button.vue': { default: Button },
      '~/components/Dialog.vue': { default: Dialog },
      '~/components/Progress.vue': { default: { render: () => null } },
      '~/composables/useOpenTabsWatchLater': { useOpenTabsWatchLater: () => ({ task, busy: Vue.ref(false), failed: Vue.ref(false), command: (...args) => calls.push(args) }) },
      '~/constants/openTabsWatchLater': { countOpenTabsTask },
    })
    const fixture = mount(component)
    try {
      task.value = { id: 'one', status: 'ready', accountId: 1, incognito: false, items: [1, 2, 3].map(tabId => ({ tabId, status: 'pending', title: `Video ${tabId}` })) }
      await flush()
      const inputs = fixture.host.querySelectorAll('input[type="checkbox"]')
      assert.equal(inputs.length, 3)
      assert.ok([...inputs].every(input => input.checked))
      inputs[1].checked = false
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
      const confirm = () => [...fixture.host.querySelectorAll('button')].find(button => button.textContent.trim() === 'watch_later.open_tabs.confirm')
      confirm().click()
      assert.deepEqual(Array.from(calls[0][1]), [1, 3])
      assert.deepEqual(selectOpenTabsTaskItems(task.value, calls[0][1]).map(item => item.tabId), [1, 3])
      assert.throws(() => selectOpenTabsTaskItems(task.value, []))
      assert.throws(() => selectOpenTabsTaskItems(task.value, [999]))
      const selectButton = () => [...fixture.host.querySelectorAll('button')].find(button => /favorites\.(?:unselect_all|select_all)/.test(button.textContent))
      selectButton().click()
      await flush()
      selectButton().click()
      await flush()
      assert.equal(confirm().disabled, true)
      task.value = { ...task.value, id: 'two', items: [{ tabId: 4, status: 'pending', title: 'New tab' }] }
      await flush()
      assert.equal(fixture.host.querySelector('input').checked, true)
      assert.equal(confirm().disabled, false)
      assert.deepEqual(fixture.errors, [])
    }
    finally { fixture.close() }
  })

  check('library conversation find: real component supports normalized text/links, next/previous, IME and trimmed results', async () => {
    const selected = []
    const search = await import('../src/contentScripts/views/Notifications/whisper/privateMessageSearch')
    const component = await compileComponent('../src/contentScripts/views/Notifications/whisper/ConversationFind.vue', { 'vue-i18n': translation, './privateMessageSearch': search })
    const messages = Vue.reactive([
      { msgKey: 'one', content: { type: 'text', segments: [{ type: 'text', text: 'Hello world' }] } },
      { msgKey: 'two', content: { type: 'text-share', title: 'HELLO', text: 'world', href: 'https://example.test/item' } },
    ])
    const fixture = mount(component, { messages, onLocate: key => selected.push(key) })
    try {
      fixture.host.querySelector('button').click()
      await flush()
      const input = fixture.host.querySelector('input')
      input.value = 'ｈｅｌｌｏ'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      assert.deepEqual(selected, [])
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
      assert.deepEqual(selected, ['one', 'two', 'one'])
      messages.splice(0, 1)
      await flush()
      assert.equal(fixture.host.querySelector('[role="status"]').textContent.trim(), '0 / 1')
      input.value = 'example.test'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(selected.at(-1), 'two')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
      assert.equal(fixture.host.querySelector('input'), null)
      assert.deepEqual(fixture.errors, [])
    }
    finally { fixture.close() }
  })

  check('library image viewer: actual image load, original-size center, drag, gallery and stale image events', async () => {
    const component = await compileComponent('../src/contentScripts/views/Notifications/whisper/PrivateMessageImageViewer.vue', {
      '@vueuse/core': { useResizeObserver() {} },
      'vue-i18n': translation,
      '~/components/Button.vue': { default: Button },
    })
    const images = Vue.reactive(['https://example.test/a.png', 'https://example.test/b.png'])
    const fixture = mount(component, { src: images[0], images })
    try {
      const stage = fixture.host.querySelector('.private-message-image-viewer__viewport')
      Object.defineProperties(stage, { clientWidth: { value: 600 }, clientHeight: { value: 400 } })
      stage.scrollTo = ({ left, top }) => {
        stage.scrollLeft = left
        stage.scrollTop = top
      }
      stage.setPointerCapture = () => {}
      stage.hasPointerCapture = () => false
      const image = fixture.host.querySelector('img')
      Object.defineProperties(image, { naturalWidth: { value: 1000 }, naturalHeight: { value: 2000 } })
      image.dispatchEvent(new Event('load'))
      await flush()
      assert.equal(image.style.width, '200px')
      assert.equal(image.style.height, '400px')
      assert.equal(fixture.host.querySelector('[data-bew-skeleton]'), null)
      Array.from(fixture.host.querySelectorAll('button')).find(button => button.textContent.trim() === 'library_tools.original_size').click()
      await flush()
      assert.equal(image.style.width, '1000px')
      assert.equal(stage.scrollLeft, 200)
      assert.equal(stage.scrollTop, 800)
      const pointer = (type, x, y) => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })
        Object.defineProperty(event, 'pointerId', { value: 1 })
        return event
      }
      image.dispatchEvent(pointer('pointerdown', 10, 10))
      stage.dispatchEvent(pointer('pointermove', 110, 60))
      stage.dispatchEvent(pointer('pointerup', 110, 60))
      assert.equal(stage.scrollLeft, 100)
      assert.equal(stage.scrollTop, 750)
      fixture.host.querySelector('[aria-label="moments.next_image"]').click()
      await flush()
      assert.equal(fixture.host.querySelector('img').src, 'https://example.test/b.png')
      images.pop()
      await flush()
      assert.equal(fixture.host.querySelector('.private-message-image-viewer__tools span').textContent.trim(), '2 / 2', 'trimming message history retains the image being viewed')
      assert.equal(fixture.host.querySelector('[aria-label="moments.previous_image"]').disabled, false)
      image.dispatchEvent(new Event('load'))
      assert.notEqual(fixture.host.querySelector('img').style.width, '200px', 'a detached prior image cannot apply its dimensions')
      fixture.host.querySelector('img').dispatchEvent(new Event('error'))
      await flush()
      assert.ok(fixture.host.querySelector('[role="alert"]'))
      Array.from(fixture.host.querySelectorAll('button')).find(button => button.textContent.trim() === 'common.retry').click()
      await flush()
      assert.ok(fixture.host.querySelector('img'))
      assert.deepEqual(fixture.errors, [])
    }
    finally { fixture.close() }
  })
}
