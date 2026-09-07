import assert from 'node:assert/strict'

import { createAccountLifetime } from '../src/utils/accountLifetime'
import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

export function registerAccountTransactionChecks(check, { Vue, compileComponent, flush }) {
  check('A03/A20 real HistoryPage resets on account reconciliation and rejects a confirmation from the old account', async () => {
    const timelineModule = await import('../src/contentScripts/views/History/useHistoryTimeline')
    const accountScope = await import('../src/utils/accountScope')
    const playbackProgress = await import('../src/utils/playbackProgress')
    const formatter = { calcCurrentTime: () => '' }
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    let cookie = 1
    const reads = []
    const statuses = []
    const confirmation = deferred()
    let writes = 0
    const api = {
      getHistoryList: () => {
        const task = deferred()
        reads.push(task)
        return task.promise
      },
      getHistoryPauseStatus: () => {
        const task = deferred()
        statuses.push(task)
        return task.promise
      },
      setHistoryPauseStatus: async () => {
        writes++
        return { code: 0 }
      },
    }
    const page = await compileComponent('../src/contentScripts/views/History/History.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: () => {} }) },
      '~/components/VideoListSkeleton.vue': { default: {} },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ handlePageRefresh: Vue.ref(), handleReachBottom: Vue.ref(), haveScrollbar: async () => true }) },
      '~/composables/useConfirmDialog': { useConfirmDialog: () => ({ confirm: () => confirmation.promise }) },
      '~/models/history/history': await import('../src/models/history/history'),
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': accountScope,
      '~/utils/api': { default: { history: api } },
      '~/utils/dataFormatter': formatter,
      '~/utils/main': { getCSRF: () => `csrf-${cookie}`, getUserID: () => String(cookie), removeHttpFromUrl: value => value },
      '~/utils/playbackProgress': playbackProgress,
      './useHistoryTimeline': timelineModule,
    }, { renderTemplate: false })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(page)
    const state = app.mount(host).$.setupState
    const paused = state.handlePauseWatchHistory()
    cookie = 2
    account.userInfo.mid = 2
    confirmation.resolve(true)
    await paused
    reads[0].resolve({ code: 0, data: { list: [{ title: 'old' }] } })
    statuses[0].resolve({ code: 0, data: true })
    reads[1].resolve({ code: 0, data: { list: [{ title: 'new' }] } })
    statuses[1].resolve({ code: 0, data: false })
    await flush()
    assert.equal(state.historyList[0].title, 'new')
    assert.equal(state.historyStatus, false)
    assert.equal(writes, 0)
    app.unmount()
    host.remove()
  })

  check('A01/A02/A08/A20 real FavoritesPage submits immutable selections and cancels remaining account/unmount batches', async () => {
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 }, notifyFavoritesChanged: async () => {} })
    let cookieAccount = 1
    const calls = []
    const errors = []
    const folders = [{ id: 1, title: 'source', media_count: 2 }, { id: 2, title: 'target', media_count: 0 }, { id: 3, title: 'new-view', media_count: 5 }]
    const submit = (kind, params) => {
      const task = deferred()
      calls.push({ ...task, kind, params })
      return task.promise
    }
    const api = {
      getFavoriteCategories: async () => ({ code: 0, data: { list: folders.map(folder => ({ ...folder })) } }),
      getCollectedFavoriteSeasons: async () => ({ code: 0, data: { list: [] } }),
      getFavoriteResources: async ({ media_id }) => ({ code: 0, data: { medias: media_id === 1 ? [{ id: 10, type: 2 }, { id: 11, type: 2 }] : [{ id: 30, type: 2 }], info: { cover: '' }, has_more: false } }),
      patchDelFavoriteResources: params => submit('delete', params),
      copyFavoriteResources: params => submit('copy', params),
      moveFavoriteResources: params => submit('move', params),
      unfavFavoriteSeason: params => submit('season', params),
      editFavoriteFolder: params => submit('edit', params),
    }
    const adapters = await import('../src/contentScripts/views/Favorites/favoriteAdapters')
    const folderModule = await import('../src/utils/favoriteFolder')
    const accountScope = await import('../src/utils/accountScope')
    const writeModule = await import('../src/contentScripts/views/Favorites/useFavoriteWrites')
    const dataModule = await loadSourceModule('../src/contentScripts/views/Favorites/useFavoritesData.ts', {
      vue: Vue,
      '~/utils/accountLifetime': { createAccountLifetime },
      '~/utils/favoriteFolder': folderModule,
      '~/utils/favoriteSeason': {},
      './favoriteAdapters': adapters,
    })
    const page = await compileComponent('../src/contentScripts/views/Favorites/FavoritesPage.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: error => errors.push(error), warning: () => {} }) },
      '~/components/ArticleCard/ArticleCard.vue': { default: {} },
      '~/components/ArticleCard/ArticleCardSkeleton.vue': { default: {} },
      '~/components/Settings/components/SettingsSegmentedControl.vue': { default: {} },
      '~/components/VideoCardGrid.vue': { default: {} },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ handlePageRefresh: Vue.ref(), handleReachBottom: Vue.ref(), haveScrollbar: async () => true }) },
      '~/composables/useConfirmDialog': { useConfirmDialog: () => ({ confirm: async () => true }) },
      '~/logic': { settings: Vue.ref({}) },
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': accountScope,
      '~/utils/api': { default: { favorite: api } },
      '~/utils/favoriteFolder': folderModule,
      '~/utils/favoriteSeason': { FAVORITE_SEASON_PAGE_SIZE: 20 },
      '~/utils/main': { getCSRF: () => `csrf-${cookieAccount}`, getUserID: () => String(cookieAccount), removeHttpFromUrl: value => value },
      './favoriteAdapters': adapters,
      './useFavoritesData': dataModule,
      './useFavoriteWrites': writeModule,
    }, { renderTemplate: false })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(page)
    const state = app.mount(host).$.setupState
    await flush()
    const [first, second] = state.favoriteResources
    state.toggleFavoriteResourceSelection(first)
    const deleting = state.handleBatchDelete()
    await flush()
    state.toggleFavoriteResourceSelection(first)
    state.toggleFavoriteResourceSelection(second)
    calls[0].resolve({ code: 0 })
    await deleting
    assert.equal(calls[0].params.resources, '10:2')
    assert.deepEqual([...state.favoriteResources.map(item => item.id)], [11])
    assert.deepEqual([...state.selectedResourceKeys], ['11:2'])
    state.targetCategory = state.favoriteCategories[1]
    const copying = state.handleBatchCopy()
    state.targetCategory = state.favoriteCategories[2]
    calls[1].resolve({ code: 0 })
    await copying
    assert.equal(calls[1].params.tar_media_id, 2)
    assert.equal(state.favoriteCategories[1].media_count, 1)
    assert.equal(state.favoriteCategories[2].media_count, 5)
    state.toggleFavoriteResourceSelection(second)
    const moving = state.handleBatchMove()
    state.changeCategory(state.favoriteCategories[2])
    await flush()
    calls[2].resolve({ code: 0 })
    await moving
    assert.equal(calls[2].params.src_media_id, 1)
    assert.deepEqual([...state.favoriteResources.map(item => item.id)], [30])
    assert.equal(state.selectedCategory.id, 3)
    state.openSingleEditFolder(2)
    state.editFolderTitle = 'submitted title'
    state.editFolderPublic = false
    const failedEdit = state.handleEditFolderConfirm()
    const editRequest = calls.pop()
    assert.equal(editRequest.params.title, 'submitted title')
    assert.equal(editRequest.params.privacy, 1)
    editRequest.resolve({ code: -1 })
    await failedEdit
    assert.equal(state.favoriteCategories[1].title, 'target')
    assert.equal(state.editFolderDialogVisible, true)
    assert.equal(state.editFolderTitle, 'submitted title')
    assert.deepEqual(errors, ['common.operation_failed'])
    errors.length = 0
    const editing = state.handleEditFolderConfirm()
    const acceptedEdit = calls.pop()
    state.editFolderTitle = 'new draft'
    acceptedEdit.resolve({ code: 0 })
    await editing
    assert.equal(state.favoriteCategories[1].title, 'submitted title')
    assert.equal(state.favoriteCategories[1].attr & 1, 1)
    assert.equal(state.editFolderTitle, 'new draft')
    assert.equal(state.editFolderDialogVisible, true)
    const batch = state.unfavSeasons([100, 101])
    await flush()
    cookieAccount = 2
    calls[3].resolve({ code: 0 })
    await batch
    assert.equal(calls.length, 4, 'cookie changes stop the next write even before topBar reconciliation')
    account.userInfo.mid = 2
    await flush()
    const disposed = state.unfavSeasons([200, 201])
    await flush()
    app.unmount()
    calls[4].resolve({ code: 0 })
    await disposed
    assert.equal(calls.length, 5)
    assert.equal(errors.length, 0)
    host.remove()
  })

  check('A04/A06/A07 real MessagesPage preserves new drafts and disables concurrent word controls', async () => {
    const controllerModule = await import('../src/components/Settings/PluginComponentsAndPages/MessagesPage/useMessageServerSettings')
    const { resolveAuthenticatedAccountId } = await import('../src/utils/accountScope')
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    const added = deferred()
    const writes = []
    const server = {
      getMessageServerSettings: async () => ({ code: 0, data: { msg_notify: 1, ai_intercept: 1, set_comment: 0, set_at: 0, set_like: 0, show_unfollowed_msg: 1 } }),
      getMessageBlockWords: async () => ({ code: 0, data: { words: [{ content: 'one' }], max_word_length: 12, max_words_size: 10 } }),
      addMessageBlockWord: (params) => {
        writes.push(params)
        return added.promise
      },
    }
    const slots = { setup: (_, { slots }) => () => Vue.h('section', [slots.default?.(), slots.bottom?.()]) }
    const button = { props: ['disabled', 'label'], emits: ['click'], setup: (props, { emit, slots }) => () => Vue.h('button', { disabled: props.disabled, 'aria-label': props.label, onClick: () => emit('click') }, slots.default?.()) }
    const input = { props: ['modelValue', 'size'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('input', { value: props.modelValue, onInput: event => emit('update:modelValue', event.target.value) }) }
    const component = await compileComponent('../src/components/Settings/PluginComponentsAndPages/MessagesPage/MessagesPage.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/Radio.vue': { default: { render: () => null } },
      '~/components/Select.vue': { default: { render: () => null } },
      '~/logic': { settings: Vue.ref({}) },
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': { resolveAuthenticatedAccountId },
      '~/utils/api': { default: { messageServerSettings: server } },
      '~/utils/main': { getUserID: () => String(account.userInfo.mid) },
      '../../components/SettingsItem.vue': { default: slots },
      '../../components/SettingsItemGroup.vue': { default: slots },
      './useMessageServerSettings': controllerModule,
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(component)
    app.config.globalProperties.$t = key => key
    app.component('Input', input).component('Button', button).component('TagRemoveButton', button)
    app.mount(host)
    await flush()
    const field = host.querySelector('input')
    field.value = 'first'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    ;[...host.querySelectorAll('button')].find(node => node.textContent.includes('block_words_add')).click()
    await flush()
    assert.equal(host.querySelector('[aria-label]').disabled, true)
    field.value = 'next draft'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    added.resolve({ code: 0 })
    await flush()
    assert.equal(field.value, 'next draft')
    assert.equal(writes[0].word, 'first')
    account.userInfo.mid = 2
    await flush()
    assert.equal(field.value, '')
    app.unmount()
    host.remove()
  })

  check('A02 actual Favorites data owner applies only the committed view and resource keys', async () => {
    const adapters = await import('../src/contentScripts/views/Favorites/favoriteAdapters')
    const { getFavoriteFolderEditedAttr } = await import('../src/utils/favoriteFolder')
    const module = await loadSourceModule('../src/contentScripts/views/Favorites/useFavoritesData.ts', {
      vue: Vue,
      '~/utils/accountLifetime': { createAccountLifetime },
      '~/utils/favoriteFolder': { getFavoriteFolderEditedAttr },
      '~/utils/favoriteSeason': {},
      './favoriteAdapters': adapters,
    })
    let account = 1
    const reads = []
    const api = {
      getFavoriteCategories: async () => ({ code: 0, data: { list: [{ id: 1, media_count: 2 }, { id: 2, media_count: 3 }] } }),
      getCollectedFavoriteSeasons: async () => ({ code: 0, data: { list: [] } }),
      getFavoriteResources: () => {
        const pending = deferred()
        reads.push(pending)
        return pending.promise
      },
    }
    const data = module.useFavoritesData({ api, getAccountId: () => account, haveScrollbar: async () => true, t: key => key })
    await data.initData()
    reads[0].resolve({ code: 0, data: { medias: [{ id: 10, type: 2 }, { id: 11, type: 2 }], info: { cover: '' }, has_more: false } })
    await flush()
    const version = data.contentVersion.value
    data.applyResourceWrite({ kind: 'delete', sourceId: 1, resourceKeys: ['10:2'] }, version)
    assert.deepEqual([...data.favoriteResources.map(item => item.id)], [11])
    assert.equal(data.selectedCategory.value.media_count, 1)
    data.selectedCategory.value = data.favoriteCategories[1]
    data.loadSelectedContent()
    data.applyResourceWrite({ kind: 'delete', sourceId: 1, resourceKeys: ['11:2'] }, version)
    assert.equal(data.selectedCategory.value.media_count, 3)
    account = 2
    data.resetAccount()
    data.dispose()
    await flush()
    assert.equal(data.favoriteResources.length, 0)
  })

  check('A03/A08/A20 actual History controller rejects old account reads and writes, including status', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    let account = 1
    const reads = []
    const status = []
    const writes = []
    const errors = []
    const api = {
      getHistoryList: () => {
        const request = deferred()
        reads.push(request)
        return request.promise
      },
      getHistoryPauseStatus: () => {
        const request = deferred()
        status.push(request)
        return request.promise
      },
      deleteHistoryItem: () => {
        const request = deferred()
        writes.push(request)
        return request.promise
      },
      setHistoryPauseStatus: () => {
        const request = deferred()
        writes.push(request)
        return request.promise
      },
      clearAllHistory: () => {
        const request = deferred()
        writes.push(request)
        return request.promise
      },
    }
    const timeline = useHistoryTimeline({ api, getAccountId: () => account, getCSRF: () => 'csrf', haveScrollbar: async () => true, onWriteError: error => errors.push(error) })
    timeline.activate()
    const item = { history: { business: 'archive', oid: 1 }, view_at: 5 }
    timeline.historyList.push(item)
    const deleting = timeline.deleteHistoryItem(item)
    account = 2
    timeline.activate()
    const newItem = { ...item, title: 'new account' }
    reads[1].resolve({ code: 0, data: { list: [newItem] } })
    status[1].resolve({ code: 0, data: false })
    reads[0].resolve({ code: 0, data: { list: [item] } })
    status[0].resolve({ code: 0, data: true })
    writes[0].resolve({ code: 0 })
    await deleting
    await flush()
    assert.equal(timeline.historyList[0].title, 'new account')
    assert.equal(timeline.historyStatus.value, false)
    const failing = timeline.deleteHistoryItem(newItem)
    writes[1].resolve({ code: -1 })
    await failing
    assert.equal(errors.length, 1)
    assert.equal(timeline.historyList.length, 1)
    const pausing = timeline.setHistoryPauseStatus(true)
    timeline.dispose()
    writes[2].resolve({ code: 0 })
    await pausing
    assert.equal(status.length, 2, 'disposed writes cannot issue reconciliation reads')
    await timeline.load()
    assert.equal(reads.length, 2)
  })

  check('A01/A02 actual favorite transactions preserve submitted IDs and stop unsent batches', async () => {
    const { useFavoriteWrites } = await import('../src/contentScripts/views/Favorites/useFavoriteWrites')
    let account = 1
    const lifetime = createAccountLifetime(() => account)
    const calls = []
    const errors = []
    const api = {
      unfavFavoriteSeason: (params) => {
        const request = deferred()
        calls.push({ ...request, params })
        return request.promise
      },
      moveFavoriteResources: (params) => {
        const request = deferred()
        calls.push({ ...request, params })
        return request.promise
      },
    }
    const controller = useFavoriteWrites({ api, capture: lifetime.capture, getCSRF: () => `csrf-${account}`, onError: error => errors.push(error) })
    const batch = controller.execute(controller.prepare({ kind: 'seasons', ids: [10, 11, 12] }))
    account = 2
    lifetime.invalidate()
    controller.reset()
    calls[0].resolve({ code: 0 })
    assert.equal(await batch, null)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].params.csrf, 'csrf-1')
    const transaction = controller.prepare({ kind: 'move', sourceId: 3, targetId: 4, resourceKeys: ['10:2'] })
    const moving = controller.execute(transaction)
    calls[1].resolve({ code: 0 })
    const result = await moving
    assert.equal(result.command.sourceId, 3)
    assert.deepEqual(calls[1].params, { src_media_id: 3, tar_media_id: 4, resources: '10:2', mid: '2', csrf: 'csrf-2' })
    const disposed = controller.execute(controller.prepare({ kind: 'seasons', ids: [20, 21] }))
    lifetime.dispose()
    calls[2].resolve({ code: 0 })
    assert.equal(await disposed, null)
    assert.equal(calls.length, 3)
    assert.equal(errors.length, 0)
  })

  check('A04/A05/A06 actual message settings arbitrate refresh, mutation and account ownership', async () => {
    const { useMessageServerSettings } = await import('../src/components/Settings/PluginComponentsAndPages/MessagesPage/useMessageServerSettings')
    let account = 1
    const reads = []
    const mutations = []
    const words = []
    const wordWrites = []
    const controller = useMessageServerSettings({
      getAccountId: () => account,
      fetchSettings: () => {
        const request = deferred()
        reads.push(request)
        return request.promise
      },
      setSetting: () => {
        const request = deferred()
        mutations.push(request)
        return request.promise
      },
      fetchBlockWords: () => {
        const request = deferred()
        words.push(request)
        return request.promise
      },
      addBlockWord: () => {
        const request = deferred()
        wordWrites.push(request)
        return request.promise
      },
      deleteBlockWord: () => {
        const request = deferred()
        wordWrites.push(request)
        return request.promise
      },
    })
    const response = value => ({ code: 0, data: { msg_notify: value, ai_intercept: 1, set_comment: 0, set_at: 0, set_like: 0, show_unfollowed_msg: 1 } })
    const wordResponse = { code: 0, data: { words: [{ content: 'a' }, { content: 'b' }], max_word_length: 12, max_words_size: 10 } }
    const refresh = controller.load()
    const mutation = controller.updateSetting('msg_notify', 1)
    mutations[0].resolve({ code: 0 })
    await flush()
    reads[1].resolve(response(1))
    assert.equal(await mutation, true)
    reads[0].resolve(response(3))
    words[0].resolve(wordResponse)
    await refresh
    assert.equal(controller.state.settings.msg_notify.serverValue, 1)
    const deletion = controller.deleteBlockWord('a')
    assert.equal(await controller.deleteBlockWord('b'), false, 'a different intent is rejected while controls are disabled, never reported as a success')
    assert.equal(wordWrites.length, 1)
    wordWrites[0].resolve({ code: 0 })
    await flush()
    words[1].resolve(wordResponse)
    assert.equal(await deletion, true)
    const old = controller.updateSetting('msg_notify', 3)
    account = 2
    controller.reset()
    mutations[1].resolve({ code: 0 })
    assert.equal(await old, false)
    assert.equal(reads.length, 2)
    assert.equal(controller.state.settings.msg_notify.serverValue, null)
    const pending = controller.load()
    controller.dispose()
    reads[2].resolve(response(3))
    words[2].resolve(wordResponse)
    await pending
    assert.equal(controller.state.loaded, false)
  })
}
