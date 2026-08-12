export type ReplyNotificationTransportErrorKind
  = | 'login-required'
    | 'risk-control'
    | 'invalid-response'
    | 'api-error'

export interface ReplyNotificationTransportError {
  kind: ReplyNotificationTransportErrorKind
  httpStatus: number
  endpointName: 'getReplyNotifications'
}

export interface ReplyNotificationApiResponse {
  code: number
  message?: string
  data: unknown
  bewlyError?: ReplyNotificationTransportError
}

const REPLY_IDENTIFIER_PATTERN = /("(?:id|mid|business_id|subject_id|source_id|root_id|target_id)"\s*:\s*)(-?\d+)/g
const HTML_PREFIX_PATTERN = /^\s*</
const LOGIN_URL_PATTERN = /passport|login/i

function createTransportError(
  kind: ReplyNotificationTransportErrorKind,
  httpStatus: number,
  code = -1,
): ReplyNotificationApiResponse {
  return {
    code,
    data: null,
    bewlyError: {
      kind,
      httpStatus,
      endpointName: 'getReplyNotifications',
    },
  }
}

function classifyHtmlResponse(response: Response): ReplyNotificationTransportErrorKind {
  if (response.status === 401 || response.redirected || LOGIN_URL_PATTERN.test(response.url))
    return 'login-required'

  return 'risk-control'
}

function preserveReplyIdentifiers(jsonText: string): string {
  return jsonText.replace(REPLY_IDENTIFIER_PATTERN, '$1"$2"')
}

export async function parseReplyNotificationResponse(response: Response): Promise<ReplyNotificationApiResponse> {
  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('text/html') || HTML_PREFIX_PATTERN.test(text)) {
    return createTransportError(
      classifyHtmlResponse(response),
      response.status,
      response.status === 401 ? -101 : -412,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(preserveReplyIdentifiers(text))
  }
  catch {
    return createTransportError('invalid-response', response.status)
  }

  if (!parsed || typeof parsed !== 'object' || !('code' in parsed))
    return createTransportError('invalid-response', response.status)

  const result = parsed as ReplyNotificationApiResponse
  if (!response.ok) {
    const kind = response.status === 401
      ? 'login-required'
      : response.status === 412 || response.status === 403
        ? 'risk-control'
        : 'api-error'
    result.bewlyError = {
      kind,
      httpStatus: response.status,
      endpointName: 'getReplyNotifications',
    }
  }

  return result
}
