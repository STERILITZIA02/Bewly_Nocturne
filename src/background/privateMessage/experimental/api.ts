/**
 * EXPERIMENTAL: text send is available only through the explicit DEV test UI; image writes remain unexposed.
 */
import type Browser from 'webextension-polyfill'

import { getPrivateMessageDevId } from '../deviceId'
import { createPrivateMessageErrorResponse } from '../errors'
import {
  buildPrivateImageUploadForm,
  createPrivateImageMessageParams,
  createPrivateTextMessageParams,
  getPrivateImageType,
  parsePrivateImageUploadResponse,
  parsePrivateSendResponse,
} from '../protocol'
import {
  requestPrivateImageUpload,
  requestSignedPrivateMessageForm,
} from '../transport'
import type {
  PrivateImageUploadPayload,
  PrivateMessageApiResponse,
  PrivateMessageRequestParams,
  SendPrivateImageMessageOptions,
} from '../types'
import { PRIVATE_MESSAGE_ENDPOINTS } from '../types'

interface PrivateApiMessage {
  contentScriptQuery?: string
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

async function sendPrivateMessageForm(
  body: PrivateMessageRequestParams,
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  const response = await requestSignedPrivateMessageForm({
    endpointName: 'sendPrivateMessage',
    body,
    url: PRIVATE_MESSAGE_ENDPOINTS.sendPrivateMessage,
  }, {}, sender)
  if (response.code !== 0)
    return response
  return parsePrivateSendResponse(response) ?? invalidRequest('sendPrivateMessage')
}

export async function sendPrivateMessage(
  message: PrivateSendMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  try {
    if (!message.senderId || !message.talkerId || !message.text?.trim() || !message.csrf)
      return invalidRequest('sendPrivateMessage')
    const devId = await getPrivateMessageDevId(message.senderId)
    return await sendPrivateMessageForm(createPrivateTextMessageParams({
      senderId: message.senderId,
      talkerId: message.talkerId,
      text: message.text,
      csrf: message.csrf,
      devId,
    }), sender)
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
    const devId = await getPrivateMessageDevId(message.senderId)
    return await sendPrivateMessageForm(createPrivateImageMessageParams({
      senderId: message.senderId,
      talkerId: message.talkerId,
      csrf: message.csrf,
      uploaded: message.uploaded,
      devId,
    }), sender)
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
