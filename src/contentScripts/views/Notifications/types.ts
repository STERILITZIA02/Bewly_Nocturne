export type NotificationFeedSection = 'reply' | 'at' | 'love' | 'system'

export interface DisplayNotificationActor {
  id: string
  name: string
  avatar: string
}

export interface DisplayNotificationLink {
  text: string
  href: string
}

export interface DisplayNotification {
  id: string
  cursor: string
  section: NotificationFeedSection
  actors: DisplayNotificationActor[]
  actorCount: number
  title: string
  body: string
  links: DisplayNotificationLink[]
  quote: string
  image: string
  href: string
  timestamp: number
  unread: boolean
  canReply: boolean
  canLike: boolean
  liked: boolean
  subjectId: string
  sourceId: string
  rootId: string
  parentId: string
  businessType: number
  isDanmu: boolean
  danmuAid: string
  danmuProgress: number
  rawType: string
}

export interface DisplayConversation {
  key: string
  talkerId: string
  sessionType: string
  sourceSessionType: string
  sessionTimestamp: string
  name: string
  avatar: string
  lastMessage: string
  lastMessageKind: DisplayMessageContent['kind']
  timestamp: number
  unreadCount: number
  maxSeqno: string
  canalToken: string
  isPinned: boolean
  isMuted: boolean
  isFollowed: boolean
  isIntercepted: boolean
  isTrusted: boolean
  isSystem: boolean
  isSupportGroup: boolean
}

export interface TextMessageContent {
  kind: 'text'
  text: string
}

export interface ImageMessageContent {
  kind: 'image'
  url: string
  width: number
  height: number
  size: number
  imageType: string
  alt: string
}

export interface ShareMessageContent {
  kind: 'share'
  title: string
  description: string
  image: string
  href: string
}

export interface NoticeMessageContent {
  kind: 'notice'
  title: string
  text: string
  href: string
}

export interface WithdrawnMessageContent {
  kind: 'withdrawn'
}

export interface UnknownMessageContent {
  kind: 'unknown'
  messageType: number
  summary: string
}

export type DisplayMessageContent
  = | TextMessageContent
    | ImageMessageContent
    | ShareMessageContent
    | NoticeMessageContent
    | WithdrawnMessageContent
    | UnknownMessageContent

export interface DisplayMessage {
  id: string
  seqno: string
  senderId: string
  receiverId: string
  timestamp: number
  messageType: number
  autoReply: boolean
  outgoing: boolean
  status: 'sent' | 'sending' | 'failed'
  content: DisplayMessageContent
}

export interface NotificationCursor {
  id: string
  time: number
  isEnd: boolean
}

export interface ConversationPage {
  items: DisplayConversation[]
  hasMore: boolean
  nextTimestamp: string
}

export interface MessagePage {
  items: DisplayMessage[]
  hasMore: boolean
  minSeqno: string
  maxSeqno: string
}

export interface NotificationFeedPage {
  items: DisplayNotification[]
  cursor: NotificationCursor
}

export interface MessageSettingValues {
  messageNotification: boolean
  commentNotification: boolean
  mentionNotification: boolean
  likeNotification: boolean
  followedAutoReply: boolean
  keywordAutoReply: boolean
  receivedMessageAutoReply: boolean
  voyageAutoReply: boolean
  aiIntercept: boolean
  antiHarassment: boolean
  receiveUnfollowedMessage: boolean
  showUnfollowedMessage: boolean
  receiveGroupMessage: boolean
  foldGroupMessage: boolean
}

export type NotificationMode = 0 | 1 | 2
export type NotificationModeKey = 'comment' | 'mention'

export type AutoReplyType = 1 | 2 | 3 | 5
export type SimpleAutoReplyType = Exclude<AutoReplyType, 2>

export interface AutoReplyText {
  id: string
  type: AutoReplyType
  reply: string
  title: string
  key1: string
  key2: string
}

export interface AntiDisturbOption {
  id: number
  title: string
  content: string
  endTime: string
}

export interface MessageSettingState {
  values: MessageSettingValues
  notificationModes: Record<NotificationModeKey, NotificationMode>
  antiHarassmentConfig: {
    open: number
    show: number
    flowMeOpen: number
    meFlowOpen: number
    expireDate: string
  }
  antiDisturb: {
    isOpen: boolean
    options: AntiDisturbOption[]
    selectedId: number
    endTime: string
    title: string
    content: string
    needShowDialog: boolean
  }
  system: {
    autoReplyAvailable: boolean
    autoReplyDescription: string
    hintTitle: string
    hintTitleButton: string
    hintDetail: string
    hintDetailButton: string
    receiveUnfollowedWhitelist: boolean
  }
  autoReplyTexts: Record<AutoReplyType, AutoReplyText[]>
  blockWords: string[]
  limits: {
    maxBlockWords: number | null
    maxBlockWordLength: number | null
  }
}

export interface ComposerImageUpload {
  url: string
  width: number
  height: number
  size: number
  imageType: string
}
