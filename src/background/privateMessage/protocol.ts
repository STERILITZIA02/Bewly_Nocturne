import type {
  AckPrivateSessionOptions,
  GetPrivateMessagesOptions,
  PrivateMessage,
  PrivateMessageApiResponse,
  PrivateMessageRequestParams,
  PrivateMessagesData,
  PrivateSendData,
  PrivateSession,
  PrivateSessionsData,
  SendPrivateMessageOptions,
} from './types'

interface PrivateTextMessageRuntime {
  now: () => number
  randomUUID: () => string
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DEFAULT_PRIVATE_TEXT_MESSAGE_RUNTIME: PrivateTextMessageRuntime = {
  now: () => Date.now(),
  randomUUID: () => globalThis.crypto.randomUUID(),
}

function requireIdentifier(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized))
    throw new TypeError(`${fieldName} must be an unsigned decimal string`)
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parsePrivateMessage(value: unknown): PrivateMessage | null {
  if (!isRecord(value))
    return null

  if (
    typeof value.sender_uid !== 'string'
    || typeof value.receiver_type !== 'number'
    || typeof value.receiver_id !== 'string'
    || typeof value.msg_type !== 'number'
    || typeof value.content !== 'string'
    || typeof value.msg_seqno !== 'string'
    || typeof value.timestamp !== 'number'
    || !Array.isArray(value.at_uids)
    || typeof value.msg_key !== 'string'
    || typeof value.msg_status !== 'number'
    || typeof value.new_face_version !== 'number'
    || typeof value.msg_source !== 'number'
  ) {
    return null
  }

  return value as PrivateMessage
}

function parsePrivateSession(value: unknown): PrivateSession | null {
  if (!isRecord(value) || value.session_type !== 1)
    return null

  if (
    typeof value.talker_id !== 'string'
    || typeof value.ack_seqno !== 'string'
    || typeof value.max_seqno !== 'string'
    || typeof value.top_ts !== 'number'
    || typeof value.ack_ts !== 'number'
    || typeof value.session_ts !== 'number'
    || typeof value.unread_count !== 'number'
  ) {
    return null
  }

  const lastMessage = value.last_msg === null
    ? null
    : parsePrivateMessage(value.last_msg)
  if (value.last_msg !== null && lastMessage === null)
    return null

  return {
    ...value,
    last_msg: lastMessage,
  } as PrivateSession
}

export function buildPrivateSessionsParams(): PrivateMessageRequestParams {
  return {
    session_type: 1,
    group_fold: 1,
    unfollow_fold: 0,
    sort_rule: 2,
    size: 100,
    build: 0,
    mobi_app: 'web',
  }
}

export function buildPrivateUserCardsParams(uids: string[]): PrivateMessageRequestParams {
  const uniqueUids = [...new Set(uids.map(uid => requireIdentifier(uid, 'uid')))]
  if (uniqueUids.length === 0)
    throw new TypeError('uids must contain at least one identifier')

  return {
    uids: uniqueUids.join(','),
    build: 0,
    mobi_app: 'web',
  }
}

export function buildPrivateMessagesParams(
  options: GetPrivateMessagesOptions,
): PrivateMessageRequestParams {
  const params: PrivateMessageRequestParams = {
    talker_id: requireIdentifier(options.talkerId, 'talkerId'),
    session_type: 1,
    size: 20,
    sender_device_id: 1,
    build: 0,
    mobi_app: 'web',
  }

  if (options.endSeqno !== undefined) {
    params.begin_seqno = '0'
    params.end_seqno = requireIdentifier(options.endSeqno, 'endSeqno')
  }

  return params
}

export function buildPrivateAckParams(
  options: AckPrivateSessionOptions,
): PrivateMessageRequestParams {
  const csrf = options.csrf.trim()
  if (!csrf)
    throw new TypeError('csrf must not be empty')

  return {
    talker_id: requireIdentifier(options.talkerId, 'talkerId'),
    session_type: 1,
    ack_seqno: requireIdentifier(options.ackSeqno, 'ackSeqno'),
    build: 0,
    mobi_app: 'web',
    csrf_token: csrf,
    csrf,
  }
}

export function createPrivateTextMessageParams(
  options: SendPrivateMessageOptions,
  runtime: PrivateTextMessageRuntime = DEFAULT_PRIVATE_TEXT_MESSAGE_RUNTIME,
): PrivateMessageRequestParams {
  if (!options.text.trim())
    throw new TypeError('text must not be blank')

  const csrf = options.csrf.trim()
  if (!csrf)
    throw new TypeError('csrf must not be empty')

  const devId = runtime.randomUUID()
  if (!UUID_V4_PATTERN.test(devId))
    throw new TypeError('devId must be a UUID v4')

  const timestamp = Math.floor(runtime.now() / 1000)
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
    throw new TypeError('timestamp must be a positive integer')

  return {
    'msg[sender_uid]': requireIdentifier(options.senderId, 'senderId'),
    'msg[receiver_id]': requireIdentifier(options.talkerId, 'talkerId'),
    'msg[receiver_type]': 1,
    'msg[msg_type]': 1,
    'msg[msg_status]': 0,
    'msg[dev_id]': devId,
    'msg[timestamp]': timestamp,
    'msg[new_face_version]': 1,
    'msg[content]': JSON.stringify({ content: options.text }),
    from_firework: 0,
    build: 0,
    mobi_app: 'web',
    csrf_token: csrf,
    csrf,
  }
}

export function parsePrivateSessionsResponse(
  response: PrivateMessageApiResponse,
): PrivateMessageApiResponse<PrivateSessionsData> | null {
  if (response.code !== 0 || !isRecord(response.data) || !Array.isArray(response.data.session_list))
    return null

  const sessions: PrivateSession[] = []
  for (const value of response.data.session_list) {
    if (isRecord(value) && value.session_type !== 1)
      continue
    const session = parsePrivateSession(value)
    if (!session)
      return null
    sessions.push(session)
  }

  return {
    ...response,
    data: {
      ...response.data,
      session_list: sessions,
    },
  }
}

export function parsePrivateMessagesResponse(
  response: PrivateMessageApiResponse,
): PrivateMessageApiResponse<PrivateMessagesData> | null {
  if (
    response.code !== 0
    || !isRecord(response.data)
    || !Array.isArray(response.data.messages)
    || !Array.isArray(response.data.e_infos)
  ) {
    return null
  }

  const messages: PrivateMessage[] = []
  for (const value of response.data.messages) {
    const message = parsePrivateMessage(value)
    if (!message)
      return null
    messages.push(message)
  }

  return {
    ...response,
    data: {
      ...response.data,
      messages,
      e_infos: response.data.e_infos,
    },
  }
}

export function parsePrivateSendResponse(
  response: PrivateMessageApiResponse,
): PrivateMessageApiResponse<PrivateSendData> | null {
  if (response.code !== 0 || !isRecord(response.data))
    return null
  if (
    Object.hasOwn(response.data, 'msg_key')
    && typeof response.data.msg_key !== 'string'
  ) {
    return null
  }

  return response as PrivateMessageApiResponse<PrivateSendData>
}
