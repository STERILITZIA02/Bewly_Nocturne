export type NotificationTransportErrorKind
  = | 'login-required'
    | 'risk-control'
    | 'server-error'
    | 'invalid-response'
    | 'api-error'

export type NotificationEndpointName
  = | 'getReplyNotifications'
    | 'getAtNotifications'
    | 'getLikeNotifications'

export interface NotificationTransportError {
  kind: NotificationTransportErrorKind
  httpStatus: number
  endpointName: NotificationEndpointName
  redirected: boolean
  finalUrlHost: string
  bilibiliCode?: number
}

export interface NotificationApiResponse {
  code: number
  message?: string
  data: unknown
  bewlyError?: NotificationTransportError
}

const NOTIFICATION_IDENTIFIER_PATTERN = /("(?:id|mid|business_id|subject_id|source_id|root_id|target_id|item_id)"\s*:\s*)(-?\d+)/g
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

function createTransportError(
  response: Response,
  endpointName: NotificationEndpointName,
  kind: NotificationTransportErrorKind,
  code = -1,
): NotificationApiResponse {
  return {
    code,
    data: null,
    bewlyError: {
      kind,
      httpStatus: response.status,
      endpointName,
      redirected: response.redirected,
      finalUrlHost: getResponseHost(response),
      bilibiliCode: code,
    },
  }
}

function classifyHtmlResponse(response: Response, text: string): NotificationTransportErrorKind {
  if (response.status === 401 || LOGIN_URL_PATTERN.test(response.url))
    return 'login-required'
  if (response.status === 403 || response.status === 412 || RISK_CONTROL_HTML_PATTERN.test(text))
    return 'risk-control'
  if (response.status >= 500)
    return 'server-error'

  return 'invalid-response'
}

function preserveNotificationIdentifiers(jsonText: string): string {
  return jsonText.replace(NOTIFICATION_IDENTIFIER_PATTERN, '$1"$2"')
}

async function parseNotificationResponse(
  response: Response,
  endpointName: NotificationEndpointName,
): Promise<NotificationApiResponse> {
  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('text/html') || HTML_PREFIX_PATTERN.test(text)) {
    const kind = classifyHtmlResponse(response, text)
    return createTransportError(
      response,
      endpointName,
      kind,
      kind === 'login-required' ? -101 : kind === 'risk-control' ? -412 : -1,
    )
  }

  if (response.status === 401)
    return createTransportError(response, endpointName, 'login-required', -101)
  if (response.status === 403 || response.status === 412)
    return createTransportError(response, endpointName, 'risk-control', -412)
  if (response.status >= 500)
    return createTransportError(response, endpointName, 'server-error')

  let parsed: unknown
  try {
    parsed = JSON.parse(preserveNotificationIdentifiers(text))
  }
  catch {
    return createTransportError(response, endpointName, 'invalid-response')
  }

  if (!parsed || typeof parsed !== 'object' || !('code' in parsed))
    return createTransportError(response, endpointName, 'invalid-response')

  const result = parsed as NotificationApiResponse
  if (!response.ok) {
    const bilibiliCode = typeof result.code === 'number' ? result.code : -1
    const kind = bilibiliCode === 0 ? 'invalid-response' : 'api-error'
    result.bewlyError = {
      kind,
      httpStatus: response.status,
      endpointName,
      redirected: response.redirected,
      finalUrlHost: getResponseHost(response),
      bilibiliCode,
    }
  }

  return result
}

export function parseReplyNotificationResponse(response: Response): Promise<NotificationApiResponse> {
  return parseNotificationResponse(response, 'getReplyNotifications')
}

export function parseAtNotificationResponse(response: Response): Promise<NotificationApiResponse> {
  return parseNotificationResponse(response, 'getAtNotifications')
}

export function parseLikeNotificationResponse(response: Response): Promise<NotificationApiResponse> {
  return parseNotificationResponse(response, 'getLikeNotifications')
}
