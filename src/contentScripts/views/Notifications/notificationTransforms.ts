import type {
  AutoReplyText,
  AutoReplyType,
  ConversationPage,
  DisplayConversation,
  DisplayMessage,
  DisplayMessageContent,
  DisplayNotification,
  DisplayNotificationActor,
  DisplayNotificationLink,
  MessagePage,
  MessageSettingState,
  NotificationFeedPage,
  NotificationFeedSection,
  NotificationMode,
} from './types'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function asNotificationMode(value: unknown): NotificationMode {
  const mode = asNumber(value)
  return mode === 1 || mode === 2 ? mode : 0
}

function normalizeUnixTimestamp(value: unknown): number {
  const timestamp = asNumber(value)
  if (timestamp > 100_000_000_000_000)
    return Math.floor(timestamp / 1_000_000)
  if (timestamp > 100_000_000_000)
    return Math.floor(timestamp / 1_000)
  return timestamp
}

export function toStringId(value: unknown): string {
  return asString(value)
}

export function createConversationKey(sessionType: unknown, talkerId: unknown): string {
  return `${toStringId(sessionType)}:${toStringId(talkerId)}`
}

export interface ConversationIdentity {
  name: string
  face: string
}

export function safeMessageUrl(value: unknown): string {
  const raw = asString(value)
  if (!raw)
    return ''

  try {
    const url = new URL(raw, 'https://www.bilibili.com/')
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  }
  catch {
    return ''
  }
}

function parseJsonRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object')
    return asRecord(value)
  if (typeof value !== 'string' || !value)
    return {}

  try {
    return asRecord(JSON.parse(value))
  }
  catch {
    return {}
  }
}

function firstString(record: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = asString(record[key])
    if (value)
      return value
  }
  return ''
}

function imageFromRecord(record: UnknownRecord): string {
  return safeMessageUrl(firstString(record, ['url', 'image', 'image_url', 'pic', 'thumb', 'cover']))
}

function parseActor(value: unknown): DisplayNotificationActor {
  const actor = asRecord(value)
  return {
    id: toStringId(actor.mid ?? actor.uid ?? actor.id),
    name: firstString(actor, ['nickname', 'name', 'uname']),
    avatar: safeMessageUrl(firstString(actor, ['avatar', 'face', 'pic'])) || firstString(actor, ['avatar', 'face', 'pic']),
  }
}

export function parsePrivateMessageContent(messageType: number, rawContent: unknown): DisplayMessageContent {
  const content = parseJsonRecord(rawContent)

  const unknownContent = (): DisplayMessageContent => ({
    kind: 'unknown',
    messageType,
    summary: firstString(content, ['title', 'content', 'text', 'desc']),
  })

  if (messageType === 1) {
    return {
      kind: 'text',
      text: firstString(content, ['content', 'text', 'title']),
    }
  }

  if (messageType === 16) {
    const text = firstString(content, ['reply_content', 'content', 'text'])
    return text ? { kind: 'text', text } : unknownContent()
  }

  if (messageType === 2 || messageType === 6) {
    return {
      kind: 'image',
      url: imageFromRecord(content),
      width: Math.max(0, asNumber(content.width)),
      height: Math.max(0, asNumber(content.height)),
      size: Math.max(0, asNumber(content.size)),
      imageType: asString(content.imageType ?? content.image_type),
      alt: firstString(content, ['title', 'alt']),
    }
  }

  if (messageType === 5 || messageType === 8) {
    return { kind: 'withdrawn' }
  }

  if ([4, 7, 9, 11, 12, 13, 14, 15, 17].includes(messageType)) {
    const result = {
      kind: 'share' as const,
      title: firstString(content, ['title', 'headline', 'name']),
      description: firstString(content, ['desc', 'description', 'content', 'author']),
      image: imageFromRecord(content),
      href: safeMessageUrl(firstString(content, ['url', 'jump_url', 'jumpUrl', 'source_url', 'uri'])),
    }
    return result.title || result.description || result.image || result.href ? result : unknownContent()
  }

  if ([10, 18, 19, 50, 51, 53].includes(messageType)) {
    const result = {
      kind: 'notice' as const,
      title: firstString(content, ['title', 'headline', 'name']),
      text: firstString(content, ['content', 'text', 'desc', 'description']),
      href: safeMessageUrl(firstString(content, ['url', 'jump_url', 'jumpUrl', 'uri'])),
    }
    return result.title || result.text || result.href ? result : unknownContent()
  }

  return unknownContent()
}

