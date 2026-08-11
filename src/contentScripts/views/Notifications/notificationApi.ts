interface BilibiliApiResponse<T = unknown> {
  code: number
  message?: string
  msg?: string
  data?: T
}

export function asBilibiliApiResponse<T = unknown>(value: unknown): BilibiliApiResponse<T> {
  if (!value || typeof value !== 'object')
    return { code: -1 }
  return value as BilibiliApiResponse<T>
}

export function ensureBilibiliApiSuccess<T = unknown>(value: unknown): BilibiliApiResponse<T> {
  const response = asBilibiliApiResponse<T>(value)
  if (response.code !== 0)
    throw new Error(response.message || response.msg || `Bilibili API error ${response.code}`)
  return response
}

export function isLoginRequiredResponse(value: unknown): boolean {
  return asBilibiliApiResponse(value).code === -101
}
