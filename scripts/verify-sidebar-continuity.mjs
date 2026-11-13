import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync, parse } from 'vue/compiler-sfc'

import { applyMotionPreference } from '../src/utils/reducedMotion'

async function listStylePolicyFiles() {
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  return (await readdir(root, { recursive: true }))
    .filter(file => /\.(?:vue|scss|css|ts)$/.test(file))
    .map(file => join(root, file))
}

export function registerSidebarContinuityChecks(check, { Vue, compileComponent, flush }) {
  check('sidebar material: actual late scoped message/skeleton CSS cannot repaint a hosted rail', async () => {
    const files = [
      ['components/LibraryWorkspace.vue', 'library-workspace__rail'],
      ['contentScripts/views/Notifications/whisper/WhisperWorkspace.vue', 'whisper-workspace__sessions'],
      ['contentScripts/views/Notifications/components/NotificationsPageSkeleton.vue', 'notifications-page-skeleton__sessions'],
    ]
    for (const [path, className] of files) {
      const filename = fileURLToPath(new URL(`../src/${path}`, import.meta.url))
      const source = await readFile(filename, 'utf8')
      const { descriptor } = parse(source)
      const style = descriptor.styles[0]
      const compiled = await compileStyleAsync({ filename, source: style.content, id: 'data-v-rail-test', scoped: Boolean(style.scoped), preprocessLang: 'scss' })
      assert.deepEqual(compiled.errors, [])
      const css = document.head.appendChild(document.createElement('style'))
      const rail = document.body.appendChild(document.createElement('aside'))
      rail.className = className
      rail.setAttribute('data-v-rail-test', '')
      try {
        // JSDOM does not resolve custom properties. Substitute only the material
        // token, retaining the compiled scoped selectors and actual source order.
        for (const color of ['rgb(235, 235, 235)', 'rgb(45, 45, 45)', 'rgb(20, 20, 20)']) {
          css.textContent = compiled.code.replaceAll('var(--bew-sidebar-background)', color)
          rail.classList.remove('bew-sidebar-hosted')
          assert.equal(getComputedStyle(rail).backgroundColor, color, 'standalone rail keeps its material')
          rail.classList.add('bew-sidebar-hosted')
          assert.equal(getComputedStyle(rail).backgroundColor, 'rgba(0, 0, 0, 0)', `${className} must defer to the shared surface`)
        }
      }
      finally {
        css.remove()
        rail.remove()
      }
    }
  })
  check('sidebar: persistent shell/search survive page replacement with scoped input, IME, filter and cleanup', async () => {
    const sidebar = await import('../src/composables/useSidebarHost')
    const common = {
      '~/composables/useSidebarHost': sidebar,
      '~/logic': { settings: Vue.ref({ disableFrostedGlass: false, dockPosition: 'bottom' }) },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
    }
    const SearchControl = await compileComponent('../src/components/SidebarSearchControl.vue', common)
    const Wheel = await compileComponent('../src/components/WheelSelector.vue', common)
    const HeadingControl = await compileComponent('../src/components/SidebarHeadingControl.vue', { ...common, './WheelSelector.vue': { default: Wheel } })
    const Search = await compileComponent('../src/components/LibrarySearchField.vue', { ...common, './SidebarSearchControl.vue': { default: SearchControl } })
    const Heading = await compileComponent('../src/components/LibrarySidebarHeading.vue', { ...common, './SidebarHeadingControl.vue': { default: HeadingControl } })
    const Rail = await compileComponent('../src/components/LibraryWorkspace.vue', common)
    const Host = await compileComponent('../src/components/PersistentSidebar.vue', { ...common, './SidebarSearchControl.vue': { default: SearchControl }, './SidebarHeadingControl.vue': { default: HeadingControl } })
    const page = Vue.ref('favorites')
    const active = Vue.ref(true)
    const mounted = Vue.ref(true)
    const values = { favorites: Vue.ref('A'), history: Vue.ref('B'), messages: Vue.ref('') }
    const submits = []
    let host
    let searchInstance
    const Page = Vue.defineComponent({
      setup() {
        const owner = page.value
        return () => Vue.h(Rail, { label: owner }, {
          sidebar: ({ contentId }) => Vue.h('div', { class: 'library-rail-content' }, [
            Vue.h(Heading, { title: owner, contentId, modelValue: 'all', hideTitle: true, options: [{ value: 'all', label: owner }, { value: 'other', label: 'other' }] }),
            Vue.h(Search, {
              ref: (instance) => {
                if (instance)
                  searchInstance = instance
              },
              modelValue: values[owner].value,
              label: owner,
              clearOnEscape: true,
              'onUpdate:modelValue': value => values[owner].value = value,
              onSubmit: event => submits.push([owner, event?.shiftKey ?? false]),
            }, owner === 'favorites' ? { filter: () => Vue.h('select', { 'aria-label': 'filter' }, Vue.h('option', 'all')) } : undefined),
          ]),
          default: () => Vue.h('p', owner),
        })
      },
    })
    const element = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      host = sidebar.provideSidebarHost(() => page.value)
      return () => [Vue.h(Host, { active: active.value }), mounted.value ? Vue.h(Page, { key: page.value }) : null]
    } })
    try {
      app.mount(element)
      await flush()
      const shell = element.querySelector('.persistent-sidebar')
      const input = element.querySelector('input')
      const retiredSearch = searchInstance
      const wheel = element.querySelector('.wheel-selector')
      assert.ok(shell && input)
      assert.equal(input.value, 'A')
      assert.equal(element.querySelectorAll('.library-search-field').length, 1)
      assert.equal(element.querySelectorAll('select').length, 1)
      input.focus()
      input.dispatchEvent(new Event('compositionstart', { bubbles: true }))
      input.value = '未确认'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      assert.equal(values.favorites.value, 'A', 'IME does not submit incomplete composition')
      page.value = 'history'
      await flush()
      assert.equal(element.querySelector('.persistent-sidebar'), shell)
      assert.equal(element.querySelector('input'), input, 'the actual input node is reused')
      assert.equal(element.querySelector('.wheel-selector'), wheel, 'identical heading controls survive navigation')
      assert.equal(input.value, 'B')
      input.blur()
      retiredSearch.focus()
      assert.notEqual(document.activeElement, input, 'a retired page cannot focus the new page search')
      input.dispatchEvent(new Event('compositionend', { bubbles: true }))
      assert.equal(values.history.value, 'B', 'late old composition cannot overwrite the new page')
      assert.equal(element.querySelectorAll('select').length, 0, 'retired filter is removed')
      input.focus()
      input.value = 'history query'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
      await flush()
      assert.equal(values.history.value, 'history query')
      assert.equal(values.favorites.value, 'A')
      assert.deepEqual(submits, [['history', true]])
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
      assert.equal(values.history.value, '')
      mounted.value = false
      page.value = 'messages'
      await flush()
      assert.equal(shell.inert || shell.hasAttribute('inert'), true, 'stale rail is inert during an async page gap')
      assert.equal(host.search.value, null)
      assert.equal(host.heading.value, null)
      mounted.value = true
      await flush()
      assert.equal(element.querySelector('input'), input)
      assert.equal(element.querySelector('.wheel-selector'), wheel, 'the wheel survives an async gap without retaining the old page')
      element.querySelector('[role="tab"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      for (const next of ['favorites', 'messages', 'history', 'favorites']) {
        page.value = next
        await flush()
        assert.equal(element.querySelector('input'), input)
        assert.equal(element.querySelector('[role="tab"]').tabIndex, 0, 'old keyboard preview is reset for the new category scope')
        assert.equal(element.querySelectorAll('.library-workspace__rail').length, 1)
        assert.equal(element.querySelectorAll('.library-search-field').length, 1)
      }
      active.value = false
      mounted.value = false
      await flush()
      assert.equal(element.querySelector('.persistent-sidebar'), shell, 'closing keeps the same shell for its CSS exit')
      assert.equal(shell.classList.contains('persistent-sidebar--closed'), true)
      assert.equal(shell.getAttribute('aria-hidden'), 'true')
      assert.equal(shell.style.display, '', 'no v-show cuts off the exit animation')
      active.value = true
      mounted.value = true
      await flush()
      assert.equal(shell.classList.contains('persistent-sidebar--closed'), false)
      assert.equal(element.querySelector('input'), input)
    }
    finally {
      app.unmount()
      assert.equal(host.search.value, null)
      assert.equal(host.heading.value, null)
      element.remove()
    }
  })
  check('sidebar: the closed rail folds into the home logo circle and grows back out of it', async () => {
    const sidebar = await import('../src/composables/useSidebarHost')
    const { getMotionRemaining, PAGE_MOTION } = await import('../src/utils/motionPriority')
    const common = {
      '~/composables/useSidebarHost': sidebar,
      '~/logic': { settings: Vue.ref({ disableFrostedGlass: false, dockPosition: 'bottom' }) },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
    }
    const Host = await compileComponent('../src/components/PersistentSidebar.vue', { ...common, './SidebarSearchControl.vue': { default: { render: () => null } }, './SidebarHeadingControl.vue': { default: { render: () => null } } })
    const active = Vue.ref(true)
    const reduce = { value: false }
    const runs = []
    const originalMatchMedia = window.matchMedia
    const preference = document.documentElement.dataset.bewMotion
    applyMotionPreference(document.documentElement, 'full')
    const originalAnimate = HTMLElement.prototype.animate
    window.matchMedia = () => ({ get matches() {
      return reduce.value
    } })
    HTMLElement.prototype.animate = function (keyframes, options) {
      let settle
      const finished = new Promise((resolve, reject) => settle = { resolve, reject })
      finished.catch(() => {})
      const animation = { keyframes, options, finished, currentTime: 0, playbackRate: 1, effect: { getComputedTiming: () => ({ endTime: options.duration }) }, cancel: () => settle.reject(new Error('cancelled')) }
      animation.finish = () => settle.resolve(animation)
      runs.push({ target: this, animation })
      return animation
    }
    const logo = document.createElement('div')
    logo.getBoundingClientRect = () => ({ left: 48, top: 9, width: 46, height: 46 })
    let host
    const element = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      host = sidebar.provideSidebarHost(() => 'favorites')
      return () => Vue.h(Host, { active: active.value })
    } })
    try {
      app.mount(element)
      await flush()
      const shell = element.querySelector('.persistent-sidebar')
      const surface = shell.querySelector('.persistent-sidebar__surface')
      shell.getBoundingClientRect = () => ({ left: 0, top: 0, width: 280, height: 900 })
      assert.ok(surface, 'the glass is its own layer behind the rail content')
      assert.equal(host.railOpen.value, true)

      // Without a logo the rail keeps sliding off-screen.
      active.value = false
      await flush()
      assert.equal(shell.classList.contains('persistent-sidebar--docked'), false)
      assert.equal(runs.length, 0)
      active.value = true
      await flush()

      host.logo.value = logo
      active.value = false
      await flush()
      assert.equal(host.railOpen.value, false)
      assert.equal(host.morphing.value, true, 'the logo hides its own circle while the rail folds into it')
      assert.equal(shell.classList.contains('persistent-sidebar--morphing'), true)
      const fold = runs.find(run => run.target === surface && !run.animation.options.pseudoElement).animation
      const shape = ({ left, top, width, height, borderRadius }) => [left, top, width, height, borderRadius].join(' ')
      assert.equal(shape(fold.keyframes.at(0)), '-1px -1px 281px 902px 0px', 'starts as the rail')
      assert.equal(shape(fold.keyframes.at(-1)), '48px 9px 46px 46px 23px', 'ends exactly on the logo circle')
      assert.ok(fold.keyframes.length > 3, 'the fold passes through liquid column and drop shapes')
      assert.ok(getMotionRemaining(PAGE_MOTION) > 0, 'page content waits for the fold')
      fold.finish()
      await flush()
      assert.equal(host.morphing.value, false)
      assert.equal(shell.classList.contains('persistent-sidebar--docked'), true, 'the folded rail hands off to the logo circle')

      runs.length = 0
      active.value = true
      await flush()
      const grow = runs.find(run => run.target === surface && !run.animation.options.pseudoElement).animation
      assert.equal(grow.keyframes.at(0).width, '46px', 'the rail grows out of the circle')
      assert.equal(grow.keyframes.at(-1).height, '902px')
      // Reversing mid-way starts from the painted shape, not from either end.
      surface.style.left = '30px'
      surface.style.top = '9px'
      surface.style.width = '120px'
      surface.style.height = '400px'
      surface.style.borderTopLeftRadius = '20px'
      runs.length = 0
      active.value = false
      await flush()
      const reverse = runs.find(run => run.target === surface && !run.animation.options.pseudoElement).animation
      assert.equal(reverse.keyframes.at(0).width, '120px')
      reverse.finish()
      await flush()

      reduce.value = true
      applyMotionPreference(document.documentElement, 'reduce')
      runs.length = 0
      active.value = true
      await flush()
      assert.equal(runs.length, 0, 'reduced motion switches without a morph')
      assert.equal(host.morphing.value, false)
      assert.equal(shell.classList.contains('persistent-sidebar--closed'), false)
    }
    finally {
      app.unmount()
      element.remove()
      window.matchMedia = originalMatchMedia
      applyMotionPreference(document.documentElement, preference)
      HTMLElement.prototype.animate = originalAnimate
    }
  })
  check('top bar: the logo keeps the rail content line on every page and the search docks after it, with no edge blur', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [header, logo, home] = await Promise.all([
      read('components/TopBar/components/TopBarHeader.vue'),
      read('components/TopBar/components/TopBarLogo.vue'),
      read('contentScripts/views/Home/Home.vue'),
    ])
    assert.doesNotMatch(logo, /translate:/, 'the icon never moves between rail and non-rail pages')
    assert.doesNotMatch(header, /ProgressiveBlur|translateX|ResizeObserver/, 'no top bar edge blur and no centring offset')
    assert.doesNotMatch(home, /home-search-stage__dock--docked|position: fixed/, 'no jump between centred and docked states')
  })
  check('search bar: focus keeps the pill and its material, with no page overlay or setting', async () => {
    const { existsSync } = await import('node:fs')
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [searchBar, storage, layoutEdit] = await Promise.all([
      read('components/SearchBar/SearchBar.vue'),
      read('logic/storage.ts'),
      read('logic/layoutEdit.ts'),
    ])
    for (const path of ['components/SearchFocusOverlay.vue', 'composables/useSearchFocusEffect.ts', 'utils/searchFocusEffect.ts'])
      assert.equal(existsSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url))), false, `${path} is removed`)
    assert.doesNotMatch(searchBar, /FocusOverlay|focus-overlay|OnFocus|--b-search-bar-focus-color|\.focus::after/)
    assert.doesNotMatch(searchBar, /&\.focus \{[^}]*--b-search-bar-current-radius/, 'focus never squares the pill')
    assert.doesNotMatch(storage, /disableSearchFocusEffect/)
    assert.doesNotMatch(layoutEdit, /search\.focus/)
  })
  check('top bar: no message button; pages, creating and the avatar are three glass groups mirroring the logo', async () => {
    const { existsSync } = await import('node:fs')
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [right, storage] = await Promise.all([
      read('components/TopBar/components/TopBarRight.vue'),
      read('logic/storage.ts'),
    ])
    for (const path of ['components/TopBar/components/pops/NotificationsPop.vue', 'components/TopBar/components/NotificationsDrawer.vue'])
      assert.equal(existsSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url))), false, `${path} is removed`)
    assert.doesNotMatch(right, /notifications|i-tabler:bell/i)
    assert.doesNotMatch(storage, /openNotificationsPageAsDrawer|key: 'notifications'/)
    assert.doesNotMatch(right, /shouldShowDivider/, 'groups are separate capsules, not a divider')
  })
  check('top bar: only playback removes the creation capsule, overflow entry and avatar from layout', async () => {
    const directory = fileURLToPath(new URL('../src/components/TopBar/', import.meta.url))
    const filename = join(directory, 'TopBar.vue')
    const { descriptor } = parse(await readFile(filename, 'utf8'))
    const compiled = await compileStyleAsync({ filename, source: descriptor.styles[0].content, id: 'data-v-msg', scoped: true, preprocessLang: 'scss', preprocessOptions: { loadPaths: [directory] } })
    assert.deepEqual(compiled.errors, [])
    const css = document.head.appendChild(document.createElement('style'))
    css.textContent = compiled.code
    const host = document.body.appendChild(document.createElement('div'))
    host.setAttribute('data-v-msg', '')
    host.innerHTML = '<div class="right-side"><div class="top-bar-tools"></div><div class="top-bar-tools top-bar-tools--wide-only" data-top-bar-creation><a></a><a></a></div><a class="more-pop__row" data-top-bar-creation></a><div class="avatar right-side-item"></div></div>'
    try {
      for (const playback of [false, true, false]) {
        host.className = playback ? 'top-bar top-bar--over-player' : 'top-bar'
        for (const entry of host.querySelectorAll('[data-top-bar-creation]'))
          assert.equal(getComputedStyle(entry).display === 'none', playback)
        assert.equal(getComputedStyle(host.querySelector('.avatar')).display === 'none', playback)
        assert.notEqual(getComputedStyle(host.querySelector('.top-bar-tools')).display, 'none')
      }
    }
    finally {
      host.remove()
      css.remove()
    }
  })
  check('top bar: the action for the page already open is hidden; the bar itself never hides', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [urls, storage] = await Promise.all([
      read('components/TopBar/constants/urls.ts'),
      read('logic/storage.ts'),
    ])
    const { FAVORITES_URL, HISTORY_URL } = await import('../src/components/TopBar/constants/urls')
    const { isBilibiliMomentsFeed, toBilibiliLogicalUrl } = await import('../src/utils/bilibiliLocale')
    assert.ok(isBilibiliMomentsFeed('https://t.bilibili.com/') && !isBilibiliMomentsFeed('https://t.bilibili.com/123'), 'a moment detail is not the feed')
    assert.ok(isBilibiliMomentsFeed('https://t.bilibili.com/zh-Hans/') && !isBilibiliMomentsFeed('https://t.bilibili.com/ja/123'))
    assert.ok(FAVORITES_URL.test('https://space.bilibili.com/1/favlist?fid=2') && !FAVORITES_URL.test('https://space.bilibili.com/1'))
    assert.ok(FAVORITES_URL.test(toBilibiliLogicalUrl('https://space.bilibili.com/ja/1/favlist?fid=2')))
    assert.ok(HISTORY_URL.test('https://www.bilibili.com/history') && HISTORY_URL.test('https://www.bilibili.com/account/history'))
    assert.ok(!urls.includes('MOMENTS_FEED_URL'), 'native feed detection has one shared locale-aware implementation')
    assert.doesNotMatch(storage, /autoHideTopBar|videoPageTopBarConfig/)
  })
  check('top bar: compiled capsule styles really collapse an entering or leaving slot', async () => {
    // A more specific resting width once beat `width: 0`, so only opacity animated
    // and the capsule jumped. Check the cascade on the actual compiled CSS.
    const filename = fileURLToPath(new URL('../src/components/TopBar/components/TopBarRight.vue', import.meta.url))
    const { descriptor } = parse(await readFile(filename, 'utf8'))
    const compiled = await compileStyleAsync({ filename, source: descriptor.styles[0].content, id: 'data-v-capsule', scoped: true, preprocessLang: 'scss', preprocessOptions: { loadPaths: [fileURLToPath(new URL('../src/components/TopBar/components', import.meta.url))] } })
    assert.deepEqual(compiled.errors, [])
    const css = document.head.appendChild(document.createElement('style'))
    css.textContent = compiled.code.replaceAll('var(--bew-control-height)', '36px')
    const host = document.body.appendChild(document.createElement('div'))
    host.innerHTML = ['entering top-bar-item-enter-active top-bar-item-enter-from', 'leaving top-bar-item-leave-active top-bar-item-leave-to', 'resting']
      .map(state => `<div class="right-side-item ${state}" data-v-capsule></div>`)
      .join('')
      .replace(/^/, '<div class="right-side" data-v-capsule><div class="top-bar-tools" data-v-capsule><div data-v-capsule>')
      .concat('</div></div></div>')
    try {
      const width = name => getComputedStyle(host.querySelector(`.${name}`)).width
      assert.equal(width('entering'), '0px', 'an entering slot starts closed')
      assert.equal(width('leaving'), '0px', 'a leaving slot ends closed')
      assert.equal(width('resting'), '36px')
    }
    finally {
      css.remove()
      host.remove()
    }
  })
  check('wheel steps: one shared stepper; the Dock moves one page per swipe or wheel gesture', async () => {
    const { createWheelStepper } = await import('../src/utils/wheelStep')
    const repeat = createWheelStepper()
    assert.equal(repeat.step(30, 0, 0), 0, 'below the step distance')
    assert.equal(repeat.step(30, 0, 10), 1)
    assert.equal(repeat.step(60, 0, 100), 0, 'cooldown inside one gesture')
    assert.equal(repeat.step(60, 0, 240), 1, 'a continuous gesture advances again')
    assert.equal(repeat.step(-60, 0, 250), -1, 'reversing starts a new gesture')
    assert.equal(repeat.step(3, 1, 600), 1, 'line deltas are normalised')
    const once = createWheelStepper({ oncePerGesture: true })
    let steps = 0
    for (let time = 0; time < 1500; time += 16)
      steps += Math.abs(once.step(20, 0, time))
    assert.equal(steps, 1, 'a long swipe with its momentum tail switches one page')
    assert.equal(once.step(60, 0, 1500 + 200), 1, 'a new gesture after a pause steps again')

    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const wheel = await read('components/WheelSelector.vue')
    assert.doesNotMatch(wheel, /wheelDistance|lastWheelCommitTime/, 'no second copy of the stepping rules')
  })
  check('top bar search never jumps between pages: rail shift glides, home and top bar boxes hand off', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const app = await read('contentScripts/views/App.vue')
    assert.doesNotMatch(app, /:deep\(\.top-bar-header\) \{\s*padding-inline-start/, 'no instant padding switch at page swap')

    const handoff = await import('../src/utils/searchHandoff')
    const originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    try {
      const rect = (left, top) => ({ getBoundingClientRect: () => ({ left, top }) })
      const runs = []
      const target = Object.assign(document.createElement('div'), { animate: (frames, options) => {
        const animation = { frames, options, finished: new Promise(() => {}), currentTime: 0, playbackRate: 1, effect: { getComputedTiming: () => ({ endTime: options.duration }) } }
        runs.push(animation)
        return animation
      } })
      target.getBoundingClientRect = () => ({ left: 70, top: 9 })
      handoff.departSearchFrom(rect(400, 180))
      handoff.arriveSearchAt(target)
      assert.equal(runs.length, 1)
      assert.equal(runs[0].frames[0].translate, '330px 171px', 'starts where the other box was')
      assert.equal(runs[0].options.composite, 'add', 'composes with the home dock\'s own translate')
      handoff.arriveSearchAt(target)
      assert.equal(runs.length, 1, 'a departure is consumed once')
    }
    finally {
      window.matchMedia = originalMatchMedia
    }
  })
  check('moment cards: no dividers, video-card hover scale, preview clears the cover fade, cover right-click menu, no cover stats', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [card, mediaStage, preview, ...parts] = await Promise.all([
      read('components/MomentCard/MomentCard.vue'),
      read('components/MomentCard/MomentMediaStage.vue'),
      read('components/MomentCard/MomentVideoPreview.vue'),
      read('components/MomentCard/MomentCommentSection.vue'),
      read('components/MomentCard/MomentCommentSkeleton.vue'),
      read('components/MomentCard/MomentForwardComposer.vue'),
      read('components/MomentCard/MomentCardSkeleton.vue'),
    ])
    // Spacing alone separates footer, comments, threads and the forward composer.
    for (const source of [card, ...parts])
      assert.doesNotMatch(source, /border-(?:top|bottom): var\(--bew-hairline(?:, 1px)?\) solid var\(--bew-separator-color\)/)
    assert.doesNotMatch(card, /moment-card--(?:comments|forward)-expanded:hover/)
    const [layout, disclosure] = await Promise.all([
      read('contentScripts/views/Moments/useMomentLayout.ts'),
      read('composables/useMeasuredDisclosure.ts'),
    ])
    // Layout reads ignore the hover scale; a rect would record a scaled height.
    for (const source of [layout, disclosure])
      assert.doesNotMatch(source, /getBoundingClientRect\(\)\.height/)
    assert.doesNotMatch(card, /contentCard\.surface|primary-action:active/)
    // The blur and the colour fade leave while the preview shows frames.
    // From the moment a preview starts (loading ring included), gently (300ms).
    assert.doesNotMatch(preview, /frameReady'/)
    // Right-click on every video or live cover opens the shared video card menu.
    const template = card.slice(card.indexOf('<template>'), card.indexOf('<style'))
    assert.equal(template.match(/@contextmenu="openCoverMenu"/g)?.length, 1, 'coverless text cover')
    assert.equal(template.match(/@cover-menu="openCoverMenu"/g)?.length, 2, 'top cover and quoted video or live cover')
    // Covers carry no stats, duration, watch-later button or charge badge; LIVE stays.
    assert.doesNotMatch(card, /moment-card__watch-later|moment-card__video-stats|moment-card__video-stat-group/)
    assert.doesNotMatch(mediaStage, /charge-badge|videoPlay|videoDanmaku|i-tabler-player-play/)
  })
  check('moment cards: image posts crossfade one top image with a thumbnail strip; long text animates; portrait media is marked', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const card = await read('components/MomentCard/MomentCard.vue')
    const mediaStage = await read('components/MomentCard/MomentMediaStage.vue')
    assert.doesNotMatch(card, /class="moment-card__gallery"|\.moment-card__gallery \{|wide-single-image|moment-card__gallery-item/)
    assert.doesNotMatch(card + mediaStage, /is-fading-in|is-previous|moment-card-image-in|previousImage|imageSwitched/)
    const { createSideSwipe } = await import('../src/utils/sideSwipe')
    const { loadSourceFunctions } = await import('./sourceFunctionHarness.ts')
    const steps = []
    const swipe = createSideSwipe(direction => steps.push(direction))
    for (const options of [{ deltaY: 60 }, { deltaX: 60, ctrlKey: true }]) {
      const event = new window.WheelEvent('wheel', { cancelable: true, ...options })
      swipe.wheel(event)
      assert.equal(event.defaultPrevented, false)
    }
    assert.deepEqual(steps, [])
    const sideways = new window.WheelEvent('wheel', { deltaX: 60, cancelable: true })
    swipe.wheel(sideways)
    assert.equal(sideways.defaultPrevented, true)
    assert.deepEqual(steps, [1])
    swipe.wheel(new window.WheelEvent('wheel', { deltaX: 60, cancelable: true }))
    assert.deepEqual(steps, [1], 'an inertial tail cannot step again')
    const touch = (type, x, y = 0) => Object.assign(new window.Event(type), { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y })
    swipe.pointerdown(touch('pointerdown', 200))
    swipe.pointerup(touch('pointerup', 100))
    assert.deepEqual(steps, [1, 1], 'a leftward touch swipe moves to the next')
    assert.equal(swipe.consumeClick(), true, 'the click a swipe ends in is swallowed once')
    assert.equal(swipe.consumeClick(), false)
    const thumbs = await loadSourceFunctions('../src/components/MomentCard/MomentMediaStage.vue', ['handleThumbWheel'], {
      thumbElastic: { handleWheel: event => assert.equal(event.defaultPrevented, false, 'the elastic owner decides whether to consume the thumbnail event') },
    })
    thumbs.handleThumbWheel(new window.WheelEvent('wheel', { deltaX: 60, cancelable: true }))
    // A toned card's composer stays frosted: the glass tint keeps the global
    // glass opacity instead of the opaque tone.
    assert.doesNotMatch(card, /moment-card__forward-(?:reference|video|gallery|copy)|forward-video-stats/)
    assert.doesNotMatch(card, /holdAnimation/, 'nothing else waits on the card')
  })
  check('moment cards: every new state change animates, each branch run (crossfade layers, picture reveal, tone, blur mount)', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [card, lazyPicture] = await Promise.all([
      read('components/MomentCard/MomentCard.vue'),
      read('components/LazyPicture.vue'),
    ])
    const { getCrossfadeDuration, showCrossfadeLayer } = await import('../src/utils/crossfadeLayers.ts')
    const { getMotionDuration } = await import('../src/utils/motionTiming.ts')
    const { loadSourceFunctions } = await import('./sourceFunctionHarness.ts')

    // Pure stacking: every branch of showCrossfadeLayer and the duration.
    assert.deepEqual(showCrossfadeLayer([], 0, 0), { layers: [0], fades: [{ index: 0, to: 1 }] }, 'first image: nothing drawn yet, fade it in')
    assert.equal(showCrossfadeLayer([0], 0, 0), null, 'already shown: no fade')
    assert.deepEqual(showCrossfadeLayer([0], 0, 1), { layers: [0, 1], fades: [{ index: 1, to: 1 }] }, 'new image goes on top')
    assert.deepEqual(showCrossfadeLayer([0, 1, 2], 2, 0), { layers: [0, 1, 2], fades: [{ index: 0, to: 1 }, { index: 1, to: 0 }, { index: 2, to: 0 }] }, 'back to a drawn image: everything above fades out')
    assert.deepEqual(showCrossfadeLayer([0, 1], 0, 1), { layers: [0, 1], fades: [{ index: 1, to: 1 }] }, 'top layer fading out turns around')
    assert.equal(getCrossfadeDuration(300, 0, 1), 300)
    assert.equal(getCrossfadeDuration(300, 0.6, 0), 180, 'only the opacity still to travel')
    assert.equal(getCrossfadeDuration(300, 1, 1), 0, 'already there: instant')
    assert.equal(getCrossfadeDuration(300, -1, 1), 300, 'never longer than a full fade')

    // The card's own fade and settle functions, with a scripted animation clock.
    const animations = []
    let reduced = false
    const element = index => ({
      drawn: 0,
      animate(keyframes, options) {
        let resolve
        let reject
        const animation = {
          index,
          keyframes,
          options,
          playState: 'running',
          finished: new Promise((res, rej) => {
            resolve = res
            reject = rej
          }),
          finish() {
            this.playState = 'finished'
            resolve(this)
          },
          cancel() {
            if (this.playState === 'running')
              reject(new Error('cancelled'))
            this.playState = 'idle'
          },
        }
        animation.finished.catch(() => {})
        animations.push(animation)
        return animation
      },
    })
    const buttons = [0, 1, 2, 3].map(element)
    const ticks = () => new Promise(resolve => setTimeout(resolve, 0))
    const context = await loadSourceFunctions('../src/components/MomentCard/MomentMediaStage.vue', ['showImage', 'fadeImageLayer', 'settleImageLayers'], {
      imageLayers: { value: [] },
      prefersReducedMotion: () => reduced,
      shownImage: { value: 0 },
      imageFades: new Map(),
      imageButtons: buttons,
      showCrossfadeLayer,
      getCrossfadeDuration,
      getMotionDuration,
      nextTick: () => Promise.resolve(),
      window: { matchMedia: () => ({ get matches() {
        return reduced
      } }) },
      getComputedStyle: target => ({
        opacity: String(target.drawn),
        getPropertyValue: name => ({ '--bew-duration-moderate': '300ms', '--bew-ease-standard': 'cubic-bezier(0.2, 0, 0, 1)' })[name] ?? '',
      }),
    })
    const plain = value => JSON.parse(JSON.stringify(value)) // vm objects come from another realm
    const last = index => animations.findLast(animation => animation.index === index)
    const settle = async (...indexes) => {
      indexes.forEach(index => last(index).finish())
      await ticks()
    }
    // First load: image 0 fades in from 0 over the full time, registered.
    context.showImage(0)
    assert.deepEqual(plain(context.imageLayers.value), [0])
    assert.deepEqual(plain(last(0).keyframes), [{ opacity: 0 }, { opacity: 1 }])
    assert.equal(last(0).options.duration, 300)
    assert.equal(last(0).options.easing, 'cubic-bezier(0.2, 0, 0, 1)')
    assert.equal(last(0).options.fill, 'forwards')
    context.showImage(0)
    assert.equal(animations.length, 1, 'showing the shown image again starts nothing')
    await settle(0)
    assert.deepEqual(plain(context.imageLayers.value), [0])
    assert.equal(last(0).playState, 'idle', 'fills drop once the classes hold the end state')
    buttons[0].drawn = 1
    // Quick forward switches: each new image fades over the one still fading.
    context.showImage(1)
    buttons[1].drawn = 0.4
    context.showImage(2)
    assert.deepEqual(plain(context.imageLayers.value), [0, 1, 2])
    assert.equal(last(1).playState, 'running', 'the image beneath keeps fading in, no jump')
    await settle(1)
    assert.deepEqual(plain(context.imageLayers.value), [0, 1, 2], 'nothing settles while a fade runs')
    await settle(2)
    assert.deepEqual(plain(context.imageLayers.value), [2])
    assert.equal(context.shownImage.value, 2)
    Object.assign(buttons[0], { drawn: 0 })
    Object.assign(buttons[1], { drawn: 0 })
    buttons[2].drawn = 1
    // Switching back mid-fade: the top image fades out from where it is drawn.
    context.showImage(3)
    const fadingIn = last(3)
    buttons[3].drawn = 0.6
    context.showImage(2)
    assert.equal(fadingIn.playState, 'idle', 'the interrupted fade is replaced')
    assert.deepEqual(plain(last(3).keyframes), [{ opacity: 0.6 }, { opacity: 0 }])
    assert.equal(last(3).options.duration, 180)
    assert.equal(last(2).options.duration, 0, 'the image beneath is already opaque')
    assert.deepEqual(plain(context.imageLayers.value), [2, 3], 'the leaving image stays drawn until it is gone')
    // And forward again before it has gone: it turns around once more.
    buttons[3].drawn = 0.3
    context.showImage(3)
    assert.deepEqual(plain(last(3).keyframes), [{ opacity: 0.3 }, { opacity: 1 }])
    assert.equal(last(3).options.duration, 210)
    await settle(2, 3)
    assert.deepEqual(plain(context.imageLayers.value), [3])
    // Reduced motion: the same path, at once.
    reduced = true
    buttons[3].drawn = 1
    context.showImage(0)
    assert.equal(last(0).options.duration, 0)
    await settle(0)
    assert.deepEqual(plain(context.imageLayers.value), [0])

    // Pictures fade in as they load (cover, thumbnails, first top image), and
    // appear at once when loaded before; LazyPicture shares the same memory.
    const memory = await import('../src/utils/pictureRevealMemory.ts')
    assert.equal(memory.hasLoadedPicture(''), false)
    assert.equal(memory.hasLoadedPicture('a'), false)
    memory.rememberLoadedPicture('')
    memory.rememberLoadedPicture('a')
    assert.equal(memory.hasLoadedPicture('a'), true)
    for (let index = 0; index < 240; index++)
      memory.rememberLoadedPicture(`fill-${index}`)
    assert.equal(memory.hasLoadedPicture('a'), false, 'the oldest is forgotten past the limit')
    memory.rememberLoadedPicture('b')
    memory.forgetLoadedPicture('')
    memory.forgetLoadedPicture('b')
    assert.equal(memory.hasLoadedPicture('b'), false)
    assert.doesNotMatch(lazyPicture, /const loadedPictureSources/)
    const scrolls = []
    const strip = { scrollLeft: 0, clientWidth: 100, querySelectorAll: () => [{ offsetLeft: 120, offsetWidth: 20 }], scrollTo: value => scrolls.push(value) }
    const thumbReveal = await loadSourceFunctions('../src/components/MomentCard/MomentMediaStage.vue', ['revealThumb'], {
      thumbScrollerRef: { value: strip },
      prefersReducedMotion: () => reduced,
    })
    reduced = false
    thumbReveal.revealThumb(0)
    reduced = true
    thumbReveal.revealThumb(0)
    assert.deepEqual(scrolls.map(value => ({ ...value })), [{ left: 40, behavior: 'smooth' }, { left: 40, behavior: 'auto' }])

    assert.doesNotMatch(card, /moment-card--toned|background-color var\(--bew-duration-moderate\)/)
    const tone = await import('../src/utils/imageTone.ts')
    assert.equal(tone.peekImageBandTone('u', 0.85, 1), undefined, 'not read yet')
    assert.equal(await tone.readImageBandTone('u', 0.85, 1), null, 'no image in this runtime: no tone')
    assert.equal(tone.peekImageBandTone('u', 0.85, 1), null, 'settled reads are known at once')
    assert.equal(tone.peekImageBandTone('u', 0.85, 1, 'columns'), undefined, 'a side band (the hero cover\'s left edge) is its own read')
    for (let index = 0; index < 200; index++)
      await tone.readImageBandTone(`fill-${index}`, 0, 1)
    assert.equal(tone.peekImageBandTone('u', 0.85, 1), undefined, 'evicted with its promise')
    const previousCss = globalThis.CSS
    try {
      tone.registerToneProperties()
      const registered = []
      globalThis.CSS = { registerProperty() {
        throw new TypeError('bad')
      } }
      assert.throws(() => tone.registerToneProperties(), TypeError, 'unexpected errors surface')
      globalThis.CSS = { registerProperty(definition) {
        registered.push(definition)
        throw new DOMException('exists', 'InvalidModificationError')
      } }
      tone.registerToneProperties()
      assert.deepEqual(registered.map(({ name, syntax, inherits }) => [name, syntax, inherits]), [['--moment-tone', '<color>', true], ['--moment-tone-fg', '<color>', true]], 'already registered by a previous script: fine')
      tone.registerToneProperties()
      assert.equal(registered.length, 2, 'once per document')
    }
    finally {
      globalThis.CSS = previousCss
    }
  })
  check('radius: one 16px-anchored scale; components use role tokens, never steps, retired names or literals', async () => {
    const { findRadiusViolations } = await import('./radiusPolicy')
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const variables = await read('styles/variables.scss')
    const tokens = Object.fromEntries([...variables.matchAll(/^ {2}(--bew-[\w-]*radius[\w-]*): ([^;]+);/gm)].map(match => [match[1], match[2]]))
    assert.equal(tokens['--bew-media-radius'], 'var(--bew-radius-lg)', 'the video cover anchor')
    // Steps scale by display through ui() (utils/uiScale.ts); the 14-inch design values stay the anchor.
    assert.equal(tokens['--bew-radius-lg'], '#{ui(16px)}')
    assert.equal(tokens['--bew-surface-radius'], 'var(--bew-radius-lg)', 'cards, panels and popovers')
    assert.deepEqual(['xs', 'sm', 'md', 'lg', 'xl', '2xl'].map(step => tokens[`--bew-radius-${step}`]), ['4px', '8px', '12px', '16px', '24px', '32px'].map(value => `#{ui(${value})}`))
    const files = await listStylePolicyFiles()
    assert.deepEqual(await findRadiusViolations(files), [])
  })
  check('lines: three roles (separator, edge, field); separators and edges are hairlines; dark edges carry the layering', async () => {
    const { spawnSync } = await import('node:child_process')
    const { findBorderViolations } = await import('./borderPolicy')
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const variables = await read('styles/variables.scss')
    const light = variables.slice(0, variables.indexOf(':root.dark {'))
    const dark = variables.slice(variables.indexOf(':root.dark {'))
    const amount = (css, token) => Number(new RegExp(`${token}: color-mix\\(\\s*in srgb,\\s*var\\(--bew-neutral-fg\\) calc\\(([\\d.]+)%`).exec(css)?.[1])
    assert.deepEqual(['--bew-separator-color', '--bew-edge-color', '--bew-field-edge-color', '--bew-field-edge-color-hover'].map(token => amount(light, token)), [12, 14, 18, 20.5])
    assert.deepEqual(['--bew-separator-color', '--bew-edge-color', '--bew-field-edge-color', '--bew-field-edge-color-hover'].map(token => amount(dark, token)), [12, 16, 18, 20.5])
    assert.doesNotMatch(await read('components/TopBar/components/TopBarLogo.vue'), /\.logo-circle \{[^}]*border: var\(--bew-hairline\)/, 'so does the circle it folds into (from sidebarSurface.floating)')
    const searchBar = await read('components/SearchBar/SearchBar.vue')
    assert.doesNotMatch(searchBar, /border-hairline|border-\$bew-edge-color/, 'no ordinary edge competes with the rim')
    assert.doesNotMatch(await read('components/TopBar/styles/index.scss'), /:deep\(\.search-bar\)/, 'the top bar does not repaint the search rim or shadow')
    assert.equal((await read('components/Dock/Dock.vue')).match(/--dock-surface-shadow: var\(--bew-glass-shadow\);/g)?.length, 2, 'and the Dock')
    const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: fileURLToPath(new URL('..', import.meta.url)) })
      .stdout
      .toString()
      .trim()
      .split('\n')
      .filter(file => /\.(?:vue|scss|css|ts)$/.test(file))
      .map(file => fileURLToPath(new URL(`../${file}`, import.meta.url)))
      .filter(file => existsSync(file))
    assert.deepEqual(await findBorderViolations(files), [])
  })
  check('moments reading buttons: floating glass pills under hot search; jump returns to the last card worked with; latest glides up then reloads', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const page = await read('contentScripts/views/Moments/Moments.vue')
    const buttons = await read('contentScripts/views/Moments/MomentsReadingActions.vue')
    assert.doesNotMatch(page, /class="moments-reading-actions"/, 'no button row above the feed')
    assert.doesNotMatch(page, /returnPoint|jumpTarget|'boundary'/, 'no reading-position return point')
    assert.doesNotMatch(buttons, /TransitionGroup|-move \{|transition:[^;]*grid-template-columns/, 'no FLIP or column transition: both lay out while the feed scrolls')
    assert.doesNotMatch(buttons, /holdAnimation/, 'nothing waits on the buttons')
  })
  check('moments rail: search with a type/time filter menu; profile and live list flat on the rail', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const sidebar = await read('contentScripts/views/Moments/MomentsSidebar.vue')
    const live = await read('contentScripts/views/Moments/MomentsLiveRow.vue')
    const { matchesMomentSearch, getMomentSearchCutoff, isMomentSearchActive, EMPTY_MOMENT_SEARCH } = await import('../src/contentScripts/views/Moments/momentSearch')
    const now = Date.UTC(2026, 9, 25)
    const post = { isForward: false, isVideo: false, isPgc: false, isLive: false, isArticle: false, publishedAt: now / 1000 - 3 * 86_400 }
    const text = () => 'Hello Bilibili World'
    assert.equal(isMomentSearchActive(EMPTY_MOMENT_SEARCH), false)
    assert.equal(matchesMomentSearch(post, { ...EMPTY_MOMENT_SEARCH, keyword: 'world  hello' }, text, 0), true, 'every word, any order, any case')
    assert.equal(matchesMomentSearch(post, { ...EMPTY_MOMENT_SEARCH, keyword: 'world missing' }, text, 0), false)
    const kinds = moment => ['original', 'forward', 'video', 'draw', 'live', 'article'].filter(kind => matchesMomentSearch(moment, { ...EMPTY_MOMENT_SEARCH, kind }, text, 0))
    assert.deepEqual(kinds(post), ['original', 'draw'], 'an original text post is text and images')
    assert.deepEqual(kinds({ ...post, isVideo: true }), ['original', 'video'])
    assert.deepEqual(kinds({ ...post, isPgc: true }), ['original', 'video'], 'series count as video')
    assert.deepEqual(kinds({ ...post, isLive: true }), ['original', 'live'])
    assert.deepEqual(kinds({ ...post, isArticle: true }), ['original', 'article'])
    assert.deepEqual(kinds({ ...post, isForward: true, isLive: true }), ['forward'], 'a repost is only a repost, whatever it quotes')
    const week = { ...EMPTY_MOMENT_SEARCH, time: 'week' }
    const day = { ...EMPTY_MOMENT_SEARCH, time: 'day' }
    assert.equal(matchesMomentSearch(post, week, text, getMomentSearchCutoff(week, now)), true)
    assert.equal(matchesMomentSearch(post, day, text, getMomentSearchCutoff(day, now)), false)
    assert.doesNotMatch(sidebar, /moments-sidebar__card|--bew-message-pinned-background/, 'no module backgrounds')
    assert.doesNotMatch(live, /LoadingRing|moments-live-row__pending|--bew-content-solid/, 'no second placeholder ring or surface')
  })
  check('capsules use the shared full radius and rail rows use the interactive radius', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
    assert.match(await read('unocss.config.ts'), /hasSmoothRadius \? 'var\(--bew-corner-shape\)' : hasCircleRadius \? 'var\(--bew-corner-shape-round\)' : 'var\(--bew-corner-shape-capsule\)'/, 'full-radius utilities are capsules; only 50% is round')
  })
  check('loading: a load of unknown count shows only the ring in the middle, never skeletons or progress text', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [indicator, favorites, watchLater] = await Promise.all([
      read('components/PageLoadingIndicator.vue'),
      read('contentScripts/views/Favorites/FavoritesPage.vue'),
      read('contentScripts/views/WatchLater/WatchLater.vue'),
    ])
    assert.doesNotMatch(indicator, /__label/, 'the tail ring has no visible text')
    assert.doesNotMatch(favorites, /filter_status|favorite-filter-status|filterScan\.pause/)
    assert.doesNotMatch(watchLater, /watch-later-no-matches/, 'no matches sit under the head, not in place of the page')
  })
  check('every static translation key used in src exists in all four locales', async () => {
    const { spawnSync } = await import('node:child_process')
    const { parse } = await import('yaml')
    const root = fileURLToPath(new URL('..', import.meta.url))
    const locales = Object.fromEntries(await Promise.all(['cmn-CN', 'cmn-TW', 'jyut', 'en'].map(async locale => [locale, parse(await readFile(`${root}src/_locales/${locale}.yml`, 'utf8'))])))
    const has = (messages, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages) !== undefined
    const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: root }).stdout.toString().trim().split('\n').filter(file => /\.(?:vue|ts)$/.test(file) && existsSync(`${root}${file}`))
    const missing = []
    for (const file of files) {
      const text = await readFile(`${root}${file}`, 'utf8')
      for (const [, key] of text.matchAll(/(?<![\w.])(?:\$t|t|tc)\(\s*'([a-z_][\w-]*(?:\.[\w-]+)+)'/g)) {
        for (const [locale, messages] of Object.entries(locales)) {
          if (!has(messages, key))
            missing.push(`${key} (${locale}) in ${file}`)
        }
      }
    }
    assert.deepEqual(missing, [])
  })
  check('type: every text is regular weight; emphasis is tone and size only', async () => {
    const { spawnSync } = await import('node:child_process')
    const { findFontWeightViolations } = await import('./fontWeightPolicy')
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const variables = await read('styles/variables.scss')
    assert.deepEqual([...variables.matchAll(/^ {2}--bew-font-weight-(\w+):/gm)].map(match => match[1]), ['regular'])
    const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: fileURLToPath(new URL('..', import.meta.url)) })
      .stdout
      .toString()
      .trim()
      .split('\n')
      .filter(file => /\.(?:vue|scss|css|ts)$/.test(file))
      .map(file => fileURLToPath(new URL(`../${file}`, import.meta.url)))
      .filter(file => existsSync(file))
      .filter(file => existsSync(file))
    assert.deepEqual(await findFontWeightViolations(files), [])
  })
  check('truncated text: the end fades right to left (scroll-driven, only while overflowing); no ellipsis or line clamp', async () => {
    const { findTruncationViolations } = await import('./truncationPolicy')
    const files = await listStylePolicyFiles()
    assert.deepEqual(await findTruncationViolations(files), [])
  })
  check('glass: one material (tint, opacity, blur, edge) for every glass surface; dark glass is tinted lower', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const variables = await read('styles/variables.scss')
    // Dark glass over pure black reads #20211f (user-specified): tint × opacity.
    const compiled = await compileStyleAsync({ source: variables, filename: fileURLToPath(new URL('../src/styles/variables.scss', import.meta.url)), id: 'glass-policy', preprocessLang: 'scss' })
    assert.deepEqual(compiled.errors, [])
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = compiled.code
    try {
      const defaults = {}
      const dark = {}
      for (const rule of style.sheet.cssRules) {
        const selectors = rule.selectorText?.split(',').map(selector => selector.trim()) ?? []
        const target = selectors.includes(':root.dark') ? dark : selectors.includes(':root') ? defaults : undefined
        if (!target)
          continue
        for (const key of ['--bew-glass-tint-solid', '--bew-glass-opacity']) {
          const value = rule.style.getPropertyValue(key)
          if (value)
            target[key] = value
        }
      }
      const values = { ...defaults, ...dark }
      const channels = values['--bew-glass-tint-solid'].match(/[\d.]+/g).map(Number)
      assert.deepEqual(channels.map(channel => Math.round(channel * Number(values['--bew-glass-opacity']))), [0x20, 0x21, 0x1F])
    }
    finally { style.remove() }
    for (const alias of ['--bew-sidebar-background: var(--bew-glass-tint);', '--bew-popover-surface-background: var(--bew-glass-tint);'])
      assert.ok(variables.includes(alias), alias)
    const sources = await Promise.all((await listStylePolicyFiles()).map(async file => ({ file, source: await readFile(file, 'utf8') })))
    assert.deepEqual(sources.filter(({ source }) => source.includes('filter-glass-2')).map(({ file }) => file), [], 'dialogs use the same blur')
  })
  check('rail wheel selector is a ring: past the first comes the last and past the last the first', async () => {
    const Wheel = await compileComponent('../src/components/WheelSelector.vue', { vue: Vue })
    const value = Vue.ref('a')
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Wheel, {
      modelValue: value.value,
      label: 'Category',
      panelId: 'panel',
      items: ['a', 'b', 'c'].map(value => ({ value, label: value, ariaLabel: value })),
      'onUpdate:modelValue': next => value.value = next,
    }) })
    try {
      app.mount(host)
      await flush()
      const tabs = [...host.querySelectorAll('[role="tab"]')]
      const translate = tab => tab.style.transform.match(/translateY\(calc\(([-\d.e]+) \*/)[1]
      assert.ok(Number(translate(tabs[2])) < 0, 'the last item waits above the first')
      assert.equal(tabs[2].style.pointerEvents, '', 'and can be clicked there')
      const wheel = async (deltaY, timeStamp) => {
        const event = new window.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
        Object.defineProperty(event, 'timeStamp', { value: timeStamp })
        host.querySelector('.wheel-selector').dispatchEvent(event)
        await flush()
        return event
      }
      assert.ok((await wheel(-60, 1000)).defaultPrevented, 'the first item still takes an upward wheel')
      assert.equal(value.value, 'c')
      assert.equal(tabs[2].tabIndex, 0)
      await wheel(60, 2000)
      assert.equal(value.value, 'a', 'down from the last returns to the first')
      tabs[0].focus()
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(document.activeElement, tabs[2], 'arrow keys wrap the same way')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('moments up-list: no container, cover-height square tiles, scrolls under the rail glass and stops elastically at the avatar edge', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [moments, layout] = await Promise.all([
      read('contentScripts/views/Moments/Moments.vue'),
      read('contentScripts/views/Moments/MomentsContentLayout.vue'),
    ])
    // Above the content layout, so hot search sits below it.
    assert.ok(moments.indexOf('class="moments-up-list"') < moments.indexOf('<MomentsContentLayout'))
    assert.doesNotMatch(layout, /moments-up-list/)
    assert.doesNotMatch(moments, /moments-up-list__fade|moments-up-list__start|-mask-image/)
    // The strip mechanics are shared with the library pages (bleedStrip.scss).
    const strip = await read('styles/bleedStrip.scss')
    assert.doesNotMatch(strip, /z-index:/)
    // The page-level loading skeleton places the bar and the feed the same way.
    const asyncLoading = await read('components/PageAsyncLoading.vue')
    assert.ok(asyncLoading.indexOf('class="bew-page-async-loading__moments-users"') < asyncLoading.indexOf('<MomentsContentLayout'))

    // Its sideways position is remembered: every branch of the save / restore.
    const { loadSourceFunctions } = await import('./sourceFunctionHarness.ts')
    const memory = await loadSourceFunctions('../src/contentScripts/views/Moments/Moments.vue', ['updateUpListScrollState'], {
      upListScrollerRef: { value: null },
      canScrollUpListLeft: { value: true },
      canScrollUpListRight: { value: true },
      upListScrollLeft: { value: 0 },
      upListRestorePending: false,
      isPortalLoading: { value: false },
      resolveHorizontalScrollState: ({ scrollLeft, scrollWidth, clientWidth }) => ({ canScrollLeft: scrollLeft > 0, canScrollRight: scrollLeft < scrollWidth - clientWidth }),
    })
    memory.updateUpListScrollState()
    assert.equal(memory.canScrollUpListLeft.value, false, 'no bar: nothing to scroll')
    const bar = { scrollLeft: 120, scrollWidth: 1000, clientWidth: 400 }
    memory.upListScrollerRef.value = bar
    memory.updateUpListScrollState()
    assert.equal(memory.upListScrollLeft.value, 120, 'scrolling saves the position')
    memory.upListScrollLeft.value = 900
    memory.upListRestorePending = true
    memory.isPortalLoading.value = true
    bar.scrollLeft = 0
    memory.updateUpListScrollState()
    assert.equal(bar.scrollLeft, 0, 'a row still loading and too short waits')
    assert.equal(memory.upListRestorePending, true)
    memory.isPortalLoading.value = false
    memory.updateUpListScrollState()
    assert.equal(bar.scrollLeft, 600, 'a shorter row ends at its end')
    assert.equal(memory.upListRestorePending, false)
    memory.upListScrollLeft.value = 300
    memory.upListRestorePending = true
    memory.isPortalLoading.value = true
    memory.updateUpListScrollState()
    assert.equal(bar.scrollLeft, 300, 'a long enough row returns at once, even while loading')
    assert.equal(memory.upListScrollLeft.value, 300, 'restoring does not overwrite the memory')

    const { createElasticWheelScroll, rubberBand } = await import('../src/utils/elasticScroll')
    const originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    try {
      const scroller = document.createElement('div')
      Object.defineProperties(scroller, { scrollWidth: { value: 1000 }, clientWidth: { value: 400 } })
      scroller.scrollLeft = 0
      const track = document.createElement('div')
      const runs = []
      track.animate = (frames, options) => {
        const animation = { frames, options, playState: 'running', cancel() {}, finished: new Promise(() => {}), currentTime: 0, playbackRate: 1, effect: { getComputedTiming: () => ({ endTime: 300 }) } }
        runs.push(animation)
        return animation
      }
      const elastic = createElasticWheelScroll(scroller, track)
      const wheel = (deltaX, deltaY = 0) => {
        const event = { deltaX, deltaY, deltaMode: 0, defaultPrevented: false }
        event.preventDefault = () => {
          event.defaultPrevented = true
        }
        elastic.handleWheel(event)
        return event
      }
      assert.ok(wheel(0, 250).defaultPrevented, 'vertical wheels scroll the row')
      assert.equal(scroller.scrollLeft, 250)
      wheel(450)
      assert.equal(scroller.scrollLeft, 600, 'stops at the end')
      assert.equal(track.style.translate, `${-rubberBand(100)}px 0`, 'the rest stretches with resistance')
      assert.ok(rubberBand(100) < 100 && rubberBand(10000) < 160)
      wheel(-60)
      assert.equal(scroller.scrollLeft, 600, 'moving back undoes the stretch first')
      assert.equal(track.style.translate, `${-rubberBand(40)}px 0`)
      await new Promise(resolve => setTimeout(resolve, 140))
      assert.equal(track.style.translate, '', 'springs back once the input pauses')
      assert.equal(runs.length, 1)
      assert.equal(runs[0].frames[0].translate, `${-rubberBand(40)}px 0`)
      assert.equal(runs[0].frames[1].translate, '0 0')
      wheel(-700)
      assert.equal(scroller.scrollLeft, 0)
      assert.equal(track.style.translate, `${rubberBand(100)}px 0`, 'stretches past the start too')
      elastic.dispose()
      assert.equal(track.style.translate, '')
    }
    finally {
      window.matchMedia = originalMatchMedia
    }
  })
}