function parsePrivateMessageDisplayContent(message: UnknownRecord): DisplayMessageContent {
  if (asNumber(message.msg_status) === 1)
    return { kind: 'withdrawn' }
  return parsePrivateMessageContent(asNumber(message.msg_type), message.content)
}

export function transformPrivateMessage(value: unknown, currentAccountId: string): DisplayMessage {
  const message = asRecord(value)
  const id = toStringId(message.msg_key ?? message.msg_seqno)
  const senderId = toStringId(message.sender_uid)
  const messageType = asNumber(message.msg_type)
  const statusValue = asNumber(message.msg_status)

  return {
    id,
    seqno: toStringId(message.msg_seqno),
    senderId,
    receiverId: toStringId(message.receiver_id),
    timestamp: asNumber(message.timestamp),
    messageType,
    autoReply: [8, 9, 10, 11].includes(asNumber(message.msg_source)) || messageType === 16,
    outgoing: senderId === currentAccountId,
    status: statusValue === -1 ? 'sending' : statusValue === -2 ? 'failed' : 'sent',
    content: parsePrivateMessageDisplayContent(message),
  }
}

function summarizeMessageContent(content: DisplayMessageContent): string {
  switch (content.kind) {
    case 'text':
      return content.text
    case 'image':
      return ''
    case 'share':
      return content.title || content.description
    case 'notice':
      return content.title || content.text
    case 'withdrawn':
      return ''
    default:
      return content.summary
  }
}

export function messageSummary(value: unknown): string {
  const message = asRecord(value)
  return summarizeMessageContent(parsePrivateMessageDisplayContent(message))
}

export function transformConversation(value: unknown, identity?: ConversationIdentity): DisplayConversation {
  const session = asRecord(value)
  const account = asRecord(session.account_info)
  const talkerId = toStringId(session.talker_id ?? account.mid)
  const sourceSessionType = toStringId(session.session_type || 1)
  const isSupportGroup = sourceSessionType === '3'
  const sessionType = isSupportGroup ? '2' : sourceSessionType
  const lastMessage = asRecord(session.last_msg)
  const lastMessageContent = parsePrivateMessageDisplayContent(lastMessage)
  const name = sessionType === '2'
    ? firstString(session, ['group_name', 'talker_name']) || firstString(account, ['name', 'uname', 'nickname']) || identity?.name || ''
    : identity?.name || firstString(account, ['name', 'uname', 'nickname']) || firstString(session, ['group_name', 'talker_name'])

  return {
    key: isSupportGroup ? `support-group:${talkerId}` : createConversationKey(sessionType, talkerId),
    talkerId,
    sessionType,
    sourceSessionType,
    sessionTimestamp: toStringId(session.session_ts),
    name,
    avatar: sessionType === '2'
      ? safeMessageUrl(firstString(session, ['group_cover', 'avatar'])) || safeMessageUrl(firstString(account, ['pic_url', 'face', 'avatar'])) || safeMessageUrl(identity?.face)
      : safeMessageUrl(identity?.face) || safeMessageUrl(firstString(account, ['pic_url', 'face', 'avatar'])) || safeMessageUrl(firstString(session, ['group_cover', 'avatar'])),
    lastMessage: summarizeMessageContent(lastMessageContent),
    lastMessageKind: lastMessageContent.kind,
    timestamp: normalizeUnixTimestamp(lastMessage.timestamp ?? session.session_ts),
    unreadCount: Math.max(0, asNumber(session.unread_count) + asNumber(session.biz_msg_unread_count)),
    maxSeqno: toStringId(session.max_seqno ?? lastMessage.msg_seqno),
    canalToken: asString(session.canal_token),
    isPinned: asNumber(session.top_ts) > 0,
    isMuted: asBoolean(session.is_dnd),
    isFollowed: asBoolean(session.is_follow),
    isIntercepted: asBoolean(session.is_intercept),
    isTrusted: asBoolean(session.is_trust),
    isSystem: ['3', '5'].includes(sourceSessionType) || asNumber(session.system_msg_type) > 0,
    isSupportGroup,
  }
}

export function transformConversationPage(response: unknown): ConversationPage {
  const root = asRecord(response)
  const data = asRecord(root.data)
  const rawItems = asArray(data.session_list)
  const items = dedupeBy(
    rawItems.map(item => transformConversation(item)).filter(item => item.talkerId),
    item => item.key,
  )
  const nextTimestamp = toStringId(asRecord(rawItems.at(-1)).session_ts)
  return {
    items,
    hasMore: asBoolean(data.has_more),
    nextTimestamp,
  }
}

