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
}
