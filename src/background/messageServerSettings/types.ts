export const MESSAGE_SERVER_SETTINGS_ENDPOINTS = {
  getSettings: 'https://api.vc.bilibili.com/link_setting/v1/link_setting/get',
  setSetting: 'https://api.vc.bilibili.com/link_setting/v1/link_setting/set',
  getBlockWords: 'https://api.vc.bilibili.com/x/im/link_setting/get_block_words',
  addBlockWord: 'https://api.vc.bilibili.com/x/im/link_setting/add_block_word',
  deleteBlockWord: 'https://api.vc.bilibili.com/x/im/link_setting/del_block_word',
} as const

export type MessageServerSettingsEndpointName = keyof typeof MESSAGE_SERVER_SETTINGS_ENDPOINTS

export type MessageServerSettingsErrorKind
  = | 'login-required'
    | 'risk-control'
    | 'server-error'
    | 'network'
    | 'invalid-response'
    | 'api-error'

export interface MessageServerSettingsError {
  kind: MessageServerSettingsErrorKind
  endpointName: MessageServerSettingsEndpointName
  httpStatus: number
  apiCode?: number
}

export interface MessageServerSettingsApiResponse<T = unknown> {
  code: number
  data: T
  bewlyError?: MessageServerSettingsError
}

export type MessageServerSettingField
  = | 'msg_notify'
    | 'ai_intercept'
    | 'set_comment'
    | 'set_at'
    | 'set_like'
    | 'show_unfollowed_msg'

export type MessageServerSettingValue = number

export type MessageServerSettingsValues = Record<MessageServerSettingField, number>

export interface MessageBlockWordsData {
  words: string[]
  maxWordLength: number
  maxWordsSize: number
}

export type MessageServerSettingsRequestParams = Record<string, string | number | undefined>

export interface MessageServerSettingsRequest {
  endpointName: MessageServerSettingsEndpointName
  url: string
  method: 'GET' | 'POST'
  params?: MessageServerSettingsRequestParams
  body?: MessageServerSettingsRequestParams
}