export function transformMessagePage(response: unknown, currentAccountId: string): MessagePage {
  const root = asRecord(response)
  const data = asRecord(root.data)
  const items = dedupeDisplayMessages(
    asArray(data.messages)
      .map(message => transformPrivateMessage(message, currentAccountId))
      .filter(message => message.id),
  )
  return {
    items,
    hasMore: asBoolean(data.has_more),
    minSeqno: toStringId(data.min_seqno ?? items.at(-1)?.seqno),
    maxSeqno: toStringId(data.max_seqno ?? items[0]?.seqno),
  }
}

function getNotificationTimestamp(value: unknown): number {
  const notification = asRecord(value)
  return normalizeUnixTimestamp(
    notification.reply_time
    ?? notification.at_time
    ?? notification.like_time
    ?? notification.time_at
    ?? notification.timestamp,
  )
}

function getExplicitNotificationUnread(value: unknown): boolean {
  const notification = asRecord(value)
  if (Object.hasOwn(notification, 'is_read'))
    return !asBoolean(notification.is_read)
  if (Object.hasOwn(notification, 'unread'))
    return asBoolean(notification.unread)
  return false
}

function parseSystemNotificationContent(value: unknown): { body: string, links: DisplayNotificationLink[] } {
  let body = value && typeof value === 'object'
    ? firstString(asRecord(value), ['web', 'text', 'content'])
    : asString(value)
  if (!body)
    return { body: '', links: [] }

  try {
    const parsed = asRecord(JSON.parse(body))
    body = firstString(parsed, ['web', 'text', 'content']) || body
  }
  catch {
    // System notification content is also returned as plain text.
  }

  const links: DisplayNotificationLink[] = []
  const seen = new Set<string>()
  const addLink = (text: string, rawHref: string) => {
    const href = safeMessageUrl(rawHref)
    if (!href || seen.has(href))
      return false
    seen.add(href)
    links.push({ text: text.trim() || rawHref, href })
    return true
  }

  const linkPattern = /#\{([^{}]+)\}\{(?:"([^{}"]+)"|([^{}]+))\}|https?:\/\/[^\s<>{}"'，。！？、；：]+|(^|[^a-z0-9])(BV[0-9a-z]{10}|av\d+|cv\d+)(?=$|[^a-z0-9])/gi
  body = body.replace(linkPattern, (match, label: string | undefined, quotedHref: string | undefined, href: string | undefined, prefix: string | undefined, token: string | undefined) => {
    if (label) {
      addLink(label, quotedHref || href || '')
      return label
    }

    if (token) {
      const tokenHref = /^cv/i.test(token)
        ? `https://www.bilibili.com/read/${token}/`
        : `https://www.bilibili.com/video/${token}`
      return addLink(token, tokenHref) ? prefix || '' : match
    }

    const rawHref = match.replace(/[),.;!?]+$/, '')
    const trailing = match.slice(rawHref.length)
    return addLink(rawHref, rawHref) ? ` ${trailing}` : match
  })

  return {
    body: body
      .replace(/\s+([，。！？、；：,.!?;:])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim(),
    links,
  }
}

function transformNotification(value: unknown, section: NotificationFeedSection, unread: boolean): DisplayNotification {
  const notification = asRecord(value)
  const item = asRecord(notification.item)
  const danmu = asRecord(item.danmu)
  const isDanmu = item.type === 'danmu'
  const actors = (section === 'love'
    ? asArray(notification.users)
    : [notification.user])
    .map(parseActor)
    .filter(actor => actor.id || actor.name)
  const timestamp = getNotificationTimestamp(notification)
  const rawBody = firstString(item, ['source_content', 'desc', 'content']) || firstString(notification, ['content'])
  const content = section === 'system'
    ? parseSystemNotificationContent(
        [item.source_content, item.desc, item.content, notification.content]
          .find(value => asString(value) || (value !== null && typeof value === 'object')),
      )
    : { body: rawBody, links: [] }
  const href = safeMessageUrl(firstString(item, ['uri', 'url', 'jump_url'])) || safeMessageUrl(firstString(notification, ['url', 'jump_url']))

  return {
    id: toStringId(notification.id ?? notification.cursor ?? `${section}:${timestamp}:${actors[0]?.id || ''}`),
    cursor: toStringId(notification.cursor ?? notification.id),
    section,
    actors,
    actorCount: Math.max(actors.length, asNumber(notification.counts, actors.length)),
    title: firstString(item, ['title', 'subject_title']) || firstString(notification, ['title']),
    body: content.body,
    links: content.links.filter(link => link.href !== href),
    quote: firstString(item, ['target_reply_content', 'source_content']),
    image: imageFromRecord(item) || imageFromRecord(notification),
    href,
    timestamp,
    unread,
    canReply: !asBoolean(item.hide_reply_button) && (section === 'reply' || section === 'at'),
    canLike: section === 'reply',
    liked: asBoolean(item.like_state ?? notification.like_state),
    subjectId: toStringId(item.subject_id),
    sourceId: toStringId(item.source_id),
    rootId: toStringId(item.root_id ?? item.source_id),
    parentId: toStringId(item.source_id),
    businessType: isDanmu ? 0 : asNumber(item.business_id),
    isDanmu,
    danmuAid: toStringId(danmu.aid),
    danmuProgress: asNumber(danmu.progress),
    rawType: asString(item.type),
  }
}

