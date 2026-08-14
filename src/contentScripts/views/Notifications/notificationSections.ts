export type NotificationView
  = | 'whisper'
    | 'reply'
    | 'at'
    | 'love'
    | 'system'
    | 'settings'

export type NativeNotificationSection = 'reply' | 'at' | 'love'

export type OriginalNotificationView
  = | 'whisper'
    | 'system'
    | 'settings'

export interface NotificationSectionDefinition {
  id: NotificationView
  implementation: 'native' | 'original'
  labelKey: string
  descriptionKey: string
  icon: string
  originalHash: string
  unreadSource: 'dm' | 'reply' | 'at' | 'like' | 'system' | null
}

export const NOTIFICATION_SECTIONS = [
  {
    id: 'whisper',
    implementation: 'original',
    labelKey: 'notifications.sections.whisper.label',
    descriptionKey: 'notifications.sections.whisper.description',
    icon: 'i-solar:chat-round-bold-duotone',
    originalHash: 'whisper',
    unreadSource: 'dm',
  },
  {
    id: 'reply',
    implementation: 'native',
    labelKey: 'notifications.sections.reply.label',
    descriptionKey: 'notifications.sections.reply.description',
    icon: 'i-solar:reply-2-bold-duotone',
    originalHash: 'reply',
    unreadSource: 'reply',
  },
  {
    id: 'at',
    implementation: 'native',
    labelKey: 'notifications.sections.at.label',
    descriptionKey: 'notifications.sections.at.description',
    icon: 'i-solar:mention-circle-bold-duotone',
    originalHash: 'at',
    unreadSource: 'at',
  },
  {
    id: 'love',
    implementation: 'native',
    labelKey: 'notifications.sections.love.label',
    descriptionKey: 'notifications.sections.love.description',
    icon: 'i-solar:like-bold-duotone',
    originalHash: 'love',
    unreadSource: 'like',
  },
  {
    id: 'system',
    implementation: 'original',
    labelKey: 'notifications.sections.system.label',
    descriptionKey: 'notifications.sections.system.description',
    icon: 'i-solar:chat-line-bold-duotone',
    originalHash: 'system',
    unreadSource: 'system',
  },
  {
    id: 'settings',
    implementation: 'original',
    labelKey: 'notifications.sections.settings.label',
    descriptionKey: 'notifications.sections.settings.description',
    icon: 'i-solar:settings-bold-duotone',
    originalHash: 'config',
    unreadSource: null,
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

export function isOriginalNotificationView(value: NotificationView): value is OriginalNotificationView {
  return NOTIFICATION_SECTION_BY_ID[value].implementation === 'original'
}

export function isNativeNotificationSection(value: NotificationView): value is NativeNotificationSection {
  return NOTIFICATION_SECTION_BY_ID[value].implementation === 'native'
}

export function canOriginalNotificationMutateUnread(value: OriginalNotificationView): boolean {
  return value === 'whisper' || value === 'system'
}
