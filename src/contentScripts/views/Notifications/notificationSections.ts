export type NotificationView
  = | 'whisper'
    | 'reply'
    | 'at'
    | 'love'
    | 'system'

export type NativeNotificationSection = 'reply' | 'at' | 'love'
export type HybridNotificationView = 'whisper'
export type OriginalOnlyNotificationView = 'system'

export type OriginalNotificationView = 'system'

export type NotificationSectionImplementation = 'native' | 'original' | 'hybrid'
export type NotificationSectionLayout = 'document' | 'workspace'

export interface NotificationSectionDefinition {
  id: NotificationView
  implementation: NotificationSectionImplementation
  layout: NotificationSectionLayout
  labelKey: string
  descriptionKey: string
  icon: string
  unreadSource: 'dm' | 'reply' | 'at' | 'like' | 'system' | null
}

export const NOTIFICATION_SECTIONS = [
  {
    id: 'whisper',
    implementation: 'hybrid',
    layout: 'workspace',
    labelKey: 'notifications.sections.whisper.label',
    descriptionKey: 'notifications.sections.whisper.description',
    icon: 'i-solar:chat-round-bold-duotone',
    unreadSource: 'dm',
  },
  {
    id: 'reply',
    implementation: 'native',
    layout: 'document',
    labelKey: 'notifications.sections.reply.label',
    descriptionKey: 'notifications.sections.reply.description',
    icon: 'i-solar:reply-2-bold-duotone',
    unreadSource: 'reply',
  },
  {
    id: 'at',
    implementation: 'native',
    layout: 'document',
    labelKey: 'notifications.sections.at.label',
    descriptionKey: 'notifications.sections.at.description',
    icon: 'i-solar:mention-circle-bold-duotone',
    unreadSource: 'at',
  },
  {
    id: 'love',
    implementation: 'native',
    layout: 'document',
    labelKey: 'notifications.sections.love.label',
    descriptionKey: 'notifications.sections.love.description',
    icon: 'i-solar:like-bold-duotone',
    unreadSource: 'like',
  },
  {
    id: 'system',
    implementation: 'original',
    layout: 'workspace',
    labelKey: 'notifications.sections.system.label',
    descriptionKey: 'notifications.sections.system.description',
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
const ORIGINAL_FRAME_VIEW_SET = new Set<OriginalNotificationView>(['system'])
const ORIGINAL_ONLY_VIEW_SET = new Set<OriginalOnlyNotificationView>(['system'])

export const TOP_BAR_NOTIFICATION_SECTIONS = NOTIFICATION_SECTIONS.filter(
  section => section.unreadSource !== null,
)

type NativeNotificationSectionDefinition = Extract<
  (typeof NOTIFICATION_SECTIONS)[number],
  { implementation: 'native' }
>

export const NATIVE_NOTIFICATION_SECTIONS = NOTIFICATION_SECTIONS.filter(
  (section): section is NativeNotificationSectionDefinition => section.implementation === 'native',
)

export function isNotificationView(value: unknown): value is NotificationView {
  return typeof value === 'string' && NOTIFICATION_VIEW_SET.has(value as NotificationView)
}

export function isOriginalOnlyNotificationView(value: NotificationView): value is OriginalOnlyNotificationView {
  return ORIGINAL_ONLY_VIEW_SET.has(value as OriginalOnlyNotificationView)
}

export function isOriginalFrameCapableView(value: NotificationView): value is OriginalNotificationView {
  return ORIGINAL_FRAME_VIEW_SET.has(value as OriginalNotificationView)
}

export function isHybridNotificationView(value: NotificationView): value is HybridNotificationView {
  return NOTIFICATION_SECTION_BY_ID[value].implementation === 'hybrid'
}

export function isNativeNotificationSection(value: NotificationView): value is NativeNotificationSection {
  return NOTIFICATION_SECTION_BY_ID[value].implementation === 'native'
}

export function canOriginalNotificationMutateUnread(value: OriginalNotificationView): boolean {
  return value === 'system'
}
