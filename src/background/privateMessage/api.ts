import type Browser from 'webextension-polyfill'

import { createPrivateMessageErrorResponse } from './errors'
import {
  buildNewPrivateSessionsParams,
  buildPrivateAckParams,
  buildPrivateImageUploadForm,
  buildPrivateMessagesParams,
  buildPrivateSessionsParams,
  buildPrivateUserCardsParams,
  createPrivateImageMessageParams,
  createPrivateTextMessageParams,
  getPrivateImageType,
  parsePrivateImageUploadResponse,
  parsePrivateMessagesResponse,
  parsePrivateSendResponse,
  parsePrivateSessionsResponse,
} from './protocol'
import { requestPrivateImageUpload, requestPrivateMessage, requestPrivateMessageForm } from './transport'
import type {
  PrivateImageUploadPayload,
  PrivateMessageApiResponse,
  SendPrivateImageMessageOptions,
} from './types'
import { PRIVATE_MESSAGE_ENDPOINTS } from './types'

interface PrivateApiMessage {
  contentScriptQuery?: string
}

interface PrivateUserCardsMessage extends PrivateApiMessage {
  uids?: string[]
}

interface PrivateSessionsMessage extends PrivateApiMessage {
  endTs?: number
}

interface NewPrivateSessionsMessage extends PrivateApiMessage {
  beginTs?: number
}

interface PrivateMessagesMessage extends PrivateApiMessage {
  endSeqno?: string
  talkerId?: string
}

interface PrivateAckMessage extends PrivateApiMessage {
  ackSeqno?: string
  csrf?: string
  talkerId?: string
}

interface PrivateSendMessage extends PrivateApiMessage {
  csrf?: string
  senderId?: string
  talkerId?: string
  text?: string
}

type PrivateImageUploadMessage = PrivateApiMessage & Partial<PrivateImageUploadPayload>

type PrivateImageSendMessage = PrivateApiMessage & Partial<SendPrivateImageMessageOptions>

interface PrivateImageCancelMessage extends PrivateApiMessage {
  requestId?: string
}

const privateImageUploadControllers = new Map<string, AbortController>()

function invalidRequest(endpointName: keyof typeof PRIVATE_MESSAGE_ENDPOINTS) {
  return createPrivateMessageErrorResponse('invalid-response', endpointName)
}

export async function getPrivateSessions(
  message: PrivateSessionsMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    const response = await requestPrivateMessage({
      endpointName: 'getPrivateSessions',
      params: buildPrivateSessionsParams({ endTs: message.endTs }),
      url: PRIVATE_MESSAGE_ENDPOINTS.getPrivateSessions,
    }, {}, sender)
    if (response.code !== 0)
      return response
    return parsePrivateSessionsResponse(response) ?? invalidRequest('getPrivateSessions')
  }
  catch {
    return invalidRequest('getPrivateSessions')
  }
}

export async function getOlderPrivateSessions(
  message: PrivateSessionsMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  if (message.endTs === undefined)
    return invalidRequest('getPrivateSessions')
  return getPrivateSessions(message, sender)
}

export async function getNewPrivateSessions(
  message: NewPrivateSessionsMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    if (message.beginTs === undefined)
      return invalidRequest('getNewPrivateSessions')
    const response = await requestPrivateMessage({
      endpointName: 'getNewPrivateSessions',
      params: buildNewPrivateSessionsParams({ beginTs: message.beginTs }),
      url: PRIVATE_MESSAGE_ENDPOINTS.getNewPrivateSessions,
    }, {}, sender)
    if (response.code !== 0)
      return response
    return parsePrivateSessionsResponse(response) ?? invalidRequest('getNewPrivateSessions')
  }
  catch {
    return invalidRequest('getNewPrivateSessions')
  }
}

export async function getPrivateUserCards(
  message: PrivateUserCardsMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    return await requestPrivateMessage({
      endpointName: 'getPrivateUserCards',
      params: buildPrivateUserCardsParams(message.uids ?? []),
      url: PRIVATE_MESSAGE_ENDPOINTS.getPrivateUserCards,
    }, {}, sender)
  }
  catch {
    return invalidRequest('getPrivateUserCards')
  }
}

export async function getPrivateMessages(
  message: PrivateMessagesMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    if (!message.talkerId)
      return invalidRequest('getPrivateMessages')
    const response = await requestPrivateMessage({
      endpointName: 'getPrivateMessages',
      params: buildPrivateMessagesParams({
        talkerId: message.talkerId,
        endSeqno: message.endSeqno,
      }),
      url: PRIVATE_MESSAGE_ENDPOINTS.getPrivateMessages,
    }, {}, sender)
    if (response.code !== 0)
      return response
    return parsePrivateMessagesResponse(response) ?? invalidRequest('getPrivateMessages')
  }
  catch {
    return invalidRequest('getPrivateMessages')
  }
}

