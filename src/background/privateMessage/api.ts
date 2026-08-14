import type Browser from 'webextension-polyfill'

import { createPrivateMessageErrorResponse } from './errors'
import {
  buildPrivateAckParams,
  buildPrivateMessagesParams,
  buildPrivateSessionsParams,
  buildPrivateUserCardsParams,
  parsePrivateMessagesResponse,
  parsePrivateSessionsResponse,
} from './protocol'
import { requestPrivateMessage } from './transport'
import type { PrivateMessageApiResponse } from './types'
import { PRIVATE_MESSAGE_ENDPOINTS } from './types'

interface PrivateApiMessage {
  contentScriptQuery?: string
}

interface PrivateUserCardsMessage extends PrivateApiMessage {
  uids?: string[]
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

function invalidRequest(endpointName: keyof typeof PRIVATE_MESSAGE_ENDPOINTS) {
  return createPrivateMessageErrorResponse('invalid-response', endpointName)
}

export async function getPrivateSessions(
  _message: PrivateApiMessage = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  const response = await requestPrivateMessage({
    endpointName: 'getPrivateSessions',
    params: buildPrivateSessionsParams(),
    url: PRIVATE_MESSAGE_ENDPOINTS.getPrivateSessions,
  }, {}, sender)
  if (response.code !== 0)
    return response
  return parsePrivateSessionsResponse(response) ?? invalidRequest('getPrivateSessions')
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

const API_PRIVATE_MESSAGE = {
  getPrivateSessions,
  getPrivateUserCards,
  getPrivateMessages,
  ackPrivateSession,
}

export default API_PRIVATE_MESSAGE
