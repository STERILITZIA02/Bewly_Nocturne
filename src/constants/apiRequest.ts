export const API_REQUEST_PORT = 'bewly-api-read'
export const CANCELLABLE_API_FUNCTIONS = ['anonymousSearch', 'getDefaultSearchRecommendation', 'getWatchLaterListByPage', 'getWatchLaterLibrary'] as const

export type ApiPortResponse = {
  ok: true
  data: unknown
} | {
  ok: false
  error: { name: string, message: string, code?: number, isRiskControl?: boolean }
}