export function transformNotificationFeedPage(response: unknown, section: NotificationFeedSection): NotificationFeedPage {
  const root = asRecord(response)
  const rawData = root.data
  const data = asRecord(rawData)
  const latest = asRecord(data.latest)
  const total = asRecord(data.total)
  const cursor = asRecord(data.cursor ?? total.cursor)
  const latestItems = asArray(latest.items)
  const directItems = asArray(data.items)
  const totalItems = asArray(total.items)
  const systemItems = asArray(data.system_notify_list)
  const arrayItems = asArray(rawData)
  const lastViewAt = asNumber(section === 'love' ? latest.last_view_at : data.last_view_at)
  const rawItems = section === 'love'
    ? [...latestItems, ...directItems, ...totalItems]
    : [...directItems, ...systemItems, ...arrayItems]
  const transformedEntries = section === 'love'
    ? [
        ...latestItems.map(item => ({ item, unread: getNotificationTimestamp(item) > lastViewAt })),
        ...directItems.map(item => ({ item, unread: getNotificationTimestamp(item) > lastViewAt })),
        ...totalItems.map(item => ({ item, unread: false })),
      ]
    : rawItems.map(item => ({
        item,
        unread: section === 'reply' || section === 'at'
          ? getNotificationTimestamp(item) > lastViewAt
          : getExplicitNotificationUnread(item),
      }))
  const transformedItems = dedupeBy(
    transformedEntries.map(({ item, unread }) => transformNotification(item, section, unread)),
    item => item.id,
  )
  const lastSystemCursor = section === 'system'
    ? transformedItems.at(-1)?.cursor || ''
    : ''

  return {
    items: transformedItems,
    cursor: {
      id: toStringId(cursor.id ?? cursor.cursor) || lastSystemCursor,
      time: asNumber(cursor.time),
      isEnd: asBoolean(cursor.is_end) || (!rawItems.length && !cursor.id),
    },
  }
}

export interface MessageSettingsTransformExtras {
  systemSettingsResponse: unknown
  antiDisturbResponse: unknown
  autoReplyResponses: Partial<Record<AutoReplyType, unknown>>
}

function transformAutoReplyTexts(response: unknown, type: AutoReplyType): AutoReplyText[] {
  const data = asRecord(asRecord(response).data)
  return asArray(data.texts).map((value) => {
    const text = asRecord(value)
    return {
      id: toStringId(text.id),
      type,
      reply: asString(text.reply),
      title: asString(text.title),
      key1: asString(text.key1),
      key2: asString(text.key2),
    }
  })
}

