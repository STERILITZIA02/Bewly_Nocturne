import assert from 'node:assert/strict'

import { JSDOM } from 'jsdom'

import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

function frameClock() {
  const frames = new Map()
  const timers = new Map()
  let id = 0
  return {
    frames,
    timers,
    requestAnimationFrame(callback) {
      frames.set(++id, callback)
      return id
    },
    cancelAnimationFrame: key => frames.delete(key),
    setTimeout(callback) {
      timers.set(++id, callback)
      return id
    },
    clearTimeout: key => timers.delete(key),
    step() {
      const batch = [...frames.values()]
      frames.clear()
      batch.forEach(callback => callback())
    },
  }
}

export function registerMaintenanceIntegrationChecks(check, { Vue, compileComponent, flush }) {
  check('maintenance settings: real normalization and import/export preserve old reminders, mode overrides and validate new fields', async () => {
    let normalize
    const storage = await loadSourceModule('../src/logic/storage.ts', {
      'vue': { ...Vue, watch: () => () => {} },
      'webextension-polyfill': { default: { storage: { local: { remove: async () => {} } } } },
      '~/composables/useSettingsStorage': { useSettingsStorage: (value, options) => {
        normalize = options.normalize
        return Object.assign(Vue.ref(value), { initializationState: Vue.ref('loaded'), displayReady: Vue.ref(true) })
      } },
      '~/composables/useStorageLocal': { useStorageLocal: (_key, value) => Object.assign(Vue.ref(value), { initializationState: Vue.ref('loaded') }) },
      '~/constants/imgs': { DEFAULT_SEARCH_BAR_CHARACTER: 'fixture-character' },
      '~/constants/commentReading': await import('../src/constants/commentReading'),
      '~/utils/localLoudnessProtocol': await import('../src/utils/localLoudnessProtocol'),
      '~/constants/liquidGlass': await import('../src/constants/liquidGlass'),
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      '~/utils/bewlyWidescreenPolicy': await import('../src/utils/bewlyWidescreenPolicy'),
      '~/utils/gridLayout': await import('../src/utils/gridLayout'),
      '~/utils/range': await import('../src/utils/range'),
      '~/utils/videoCardLayout': await import('../src/utils/videoCardLayout'),
      '~/utils/videoScreenshotShortcut': await import('../src/utils/videoScreenshotShortcut'),
      './appAuthStorage': {},
    })
    const defaults = JSON.parse(JSON.stringify(storage.originalSettings))
    const categoryKeys = ['showReplyNotificationReminder', 'showAtNotificationReminder', 'showSystemNotificationReminder', 'showFollowedPrivateMessageUnreadCount', 'showUnfollowedPrivateMessageUnreadCount']
    const newSwitches = ['rememberVideoQuality', 'showWidescreenIdleProgress', 'originalMomentsUseBewlyFilters']
    const old = { ...defaults, videoPlayerModeOverrides: { multipart: 'widescreen', collection: 'default', bangumi: 'inherit', watchLater: 'inherit', playlist: 'inherit' } }
    for (const key of [...categoryKeys, ...newSwitches, 'savedVideoQuality', 'historyLayout'])
      delete old[key]
    normalize(old)
    for (const key of categoryKeys)
      assert.equal(old[key], true)
    for (const key of newSwitches)
      assert.equal(old[key], false)
    assert.equal(old.showLikeNotificationReminder, false)
    assert.equal(old.savedVideoQuality, null)
    assert.equal(old.historyLayout, 'list')
    assert.equal(old.videoPlayerModeOverrides.multipart, 'widescreen')
    assert.equal(old.videoPlayerModeOverrides.momentsDialog, 'inherit')
    const invalid = { ...old, savedVideoQuality: -1, historyLayout: 'broken', showReplyNotificationReminder: 'false', originalMomentsUseBewlyFilters: 1 }
    normalize(invalid)
    assert.equal(invalid.savedVideoQuality, null)
    assert.equal(invalid.historyLayout, 'list')
    assert.equal(invalid.showReplyNotificationReminder, true)
    assert.equal(invalid.originalMomentsUseBewlyFilters, false)

    const settings = Vue.ref(old)
    const imported = []
    settings.import = async (values) => {
      imported.push(values)
      Object.assign(settings.value, values)
      normalize(settings.value)
    }
    const notifications = []
    let exported
    let clickedDownload
    let revoked = 0
    const slot = { setup: (_props, { slots }) => () => Vue.h('section', slots.default?.()) }
    const Maintenance = await compileComponent('../src/components/Settings/Advanced/Maintenance.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ success: key => notifications.push(key), warning: key => notifications.push(key), error: key => assert.fail(key) }) },
      '~/composables/useConfirmDialog': { useConfirmDialog: () => ({ confirm: async () => false }) },
      '~/constants/commentReading': await import('../src/constants/commentReading'),
      '~/utils/localLoudnessProtocol': await import('../src/utils/localLoudnessProtocol'),
      '~/contentScripts/views/Home/types': await import('../src/contentScripts/views/Home/types'),
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      '~/logic': { originalSettings: defaults, settings },
      '~/logic/storage': { videoCardContextMenuKeys: storage.videoCardContextMenuKeys },
      '~/utils/sidebarCoverSettings': await import('../src/utils/sidebarCoverSettings'),
      '~/utils/videoScreenshotShortcut': await import('../src/utils/videoScreenshotShortcut'),
      '../components/SettingsItem.vue': { default: slot },
      '../components/SettingsItemGroup.vue': { default: slot },
    }, { globals: {
      __DEV__: false,
      Object,
      JSON,
      Blob,
      FileReader: class {
        readAsText(file) {
          this.result = file
          this.onload()
        }
      },
      URL: { createObjectURL: (blob) => {
        exported = blob
        return 'blob:fixture'
      }, revokeObjectURL: () => revoked++ },
    } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Maintenance)
    app.component('Button', { setup: (_props, { slots }) => () => Vue.h('button', slots.default?.()) })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    const input = host.querySelector('input[type="file"]')
    const previousClick = window.HTMLAnchorElement.prototype.click
    window.HTMLAnchorElement.prototype.click = function () {
      clickedDownload = this.download
    }
    const importValues = async (values) => {
      Object.defineProperty(input, 'files', { configurable: true, value: [JSON.stringify(values)] })
      input.dispatchEvent(new Event('change'))
      await flush()
    }
    try {
      await importValues({ savedVideoQuality: 64, historyLayout: 'grid', rememberVideoQuality: true, showUnfollowedPrivateMessageUnreadCount: false, videoPlayerModeOverrides: { multipart: 'default', collection: 'widescreen', bangumi: 'inherit', watchLater: 'inherit', playlist: 'inherit' } })
      assert.equal(settings.value.savedVideoQuality, 64)
      assert.equal(settings.value.historyLayout, 'grid')
      assert.equal(settings.value.showUnfollowedPrivateMessageUnreadCount, false)
      assert.equal(settings.value.videoPlayerModeOverrides.collection, 'widescreen')
      assert.equal(settings.value.videoPlayerModeOverrides.momentsDialog, 'inherit')
      await importValues({ savedVideoQuality: '80', historyLayout: 'unknown', rememberVideoQuality: 'true', videoPlayerModeOverrides: { unknown: 'default' } })
      assert.equal(imported.length, 1)
      assert.equal(notifications.at(-1), 'settings.maintenance.import_no_matches')
      await importValues({ videoPlayerModeOverrides: { momentsDialog: 'bewlyWidescreen' } })
      assert.equal(settings.value.videoPlayerModeOverrides.momentsDialog, 'bewlyWidescreen')
      const exportButton = [...host.querySelectorAll('button')].find(button => button.textContent.trim() === 'settings.export_settings')
      exportButton.click()
      const roundTrip = JSON.parse(await exported.text())
      assert.equal(roundTrip.savedVideoQuality, 64)
      assert.equal(roundTrip.videoPlayerModeOverrides.momentsDialog, 'bewlyWidescreen')
      assert.equal(roundTrip.showUnfollowedPrivateMessageUnreadCount, false)
      assert.match(clickedDownload, /^bewly-settings-.*\.json$/)
      assert.equal(revoked, 1)
      const { isSettingsCloudSyncField } = await import('../src/utils/settingsCloudSyncProtocol')
      assert.equal(isSettingsCloudSyncField('savedVideoQuality'), false)
      assert.equal(defaults.localLoudnessEnabled, false)
      assert.equal(defaults.enableCommentReplyTreeContainer, false)
      await importValues({ localLoudnessEnabled: true, localLoudnessTarget: -20, localLoudnessStrength: 80, commentReplyBatchPages: 3, enableCommentReplyTreeContainer: true, commentReplyTreeContainerHeight: 600 })
      assert.equal(settings.value.localLoudnessEnabled, true)
      assert.equal(settings.value.localLoudnessTarget, -20)
      assert.equal(settings.value.commentReplyBatchPages, 3)
      await importValues({ localLoudnessTarget: -80, localLoudnessStrength: 101, commentReplyBatchPages: 99, commentReplyTreeContainerHeight: 10000 })
      assert.equal(settings.value.localLoudnessTarget, -20)
      assert.equal(settings.value.localLoudnessStrength, 80)
      assert.equal(settings.value.commentReplyTreeContainerHeight, 600)
      assert.equal(isSettingsCloudSyncField('localLoudnessEnabled'), false)
      assert.equal(isSettingsCloudSyncField('localLoudnessTarget'), true)
      for (const key of [...categoryKeys, ...newSwitches, 'historyLayout', 'videoPlayerModeOverrides'])
        assert.equal(isSettingsCloudSyncField(key), true)
    }
    finally {
      window.HTMLAnchorElement.prototype.click = previousClick
      app.unmount()
      host.remove()
    }
  })

  check('maintenance 10 model: dates and incomplete grid rows share stable, aligned metric slots across layout changes', async () => {
    const { createHistoryWindow } = await import('../src/contentScripts/views/History/historyWindow')
    const item = id => ({ kid: id, view_at: id, history: { business: 'archive', oid: id } })
    const groups = [{ key: 'a', label: 'A', items: [1, 2, 3, 4].map(item) }, { key: 'b', label: 'B', items: [5, 6].map(item) }]
    const list = createHistoryWindow(groups, 1)
    for (const columns of [2, 3, 5]) {
      const grid = createHistoryWindow(groups, columns)
      assert.equal(grid.length % columns, 0)
      assert.deepEqual(grid.filter(cell => cell.kind === 'item').map(cell => cell.key), list.filter(cell => cell.kind === 'item').map(cell => cell.key))
      grid.forEach((cell, index) => {
        if (cell.kind === 'heading')
          assert.equal(index % columns, 0)
      })
      assert.equal(new Set(grid.map(cell => cell.key)).size, grid.length)
    }
    const duplicate = createHistoryWindow([{ key: 'a', label: 'A', items: [item(1), item(1)] }], 3)
    assert.equal(new Set(duplicate.map(cell => cell.key)).size, duplicate.length)
  })

  check('maintenance 10 component: actual History uses one bounded window for 1000 grouped records, preserves focus and reuses search/delete ownership', async () => {
    const root = document.body.appendChild(document.createElement('section'))
    root.style.overflowY = 'auto'
    Object.defineProperties(root, { clientWidth: { value: 1200 }, clientHeight: { value: 700 }, scrollHeight: { value: 400000 } })
    const settings = Vue.ref({ historyLayout: 'list', enableGridLayoutSwitcher: true, gridColumns: { base: 3, sm: 3, md: 3, lg: 3, xl: 3, xxl: 3 } })
    const records = Array.from({ length: 1000 }, (_, index) => ({
      kid: index + 1,
      title: `Video ${index + 1}`,
      show_title: '',
      cover: 'https://image.example/cover.jpg',
      author_face: 'https://image.example/avatar.jpg',
      author_mid: 1,
      author_name: 'UP',
      view_at: 1700000000 - Math.floor(index / 40) * 86400 - index % 40,
      progress: 30,
      duration: 120,
      uri: `https://www.bilibili.com/video/av${index + 1}/`,
      history: { business: 'archive', oid: index + 1, page: 2, cid: index + 1, dt: 1 },
    }))
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    const provider = { scrollViewportRef: Vue.ref(root), handlePageRefresh: Vue.ref(), handleReachBottom: Vue.ref(), haveScrollbar: async () => true }
    const reads = []
    const writes = []
    let timeline
    let windowCount = 0
    const initialRead = deferred()
    const realTimeline = await import('../src/contentScripts/views/History/useHistoryTimeline')
    const realWindow = await import('../src/composables/useCardWindow')
    const timelineSource = { useHistoryTimeline: dependencies => (timeline = realTimeline.useHistoryTimeline(dependencies)) }
    const api = {
      getHistoryList: async ({ view_at }) => {
        reads.push(['history', view_at])
        if (reads.length === 1)
          await initialRead.promise
        return { code: 0, data: { list: records.filter(item => !view_at || item.view_at < view_at).slice(0, 20) } }
      },
      searchHistoryList: async (options) => {
        reads.push(['search', options.keyword, options.pn])
        return { code: 0, data: { list: [records[999]] } }
      },
      getHistoryPauseStatus: async () => ({ code: 0, data: false }),
      deleteHistoryItem: async (options) => {
        writes.push(options)
        return { code: 0 }
      },
    }
    const rectangles = HTMLElement.prototype.getBoundingClientRect
    const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const previousResize = globalThis.ResizeObserver
    const previousWindowResize = window.ResizeObserver
    const observers = new Set()
    class Observer {
      targets = new Set()
      constructor(callback) {
        this.callback = callback
        observers.add(this)
      }

      observe(element) {
        this.targets.add(element)
        queueMicrotask(() => this.targets.has(element) && this.callback([{ target: element, contentRect: element.getBoundingClientRect() }]))
      }

      unobserve(element) { this.targets.delete(element) }
      disconnect() {
        this.targets.clear()
        observers.delete(this)
      }
    }
    globalThis.ResizeObserver = window.ResizeObserver = Observer
    const box = (top, height, width = 1200) => ({ x: 0, y: top, top, bottom: top + height, left: 0, right: width, width, height, toJSON: () => ({}) })
    // JSDOM has no grid layout. This boundary supplies independent, fixed CSS
    // row geometry; the real component/window still owns all ranges and anchors.
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this === root)
        return box(0, 700)
      if (this.classList.contains('history-groups'))
        return box(60 - root.scrollTop, 200000)
      if (this.classList.contains('history-list-card') || this.classList.contains('history-day-heading')) {
        const grid = settings.value.historyLayout === 'grid'
        const columns = grid ? settings.value.gridColumns.base : 1
        const gap = grid ? 16 : 8
        let top = 60 - root.scrollTop
        let column = 0
        for (const sibling of this.parentElement.children) {
          const heading = sibling.classList.contains('history-day-heading')
          const spacer = sibling.style.gridColumn === '1 / -1'
          const card = sibling.classList.contains('history-list-card')
          const height = heading ? (sibling.classList.contains('history-day-heading--first') ? (grid ? 22 : 26) : grid ? 30 : 42) : spacer ? Number.parseFloat(sibling.style.height) || 0 : grid ? 320 : 140
          if ((heading || spacer) && column) {
            top += (grid ? 320 : 140) + gap
            column = 0
          }
          if (sibling === this)
            return box(top, height, grid && card ? 1200 / columns : 1200)
          if (heading || spacer) {
            top += height + gap
          }
          else if (card && ++column === columns) {
            top += height + gap
            column = 0
          }
        }
      }
      return rectangles.call(this)
    }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
    const blank = { render: () => null }
    const picture = { props: ['src'], setup: props => () => Vue.h('picture', { 'data-picture-source': props.src }) }
    const progress = await import('../src/utils/playbackProgress')
    const page = await compileComponent('../src/contentScripts/views/History/History.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key, locale: Vue.ref('en') }) },
      'vue-toastification': { useToast: () => ({ error: error => assert.fail(String(error)) }) },
      '~/components/VideoListSkeleton.vue': { default: await compileComponent('../src/components/VideoListSkeleton.vue') },
      '~/components/LazyPicture.vue': { default: picture },
      '~/components/Settings/components/SettingsSegmentedControl.vue': { default: blank },
      '~/composables/useAppProvider': { useBewlyApp: () => provider },
      '~/composables/useConfirmDialog': { useConfirmDialog: () => ({ confirm: async () => false }) },
      '~/composables/useCardWindow': { ...realWindow, useCardWindow: (options) => {
        windowCount++
        return realWindow.useCardWindow(options)
      } },
      '~/logic': { settings },
      '~/models/history/history': await import('../src/models/history/history'),
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: { history: api } },
      '~/utils/dataFormatter': { calcCurrentTime: value => String(value) },
      '~/utils/historyTarget': await import('../src/utils/historyTarget'),
      '~/utils/gridLayout': await import('../src/utils/gridLayout'),
      '~/utils/locale': await import('../src/utils/locale'),
      '~/utils/main': { getCSRF: () => 'fixture', getUserID: () => '1', removeHttpFromUrl: value => value },
      '~/utils/videoVisitHistory': { getVideoProgressPercentage: (_identity, value, duration) => progress.normalizePlaybackProgress(value, duration), clearVideoVisitHistory() {}, removeVideoVisitHistory() {} },
      './historyWindow': await import('../src/contentScripts/views/History/historyWindow'),
      './useHistoryTimeline': timelineSource,
    })
    const IconButton = await compileComponent('../src/components/IconButton.vue')
    const app = Vue.createApp(page)
    app.component('ALink', { props: ['href'], setup: (props, { slots, attrs }) => () => Vue.h('a', { ...attrs, href: props.href }, slots.default?.()) })
    app.component('IconButton', IconButton)
    app.component('Progress', { props: ['percentage'], setup: props => () => Vue.h('span', { 'data-progress': props.percentage }) })
    app.component('CoverSidebarSurface', { setup: (_props, { slots }) => () => Vue.h('aside', slots.default?.()) })
    app.component('Button', { setup: (_props, { slots }) => () => Vue.h('button', slots.default?.()) })
    app.component('Empty', blank)
    app.config.globalProperties.$t = key => key
    const failures = []
    app.config.errorHandler = error => failures.push(String(error))
    const settle = async () => {
      await flush()
      for (const observer of observers)
        observer.callback([...observer.targets].map(target => ({ target, contentRect: target.getBoundingClientRect() })))
      await new Promise(resolve => setTimeout(resolve, 60))
      await flush()
    }
    try {
      app.mount(root)
      await settle()
      assert.equal(root.querySelectorAll('.video-list-skeleton__row').length, 5)
      assert.equal(root.querySelectorAll('.history-list-card').length, 0)
      settings.value.historyLayout = 'grid'
      await settle()
      assert.equal(root.querySelectorAll('.video-list-skeleton__row').length, 0)
      assert.equal(root.querySelectorAll('.history-grid-skeleton').length, 6)
      assert.ok(root.querySelector('.history-grid-skeleton__author [data-bew-skeleton]'))
      settings.value.historyLayout = 'list'
      initialRead.resolve()
      await settle()
      assert.equal(root.querySelectorAll('[data-bew-skeleton]').length, 0, 'settled loading placeholders unmount')
      for (let page = 1; page < 50; page++)
        await provider.handleReachBottom.value()
      await settle()
      assert.equal(timeline.historyList.length, 1000)
      assert.equal(windowCount, 1, 'dates never instantiate independent list controllers')
      assert.ok(root.querySelectorAll('.history-list-card').length < 150)
      assert.ok(root.querySelector('.history-day-heading'))
      assert.match(root.querySelector('.history-list-card__overlay').getAttribute('href'), /p=2/)
      root.scrollTop = 8000
      root.dispatchEvent(new Event('scroll'))
      await settle()
      const visible = Array.from(root.querySelectorAll('.history-list-card')).find(element => element.getBoundingClientRect().top >= 0)
      const key = visible.dataset.historyKey
      const focused = visible.querySelector('.history-list-card__delete')
      focused.focus()
      const before = reads.length
      settings.value.historyLayout = 'grid'
      await settle()
      assert.equal(windowCount, 1)
      assert.equal(reads.length, before, 'view changes do not duplicate history reads')
      assert.equal(Array.from(root.querySelectorAll('[data-history-key]')).find(element => element.dataset.historyKey === key), visible)
      assert.equal(document.activeElement, focused)
      assert.ok(root.querySelectorAll('.history-list-card').length < 250)
      Object.keys(settings.value.gridColumns).forEach(key => settings.value.gridColumns[key] = 2)
      await settle()
      assert.equal(document.activeElement, focused)
      focused.click()
      await settle()
      assert.equal(writes.length, 1)
      assert.equal(timeline.historyList.length, 999)
      assert.equal(document.activeElement.classList.contains('history-list-card__delete'), true)
      assert.notEqual(document.activeElement.closest('[data-history-key]').dataset.historyKey, key)
      const search = root.querySelector('.history-search-input')
      search.value = 'needle'
      search.dispatchEvent(new Event('input', { bubbles: true }))
      search.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', isComposing: true, bubbles: true }))
      await flush()
      assert.equal(reads.length, before)
      search.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
      await settle()
      assert.deepEqual(reads.at(-1), ['search', 'needle', 1])
      assert.equal(root.scrollTop, 0)
      assert.equal(timeline.historyList.length, 1)
      search.value = ''
      search.dispatchEvent(new Event('input', { bubbles: true }))
      await settle()
      assert.deepEqual(reads.at(-1), ['history', 0], 'clearing the field exits search without a second Enter')
      assert.equal(timeline.historyList.length, 20)
      assert.equal(root.querySelector('.history-query-summary'), null)
      assert.deepEqual(failures, [])
    }
    finally {
      app.unmount()
      HTMLElement.prototype.getBoundingClientRect = rectangles
      if (clientWidth)
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth)
      else delete HTMLElement.prototype.clientWidth
      globalThis.ResizeObserver = previousResize
      if (previousWindowResize)
        window.ResizeObserver = previousWindowResize
      else delete window.ResizeObserver
      root.remove()
      assert.equal(observers.size, 0)
    }
  })

  check('maintenance 14 component: actual Settings navigates folded async content, cancels stale navigation and hands off quick editing after closing', async () => {
    const clock = frameClock()
    const abort = await loadSourceModule('../src/utils/abort.ts', {}, { ...clock, DOMException })
    const navigation = await loadSourceModule('../src/components/Settings/navigateToSetting.ts', { 'vue': Vue, '~/utils/abort': abort }, { ...clock, MutationObserver: window.MutationObserver })
    const Group = await compileComponent('../src/components/Settings/components/SettingsItemGroup.vue')
    const ready = Vue.ref(false)
    const targetTitle = Vue.ref('Target')
    const leaf = { setup: () => {
      const edit = Vue.inject('startQuickLayoutEdit')
      return () => Vue.h('div', [Vue.h('button', { 'data-quick-edit': '', 'onClick': edit }, 'Edit layout'), Vue.h(Group, { title: 'Group', collapsible: true, defaultCollapsed: true }, () => ready.value ? Vue.h('div', { 'data-settings-title': targetTitle.value }, [Vue.h('input', { 'aria-label': 'target control' })]) : null)])
    } }
    const host = document.body.appendChild(document.createElement('div'))
    const menus = await import('../src/components/Settings/types')
    const settings = Vue.ref({ disableFrostedGlass: false })
    const edits = []
    const Settings = await compileComponent('../src/components/Settings/Settings.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key, tm: () => [], rt: key => key }) },
      '~/components/CloseButton.vue': { default: { render: () => Vue.h('button') } },
      '~/components/PanelTopBlur.vue': { default: { render: () => null } },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/logic': { settings },
      '~/logic/layoutEdit': { enterLayoutEditMode: (...args) => edits.push(args), subscribeSettingNavigation: () => () => {} },
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      './searchCatalog': { settingsSearchEntries: [{ title: 'Target', menu: menus.MenuType.General }, { title: 'Delayed', menu: menus.MenuType.General }] },
      './types': menus,
      './navigateToSetting': navigation,
    }, { globals: { ...clock, sessionStorage: window.sessionStorage, defineAsyncComponent: () => leaf } })
    const shown = Vue.ref(true)
    const app = Vue.createApp({
      setup: () => () => Vue.h(Vue.KeepAlive, null, {
        default: () => shown.value
          ? Vue.h(Settings, {
              onClose: () => {
                shown.value = false
              },
            })
          : null,
      }),
    })
    const failures = []
    app.config.errorHandler = error => failures.push(String(error))
    app.config.globalProperties.$t = key => key
    const step = async () => {
      await flush()
      clock.step()
      await flush()
      clock.step()
      await flush()
    }
    const scrolls = []
    try {
      app.mount(host)
      await step()
      await step()
      const viewport = host.querySelector('.settings-content__scroll')
      viewport.scrollTo = value => scrolls.push(value)
      const input = host.querySelector('.settings-search input')
      input.value = 'Target'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await step()
      assert.equal(scrolls.length, 0)
      ready.value = true
      await step()
      await step()
      assert.equal(scrolls.length, 1)
      assert.equal(scrolls[0].behavior, 'auto')
      assert.equal(host.querySelector('.group-heading').getAttribute('aria-expanded'), 'true')
      assert.ok(host.querySelector('[data-settings-search-highlight]'))
      input.value = 'Delayed'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      assert.equal(host.querySelector('[data-settings-search-highlight]'), null, 'new search text cancels the old highlight synchronously')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await step()
      shown.value = false
      await step()
      targetTitle.value = 'Delayed'
      await step()
      assert.equal(scrolls.length, 1)
      assert.equal(clock.frames.size, 0)
      assert.equal(clock.timers.size, 0)
      shown.value = true
      await step()
      host.querySelector('[data-quick-edit]').click()
      await flush()
      assert.equal(shown.value, false)
      assert.equal(edits.length, 0, 'the Settings surface closes before the editor takes over')
      await step()
      assert.deepEqual(edits, [[]], 'quick editing enters the existing editor without a dead section argument')
      assert.deepEqual(failures, [])
    }
    finally {
      app.unmount()
      host.remove()
      window.sessionStorage.removeItem('bewly-settings-active-menu')
    }
  })

  check('maintenance 04: guarded iframe handshake rejects stale documents, routes, sessions and generations without changing ordinary-page policy', async () => {
    const sent = []
    const handlers = new Map()
    const parent = { postMessage: (message, origin) => sent.push({ ...message, origin }) }
    const frameWindow = { parent, addEventListener: (name, callback) => handlers.set(name, callback), removeEventListener: name => handlers.delete(name) }
    const location = new URL('https://www.bilibili.com/video/BV1NyeA6zESV/')
    const protocol = await import('../src/constants/globalEvents')
    const messaging = await loadSourceModule('../src/utils/iframeMessage.ts', { '~/constants/contentScript': await import('../src/constants/contentScript') }, {
      window: frameWindow,
      document: { referrer: 'https://www.bilibili.com/' },
      Object,
    })
    const state = await loadSourceModule('../src/logic/iframePageState.ts', {
      'vue': Vue,
      '~/constants/globalEvents': protocol,
      '~/utils/iframeMessage': messaging,
    }, { window: frameWindow, location, crypto })
    const changes = []
    const controller = state.setupIframePlaybackContext(changed => changes.push(changed))
    const receive = (data, source = parent, origin = 'https://www.bilibili.com') => handlers.get('message')({ data, source, origin })
    const challenge = (generation, sessionId) => receive({ type: protocol.IFRAME_PLAYER_CONTEXT, phase: 'request', generation, sessionId })
    const reply = (ready, context = 'momentsDialog') => ({ ...ready, phase: 'context', context })
    try {
      assert.equal(sent.length, 1)
      challenge(1, 'parent-one')
      const first = sent.at(-1)
      receive(reply(first), {})
      receive(reply(first), parent, 'https://example.com')
      assert.equal(state.useIframePlaybackContext().value, undefined)
      receive(reply(first))
      assert.equal(state.useIframePlaybackContext().value, 'momentsDialog')
      assert.deepEqual(changes, [true])
      challenge(2, 'parent-two')
      const second = sent.at(-1)
      receive(reply(first))
      assert.equal(changes.length, 1)
      receive(reply(second))
      assert.deepEqual(changes, [true, false])
      state.reportIframePlayerMode('bewlyWidescreen')
      assert.equal(sent.at(-1).sessionId, 'parent-two')
      assert.equal(sent.at(-1).generation, 2)
      const beforeOldChallenge = sent.length
      challenge(1, 'parent-one')
      assert.equal(sent.length, beforeOldChallenge)
      location.href = 'https://www.bilibili.com/video/BV14ReF6NEWN/'
      controller.request()
      const third = sent.at(-1)
      receive(reply(second))
      assert.equal(changes.length, 2)
      const beforeOldReport = sent.length
      state.reportIframePlayerMode('default')
      assert.equal(sent.length, beforeOldReport, 'an old-route binding cannot report a mode for a new route')
      receive(reply(third))
      const settings = Vue.ref({ enableVideoPlayerModeOverrides: true, defaultVideoPlayerMode: 'default', videoPlayerModeOverrides: { momentsDialog: 'bewlyWidescreen', collection: 'widescreen' } })
      const player = await loadSourceModule('../src/utils/player.ts', {
        'vue': Vue,
        '~/contentScripts/playerDomLifecycle': { observePlayerDom: () => () => {} },
        '~/logic': { settings },
        '~/logic/iframePageState': state,
        '~/utils/playbackRate': {},
        '~/utils/videoMetadataBridge': { readVideoPageMetadata: () => ({ pageCount: 1, isCollection: true }) },
        '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
        './playerMedia': {},
      }, { location })
      assert.equal(player.resolveDefaultVideoPlayerMode(), 'bewlyWidescreen')
      assert.equal(player.resolveMomentsDialogPlayerModeOverride(undefined), undefined)
      settings.value.videoPlayerModeOverrides.momentsDialog = 'inherit'
      assert.equal(player.resolveDefaultVideoPlayerMode(), 'widescreen', 'inherit delegates to the actual media context')
      controller.dispose()
      settings.value.videoPlayerModeOverrides.momentsDialog = 'bewlyWidescreen'
      assert.equal(player.resolveDefaultVideoPlayerMode(), 'widescreen', 'ordinary pages never inherit a dialog-only choice')
      assert.equal(handlers.size, 0)
    }
    finally { controller.dispose() }
  })

  check('maintenance 04 parent: the actual Drawer accepts only its current document/session and keeps explicit mode width in sync', async () => {
    const protocol = await import('../src/constants/globalEvents')
    const messaging = await import('../src/utils/iframeMessage')
    const originalUrl = window.location.href
    const host = document.body.appendChild(document.createElement('div'))
    const settings = Vue.ref({ enableVideoPlayerModeOverrides: true, videoPlayerModeOverrides: { momentsDialog: 'bewlyWidescreen' }, drawerEscapeBehavior: 'immediate' })
    const activeDrawer = Vue.ref('none')
    const failures = []
    const drawer = await compileComponent('../src/components/IframeDrawer.vue', {
      '~/composables/useAppProvider': { DrawerType: { IframeDrawer: 'iframe', None: 'none' }, useBewlyApp: () => ({ activeDrawer, setActiveDrawer: value => activeDrawer.value = value }) },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false), isOledDark: Vue.ref(false) }) },
      '~/constants/globalEvents': protocol,
      '~/constants/timing': await import('../src/constants/timing'),
      '~/logic': { settings },
      '~/utils/bewlyWidescreen': { isBewlyWidescreenEngaged: () => false },
      '~/utils/drawerEscape': await import('../src/utils/drawerEscape'),
      '~/utils/escapePriority': { hasIframeEscapePriorityState: () => false },
      '~/utils/iframeMessage': messaging,
      '~/utils/main': { isInIframe: () => false, isHomePage: () => false },
      '~/utils/mediaResources': { releaseIframeMedia() {} },
      '~/utils/messaging': { reportRuntimeFailure: (_message, error) => failures.push(String(error)) },
      '~/utils/pageScrollLock': { lockPageScroll() {}, unlockPageScroll() {} },
      '~/utils/player': { resolveMomentsDialogPlayerModeOverride: () => 'bewlyWidescreen' },
    })
    const Button = await compileComponent('../src/components/Button.vue')
    const app = Vue.createApp(drawer, { url: 'https://www.bilibili.com/video/BV1NyeA6zESV/', playbackContext: 'momentsDialog' })
    app.component('Button', Button)
    app.config.errorHandler = error => failures.push(String(error))
    app.config.globalProperties.$t = key => key
    const sent = []
    try {
      app.mount(host)
      await flush()
      const iframe = host.querySelector('iframe')
      const source = iframe.contentWindow
      if (!source.document.documentElement)
        source.document.appendChild(source.document.createElement('html')).appendChild(source.document.createElement('body'))
      source.focus = () => {}
      source.postMessage = message => sent.push({ ...message })
      iframe.dispatchEvent(new Event('load'))
      await flush()
      const challenge = sent.find(message => message.phase === 'request')
      assert.ok(challenge)
      const receive = (message, eventSource = source) => window.dispatchEvent(new window.MessageEvent('message', { origin: 'https://www.bilibili.com', source: eventSource, data: message }))
      const ready = { ...challenge, phase: 'ready', documentId: 'child-document', requestId: 1, href: source.location.href }
      receive(ready)
      await flush()
      const context = sent.find(message => message.phase === 'context')
      assert.equal(context.context, 'momentsDialog')
      receive({ ...context, phase: 'mode', mode: 'default' })
      await flush()
      const container = iframe.parentElement
      assert.equal(container.style.maxWidth, 'var(--bew-page-max-width)')
      receive({ ...context, phase: 'mode', mode: 'webFullscreen' })
      await flush()
      assert.ok(host.querySelector('.iframe-drawer__fullscreen'))
      receive({ ...context, phase: 'mode', mode: 'default', sessionId: 'retired-session' })
      receive({ ...context, phase: 'mode', mode: 'default', generation: context.generation - 1 })
      receive({ ...context, phase: 'mode', mode: 'default' }, window)
      await flush()
      assert.ok(host.querySelector('.iframe-drawer__fullscreen'))
      receive({ ...ready, requestId: 2 })
      const latest = sent.filter(message => message.phase === 'context').at(-1)
      receive(ready)
      receive({ ...context, phase: 'mode', mode: 'default' })
      await flush()
      assert.ok(host.querySelector('.iframe-drawer__fullscreen'), 'old readiness and mode messages cannot replace the latest binding')
      receive({ ...latest, phase: 'mode', mode: 'default' })
      await flush()
      assert.equal(host.querySelector('.iframe-drawer__fullscreen'), null)
      app.unmount()
      receive({ ...latest, phase: 'mode', mode: 'webFullscreen' })
      await flush()
      assert.equal(host.children.length, 0)
      assert.deepEqual(failures, [], 'no asynchronous Vue/native event error may pass silently')
    }
    finally {
      if (host.children.length)
        app.unmount()
      await flush()
      host.remove()
      window.history.replaceState(null, '', originalUrl)
    }
  })

  check('maintenance 11: the shared rule compiler preprocesses keywords once and preserves forwarded outer types', async () => {
    const { createMomentFilter } = await import('../src/utils/momentFilter')
    let reads = 0
    const config = { momentsEnableKeywordFilter: true, get momentsBlockedKeywords() {
      reads++
      return 'Word,word;  第二条 '
    }, momentsHideVideoDynamics: true }
    const policy = createMomentFilter(config)
    assert.deepEqual(policy.keywords, ['word', '第二条'])
    for (let index = 0; index < 100; index++) {
      assert.equal(policy.passes({ isForward: true, isRegularVideo: true }, 'allowed'), true)
      assert.equal(policy.passes({ isRegularVideo: true }, 'allowed'), false)
      assert.equal(policy.passes({}, 'contains WORD'), false)
      assert.equal(policy.passes({}, ''), true)
    }
    assert.equal(reads, 1)
    const live = createMomentFilter({ momentsHideLiveDynamics: true, momentsHideVideoReservation: true })
    assert.equal(live.passes({ isForward: true, isLive: true }), false)
    assert.equal(live.passes({ isForward: true, isVideoReservation: true }), false)
    assert.equal(live.passes({ isForward: true, isPgc: true, isArticle: true, isDraw: true }), true)
  })

  check('maintenance 11 DOM: native feed filtering scopes roots, handles replacement and releases hidden/disabled work', async () => {
    const dom = new JSDOM('<!doctype html><html><body><main><div class="bili-dyn-list__items"></div></main></body></html>', { url: 'https://t.bilibili.com/', pretendToBeVisual: true })
    const page = dom.window.document
    let hidden = false
    Object.defineProperty(page, 'hidden', { get: () => hidden })
    const settings = Vue.ref({ originalMomentsUseBewlyFilters: false, momentsHideVideoDynamics: true, momentsHideLiveDynamics: true, momentsHideVideoReservation: true, momentsHideChargeExclusive: true, momentsEnableKeywordFilter: true, momentsBlockedKeywords: 'blocked' })
    const route = Vue.reactive({ href: 'https://t.bilibili.com/', navigationId: 0 })
    const rules = await loadSourceModule('../src/logic/momentFilters.ts', {
      'vue': Vue,
      '~/logic/storage': { settings },
      '~/utils/momentFilter': await import('../src/utils/momentFilter'),
    })
    const clock = frameClock()
    const observerTargets = new Map()
    class Observer {
      constructor(callback) { this.observer = new dom.window.MutationObserver(callback) }
      observe(target, options) {
        this.observer.observe(target, options)
        const targets = observerTargets.get(this) ?? new Map()
        targets.set(target, options)
        observerTargets.set(this, targets)
      }

      disconnect() {
        this.observer.disconnect()
        observerTargets.delete(this)
      }
    }
    const module = await loadSourceModule('../src/contentScripts/features/originalMomentsFilter.ts', {
      'vue': Vue,
      '~/composables/useRouteState': { useRouteState: () => route },
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/logic': { settings },
      '~/logic/momentFilters': rules,
      '~/utils/iframeDrawerHost': { isIframeDrawerHost: () => false },
    }, { window: dom.window, document: page, location: dom.window.location, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, MutationObserver: Observer, ...clock })
    let feed = page.querySelector('.bili-dyn-list__items')
    const card = content => `<div class="bili-dyn-list__item"><article class="bili-dyn-item"><div class="bili-dyn-content">${content}</div></article></div>`
    feed.innerHTML = card('<div class="bili-dyn-card-video"></div>')
      + card('<div class="bili-dyn-content__orig reference"><div class="bili-dyn-card-video"></div></div>')
      + card('<div class="bili-dyn-content__orig reference"><div class="bili-dyn-card-live"></div></div>')
      + card('<div class="bili-dyn-card-reserve">视频预约</div>')
      + card('<div class="dyn-blocked-mask">unknown lock</div>')
      + card('<div>blocked text</div>')
    const settle = async () => {
      await flush()
      clock.step()
      await flush()
      clock.step()
    }
    const stop = module.setupOriginalMomentsFilter()
    try {
      assert.equal(observerTargets.size, 0)
      settings.value.originalMomentsUseBewlyFilters = true
      await settle()
      assert.deepEqual(Array.from(feed.children, node => node.classList.contains('bewly-filtered-original-moment')), [true, false, true, true, false, true])
      assert.equal([...observerTargets.values()].some(targets => targets.get(page.body)?.subtree), false, 'once a feed exists, ancestor observation is shallow')
      hidden = true
      page.dispatchEvent(new dom.window.Event('visibilitychange'))
      assert.equal(clock.frames.size, 0)
      assert.equal(observerTargets.size, 0)
      assert.equal(page.querySelectorAll('.bewly-filtered-original-moment').length, 0)
      hidden = false
      page.dispatchEvent(new dom.window.Event('visibilitychange'))
      await settle()
      const removed = feed.firstElementChild
      removed.remove()
      await settle()
      assert.equal(removed.classList.contains('bewly-filtered-original-moment'), false, 'removed rows retain no extension-owned hiding marker')
      const replacement = page.createElement('div')
      replacement.className = 'bili-dyn-list__items'
      replacement.innerHTML = card('<div class="bili-dyn-card-video"></div>')
      const previousFeed = feed
      feed.replaceWith(replacement)
      feed = replacement
      await settle()
      assert.equal(previousFeed.querySelectorAll('.bewly-filtered-original-moment').length, 0)
      assert.equal(feed.firstElementChild.classList.contains('bewly-filtered-original-moment'), true)
      route.href = 'https://t.bilibili.com/1234'
      route.navigationId++
      await settle()
      assert.equal(page.querySelectorAll('.bewly-filtered-original-moment').length, 0, 'a detail route is never treated as a feed')
      assert.equal(observerTargets.size, 0)
      route.href = 'https://t.bilibili.com/'
      route.navigationId++
      await settle()
      settings.value.originalMomentsUseBewlyFilters = false
      await settle()
      assert.equal(observerTargets.size, 0)
      assert.equal(clock.frames.size, 0)
      assert.equal(page.querySelectorAll('.bewly-filtered-original-moment').length, 0)
    }
    finally {
      stop()
      dom.window.close()
    }
  })

  check('maintenance 14: settings target waits for mount/expansion/animation, scrolls only its viewport, and aborts pending work', async () => {
    const clock = frameClock()
    const abort = await loadSourceModule('../src/utils/abort.ts', {}, { ...clock, DOMException })
    const module = await loadSourceModule('../src/components/Settings/navigateToSetting.ts', { 'vue': Vue, '~/utils/abort': abort }, { ...clock, MutationObserver: window.MutationObserver })
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<header class="settings-header"></header><div class="viewport" style="padding-top:92px"></div>'
    const viewport = root.querySelector('.viewport')
    const rect = (top, height) => ({ top, bottom: top + height, left: 0, right: 600, width: 600, height })
    root.firstElementChild.getBoundingClientRect = () => rect(100, 92)
    viewport.getBoundingClientRect = () => rect(100, 300)
    Object.defineProperty(viewport, 'clientHeight', { value: 300 })
    viewport.scrollTop = 100
    const scrolls = []
    viewport.scrollTo = value => scrolls.push(value)
    const animation = deferred()
    let running = true
    root.getAnimations = () => running ? [{ playState: 'running', effect: { getComputedTiming: () => ({ iterations: 1 }) }, finished: animation.promise }] : []
    let measurements = 0
    const controller = new AbortController()
    const request = module.navigateToSetting({ root, viewport, find: () => root.querySelector('[data-settings-title="target"]') ?? undefined, signal: controller.signal, behavior: 'auto' })
    try {
      await flush()
      assert.equal(scrolls.length, 0)
      viewport.innerHTML = '<details><summary>outer</summary><div class="b-settings-item-group"><button class="group-heading" aria-expanded="false"></button><main hidden><div data-settings-title="target"></div></main></div></details>'
      const toggle = viewport.querySelector('button')
      toggle.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', 'true')
        toggle.nextElementSibling.hidden = false
      })
      const target = viewport.querySelector('[data-settings-title]')
      target.getBoundingClientRect = () => {
        measurements++
        return rect(580, 40)
      }
      await flush()
      clock.step()
      await flush()
      assert.equal(viewport.querySelector('details').open, true)
      assert.equal(toggle.getAttribute('aria-expanded'), 'true')
      assert.equal(measurements, 0, 'geometry is not read during the owning transition')
      clock.step()
      await flush()
      running = false
      animation.resolve()
      await flush()
      clock.step()
      await request
      assert.equal(scrolls.length, 1)
      assert.equal(scrolls[0].top, 404)
      assert.equal(scrolls[0].behavior, 'auto')
      assert.equal(clock.timers.size, 0)
      for (const exists of [false, true]) {
        const owner = new AbortController()
        const waiting = module.navigateToSetting({ root, viewport, find: () => exists ? target : undefined, signal: owner.signal, behavior: 'smooth' })
        await flush()
        owner.abort()
        await waiting
        clock.step()
        assert.equal(scrolls.length, 1)
        assert.equal(clock.frames.size, 0)
        assert.equal(clock.timers.size, 0)
      }
    }
    finally {
      controller.abort()
      root.remove()
    }
  })
}
