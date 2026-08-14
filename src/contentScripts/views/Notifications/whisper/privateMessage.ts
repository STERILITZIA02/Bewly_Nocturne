import type { PrivateMessage } from '~/background/privateMessage/types'

export type ParsedPrivateMessageContent
  = | {
    type: 'text'
    segments: PrivateMessageTextSegment[]
  }
  | {
    type: 'image' | 'emoticon'
    src: string
    width: number
    height: number
  }
  | { type: 'recalled' }
  | { type: 'system', text: string }
  | { type: 'unknown' }

export type PrivateMessageTextSegment
  = | { type: 'text', text: string }
    | { type: 'emoji', alt: string, src: string, size: number }

export interface DisplayPrivateMessage {
  msgKey: string
  seqno: string
  senderId: string
  receiverId: string
  msgType: number
  timestamp: number
  isSelf: boolean
  content: ParsedPrivateMessageContent
}

interface PrivateMessageEmotion {
  alt: string
  src: string
  size: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    return ''

  try {
    const normalized = value.startsWith('//') ? `https:${value}` : value
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  }
  catch {
    return ''
  }
}

function parseContentRecord(content: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(content))
  }
  catch {
    return null
  }
}

function normalizeDimension(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function collectPrivateMessageEmotions(eInfos: unknown[]): Map<string, PrivateMessageEmotion> {
  const result = new Map<string, PrivateMessageEmotion>()
  for (const rawInfo of eInfos) {
    const info = asRecord(rawInfo)
    const alt = typeof info?.text === 'string' ? info.text : ''
    const src = normalizeHttpUrl(info?.gif_url) || normalizeHttpUrl(info?.uri)
    if (!alt || !src)
      continue
    result.set(alt, {
      alt,
      src,
      size: normalizeDimension(info?.size),
    })
  }
  return result
}

function splitTextWithEmotions(
  text: string,
  emotions: Map<string, PrivateMessageEmotion>,
): PrivateMessageTextSegment[] {
  if (!text || emotions.size === 0)
    return text ? [{ type: 'text', text }] : []

  const segments: PrivateMessageTextSegment[] = []
  let offset = 0
  while (offset < text.length) {
    let nextIndex = -1
    let nextEmotion: PrivateMessageEmotion | undefined
    for (const emotion of emotions.values()) {
      const index = text.indexOf(emotion.alt, offset)
      if (index !== -1 && (nextIndex === -1 || index < nextIndex)) {
        nextIndex = index
        nextEmotion = emotion
      }
    }

    if (nextIndex === -1 || !nextEmotion) {
      segments.push({ type: 'text', text: text.slice(offset) })
      break
    }
    if (nextIndex > offset)
      segments.push({ type: 'text', text: text.slice(offset, nextIndex) })
    segments.push({
      type: 'emoji',
      alt: nextEmotion.alt,
      src: nextEmotion.src,
      size: nextEmotion.size,
    })
    offset = nextIndex + nextEmotion.alt.length
  }

  return segments
}

function parseMediaContent(
  content: string,
  type: 'image' | 'emoticon',
): ParsedPrivateMessageContent {
  const record = parseContentRecord(content)
  const src = normalizeHttpUrl(record?.url)
  if (!src)
    return { type: 'unknown' }

  return {
    type,
    src,
    width: normalizeDimension(record?.width),
    height: normalizeDimension(record?.height),
  }
}

function parseTextContent(
  content: string,
  emotions: Map<string, PrivateMessageEmotion>,
): ParsedPrivateMessageContent {
  const record = parseContentRecord(content)
  if (typeof record?.content !== 'string')
    return { type: 'unknown' }
  return {
    type: 'text',
    segments: splitTextWithEmotions(record.content, emotions),
  }
}

function parseSystemContent(content: string): ParsedPrivateMessageContent {
  const record = parseContentRecord(content)
  const parsedText = typeof record?.content === 'string'
    ? record.content
    : typeof record?.text === 'string'
      ? record.text
      : ''
  const plainText = parsedText || (!record && !content.trim().startsWith('{') ? content.trim() : '')
  return plainText ? { type: 'system', text: plainText } : { type: 'unknown' }
}

export function parsePrivateMessageContent(
  message: PrivateMessage,
  emotions: Map<string, PrivateMessageEmotion>,
): ParsedPrivateMessageContent {
  if (message.msg_type === 1)
    return parseTextContent(message.content, emotions)
  if (message.msg_type === 2)
    return parseMediaContent(message.content, 'image')
  if (message.msg_type === 5)
    return { type: 'recalled' }
  if (message.msg_type === 6)
    return parseMediaContent(message.content, 'emoticon')
  if (message.msg_type === 18)
    return parseSystemContent(message.content)
  return { type: 'unknown' }
}

function normalizeDecimal(value: string): string {
  const normalized = value.replace(/^0+(?=\d)/, '')
  return /^\d+$/.test(normalized) ? normalized : ''
}

export function comparePrivateMessageSeqno(left: string, right: string): number {
  const normalizedLeft = normalizeDecimal(left)
  const normalizedRight = normalizeDecimal(right)
  if (!normalizedLeft || !normalizedRight)
    return normalizedLeft.localeCompare(normalizedRight)
  if (normalizedLeft.length !== normalizedRight.length)
    return normalizedLeft.length - normalizedRight.length
  return normalizedLeft.localeCompare(normalizedRight)
}

export function transformPrivateMessages(
  messages: PrivateMessage[],
  eInfos: unknown[],
  currentMid: string,
): DisplayPrivateMessage[] {
  const emotions = collectPrivateMessageEmotions(eInfos)
  return messages.map(message => ({
    msgKey: message.msg_key,
    seqno: message.msg_seqno,
    senderId: message.sender_uid,
    receiverId: message.receiver_id,
    msgType: message.msg_type,
    timestamp: message.timestamp,
    isSelf: message.sender_uid === currentMid,
    content: parsePrivateMessageContent(message, emotions),
  })).sort((left, right) => (
    comparePrivateMessageSeqno(left.seqno, right.seqno)
    || left.timestamp - right.timestamp
    || left.msgKey.localeCompare(right.msgKey)
  ))
}

export function mergePrivateMessages(
  current: DisplayPrivateMessage[],
  incoming: DisplayPrivateMessage[],
): DisplayPrivateMessage[] {
  const byKey = new Map(current.map(item => [item.msgKey, item]))
  for (const item of incoming)
    byKey.set(item.msgKey, item)
  return [...byKey.values()].sort((left, right) => (
    comparePrivateMessageSeqno(left.seqno, right.seqno)
    || left.timestamp - right.timestamp
    || left.msgKey.localeCompare(right.msgKey)
  ))
}

export function getOldestPrivateMessageSeqno(items: DisplayPrivateMessage[]): string {
  return items[0]?.seqno ?? ''
}

export function getLatestPrivateMessageSeqno(items: DisplayPrivateMessage[]): string {
  return items.at(-1)?.seqno ?? ''
}
