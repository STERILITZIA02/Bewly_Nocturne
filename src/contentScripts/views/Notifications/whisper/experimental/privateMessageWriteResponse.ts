import type { UploadedPrivateImage } from '~/background/privateMessage/types'

import { asResponse } from '../privateMessageResponse'
import type { PrivateTextSendDiagnostic } from './privateMessageWriteTypes'

export function createTextSendDiagnostic(value: unknown): PrivateTextSendDiagnostic {
  const response = asResponse(value)
  const transportError = response?.bewlyError
  if (transportError) {
    return {
      kind: transportError.kind,
      httpStatus: transportError.httpStatus,
      redirected: transportError.redirected,
      finalHost: transportError.finalHost,
      apiCode: typeof transportError.apiCode === 'number'
        ? transportError.apiCode
        : response.code,
    }
  }

  return {
    kind: response ? 'api-error' : 'invalid-response',
    httpStatus: 0,
    redirected: false,
    finalHost: '',
    apiCode: response?.code ?? null,
  }
}

export function extractSentMessageKey(response: unknown): string {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return ''
  const msgKey = (parsed.data as { msg_key?: unknown }).msg_key
  return typeof msgKey === 'string' ? msgKey : ''
}

export function extractUploadedImage(response: unknown): UploadedPrivateImage | null {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return null
  const data = parsed.data as Partial<UploadedPrivateImage>
  if (
    typeof data.url !== 'string'
    || typeof data.width !== 'number'
    || typeof data.height !== 'number'
    || typeof data.size !== 'number'
    || typeof data.imageType !== 'string'
  ) {
    return null
  }
  return data as UploadedPrivateImage
}
