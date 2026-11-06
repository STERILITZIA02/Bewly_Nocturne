import type { PrivateMessage } from '~/background/privateMessage/types'

import type {
  ParsedPrivateMessageContent,
  PrivateEmote,
  PrivateEmotePackage,
} from './privateMessageRenderers'
import {
  collectPrivateMessageEmotions,
  parsePrivateMessageContent,
  parsePrivateMessageTextSegments,
} from './privateMessageRenderers'

export interface DisplayPrivateMessage {
  msgKey: string
  seqno: string
  senderId: string
  receiverId: string
  msgType: number
  timestamp: number
  isSelf: boolean
  msgStatus: number
  msgSource: number
  source: PrivateMessageSource | null
  content: ParsedPrivateMessageContent
}

export type PrivateMessageSource
  = | 'auto-reply'
    | 'fan-group-system'
    | 'mutual-follow'
    | 'system'
    | 'ai'

export function classifyPrivateMessageSource(msgSource: number): PrivateMessageSource | null {
  if (msgSource >= 8 && msgSource <= 11)
    return 'auto-reply'
  if (msgSource === 13)
    return 'fan-group-system'
  if (msgSource === 17)
    return 'mutual-follow'
  if (msgSource === 18)
    return 'system'
  if (msgSource === 19)
    return 'ai'
  return null
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

function compareDisplayPrivateMessages(
  left: DisplayPrivateMessage,
  right: DisplayPrivateMessage,
): number {
  return comparePrivateMessageSeqno(left.seqno, right.seqno)
    || left.timestamp - right.timestamp
    || left.msgKey.localeCompare(right.msgKey)
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
    msgStatus: message.msg_status,
    msgSource: message.msg_source,
    source: classifyPrivateMessageSource(message.msg_source),
    content: parsePrivateMessageContent(message, emotions),
  })).sort(compareDisplayPrivateMessages)
}

export function hydratePrivateMessageEmotes(
  items: DisplayPrivateMessage[],
  packages: PrivateEmotePackage[],
): DisplayPrivateMessage[] {
  const emotes = new Map<string, PrivateEmote>()
  for (const pkg of packages) {
    for (const emote of pkg.emotes)
      emotes.set(emote.text, emote)
  }
  if (!emotes.size)
    return items
  let changed = false
  const hydrated = items.map<DisplayPrivateMessage>((item) => {
    if (item.content.type !== 'text')
      return item
    const text = item.content.segments.map(segment => segment.text).join('')
    const segments = parsePrivateMessageTextSegments(text, emotes)
    const previous = item.content.segments
    if (segments.length === previous.length && segments.every((segment, index) => {
      const old = previous[index]
      if (segment.type !== old.type || segment.text !== old.text)
        return false
      if (segment.type === 'link')
        return old.type === 'link' && segment.href === old.href
      if (segment.type === 'emote')
        return old.type === 'emote' && segment.url === old.url && segment.size === old.size
      return true
    })) {
      return item
    }
    changed = true
    return {
      ...item,
      content: {
        type: 'text',
        segments,
      },
    }
  })
  return changed ? hydrated : items
}

export function mergePrivateMessages(
  current: DisplayPrivateMessage[],
  incoming: DisplayPrivateMessage[],
): DisplayPrivateMessage[] {
  const byKey = new Map(current.map(item => [item.msgKey, item]))
  for (const item of incoming)
    byKey.set(item.msgKey, item)
  return [...byKey.values()].sort(compareDisplayPrivateMessages)
}

export function getOldestPrivateMessageSeqno(items: DisplayPrivateMessage[]): string {
  return items[0]?.seqno ?? ''
}

export function getLatestPrivateMessageSeqno(items: DisplayPrivateMessage[]): string {
  return items.at(-1)?.seqno ?? ''
}
