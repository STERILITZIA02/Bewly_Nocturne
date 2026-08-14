import type {
  PrivateMessageApiResponse,
  PrivateMessageEndpointName,
  PrivateMessageTransportErrorKind,
} from './types'

interface PrivateMessageErrorContext {
  apiCode?: number
  finalHost?: string
  httpStatus?: number
  redirected?: boolean
}

export class PrivateMessageWbiUnavailableError extends Error {
  constructor() {
    super('Private-message WBI signing is unavailable')
    this.name = 'PrivateMessageWbiUnavailableError'
  }
}

export function isPrivateMessageWbiUnavailableError(
  error: unknown,
): error is PrivateMessageWbiUnavailableError {
  return error instanceof PrivateMessageWbiUnavailableError
}

export function classifyPrivateMessageApiCode(code: number): PrivateMessageTransportErrorKind {
  if (code === -101)
    return 'login-required'
  if (code === -403 || code === -412)
    return 'risk-control'
  return 'api-error'
}

export function createPrivateMessageErrorResponse(
  kind: PrivateMessageTransportErrorKind,
  endpointName: PrivateMessageEndpointName,
  context: PrivateMessageErrorContext = {},
): PrivateMessageApiResponse<null> {
  const apiCode = context.apiCode
    ?? (kind === 'login-required' ? -101 : kind === 'risk-control' ? -412 : -1)

  return {
    code: apiCode,
    data: null,
    bewlyError: {
      kind,
      endpointName,
      httpStatus: context.httpStatus ?? 0,
      redirected: context.redirected ?? false,
      finalHost: context.finalHost ?? '',
      apiCode,
    },
  }
}
