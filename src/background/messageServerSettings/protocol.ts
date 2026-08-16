import type {
  MessageBlockWordsData,
  MessageServerSettingField,
  MessageServerSettingsApiResponse,
  MessageServerSettingsRequestParams,
  MessageServerSettingsValues,
} from './types'
import { MESSAGE_SERVER_SETTINGS_ENDPOINTS } from './types'

export const MESSAGE_SERVER_SETTING_VALUES = {
  msg_notify: [1, 3],
  ai_intercept: [0, 1],
  set_comment: [0, 1, 2],
  set_at: [0, 1, 2],
  set_like: [0, 5],
  show_unfollowed_msg: [0, 1],
} as const satisfies Record<MessageServerSettingField, readonly number[]>

export const MESSAGE_SERVER_SETTING_FIELDS = Object.freeze(
  Object.keys(MESSAGE_SERVER_SETTING_VALUES) as MessageServerSettingField[],
)

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isSuccessfulResponse(value: unknown): value is MessageServerSettingsApiResponse<unknown> {
  const response = asRecord(value)
  return response?.code === 0
}

export function isMessageServerSettingField(value: unknown): value is MessageServerSettingField {
  return typeof value === 'string' && Object.hasOwn(MESSAGE_SERVER_SETTING_VALUES, value)
}

export function isMessageServerSettingValue(
  field: MessageServerSettingField,
  value: unknown,
): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && (MESSAGE_SERVER_SETTING_VALUES[field] as readonly number[]).includes(value)
}

export function buildMessageServerSettingsGetParams(): MessageServerSettingsRequestParams {
  return {
    msg_notify: 1,
    show_unfollowed_msg: 1,
    build: 0,
    mobi_app: 'web',
  }
}

export function buildMessageServerSettingUpdate(
  field: MessageServerSettingField,
  value: number,
) {
  if (!isMessageServerSettingValue(field, value))
    throw new TypeError('invalid message server setting value')

  return {
    url: MESSAGE_SERVER_SETTINGS_ENDPOINTS.setSetting,
    body: {
      [field]: value,
      build: 0,
      mobi_app: 'web',
    } satisfies MessageServerSettingsRequestParams,
  }
}

export function parseMessageServerSettingsResponse(
  value: unknown,
): Partial<MessageServerSettingsValues> | null {
  if (!isSuccessfulResponse(value))
    return null
  const data = asRecord((value as MessageServerSettingsApiResponse).data)
  if (!data)
    return null

  const result: Partial<MessageServerSettingsValues> = {}
  for (const field of MESSAGE_SERVER_SETTING_FIELDS) {
    if (isMessageServerSettingValue(field, data[field]))
      result[field] = data[field] as number
  }
  return Object.keys(result).length > 0 ? result : null
}

export function parseMessageBlockWordsResponse(value: unknown): MessageBlockWordsData | null {
  if (!isSuccessfulResponse(value))
    return null
  const data = asRecord((value as MessageServerSettingsApiResponse).data)
  if (!data || !Array.isArray(data.words))
    return null

  const words = Array.from(new Set(data.words.flatMap((item) => {
    const content = asRecord(item)?.content
    return typeof content === 'string' && content.trim() ? [content.trim()] : []
  })))
  const maxWordLength = data.max_word_length
  const maxWordsSize = data.max_words_size
  if (
    typeof maxWordLength !== 'number'
    || !Number.isFinite(maxWordLength)
    || typeof maxWordsSize !== 'number'
    || !Number.isFinite(maxWordsSize)
  ) {
    return null
  }
  return {
    words,
    maxWordLength: Math.max(0, Math.trunc(maxWordLength)),
    maxWordsSize: Math.max(0, Math.trunc(maxWordsSize)),
  }
}

export function buildMessageBlockWordMutation(
  operation: 'add' | 'delete',
  word: string,
) {
  const content = word.trim()
  if (!content)
    throw new TypeError('message block word is required')
  return {
    url: operation === 'add'
      ? MESSAGE_SERVER_SETTINGS_ENDPOINTS.addBlockWord
      : MESSAGE_SERVER_SETTINGS_ENDPOINTS.deleteBlockWord,
    body: { content },
  }
}
