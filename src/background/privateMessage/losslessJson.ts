import {
  classifyPrivateMessageApiCode,
  createPrivateMessageErrorResponse,
} from './errors'
import type {
  PrivateMessageApiResponse,
  PrivateMessageEndpointName,
  PrivateMessageTransportErrorKind,
} from './types'

const PRIVATE_MESSAGE_IDENTIFIER_PATTERN = /("(?:talker_id|sender_uid|receiver_id|msg_seqno|msg_key|ack_seqno|min_seqno|max_seqno)"\s*:\s*)(-?\d+)(?=\s*[,}\]])/g
const HTML_PREFIX_PATTERN = /^\s*</
const LOGIN_URL_PATTERN = /passport|login/i
const RISK_CONTROL_HTML_PATTERN = /请求(?:过于)?频繁|访问(?:过于)?频繁|风控|risk[\s_-]*control/i

function getResponseHost(response: Response): string {
  try {
    return response.url ? new URL(response.url).host : ''
  }
  catch {
    return ''
  }
}

function classifyHtmlResponse(
  response: Response,
  text: string,
): PrivateMessageTransportErrorKind {
  if (response.status === 401 || LOGIN_URL_PATTERN.test(response.url))
    return 'login-required'
  if (response.status === 403 || response.status === 412 || RISK_CONTROL_HTML_PATTERN.test(text))
    return 'risk-control'
  if (response.status >= 500)
    return 'server-error'
  return 'invalid-response'
}

export function preservePrivateMessageIdentifiers(jsonText: string): string {
  return jsonText.replace(PRIVATE_MESSAGE_IDENTIFIER_PATTERN, '$1"$2"')
}

export async function parsePrivateMessageResponse(
  response: Response,
  endpointName: PrivateMessageEndpointName = 'getPrivateSessions',
): Promise<PrivateMessageApiResponse> {
  const context = {
    httpStatus: response.status,
    redirected: response.redirected,
    finalHost: getResponseHost(response),
  }

  let text: string
  try {
    text = await response.text()
  }
  catch {
    return createPrivateMessageErrorResponse('network', endpointName, context)
  }

  if (response.status === 401 || LOGIN_URL_PATTERN.test(response.url))
    return createPrivateMessageErrorResponse('login-required', endpointName, context)

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/html') || HTML_PREFIX_PATTERN.test(text)) {
    return createPrivateMessageErrorResponse(
      classifyHtmlResponse(response, text),
      endpointName,
      context,
    )
  }

  if (response.status === 403 || response.status === 412)
    return createPrivateMessageErrorResponse('risk-control', endpointName, context)
  if (response.status >= 500)
    return createPrivateMessageErrorResponse('server-error', endpointName, context)

  let parsed: unknown
  try {
    parsed = JSON.parse(preservePrivateMessageIdentifiers(text))
  }
  catch {
    return createPrivateMessageErrorResponse('invalid-response', endpointName, context)
  }

  if (!parsed || typeof parsed !== 'object' || !Object.hasOwn(parsed, 'code'))
    return createPrivateMessageErrorResponse('invalid-response', endpointName, context)

  const raw = parsed as { code?: unknown, data?: unknown }
  if (typeof raw.code !== 'number')
    return createPrivateMessageErrorResponse('invalid-response', endpointName, context)

  if (!response.ok || raw.code !== 0) {
    const kind = raw.code === 0
      ? 'invalid-response'
      : classifyPrivateMessageApiCode(raw.code)
    return createPrivateMessageErrorResponse(kind, endpointName, {
      ...context,
      apiCode: raw.code,
    })
  }

  return {
    code: 0,
    data: raw.data ?? null,
  }
}
