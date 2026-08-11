import type { Ref } from 'vue'
import { ref } from 'vue'

import api from '~/utils/api'
import { getCSRF } from '~/utils/main'

import { ensureBilibiliApiSuccess } from '../notificationApi'
import { transformMessageSettings } from '../notificationTransforms'
import type {
  MessageSettingState,
  MessageSettingValues,
  NotificationMode,
  NotificationModeKey,
  SimpleAutoReplyType,
} from '../types'

export type MessageSettingKey = keyof MessageSettingValues

function createEmptySettings(): MessageSettingState {
  return {
    values: {
      messageNotification: false,
      commentNotification: false,
      mentionNotification: false,
      likeNotification: false,
      followedAutoReply: false,
      keywordAutoReply: false,
      receivedMessageAutoReply: false,
      voyageAutoReply: false,
      aiIntercept: false,
      antiHarassment: false,
      receiveUnfollowedMessage: false,
      showUnfollowedMessage: false,
      receiveGroupMessage: false,
      foldGroupMessage: false,
    },
    notificationModes: {
      comment: 0,
      mention: 0,
    },
    antiHarassmentConfig: {
      open: 0,
      show: 0,
      flowMeOpen: 0,
      meFlowOpen: 0,
      expireDate: '',
    },
    antiDisturb: {
      isOpen: false,
      options: [],
      selectedId: 0,
      endTime: '',
      title: '',
      content: '',
      needShowDialog: false,
    },
    system: {
      autoReplyAvailable: false,
      autoReplyDescription: '',
      hintTitle: '',
      hintTitleButton: '',
      hintDetail: '',
      hintDetailButton: '',
      receiveUnfollowedWhitelist: false,
    },
    autoReplyTexts: {
      1: [],
      2: [],
      3: [],
      5: [],
    },
    blockWords: [],
    limits: {
      maxBlockWords: null,
      maxBlockWordLength: null,
    },
  }
}

