import { reactive } from 'vue'

import {
  MESSAGE_SERVER_SETTING_FIELDS,
  parseMessageBlockWordsResponse,
  parseMessageServerSettingsResponse,
} from '~/background/messageServerSettings/protocol'
import type {
  MessageBlockWordsData,
  MessageServerSettingField,
  MessageServerSettingsApiResponse,
  MessageServerSettingsErrorKind,
} from '~/background/messageServerSettings/types'

export interface MessageServerSettingState {
  serverValue: number | null
  pending: boolean
  errorKind: MessageServerSettingsErrorKind | null
}

export interface MessageBlockWordsState extends MessageBlockWordsData {
  loading: boolean
  pendingWord: string
  errorKind: MessageServerSettingsErrorKind | null
}

export interface MessageServerSettingsState {
  loaded: boolean
  loading: boolean
  errorKind: MessageServerSettingsErrorKind | null
  settings: Record<MessageServerSettingField, MessageServerSettingState>
  blockWords: MessageBlockWordsState
}

export interface MessageServerSettingsDependencies {
  fetchSettings: () => Promise<unknown>
  setSetting: (field: MessageServerSettingField, value: number) => Promise<unknown>
  fetchBlockWords: () => Promise<unknown>
  addBlockWord: (word: string) => Promise<unknown>
  deleteBlockWord: (word: string) => Promise<unknown>
}

export interface MessageServerSettingsController {
  state: MessageServerSettingsState
  load: () => Promise<void>
  refresh: () => Promise<void>
  updateSetting: (field: MessageServerSettingField, value: number) => Promise<boolean>
  addBlockWord: (word: string) => Promise<boolean>
  deleteBlockWord: (word: string) => Promise<boolean>
}

function createSettingStates(): Record<MessageServerSettingField, MessageServerSettingState> {
  return Object.fromEntries(MESSAGE_SERVER_SETTING_FIELDS.map(field => [field, {
    serverValue: null,
    pending: false,
    errorKind: null,
  }])) as Record<MessageServerSettingField, MessageServerSettingState>
}

function asResponse(value: unknown): MessageServerSettingsApiResponse | null {
  if (!value || typeof value !== 'object')
    return null
  const response = value as Partial<MessageServerSettingsApiResponse>
  return typeof response.code === 'number' ? response as MessageServerSettingsApiResponse : null
}

function resolveErrorKind(value: unknown): MessageServerSettingsErrorKind {
  const response = asResponse(value)
  return response?.bewlyError?.kind ?? (response ? 'api-error' : 'invalid-response')
}

export function useMessageServerSettings(
  dependencies: MessageServerSettingsDependencies,
): MessageServerSettingsController {
  const state = reactive<MessageServerSettingsState>({
    loaded: false,
    loading: false,
    errorKind: null,
    settings: createSettingStates(),
    blockWords: {
      words: [],
      maxWordLength: 0,
      maxWordsSize: 0,
      loading: false,
      pendingWord: '',
      errorKind: null,
    },
  })
  let loadRequest: Promise<void> | null = null
  let blockWordRequest: Promise<boolean> | null = null

  async function loadSettings(): Promise<boolean> {
    try {
      const response = await dependencies.fetchSettings()
      const values = parseMessageServerSettingsResponse(response)
      if (!values)
        throw response
      for (const field of MESSAGE_SERVER_SETTING_FIELDS) {
        if (values[field] !== undefined) {
          state.settings[field].serverValue = values[field]
          state.settings[field].errorKind = null
        }
      }
      return true
    }
    catch (error) {
      state.errorKind = resolveErrorKind(error)
      return false
    }
  }

  async function loadBlockWords(): Promise<boolean> {
    state.blockWords.loading = true
    try {
      const response = await dependencies.fetchBlockWords()
      const blockWords = parseMessageBlockWordsResponse(response)
      if (!blockWords)
        throw response
      state.blockWords.words = blockWords.words
      state.blockWords.maxWordLength = blockWords.maxWordLength
      state.blockWords.maxWordsSize = blockWords.maxWordsSize
      state.blockWords.errorKind = null
      return true
    }
    catch (error) {
      state.blockWords.errorKind = resolveErrorKind(error)
      return false
    }
    finally {
      state.blockWords.loading = false
    }
  }

  function load(): Promise<void> {
    if (loadRequest)
      return loadRequest
    const request = (async () => {
      state.loading = true
      const [settingsLoaded] = await Promise.all([
        loadSettings(),
        loadBlockWords(),
      ])
      state.loaded = state.loaded || settingsLoaded
      if (settingsLoaded)
        state.errorKind = null
      state.loading = false
    })().finally(() => {
      if (loadRequest === request)
        loadRequest = null
    })
    loadRequest = request
    return request
  }

  async function updateSetting(
    field: MessageServerSettingField,
    value: number,
  ): Promise<boolean> {
    const fieldState = state.settings[field]
    if (fieldState.pending || fieldState.serverValue === value)
      return fieldState.serverValue === value
    fieldState.pending = true
    fieldState.errorKind = null
    try {
      const response = await dependencies.setSetting(field, value)
      if (asResponse(response)?.code !== 0)
        throw response
      const authoritativeResponse = await dependencies.fetchSettings()
      const authoritative = parseMessageServerSettingsResponse(authoritativeResponse)
      if (authoritative?.[field] === undefined)
        throw authoritativeResponse
      fieldState.serverValue = authoritative[field]
      return true
    }
    catch (error) {
      fieldState.errorKind = resolveErrorKind(error)
      return false
    }
    finally {
      fieldState.pending = false
    }
  }

  function mutateBlockWord(
    operation: 'add' | 'delete',
    rawWord: string,
  ): Promise<boolean> {
    if (blockWordRequest)
      return blockWordRequest
    const word = rawWord.trim()
    if (!word)
      return Promise.resolve(false)
    const request = (async () => {
      state.blockWords.pendingWord = word
      state.blockWords.errorKind = null
      try {
        const response = operation === 'add'
          ? await dependencies.addBlockWord(word)
          : await dependencies.deleteBlockWord(word)
        if (asResponse(response)?.code !== 0)
          throw response
        return await loadBlockWords()
      }
      catch (error) {
        state.blockWords.errorKind = resolveErrorKind(error)
        return false
      }
      finally {
        state.blockWords.pendingWord = ''
      }
    })().finally(() => {
      if (blockWordRequest === request)
        blockWordRequest = null
    })
    blockWordRequest = request
    return request
  }

  return {
    state,
    load,
    refresh: load,
    updateSetting,
    addBlockWord: word => mutateBlockWord('add', word),
    deleteBlockWord: word => mutateBlockWord('delete', word),
  }
}
