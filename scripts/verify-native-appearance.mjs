import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerNativeAppearanceChecks(check, { Vue, compileComponent, flush }) {
  check('native appearance: compiled advertising CSS hides marked slots, preserves ordinary notices and restores the same nodes', async () => {
    const { readFile } = await import('node:fs/promises')
    const { compileString } = await import('sass')
    const css = compileString(await readFile(new URL('../src/styles/blockAds.scss', import.meta.url), 'utf8')).css
    const rootClass = document.documentElement.className
    const bodyClass = document.body.className
    document.documentElement.classList.remove('block-useless-contents')
    document.body.classList.remove('block-useless-contents')
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = css
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<div class="ad-report">Marked slot</div><div class="adcard">Native advertisement</div><div class="brand-ad-list">Brand advertisement</div><div class="desktop-download-tip">Native download notice</div><div class="adblock-tips">Native blocker notice</div><div class="ordinary-card">Commercial product title</div>'
    const ad = root.querySelector('.ad-report')
    let clicks = 0
    ad.addEventListener('click', () => clicks++)
    try {
      root.classList.add('block-useless-contents')
      for (const element of root.querySelectorAll('.ad-report, .adcard, .brand-ad-list'))
        assert.equal(getComputedStyle(element).display, 'none')
      for (const element of root.querySelectorAll('.desktop-download-tip, .adblock-tips, .ordinary-card'))
        assert.notEqual(getComputedStyle(element).display, 'none')
      root.classList.remove('block-useless-contents')
      assert.equal(root.querySelector('.ad-report'), ad)
      assert.notEqual(getComputedStyle(ad).display, 'none')
      ad.click()
      assert.equal(clicks, 1)
    }
    finally {
      root.remove()
      style.remove()
      document.documentElement.className = rootClass
      document.body.className = bodyClass
    }
  })

  check('native appearance: development manifest watcher includes the routing constants and regenerates through the existing command', async () => {
    const calls = []
    let watched = []
    let changed
    await loadSourceModule('./prepare.ts', {
      'node:child_process': { execFileSync: (command, args) => calls.push({ command, args }) },
      'node:process': { default: {} },
      'chokidar': { default: { watch: (paths) => {
        watched = paths
        return { on: (event, callback) => {
          assert.equal(event, 'change')
          changed = callback
        } }
      } } },
      'fs-extra': { default: { ensureDirSync() {}, copySync() {} } },
      './contributorsCache': { CONTRIBUTORS_IMAGE_URL: 'https://example.invalid/contributors.svg', prepareContributorsImage: async () => {} },
      './utils': { isDev: true, isSafari: false, r: path => `/fixture/${path}` },
    })
    await flush()
    assert.equal(calls.length, 1)
    for (const path of ['src/constants/nativeSites.ts', 'src/constants/contentScript.ts']) {
      assert.ok(watched.includes(`/fixture/${path}`))
      changed(`/fixture/${path}`)
    }
    assert.equal(calls.length, 3)
    assert.ok(calls.every(call => call.command === 'pnpm' && call.args.join(' ') === 'exec esno ./scripts/manifest.ts'))
  })

  check('native appearance: game catalogue keys retain native navigation and never take over adjacent business actions', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    for (const [page, markup, selector] of [
      ['game-gifts', '<div class="g-title"><div class="btn-to-mygift">My gifts</div></div>', '.btn-to-mygift'],
      ['game-payment', '<main class="content"><div class="games"><div class="game-list"><div class="game-body"><img alt=""><p>Native game catalogue</p></div></div></div></main>', '.game-body'],
      ['game-ranks', '<aside class="aside"><ul class="anchor_wrapper"><li class="anchor_item"><span>Native ranking</span></li></ul></aside>', '.anchor_item'],
    ]) {
      const root = document.body.appendChild(document.createElement('section'))
      root.innerHTML = `${markup}<button class="get-gift">Native action</button><input value="untouched">`
      const item = root.querySelector(selector)
      const action = root.querySelector('button')
      const input = root.querySelector('input')
      let navigations = 0
      let actions = 0
      item.addEventListener('click', () => navigations++)
      action.addEventListener('click', () => actions++)
      const stop = setupNativePageKeyboard(root, page)
      try {
        assert.equal(item.getAttribute('role'), 'button')
        assert.equal(item.tabIndex, 0)
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }))
        assert.equal(navigations, 0)
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        assert.equal(navigations, 1)
        item.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
        assert.equal(navigations, 1)
        item.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
        assert.equal(navigations, 2)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        assert.equal(input.value, 'untouched')
        assert.equal(actions, 0)
        assert.equal(action.hasAttribute('role'), false)
        stop()
        assert.equal(root.querySelector(selector), item)
        assert.equal(item.hasAttribute('role'), false)
        assert.equal(item.hasAttribute('tabindex'), false)
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        assert.equal(navigations, 2)
        item.click()
        assert.equal(navigations, 3, 'native mouse navigation survives disposal')
      }
      finally {
        stop()
        root.remove()
      }
    }
  })

  check('native appearance: wiki platform tabs keep native selection and release their catalogue-only keyboard owner', async () => {
    const rootClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    const host = document.body.appendChild(document.createElement('section'))
    host.innerHTML = '<header><div class="resp-tabs-list"><div>Unrelated hero</div></div></header><div class="resp-tabs"><div class="search-kk"><ul class="resp-tabs-list"><li class="active"><span>Published</span></li><li><span>In progress</span></li></ul><input value="untouched"><button>Native search</button></div><div class="resp-tabs-container">Published</div></div>'
    const catalogue = host.querySelector('.resp-tabs')
    const items = [...catalogue.querySelectorAll('li')]
    const input = catalogue.querySelector('input')
    let selections = 0
    items.forEach(item => item.addEventListener('click', () => {
      selections++
      items.forEach(candidate => candidate.classList.toggle('active', candidate === item))
      catalogue.querySelector('.resp-tabs-container').textContent = item.textContent
    }))
    const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: true, themeColor: '#f43f5e', customizeFont: 'default' })
    preferences.displayReady = Vue.ref(true)
    const keyboard = await import('../src/contentScripts/features/nativePageKeyboard')
    const owners = []
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      'vue': Vue,
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
      '~/utils/themeColor': { ...(await import('../src/utils/themeColor')), readThemeContrastSurfaces: () => [] },
      './nativePageKeyboard': { setupNativePageKeyboard(root, page) {
        owners.push({ root, page })
        return keyboard.setupNativePageKeyboard(root, page)
      } },
    }, { location: { hostname: 'wiki.biligame.com', pathname: '/wiki/%E9%A6%96%E9%A1%B5' } })
    const stop = module.setupNativeSiteAppearance()
    try {
      assert.equal(owners.length, 1)
      assert.equal(owners[0].root, catalogue)
      assert.equal(owners[0].page, 'game-wiki')
      assert.equal(host.querySelector('header [role]'), null)
      assert.equal(catalogue.querySelector('button').hasAttribute('role'), false)
      assert.equal(items[0].getAttribute('aria-pressed'), 'true')
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }))
      assert.equal(selections, 0)
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selections, 1)
      assert.equal(items[0].getAttribute('aria-pressed'), 'false')
      assert.equal(items[1].getAttribute('aria-pressed'), 'true')
      assert.equal(catalogue.querySelector('.resp-tabs-container').textContent, 'In progress')
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      items[0].dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selections, 2)
      assert.equal(items[0].getAttribute('aria-pressed'), 'true')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(input.value, 'untouched')
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.ok(items.every(item => !item.hasAttribute('role') && !item.hasAttribute('tabindex') && !item.hasAttribute('aria-pressed')))
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true)
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(selections, 2)
      preferences.value.adaptToOtherPageStyles = true
      await flush()
      assert.equal(owners.length, 2)
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(selections, 3, 'reenabling does not accumulate activation listeners')
      stop()
      assert.equal(catalogue.querySelector('li'), items[0])
      items[0].click()
      assert.equal(selections, 4, 'native selection survives teardown')
    }
    finally {
      stop()
      host.remove()
      document.documentElement.className = rootClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: live directory filters and area popup keep native actions and return focus after closing', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<header class="index_header_fixture"><div class="index_switch_area_fixture">Change area</div></header><div class="all__card-list-ctnr"><div class="tab__bar-wrap"><div class="tabs__tag-item active">All</div><div class="tabs"><div class="tabs__normal-item active">Recommended</div><div class="tabs__normal-item">Popular</div></div></div><div class="cover-tabs-wrap"><div class="tabs__normal-item active">Cover</div></div></div><button>Native business action</button><input>'
    const header = root.querySelector('header')
    const trigger = root.querySelector('[class*="index_switch_area_"]')
    const input = root.querySelector('input')
    const sortItems = [...root.querySelectorAll('.tab__bar-wrap .tabs__normal-item')]
    let sortChanges = 0
    sortItems.forEach(item => item.addEventListener('click', () => {
      sortChanges++
      sortItems.forEach(candidate => candidate.classList.toggle('active', candidate === item))
    }))
    let nativeToggles = 0
    let selections = 0
    const close = () => {
      trigger.classList.remove('index_active_fixture')
      header.querySelector('[class*="index_tags-box_"]')?.remove()
    }
    trigger.addEventListener('click', () => {
      nativeToggles++
      if (trigger.classList.contains('index_active_fixture')) {
        close()
        return
      }
      trigger.classList.add('index_active_fixture')
      const panel = header.appendChild(document.createElement('section'))
      panel.className = 'index_tags-box_fixture'
      panel.innerHTML = '<a class="index_tag-item_fixture index_active_fixture">Current area</a><a class="index_tag-item_fixture" href="#native">Native link</a>'
      panel.firstElementChild.addEventListener('click', () => {
        selections++
        close()
      })
    })
    const stop = setupNativePageKeyboard(root, 'live-directory')
    try {
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      assert.equal(root.querySelector('.tabs__tag-item').getAttribute('aria-pressed'), 'true')
      assert.equal(root.querySelector('.tabs__normal-item').getAttribute('aria-pressed'), 'true')
      assert.equal(root.querySelector('.cover-tabs-wrap .tabs__normal-item').getAttribute('aria-pressed'), 'true')
      assert.ok(sortItems.every(item => item.getAttribute('role') === 'button' && item.tabIndex === 0))
      sortItems[1].focus()
      sortItems[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(sortChanges, 1)
      assert.equal(sortItems[0].getAttribute('aria-pressed'), 'false')
      assert.equal(sortItems[1].getAttribute('aria-pressed'), 'true')
      sortItems[0].focus()
      sortItems[0].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      sortItems[0].dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(sortChanges, 2)
      assert.equal(sortItems[0].getAttribute('aria-pressed'), 'true')
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      let choice = header.querySelector('a:not([href])')
      assert.equal(choice.getAttribute('role'), 'link')
      assert.equal(choice.getAttribute('aria-current'), 'page')
      assert.equal(header.querySelector('a[href]').hasAttribute('role'), false)
      choice.focus()
      choice.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      choice.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(selections, 0, 'link Space retains native page scrolling')
      choice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(nativeToggles, 2)
      assert.equal(document.activeElement, trigger)
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      trigger.click()
      await flush()
      choice = header.querySelector('a:not([href])')
      choice.focus()
      choice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selections, 1)
      assert.equal(document.activeElement, trigger, 'native removal of the choice returns focus to the retained trigger')
      trigger.click()
      await flush()
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'unrelated input keeps its keys')
      stop()
      assert.equal(trigger.hasAttribute('role'), false)
      assert.equal(trigger.hasAttribute('aria-expanded'), false)
      assert.equal(header.querySelector('a:not([href])').hasAttribute('tabindex'), false)
      assert.equal(root.querySelector('button').hasAttribute('role'), false)
      assert.ok(sortItems.every(item => !item.hasAttribute('role') && !item.hasAttribute('tabindex') && !item.hasAttribute('aria-pressed')))
      sortItems[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(sortChanges, 2, 'disabled adaptation releases sorting keyboard handling')
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: legacy live directories scope keyboard ownership to app and leave room documents alone', async () => {
    const app = document.body.appendChild(document.createElement('div'))
    app.id = 'app'
    const rootClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    try {
      for (const pathname of ['/all', '/lol/', '/123456', '/blanc/123456']) {
        const calls = []
        let disposals = 0
        const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: false, themeColor: '#f43f5e', customizeFont: 'default' })
        preferences.displayReady = Vue.ref(true)
        const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
          'vue': Vue,
          '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
          '~/constants/nativeSites': await import('../src/constants/nativeSites'),
          '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
          '~/utils/themeColor': { ...(await import('../src/utils/themeColor')), readThemeContrastSurfaces: () => [] },
          './nativePageKeyboard': { setupNativePageKeyboard(root, page) {
            calls.push({ root, page })
            return () => {
              disposals++
            }
          } },
        }, { location: { hostname: 'live.bilibili.com', pathname } })
        const stop = module.setupNativeSiteAppearance()
        try {
          const directory = pathname === '/all' || pathname === '/lol/'
          assert.equal(calls.length, directory ? 1 : 0, pathname)
          if (directory) {
            assert.equal(calls[0].root, app)
            assert.equal(calls[0].page, 'live-directory')
          }
          preferences.value.adaptToOtherPageStyles = false
          await flush()
          assert.equal(disposals, directory ? 1 : 0, 'disabling appearance releases the same keyboard owner')
        }
        finally {
          stop()
        }
      }
    }
    finally {
      app.remove()
      document.documentElement.className = rootClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: authored community wikis retain their design while advertisements remain independently controlled', async () => {
    const rootClass = document.documentElement.className
    const bodyClass = document.body.className
    const originalStyle = document.documentElement.getAttribute('style')
    document.documentElement.className = 'native-author-theme dark'
    document.documentElement.style.setProperty('--bew-theme-color', '#123456')
    const nativeStyle = document.documentElement.getAttribute('style')
    const host = document.body.appendChild(document.createElement('section'))
    host.innerHTML = '<button aria-expanded="false">Native disclosure</button><input value="original">'
    const button = host.querySelector('button')
    const input = host.querySelector('input')
    let clicks = 0
    let starts = 0
    let stops = 0
    button.addEventListener('click', () => clicks++)
    const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: false, themeColor: '#f43f5e', customizeFont: 'default' })
    preferences.displayReady = Vue.ref(true)
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      'vue': Vue,
      '~/composables/useDark': { useDark: () => {
        starts++
        return { isDark: Vue.ref(false) }
      }, stopDarkState() { stops++ } },
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
      '~/utils/themeColor': { ...(await import('../src/utils/themeColor')), readThemeContrastSurfaces: () => [] },
      './nativePageKeyboard': { setupNativePageKeyboard() { throw new Error('community controls retain their native keyboard owner') } },
    }, { location: { hostname: 'wiki.biligame.com', pathname: '/nrc/example' } })
    document.body.classList.remove('mediawiki')
    const stopResource = module.setupNativeSiteAppearance()
    assert.equal(starts, 0, 'resource/API documents do not acquire a theme owner')
    stopResource()
    document.body.classList.add('mediawiki')
    const stop = module.setupNativeSiteAppearance()
    try {
      assert.equal(starts, 0)
      assert.equal(document.documentElement.dataset.bewlyNativeSite, 'game-wiki-community')
      assert.equal(button.hasAttribute('tabindex'), false)
      button.click()
      preferences.value.blockAds = true
      await flush()
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true)
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.equal(stops, 0)
      assert.equal(document.documentElement.classList.contains('bewly-design'), false)
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true, 'the appearance preference cannot disable advertising rules')
      preferences.value.adaptToOtherPageStyles = true
      preferences.value.blockAds = false
      await flush()
      assert.equal(starts, 0)
      assert.equal(document.documentElement.className, 'native-author-theme dark')
      assert.equal(document.documentElement.getAttribute('style'), nativeStyle)
      assert.equal(document.body.classList.contains('mediawiki'), true)
      assert.equal(host.querySelector('button'), button)
      assert.equal(host.querySelector('input'), input)
      assert.equal(input.value, 'original')
      assert.equal(button.getAttribute('aria-expanded'), 'false')
      button.click()
      assert.equal(clicks, 2)
    }
    finally {
      stop()
      host.remove()
      document.documentElement.className = rootClass
      document.body.className = bodyClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: one-off campaigns retain native media and colors while explicit advertisements follow the existing setting', async () => {
    const { readFile } = await import('node:fs/promises')
    const { compileString } = await import('sass')
    const rootClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = `.native-art{background:rgb(42,55,88);color:rgb(244,229,172);border-radius:19px}${compileString(await readFile(new URL('../src/styles/blockAds.scss', import.meta.url), 'utf8')).css}`
    const host = document.body.appendChild(document.createElement('section'))
    host.innerHTML = '<div class="native-art"><img alt="Original campaign artwork"><button>Native read control</button></div><div class="ad-report">Explicit advertisement</div><div class="ordinary-card">Commercial content without an ad marker</div>'
    const artwork = host.querySelector('.native-art')
    const image = host.querySelector('img')
    const button = host.querySelector('button')
    const advertisement = host.querySelector('.ad-report')
    let clicks = 0
    button.addEventListener('click', () => clicks++)
    try {
      for (const url of [
        'https://www.bilibili.com/blackboard/activity-example.html',
        'https://www.bilibili.com/blackboard/era/example.html',
        'https://live.bilibili.com/blackboard/era/example.html',
      ]) {
        document.documentElement.className = 'native-campaign-skin'
        const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: true, customizeFont: 'custom', fontFamily: 'example' })
        preferences.displayReady = Vue.ref(true)
        const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
          'vue': Vue,
          '~/composables/useDark': {
            useDark() { throw new Error('campaign appearance remains native') },
            stopDarkState() { throw new Error('an unowned native theme cannot be stopped') },
          },
          '~/constants/nativeSites': await import('../src/constants/nativeSites'),
          '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
          '~/utils/themeColor': await import('../src/utils/themeColor'),
          './nativePageKeyboard': { setupNativePageKeyboard() { throw new Error('campaign controls retain their native owner') } },
        }, { location: new URL(url) })
        const stop = module.setupNativeSiteAppearance()
        try {
          assert.equal(document.documentElement.classList.contains('bewly-design'), false)
          assert.equal(document.documentElement.classList.contains('bewly-native-fonts'), false)
          assert.equal(getComputedStyle(advertisement).display, 'none')
          assert.notEqual(getComputedStyle(host.querySelector('.ordinary-card')).display, 'none')
          preferences.value.adaptToOtherPageStyles = false
          await flush()
          assert.equal(getComputedStyle(advertisement).display, 'none')
          preferences.value.blockAds = false
          await flush()
          assert.notEqual(getComputedStyle(advertisement).display, 'none')
          assert.equal(host.querySelector('.ad-report'), advertisement)
          assert.equal(host.querySelector('img'), image)
          assert.equal(getComputedStyle(artwork).backgroundColor, 'rgb(42, 55, 88)')
          assert.equal(getComputedStyle(artwork).color, 'rgb(244, 229, 172)')
          assert.equal(getComputedStyle(artwork).borderRadius, '19px')
          assert.equal(button.hasAttribute('tabindex'), false)
          button.click()
          assert.equal(document.documentElement.className, 'native-campaign-skin')
        }
        finally {
          stop()
        }
      }
      assert.equal(clicks, 3)
    }
    finally {
      host.remove()
      style.remove()
      document.documentElement.className = rootClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: material filters expose native selection and reveal clipped keyboard focus without polling', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<div class="category-list-wrapper collapse"><div class="category"><div class="item active">Visible</div><div class="item">Wrapped</div></div><div class="operation">Expand</div></div><div class="square-tab-button active">Videos</div><div class="manage-head"><div class="u-head-item u-head-item-active">All</div><div class="u-head-item">Pending</div></div><input>'
    const wrapper = root.querySelector('.category-list-wrapper')
    const [first, wrapped] = root.querySelectorAll('.category .item')
    const operation = root.querySelector('.operation')
    const [all, pending] = root.querySelectorAll('.u-head-item')
    const input = root.querySelector('input')
    wrapper.getBoundingClientRect = () => ({ top: 0, bottom: 40 })
    first.getBoundingClientRect = () => ({ top: 0, bottom: 40 })
    wrapped.getBoundingClientRect = () => ({ top: 48, bottom: 88 })
    let expansions = 0
    operation.addEventListener('click', () => {
      expansions++
      wrapper.classList.remove('collapse')
      wrapper.classList.add('extend')
    })
    pending.addEventListener('click', () => {
      all.classList.remove('u-head-item-active')
      pending.classList.add('u-head-item-active')
    })
    const stop = setupNativePageKeyboard(root, 'materials')
    try {
      assert.equal(first.getAttribute('aria-pressed'), 'true')
      assert.equal(root.querySelector('.square-tab-button').getAttribute('aria-pressed'), 'true')
      assert.equal(all.getAttribute('aria-pressed'), 'true')
      assert.equal(operation.getAttribute('aria-expanded'), 'false')
      first.focus()
      assert.equal(expansions, 0, 'visible categories do not change the native disclosure')
      wrapped.focus()
      await flush()
      assert.equal(expansions, 1, 'clipped focus opens the existing native control exactly once')
      assert.equal(operation.getAttribute('aria-expanded'), 'true')
      assert.equal(document.activeElement, wrapped)
      pending.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(pending.getAttribute('aria-pressed'), 'true')
      assert.equal(all.getAttribute('aria-pressed'), 'false')
      stop()
      assert.equal(operation.hasAttribute('aria-expanded'), false)
      assert.equal(wrapped.hasAttribute('tabindex'), false)
      wrapper.classList.add('collapse')
      input.focus()
      wrapped.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
      assert.equal(expansions, 1, 'cleanup releases the same focus listener')
      assert.equal(root.querySelector('.category .item'), first)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: late virtual-avatar filters reuse native selection and release keyboard ownership', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<input><button>Native upload</button><div class="bmc-virtual-idol-works-card">Unrelated card</div>'
    const input = root.querySelector('input')
    const unrelated = root.querySelector('.bmc-virtual-idol-works-card')
    const stop = setupNativePageKeyboard(root, 'materials')
    const page = root.appendChild(document.createElement('div'))
    page.className = 'virtual-idol-manage'
    page.innerHTML = '<div class="bmc-virtual-idol-works-card active"><div class="title">All</div><div class="num">0</div></div><div class="bmc-virtual-idol-works-card"><div class="title">Pending</div><div class="num">0</div></div>'
    const [all, pending] = page.children
    let selections = 0
    for (const target of [all, pending]) {
      target.addEventListener('click', () => {
        selections++
        all.classList.toggle('active', target === all)
        pending.classList.toggle('active', target === pending)
      })
    }
    try {
      await flush()
      assert.equal(all.getAttribute('aria-pressed'), 'true')
      assert.equal(pending.getAttribute('role'), 'button')
      assert.equal(pending.tabIndex, 0)
      assert.equal(unrelated.hasAttribute('role'), false)
      assert.equal(root.querySelector('button').hasAttribute('tabindex'), false)
      pending.focus()
      pending.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }))
      assert.equal(selections, 0)
      pending.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selections, 1)
      assert.equal(pending.getAttribute('aria-pressed'), 'true')
      assert.equal(all.getAttribute('aria-pressed'), 'false')
      all.focus()
      all.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(selections, 1)
      all.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selections, 2)
      assert.equal(all.getAttribute('aria-pressed'), 'true')
      assert.equal(input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })), true)
      assert.equal(page.firstElementChild, all)
      stop()
      for (const target of [all, pending]) {
        assert.equal(target.hasAttribute('role'), false)
        assert.equal(target.hasAttribute('tabindex'), false)
        assert.equal(target.hasAttribute('aria-pressed'), false)
      }
      pending.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(selections, 2)
      pending.click()
      assert.equal(selections, 3, 'native mouse activation remains available after cleanup')
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: music ranking tabs and periods retain native clicks and popup focus ownership', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<div class="_tabsHeader_fixture"><span class="_tabHeaderItem_fixture _tabHeaderItemSelect_fixture">Songs</span><span class="_tabHeaderItem_fixture">Remixes</span></div><div class="_detailArea_fixture"><div class="_target_fixture"><div><div class="periodShow">Current period</div></div></div></div><button>Native subscription</button><input>'
    const [songs, remixes] = root.querySelectorAll('span')
    const shell = root.querySelector('._target_fixture')
    const trigger = root.querySelector('.periodShow')
    const input = root.querySelector('input')
    let selections = 0
    let toggles = 0
    remixes.addEventListener('click', () => {
      songs.classList.remove('_tabHeaderItemSelect_fixture')
      remixes.classList.add('_tabHeaderItemSelect_fixture')
    })
    trigger.addEventListener('click', () => {
      toggles++
      const existing = shell.querySelector('._PcRankPeriodPop_fixture')
      if (existing) {
        existing.remove()
        return
      }
      const popup = shell.appendChild(document.createElement('div'))
      popup.className = '_PcRankPeriodPop_fixture'
      popup.innerHTML = '<div class="periodList"><div class="periodItem">Previous period</div></div>'
      popup.querySelector('.periodItem').addEventListener('click', () => {
        selections++
        popup.remove()
      })
    })
    const stop = setupNativePageKeyboard(root, 'music-rank')
    try {
      assert.equal(songs.getAttribute('aria-pressed'), 'true')
      remixes.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(remixes.getAttribute('aria-pressed'), 'true')
      assert.equal(songs.getAttribute('aria-pressed'), 'false')
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      let option = shell.querySelector('.periodItem')
      option.focus()
      option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(toggles, 2)
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      assert.equal(document.activeElement, trigger)
      trigger.click()
      await flush()
      option = shell.querySelector('.periodItem')
      option.focus()
      option.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      option.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selections, 1)
      assert.equal(document.activeElement, trigger)
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(toggles, 3)
      stop()
      assert.equal(trigger.hasAttribute('aria-expanded'), false)
      assert.equal(remixes.hasAttribute('tabindex'), false)
      assert.equal(root.querySelector('button').hasAttribute('role'), false)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: auxiliary tabs keep native selection, IME handling and reversible keyboard ownership', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const cases = [
      ['topics', '<div class="topic-main"><ul class="nav-tab"><li class="on">All</li><li>Music</li></ul></div>', 'li', 'on'],
      ['academy', '<ul class="bca-cf-ul"><li class="bca-cf-li selected">All</li><li class="bca-cf-li">Video</li></ul>', 'li', 'selected'],
      ['wallet', '<div class="pay-tab-wp"><div class="pay-tab-item pay-tab-item-selected">Payment</div><div class="pay-tab-item">Use</div></div>', '.pay-tab-item', 'pay-tab-item-selected'],
      ['account', '<div class="record-nav"><div class="record-nav-item on">Login</div><div class="record-nav-item">Experience</div></div>', '.record-nav-item', 'on'],
      ['account', '<div class="coin-nav"><div class="coin-nav-item on">Home</div><div class="coin-nav-item">Records</div></div>', '.coin-nav-item', 'on'],
      ['manga-account', '<div class="account-info-container"><ul><li class="pivot-header-item selected">Credits</li><li class="pivot-header-item">Coupons</li></ul></div>', 'li', 'selected'],
      ['downloads', '<ul class="info-select"><li class="active">Desktop</li><li>Tablet</li></ul>', 'li', 'active'],
      ['game-help', '<div class="qa-list"><div class="qa-item qa-active">Account</div><div class="qa-item">Game</div></div>', '.qa-item', 'qa-active'],
      ['game-personal', '<ul class="user-nav_fixture"><li class="active_fixture">Home</li><li>Games</li></ul>', 'li', 'active_fixture', 'aria-current', 'page'],
      ['game-personal', '<div class="games-wrap_fixture"><div class="game-sub-item_fixture tab-active_fixture">Played</div><div class="game-sub-item_fixture">Reserved</div></div>', '[class*="game-sub-item_"]', 'tab-active_fixture'],
      ['game-ranks', '<aside class="aside"><ul class="anchor_wrapper"><li class="anchor_item active">Popular</li><li class="anchor_item">Upcoming</li></ul></aside>', '.anchor_item', 'active'],
      ['creator-promotion', '<nav class="fly-pc-navigation"><div class="nav-item nav-item-active">Home</div><div class="nav-item">Reports</div></nav>', '.nav-item', 'nav-item-active', 'aria-current', 'page'],
      ['creator-data', '<main class="data-center"><nav class="header-nav"><div class="item selected">Overview</div><div class="item">Audience</div></nav></main>', '.item', 'selected', 'aria-current', 'page'],
      ['customer-service', '<section class="guess-panel"><div class="tag-item tag-item__active">Suggested</div><div class="tag-item">Account</div></section>', '.tag-item', 'tag-item__active'],
      ['investor-public', '<ul class="year-list"><li class="year-item active">All</li><li class="year-item">2026</li></ul>', 'li', 'active'],
      ['investor-public', '<div class="annual-interim-reports-container"><div class="child-head"><span class="nav-link active">NASDAQ</span><span class="nav-link">HKEX</span></div></div>', 'span', 'active'],
    ]
    for (const [page, html, selector, selectedClass, attribute = 'aria-pressed', selectedValue = 'true'] of cases) {
      const root = document.body.appendChild(document.createElement('section'))
      root.innerHTML = `${html}<input aria-label="Unrelated native input">`
      const [first, second] = root.querySelectorAll(selector)
      let clicks = 0
      second.addEventListener('click', () => {
        clicks++
        first.classList.remove(selectedClass)
        second.classList.add(selectedClass)
      })
      const stop = setupNativePageKeyboard(root, page)
      try {
        assert.equal(second.tabIndex, 0, page)
        assert.equal(first.getAttribute(attribute), selectedValue, page)
        second.focus()
        second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
        assert.equal(clicks, 0)
        second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true }))
        await flush()
        assert.equal(clicks, 1, page)
        assert.equal(first.getAttribute(attribute), attribute === 'aria-current' ? null : 'false', page)
        assert.equal(second.getAttribute(attribute), selectedValue, page)
        second.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
        root.querySelector('input').focus()
        second.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
        assert.equal(clicks, 1, 'moving focus cancels pending Space activation')
        stop()
        assert.equal(second.hasAttribute('role'), false)
        assert.equal(second.hasAttribute('tabindex'), false)
        assert.equal(second.classList.contains(selectedClass), true, 'native state is not reverted during appearance cleanup')
        second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        assert.equal(clicks, 1)
      }
      finally {
        stop()
        root.remove()
      }
    }
  })

  check('native appearance: recruitment navigation keeps native actions and link keys while FAQ state follows native classes', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<nav><a class="bili-banner-right-routes active">Campus</a></nav><a class="bili-item-card"><h4>Position</h4></a><a class="bili-item-card" href="#native">Native link</a><a class="bili-item-card"><button>Native action</button></a><div class="campus-pc"><div class="faq-item"><div class="faq-q">Question</div><div class="faq-a-wrap">Answer</div></div></div><div class="bup-pc-faq-item"><div class="bup-pc-faq-q">Project question</div></div><input aria-label="Search">'
    const card = root.querySelector('a.bili-item-card')
    const nav = root.querySelector('.bili-banner-right-routes')
    const input = root.querySelector('input')
    let clicks = 0
    card.addEventListener('click', () => clicks++)
    const stop = setupNativePageKeyboard(root, 'jobs-public')
    try {
      assert.equal(card.getAttribute('role'), 'link')
      assert.equal(card.tabIndex, 0)
      assert.equal(nav.getAttribute('aria-current'), 'page')
      assert.equal(root.querySelector('a[href]').hasAttribute('role'), false)
      assert.equal(root.querySelector('a:has(button)').hasAttribute('role'), false)
      card.focus()
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
      assert.equal(clicks, 0)
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      card.dispatchEvent(space)
      card.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(space.defaultPrevented, false, 'Space retains native link scrolling rather than opening a position')
      assert.equal(clicks, 1)
      input.focus()
      const searchEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      input.dispatchEvent(searchEnter)
      assert.equal(searchEnter.defaultPrevented, false)
      for (const question of root.querySelectorAll('.faq-q, .bup-pc-faq-q')) {
        question.addEventListener('click', () => question.parentElement.classList.toggle('active'))
        assert.equal(question.getAttribute('aria-expanded'), 'false')
        question.focus()
        question.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await flush()
        assert.equal(question.getAttribute('aria-expanded'), 'true')
        question.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
        input.focus()
        question.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
        assert.equal(question.parentElement.classList.contains('active'), true, 'blur cancels a pending Space activation')
      }
      const replacement = document.createElement('a')
      replacement.className = 'bili-item-card'
      card.replaceWith(replacement)
      await flush()
      assert.equal(card.hasAttribute('tabindex'), false)
      assert.equal(replacement.getAttribute('role'), 'link', 'late native list replacements remain keyboard reachable')
      stop()
      assert.equal(replacement.hasAttribute('role'), false)
      assert.equal(nav.hasAttribute('aria-current'), false)
      assert.equal(root.querySelector('.faq-q').hasAttribute('aria-expanded'), false)
      assert.equal(root.querySelector('.faq-item').classList.contains('active'), true, 'cleanup preserves native expansion')
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: investor keyboard ownership stays inside the tab workspace and restores native nodes when disabled', async () => {
    let deliveries = 0
    const NativeObserver = MutationObserver
    const keyboard = await loadSourceModule('../src/contentScripts/features/nativePageKeyboard.ts', {}, {
      MutationObserver: class extends NativeObserver {
        constructor(callback) {
          super((...args) => {
            deliveries++
            callback(...args)
          })
        }
      },
    })
    const originalClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<div class="hero-counter"></div><main class="tabcontent-container"><div class="management-container"><div class="person">Biography</div></div><div class="board-of-directors-container"><div class="item"><div class="head-info">Director</div><div class="desc">Biography</div></div></div><div class="faqs-container"><div class="item"><div class="head-info">Question</div><div class="desc">Answer</div></div></div><div class="news-item"><div class="title"><a>Read release</a><a href="#native">Native link</a></div></div><input aria-label="Native search"></main>'
    root.querySelector('.management-container').insertAdjacentHTML('beforeend', '<div class="management-modal" id="focus-dialog"><button>Close</button></div><div class="management-modal" id="native-dialog" tabindex="0"></div><div class="management-modal" id="changed-dialog"></div>')
    const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: false, themeColor: '#f43f5e', customizeFont: 'default' })
    preferences.displayReady = Vue.ref(true)
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      'vue': Vue,
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
      '~/utils/themeColor': { ...(await import('../src/utils/themeColor')), readThemeContrastSurfaces: () => [] },
      './nativePageKeyboard': keyboard,
    }, { location: { hostname: 'ir.bilibili.com', pathname: '/en/investor-resources/' } })
    const dispose = module.setupNativeSiteAppearance()
    try {
      const release = root.querySelector('.news-item a:not([href])')
      const trigger = root.querySelector('.person')
      const dialog = root.querySelector('#focus-dialog')
      assert.equal(dialog.getAttribute('tabindex'), '-1')
      assert.equal(root.querySelector('#native-dialog').getAttribute('tabindex'), '0')
      trigger.addEventListener('click', () => dialog.focus())
      dialog.querySelector('button').addEventListener('click', () => trigger.focus())
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(document.activeElement, dialog, 'the native modal focus call can enter its existing root')
      dialog.querySelector('button').click()
      assert.equal(document.activeElement, trigger, 'the native close handler retains return-focus ownership')
      root.querySelector('#changed-dialog').tabIndex = 0
      let opened = 0
      release.addEventListener('click', () => opened++)
      assert.equal(release.getAttribute('role'), 'link')
      assert.equal(root.querySelector('a[href]').hasAttribute('role'), false)
      release.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(opened, 1)
      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      release.dispatchEvent(space)
      assert.equal(space.defaultPrevented, false)
      const before = deliveries
      const counter = root.querySelector('.hero-counter')
      for (let i = 0; i < 100; i++) {
        counter.className = `hero-counter frame-${i}`
        counter.textContent = String(i)
      }
      await flush()
      assert.equal(deliveries, before, 'hero classes and counter updates outside the tab workspace do not wake its observer')
      for (const heading of root.querySelectorAll('.head-info')) {
        heading.addEventListener('click', () => heading.parentElement.classList.toggle('active'))
        assert.equal(heading.getAttribute('aria-expanded'), 'false')
        heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await flush()
        assert.equal(heading.getAttribute('aria-expanded'), 'true')
      }
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.equal(release.hasAttribute('role'), false)
      assert.equal(root.querySelector('.person').hasAttribute('tabindex'), false)
      assert.equal(dialog.hasAttribute('tabindex'), false)
      assert.equal(root.querySelector('#native-dialog').getAttribute('tabindex'), '0')
      assert.equal(root.querySelector('#changed-dialog').getAttribute('tabindex'), '0', 'native changes made during adaptation are preserved')
      assert.equal(root.querySelector('.head-info').hasAttribute('aria-expanded'), false)
      assert.equal(root.querySelector('.board-of-directors-container .item').classList.contains('active'), true)
      const afterStop = deliveries
      root.querySelector('.board-of-directors-container .item').classList.remove('active')
      await flush()
      assert.equal(deliveries, afterStop)
    }
    finally {
      dispose()
      root.remove()
      document.documentElement.className = originalClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: creator groups release hidden focus targets and never take over enclosing native controls', async () => {
    let deliveries = 0
    const NativeObserver = MutationObserver
    const { setupNativePageKeyboard } = await loadSourceModule('../src/contentScripts/features/nativePageKeyboard.ts', {}, {
      MutationObserver: class extends NativeObserver {
        constructor(callback) {
          super((...args) => {
            deliveries++
            callback(...args)
          })
        }
      },
    })
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<nav class="cc-nav-wrp"><div class="bcc-nav-slider-sub-menu__wrap"><span class="router_wrap">Content</span><div class="bcc-nav-slider-sub-menu__group" style="display:none;height:0px"><span class="router-item">Comments</span></div></div><button><span class="router-item">Native button</span></button><a href="#native"><span class="router-item">Native link</span></a></nav>'
    const header = root.querySelector('.router_wrap')
    const group = root.querySelector('.bcc-nav-slider-sub-menu__group')
    const item = group.querySelector('.router-item')
    let navigations = 0
    header.addEventListener('click', () => {
      group.style.display = 'block'
      group.style.height = '76px'
    })
    item.addEventListener('click', () => {
      navigations++
      item.classList.add('active')
    })
    const stop = setupNativePageKeyboard(root, 'creator')
    try {
      const chart = root.appendChild(document.createElement('div'))
      await flush()
      const beforeStyles = deliveries
      for (let i = 0; i < 100; i++)
        chart.style.transform = `translateX(${i}px)`
      await flush()
      assert.equal(deliveries, beforeStyles, '100 native chart/preview style changes outside the navigation deliver no observer callbacks')
      assert.equal(header.getAttribute('aria-expanded'), 'false')
      assert.equal(item.tabIndex, -1)
      for (const nativeChild of root.querySelectorAll('button span, a span'))
        assert.equal(nativeChild.hasAttribute('tabindex'), false)
      header.focus()
      header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(header.getAttribute('aria-expanded'), 'true')
      assert.equal(item.tabIndex, 0)
      item.focus()
      item.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      item.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(navigations, 1)
      assert.equal(item.getAttribute('aria-current'), 'page')
      group.style.height = '0px'
      await flush()
      assert.equal(item.tabIndex, -1, 'the native collapse transition removes invisible descendants from the tab order')
      assert.equal(header.getAttribute('aria-expanded'), 'false')
      const oldNav = root.querySelector('.cc-nav-wrp')
      const newNav = document.createElement('nav')
      newNav.className = 'cc-nav-wrp'
      newNav.innerHTML = '<span class="router-item">Replacement route</span>'
      group.style.height = '76px'
      oldNav.replaceWith(newNav)
      await flush()
      assert.equal(newNav.firstElementChild.tabIndex, 0)
      assert.equal(item.hasAttribute('tabindex'), false, 'replaced native nodes release their borrowed attributes')
      const beforeDetachedStyle = deliveries
      group.style.height = '120px'
      await flush()
      assert.equal(deliveries, beforeDetachedStyle, 'the old sidebar is no longer observed after replacement')
      stop()
      assert.equal(header.hasAttribute('aria-expanded'), false)
      assert.equal(item.hasAttribute('tabindex'), false)
      assert.equal(item.classList.contains('active'), true)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: creator read filters and convention navigation keep scoped native selection ownership', async () => {
    let deliveries = 0
    const NativeObserver = MutationObserver
    const { setupNativePageKeyboard } = await loadSourceModule('../src/contentScripts/features/nativePageKeyboard.ts', {}, {
      MutationObserver: class extends NativeObserver {
        constructor(callback) {
          super((...args) => {
            deliveries++
            callback(...args)
          })
        }
      },
    })
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<nav class="cc-nav-wrp"><div class="router-item">Native navigation</div></nav><div class="comment_wrap"><div class="operate_right"><div class="operate-txt active">Recent</div><div class="operate-txt">Most replies</div></div><button class="del">Delete</button><input></div><div class="chart"></div>'
    const filters = [...root.querySelectorAll('.operate-txt')]
    const oldScope = root.querySelector('.operate_right')
    const chart = root.querySelector('.chart')
    const input = root.querySelector('input')
    let clicks = 0
    filters[1].addEventListener('click', () => {
      clicks++
      filters[0].classList.remove('active')
      filters[1].classList.add('active')
    })
    const stop = setupNativePageKeyboard(root, 'creator')
    try {
      assert.equal(filters[0].getAttribute('aria-pressed'), 'true')
      filters[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }))
      assert.equal(clicks, 0)
      filters[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 1)
      assert.equal(filters[0].getAttribute('aria-pressed'), 'false')
      assert.equal(filters[1].getAttribute('aria-pressed'), 'true')
      const before = deliveries
      for (let i = 0; i < 100; i++) {
        chart.className = `chart frame-${i}`
        chart.style.transform = `translateX(${i}px)`
      }
      await flush()
      assert.equal(deliveries, before, 'native charts outside the read controls remain unobserved')
      const app = root.appendChild(document.createElement('micro-app'))
      app.setAttribute('name', 'convention')
      app.innerHTML = '<div class="web-home-page"><div class="sub-title">Native chapter</div><div class="bylaws">Appendix</div></div><div class="catalogue-bar"><div class="children-catalogue anchor">Current chapter</div><div class="children-catalogue">Another chapter</div></div><div class="feedback-bar-wrap"><div class="button">Feedback</div></div>'
      const chapter = app.querySelector('.sub-title')
      const catalogue = [...app.querySelectorAll('.children-catalogue')]
      chapter.addEventListener('click', () => clicks++)
      catalogue[1].addEventListener('click', () => {
        clicks++
        catalogue[0].classList.remove('anchor')
        catalogue[1].classList.add('anchor')
      })
      await flush()
      assert.equal(chapter.tabIndex, 0)
      assert.equal(app.querySelector('.bylaws').tabIndex, 0)
      assert.equal(app.querySelector('.feedback-bar-wrap .button').hasAttribute('role'), false)
      catalogue[1].focus()
      catalogue[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      catalogue[1].dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 2)
      assert.equal(catalogue[0].hasAttribute('aria-current'), false)
      assert.equal(catalogue[1].getAttribute('aria-current'), 'page')
      catalogue[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 2)
      assert.equal(root.querySelector('.del').hasAttribute('role'), false)
      oldScope.remove()
      await flush()
      const detached = deliveries
      filters[1].classList.remove('active')
      await flush()
      assert.equal(deliveries, detached, 'removed read scopes no longer deliver class updates')
      assert.equal(filters[1].hasAttribute('aria-pressed'), false)
      stop()
      for (const item of [chapter, ...catalogue]) {
        assert.equal(item.hasAttribute('role'), false)
        assert.equal(item.hasAttribute('tabindex'), false)
      }
      chapter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(clicks, 2)
      chapter.click()
      assert.equal(clicks, 3, 'native click handlers survive disposal')
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: creator programme navigation preserves native actions and rules-dialog focus', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<nav class="cc-nav-wrp"></nav><div id="video-up-app"><div class="upload-nav"><a class="upload-nav-item">Native introduction</a></div><button id="upload">Upload</button></div><micro-app name="allowance-excitation"><div class="signment-tab"><div class="tab-item item-active">Video</div><div class="tab-item">Material</div><div class="signment-btn">Join</div></div></micro-app><div id="growing-up"><div class="history-tab"><li class="tabs__header-item is-active">Recent</li><li class="tabs__header-item">Other</li></div><div class="rules-and-history"><div class="icon-right"><div class="icon-with-text">Rules</div><div class="icon-with-text">History</div></div></div><div class="task-item-button">Follow</div></div><input>'
    const link = root.querySelector('.upload-nav-item')
    const tabs = [...root.querySelectorAll('.signment-tab .tab-item')]
    const history = [...root.querySelectorAll('.history-tab .tabs__header-item')]
    const rules = root.querySelector('.icon-with-text')
    const input = root.querySelector('input')
    let clicks = 0
    let dialog
    link.addEventListener('click', () => clicks++)
    tabs[1].addEventListener('click', () => {
      tabs[0].classList.remove('item-active')
      tabs[1].classList.add('item-active')
    })
    history[1].addEventListener('click', () => {
      history[0].classList.remove('is-active')
      history[1].classList.add('is-active')
    })
    rules.addEventListener('click', () => {
      queueMicrotask(() => {
        dialog = root.appendChild(document.createElement('div'))
        dialog.className = 'confirm-dialog rulesStyle'
        dialog.innerHTML = '<div class="content">Native read-only explanation</div><div class="confirm-btn">Close notice</div><div class="close-btn"></div>'
        for (const close of dialog.querySelectorAll('.confirm-btn,.close-btn'))
          close.addEventListener('click', () => dialog.remove())
      })
    })
    const stop = setupNativePageKeyboard(root, 'creator')
    try {
      assert.equal(link.getAttribute('role'), 'link')
      link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      link.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 0, 'Space keeps link semantics')
      link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      assert.equal(tabs[0].getAttribute('aria-pressed'), 'true')
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      history[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(tabs[0].getAttribute('aria-pressed'), 'false')
      assert.equal(tabs[1].getAttribute('aria-pressed'), 'true')
      assert.equal(history[1].getAttribute('aria-pressed'), 'true')
      for (const action of root.querySelectorAll('#upload,.signment-btn,.task-item-button'))
        assert.equal(action.hasAttribute('role'), false, 'business actions are not keyboard-adapter targets')
      rules.focus()
      rules.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(document.activeElement, dialog.querySelector('.close-btn'))
      assert.equal(document.activeElement.getAttribute('aria-label'), '关闭任务规则')
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(dialog.isConnected, false)
      assert.equal(document.activeElement, rules)
      rules.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      input.focus()
      await flush()
      assert.equal(document.activeElement, input, 'late notice mounting does not steal a new input focus')
      const confirm = dialog.querySelector('.confirm-btn')
      confirm.focus()
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      stop()
      await flush()
      assert.notEqual(document.activeElement, rules, 'a disposed owner cannot return focus')
      assert.equal(link.hasAttribute('role'), false)
      assert.equal(tabs[1].hasAttribute('aria-pressed'), false)
      assert.equal(tabs[1].classList.contains('item-active'), true)
      link.click()
      assert.equal(clicks, 2)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: FAQ keyboard follows native answer heights without observing carousel styles', async () => {
    let deliveries = 0
    const NativeObserver = MutationObserver
    const { setupNativePageKeyboard } = await loadSourceModule('../src/contentScripts/features/nativePageKeyboard.ts', {}, {
      MutationObserver: class extends NativeObserver {
        constructor(callback) {
          super((...args) => {
            deliveries++
            callback(...args)
          })
        }
      },
    })
    const root = document.body.appendChild(document.createElement('section'))
    const carousel = root.appendChild(document.createElement('div'))
    const stop = setupNativePageKeyboard(root, 'customer-service')
    try {
      const panel = document.createElement('div')
      panel.className = 'question-panel'
      panel.innerHTML = '<div class="question-container"><div class="title"><p>Question</p></div><div class="answer" style="height:0px"><a href="#native">Native answer link</a></div></div>'
      root.appendChild(panel)
      await flush()
      const title = panel.querySelector('.title')
      const answer = panel.querySelector('.answer')
      let clicks = 0
      title.addEventListener('click', () => {
        clicks++
        answer.style.height = answer.style.height === '0px' ? '106px' : '0px'
      })
      assert.equal(title.tabIndex, 0)
      assert.equal(title.getAttribute('aria-expanded'), 'false')
      assert.equal(panel.querySelector('a').hasAttribute('role'), false)
      title.focus()
      title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      assert.equal(clicks, 0)
      title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 1)
      assert.equal(title.getAttribute('aria-expanded'), 'true')
      answer.style.height = '0px'
      await flush()
      assert.equal(title.getAttribute('aria-expanded'), 'false', 'native mouse/programmatic changes share the same state')
      const beforeStyles = deliveries
      for (let i = 0; i < 100; i++)
        carousel.style.transform = `translateX(${i}px)`
      await flush()
      assert.equal(deliveries, beforeStyles, 'carousel styles outside the FAQ deliver no callbacks')
      const replacement = document.createElement('div')
      replacement.className = 'question-panel'
      replacement.innerHTML = '<div class="question-container"><div class="title">Replacement question</div><div class="answer" style="height:0px">Answer</div></div>'
      panel.replaceWith(replacement)
      await flush()
      assert.equal(title.hasAttribute('tabindex'), false)
      assert.equal(replacement.querySelector('.title').getAttribute('role'), 'button')
      const beforeDetachedStyle = deliveries
      answer.style.height = '106px'
      await flush()
      assert.equal(deliveries, beforeDetachedStyle, 'detached FAQ panels release style observation')
      stop()
      assert.equal(replacement.querySelector('.title').hasAttribute('aria-expanded'), false)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: the academy entry handles a late native mount and releases its projection with the existing setting', async () => {
    const rootClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    const preferences = Vue.ref({ adaptToOtherPageStyles: false, blockAds: true, themeColor: '#f43f5e', customizeFont: 'default' })
    preferences.displayReady = Vue.ref(true)
    let themeStarts = 0
    let themeStops = 0
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      vue: Vue,
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
      '~/composables/useDark': { useDark: () => {
        themeStarts++
        return { isDark: Vue.ref(false) }
      }, stopDarkState() { themeStops++ } },
      '~/utils/themeColor': { getThemeColorTokens: () => ({}), readThemeContrastSurfaces: () => [] },
      './nativePageKeyboard': await import('../src/contentScripts/features/nativePageKeyboard'),
    }, { location: { hostname: 'member.bilibili.com', pathname: '/academy/seriesList' } })
    const dispose = module.setupNativeSiteAppearance()
    let app
    try {
      assert.equal(themeStarts, 0)
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true, 'advertising remains independent of appearance')
      preferences.value.adaptToOtherPageStyles = true
      await flush()
      app = document.body.appendChild(document.createElement('main'))
      app.id = 'app'
      const mountedApp = document.createElement('main')
      mountedApp.id = 'app'
      app.replaceWith(mountedApp)
      app = mountedApp
      app.innerHTML = '<ul><li class="bca-csbbul-li selected">Home</li><li class="bca-csbbul-li">Series</li></ul><button class="bca-cf-li">Native filter</button>'
      await flush()
      const item = app.querySelector('li')
      assert.equal(themeStarts, 1)
      assert.equal(item.getAttribute('role'), 'button')
      assert.equal(item.getAttribute('aria-current'), 'page')
      assert.equal(app.querySelector('button').hasAttribute('tabindex'), false)
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.equal(themeStops, 1)
      assert.equal(item.hasAttribute('role'), false)
      assert.equal(document.documentElement.classList.contains('bewly-design'), false)
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true)
    }
    finally {
      dispose()
      app?.remove()
      document.documentElement.className = rootClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: charity filters and detail tabs retain native selection across late routes and release keyboard ownership with appearance', async () => {
    const rootClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    let root = document.body.appendChild(document.createElement('div'))
    root.id = 'app'
    root.innerHTML = '<a href="#donation">Native donation link</a>'
    const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: false, themeColor: '#f43f5e', customizeFont: 'default' })
    preferences.displayReady = Vue.ref(true)
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      vue: Vue,
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
      '~/utils/themeColor': { getThemeColorTokens: () => ({}), readThemeContrastSurfaces: () => [] },
      './nativePageKeyboard': await import('../src/contentScripts/features/nativePageKeyboard'),
    }, { location: { hostname: 'love.bilibili.com', pathname: '/' } })
    const dispose = module.setupNativeSiteAppearance()
    const mountedApp = document.createElement('div')
    mountedApp.id = 'app'
    mountedApp.innerHTML = root.innerHTML
    root.replaceWith(mountedApp)
    root = mountedApp
    const list = document.createElement('section')
    list.className = 'charity-list'
    list.innerHTML = '<div class="filter-tab"><ul><li class="selected">All types</li><li>Education</li></ul><ul><li class="selected">All states</li><li>Ended</li><li><button>Native control</button></li></ul></div>'
    const [allTypes, education, allStates, ended, managed] = list.querySelectorAll('li')
    let clicks = 0
    for (const [target, previous] of [[education, allTypes], [ended, allStates]]) {
      target.addEventListener('click', () => {
        clicks++
        previous.classList.remove('selected')
        target.classList.add('selected')
      })
    }
    try {
      root.appendChild(list)
      await flush()
      assert.equal(education.getAttribute('role'), 'button')
      assert.equal(education.tabIndex, 0)
      assert.equal(allTypes.getAttribute('aria-pressed'), 'true')
      assert.equal(root.querySelector('a').hasAttribute('role'), false)
      assert.equal(managed.hasAttribute('role'), false, 'a native child button keeps sole ownership')
      education.focus()
      education.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      assert.equal(clicks, 0)
      education.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 1)
      assert.equal(education.getAttribute('aria-pressed'), 'true')
      assert.equal(allTypes.getAttribute('aria-pressed'), 'false')
      assert.equal(allStates.getAttribute('aria-pressed'), 'true', 'the other filter group stays selected')
      ended.focus()
      ended.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      ended.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 2)
      assert.equal(ended.getAttribute('aria-pressed'), 'true')
      assert.equal(education.getAttribute('aria-pressed'), 'true')
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.equal(education.hasAttribute('tabindex'), false)
      assert.equal(ended.hasAttribute('aria-pressed'), false)
      education.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(clicks, 2)
      preferences.value.adaptToOtherPageStyles = true
      await flush()
      assert.equal(ended.getAttribute('aria-pressed'), 'true')
      list.remove()
      await flush()
      assert.equal(ended.hasAttribute('tabindex'), false, 'detached route nodes are restored and released')
      assert.equal(ended.classList.contains('selected'), true, 'native selection is never reverted by cleanup')
      const detail = root.appendChild(document.createElement('section'))
      detail.className = 'charity-detail'
      detail.innerHTML = '<ul class="detail-header"><li class="clicked">Details</li><li>Progress</li><li class="feedback">Feedback</li></ul>'
      const [details, progress, feedback] = detail.querySelectorAll('li')
      progress.addEventListener('click', () => {
        clicks++
        details.classList.remove('clicked')
        progress.classList.add('clicked')
      })
      await flush()
      progress.focus()
      progress.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 3)
      assert.equal(progress.getAttribute('aria-pressed'), 'true')
      assert.equal(details.getAttribute('aria-pressed'), 'false')
      assert.equal(feedback.hasAttribute('role'), false, 'feedback submission is outside this read-navigation adapter')
    }
    finally {
      dispose()
      root.remove()
      document.documentElement.className = rootClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: manga role-only filters gain local keyboard activation and retain native semantics on cleanup', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<section class="style-section"><div class="style-tag selected" role="button">All</div><div class="style-tag" role="button">Japan</div><button class="style-tag" role="button">Native</button><div class="style-tag" role="button" tabindex="-1">Managed</div></section>'
    const [all, japan, native, managed] = root.firstElementChild.children
    let clicks = 0
    japan.addEventListener('click', () => {
      clicks++
      all.classList.remove('selected')
      japan.classList.add('selected')
    })
    const stop = setupNativePageKeyboard(root, 'manga-classify')
    try {
      assert.equal(japan.tabIndex, 0)
      japan.focus()
      japan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 1)
      assert.equal(japan.getAttribute('aria-pressed'), 'true')
      assert.equal(all.getAttribute('aria-pressed'), 'false')
      assert.equal(document.activeElement, japan)
      assert.equal(native.hasAttribute('tabindex'), false)
      assert.equal(managed.tabIndex, -1)
    }
    finally {
      stop()
      assert.equal(japan.getAttribute('role'), 'button')
      assert.equal(japan.hasAttribute('tabindex'), false)
      assert.equal(japan.hasAttribute('aria-pressed'), false)
      root.remove()
    }
  })

  check('native appearance: wallet keyboard follows late and replaced native roots without owning payment actions', async () => {
    const keyboard = await import('../src/contentScripts/features/nativePageKeyboard')
    const originalClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    for (const initialMount of [false, true]) {
      const shell = document.body.appendChild(document.createElement('section'))
      const initial = document.createElement('div')
      initial.id = 'app'
      initial.innerHTML = '<div class="pay-tab-wp"><div class="pay-tab-item pay-tab-item-selected">Records</div></div>'
      if (initialMount)
        shell.append(initial)
      const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: true, themeColor: '#f43f5e', customizeFont: 'default' })
      preferences.displayReady = Vue.ref(true)
      const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
        vue: Vue,
        '~/constants/nativeSites': await import('../src/constants/nativeSites'),
        '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
        '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
        '~/utils/themeColor': { getThemeColorTokens: () => ({}), readThemeContrastSurfaces: () => [] },
        './nativePageKeyboard': keyboard,
      }, { location: { hostname: 'pay.bilibili.com', pathname: '/pay-v2-web/bcoin_record' } })
      const dispose = module.setupNativeSiteAppearance()
      try {
        if (!initialMount)
          shell.append(initial)
        await flush()
        assert.equal(initial.querySelector('.pay-tab-item').tabIndex, 0)
        const replacement = document.createElement('div')
        replacement.id = 'app'
        replacement.innerHTML = '<div class="pay-tab-wp"><div class="pay-tab-item">History</div></div><button class="pay-bcoin-btn">Native payment action</button>'
        let reads = 0
        const history = replacement.querySelector('.pay-tab-item')
        history.addEventListener('click', () => {
          reads++
          history.classList.add('pay-tab-item-selected')
        })
        initial.replaceWith(replacement)
        await flush()
        assert.equal(initial.querySelector('.pay-tab-item').hasAttribute('tabindex'), false)
        assert.equal(history.tabIndex, 0)
        history.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await flush()
        assert.equal(reads, 1)
        assert.equal(history.getAttribute('aria-pressed'), 'true')
        assert.equal(replacement.querySelector('button').hasAttribute('role'), false)
        preferences.value.adaptToOtherPageStyles = false
        await flush()
        assert.equal(history.hasAttribute('tabindex'), false)
        assert.equal(history.classList.contains('pay-tab-item-selected'), true)
        assert.equal(document.documentElement.classList.contains('block-useless-contents'), true)
        history.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        assert.equal(reads, 1)
      }
      finally {
        dispose()
        shell.remove()
        document.documentElement.className = originalClass
        if (originalStyle === null)
          document.documentElement.removeAttribute('style')
        else document.documentElement.setAttribute('style', originalStyle)
      }
    }
  })

  check('native appearance: live download keyboard keeps one native activation and releases late controls with appearance', async () => {
    const originalClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    const shell = document.body.appendChild(document.createElement('section'))
    const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: true, themeColor: '#f43f5e', customizeFont: 'default' })
    preferences.displayReady = Vue.ref(true)
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      vue: Vue,
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
      '~/utils/themeColor': { getThemeColorTokens: () => ({}), readThemeContrastSurfaces: () => [] },
      './nativePageKeyboard': await import('../src/contentScripts/features/nativePageKeyboard'),
    }, { location: { hostname: 'link.bilibili.com', pathname: '/p/eden/download' } })
    const dispose = module.setupNativeSiteAppearance()
    try {
      shell.innerHTML = '<div id="app-ctnr"><header class="linkdown-header"></header><div class="safe-content"><div class="btn-download">Download</div></div><div class="platform-item"><div class="platform-bottom">Open native destination</div><button class="platform-bottom">Native button</button></div><div class="platform-bottom">Unrelated control</div></div>'
      await flush()
      const download = shell.querySelector('.btn-download')
      const platform = shell.querySelector('.platform-item div')
      let activations = 0
      for (const item of [download, platform]) {
        item.addEventListener('click', () => activations++)
        assert.equal(item.getAttribute('role'), 'button')
        assert.equal(item.tabIndex, 0)
        assert.equal(item.hasAttribute('aria-pressed'), false)
      }
      assert.equal(shell.querySelector('button').hasAttribute('role'), false)
      assert.equal(shell.querySelector('#app-ctnr > .platform-bottom').hasAttribute('role'), false)
      download.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      download.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }))
      assert.equal(activations, 0)
      download.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      platform.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(activations, 1, 'Space activates only on release')
      platform.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(activations, 2)
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true)
      for (const item of [download, platform]) {
        assert.equal(item.hasAttribute('role'), false)
        assert.equal(item.hasAttribute('tabindex'), false)
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
      assert.equal(activations, 2)
      preferences.value.adaptToOtherPageStyles = true
      await flush()
      download.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(activations, 3, 're-enabling does not duplicate native activation')
    }
    finally {
      dispose()
      shell.remove()
      document.documentElement.className = originalClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: live help releases collapsed nested navigation and keeps native chapter actions', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.className = 'app-ctnr'
    root.innerHTML = '<nav class="navbar-left"><div class="nav-item1"><div class="nav-item1-title expand arrow">Broadcaster</div><div class="nav-warp1"><div class="nav-item2"><div class="nav-item2-title arrow">Guide</div><div class="nav-warp2" style="display:none"><div class="nav-item3 active">Tools</div><div class="nav-item3">Equipment</div></div></div></div></div></nav><main class="main-content"><div class="menu">Chapter</div><a class="menu" href="#native">Native link</a></main>'
    const outer = root.querySelector('.nav-item1-title')
    const inner = root.querySelector('.nav-item2-title')
    const [tools, equipment] = root.querySelectorAll('.nav-item3')
    const chapter = root.querySelector('div.menu')
    let navigations = 0
    let scrolls = 0
    for (const header of [outer, inner]) {
      header.addEventListener('click', () => {
        const open = header.classList.toggle('expand')
        header.nextElementSibling.style.display = open ? '' : 'none'
      })
    }
    equipment.addEventListener('click', () => {
      navigations++
      tools.classList.remove('active')
      equipment.classList.add('active')
    })
    chapter.addEventListener('click', () => scrolls++)
    const stop = setupNativePageKeyboard(root, 'live-center')
    try {
      assert.equal(outer.getAttribute('aria-expanded'), 'true')
      assert.equal(inner.getAttribute('aria-expanded'), 'false')
      assert.equal(inner.tabIndex, 0)
      assert.equal(equipment.tabIndex, -1)
      inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(inner.getAttribute('aria-expanded'), 'true')
      assert.equal(equipment.tabIndex, 0)
      equipment.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(navigations, 1)
      assert.equal(tools.getAttribute('aria-current'), null)
      assert.equal(equipment.getAttribute('aria-current'), 'page')
      outer.click()
      await flush()
      assert.equal(outer.getAttribute('aria-expanded'), 'false')
      assert.equal(inner.tabIndex, -1)
      assert.equal(equipment.tabIndex, -1)
      chapter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(scrolls, 1)
      assert.equal(root.querySelector('a.menu').hasAttribute('role'), false)
      stop()
      assert.equal(equipment.hasAttribute('tabindex'), false)
      assert.equal(outer.hasAttribute('aria-expanded'), false)
      assert.equal(inner.classList.contains('expand'), true)
      chapter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(scrolls, 1)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: game help follows native arrow state and restores bitmap navigation labels', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<div class="qa-q"><span class="qa-heading">Question</span><span class="qa-icon-arrow icon-arrow-down"></span></div><nav class="jz-left"><div class="nav-btn btn-info cur"></div><div class="nav-btn btn-flow"></div><div class="nav-btn btn-progress" aria-label="Original label"></div><div class="nav-btn btn-question"></div></nav>'
    const question = root.querySelector('.qa-q')
    const arrow = root.querySelector('.qa-icon-arrow')
    let clicks = 0
    question.addEventListener('click', () => {
      clicks++
      const open = arrow.classList.toggle('icon-arrow-up')
      arrow.classList.toggle('icon-arrow-down', !open)
    })
    const stop = setupNativePageKeyboard(root, 'game-help')
    try {
      assert.equal(question.getAttribute('aria-expanded'), 'false')
      question.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(question.getAttribute('aria-expanded'), 'true')
      question.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      question.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(clicks, 2)
      assert.equal(question.getAttribute('aria-expanded'), 'false')
      assert.deepEqual([...root.querySelectorAll('.nav-btn')].map(node => node.getAttribute('aria-label')), ['工程介绍', '申请流程', 'Original label', '常见问题'])
      stop()
      assert.equal(question.hasAttribute('aria-expanded'), false)
      assert.deepEqual([...root.querySelectorAll('.nav-btn')].map(node => node.getAttribute('aria-label')), [null, null, 'Original label', null])
      assert.equal(root.querySelector('.btn-info').classList.contains('cur'), true)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: game navigation follows its appearance scope and native route family', async () => {
    const keyboard = await import('../src/contentScripts/features/nativePageKeyboard')
    const originalClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    for (const [path, owned, ranksOwned = false] of [['/platform/mine', true], ['/platform/mine/home', true], ['/platform/mine/games', true], ['/platform/minefield', false], ['/platform/ranks', false, true], ['/platform/ranks/hot', false, true], ['/platform/rankship', false], ['/platform', false], ['/kf/', false], ['/jiazhang/', false]]) {
      const root = document.body.appendChild(document.createElement('section'))
      root.id = 'app'
      root.innerHTML = '<ul class="user-nav_fixture"><li>Home</li><li>Games</li></ul><aside class="aside"><ul class="anchor_wrapper"><li class="anchor_item active">Popular</li></ul></aside><button class="gameSns-content-account-btn_fixture">Native follow</button>'
      const item = root.querySelector('li')
      const rank = root.querySelector('.anchor_item')
      const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: true, themeColor: '#f43f5e', customizeFont: 'default' })
      preferences.displayReady = Vue.ref(true)
      const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
        vue: Vue,
        '~/constants/nativeSites': await import('../src/constants/nativeSites'),
        '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
        '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
        '~/utils/themeColor': { getThemeColorTokens: () => ({}), readThemeContrastSurfaces: () => [] },
        './nativePageKeyboard': keyboard,
      }, { location: { hostname: 'game.bilibili.com', pathname: path } })
      const dispose = module.setupNativeSiteAppearance()
      try {
        assert.equal(item.hasAttribute('tabindex'), owned, path)
        assert.equal(rank.hasAttribute('tabindex'), ranksOwned, path)
        assert.equal(root.querySelector('button').hasAttribute('role'), false)
        preferences.value.adaptToOtherPageStyles = false
        await flush()
        assert.equal(item.hasAttribute('tabindex'), false)
        assert.equal(rank.hasAttribute('tabindex'), false)
        assert.equal(document.documentElement.classList.contains('block-useless-contents'), true)
        preferences.value.adaptToOtherPageStyles = true
        await flush()
        assert.equal(item.hasAttribute('tabindex'), owned, path)
        assert.equal(rank.hasAttribute('tabindex'), ranksOwned, path)
      }
      finally {
        dispose()
        root.remove()
        document.documentElement.className = originalClass
        if (originalStyle === null)
          document.documentElement.removeAttribute('style')
        else document.documentElement.setAttribute('style', originalStyle)
      }
    }
  })

  check('native appearance: manga read-filter dropdowns keep native selection and return focus when their options close', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<div class="date-selector"><div class="dropbox-component"><div class="current">2026</div><ul class="data-list" style="display:none"><li>2025</li></ul></div></div><button class="recharge-btn">Native payment action</button><input>'
    const dropdown = root.querySelector('.dropbox-component')
    const trigger = root.querySelector('.current')
    const list = root.querySelector('.data-list')
    const option = list.firstElementChild
    let selected = 0
    let paymentClicks = 0
    const close = () => {
      dropdown.classList.remove('is-open')
      list.style.display = 'none'
    }
    trigger.addEventListener('click', () => {
      const open = dropdown.classList.toggle('is-open')
      list.style.display = open ? '' : 'none'
    })
    option.addEventListener('click', () => {
      selected++
      queueMicrotask(close)
    })
    root.querySelector('button').addEventListener('click', () => paymentClicks++)
    const stop = setupNativePageKeyboard(root, 'manga-account')
    try {
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      option.focus()
      option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selected, 1)
      assert.equal(document.activeElement, trigger)
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      trigger.click()
      await flush()
      option.focus()
      option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(selected, 1)
      assert.equal(document.activeElement, trigger)
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      trigger.click()
      await flush()
      option.focus()
      option.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      option.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      root.querySelector('input').focus()
      await flush()
      assert.equal(selected, 2)
      assert.equal(document.activeElement, root.querySelector('input'), 'do not take focus back after the user moves it')
      assert.equal(root.querySelector('button').hasAttribute('role'), false)
      assert.equal(paymentClicks, 0)
      stop()
      for (const element of [trigger, option]) {
        assert.equal(element.hasAttribute('role'), false)
        assert.equal(element.hasAttribute('tabindex'), false)
        assert.equal(element.hasAttribute('aria-expanded'), false)
      }
      option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(selected, 2)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: manga classify and account keyboards use the existing appearance lifetime and never start on the reader', async () => {
    const keyboard = await import('../src/contentScripts/features/nativePageKeyboard')
    const rootClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    for (const path of ['/classify', '/account-center', '/account-center/account-info', '/mc28201/463667']) {
      const root = document.body.appendChild(document.createElement('div'))
      root.id = 'main-stage'
      root.innerHTML = '<section class="style-section"><div class="style-tag" role="button">All</div></section><section class="account-info-container"><div class="pivot-header-item selected">Credits</div></section>'
      const tag = root.querySelector('.style-tag')
      const accountTab = root.querySelector('.pivot-header-item')
      const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: false, themeColor: '#f43f5e', customizeFont: 'default' })
      preferences.displayReady = Vue.ref(true)
      const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
        vue: Vue,
        '~/constants/nativeSites': await import('../src/constants/nativeSites'),
        '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
        '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }), stopDarkState() {} },
        '~/utils/themeColor': { getThemeColorTokens: () => ({}), readThemeContrastSurfaces: () => [] },
        './nativePageKeyboard': keyboard,
      }, { location: { hostname: 'manga.bilibili.com', pathname: path } })
      const dispose = module.setupNativeSiteAppearance()
      try {
        assert.equal(tag.hasAttribute('tabindex'), path === '/classify')
        assert.equal(accountTab.hasAttribute('tabindex'), path.startsWith('/account-center'))
        preferences.value.adaptToOtherPageStyles = false
        await flush()
        assert.equal(tag.hasAttribute('tabindex'), false)
        assert.equal(accountTab.hasAttribute('tabindex'), false)
        assert.equal(tag.getAttribute('role'), 'button')
        preferences.value.adaptToOtherPageStyles = true
        await flush()
        assert.equal(tag.hasAttribute('tabindex'), path === '/classify')
        assert.equal(accountTab.hasAttribute('tabindex'), path.startsWith('/account-center'))
      }
      finally {
        dispose()
        root.remove()
        document.documentElement.className = rootClass
        if (originalStyle === null)
          document.documentElement.removeAttribute('style')
        else document.documentElement.setAttribute('style', originalStyle)
      }
    }
  })

  check('native appearance: timeline boundary removal returns focus without stealing it after disposal or user focus', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    for (const mode of ['boundary', 'disposed', 'other-focus']) {
      const root = document.body.appendChild(document.createElement('div'))
      root.innerHTML = '<div class="timeline-header"><div class="arrow-left"></div><div class="arrow-right"></div></div><button>Other</button>'
      const previous = root.querySelector('.arrow-left')
      const next = root.querySelector('.arrow-right')
      const other = root.querySelector('button')
      const stop = setupNativePageKeyboard(root, 'anime-timeline')
      next.addEventListener('click', () => queueMicrotask(() => next.remove()))
      next.focus()
      next.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      if (mode === 'disposed')
        stop()
      if (mode === 'other-focus')
        other.focus()
      await flush()
      assert.equal(document.activeElement, mode === 'boundary' ? previous : mode === 'other-focus' ? other : document.body)
      stop()
      root.remove()
    }
  })

  check('native appearance: timeline arrows retain native navigation and release keyboard labels', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<div class="timeline-header"><div class="arrow-left"></div><div class="arrow-right" aria-label="Native next"></div></div>'
    const [previous, next] = root.querySelectorAll('.timeline-header > div')
    let offset = 0
    previous.addEventListener('click', () => offset--)
    next.addEventListener('click', () => offset++)
    const stop = setupNativePageKeyboard(root, 'anime-timeline')
    try {
      assert.equal(previous.getAttribute('aria-label'), '更早的日期')
      assert.equal(next.getAttribute('aria-label'), 'Native next')
      previous.focus()
      previous.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(offset, -1)
      assert.equal(document.activeElement, previous)
      next.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(offset, -1)
      next.dispatchEvent(new window.KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(offset, 0)
    }
    finally {
      stop()
      assert.equal(previous.hasAttribute('aria-label'), false)
      assert.equal(previous.hasAttribute('tabindex'), false)
      assert.equal(next.getAttribute('aria-label'), 'Native next')
      root.remove()
    }
  })

  check('native appearance: index hash navigation retains keyboard ownership and focus until page exit', async () => {
    const href = Vue.ref('https://www.bilibili.com/anime/index/#is_finish=-1')
    const preferences = Vue.ref({ adaptToOtherPageStyles: true, customizeFont: 'default', frostedGlassBlurIntensity: 10, themeColor: '#f43f5e' })
    preferences.initializationState = Vue.ref('loaded')
    const root = document.body.appendChild(document.createElement('div'))
    root.id = 'app'
    root.innerHTML = '<div class="bangumi-index-wrapper"><li class="filter-item">Complete</li></div>'
    const filter = root.querySelector('li')
    const noop = () => {}
    const module = await loadSourceModule('../src/contentScripts/views/necessarySettingsWatchers.ts', {
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => href },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }) },
      '~/constants/globalEvents': { IFRAME_TOP_BAR_CHANGE: 'fixture' },
      '~/contentScripts/features/blockUselessFeedCards': { setUselessFeedCardBlockerEnabled: noop, shouldEnableUselessFeedCardBlocker: () => false },
      '~/contentScripts/features/nativePageKeyboard': await import('../src/contentScripts/features/nativePageKeyboard'),
      '~/enums/appEnums': { AppPage: { Home: 'Home' } },
      '~/logic': { settings: preferences, localSettings: Vue.ref({}), originalSettings: { frostedGlassBlurIntensity: 10 }, FROSTED_GLASS_BLUR_MIN_PX: 0, FROSTED_GLASS_BLUR_MAX_PX: 100 },
      '~/logic/iframePageState': { useIframePageActive: () => Vue.ref(false) },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getEffectiveTopBarSource: () => 'bewly', getDockItemIsUseOriginalBiliPage: () => false }) },
      '~/utils/bilibiliTopBar': { detachOriginalBilibiliTopBar: noop, ensureOriginalBilibiliTopBarAppended: noop, resetBilibiliTopBarInlineStyles: noop, setOriginalBilibiliTopBarScrolled: noop },
      '~/utils/clipboardSelection': {},
      '~/utils/effectiveTopBarSource': { applyEffectiveTopBarSource: noop, showNativeBilibiliTopBar: () => false },
      '~/utils/iframeMessage': { postMessageToIframe: noop },
      '~/utils/interfaceLanguage': { ensureInterfaceLanguage: noop },
      '~/utils/main': { isHomePage: () => false, isInIframe: () => false, isVideoPlaybackPage: () => false, injectCSS: () => document.documentElement.appendChild(document.createElement('style')) },
      '~/utils/themeColor': { readThemeContrastSurfaces: () => ({}), getThemeColorTokens: () => ({}) },
    }, { ...Vue, location: { href: href.value, hostname: 'www.bilibili.com', pathname: '/anime/index/' } })
    const scope = Vue.effectScope()
    try {
      scope.run(() => module.setupNecessarySettingsWatchers())
      filter.focus()
      const tabindexChanges = []
      const observer = new MutationObserver(records => tabindexChanges.push(...records))
      observer.observe(filter, { attributes: true, attributeFilter: ['tabindex'] })
      href.value = 'https://www.bilibili.com/anime/index/#is_finish=1'
      await Vue.nextTick()
      assert.equal(tabindexChanges.length + observer.takeRecords().length, 0, 'hash changes must not remove and restore tabindex')
      assert.equal(document.activeElement, filter)
      observer.disconnect()
      preferences.value.adaptToOtherPageStyles = false
      await Vue.nextTick()
      assert.equal(filter.hasAttribute('tabindex'), false)
      preferences.value.adaptToOtherPageStyles = true
      await Vue.nextTick()
      assert.equal(filter.tabIndex, 0)
      href.value = 'https://www.bilibili.com/video/BVfixture'
      await Vue.nextTick()
      assert.equal(filter.hasAttribute('role'), false)
    }
    finally {
      scope.stop()
      root.remove()
    }
  })

  check('native appearance: legacy schedule dates and filters keep native clicks and independent selection', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<div class="schedule-filter"><div class="content-all"><div class="active">All</div></div><div class="filter-content"><ul><li>Event</li></ul></div></div><ul class="time-contain"><li class="data active">Today</li><li class="data">Tomorrow</li></ul><button class="default-btn">Subscribe</button>'
    const all = root.querySelector('.content-all > div')
    const event = root.querySelector('.filter-content li')
    const [today, tomorrow] = root.querySelectorAll('.data')
    let changes = 0
    event.addEventListener('click', () => {
      changes++
      all.classList.remove('active')
      event.classList.add('active')
    })
    tomorrow.addEventListener('click', () => {
      changes++
      today.classList.remove('active')
      tomorrow.classList.add('active')
    })
    const stop = setupNativePageKeyboard(root, 'esports-schedule')
    try {
      event.focus()
      event.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(event.getAttribute('aria-pressed'), 'true')
      assert.equal(all.getAttribute('aria-pressed'), 'false')
      assert.equal(today.getAttribute('aria-pressed'), 'true')
      tomorrow.focus()
      tomorrow.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      tomorrow.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(changes, 2)
      assert.equal(tomorrow.getAttribute('aria-pressed'), 'true')
      assert.equal(event.getAttribute('aria-pressed'), 'true')
      assert.equal(root.querySelector('.default-btn').getAttribute('role'), null)
      stop()
      assert.equal(event.getAttribute('role'), null)
      assert.equal(tomorrow.getAttribute('tabindex'), null)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: 404 return action gains keyboard access without replacing native navigation', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<div class="error-panel"><a class="rollback-btn">Back</a><a class="rollback-btn" href="#native">Native link</a></div>'
    const [button, link] = root.querySelectorAll('a')
    let clicks = 0
    button.addEventListener('click', () => clicks++)
    const stop = setupNativePageKeyboard(root, 'error404')
    try {
      assert.equal(button.getAttribute('role'), 'button')
      assert.equal(button.tabIndex, 0)
      assert.equal(link.getAttribute('role'), null)
      button.focus()
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 2)
      stop()
      assert.equal(button.getAttribute('role'), null)
      assert.equal(button.getAttribute('tabindex'), null)
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(clicks, 2)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: season index filters preserve native updates, focus and selected semantics', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.className = 'bangumi-index-wrapper'
    root.innerHTML = '<ul><li class="filter-item on">All</li><li class="filter-item">Complete</li></ul><ul><li class="sort-item on">Followers</li><li class="sort-item">Rating</li></ul>'
    const [all, complete] = root.querySelectorAll('.filter-item')
    const stop = setupNativePageKeyboard(root, 'anime-index')
    let changes = 0
    complete.addEventListener('click', () => {
      changes++
      all.classList.remove('on')
      complete.classList.add('on')
    })
    try {
      complete.focus()
      complete.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(changes, 1)
      assert.equal(document.activeElement, complete)
      assert.equal(all.getAttribute('aria-pressed'), 'false')
      assert.equal(complete.getAttribute('aria-pressed'), 'true')
      assert.equal(root.querySelector('.sort-item').getAttribute('aria-pressed'), 'true', 'sort and filter selections are independent')
      stop()
      assert.equal(complete.getAttribute('tabindex'), null)
      assert.equal(complete.getAttribute('aria-pressed'), null)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: collapsed live navigation stays out of Tab order and wallet navigation keeps native clicks', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<nav class="side-bar"><div class="nav-item-ctnr"><div class="nav-item">Group</div><div class="sub-pages-item-ctnr"><div class="sub-pages-item active">Page</div></div></div></nav><div class="main-ctnr"><div class="tabnav-item current">Current</div></div>'
    const group = root.querySelector('.nav-item-ctnr')
    const toggle = root.querySelector('.nav-item')
    const child = root.querySelector('.sub-pages-item')
    let stop = setupNativePageKeyboard(root, 'live-center')
    try {
      assert.equal(toggle.getAttribute('aria-expanded'), 'false')
      assert.equal(child.tabIndex, -1)
      assert.equal(root.querySelector('.tabnav-item').getAttribute('aria-pressed'), 'true')
      group.classList.add('expanded')
      toggle.classList.add('expanded')
      await flush()
      assert.equal(toggle.getAttribute('aria-expanded'), 'true')
      assert.equal(child.tabIndex, 0)
      assert.equal(child.getAttribute('aria-current'), 'page')
      group.classList.remove('expanded')
      toggle.classList.remove('expanded')
      await flush()
      assert.equal(child.tabIndex, -1)
      stop()
      assert.equal(child.getAttribute('tabindex'), null)
      root.innerHTML = '<div class="left-nav-wp"><div class="left-nav-link-item on">Balance</div></div>'
      const item = root.firstElementChild.firstElementChild
      let clicks = 0
      item.addEventListener('click', () => clicks++)
      stop = setupNativePageKeyboard(root, 'wallet')
      assert.equal(item.getAttribute('aria-current'), 'page')
      item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      stop()
      assert.equal(item.getAttribute('role'), null)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: coin records retain native clicks and return focus only when their entry leaves the view', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    for (const mode of ['hidden', 'removed', 'visible', 'other-focus', 'disposed']) {
      const root = document.body.appendChild(document.createElement('section'))
      root.innerHTML = '<div class="coin-nav"><div class="coin-nav-item on">Home</div><div class="coin-nav-item">Records</div></div><main class="coin-inner"><p class="get-coin-more">More records</p><button>Native account action</button></main><input>'
      const [home, records] = root.querySelectorAll('.coin-nav-item')
      const trigger = root.querySelector('.get-coin-more')
      const other = root.querySelector('input')
      let visible = true
      let clicks = 0
      trigger.getClientRects = () => visible ? [{ width: 100, height: 36 }] : []
      const stop = setupNativePageKeyboard(root, 'account')
      trigger.addEventListener('click', () => {
        clicks++
        queueMicrotask(() => {
          home.classList.remove('on')
          records.classList.add('on')
          visible = mode === 'visible'
          if (mode === 'removed')
            trigger.remove()
          if (mode === 'other-focus')
            other.focus()
        })
        if (mode === 'disposed')
          stop()
      })
      try {
        assert.equal(trigger.getAttribute('role'), 'button')
        assert.equal(trigger.tabIndex, 0)
        assert.equal(root.querySelector('button').getAttribute('tabindex'), null, 'native business actions retain their owner')
        trigger.focus()
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
        assert.equal(clicks, 0)
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
        other.focus()
        trigger.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
        assert.equal(clicks, 0, 'moving focus cancels a pending activation')
        trigger.focus()
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
        assert.equal(clicks, 0)
        trigger.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
        await flush()
        assert.equal(clicks, 1)
        if (mode === 'hidden' || mode === 'removed')
          assert.equal(document.activeElement, records, mode)
        else if (mode === 'other-focus')
          assert.equal(document.activeElement, other)
        else assert.notEqual(document.activeElement, records, mode)
        if (mode !== 'disposed')
          assert.equal(records.getAttribute('aria-pressed'), 'true')
        stop()
        assert.equal(trigger.hasAttribute('role'), false)
        assert.equal(records.hasAttribute('tabindex'), false)
        assert.equal(records.classList.contains('on'), true, 'cleanup preserves the native selected tab')
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        assert.equal(clicks, 1)
      }
      finally {
        stop()
        root.remove()
      }
    }
  })

  check('native appearance: account navigation uses current-page semantics and does not wrap native links in buttons', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<ul class="security-left"><li class="security-list on"><span>Home</span></li><li class="security-list">Profile</li><li class="security-list"><a href="#native">Native link</a></li></ul>'
    const [home, profile, linked] = root.querySelectorAll('li')
    let clicks = 0
    profile.addEventListener('click', () => clicks++)
    const stop = setupNativePageKeyboard(root, 'account')
    try {
      assert.equal(home.getAttribute('aria-current'), 'page')
      assert.equal(home.getAttribute('aria-pressed'), null)
      assert.equal(profile.tabIndex, 0)
      assert.equal(linked.getAttribute('role'), null)
      profile.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 0, 'Space activates on release, like a native button')
      const repeat = new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true })
      profile.dispatchEvent(repeat)
      assert.equal(repeat.defaultPrevented, true, 'holding Space must not scroll the page')
      profile.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      profile.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      profile.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      profile.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1, 'moving focus cancels a pending Space activation')
      home.classList.remove('on')
      profile.classList.add('on')
      await flush()
      assert.equal(home.getAttribute('aria-current'), null)
      assert.equal(profile.getAttribute('aria-current'), 'page')
      const link = document.createElement('a')
      link.href = '#upgraded'
      profile.appendChild(link)
      await flush()
      assert.equal(profile.getAttribute('role'), null, 'a late native link regains sole activation ownership')
      stop()
      assert.equal(home.getAttribute('tabindex'), null)
      assert.equal(profile.getAttribute('aria-current'), null)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: standalone entry answers existing health pings and releases its listener on replacement', async () => {
    const constants = await import('../src/constants/contentScript')
    const callbacks = new Set()
    const settings = { displayReady: Vue.ref(false) }
    const initialization = Vue.ref('loading')
    let starts = 0
    let stops = 0
    const identity = { name: 'Fixture Dev', version: '0.1.1', runtimeUrl: 'chrome-extension://fixture/' }
    const state = {}
    const moduleImports = Object.fromEntries([
      '~/styles/variables.scss',
      '~/styles/fonts.scss',
      '~/styles/adaptedStyles/common/nativeSurfaces.scss',
      '~/styles/adaptedStyles/common/topBar.scss',
      '~/styles/adaptedStyles/common/footer.scss',
      '~/styles/adaptedStyles/common/btn.scss',
      '~/styles/adaptedStyles/pages/nativeSites.scss',
      '~/styles/blockAds.scss',
    ].map(path => [path, {}]))
    const prompt = document.body.appendChild(document.createElement('div'))
    prompt.id = 'bewlycat-refresh-required'
    prompt.dataset.promptVersion = identity.version
    prompt.dataset.runtimeUrl = identity.runtimeUrl
    try {
      await loadSourceModule('../src/contentScripts/nativeAppearance.ts', {
        ...moduleImports,
        'webextension-polyfill': { default: { runtime: {
          getManifest: () => ({ name: identity.name, version: identity.version }),
          getURL: () => identity.runtimeUrl,
          onMessage: { addListener: fn => callbacks.add(fn), removeListener: fn => callbacks.delete(fn) },
        } } },
        '~/constants/contentScript': constants,
        '~/logic/storage': { settings, settingsInitializationState: initialization },
        '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
        './features/nativeSiteAppearance': { setupNativeSiteAppearance() {
          starts++
          return () => {
            stops++
          }
        } },
      }, { Event, AbortController: window.AbortController, performance, globalThis: state })
      document.dispatchEvent(new Event('DOMContentLoaded'))
      assert.equal(starts, 1)
      const receive = [...callbacks][0]
      assert.equal(receive({ type: 'unrelated' }), false)
      assert.equal((await receive({ type: constants.CONTENT_SCRIPT_PING })).phase, 'starting')
      settings.displayReady.value = true
      initialization.value = 'loaded'
      const response = await receive({ type: constants.CONTENT_SCRIPT_PING, expectedIdentity: identity })
      assert.equal(response.phase, 'ready')
      assert.equal(response.type, constants.CONTENT_SCRIPT_PONG)
      assert.equal(state.__BEWLY_NOCTURNE_RUNTIME_HEALTH__.runtimeUrl, identity.runtimeUrl)
      assert.equal(prompt.isConnected, false)
      initialization.value = 'invalidated'
      assert.equal(receive({ type: constants.CONTENT_SCRIPT_PING }), false)
      window.dispatchEvent(new Event('bewly:native-appearance-dispose'))
      assert.equal(callbacks.size, 0)
      assert.equal(stops, 1)
    }
    finally {
      window.dispatchEvent(new Event('bewly:native-appearance-dispose'))
      prompt.remove()
    }
  })

  check('native appearance: missed DOM readiness recovers once through completion or health checks without restarting failed or ended owners', async () => {
    const constants = await import('../src/constants/contentScript')
    const previousReadyState = Object.getOwnPropertyDescriptor(document, 'readyState')
    const styles = Object.fromEntries([
      '~/styles/variables.scss',
      '~/styles/fonts.scss',
      '~/styles/adaptedStyles/common/nativeSurfaces.scss',
      '~/styles/adaptedStyles/common/topBar.scss',
      '~/styles/adaptedStyles/common/footer.scss',
      '~/styles/adaptedStyles/common/btn.scss',
      '~/styles/adaptedStyles/pages/nativeSites.scss',
      '~/styles/blockAds.scss',
    ].map(path => [path, {}]))
    for (const mode of ['complete-event', 'health-ping', 'disposed', 'invalidated', 'failed']) {
      let readyState = 'loading'
      Object.defineProperty(document, 'readyState', { configurable: true, get: () => readyState })
      const callbacks = new Set()
      const settings = { displayReady: Vue.ref(true) }
      const initialization = Vue.ref('loaded')
      let starts = 0
      let stops = 0
      const noPolling = () => {
        throw new Error('DOM readiness recovery must not add a polling timer')
      }
      try {
        await loadSourceModule('../src/contentScripts/nativeAppearance.ts', {
          ...styles,
          'webextension-polyfill': { default: { runtime: {
            getManifest: () => ({ name: 'Fixture', version: '0.1.1' }),
            getURL: () => 'chrome-extension://fixture/',
            onMessage: { addListener: fn => callbacks.add(fn), removeListener: fn => callbacks.delete(fn) },
          } } },
          '~/constants/contentScript': constants,
          '~/logic/storage': { settings, settingsInitializationState: initialization },
          '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
          './features/nativeSiteAppearance': { setupNativeSiteAppearance() {
            starts++
            if (mode === 'failed')
              throw new Error('fixture startup failure')
            return () => {
              stops++
            }
          } },
        }, {
          Event,
          AbortController: window.AbortController,
          performance,
          globalThis: {},
          setTimeout: noPolling,
          setInterval: noPolling,
          requestAnimationFrame: noPolling,
        })
        const receive = [...callbacks][0]
        assert.equal(starts, 0)
        assert.equal(receive({ type: 'unrelated' }), false)
        readyState = 'interactive'
        document.dispatchEvent(new Event('readystatechange'))
        assert.equal((await receive({ type: constants.CONTENT_SCRIPT_PING })).phase, 'starting')
        assert.equal(starts, 0, 'do not move normal startup ahead of DOMContentLoaded')
        if (mode === 'disposed') {
          const leave = new Event('pagehide')
          Object.defineProperty(leave, 'persisted', { value: false })
          window.dispatchEvent(leave)
        }
        if (mode === 'invalidated')
          initialization.value = 'invalidated'
        readyState = 'complete'
        if (mode === 'complete-event' || mode === 'disposed' || mode === 'invalidated')
          document.dispatchEvent(new Event('readystatechange'))
        if (mode === 'failed') {
          assert.throws(() => receive({ type: constants.CONTENT_SCRIPT_PING }), /fixture startup failure/)
          assert.equal((await receive({ type: constants.CONTENT_SCRIPT_PING })).phase, 'starting')
        }
        else if (mode === 'disposed' || mode === 'invalidated') {
          assert.equal(receive({ type: constants.CONTENT_SCRIPT_PING }), false)
          assert.equal(callbacks.size, 0)
        }
        else {
          assert.equal((await receive({ type: constants.CONTENT_SCRIPT_PING })).phase, 'ready')
        }
        document.dispatchEvent(new Event('DOMContentLoaded'))
        document.dispatchEvent(new Event('readystatechange'))
        assert.equal(starts, mode === 'disposed' || mode === 'invalidated' ? 0 : 1)
        window.dispatchEvent(new Event('bewly:native-appearance-dispose'))
        assert.equal(callbacks.size, 0)
        assert.equal(stops, mode === 'complete-event' || mode === 'health-ping' ? 1 : 0)
        assert.equal(receive({ type: constants.CONTENT_SCRIPT_PING }), false)
      }
      finally {
        window.dispatchEvent(new Event('bewly:native-appearance-dispose'))
        if (previousReadyState)
          Object.defineProperty(document, 'readyState', previousReadyState)
        else delete document.readyState
      }
    }
  })

  check('native appearance: activity keyboard retains native click ownership, handles late items and restores attributes', async () => {
    const { setupNativePageKeyboard } = await import('../src/contentScripts/features/nativePageKeyboard')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<div class="list-view"><div class="tab-item active">All</div><div class="activity-item">Activity</div><a class="activity-item" href="#fixture">Native link</a></div>'
    const activity = root.querySelector('div.activity-item')
    const tab = root.querySelector('.tab-item')
    let clicks = 0
    activity.addEventListener('click', () => clicks++)
    const stop = setupNativePageKeyboard(root, 'activities')
    try {
      assert.equal(activity.tabIndex, 0)
      assert.equal(activity.getAttribute('role'), 'button')
      assert.equal(root.querySelector('a').getAttribute('role'), null)
      activity.focus()
      activity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      assert.equal(clicks, 1)
      activity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      activity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      assert.equal(clicks, 1)
      tab.classList.remove('active')
      const later = root.firstElementChild.appendChild(document.createElement('div'))
      later.className = 'activity-item'
      await flush()
      assert.equal(tab.getAttribute('aria-pressed'), 'false')
      assert.equal(later.tabIndex, 0)
      activity.remove()
      await flush()
      assert.equal(activity.getAttribute('role'), null)
      stop()
      assert.equal(later.getAttribute('tabindex'), null)
      assert.equal(tab.getAttribute('aria-pressed'), null)
      activity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(clicks, 1)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('native appearance: actual recommendation owner restores promotions and never deduplicates a normal video against an ad', async () => {
    const advertising = await import('../src/utils/advertising')
    const adapters = await import('../src/contentScripts/views/Home/adapters/recommendationVideo')
    const oldMid = document.cookie.match(/(?:^|;\s*)DedeUserID=([^;]*)/)?.[1]
    document.cookie = 'DedeUserID=42; path=/'
    try {
      for (const mode of ['web', 'app']) {
        const settings = Vue.ref({ recommendationMode: mode, blockAds: false, language: 'en', rememberNoCookieRecommendationState: false })
        const slots = new Map()
        const tab = { restored: false, isCurrent: () => true, capture: () => () => {}, ref(key, fallback) {
          if (!slots.has(key))
            slots.set(key, Vue.ref(fallback))
          return slots.get(key)
        } }
        const provider = { haveScrollbar: async () => true, handleBackToTop() {}, ...Object.fromEntries(['handleReachBottom', 'handlePageRefresh', 'undoForwardState', 'handleUndoRefresh', 'handleForwardRefresh'].map(key => [key, Vue.ref()])) }
        const promotion = { id: 900, goto: 'ad', card_type: 'cm_v1', args: { aid: 50 }, idx: 2, title: 'Promotion', uri: 'https://example.com/ad', owner: null, stat: null }
        const normal = aid => ({ id: aid, aid, bvid: `BVfixture${aid}`, goto: 'av', card_type: 'small_cover_v2', args: { aid }, idx: aid + 2, title: `Video ${aid}`, owner: { mid: 7, name: 'Fixture' }, stat: {}, pic: '' })
        let reads = 0
        const read = async () => {
          const items = ++reads === 1 ? [normal(1), promotion] : [normal(50)]
          return { code: 0, data: mode === 'web' ? { item: items } : { items } }
        }
        const module = await loadSourceModule('../src/contentScripts/views/Home/useForYouRecommendations.ts', {
          'vue': Vue,
          'vue-i18n': { useI18n: () => ({ t: key => key }) },
          'vue-toastification': { useToast: () => ({ warning() {}, error() {} }) },
          '~/composables/useAppProvider': { useBewlyApp: () => provider, UndoForwardState: { Hidden: 0, ShowUndo: 1, ShowForward: 2 } },
          '~/composables/useHomeTabState': { useHomeTabState: () => tab },
          '~/contentScripts/views/Home/adapters/recommendationVideo': adapters,
          '~/enums/appEnums': await import('../src/enums/appEnums'),
          '~/logic': { settings, appAuthTokens: Vue.ref({ accessToken: 'fixture' }) },
          '~/logic/appAuthorizationCoordinator': { appAuthorizationSuccessVersion: Vue.ref(0), reportAppAuthorizationInvalid() {}, requestAppAuthorization() {} },
          '~/logic/loginStatus': await import('../src/logic/loginStatus'),
          '~/utils/accountScope': await import('../src/utils/accountScope'),
          '~/utils/advertising': advertising,
          '~/utils/api': { default: { video: { getRecommendVideos: read, getNoCookieRecommendVideos: read, getAppRecommendVideos: read } } },
          '~/utils/authProvider': { ensureFreshAppAccessToken: async () => true, getTvSign: () => '', isAppAccessTokenInvalidResponse: () => false, refreshInvalidAppAccessToken: async () => false, TVAppKey: { appkey: 'fixture' } },
          '~/utils/bilibiliApiError': { isBilibiliRiskControl: () => false },
          '~/utils/debug': { debugLog() {} },
          '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
          './forYouInitialData': await import('../src/contentScripts/views/Home/forYouInitialData'),
          './recommendationState': await import('../src/contentScripts/views/Home/recommendationState'),
          './useRecommendationHistory': await import('../src/contentScripts/views/Home/useRecommendationHistory'),
          './useRecommendationFilters': { useRecommendationFilters: () => ({ filterFunc: Vue.ref(() => true), appFilterFunc: Vue.ref(() => true), hasActiveWebRecommendationFilter: Vue.ref(true), hasActiveAppRecommendationFilter: Vue.ref(true), hasActiveRecommendationFilter: Vue.ref(true), requiresManualFilteredPaging: Vue.ref(false), recommendationFilterSettingsSignature: Vue.ref('fixture'), resetFilteredFeedPagingState() {}, recordFilteredFeedBatch() {} }) },
          './useWebRecommendationCursor': await loadSourceModule('../src/contentScripts/views/Home/useWebRecommendationCursor.ts', { '~/logic': { settings, noCookieForYouRecommendationState: Vue.ref({ showlistGroups: [], nextFreshIdx: 1 }) } }),
        }, { performance })
        let state
        const host = document.body.appendChild(document.createElement('div'))
        const app = Vue.createApp({ setup() {
          state = module.useForYouRecommendations(() => {})
          return () => null
        } })
        try {
          app.mount(host)
          await flush()
          assert.equal(reads, 1)
          assert.equal(state.currentVideoList.value.length, 2, `${mode} retains an ad with no author/stat`)
          assert.equal(state.currentVideoList.value[1].displayData.url, 'https://example.com/ad')
          settings.value.blockAds = true
          await flush()
          assert.equal(state.currentVideoList.value.length, 1)
          settings.value.blockAds = false
          await flush()
          assert.equal(state.currentVideoList.value.length, 2)
          assert.equal(reads, 1, 'preference changes must not make a new read')
          state.handleLoadMore()
          await flush()
          assert.equal(reads, 2)
          assert.equal(state.currentVideoList.value.filter(item => !item.displayData.isAdvertisement).length, 2, 'advertiser metadata cannot consume a real video ID')
        }
        finally {
          app.unmount()
          host.remove()
        }
      }
    }
    finally {
      document.cookie = oldMid === undefined ? 'DedeUserID=; max-age=0; path=/' : `DedeUserID=${oldMid}; path=/`
    }
  })

  check('native appearance: manifest selects only the standalone entry and actual theme owner never subscribes to routes', async () => {
    const { getManifest } = await import('../src/manifest')
    const { NATIVE_SITE_FRAME_MATCHES, NATIVE_SITE_MATCHES, NATIVE_MAIN_MATCHES, getNativeSite } = await import('../src/constants/nativeSites')
    const { isContentScriptTargetUrl } = await import('../src/constants/contentScript')
    const manifest = await getManifest()
    assert.equal(getNativeSite('www.biligame.com', '/detail/'), 'game-detail')
    assert.equal(isContentScriptTargetUrl('https://www.biligame.com/detail/?id=121001'), true)
    assert.equal(isContentScriptTargetUrl('https://pkg.biligame.com/games/example.apk'), false)
    assert.ok(manifest.host_permissions.includes('*://www.biligame.com/*'))
    for (const host of ['wiki.biligame.com', 'b-gift.biligame.com', 'pay.biligame.com', 'yhxy.biligame.com'])
      assert.ok(manifest.host_permissions.includes(`*://${host}/*`))
    assert.equal(manifest.host_permissions.includes('*://*.biligame.com/*'), false)
    assert.equal(getNativeSite('mall.bilibili.com', '/detailPc'), 'merchandise-detail')
    assert.equal(isContentScriptTargetUrl('https://mall.bilibili.com/neul-next/detailuniversal/detail.html?itemsId=123'), true)
    assert.equal(isContentScriptTargetUrl('https://mall.bilibili.com/detailPc?fromUrl=example'), true)
    assert.equal(isContentScriptTargetUrl('https://mall.bilibili.com/checkout'), false)
    assert.equal(isContentScriptTargetUrl('https://mall.bilibili.com/detailPc-unrelated'), false)
    assert.equal(getNativeSite('member.bilibili.com', '/york/read-draft'), 'article-drafts')
    assert.equal(getNativeSite('member.bilibili.com', '/york/read-editor'), undefined)
    assert.equal(getNativeSite('member.bilibili.com', '/platform/upload/text/new-article'), undefined)
    const matches = (pattern, url) => {
      const target = new URL(url)
      target.hash = ''
      return new RegExp(`^${pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(target.href)
    }
    const entriesFor = url => manifest.content_scripts.filter(entry => entry.matches.some(pattern => matches(pattern, url))
      && !entry.exclude_matches?.some(pattern => matches(pattern, url)))
    for (const url of [
      'https://member.bilibili.com/york/read-draft',
      'https://member.bilibili.com/york/read-draft?from=creator',
      'https://member.bilibili.com/york/data-center-web',
      'https://member.bilibili.com/york/data-center-web/dataCenter/video?tab=0',
      'https://member.bilibili.com/mall/upower-manage/custom-charge?from=creator',
      'https://cm.bilibili.com/quests/#/task',
      'https://cm.bilibili.com/quests/?from=creator#/regist',
      'https://cm.bilibili.com/clue-up#/upper/list',
      'https://cm.bilibili.com/fly-pc#/',
      'https://cm.bilibili.com/pickup-web/#/up/settle',
      'https://live.bilibili.com/blanc/123',
      'https://mall.bilibili.com/detailPc?fromUrl=example',
    ]) {
      const entries = entriesFor(url)
      assert.equal(entries.length, 1, `only the appearance entry owns this embedded document: ${url}`)
      assert.deepEqual(entries[0].js, ['./dist/nativeAppearance/index.global.js'])
      assert.equal(entries[0].all_frames, true)
      assert.notEqual(entries[0].world, 'MAIN')
    }
    for (const [url, site] of [
      ['https://wiki.biligame.com/', 'game-wiki'],
      ['https://wiki.biligame.com/wiki/%E9%A6%96%E9%A1%B5', 'game-wiki'],
      ['https://wiki.biligame.com/nrc/%E9%A6%96%E9%A1%B5', 'game-wiki-community'],
      ['https://wiki.biligame.com/blhx/', 'game-wiki-community'],
      ['https://wiki.biligame.com/wiki-unrelated', 'game-wiki-community'],
      ['https://b-gift.biligame.com/?from=header', 'game-gifts'],
      ['https://b-gift.biligame.com/list_my.html', 'game-gifts'],
      ['https://pay.biligame.com/#/?from=gc&selectedNav=pay', 'game-payment'],
      ['https://yhxy.biligame.com/', 'game-agreement'],
      ['https://member.bilibili.com/academy/seriesDetail?id=12', 'academy'],
      ['https://member.bilibili.com/york/up-report-weekly', 'creator-report'],
      ['https://music.bilibili.com/', 'music-portal'],
      ['https://music.bilibili.com/help?from=header', 'music-portal'],
      ['https://music.bilibili.com/console/join', 'music-portal'],
      ['https://music.bilibili.com/pc/rank?list_type=1', 'music-rank'],
      ['https://cool.bilibili.com/space/video-manage', 'materials'],
      ['https://mall.bilibili.com/#noReffer=true', 'merchandise-catalog'],
      ['https://app.bilibili.com/', 'downloads'],
      ['https://big.bilibili.com/pc/privilege', 'premium-info'],
      ['https://www.bilibili.com/blackboard/help.html#/?qid=295', 'public-help'],
      ['https://www.bilibili.com/blackboard/privacy-pc.html', 'public-document'],
      ['https://www.bilibili.com/blackboard/x/act_list/', 'topics'],
      ['https://www.bilibili.com/blackboard/topic_list.html', 'topics'],
      ['https://www.bilibili.com/blackboard/topic_list.html?from=footer', 'topics'],
      ['https://www.bilibili.com/v/copyright/intro/', 'copyright-intro'],
      ['https://www.bilibili.com/v/customer-service/', 'customer-service'],
      ['https://www.bilibili.com/blackboard/topic/activity-example.html', 'campaign'],
      ['https://www.bilibili.com/blackboard/activity-example.html', 'campaign'],
      ['https://live.bilibili.com/blackboard/era/example.html', 'campaign'],
      ['https://live.bilibili.com/all', 'live'],
      ['https://www.bilibili.com/blackboard/activity-list.html', 'activities'],
      ['https://www.bilibili.com/blackboard/topic/activity-cn8bxPLzz.html', 'public-document'],
      ['https://e.bilibili.com/', 'marketing-public'],
      ['https://e.bilibili.com/product.html?from=nav', 'marketing-public'],
      ['https://e.bilibili.com/case/', 'marketing-public'],
      ['https://e.bilibili.com/case?from=nav', 'marketing-public'],
      ['https://e.bilibili.com/case/lays.html', 'marketing-public'],
      ['https://e.bilibili.com/bfs/static/e-fe/case/kangshifu.html?from=case#content', 'marketing-public'],
      ['https://e.bilibili.com/main/observe/', 'marketing-public'],
      ['https://e.bilibili.com/main/observe/hua-huo-sheng-ji-6da-ping-tai-neng-li-rang-nei-rong-he-zuo-geng-gao-xiao', 'marketing-public'],
      ['https://e.bilibili.com/main/collaborator', 'marketing-public'],
      ['https://e.bilibili.com/main/agent?from=collaborator', 'marketing-public'],
      ['https://b.bilibili.com/#/login', 'brand-public'],
      ['https://mcn.bilibili.com/studio/mcn/entry', 'mcn-public'],
      ['https://jobs.bilibili.com/social/positions', 'jobs-public'],
      ['https://jobs.bilibili.com/?isTrusted=true', 'jobs-public'],
      ['https://jobs.bilibili.com/bstar?isTrusted=true', 'jobs-public'],
      ['https://jobs.bilibili.com/campus/bup?isTrusted=true', 'jobs-public'],
      ['https://security.bilibili.com/announcement/123/', 'security-public'],
      ['https://security.bilibili.com/profile/5177/', 'security-public'],
      ['https://ir.bilibili.com/en/financial-information/?tab=results', 'investor-public'],
    ]) {
      const target = new URL(url)
      assert.equal(getNativeSite(target.hostname, target.pathname), site, url)
      assert.equal(isContentScriptTargetUrl(url), true, url)
      const entries = entriesFor(url)
      assert.equal(entries.length, 1, `shared hosts cannot boot both runtimes: ${url}`)
      assert.deepEqual(entries[0].js, ['./dist/nativeAppearance/index.global.js'])
      assert.equal(entries[0].all_frames, false)
    }
    for (const url of [
      'https://member.bilibili.com/york/read-editor',
      'https://www.bilibili.com/blackboard/topic_list.html/unrelated',
      'https://wiki.biligame.com.example.invalid/nrc/',
      'https://b-gift.biligame.com/list_my.html/unrelated',
      'https://pay.biligame.com/cashier',
      'https://yhxy.biligame.com/assets/app.js',
      'https://member.bilibili.com/york/data-center-web-other',
      'https://member.bilibili.com/academy-unrelated',
      'https://music.bilibili.com/pc/music-center/',
      'https://music.bilibili.com/console-unrelated',
      'https://cm.bilibili.com/quests-other/',
      'https://cm.bilibili.com/clue-up-other',
      'https://cm.bilibili.com/fly-pc-other',
      'https://cm.bilibili.com/pickup-web-other/',
      'https://cm.bilibili.com/new-art/bricks/',
      'https://mall.bilibili.com/checkout',
      'https://e.bilibili.com/private-console',
      'https://e.bilibili.com/case-other/',
      'https://e.bilibili.com/case/cover.png?v=1',
      'https://e.bilibili.com/bfs/static/e-fe/case/assets/app.js',
      'https://e.bilibili.com/bfs/static/e-fe/case/assets/app.css',
      'https://e.bilibili.com/main/observe-other',
      'https://e.bilibili.com/main/agent/private',
      'https://e.bilibili.com/main/collaborator/private',
      'https://mcn.bilibili.com/studio/mcn/submit',
      'https://jobs.bilibili.com/bstar-unrelated',
      'https://security.bilibili.com/create/',
      'https://security.bilibili.com/profile-settings/',
      'https://ir.bilibili.com/media/example.pdf',
    ]) {
      const target = new URL(url)
      assert.equal(getNativeSite(target.hostname, target.pathname), undefined, url)
      assert.equal(entriesFor(url).some(entry => entry.js.includes('./dist/nativeAppearance/index.global.js')), false, url)
    }
    for (const url of ['https://www.bilibili.com/video/BVfixture/', 'https://www.bilibili.com/bangumi/play/ep123', 'https://member.bilibili.com/platform/home', 'https://music.bilibili.com/pc/music-center/']) {
      const entries = entriesFor(url)
      assert.equal(entries.length, 2)
      assert.ok(entries.some(entry => entry.js.includes('./dist/contentScripts/pageLoading.js')))
      assert.ok(entries.some(entry => entry.world === 'MAIN'))
    }
    for (const match of NATIVE_SITE_MATCHES) {
      const entries = manifest.content_scripts.filter(entry => entry.matches.includes(match) && !entry.exclude_matches?.includes(match))
      assert.equal(entries.length, 1)
      assert.deepEqual(entries[0].js, ['./dist/nativeAppearance/index.global.js'])
      assert.equal(entries[0].all_frames, NATIVE_SITE_FRAME_MATCHES.includes(match))
      assert.notEqual(entries[0].world, 'MAIN')
      if (!entries[0].all_frames)
        assert.deepEqual(entries[0].exclude_matches, NATIVE_SITE_FRAME_MATCHES, 'embedded paths cannot boot the standalone entry twice')
    }
    const frameEntries = manifest.content_scripts.filter(entry => entry.all_frames && entry.js.includes('./dist/nativeAppearance/index.global.js'))
    assert.equal(frameEntries.length, 1)
    assert.deepEqual(frameEntries[0].matches, NATIVE_SITE_FRAME_MATCHES)
    assert.deepEqual(frameEntries[0].js, ['./dist/nativeAppearance/index.global.js'])
    assert.notEqual(frameEntries[0].match_about_blank, true)
    assert.notEqual(frameEntries[0].world, 'MAIN')
    for (const entry of manifest.content_scripts.filter(entry => entry.js.some(file => file.startsWith('./dist/contentScripts/')))) {
      for (const match of [...NATIVE_MAIN_MATCHES, ...NATIVE_SITE_FRAME_MATCHES])
        assert.ok(entry.exclude_matches.includes(match), 'main-site appearance-only paths cannot also boot the full runtime')
    }
    for (const path of ['/cheese', '/cheese/', '/cheese/play/ss556']) {
      assert.equal(getNativeSite('www.bilibili.com', path), undefined, 'courses retain their existing main-site screenshot/player lifecycle')
      assert.equal(isContentScriptTargetUrl(`https://www.bilibili.com${path}`), true)
    }
    assert.equal(getNativeSite('www.bilibili.com', '/blackboard/activity-list.html'), 'activities')
    assert.equal(getNativeSite('www.bilibili.com', '/blackboard/activity-list.html/unrelated'), undefined)
    for (const path of ['/match/home', '/match/game']) {
      assert.equal(getNativeSite('www.bilibili.com', path), 'esports')
      assert.equal(isContentScriptTargetUrl(`https://www.bilibili.com${path}?gid=2`), true)
      assert.equal(getNativeSite('www.bilibili.com', `${path}/`), 'esports')
    }
    assert.equal(getNativeSite('www.bilibili.com', '/bangumi/media/md835'), 'season-media')
    assert.equal(getNativeSite('www.bilibili.com', '/bangumi/mediaeval'), undefined)
    assert.equal(getNativeSite('www.bilibili.com', '/bangumi/play/ss835'), undefined, 'playback retains its existing runtime')
    assert.equal(getNativeSite('www.bilibili.com', '/match/game/unknown'), undefined)
    assert.equal(isContentScriptTargetUrl('https://www.bilibili.com/match/gameplay'), false)
    assert.equal(getNativeSite('www.bilibili.com', '/cheesecake'), undefined)
    assert.equal(isContentScriptTargetUrl('https://www.bilibili.com/video/BV1fixture'), true)
    const settings = Vue.ref({ theme: 'auto', adaptToOtherPageStyles: true, enableOledDarkMode: true, darkModeBaseColor: '#2a2f2d', videoPageDarkMode: false })
    let routeSubscriptions = 0
    let intervals = 0
    let cookieWrites = 0
    const rootClass = document.documentElement.className
    const bodyClass = document.body.className
    const originalStyle = document.documentElement.getAttribute('style')
    const module = await loadSourceModule('../src/composables/useDark.ts', {
      'vue': Vue,
      '@vueuse/core': { usePreferredDark: () => Vue.ref(true) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref() {
        routeSubscriptions++
        return Vue.ref(window.location.href)
      } },
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/logic': { settings },
      '~/utils/iframeMessage': { getParentMessageData: () => null },
      '~/utils/main': { isVideoPlaybackPage: () => false, setCookie() { cookieWrites++ } },
    }, { ...Vue, CustomEvent, window: { ...window, location: window.location, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setInterval() {
      intervals++
      return 1
    } } })
    try {
      const state = module.useDark({ observeRoute: false, syncNativeTheme: false })
      assert.equal(state.isDark.value, true)
      assert.equal(state.isOledDark.value, true)
      assert.equal(routeSubscriptions, 0)
      assert.equal(intervals, 0)
      assert.equal(cookieWrites, 0, 'CSS adaptation does not overwrite the native site theme preference')
    }
    finally {
      module.stopDarkState()
      document.documentElement.className = rootClass
      document.body.className = bodyClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: advertisements retain their destination and render without video actions or fake loading', async () => {
    const { toAdvertisementCard } = await import('../src/utils/advertising')
    const card = toAdvertisementCard({ card_type: 'cm_v1', ad_info: { creative_id: 91, creative_content: { title: 'Fixture promotion', image_url: 'https://i0.hdslb.com/fixture.png', url: 'https://example.com/promotion' } } })
    assert.equal(card.isAdvertisement, true)
    assert.equal(card.bvid, '')
    assert.equal(card.aid, undefined)
    assert.equal(card.advertisementKey, 'ad:91')
    const Component = await compileComponent('../src/components/VideoCard/AdvertisementCard.vue', { 'vue-i18n': { useI18n: () => ({ t: key => key }) } })
    const source = Vue.ref(card)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Component, { video: source.value }) })
    app.component('LazyPicture', { props: ['src', 'alt'], setup: props => () => Vue.h('img', { src: props.src, alt: props.alt }) })
    try {
      app.mount(host)
      assert.equal(host.querySelector('a').href, 'https://example.com/promotion')
      assert.equal(host.querySelector('a').rel, 'noopener noreferrer')
      assert.equal(host.querySelector('img').src, 'https://i0.hdslb.com/fixture.png')
      assert.match(host.textContent, /common.advertisement/)
      assert.equal(host.querySelectorAll('button,video,[data-bew-skeleton]').length, 0)
      source.value = toAdvertisementCard({ goto: 'ad', title: 'Incomplete promotion', uri: 'javascript:alert(1)' })
      await flush()
      assert.equal(host.querySelector('a'), null)
      assert.equal(host.querySelector('img'), null)
      assert.match(host.textContent, /Incomplete promotion/)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('native appearance: shared settings gate projection, route polling stays off, disabling restores native classes', async () => {
    const colors = await import('../src/utils/themeColor')
    let surfaceColors = ['#000000', '#303533']
    const preferences = Vue.ref({ adaptToOtherPageStyles: true, blockAds: false, themeColor: '#f43f5e', customizeFont: 'custom', fontFamily: 'Fixture Font' })
    preferences.displayReady = Vue.ref(false)
    const initialization = Vue.ref('loading')
    const dark = Vue.ref(true)
    let starts = 0
    let stops = 0
    const rootClass = document.documentElement.className
    const bodyClass = document.body.className
    const originalStyle = document.documentElement.getAttribute('style')
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      vue: Vue,
      '~/composables/useDark': {
        useDark(options) {
          assert.equal(options.observeRoute, false)
          assert.equal(options.syncNativeTheme, false)
          starts++
          document.documentElement.classList.add('dark', 'oled-dark')
          document.body.classList.add('dark', 'oled-dark')
          return { isDark: dark }
        },
        stopDarkState() { stops++ },
      },
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: initialization },
      '~/utils/themeColor': { ...colors, readThemeContrastSurfaces: () => surfaceColors },
      './nativePageKeyboard': await import('../src/contentScripts/features/nativePageKeyboard'),
    }, { location: { hostname: 'live.bilibili.com' } })
    document.documentElement.classList.remove('dark', 'oled-dark')
    document.body.classList.remove('dark', 'oled-dark')
    document.documentElement.style.setProperty('--bew-theme-checkmark-image', 'none')
    const dispose = module.setupNativeSiteAppearance()
    try {
      assert.equal(starts, 0)
      preferences.displayReady.value = true
      initialization.value = 'loaded'
      await flush()
      assert.equal(starts, 1)
      assert.equal(document.documentElement.dataset.bewlyNativeSite, 'live')
      assert.equal(document.documentElement.classList.contains('bewly-design'), true)
      assert.equal(document.documentElement.style.getPropertyValue('--bew-on-theme-color'), '#000000')
      assert.equal(document.documentElement.style.getPropertyValue('--bew-theme-checkmark-image'), colors.getThemeColorTokens('#f43f5e', true).checkmarkImage)
      preferences.value.themeColor = '#09090a'
      await flush()
      assert.equal(document.documentElement.style.getPropertyValue('--bew-theme-checkmark-image'), colors.getThemeColorTokens('#09090a', true).checkmarkImage)
      assert.ok(colors.relativeContrast(document.documentElement.style.getPropertyValue('--bew-theme-foreground'), '#303533') >= 4.5)
      surfaceColors = ['#000000', '#505550']
      preferences.value.darkModeBaseColor = '#444944'
      await flush()
      assert.ok(colors.relativeContrast(document.documentElement.style.getPropertyValue('--bew-theme-foreground'), '#505550') >= 4.5, 'changing the dark base refreshes the derived foreground')
      assert.equal(document.documentElement.style.getPropertyValue('--bew-native-font-family'), 'Fixture Font')
      preferences.value.customizeFont = 'default'
      await flush()
      assert.equal(document.documentElement.classList.contains('bewly-native-fonts'), false)
      assert.equal(document.documentElement.style.getPropertyValue('--bew-native-font-family'), '')
      preferences.value.blockAds = true
      await flush()
      assert.equal(starts, 1)
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true)
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.equal(stops, 1)
      assert.equal(document.documentElement.classList.contains('bewly-design'), false)
      assert.equal(document.body.classList.contains('dark'), false)
      assert.equal(document.documentElement.style.getPropertyValue('--bew-theme-checkmark-image'), 'none')
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), true, 'advertising preference is independent of visual adaptation')
      preferences.value.adaptToOtherPageStyles = true
      await flush()
      assert.equal(starts, 2)
      initialization.value = 'invalidated'
      await flush()
      assert.equal(stops, 2)
      assert.equal(document.documentElement.classList.contains('block-useless-contents'), false)
      dispose()
      preferences.value.themeColor = '#ffffff'
      await flush()
      assert.equal(starts, 2)
      assert.equal(document.documentElement.dataset.bewlyNativeSite, undefined)
    }
    finally {
      dispose()
      document.documentElement.className = rootClass
      document.body.className = bodyClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: article drafts use the shared appearance switch while retaining native inputs and action ownership', async () => {
    const rootClass = document.documentElement.className
    const originalStyle = document.documentElement.getAttribute('style')
    const root = document.body.appendChild(document.createElement('div'))
    root.id = 'app'
    root.innerHTML = '<div class="read-draft"><input class="vui_input__input" value="original query"><button class="new-creation_button">Native action</button></div>'
    const input = root.querySelector('input')
    const button = root.querySelector('button')
    let nativeClicks = 0
    let themeStarts = 0
    button.addEventListener('click', () => nativeClicks++)
    const preferences = Vue.ref({ adaptToOtherPageStyles: false, blockAds: false, themeColor: '#f43f5e', customizeFont: 'default' })
    preferences.displayReady = Vue.ref(true)
    const module = await loadSourceModule('../src/contentScripts/features/nativeSiteAppearance.ts', {
      'vue': Vue,
      '~/constants/nativeSites': await import('../src/constants/nativeSites'),
      '~/logic/storage': { settings: preferences, settingsInitializationState: Vue.ref('loaded') },
      '~/composables/useDark': { useDark: (options) => {
        assert.deepEqual({ ...options }, { observeRoute: false, syncNativeTheme: false })
        themeStarts++
        return { isDark: Vue.ref(false) }
      }, stopDarkState() {} },
      '~/utils/themeColor': { ...(await import('../src/utils/themeColor')), readThemeContrastSurfaces: () => [] },
      './nativePageKeyboard': { setupNativePageKeyboard() { throw new Error('draft controls already own keyboard behavior') } },
    }, { location: { hostname: 'member.bilibili.com', pathname: '/york/read-draft' } })
    const dispose = module.setupNativeSiteAppearance()
    try {
      assert.equal(themeStarts, 0)
      assert.equal(document.documentElement.dataset.bewlyNativeSite, 'article-drafts')
      preferences.value.adaptToOtherPageStyles = true
      await flush()
      assert.equal(themeStarts, 1)
      assert.equal(document.documentElement.classList.contains('bewly-design'), true)
      button.click()
      preferences.value.adaptToOtherPageStyles = false
      await flush()
      assert.equal(document.documentElement.classList.contains('bewly-design'), false)
      assert.equal(root.querySelector('input'), input)
      assert.equal(input.value, 'original query')
      assert.equal(root.querySelector('button'), button)
      button.click()
      assert.equal(nativeClicks, 2, 'appearance toggling never replaces or handles native business clicks')
      dispose()
      assert.equal(document.documentElement.dataset.bewlyNativeSite, undefined)
    }
    finally {
      dispose()
      root.remove()
      document.documentElement.className = rootClass
      if (originalStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', originalStyle)
    }
  })

  check('native appearance: video search toggles accepted advertisements without re-requesting or losing card identity', async () => {
    const settings = Vue.ref({ blockAds: false })
    const input = [{ aid: 1, title: 'Normal' }, { aid: 2, title: 'Promotion', is_ad: true }]
    let requests = 0
    const formatter = await loadSourceModule('../src/utils/dataFormatter.ts', {
      '~/logic': { settings },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      './../enums/appEnums': await import('../src/enums/appEnums'),
    })
    const transforms = await loadSourceModule('../src/contentScripts/views/SearchResults/searchTransforms.ts', {
      '~/utils/advertising': await import('../src/utils/advertising'),
      '~/utils/dataFormatter': formatter,
      '~/utils/htmlDecode': await import('../src/utils/htmlDecode'),
    })
    const Grid = { props: ['items'], setup: props => () => Vue.h('ul', props.items.map(item => Vue.h('li', { key: item.id, 'data-id': item.id }, item.title))) }
    const Component = await compileComponent('../src/contentScripts/views/SearchResults/pages/VideoSearchPage.vue', {
      '~/components/VideoCardGrid.vue': { default: Grid },
      '~/logic': { settings },
      '../components/Pagination.vue': { default: { render: () => null } },
      '../components/SearchEmptyState.vue': { default: { render: () => null } },
      '../searchTransforms': transforms,
      '../utils/searchHelpers': await import('../src/contentScripts/views/SearchResults/utils/searchHelpers'),
      '../composables/useSearchListPage': { useSearchListPage(options) {
        requests++
        return { results: Vue.ref(options.transformItems(input)), paginationMode: Vue.ref('scroll'), hasMore: Vue.ref(false), isLoading: Vue.ref(false), error: Vue.ref(''), currentPage: Vue.ref(1), totalPages: Vue.ref(1) }
      } },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Component, { keyword: 'fixture', filters: {} })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      const normal = host.querySelector('[data-id="1"]')
      assert.equal(host.querySelectorAll('li').length, 2)
      settings.value.blockAds = true
      await flush()
      assert.equal(host.querySelectorAll('li').length, 1)
      assert.equal(host.querySelector('[data-id="1"]'), normal)
      settings.value.blockAds = false
      await flush()
      assert.equal(host.querySelectorAll('li').length, 2)
      assert.equal(requests, 1)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
