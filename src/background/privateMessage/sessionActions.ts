import { createPrivateMessageErrorResponse } from './errors'
import { requestPrivateMessage, requestPrivateMessageForm } from './transport'
import type { PrivateMessageEndpointName, PrivateMessageRequestParams } from './types'
import { PRIVATE_MESSAGE_ENDPOINTS } from './types'

export interface PrivateSessionTarget { talkerId: string, sessionType: 1 | 2 }
export interface PrivateSessionActionState { talker_id: string, session_type: 1 | 2, top_ts: number, is_dnd: 0 | 1 }
export interface PrivateSessionMutation extends PrivateSessionTarget { csrf: string, enabled: boolean, uid: string }
export interface PrivateUserReport { talkerId: string, csrf: string, reason: number, description: string, messageKeys: string[] }

const isId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d*$/.test(value)
const validTarget = (value: PrivateSessionTarget) => value && isId(value.talkerId) && [1, 2].includes(value.sessionType)
const invalid = (endpoint: PrivateMessageEndpointName) => createPrivateMessageErrorResponse('invalid-response', endpoint)

export async function getPrivateSessionDetail(target: PrivateSessionTarget) {
  if (!validTarget(target))
    return invalid('getPrivateSessionDetail')
  const response = await requestPrivateMessage({ endpointName: 'getPrivateSessionDetail', url: PRIVATE_MESSAGE_ENDPOINTS.getPrivateSessionDetail, params: { talker_id: target.talkerId, session_type: target.sessionType } })
  if (response.code !== 0)
    return response
  const data = response.data as Record<string, unknown> | null
  if (!data || String(data.talker_id) !== target.talkerId || data.session_type !== target.sessionType || typeof data.top_ts !== 'number' || !Number.isFinite(data.top_ts) || data.top_ts < 0 || ![0, 1].includes(data.is_dnd as number))
    return invalid('getPrivateSessionDetail')
  // Menu state does not need history, pagination or a last-message body. Do not
  // couple this read to the stricter session-list parser or forward private text.
  return { code: 0, data: { talker_id: target.talkerId, session_type: target.sessionType, top_ts: data.top_ts, is_dnd: data.is_dnd as 0 | 1 } satisfies PrivateSessionActionState }
}

export async function getPrivateSessionSettings(target: { talkerId: string }) {
  if (!target || !isId(target.talkerId))
    return invalid('getPrivateSessionSettings')
  return requestPrivateMessage({ endpointName: 'getPrivateSessionSettings', url: PRIVATE_MESSAGE_ENDPOINTS.getPrivateSessionSettings, params: { talker_uid: target.talkerId, build: 0, mobi_app: 'web' } })
}

export function buildPrivateSessionActionBody(action: 'top' | 'dnd' | 'push', input: PrivateSessionMutation): PrivateMessageRequestParams {
  if (!validTarget(input) || !isId(input.uid) || !input.csrf || typeof input.enabled !== 'boolean' || (action === 'push' && input.sessionType !== 1))
    throw new TypeError('Invalid session mutation')
  const base = { build: 0, mobi_app: 'web', csrf: input.csrf, csrf_token: input.csrf }
  if (action === 'top')
    return { ...base, talker_id: input.talkerId, session_type: input.sessionType, op_type: input.enabled ? 0 : 1 }
  if (action === 'dnd')
    return { ...base, uid: input.uid, [input.sessionType === 2 ? 'dnd_group_id' : 'dnd_uid']: input.talkerId, setting: input.enabled ? 1 : 0 }
  return { ...base, talker_uid: input.talkerId, setting: input.enabled ? 0 : 1 }
}

async function mutate(action: 'top' | 'dnd' | 'push', endpointName: 'setPrivateSessionTop' | 'setPrivateSessionDnd' | 'setPrivateSessionPush', input: PrivateSessionMutation) {
  try {
    return await requestPrivateMessageForm({ endpointName, url: PRIVATE_MESSAGE_ENDPOINTS[endpointName], query: {}, body: buildPrivateSessionActionBody(action, input) })
  }
  catch { return invalid(endpointName) }
}
export const setPrivateSessionTop = (input: PrivateSessionMutation) => mutate('top', 'setPrivateSessionTop', input)
export const setPrivateSessionDnd = (input: PrivateSessionMutation) => mutate('dnd', 'setPrivateSessionDnd', input)
export const setPrivateSessionPush = (input: PrivateSessionMutation) => mutate('push', 'setPrivateSessionPush', input)

export function buildPrivateUserReportBody(input: PrivateUserReport): PrivateMessageRequestParams {
  if (!input || !isId(input.talkerId) || !input.csrf || !Number.isInteger(input.reason) || input.reason < 0 || input.reason > 6
    || typeof input.description !== 'string' || !input.description.trim() || input.description.length > 60
    || !Array.isArray(input.messageKeys) || input.messageKeys.length > 10 || !input.messageKeys.every(isId)) {
    throw new TypeError('Invalid user report')
  }
  return {
    biz_code: 4,
    accused_uid: input.talkerId,
    object_id: input.talkerId,
    reason_type: input.reason,
    reason_desc: input.description.trim(),
    module: 607,
    comment: JSON.stringify({ group_id: 0, msg_key: '' }),
    extra: JSON.stringify({ msg_keys: input.messageKeys }),
    csrf: input.csrf,
    csrf_token: input.csrf,
  }
}

export async function reportPrivateUser(input: PrivateUserReport) {
  try {
    return await requestPrivateMessageForm({ endpointName: 'reportPrivateUser', url: PRIVATE_MESSAGE_ENDPOINTS.reportPrivateUser, query: {}, body: buildPrivateUserReportBody(input) })
  }
  catch { return invalid('reportPrivateUser') }
}
