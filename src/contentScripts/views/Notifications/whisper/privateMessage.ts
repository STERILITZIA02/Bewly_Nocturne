import type { PrivateMessage } from '~/background/privateMessage/types'

import type { ParsedPrivateMessageContent } from './privateMessageRenderers'
import {
  collectPrivateMessageEmotions,
  parsePrivateMessageContent,
} from './privateMessageRenderers'

export {
  collectPrivateMessageEmotions,
  type ParsedPrivateMessageContent,
  parsePrivateMessageContent,
  PRIVATE_MESSAGE_RENDERERS,
  type PrivateMessageTextSegment,
} from './privateMessageRenderers'

export interface DisplayPrivateMessage {
  msgKey: string
  seqno: string
  senderId: string
  receiverId: string
  msgType: number
  timestamp: number
  isSelf: boolean
  source: PrivateMessageSource | null
  content: ParsedPrivateMessageContent
  localId?: string
  sendState?: PrivateMessageSendState
  serverMsgKey?: string
}

export type PrivateMessageSource
  = | 'auto-reply'
    | 'fan-group-system'
    | 'mutual-follow'
    | 'system'
    | 'ai'

export type PrivateMessageSendState
  = | 'pending'
    | 'preparing'
    | 'uploading'
    | 'sending'
    | 'reconciling'
    | 'sent'
    | 'failed'

export interface OptimisticPrivateTextMessageOptions {
  localId: string
  senderId: string
  receiverId: string
  text: string
  timestamp: number
}

export interface OptimisticPrivateImageMessageOptions {
  localId: string
  senderId: string
  receiverId: string
  objectUrl: string
  timestamp: number
}

export interface PrivateMessageReconcileResult {
  items: DisplayPrivateMessage[]
  reconciled: boolean
}

const PRIVATE_MESSAGE_RECONCILE_WINDOW_SECONDS = 30

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

export function transformPrivateMessages(
  messages: PrivateMessage[],
  eInfos: unknown[],
  currentMid: string,
): DisplayPrivateMessage[] {
  const emotions = collectPrivateMessageEmotions(eInfos)
  return messages.map((message) => {
    const isSelf = message.sender_uid === currentMid
    return {
      msgKey: message.msg_key,
      seqno: message.msg_seqno,
      senderId: message.sender_uid,
      receiverId: message.receiver_id,
      msgType: message.msg_type,
      timestamp: message.timestamp,
      isSelf,
      source: classifyPrivateMessageSource(message.msg_source),
      content: parsePrivateMessageContent(message, emotions),
      sendState: isSelf ? 'sent' as const : undefined,
    }
  }).sort(compareDisplayPrivateMessages)
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

function compareDisplayPrivateMessages(
  left: DisplayPrivateMessage,
  right: DisplayPrivateMessage,
): number {
  if (left.seqno && right.seqno) {
    return comparePrivateMessageSeqno(left.seqno, right.seqno)
      || left.timestamp - right.timestamp
      || left.msgKey.localeCompare(right.msgKey)
  }
  return left.timestamp - right.timestamp
    || Number(Boolean(left.localId)) - Number(Boolean(right.localId))
    || left.msgKey.localeCompare(right.msgKey)
}

export function createOptimisticPrivateTextMessage(
  options: OptimisticPrivateTextMessageOptions,
): DisplayPrivateMessage {
  if (!options.localId || !options.text.trim())
    throw new TypeError('optimistic message requires a localId and non-blank text')
  return {
    msgKey: `local:${options.localId}`,
    seqno: '',
    senderId: options.senderId,
    receiverId: options.receiverId,
    msgType: 1,
    timestamp: options.timestamp,
    isSelf: true,
    source: null,
    content: {
      type: 'text',
      segments: [{ type: 'text', text: options.text }],
    },
    localId: options.localId,
    sendState: 'pending',
  }
}

export function createOptimisticPrivateImageMessage(
  options: OptimisticPrivateImageMessageOptions,
): DisplayPrivateMessage {
  if (!options.localId || !options.objectUrl.startsWith('blob:'))
    throw new TypeError('optimistic image requires a localId and object URL')
  return {
    msgKey: `local:${options.localId}`,
    seqno: '',
    senderId: options.senderId,
    receiverId: options.receiverId,
    msgType: 2,
    timestamp: options.timestamp,
    isSelf: true,
    source: null,
    content: {
      type: 'image',
      src: options.objectUrl,
      width: 0,
      height: 0,
    },
    localId: options.localId,
    sendState: 'preparing',
  }
}

export function getPrivateMessageText(message: DisplayPrivateMessage): string {
  if (message.content.type !== 'text')
    return ''
  return message.content.segments.map(segment => (
    segment.type === 'emoji' ? segment.alt : segment.text
  )).join('')
}

export function reconcileOptimisticPrivateMessages(
  items: DisplayPrivateMessage[],
  localId: string,
): PrivateMessageReconcileResult {
  const deduped = mergePrivateMessages([], items)
  const optimistic = deduped.find(item => item.localId === localId)
  if (!optimistic)
    return { items: deduped, reconciled: true }

  const optimisticText = getPrivateMessageText(optimistic)
  const serverMatch = deduped.find((item) => {
    if (item.localId || !item.isSelf || item.msgType !== optimistic.msgType)
      return false
    if (optimistic.serverMsgKey)
      return item.msgKey === optimistic.serverMsgKey
    if (optimistic.msgType !== 1)
      return false
    return (
      getPrivateMessageText(item) === optimisticText
      && Math.abs(item.timestamp - optimistic.timestamp) <= PRIVATE_MESSAGE_RECONCILE_WINDOW_SECONDS
    )
  })
  if (!serverMatch)
    return { items: deduped, reconciled: false }

  return {
    items: deduped.filter(item => item.localId !== localId),
    reconciled: true,
  }
}

export function getOldestPrivateMessageSeqno(items: DisplayPrivateMessage[]): string {
  return items.find(item => item.seqno)?.seqno ?? ''
}

export function getLatestPrivateMessageSeqno(items: DisplayPrivateMessage[]): string {
  return items.findLast(item => item.seqno)?.seqno ?? ''
}
