export type NotificationView
  = | 'whisper'
    | 'reply'
    | 'at'
    | 'love'
    | 'system'

export type NativeNotificationSection = 'reply' | 'at' | 'love' | 'system'
export type HybridNotificationView = 'whisper'

export type NotificationSectionImplementation = 'native' | 'hybrid'
export type NotificationSectionLayout = 'document' | 'workspace'

export interface NotificationSectionDefinition {
  id: NotificationView
  implementation: NotificationSectionImplementation
  layout: NotificationSectionLayout
  labelKey: string
  icon: string
  unreadSource: 'dm' | 'reply' | 'at' | 'like' | 'system' | null
}

export const NOTIFICATION_SECTIONS = [
  {
    id: 'whisper',
    implementation: 'hybrid',
    layout: 'workspace',
    labelKey: 'notifications.sections.whisper.label',
    icon: 'i-solar:chat-round-bold-duotone',
    unreadSource: 'dm',
  },
  {
    id: 'reply',
    implementation: 'native',
    layout: 'document',
    labelKey: 'notifications.sections.reply.label',
    icon: 'i-solar:reply-2-bold-duotone',
    unreadSource: 'reply',
  },
  {
    id: 'at',
    implementation: 'native',
    layout: 'document',
    labelKey: 'notifications.sections.at.label',
    icon: 'i-solar:mention-circle-bold-duotone',
    unreadSource: 'at',
  },
  {
    id: 'love',
    implementation: 'native',
    layout: 'document',
    labelKey: 'notifications.sections.love.label',
    icon: 'i-solar:like-bold-duotone',
    unreadSource: 'like',
  },
  {
    id: 'system',
    implementation: 'native',
    layout: 'document',
    labelKey: 'notifications.sections.system.label',
    icon: 'i-solar:chat-line-bold-duotone',
    unreadSource: 'system',
  },
] as const satisfies readonly NotificationSectionDefinition[]

export const NOTIFICATION_SECTION_BY_ID = Object.fromEntries(
  NOTIFICATION_SECTIONS.map(section => [section.id, section]),
) as Record<NotificationView, NotificationSectionDefinition>

const NOTIFICATION_VIEW_SET = new Set<NotificationView>(
  NOTIFICATION_SECTIONS.map(section => section.id),
)

export const TOP_BAR_NOTIFICATION_SECTIONS = NOTIFICATION_SECTIONS.filter(
  section => section.unreadSource !== null,
)

export function isNotificationView(value: unknown): value is NotificationView {
  return typeof value === 'string' && NOTIFICATION_VIEW_SET.has(value as NotificationView)
}

export function isHybridNotificationView(value: NotificationView): value is HybridNotificationView {
  return NOTIFICATION_SECTION_BY_ID[value].implementation === 'hybrid'
}

export function isNativeNotificationSection(value: NotificationView): value is NativeNotificationSection {
  return NOTIFICATION_SECTION_BY_ID[value].implementation === 'native'
}
