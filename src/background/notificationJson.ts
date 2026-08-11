import { ApiRiskControlError } from './apiErrors'

const LARGE_INTEGER_FIELDS = new Set([
  'ack_seqno',
  'ack_ts',
  'begin_seqno',
  'business_id',
  'cursor',
  'dmid',
  'end_seqno',
  'id',
  'item_id',
  'max_seqno',
  'mid',
  'min_seqno',
  'msg_key',
  'msg_seqno',
  'oid',
  'parent',
  'receiver_id',
  'root',
  'rpid',
  'sender_uid',
  'session_ts',
  'source_id',
  'subject_id',
  'talker_id',
  'target_id',
  'top_ts',
  'uid',
])

function isIntegerField(field: string): boolean {
  return LARGE_INTEGER_FIELDS.has(field) || field.endsWith('_id')
}

function findStringEnd(text: string, start: number): number {
  let escaped = false
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"')
      return index
  }
  return -1
}

/**
 * Preserve IM and notification identifiers before JSON.parse can round them.
 * Only integer-valued identifier fields are quoted; timestamps and counts stay numeric.
 */
export function preserveNotificationIntegerFields(text: string): string {
  let output = ''
  let index = 0

  while (index < text.length) {
    if (text[index] !== '"') {
      output += text[index]
      index++
      continue
    }

    const stringEnd = findStringEnd(text, index)
    if (stringEnd < 0) {
      output += text.slice(index)
      break
    }

    const token = text.slice(index, stringEnd + 1)
    output += token
    index = stringEnd + 1

    let colonIndex = index
    while (/\s/.test(text[colonIndex] ?? ''))
      colonIndex++
    if (text[colonIndex] !== ':')
      continue

    const field = JSON.parse(token) as string
    if (!isIntegerField(field))
      continue

    let valueStart = colonIndex + 1
    while (/\s/.test(text[valueStart] ?? ''))
      valueStart++

    let valueEnd = valueStart
    if (text[valueEnd] === '-')
      valueEnd++
    const digitStart = valueEnd
    while (/\d/.test(text[valueEnd] ?? ''))
      valueEnd++

    const delimiter = text[valueEnd]
    const isInteger = valueEnd > digitStart
      && (delimiter === ',' || delimiter === '}' || delimiter === ']' || /\s/.test(delimiter ?? ''))
    if (!isInteger)
      continue

    output += text.slice(index, valueStart)
    output += `"${text.slice(valueStart, valueEnd)}"`
    index = valueEnd
  }

  return output
}

export function parseLosslessNotificationJson(text: string): unknown {
  return JSON.parse(preserveNotificationIntegerFields(text))
}

export async function parseLosslessNotificationResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  const trimmed = text.trimStart()
  if (response.headers.get('content-type')?.includes('text/html')
    || trimmed.startsWith('<!DOCTYPE')
    || trimmed.startsWith('<html')) {
    throw new ApiRiskControlError()
  }
  return parseLosslessNotificationJson(text)
}