export function useMessageSettings(accountId: Ref<string | null>) {
  const state = ref<MessageSettingState>(createEmptySettings())
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const saving = ref<Set<MessageSettingKey>>(new Set())
  const notificationModeSaving = ref<Set<NotificationModeKey>>(new Set())
  const antiDisturbBusy = ref(false)
  const autoReplySaving = ref<Set<SimpleAutoReplyType>>(new Set())
  const blockWordBusy = ref(false)
  const generation = ref(0)

  function isCurrent(requestGeneration: number, account: string) {
    return generation.value === requestGeneration && accountId.value === account
  }

  function reset() {
    generation.value += 1
    state.value = createEmptySettings()
    loading.value = false
    loaded.value = false
    error.value = ''
    saving.value = new Set()
    notificationModeSaving.value = new Set()
    antiDisturbBusy.value = false
    autoReplySaving.value = new Set()
    blockWordBusy.value = false
  }

  async function load() {
    const account = accountId.value
    if (!account || loading.value)
      return
    generation.value += 1
    const requestGeneration = generation.value
    loading.value = true
    error.value = ''
    try {
      const [
        settingsResponse,
        blockWordsResponse,
        systemSettingsResponse,
        antiDisturbResponse,
        followedReplyResponse,
        keywordReplyResponse,
        receivedReplyResponse,
        voyageReplyResponse,
      ] = await Promise.all([
        api.notification.getMessageSettings({ msg_notify: 1, show_unfollowed_msg: 1 }),
        api.notification.getBlockWords(),
        api.notification.getSystemMessageSettings(),
        api.notification.getAntiDisturb({ scene: 2 }),
        api.notification.getAutoReplyTexts({ 'type[]': 1 }),
        api.notification.getAutoReplyTexts({ 'type[]': 2 }),
        api.notification.getAutoReplyTexts({ 'type[]': 3 }),
        api.notification.getAutoReplyTexts({ 'type[]': 5 }),
      ])
      if (!isCurrent(requestGeneration, account))
        return
      ensureBilibiliApiSuccess(settingsResponse)
      ensureBilibiliApiSuccess(blockWordsResponse)
      ensureBilibiliApiSuccess(systemSettingsResponse)
      ensureBilibiliApiSuccess(antiDisturbResponse)
      ensureBilibiliApiSuccess(followedReplyResponse)
      ensureBilibiliApiSuccess(keywordReplyResponse)
      ensureBilibiliApiSuccess(receivedReplyResponse)
      ensureBilibiliApiSuccess(voyageReplyResponse)
      state.value = transformMessageSettings(settingsResponse, blockWordsResponse, {
        systemSettingsResponse,
        antiDisturbResponse,
        autoReplyResponses: {
          1: followedReplyResponse,
          2: keywordReplyResponse,
          3: receivedReplyResponse,
          5: voyageReplyResponse,
        },
      })
      loaded.value = true
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account))
        error.value = caught instanceof Error ? caught.message : String(caught)
    }
    finally {
      if (isCurrent(requestGeneration, account))
        loading.value = false
    }
  }

  async function requestSettingUpdate(key: MessageSettingKey, value: boolean, mode?: NotificationMode) {
    const csrf = getCSRF()
    switch (key) {
      case 'messageNotification':
        return api.notification.setMessageSettings({ msg_notify: value ? 1 : 3, csrf })
      case 'commentNotification':
        return api.notification.setMessageSettings({ set_comment: mode ?? (value ? 0 : 2), csrf })
      case 'mentionNotification':
        return api.notification.setMessageSettings({ set_at: mode ?? (value ? 0 : 2), csrf })
      case 'likeNotification':
        return api.notification.setMessageSettings({ set_like: value ? 0 : 5, csrf })
      case 'followedAutoReply':
        return api.notification.setMessageSettings({ followed_reply: Number(value), csrf })
      case 'keywordAutoReply':
        return api.notification.setMessageSettings({ keys_reply: Number(value), csrf })
      case 'receivedMessageAutoReply':
        return api.notification.setMessageSettings({ recv_reply: Number(value), csrf })
      case 'voyageAutoReply':
        return api.notification.setMessageSettings({ voyage_reply: Number(value), csrf })
      case 'aiIntercept':
        return api.notification.setMessageSettings({ ai_intercept: Number(value), csrf })
      case 'antiHarassment': {
        const config = state.value.antiHarassmentConfig
        const hasRange = config.flowMeOpen === 1 || config.meFlowOpen === 1
        return api.notification.setAntiHarassmentSettings({
          open: Number(value),
          show: 1,
          flow_me_open: hasRange ? config.flowMeOpen : 1,
          me_flow_open: hasRange ? config.meFlowOpen : 0,
          csrf,
        })
      }
      case 'receiveUnfollowedMessage':
        return api.notification.setMessageSettings({ receive_unfollow_msg: Number(value), csrf })
      case 'showUnfollowedMessage':
        return api.notification.setMessageSettings({ show_unfollowed_msg: Number(value), csrf })
      case 'receiveGroupMessage':
        return api.notification.setMessageSettings({ should_receive_group: Number(value), csrf })
      case 'foldGroupMessage':
        return api.notification.setMessageSettings({ is_group_fold: Number(value), csrf })
    }
  }

  async function update(key: MessageSettingKey, value: boolean) {
    if (saving.value.has(key))
      return
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    const previous = state.value.values[key]
    const modeKey = key === 'commentNotification'
      ? 'comment'
      : key === 'mentionNotification'
        ? 'mention'
        : null
    const previousMode: NotificationMode | undefined = modeKey
      ? state.value.notificationModes[modeKey]
      : undefined
    const nextMode: NotificationMode | undefined = modeKey
      ? value
        ? previousMode === 2 ? 0 : previousMode ?? 0
        : 2
      : undefined
    saving.value = new Set([...saving.value, key])
    state.value.values[key] = value
    if (modeKey && nextMode !== undefined)
      state.value.notificationModes[modeKey] = nextMode
    try {
      ensureBilibiliApiSuccess(await requestSettingUpdate(key, value, nextMode))
      if (!isCurrent(requestGeneration, account))
        return
      if (key === 'antiHarassment') {
        state.value.antiHarassmentConfig.open = Number(value)
        state.value.antiHarassmentConfig.show = 1
        if (state.value.antiHarassmentConfig.flowMeOpen !== 1 && state.value.antiHarassmentConfig.meFlowOpen !== 1)
          state.value.antiHarassmentConfig.flowMeOpen = 1
      }
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account)) {
        state.value.values[key] = previous
        if (modeKey && previousMode !== undefined)
          state.value.notificationModes[modeKey] = previousMode
      }
      throw caught
    }
    finally {
      if (isCurrent(requestGeneration, account)) {
        const next = new Set(saving.value)
        next.delete(key)
        saving.value = next
      }
    }
  }

  async function updateNotificationMode(key: NotificationModeKey, mode: NotificationMode) {
    if (notificationModeSaving.value.has(key))
      return
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    const previous = state.value.notificationModes[key]
    notificationModeSaving.value = new Set([...notificationModeSaving.value, key])
    state.value.notificationModes[key] = mode
    state.value.values[key === 'comment' ? 'commentNotification' : 'mentionNotification'] = mode !== 2
    try {
      const response = key === 'comment'
        ? await api.notification.setMessageSettings({ set_comment: mode, csrf: getCSRF() })
        : await api.notification.setMessageSettings({ set_at: mode, csrf: getCSRF() })
      ensureBilibiliApiSuccess(response)
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account)) {
        state.value.notificationModes[key] = previous
        state.value.values[key === 'comment' ? 'commentNotification' : 'mentionNotification'] = previous !== 2
      }
      throw caught
    }
    finally {
      if (isCurrent(requestGeneration, account)) {
        const next = new Set(notificationModeSaving.value)
        next.delete(key)
        notificationModeSaving.value = next
      }
    }
  }

  async function updateAntiDisturb(id: number, isOpen: boolean) {
    if (antiDisturbBusy.value)
      return
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    const previousOpen = state.value.antiDisturb.isOpen
    const previousSelectedId = state.value.antiDisturb.selectedId
    antiDisturbBusy.value = true
    state.value.antiDisturb.isOpen = isOpen
    state.value.antiDisturb.selectedId = id
    try {
      ensureBilibiliApiSuccess(await api.notification.setAntiDisturb({
        id,
        is_open: Number(isOpen),
        csrf: getCSRF(),
      }))
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account)) {
        state.value.antiDisturb.isOpen = previousOpen
        state.value.antiDisturb.selectedId = previousSelectedId
      }
      throw caught
    }
    finally {
      if (isCurrent(requestGeneration, account))
        antiDisturbBusy.value = false
    }
  }

  async function saveSimpleAutoReplyText(type: SimpleAutoReplyType, reply: string) {
    if (autoReplySaving.value.has(type))
      return
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    autoReplySaving.value = new Set([...autoReplySaving.value, type])
    try {
      ensureBilibiliApiSuccess(await api.notification.setAutoReplyText({
        type,
        reply,
        csrf: getCSRF(),
      }))
      if (!isCurrent(requestGeneration, account))
        return
      const current = state.value.autoReplyTexts[type]
      state.value.autoReplyTexts[type] = current.length
        ? [{ ...current[0], reply }, ...current.slice(1)]
        : [{ id: '', type, reply, title: '', key1: '', key2: '' }]
    }
    finally {
      if (isCurrent(requestGeneration, account)) {
        const next = new Set(autoReplySaving.value)
        next.delete(type)
        autoReplySaving.value = next
      }
    }
  }

  async function addBlockWord(word: string) {
    const normalized = word.trim()
    if (!normalized || blockWordBusy.value || state.value.blockWords.includes(normalized))
      return
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    blockWordBusy.value = true
    try {
      ensureBilibiliApiSuccess(await api.notification.addBlockWord({
        content: normalized,
        csrf: getCSRF(),
      }))
      if (isCurrent(requestGeneration, account))
        state.value.blockWords = [...state.value.blockWords, normalized]
    }
    finally {
      if (isCurrent(requestGeneration, account))
        blockWordBusy.value = false
    }
  }

  async function removeBlockWord(word: string) {
    if (blockWordBusy.value)
      return
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    blockWordBusy.value = true
    try {
      ensureBilibiliApiSuccess(await api.notification.deleteBlockWord({
        content: word,
        csrf: getCSRF(),
      }))
      if (isCurrent(requestGeneration, account))
        state.value.blockWords = state.value.blockWords.filter(candidate => candidate !== word)
    }
    finally {
      if (isCurrent(requestGeneration, account))
        blockWordBusy.value = false
    }
  }

  return {
    state,
    loading,
    loaded,
    error,
    saving,
    notificationModeSaving,
    antiDisturbBusy,
    autoReplySaving,
    blockWordBusy,
    reset,
    load,
    update,
    updateNotificationMode,
    updateAntiDisturb,
    saveSimpleAutoReplyText,
    addBlockWord,
    removeBlockWord,
  }
}
