import type { NotificationView } from '~/contentScripts/views/Notifications/notificationSections'
import {
  isNotificationView,
  NOTIFICATION_SECTION_BY_ID,
  NOTIFICATION_SECTIONS,
} from '~/contentScripts/views/Notifications/notificationSections'

const BEWLY_NOTIFICATION_ORIGIN = 'https://www.bilibili.com/'
const ORIGINAL_NOTIFICATION_ORIGIN = 'https://message.bilibili.com/'

export function parseNotificationView(url: string | URL): NotificationView {
  try {
    const parsedUrl = url instanceof URL ? url : new URL(url, BEWLY_NOTIFICATION_ORIGIN)
    const queryView = parsedUrl.searchParams.get('notificationView')
    if (queryView !== null)
      return isNotificationView(queryView) ? queryView : 'whisper'

    const originalHash = parsedUrl.hash.replace(/^#\/?/, '').split(/[/?]/, 1)[0]
    const originalSection = NOTIFICATION_SECTIONS.find(section => section.originalHash === originalHash)
    return originalSection?.id ?? 'whisper'
  }
  catch {
    return 'whisper'
  }
}

export function buildBewlyNotificationUrl(view: NotificationView): string {
  const url = new URL(BEWLY_NOTIFICATION_ORIGIN)
  url.searchParams.set('page', 'Notifications')
  url.searchParams.set('notificationView', view)
  return url.toString()
}

export function buildOriginalNotificationUrl(view: NotificationView): string {
  return `${ORIGINAL_NOTIFICATION_ORIGIN}#/${NOTIFICATION_SECTION_BY_ID[view].originalHash}`
}

export function resolveNotificationNavigationUrl(
  view: NotificationView,
  options: {
    openAsDrawer: boolean
    useOriginalPage: boolean
  },
): string {
  return options.openAsDrawer || options.useOriginalPage
    ? buildOriginalNotificationUrl(view)
    : buildBewlyNotificationUrl(view)
}
