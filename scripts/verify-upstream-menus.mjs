import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerUpstreamMenuChecks(check, { Vue, flush, compileComponent }) {
  check('element menu: existing descriptors retain radio/toggle truth, native menus and new dialog focus', async () => {
    const enums = await import('../src/enums/appEnums')
    const settings = Vue.ref({ dockPosition: 'bottom', dockCollapseMode: 'button', autoHideTopBar: false, dockItemsConfig: [], topBarComponentsConfig: [] })
    const layout = await loadSourceModule('../src/logic/layoutEdit.ts', {
      'vue': Vue,
      '~/enums/appEnums': enums,
      '~/logic/storage': { settings, gridLayout: Vue.ref({ home: 'adaptive' }) },
      './layoutEditPreview': await import('../src/logic/layoutEditPreview'),
      './recommendationMode': { selectRecommendationMode() {} },
    })
    const menu = await loadSourceModule('../src/logic/elementSettingsMenu.ts', {
      '~/enums/appEnums': enums,
      './layoutEdit': layout,
      './storage': { settings },
      '~/utils/topBarBadge': await loadSourceModule('../src/utils/topBarBadge.ts', { '~/logic': { settings } }),
    })
    const host = document.body.appendChild(document.createElement('div'))
    const dock = host.appendChild(document.createElement('button'))
    const unregister = layout.registerLayoutEditableElement('dock', dock)
    const mount = host.appendChild(document.createElement('div'))
    const globals = { MouseEvent, ResizeObserver: class { observe() {} disconnect() {} } }
    const ContextMenu = await compileComponent('../src/components/ContextMenu.vue', {
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      '~/utils/floatingMenu': await import('../src/utils/floatingMenu'),
    }, { globals })
    const route = Vue.ref(window.location.href)
    const ElementMenu = await compileComponent('../src/components/ElementSettingsContextMenu.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/ContextMenu.vue': { default: ContextMenu },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => route },
      '~/logic/elementSettingsMenu': menu,
      '~/logic/layoutEdit': layout,
      '~/stores/mainStore': { useMainStore: () => ({ dockItems: [] }) },
      '~/stores/settingsStore': { useSettingsStore: () => ({}) },
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
    }, { globals })
    const dialog = host.appendChild(document.createElement('div'))
    const input = dialog.appendChild(document.createElement('input'))
    const opened = []
    const app = Vue.createApp(ElementMenu, { onOpenSetting: (id) => {
      opened.push(id)
      dialog.setAttribute('aria-modal', 'true')
      input.focus()
    } })
    app.mount(mount)
    const clickChoice = value => [...host.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent.includes(value)).click()
    try {
      dock.focus()
      const keyboard = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })
      dock.dispatchEvent(keyboard)
      await flush()
      assert.equal(keyboard.defaultPrevented, true)
      clickChoice('position.left')
      await flush()
      assert.equal(settings.value.dockPosition, 'left')
      assert.match(host.querySelector('[role="menuitemradio"][aria-checked="true"]').textContent, /position.left/)
      clickChoice('position.right')
      await flush()
      assert.equal(settings.value.dockPosition, 'right')
      host.querySelector('[role="menuitem"]').click()
      await flush()
      assert.deepEqual(opened, ['navigation.dock.position'])
      assert.equal(document.activeElement, input, 'closing the menu cannot steal focus from the newly opened panel')
      dialog.removeAttribute('aria-modal')
      for (const tag of ['input', 'textarea', 'select', 'video']) {
        const native = dock.appendChild(document.createElement(tag))
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        native.dispatchEvent(event)
        assert.equal(event.defaultPrevented, false)
        native.remove()
      }
      const ownMenu = dock.appendChild(document.createElement('article'))
      ownMenu.className = 'video-card-container'
      const native = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      ownMenu.dispatchEvent(native)
      assert.equal(native.defaultPrevented, false)
      ownMenu.remove()
      const topbar = layout.getLayoutEditableDescriptor('topbar')
      let actions = menu.getElementSettingsActions(topbar, [], {}, key => key)
      actions.find(action => action.value === 'navigation.topBar.autoHide').run()
      actions = menu.getElementSettingsActions(topbar, [], {}, key => key)
      assert.equal(actions.find(action => action.value === 'navigation.topBar.autoHide').checked, true)
    }
    finally {
      app.unmount()
      unregister()
      host.remove()
    }
  })

  check('video menu: visible Web/App groups have no empty dividers and keep block for followed authors', async () => {
    const source = Vue.ref('appRcmd')
    const settings = Vue.ref({ enableCleanShareLink: true, videoCardContextMenuConfig: [] })
    const blank = { render: () => null }
    const model = await import('../src/models/video/appForYou')
    const Component = await compileComponent('../src/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error() {}, success() {} }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ openIframeDrawer() {} }) },
      '~/composables/useUserRelations': { useUserRelations: () => ({ batchQueryUserRelations: async () => {} }) },
      '~/logic': { settings },
      '~/models/video/appForYou': model,
      '~/stores/topBarStore': { useTopBarStore: () => ({ isLogin: true, userInfo: { mid: 1 } }) },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: {} },
      '~/utils/main': { getUserID: () => '1', getCSRF: () => 'csrf' },
      '~/utils/tabs': {},
      '~/utils/userRelation': {},
      './components/BlockUserConfirmDialog.vue': { default: blank },
      './components/DislikeDialog.vue': { default: blank },
      './components/FollowUserConfirmDialog.vue': { default: blank },
      './components/UnfollowUserConfirmDialog.vue': { default: blank },
    }, { globals: { ResizeObserver: class { observe() {} disconnect() {} } } })
    const video = { url: 'https://www.bilibili.com/video/BVfixture', bvid: 'BVfixture', id: 123, cover: 'cover.jpg', author: { mid: 10, name: 'UP', followed: true }, threePointV2: [{ type: model.Type.Dislike }, { type: model.Type.WatchLater }, { type: model.Type.Dislike }] }
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Component, { video, contextMenuStyles: {} })
    app.component('PipWindow', blank)
    app.provide('getVideoType', () => source.value)
    app.config.globalProperties.$t = key => key
    app.mount(host)
    await flush()
    function checkDividers() {
      const children = [...host.querySelector('[role="menu"]').children]
      assert.notEqual(children[0]?.getAttribute('role'), 'separator')
      assert.notEqual(children.at(-1)?.getAttribute('role'), 'separator')
      children.forEach((item, index) => {
        if (item.getAttribute('role') === 'separator')
          assert.notEqual(children[index - 1]?.getAttribute('role'), 'separator')
      })
    }
    try {
      assert.equal([...host.querySelectorAll('[role="menuitem"]')].filter(item => item.textContent.includes('not_interested')).length, 1)
      assert.equal(host.querySelector('[role="menu"]').children[1].getAttribute('role'), 'separator', 'App feedback is separated from common actions too')
      assert.match(host.textContent, /unfollow_user/)
      assert.match(host.textContent, /block_user/)
      assert.equal(host.querySelectorAll('li[role="menuitem"]').length, 0)
      checkDividers()
      source.value = 'rcmd'
      settings.value.videoCardContextMenuConfig = [{ key: 'notInterested', visible: false }, { key: 'notInterestedUploader', visible: false }, { key: 'viewOriginalCover', visible: false }, { key: 'followUser', visible: false }]
      await flush()
      assert.doesNotMatch(host.textContent, /not_interested|unfollow_user/)
      assert.match(host.textContent, /block_user/)
      checkDividers()
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