export async function ackPrivateSession(
  message: PrivateAckMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    if (!message.talkerId || !message.ackSeqno || !message.csrf)
      return invalidRequest('ackPrivateSession')
    return await requestPrivateMessage({
      endpointName: 'ackPrivateSession',
      params: buildPrivateAckParams({
        talkerId: message.talkerId,
        ackSeqno: message.ackSeqno,
        csrf: message.csrf,
      }),
      url: PRIVATE_MESSAGE_ENDPOINTS.ackPrivateSession,
    }, {}, sender)
  }
  catch {
    return invalidRequest('ackPrivateSession')
  }
}

export async function sendPrivateMessage(
  message: PrivateSendMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    if (!message.senderId || !message.talkerId || !message.text?.trim() || !message.csrf)
      return invalidRequest('sendPrivateMessage')
    const response = await requestPrivateMessageForm({
      endpointName: 'sendPrivateMessage',
      params: createPrivateTextMessageParams({
        senderId: message.senderId,
        talkerId: message.talkerId,
        text: message.text,
        csrf: message.csrf,
      }),
      url: PRIVATE_MESSAGE_ENDPOINTS.sendPrivateMessage,
    }, {}, sender)
    if (response.code !== 0)
      return response
    return parsePrivateSendResponse(response) ?? invalidRequest('sendPrivateMessage')
  }
  catch {
    return invalidRequest('sendPrivateMessage')
  }
}

function isValidImageBytes(bytes: unknown): bytes is number[] {
  return Array.isArray(bytes)
    && bytes.length > 0
    && bytes.every(value => Number.isInteger(value) && value >= 0 && value <= 255)
}

export async function uploadPrivateImage(
  message: PrivateImageUploadMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  const { bytes, csrf, fileName, mimeType, requestId } = message
  if (!requestId?.trim() || !fileName?.trim() || !mimeType || !csrf || !isValidImageBytes(bytes))
    return invalidRequest('uploadPrivateImage')

  try {
    const imageType = getPrivateImageType(mimeType)
    const file = new File([new Uint8Array(bytes)], fileName, { type: mimeType })
    const form = buildPrivateImageUploadForm(file, csrf)
    const controller = new AbortController()
    privateImageUploadControllers.get(requestId)?.abort()
    privateImageUploadControllers.set(requestId, controller)
    try {
      const response = await requestPrivateImageUpload({
        endpointName: 'uploadPrivateImage',
        form,
        url: PRIVATE_MESSAGE_ENDPOINTS.uploadPrivateImage,
      }, {}, sender, controller.signal)
      if (response.code !== 0)
        return response
      return parsePrivateImageUploadResponse(response, imageType) ?? invalidRequest('uploadPrivateImage')
    }
    finally {
      if (privateImageUploadControllers.get(requestId) === controller)
        privateImageUploadControllers.delete(requestId)
    }
  }
  catch {
    return invalidRequest('uploadPrivateImage')
  }
}

export async function sendPrivateImageMessage(
  message: PrivateImageSendMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    if (!message.senderId || !message.talkerId || !message.csrf || !message.uploaded)
      return invalidRequest('sendPrivateMessage')
    const response = await requestPrivateMessageForm({
      endpointName: 'sendPrivateMessage',
      params: createPrivateImageMessageParams({
        senderId: message.senderId,
        talkerId: message.talkerId,
        csrf: message.csrf,
        uploaded: message.uploaded,
      }),
      url: PRIVATE_MESSAGE_ENDPOINTS.sendPrivateMessage,
    }, {}, sender)
    if (response.code !== 0)
      return response
    return parsePrivateSendResponse(response) ?? invalidRequest('sendPrivateMessage')
  }
  catch {
    return invalidRequest('sendPrivateMessage')
  }
}

export async function cancelPrivateImageUpload(
  message: PrivateImageCancelMessage = {},
): Promise<PrivateMessageApiResponse<null>> {
  const requestId = message.requestId?.trim()
  if (!requestId)
    return invalidRequest('uploadPrivateImage')
  privateImageUploadControllers.get(requestId)?.abort()
  privateImageUploadControllers.delete(requestId)
  return { code: 0, data: null }
}

const API_PRIVATE_MESSAGE = {
  getPrivateSessions,
  getOlderPrivateSessions,
  getNewPrivateSessions,
  getPrivateUserCards,
  getPrivateMessages,
  ackPrivateSession,
  sendPrivateMessage,
  uploadPrivateImage,
  sendPrivateImageMessage,
  cancelPrivateImageUpload,
}

export default API_PRIVATE_MESSAGE
