export const APP_CLIENT_PORT = 'bewly-app-client'
export const APP_CLIENT_ID = 'android_hd'
export const APP_CLIENT_APP_KEY = 'dfca71928277209b'
export const APP_CLIENT_REQUEST_TIMEOUT_MS = 15_000

export type AppClientEndpoint
  = | 'qrcodeAuthCode'
    | 'qrcodePoll'
    | 'refreshTokenV3'
    | 'refreshTokenV2'
    | 'feedIndex'
    | 'feedDislike'
    | 'feedDislikeCancel'

export type AppClientParamValue = string | number | boolean | null | undefined

export interface AppClientRequest {
  endpoint: AppClientEndpoint
  params: Record<string, AppClientParamValue>
  mid?: number | null
  deadline?: number
}

export type AppClientErrorKind = 'rules' | 'device' | 'timeout' | 'aborted' | 'network' | 'http' | 'invalid'

export type AppClientResponse
  = | { ok: true, data: unknown }
    | { ok: false, error: { kind: AppClientErrorKind, message: string, status?: number, dispatched: boolean } }

export const APP_CLIENT_QR_PARAMS = {
  local_id: '0',
  platform: 'android',
  mobi_app: APP_CLIENT_ID,
} as const

export const APP_CLIENT_FEED_PARAMS = {
  build: 8430300,
  channel: 'master',
  column: 2,
  device: 'phone',
  device_name: 'android',
  device_type: 0,
  disable_rcmd: 0,
  flush: 8,
  fnval: 976,
  fnver: 0,
  force_host: 2,
  fourk: 1,
  guidance: 1,
  https_url_req: 1,
  mobi_app: 'android_i',
  network: 'wifi',
  platform: 'android',
  player_net: 1,
  qn: 32,
  recsys_mode: 0,
  statistics: '{"appId":1,"platform":3,"version":"8.43.0","abtest":""}',
  voice_balance: 0,
} as const

export const APP_CLIENT_FEEDBACK_PARAMS = {
  build: 1,
  mobi_app: 'android',
} as const
