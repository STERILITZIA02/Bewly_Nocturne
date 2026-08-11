import type { NotificationSection } from '~/utils/notificationRoute'

export interface NotificationSectionDefinition {
  id: NotificationSection
  icon: string
  labelKey: string
}

export const NOTIFICATION_SECTIONS: readonly NotificationSectionDefinition[] = [
  { id: 'whisper', icon: 'i-tabler-message-circle', labelKey: 'notifications.sections.whisper' },
  { id: 'reply', icon: 'i-tabler-message-reply', labelKey: 'notifications.sections.reply' },
  { id: 'at', icon: 'i-tabler-at', labelKey: 'notifications.sections.at' },
  { id: 'love', icon: 'i-tabler-heart', labelKey: 'notifications.sections.love' },
  { id: 'system', icon: 'i-tabler-bell', labelKey: 'notifications.sections.system' },
  { id: 'settings', icon: 'i-tabler-settings', labelKey: 'notifications.sections.settings' },
]
