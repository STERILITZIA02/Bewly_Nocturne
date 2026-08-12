export type NotificationTransportErrorKind
  = | 'login-required'
    | 'risk-control'
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

function createTransportError(
  endpointName: NotificationEndpointName,
  kind: NotificationTransportErrorKind,
  httpStatus: number,
  code = -1,
): NotificationApiResponse {
  return {
    code,
    data: null,
    bewlyError: {
      kind,
      httpStatus,
      endpointName,
    },
  }
}

function classifyHtmlResponse(response: Response): NotificationTransportErrorKind {
  if (response.status === 401 || response.redirected || LOGIN_URL_PATTERN.test(response.url))
    return 'login-required'

  return 'risk-control'
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
    return createTransportError(
      endpointName,
      classifyHtmlResponse(response),
      response.status,
      response.status === 401 ? -101 : -412,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(preserveNotificationIdentifiers(text))
  }
  catch {
    return createTransportError(endpointName, 'invalid-response', response.status)
  }

  if (!parsed || typeof parsed !== 'object' || !('code' in parsed))
    return createTransportError(endpointName, 'invalid-response', response.status)

  const result = parsed as NotificationApiResponse
  if (!response.ok) {
    const kind = response.status === 401
      ? 'login-required'
      : response.status === 412 || response.status === 403
        ? 'risk-control'
        : 'api-error'
    result.bewlyError = {
      kind,
      httpStatus: response.status,
      endpointName,
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
