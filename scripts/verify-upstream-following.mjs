import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const member = (mid, tag = [1], special = 0) => ({ mid, uname: `UP ${mid}`, face: '', mtime: mid, tag, special })
const groupList = [{ tagid: 1, name: 'One', count: 1 }, { tagid: 2, name: 'Two', count: 0 }]

async function createFixture(Vue, apiOverrides = {}) {
  const model = await import('../src/contentScripts/views/Home/following/model')
  const lifetime = await import('../src/utils/accountLifetime')
  const stateModule = await loadSourceModule('../src/composables/useHomeTabState.ts', { vue: Vue })
  const account = Vue.ref(1)
  const revision = Vue.ref(0)
  const listeners = new Set()
  const api = { user: {
    getUserFollowings: async () => ({ code: 0, data: { list: [member(10)], total: 1 } }),
    getFollowingGroups: async () => ({ code: 0, data: groupList }),
    getRelations: async () => ({ code: 0, data: { 10: { attribute: 2, tag: [1], special: 0 } } }),
    ...apiOverrides,
  } }
  const relations = {
    getUserRelationRevision: () => revision.value,
    notifyFollowingGroupsChanged: (owner) => {
      if (owner === account.value)
        revision.value++
    },
    onUserRelationChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const dependencies = { 'vue': Vue, '~/utils/accountLifetime': lifetime, '~/utils/api': { default: api }, '~/utils/userRelation': relations, './model': model }
  const directoryModule = await loadSourceModule('../src/contentScripts/views/Home/following/useFollowingDirectory.ts', {
    ...dependencies,
    '~/logic/uploaderLatestVideoTimes': { uploaderLatestVideoTimes: Vue.ref({}), uploaderLatestVideoTimesReady: Promise.resolve() },
  })
  const writesModule = await loadSourceModule('../src/contentScripts/views/Home/following/useFollowingGroupWrites.ts', {
    ...dependencies,
    '~/utils/main': { getCSRF: () => 'csrf', getUserID: () => String(account.value) },
  })
  const host = document.body.appendChild(document.createElement('div'))
  let directory
  let writes
  const app = Vue.createApp({ setup() {
    const state = stateModule.useHomeTabState()
    directory = directoryModule.useFollowingDirectory(state, () => account.value, { viewed: () => ({}), blocked: () => new Set(), selected: () => null })
    writes = writesModule.useFollowingGroupWrites(directory, () => account.value, state.isCurrent)
    return () => Vue.h('div')
  } })
  app.mount(host)
  return { directory, writes, account, revision, api, model, listeners, dispose() {
    app.unmount()
    host.remove()
  } }
}

export function registerUpstreamFollowingChecks(check, { Vue, flush, compileComponent }) {
  check('following: reads preserve successful writes and retained lists; account/unmount stop late pagination', async () => {
    const fixture = await createFixture(Vue)
    const { directory, api } = fixture
    try {
      await directory.load()
      await directory.loadGroups()
      const oldPage = deferred()
      api.user.getUserFollowings = () => oldPage.promise
      const reading = directory.load(true)
      await flush()
      directory.applyMembership(10, [-10, 2])
      oldPage.resolve({ code: 0, data: { list: [member(10)], total: 1 } })
      await reading
      assert.deepEqual(Array.from(directory.uploaders.value[0].groupIds), [-10, 2])
      api.user.getUserFollowings = async () => ({ code: -500 })
      assert.equal((await directory.load(true)).status, 'error')
      assert.equal(directory.uploaders.value.length, 1, 'a failed refresh retains the usable directory')
      const oldMember = deferred()
      api.user.getRelations = () => oldMember.promise
      const refreshing = directory.refreshMember(10)
      directory.applyMembership(10, [1])
      oldMember.resolve({ code: 0, data: { 10: { attribute: 2, tag: [2], special: 1 } } })
      assert.equal(await refreshing, undefined)
      assert.deepEqual(Array.from(directory.uploaders.value[0].groupIds), [1])
      const stale = deferred()
      let calls = 0
      api.user.getUserFollowings = () => {
        calls++
        return stale.promise
      }
      const pending = directory.load(true)
      await flush()
      fixture.account.value = 2
      directory.reset()
      stale.resolve({ code: 0, data: { list: Array.from({ length: 50 }, (_, i) => member(i + 1)), total: 100 } })
      await pending
      assert.equal(calls, 1, 'no second batch is issued for the previous account')
      assert.equal(directory.uploaders.value.length, 0)
      assert.equal(fixture.listeners.size, 1)
    }
    finally { fixture.dispose() }
    assert.equal(fixture.listeners.size, 0)
  })

  check('following: normal groups and special follow remain independent through consecutive writes and failures', async () => {
    const calls = []
    const fixture = await createFixture(Vue, {
      moveFollowingUsers: (params) => {
        const task = deferred()
        calls.push({ ...task, params })
        return task.promise
      },
      copyFollowingUsers: (params) => {
        const task = deferred()
        calls.push({ ...task, params })
        return task.promise
      },
      deleteFollowingGroup: (params) => {
        const task = deferred()
        calls.push({ ...task, params })
        return task.promise
      },
    })
    const { directory, writes } = fixture
    try {
      await directory.load()
      await directory.loadGroups()
      const snapshot = { kind: 'move', mid: 10, groupIds: [1, -10], targetGroupId: 2 }
      const moving = writes.submit(snapshot)
      snapshot.groupIds[0] = 99
      assert.equal(calls[0].params.beforeTagids, '1')
      assert.equal(calls[0].params.afterTagids, '2')
      calls[0].resolve({ code: 0 })
      assert.equal((await moving).success, true)
      assert.deepEqual(Array.from(directory.uploaders.value[0].groupIds), [-10, 2])
      const unspecial = writes.submit({ kind: 'special', mid: 10, groupIds: directory.uploaders.value[0].groupIds, enabled: false })
      assert.equal(calls[1].params.beforeTagids, '-10')
      assert.equal(calls[1].params.afterTagids, '2')
      calls[1].resolve({ code: 0 })
      await unspecial
      assert.deepEqual(Array.from(directory.uploaders.value[0].groupIds), [2])
      const failed = writes.submit({ kind: 'move', mid: 10, groupIds: [2], targetGroupId: 1 })
      calls[2].resolve({ code: -1, message: 'failed' })
      assert.equal((await failed).error, 'failed')
      assert.deepEqual(Array.from(directory.uploaders.value[0].groupIds), [2])
      const deleting = writes.submit({ kind: 'delete', groupId: 2 })
      calls[3].resolve({ code: 0 })
      await deleting
      assert.deepEqual(Array.from(directory.uploaders.value[0].groupIds), [0])
      assert.equal(directory.uploaders.value[0].mid, 10, 'deleting a group does not unfollow its member')
    }
    finally { fixture.dispose() }
  })

  check('following: sent writes finish without mutating another account or an unmounted directory', async () => {
    const response = deferred()
    const fixture = await createFixture(Vue, { createFollowingGroup: () => response.promise })
    const writing = fixture.writes.submit({ kind: 'create', name: 'New' })
    fixture.dispose()
    response.resolve({ code: 0, data: { tagid: 3 } })
    assert.deepEqual({ ...await writing }, { success: true, applied: false })
    assert.equal(fixture.revision.value, 1, 'a reopened same-account directory is invalidated')
    const stale = deferred()
    const next = await createFixture(Vue, { renameFollowingGroup: () => stale.promise })
    const renaming = next.writes.submit({ kind: 'rename', groupId: 1, name: 'Renamed' })
    next.account.value = 2
    stale.resolve({ code: 0 })
    assert.equal((await renaming).applied, false)
    assert.equal(next.revision.value, 0)
    next.dispose()
  })

  check('following menu: reopening reads current groups and radio moves close the menu with consistent snapshots', async () => {
    const model = await import('../src/contentScripts/views/Home/following/model')
    const focus = await import('../src/utils/dialogFocus')
    const position = await import('../src/utils/floatingMenu')
    const globals = { AbortController, MouseEvent, ResizeObserver: class { observe() {} disconnect() {} } }
    const host = document.body.appendChild(document.createElement('div'))
    const trigger = host.appendChild(document.createElement('button'))
    const menuHost = host.appendChild(document.createElement('div'))
    const ContextMenu = await compileComponent('../src/components/ContextMenu.vue', {
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/utils/dialogFocus': focus,
      '~/utils/floatingMenu': position,
    }, { globals })
    const errors = []
    const Component = await compileComponent('../src/contentScripts/views/Home/following/FollowingGroupActions.vue', {
      './model': model,
      '~/components/ContextMenu.vue': { default: ContextMenu },
      '~/components/Dialog.vue': { default: Vue.defineComponent({ render: () => null }) },
      '~/components/Input.vue': { default: await compileComponent('../src/components/Input.vue') },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ success() {}, error: message => errors.push(message) }) },
      '~/composables/useConfirmDialog': { useConfirmDialog: () => ({ confirm: async () => true }) },
      '~/utils/userRelation': { changeUserRelation: async () => ({ code: 0 }) },
    }, { globals })
    let groups = [1]
    const operations = []
    const reads = []
    const app = Vue.createApp(Component, {
      accountId: 1,
      groups: groupList,
      busy: false,
      loadGroups: async () => true,
      loadMember: () => {
        const task = deferred()
        reads.push(task)
        return task.promise
      },
      write: async (operation) => {
        operations.push(operation)
        groups = [operation.targetGroupId]
        return { success: true, applied: true }
      },
    })
    const actions = app.mount(menuHost)
    const event = new MouseEvent('contextmenu', { clientX: 10, clientY: 10 })
    Object.defineProperty(event, 'currentTarget', { value: trigger })
    async function open() {
      const promise = actions.openUploader(event, { mid: 10, name: 'UP', groupIds: [1] })
      await flush()
      assert.equal(host.querySelectorAll('[role="menuitem"]:not(:disabled)').length, 0)
      reads.at(-1).resolve({ mid: 10, name: 'UP', groupIds: [...groups] })
      await promise
      await flush()
      ;[...host.querySelectorAll('[role="menuitem"]')].find(button => button.textContent.includes('move_group')).click()
      await flush()
    }
    try {
      await open()
      assert.match(host.querySelector('[aria-checked="true"]').textContent, /One/)
      ;[...host.querySelectorAll('[role="menuitemradio"]')].find(button => button.textContent.includes('Two')).click()
      await flush()
      assert.equal(host.querySelector('[role="menu"]'), null)
      assert.deepEqual(Array.from(operations[0].groupIds), [1])
      await open()
      assert.match(host.querySelector('[aria-checked="true"]').textContent, /Two/)
      ;[...host.querySelectorAll('[role="menuitemradio"]')].find(button => button.textContent.includes('One')).click()
      await flush()
      assert.deepEqual(Array.from(operations[1].groupIds), [2])
      assert.deepEqual(errors, [])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