export function transformMessageSettings(
  response: unknown,
  blockWordsResponse: unknown,
  extras: MessageSettingsTransformExtras,
): MessageSettingState {
  const root = asRecord(response)
  const data = asRecord(root.data)
  const blockRoot = asRecord(blockWordsResponse)
  const blockData = asRecord(blockRoot.data)
  const antiHarassment = asRecord(data.anti_harassment)
  const systemData = asRecord(asRecord(extras.systemSettingsResponse).data)
  const antiDisturbData = asRecord(asRecord(extras.antiDisturbResponse).data)
  const rawWords = asArray(blockData.words ?? blockData.list ?? blockData.items)
  const commentMode = asNotificationMode(data.set_comment)
  const mentionMode = asNotificationMode(data.set_at)
  return {
    values: {
      messageNotification: asNumber(data.msg_notify) !== 3,
      commentNotification: commentMode !== 2,
      mentionNotification: mentionMode !== 2,
      likeNotification: asNumber(data.set_like) !== 5,
      followedAutoReply: asBoolean(data.followed_reply),
      keywordAutoReply: asBoolean(data.keys_reply),
      receivedMessageAutoReply: asBoolean(data.recv_reply),
      voyageAutoReply: asBoolean(data.voyage_reply),
      aiIntercept: asBoolean(data.ai_intercept),
      antiHarassment: asNumber(antiHarassment.open) === 1,
      receiveUnfollowedMessage: asBoolean(data.receive_unfollow_msg),
      showUnfollowedMessage: asBoolean(data.show_unfollowed_msg),
      receiveGroupMessage: asBoolean(data.should_receive_group),
      foldGroupMessage: asBoolean(data.is_group_fold),
    },
    notificationModes: {
      comment: commentMode,
      mention: mentionMode,
    },
    antiHarassmentConfig: {
      open: asNumber(antiHarassment.open),
      show: asNumber(antiHarassment.show),
      flowMeOpen: asNumber(antiHarassment.flow_me_open),
      meFlowOpen: asNumber(antiHarassment.me_flow_open),
      expireDate: asString(antiHarassment.expire_date),
    },
    antiDisturb: {
      isOpen: asBoolean(antiDisturbData.is_open),
      options: asArray(antiDisturbData.options).map((value) => {
        const option = asRecord(value)
        return {
          id: asNumber(option.id),
          title: firstString(option, ['title', 'name']),
          content: firstString(option, ['content', 'desc']),
          endTime: toStringId(option.end_time),
        }
      }),
      selectedId: asNumber(antiDisturbData.selected_id),
      endTime: toStringId(antiDisturbData.end_time),
      title: asString(antiDisturbData.title),
      content: asString(antiDisturbData.content),
      needShowDialog: asBoolean(antiDisturbData.need_show_dialog),
    },
    system: {
      autoReplyAvailable: asBoolean(systemData.is_auto_reply_available),
      autoReplyDescription: asString(systemData.auto_reply_msg_desc),
      hintTitle: asString(systemData.vc_hint_title),
      hintTitleButton: asString(systemData.vc_hint_title_button),
      hintDetail: asString(systemData.vc_hint_detail),
      hintDetailButton: asString(systemData.vc_hint_detail_button),
      receiveUnfollowedWhitelist: asBoolean(systemData.is_receive_unfollow_wl),
    },
    autoReplyTexts: {
      1: transformAutoReplyTexts(extras.autoReplyResponses[1], 1),
      2: transformAutoReplyTexts(extras.autoReplyResponses[2], 2),
      3: transformAutoReplyTexts(extras.autoReplyResponses[3], 3),
      5: transformAutoReplyTexts(extras.autoReplyResponses[5], 5),
    },
    blockWords: rawWords
      .map(value => typeof value === 'string' ? value : firstString(asRecord(value), ['content', 'word']))
      .filter(Boolean),
    limits: {
      maxBlockWords: asNumber(blockData.max_words_size ?? blockData.max_count) || null,
      maxBlockWordLength: asNumber(blockData.max_word_length ?? blockData.max_length) || null,
    },
  }
}

export function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyOf(item)
    if (!key || seen.has(key))
      return false
    seen.add(key)
    return true
  })
}

export function dedupeDisplayMessages<T extends { id: string }>(items: T[]): T[] {
  return dedupeBy(items, item => item.id)
}

export function mergeUniqueById<T extends { id: string }>(current: T[], next: T[], prepend = false): T[] {
  return dedupeDisplayMessages(prepend ? [...next, ...current] : [...current, ...next])
}

export function mergeUniqueConversations(current: DisplayConversation[], next: DisplayConversation[]): DisplayConversation[] {
  const byKey = new Map(current.map(item => [item.key, item]))
  next.forEach((item) => {
    const existing = byKey.get(item.key)
    const merged = existing?.unreadCount === 0
      && existing.maxSeqno
      && existing.maxSeqno === item.maxSeqno
      ? { ...item, unreadCount: 0 }
      : item
    byKey.set(item.key, merged)
  })
  return [...byKey.values()].sort((left, right) => {
    if (left.isPinned !== right.isPinned)
      return left.isPinned ? -1 : 1
    return right.timestamp - left.timestamp
  })
}

export function markConversationRead(items: DisplayConversation[], key: string): boolean {
  const item = items.find(candidate => candidate.key === key)
  if (!item)
    return false
  item.unreadCount = 0
  return true
}
