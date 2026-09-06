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
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'

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
  getAccountId: () => AccountId
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
  reset: () => void
  dispose: () => void
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
  let blockWordRequest: { key: string, promise: Promise<boolean> } | null = null
  const lifetime = createAccountLifetime(dependencies.getAccountId)
  const revisions = Object.fromEntries(MESSAGE_SERVER_SETTING_FIELDS.map(field => [field, 0])) as Record<MessageServerSettingField, number>
  let blockWordsRevision = 0

  function reset() {
    lifetime.invalidate()
    loadRequest = null
    blockWordRequest = null
    state.loaded = false
    state.loading = false
    state.errorKind = null
    state.settings = createSettingStates()
    Object.assign(state.blockWords, { words: [], maxWordLength: 0, maxWordsSize: 0, loading: false, pendingWord: '', errorKind: null })
  }

  async function loadSettings(): Promise<boolean> {
    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return false
    const readRevisions = { ...revisions }
    try {
      const response = await dependencies.fetchSettings()
      if (!owner.isCurrent())
        return false
      const values = parseMessageServerSettingsResponse(response)
      if (!values)
        throw response
      for (const field of MESSAGE_SERVER_SETTING_FIELDS) {
        if (values[field] !== undefined && readRevisions[field] === revisions[field] && !state.settings[field].pending) {
          state.settings[field].serverValue = values[field]
          state.settings[field].errorKind = null
        }
      }
      return true
    }
    catch (error) {
      if (owner.isCurrent())
        state.errorKind = resolveErrorKind(error)
      return false
    }
  }

  async function loadBlockWords(): Promise<boolean> {
    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return false
    const revision = ++blockWordsRevision
    const isCurrent = () => owner.isCurrent() && revision === blockWordsRevision
    state.blockWords.loading = true
    try {
      const response = await dependencies.fetchBlockWords()
      if (!isCurrent())
        return false
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
      if (isCurrent())
        state.blockWords.errorKind = resolveErrorKind(error)
      return false
    }
    finally {
      if (isCurrent())
        state.blockWords.loading = false
    }
  }

  function load(): Promise<void> {
    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return Promise.resolve()
    if (loadRequest)
      return loadRequest
    const request = (async () => {
      state.loading = true
      const [settingsLoaded] = await Promise.all([
        loadSettings(),
        blockWordRequest ? blockWordRequest.promise : loadBlockWords(),
      ])
      if (!owner.isCurrent())
        return
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
    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return false
    const fieldState = state.settings[field]
    if (fieldState.pending || fieldState.serverValue === value)
      return fieldState.serverValue === value
    fieldState.pending = true
    revisions[field]++
    fieldState.errorKind = null
    try {
      const response = await dependencies.setSetting(field, value)
      if (!owner.isCurrent())
        return false
      if (asResponse(response)?.code !== 0)
        throw response
      const authoritativeResponse = await dependencies.fetchSettings()
      if (!owner.isCurrent())
        return false
      const authoritative = parseMessageServerSettingsResponse(authoritativeResponse)
      if (authoritative?.[field] === undefined)
        throw authoritativeResponse
      fieldState.serverValue = authoritative[field]
      return true
    }
    catch (error) {
      if (owner.isCurrent())
        fieldState.errorKind = resolveErrorKind(error)
      return false
    }
    finally {
      if (owner.isCurrent()) {
        revisions[field]++
        fieldState.pending = false
      }
    }
  }

  function mutateBlockWord(
    operation: 'add' | 'delete',
    rawWord: string,
  ): Promise<boolean> {
    const word = rawWord.trim()
    const owner = lifetime.capture()
    if (!word || !owner.isCurrent())
      return Promise.resolve(false)
    const key = `${operation}:${word}`
    if (blockWordRequest)
      return blockWordRequest.key === key ? blockWordRequest.promise : Promise.resolve(false)
    blockWordsRevision++
    state.blockWords.loading = false
    const request = (async () => {
      state.blockWords.pendingWord = word
      state.blockWords.errorKind = null
      try {
        const response = operation === 'add'
          ? await dependencies.addBlockWord(word)
          : await dependencies.deleteBlockWord(word)
        if (!owner.isCurrent())
          return false
        if (asResponse(response)?.code !== 0)
          throw response
        return await loadBlockWords()
      }
      catch (error) {
        if (owner.isCurrent())
          state.blockWords.errorKind = resolveErrorKind(error)
        return false
      }
      finally {
        if (owner.isCurrent())
          state.blockWords.pendingWord = ''
      }
    })().finally(() => {
      if (blockWordRequest?.promise === request)
        blockWordRequest = null
    })
    blockWordRequest = { key, promise: request }
    return request
  }

  return {
    state,
    reset,
    dispose: () => {
      reset()
      lifetime.dispose()
    },
    load,
    refresh: load,
    updateSetting,
    addBlockWord: word => mutateBlockWord('add', word),
    deleteBlockWord: word => mutateBlockWord('delete', word),
  }
}
