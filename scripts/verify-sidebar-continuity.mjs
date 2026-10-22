import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync, parse } from 'vue/compiler-sfc'

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
      assert.match(source, /'bew-sidebar-hosted': sidebarHost/)
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
    const { getMotionRemaining } = await import('../src/utils/motionPriority')
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
    const originalAnimate = HTMLElement.prototype.animate
    window.matchMedia = () => ({ matches: reduce.value })
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
      assert.ok(getMotionRemaining() > 0, 'page content waits for the fold')
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
      HTMLElement.prototype.animate = originalAnimate
    }
  })
  check('top bar: the logo keeps the rail content line on every page and the search docks after it, with no edge blur', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [variables, header, logo, home, app] = await Promise.all([
      read('styles/variables.scss'),
      read('components/TopBar/components/TopBarHeader.vue'),
      read('components/TopBar/components/TopBarLogo.vue'),
      read('contentScripts/views/Home/Home.vue'),
      read('contentScripts/views/App.vue'),
    ])
    assert.match(variables, /--bew-home-logo-inline-start: calc\(\s*var\(--bew-sidebar-inline-padding\) \+ var\(--bew-sidebar-label-inset\)/, 'the circle sits where the icon sits on the rail')
    assert.match(logo, /left: var\(--bew-home-logo-inline-start\);/)
    assert.doesNotMatch(logo, /translate:/, 'the icon never moves between rail and non-rail pages')
    assert.doesNotMatch(header, /ProgressiveBlur|translateX|ResizeObserver/, 'no top bar edge blur and no centring offset')
    assert.match(header, /padding-inline: var\(--bew-home-logo-inline-start\)/)
    assert.match(header, /grid-template-columns: auto minmax\(0, var\(--b-search-bar-max-width, 550px\)\)/, 'search column follows the logo')
    assert.match(app, /:deep\(\.top-bar-header\) \{\s*padding-inline-start: var\(--bew-messages-sidebar-width\);/, 'on rail pages the search follows the rail')
    // The dock follows the scroll: sticky first, then the next stretch of scrolling
    // carries it to the logo, on the page scroller's named timeline.
    assert.match(app, /scroll-timeline: --bew-page-scroll block;/)
    assert.match(home, /@supports \(animation-timeline: scroll\(\)\)[\s\S]*?animation-timeline: --bew-page-scroll;[\s\S]*?animation-range: var\(--bew-layout-home-search-stage-sticky-scroll-top\)\s+calc\(var\(--bew-layout-home-search-stage-sticky-scroll-top\) \+ var\(--bew-home-search-dock-travel\)\)/)
    assert.match(home, /translate: calc\(var\(--bew-home-search-dock-start\) - var\(--bew-home-search-left, 0px\)\) 0;/)
    assert.match(home, /'--bew-layout-home-search-stage-sticky-scroll-top': `\$\{searchStage\.value\.stickyScrollTop\}px`/)
    assert.match(home, /subscribeViewportFrame\(viewport, \(_geometry, reason\) => \{\s*if \(reason === 'layout'\)\s*measureSearchDock\(\)/, 'measured on layout frames only, never per scroll')
    assert.doesNotMatch(home, /home-search-stage__dock--docked|position: fixed/, 'no jump between centred and docked states')
  })
  check('search bar: focus keeps the pill and its material, with no page overlay or setting', async () => {
    const { existsSync } = await import('node:fs')
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [searchBar, storage, retired, layoutEdit] = await Promise.all([
      read('components/SearchBar/SearchBar.vue'),
      read('logic/storage.ts'),
      read('constants/retiredSettings.ts'),
      read('logic/layoutEdit.ts'),
    ])
    for (const path of ['components/SearchFocusOverlay.vue', 'composables/useSearchFocusEffect.ts', 'utils/searchFocusEffect.ts'])
      assert.equal(existsSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url))), false, `${path} is removed`)
    assert.doesNotMatch(searchBar, /FocusOverlay|focus-overlay|OnFocus|--b-search-bar-focus-color|\.focus::after/)
    assert.doesNotMatch(searchBar, /&\.focus \{[^}]*--b-search-bar-current-radius/, 'focus never squares the pill')
    assert.doesNotMatch(storage, /disableSearchFocusEffect/)
    assert.match(retired, /'disableSearchFocusEffect'/)
    assert.doesNotMatch(layoutEdit, /search\.focus/)
  })
  check('top bar: no message button; the right-hand tools share one glass capsule mirroring the logo', async () => {
    const { existsSync } = await import('node:fs')
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [right, styles, surface, logo, header, storage, retired] = await Promise.all([
      read('components/TopBar/components/TopBarRight.vue'),
      read('components/TopBar/styles/index.scss'),
      read('styles/sidebarSurface.scss'),
      read('components/TopBar/components/TopBarLogo.vue'),
      read('components/TopBar/components/TopBarHeader.vue'),
      read('logic/storage.ts'),
      read('constants/retiredSettings.ts'),
    ])
    for (const path of ['components/TopBar/components/pops/NotificationsPop.vue', 'components/TopBar/components/NotificationsDrawer.vue'])
      assert.equal(existsSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url))), false, `${path} is removed`)
    assert.doesNotMatch(right, /notifications|i-tabler:bell/i)
    assert.doesNotMatch(storage, /openNotificationsPageAsDrawer|key: 'notifications'/)
    assert.match(retired, /'openNotificationsPageAsDrawer'/)
    assert.match(right, /<div v-if="isLogin" class="top-bar-tools">[\s\S]*<\/div>\s*<!-- Avatar/, 'the avatar stays outside the capsule')
    assert.match(styles, /\.top-bar-tools \{[\s\S]*?height: var\(--bew-top-bar-primary-control-height\);[\s\S]*?&::before \{\s*@include sidebarSurface\.floating;/, 'glass on a layer behind the buttons, as tall as the logo circle')
    assert.match(logo, /\.logo-circle \{\s*@include sidebarSurface\.floating;/, 'one shared floating material for both sides')
    assert.match(surface, /@mixin floating \{/)
    assert.match(header, /padding-inline: var\(--bew-home-logo-inline-start\) var\(--bew-page-inline-inset\);/, 'avatar inset matches the page content inset')
  })
  check('top bar: the action for the page already open is hidden; the bar itself never hides', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [interaction, right, urls, storage, retired] = await Promise.all([
      read('components/TopBar/composables/useTopBarInteraction.ts'),
      read('components/TopBar/components/TopBarRight.vue'),
      read('components/TopBar/constants/urls.ts'),
      read('logic/storage.ts'),
      read('constants/retiredSettings.ts'),
    ])
    assert.match(interaction, /function isCurrentTopBarItemPage\(key: TopBarPopupKey\): boolean \{[\s\S]*?isHomePage\(url\) && activatedPage\?\.value === page[\s\S]*?NATIVE_PAGE_BY_TOP_BAR_ITEM\[key\]/, 'Bewly page or the native page counts')
    for (const key of ['moments', 'favorites', 'history', 'watchLater'])
      assert.match(right, new RegExp(`v-if="showPageItem\\('${key}'\\)"`), `${key} hides on its own page`)
    const { MOMENTS_FEED_URL, FAVORITES_URL, HISTORY_URL } = await import('../src/components/TopBar/constants/urls')
    assert.ok(MOMENTS_FEED_URL.test('https://t.bilibili.com/') && !MOMENTS_FEED_URL.test('https://t.bilibili.com/123'), 'a moment detail is not the feed')
    assert.ok(FAVORITES_URL.test('https://space.bilibili.com/1/favlist?fid=2') && !FAVORITES_URL.test('https://space.bilibili.com/1'))
    assert.ok(HISTORY_URL.test('https://www.bilibili.com/history') && HISTORY_URL.test('https://www.bilibili.com/account/history'))
    assert.ok(urls.includes('MOMENTS_FEED_URL'))
    assert.doesNotMatch(storage, /autoHideTopBar|videoPageTopBarConfig/)
    assert.match(retired, /'autoHideTopBar', 'videoPageTopBarConfig'/)
  })
  check('top bar: capsule items fade out, then resize together, then fade in', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [right, styles] = await Promise.all([
      read('components/TopBar/components/TopBarRight.vue'),
      read('components/TopBar/styles/index.scss'),
    ])
    const capsule = right.slice(right.indexOf('class="top-bar-tools"'), right.indexOf('<!-- Avatar'))
    for (const condition of [`showPageItem('moments')`, `showPageItem('favorites')`, `showPageItem('history')`, `showPageItem('watchLater')`, `isComponentVisible('creatorCenter')`, 'shouldShowDivider', `isComponentVisible('upload')`])
      assert.match(capsule, new RegExp(`<Transition name="top-bar-item"[^>]*>\\s*<div\\s+v-if="${condition.replace(/[()]/g, '\\$&')}"`), `${condition} uses the shared item transition`)
    // Leaving: fade, then resize. Entering: resize (after the fade-out phase), then fade in.
    assert.match(styles, /\.top-bar-item-leave-active \{\s*transition:\s*opacity var\(--top-bar-item-fade\)[^,]*,\s*width var\(--top-bar-item-resize\) var\(--bew-ease-in-out\) var\(--top-bar-item-fade\)/)
    assert.match(styles, /\.top-bar-item-enter-active \{\s*transition:\s*width var\(--top-bar-item-resize\) var\(--bew-ease-in-out\) var\(--top-bar-item-fade\),[\s\S]*?opacity var\(--top-bar-item-fade\) var\(--bew-ease-out\) calc\(var\(--top-bar-item-fade\) \+ var\(--top-bar-item-resize\)\)/)
    assert.match(styles, /\.top-bar-item-enter-from,\s*\.top-bar-item-leave-to \{\s*width: 0;[\s\S]*?opacity: 0;/)
    assert.match(styles, /prefers-reduced-motion: reduce\)[\s\S]*?\.top-bar-item-enter-active,[\s\S]*?transition: none;/)
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
    const [dock, wheel] = await Promise.all([read('components/Dock/Dock.vue'), read('components/WheelSelector.vue')])
    assert.match(wheel, /createWheelStepper\(\)/)
    assert.doesNotMatch(wheel, /wheelDistance|lastWheelCommitTime/, 'no second copy of the stepping rules')
    assert.match(dock, /createWheelStepper\(\{ oncePerGesture: true \}\)/)
    assert.match(dock, /class="dock-expanded-content"[\s\S]{0,200}@wheel="handleDockWheel"/, 'only the expanded Dock reacts')
    assert.match(dock, /Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\) \? event\.deltaX : event\.deltaY/, 'horizontal two-finger swipes and the vertical wheel')
    assert.match(dock, /event\.preventDefault\(\)[\s\S]{0,200}emit\('dockItemClick', next\)/)
  })
  check('motion order: new chrome animations claim priority before the incoming page mounts', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [app, rail, right] = await Promise.all([
      read('contentScripts/views/App.vue'),
      read('components/PersistentSidebar.vue'),
      read('components/TopBar/components/TopBarRight.vue'),
    ])
    assert.match(app, /<PersistentSidebar :active="showBewlyPage && RAIL_PAGES\.includes\(activatedPage\)" \/>/, 'the destination page drives the rail, not the page still displayed')
    assert.match(rail, /watch\(\(\) => props\.active, open => void morph\(open\), \{ flush: 'sync' \}\)/)
    const morph = rail.slice(rail.indexOf('async function morph'), rail.indexOf('host.railOpen.value = props.active'))
    assert.ok(morph.indexOf('holdMotion(duration)') > 0 && morph.indexOf('holdMotion(duration)') < morph.indexOf('await nextTick()'), 'the hold exists before the first await')
    assert.equal((right.match(/<Transition name="top-bar-item" @before-enter="holdItemMotion\(\$event, true\)" @before-leave="holdItemMotion\(\$event, false\)">/g) || []).length, 7)
    assert.match(right, /holdMotion\(entering \? fade \* 2 \+ resize : fade \+ resize\)/)
  })
  check('top bar: the avatar circle nudges on hover, opens its panel on click and travels into the panel', async () => {
    const read = path => readFile(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8')
    const [right, styles, panel, floating, interaction, topBar] = await Promise.all([
      read('components/TopBar/components/TopBarRight.vue'),
      read('components/TopBar/styles/index.scss'),
      read('components/TopBar/components/pops/UserPanelPop.vue'),
      read('utils/floatingMenu.ts'),
      read('components/TopBar/composables/useTopBarInteraction.ts'),
      read('components/TopBar/TopBar.vue'),
    ])
    // Click to open: no hover listeners for this item; click toggles; outside click / Escape close.
    assert.match(right, /setupTopBarItemHoverEvent\('userPanel', \{ openOnClick: true \}\)/)
    assert.match(interaction, /if \(triggerElement && !touchOptimized && !openOnClick\) \{\s*triggerElement\.addEventListener\('mouseenter'/)
    assert.match(interaction, /if \(popupElement && !touchOptimized && !activeController\.openOnClick\) \{/)
    assert.match(interaction, /settings\.value\.touchScreenOptimization \|\| hoverControllers\.get\(key\)\?\.openOnClick/)
    assert.match(topBar, /!settings\.value\.touchScreenOptimization && !hasOpenClickPopup\(\)/)
    assert.match(right, /custom-click-event\s+class="avatar-img top-bar-trigger"/, 'a plain click on the face never navigates')
    assert.match(panel, /<Button type="secondary" strong @click="handleClickChannel">/, 'the name leads to the profile')
    // Panel below the avatar, so it never covers the tools.
    assert.match(right, /setupTopBarItemTransformer\('userPanel', avatarPopRef\)\n/)
    assert.match(right, /<Transition name="slide-in">\s*<UserPanelPop/)
    assert.match(floating, /export function computeAnchoredPopoverPosition[\s\S]{0,200}const inset = 16\s+const gap = 8/)
    // One orb (circle + face): hover nudge, open = travel into the panel corner while the circle fades.
    assert.match(right, /<div class="avatar-orb" :class="\{ open: popupVisible\?\.userPanel \}">\s*<div class="avatar-face">/)
    const orb = styles.slice(styles.indexOf('  .avatar-orb {'), styles.indexOf('  .avatar-face {'))
    assert.match(orb, /&::before \{\s*@include sidebarSurface\.floating;/)
    assert.match(orb, /&\.open \{\s*transform:\s*translate\([\s\S]*?scale\(var\(--avatar-panel-scale\)\);[\s\S]*?&::before \{\s*opacity: 0;/)
    assert.match(orb, /\.avatar:hover \.avatar-orb:not\(\.open\) \{\s*transform: scale\(1\.06\);/)
    assert.match(styles, /prefers-reduced-motion: reduce\)[\s\S]*?\.avatar-orb,\s*\.avatar-orb::before,/)
    // Glass and the concentric top-right corner.
    assert.match(panel, /\.userPanel-pop\.bew-popover-surface \{\s*@include sidebarSurface\.floating;\s*border-radius: var\(--bew-popover-radius\) calc\(var\(--avatar-panel-face-radius\) \+ var\(--bew-space-2\)\)/)
    assert.match(panel, /corner-shape: var\(--bew-corner-shape\) round var\(--bew-corner-shape\) var\(--bew-corner-shape\);/)
  })
}
