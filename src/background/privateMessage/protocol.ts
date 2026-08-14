import type {
  AckPrivateSessionOptions,
  GetPrivateMessagesOptions,
  PrivateMessage,
  PrivateMessageApiResponse,
  PrivateMessageRequestParams,
  PrivateMessagesData,
  PrivateSession,
  PrivateSessionsData,
} from './types'

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
