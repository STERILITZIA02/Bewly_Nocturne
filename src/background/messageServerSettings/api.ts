import type Browser from 'webextension-polyfill'

import {
  buildMessageBlockWordMutation,
  buildMessageServerSettingsGetParams,
  buildMessageServerSettingUpdate,
  isMessageServerSettingField,
} from './protocol'
import { requestMessageServerSettings } from './transport'
import type { MessageServerSettingsApiResponse } from './types'
import { MESSAGE_SERVER_SETTINGS_ENDPOINTS } from './types'

interface MessageServerSettingsMessage {
  contentScriptQuery?: string
  field?: unknown
  value?: unknown
  word?: unknown
}

function invalidResponse(endpointName: keyof typeof MESSAGE_SERVER_SETTINGS_ENDPOINTS): MessageServerSettingsApiResponse<null> {
  return {
    code: -1,
    data: null,
    bewlyError: {
      kind: 'invalid-response',
      endpointName,
      httpStatus: 0,
    },
  }
}

export function getMessageServerSettings(
  _message: MessageServerSettingsMessage = {},
  sender?: Browser.Runtime.MessageSender,
) {
  return requestMessageServerSettings({
    endpointName: 'getSettings',
    url: MESSAGE_SERVER_SETTINGS_ENDPOINTS.getSettings,
    method: 'GET',
    params: buildMessageServerSettingsGetParams(),
  }, {}, sender)
}

export function setMessageServerSetting(
  message: MessageServerSettingsMessage = {},
  sender?: Browser.Runtime.MessageSender,
) {
  if (!isMessageServerSettingField(message.field) || typeof message.value !== 'number')
    return Promise.resolve(invalidResponse('setSetting'))
  try {
    const request = buildMessageServerSettingUpdate(message.field, message.value)
    return requestMessageServerSettings({
      endpointName: 'setSetting',
      url: request.url,
      method: 'POST',
      body: request.body,
    }, {}, sender)
  }
  catch {
    return Promise.resolve(invalidResponse('setSetting'))
  }
}

export function getMessageBlockWords(
  _message: MessageServerSettingsMessage = {},
  sender?: Browser.Runtime.MessageSender,
) {
  return requestMessageServerSettings({
    endpointName: 'getBlockWords',
    url: MESSAGE_SERVER_SETTINGS_ENDPOINTS.getBlockWords,
    method: 'GET',
  }, {}, sender)
}

function mutateMessageBlockWord(
  operation: 'add' | 'delete',
  message: MessageServerSettingsMessage,
  sender?: Browser.Runtime.MessageSender,
) {
  if (typeof message.word !== 'string')
    return Promise.resolve(invalidResponse(operation === 'add' ? 'addBlockWord' : 'deleteBlockWord'))
  try {
    const mutation = buildMessageBlockWordMutation(operation, message.word)
    const endpointName = operation === 'add' ? 'addBlockWord' : 'deleteBlockWord'
    return requestMessageServerSettings({
      endpointName,
      url: mutation.url,
      method: 'POST',
      body: mutation.body,
    }, {}, sender)
  }
  catch {
    return Promise.resolve(invalidResponse(operation === 'add' ? 'addBlockWord' : 'deleteBlockWord'))
  }
}

export function addMessageBlockWord(
  message: MessageServerSettingsMessage = {},
  sender?: Browser.Runtime.MessageSender,
) {
  return mutateMessageBlockWord('add', message, sender)
}

export function deleteMessageBlockWord(
  message: MessageServerSettingsMessage = {},
  sender?: Browser.Runtime.MessageSender,
) {
  return mutateMessageBlockWord('delete', message, sender)
}

const API_MESSAGE_SERVER_SETTINGS = {
  getMessageServerSettings,
  setMessageServerSetting,
  getMessageBlockWords,
  addMessageBlockWord,
  deleteMessageBlockWord,
}

export default API_MESSAGE_SERVER_SETTINGS
