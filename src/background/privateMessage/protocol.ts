import type {
  AckPrivateSessionOptions,
  GetNewPrivateSessionsOptions,
  GetPrivateMessagesOptions,
  GetPrivateSessionsOptions,
  PrivateMessage,
  PrivateMessageApiResponse,
  PrivateMessageRequestParams,
  PrivateMessagesData,
  PrivateSendData,
  PrivateSession,
  PrivateSessionsData,
  SendPrivateImageMessageOptions,
  SendPrivateMessageOptions,
  UploadedPrivateImage,
} from './types'

interface PrivateMessageRuntime {
  now: () => number
  randomUUID: () => string
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DEFAULT_PRIVATE_MESSAGE_RUNTIME: PrivateMessageRuntime = {
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

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getMissingCoreFields(
  value: unknown,
  fields: ReadonlyArray<readonly [string, 'number' | 'string']>,
): string[] {
  if (!isRecord(value))
    return ['record']
  return fields.flatMap(([field, expectedType]) => {
    const fieldValue = value[field]
    const isValid = expectedType === 'string'
      ? typeof fieldValue === 'string'
      : typeof fieldValue === 'number' && Number.isFinite(fieldValue)
    return isValid ? [] : [field]
  })
}

function reportSkippedPrivateRows(
  endpointName: 'getPrivateMessages' | 'getPrivateSessions',
  rawCount: number,
  acceptedCount: number,
  missingFields: Set<string>,
) {
  const skippedCount = rawCount - acceptedCount
  if (import.meta.env?.DEV && skippedCount > 0) {
    console.warn('[PrivateMessage] Skipped malformed rows', {
      endpointName,
      rawCount,
      acceptedCount,
      skippedCount,
      missingFields: [...missingFields].sort(),
    })
  }
}

function requireCsrf(value: string): string {
  const csrf = value.trim()
  if (!csrf)
    throw new TypeError('csrf must not be empty')
  return csrf
}

function requirePositiveNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${fieldName} must be a positive number`)
  return value
}

function requireHttpUrl(value: string, fieldName: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new TypeError('unsupported URL protocol')
    return url.toString()
  }
  catch {
    throw new TypeError(`${fieldName} must be an HTTP(S) URL`)
  }
}

const PRIVATE_MESSAGE_CORE_FIELDS = [
  ['sender_uid', 'string'],
  ['receiver_type', 'number'],
  ['receiver_id', 'string'],
  ['msg_type', 'number'],
  ['content', 'string'],
  ['msg_seqno', 'string'],
  ['timestamp', 'number'],
  ['msg_key', 'string'],
  ['msg_status', 'number'],
] as const

const PRIVATE_SESSION_CORE_FIELDS = [
  ['talker_id', 'string'],
  ['session_type', 'number'],
  ['top_ts', 'number'],
  ['session_ts', 'number'],
  ['unread_count', 'number'],
  ['ack_seqno', 'string'],
  ['max_seqno', 'string'],
] as const

function parsePrivateMessage(value: unknown): PrivateMessage | null {
  if (!isRecord(value) || getMissingCoreFields(value, PRIVATE_MESSAGE_CORE_FIELDS).length > 0)
    return null

  return {
    ...value,
    sender_uid: value.sender_uid as string,
    receiver_type: value.receiver_type as number,
    receiver_id: value.receiver_id as string,
    msg_type: value.msg_type as number,
    content: value.content as string,
    msg_seqno: value.msg_seqno as string,
    timestamp: value.timestamp as number,
    at_uids: Array.isArray(value.at_uids) ? value.at_uids : [],
    msg_key: value.msg_key as string,
    msg_status: value.msg_status as number,
    notify_code: asString(value.notify_code),
    new_face_version: asNumber(value.new_face_version),
    msg_source: asNumber(value.msg_source),
  }
}

function parsePrivateSession(value: unknown): PrivateSession | null {
  if (!isRecord(value) || getMissingCoreFields(value, PRIVATE_SESSION_CORE_FIELDS).length > 0)
    return null

  const lastMessage = value.last_msg === null || value.last_msg === undefined
    ? null
    : parsePrivateMessage(value.last_msg)
  const accountInfo = isRecord(value.account_info)
    ? {
        name: asString(value.account_info.name),
        pic_url: asString(value.account_info.pic_url),
      }
    : null

  return {
    ...value,
    talker_id: value.talker_id as string,
    session_type: value.session_type as number,
    at_seqno: asNumber(value.at_seqno),
    top_ts: value.top_ts as number,
    group_name: asString(value.group_name),
    group_cover: asString(value.group_cover),
    is_follow: asNumber(value.is_follow),
    is_dnd: asNumber(value.is_dnd),
    ack_seqno: value.ack_seqno as string,
    ack_ts: asNumber(value.ack_ts),
    session_ts: value.session_ts as number,
    unread_count: value.unread_count as number,
    last_msg: lastMessage,
    group_type: asNumber(value.group_type),
    can_fold: asNumber(value.can_fold),
    status: asNumber(value.status),
    max_seqno: value.max_seqno as string,
    new_push_msg: asNumber(value.new_push_msg),
    setting: value.setting ?? null,
    is_guardian: asNumber(value.is_guardian),
    is_intercept: asNumber(value.is_intercept),
    is_trust: asNumber(value.is_trust),
    system_msg_type: asNumber(value.system_msg_type),
    account_info: accountInfo,
    live_status: asNumber(value.live_status),
    biz_msg_unread_count: asNumber(value.biz_msg_unread_count),
  }
}

export function buildPrivateSessionsParams(
  options: GetPrivateSessionsOptions = {},
): PrivateMessageRequestParams {
  const params: PrivateMessageRequestParams = {
    session_type: 1,
    group_fold: 1,
    unfollow_fold: 0,
    sort_rule: 2,
    size: 100,
    build: 0,
    mobi_app: 'web',
  }

  if (options.endTs !== undefined)
    params.end_ts = requirePositiveNumber(options.endTs, 'endTs')

  return params
}

export function buildNewPrivateSessionsParams(
  options: GetNewPrivateSessionsOptions,
): PrivateMessageRequestParams {
  return {
    begin_ts: requirePositiveNumber(options.beginTs, 'beginTs'),
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
  runtime: PrivateMessageRuntime = DEFAULT_PRIVATE_MESSAGE_RUNTIME,
): PrivateMessageRequestParams {
  if (!options.text.trim())
    throw new TypeError('text must not be blank')

  const csrf = requireCsrf(options.csrf)

  return createPrivateSendParams({
    content: JSON.stringify({ content: options.text }),
    csrf,
    msgType: 1,
    runtime,
    senderId: options.senderId,
    talkerId: options.talkerId,
  })
}

interface CreatePrivateSendParamsOptions {
  content: string
  csrf: string
  msgType: 1 | 2
  runtime: PrivateMessageRuntime
  senderId: string
  talkerId: string
}

function createPrivateSendParams(
  options: CreatePrivateSendParamsOptions,
): PrivateMessageRequestParams {
  const { runtime } = options

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
    'msg[msg_type]': options.msgType,
    'msg[msg_status]': 0,
    'msg[dev_id]': devId,
    'msg[timestamp]': timestamp,
    'msg[new_face_version]': 1,
    'msg[content]': options.content,
    from_firework: 0,
    build: 0,
    mobi_app: 'web',
    csrf_token: options.csrf,
    csrf: options.csrf,
  }
}

export function getPrivateImageType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase()
  if (!normalizedMimeType.startsWith('image/'))
    throw new TypeError('unsupported private image MIME type')
  const rawSubtype = normalizedMimeType.slice('image/'.length).split('+', 1)[0] ?? ''
  const imageType = rawSubtype === 'jpeg'
    ? 'jpg'
    : rawSubtype.replace(/^x-/, '').split('.').at(-1) ?? ''
  if (!/^[a-z\d]+$/.test(imageType))
    throw new TypeError('unsupported private image MIME type')
  return imageType
}

export function buildPrivateImageUploadForm(file: File, csrfValue: string): FormData {
  const csrf = requireCsrf(csrfValue)
  getPrivateImageType(file.type)
  const form = new FormData()
  form.set('file_up', file)
  form.set('biz', 'im')
  form.set('csrf', csrf)
  return form
}

export function createPrivateImageMessageParams(
  options: SendPrivateImageMessageOptions,
  runtime: PrivateMessageRuntime = DEFAULT_PRIVATE_MESSAGE_RUNTIME,
): PrivateMessageRequestParams {
  const uploaded = options.uploaded
  const content = JSON.stringify({
    url: requireHttpUrl(uploaded.url, 'uploaded.url'),
    height: requirePositiveNumber(uploaded.height, 'uploaded.height'),
    width: requirePositiveNumber(uploaded.width, 'uploaded.width'),
    imageType: getPrivateImageType(`image/${uploaded.imageType === 'jpg' ? 'jpeg' : uploaded.imageType}`),
    original: 1,
    size: requirePositiveNumber(uploaded.size, 'uploaded.size'),
  })

  return createPrivateSendParams({
    content,
    csrf: requireCsrf(options.csrf),
    msgType: 2,
    runtime,
    senderId: options.senderId,
    talkerId: options.talkerId,
  })
}

export function parsePrivateImageUploadResponse(
  response: PrivateMessageApiResponse,
  imageType: string,
): PrivateMessageApiResponse<UploadedPrivateImage> | null {
  if (response.code !== 0 || !isRecord(response.data))
    return null
  const data = response.data
  if (
    typeof data.image_url !== 'string'
    || typeof data.image_height !== 'number'
    || typeof data.image_width !== 'number'
    || typeof data.img_size !== 'number'
  ) {
    return null
  }

  try {
    return {
      code: 0,
      data: {
        url: requireHttpUrl(data.image_url, 'image_url'),
        height: requirePositiveNumber(data.image_height, 'image_height'),
        width: requirePositiveNumber(data.image_width, 'image_width'),
        size: requirePositiveNumber(data.img_size, 'img_size'),
        imageType: getPrivateImageType(`image/${imageType === 'jpg' ? 'jpeg' : imageType}`),
      },
    }
  }
  catch {
    return null
  }
}

export function parsePrivateSessionsResponse(
  response: PrivateMessageApiResponse,
): PrivateMessageApiResponse<PrivateSessionsData> | null {
  if (response.code !== 0 || !isRecord(response.data))
    return null

  const rawSessions = response.data.session_list
  if (rawSessions !== null && rawSessions !== undefined && !Array.isArray(rawSessions))
    return null

  const sessions: PrivateSession[] = []
  const missingFields = new Set<string>()
  for (const value of rawSessions ?? []) {
    const session = parsePrivateSession(value)
    if (session) {
      sessions.push(session)
    }
    else {
      for (const field of getMissingCoreFields(value, PRIVATE_SESSION_CORE_FIELDS))
        missingFields.add(field)
    }
  }
  const rawCount = rawSessions?.length ?? 0
  reportSkippedPrivateRows('getPrivateSessions', rawCount, sessions.length, missingFields)
  if (rawCount > 0 && sessions.length === 0)
    return null

  return {
    ...response,
    data: {
      ...response.data,
      session_list: sessions,
      has_more: asNumber(response.data.has_more),
    },
  }
}

export function parsePrivateMessagesResponse(
  response: PrivateMessageApiResponse,
): PrivateMessageApiResponse<PrivateMessagesData> | null {
  if (
    response.code !== 0
    || !isRecord(response.data)
  ) {
    return null
  }

  const rawMessages = response.data.messages
  const rawEInfos = response.data.e_infos
  if (rawMessages !== null && rawMessages !== undefined && !Array.isArray(rawMessages))
    return null
  if (rawEInfos !== null && rawEInfos !== undefined && !Array.isArray(rawEInfos))
    return null

  const messages: PrivateMessage[] = []
  const missingFields = new Set<string>()
  for (const value of rawMessages ?? []) {
    const message = parsePrivateMessage(value)
    if (message) {
      messages.push(message)
    }
    else {
      for (const field of getMissingCoreFields(value, PRIVATE_MESSAGE_CORE_FIELDS))
        missingFields.add(field)
    }
  }
  const rawCount = rawMessages?.length ?? 0
  reportSkippedPrivateRows('getPrivateMessages', rawCount, messages.length, missingFields)
  if (rawCount > 0 && messages.length === 0)
    return null

  return {
    ...response,
    data: {
      ...response.data,
      messages,
      e_infos: rawEInfos ?? [],
    },
  }
}

export function parsePrivateSendResponse(
  response: PrivateMessageApiResponse,
): PrivateMessageApiResponse<PrivateSendData> | null {
  if (response.code !== 0)
    return null
  if (response.data === null || response.data === undefined) {
    return {
      ...response,
      data: {},
    }
  }
  if (!isRecord(response.data))
    return null
  if (
    Object.hasOwn(response.data, 'msg_key')
    && typeof response.data.msg_key !== 'string'
  ) {
    return null
  }

  return response as PrivateMessageApiResponse<PrivateSendData>
}
