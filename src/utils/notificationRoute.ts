import type { NotificationView } from '~/contentScripts/views/Notifications/notificationSections'
import { isNotificationView } from '~/contentScripts/views/Notifications/notificationSections'

const BEWLY_NOTIFICATION_ORIGIN = 'https://www.bilibili.com/'
const ORIGINAL_NOTIFICATION_ORIGIN = 'https://message.bilibili.com/'

export type OriginalNotificationTarget
  = | NotificationView
    | 'settings'

export const ORIGINAL_NOTIFICATION_HASH = {
  whisper: 'whisper',
  reply: 'reply',
  at: 'at',
  love: 'love',
  system: 'system',
  settings: 'config',
} as const satisfies Record<OriginalNotificationTarget, string>

export interface NormalizedNotificationRoute {
  view: NotificationView
  openMessageSettings: boolean
  normalizedUrl: string
}

function toUrl(url: string | URL): URL | null {
  try {
    return url instanceof URL
      ? new URL(url.href)
      : new URL(url, BEWLY_NOTIFICATION_ORIGIN)
  }
  catch {
    return null
  }
}

function getOriginalTarget(hash: string): OriginalNotificationTarget | null {
  const normalizedHash = hash.replace(/^#\/?/, '').split(/[/?]/, 1)[0]
  const entry = Object.entries(ORIGINAL_NOTIFICATION_HASH).find(([, value]) => value === normalizedHash)
  return entry?.[0] as OriginalNotificationTarget | undefined ?? null
}

export function buildBewlyNotificationUrl(view: NotificationView): string {
  const url = new URL(BEWLY_NOTIFICATION_ORIGIN)
  url.searchParams.set('page', 'Notifications')
  url.searchParams.set('notificationView', view)
  return url.toString()
}

export function buildOriginalNotificationUrl(target: OriginalNotificationTarget): string {
  return `${ORIGINAL_NOTIFICATION_ORIGIN}#/${ORIGINAL_NOTIFICATION_HASH[target]}`
}

export const ORIGINAL_MESSAGE_SETTINGS_URL = buildOriginalNotificationUrl('settings')

export function normalizeNotificationRoute(url: string | URL): NormalizedNotificationRoute {
  const parsedUrl = toUrl(url)
  if (!parsedUrl) {
    return {
      view: 'whisper',
      openMessageSettings: false,
      normalizedUrl: buildBewlyNotificationUrl('whisper'),
    }
  }

  const requestedView = parsedUrl.searchParams.get('notificationView')
  if (requestedView !== null) {
    if (requestedView === 'settings') {
      return {
        view: 'whisper',
        openMessageSettings: true,
        normalizedUrl: buildBewlyNotificationUrl('whisper'),
      }
    }
    if (isNotificationView(requestedView)) {
      return {
        view: requestedView,
        openMessageSettings: false,
        normalizedUrl: parsedUrl.toString(),
      }
    }
    return {
      view: 'whisper',
      openMessageSettings: false,
      normalizedUrl: buildBewlyNotificationUrl('whisper'),
    }
  }

  const originalTarget = getOriginalTarget(parsedUrl.hash)
  if (originalTarget === 'settings') {
    return {
      view: 'whisper',
      openMessageSettings: true,
      normalizedUrl: buildBewlyNotificationUrl('whisper'),
    }
  }
  if (originalTarget && isNotificationView(originalTarget)) {
    return {
      view: originalTarget,
      openMessageSettings: false,
      normalizedUrl: parsedUrl.toString(),
    }
  }

  return {
    view: 'whisper',
    openMessageSettings: false,
    normalizedUrl: buildBewlyNotificationUrl('whisper'),
  }
}

export function parseNotificationView(url: string | URL): NotificationView {
  return normalizeNotificationRoute(url).view
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
