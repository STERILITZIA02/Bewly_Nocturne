export const NOTIFICATION_SECTIONS = [
  'whisper',
  'reply',
  'at',
  'love',
  'system',
  'settings',
] as const

export type NotificationSection = typeof NOTIFICATION_SECTIONS[number]

export interface NotificationConversationRoute {
  talker: string
  sessionType: string
}

export interface NotificationRoute {
  section: NotificationSection
  conversation?: NotificationConversationRoute
}

export interface NotificationHrefOptions {
  openAsDrawer: boolean
  useOriginalPage: boolean
}

export interface NotificationNavigationTarget {
  section: NotificationSection
  url: string
}

const NOTIFICATION_SECTION_SET = new Set<string>(NOTIFICATION_SECTIONS)
const ORIGINAL_ROUTE_BY_SECTION: Readonly<Record<NotificationSection, string>> = {
  whisper: 'whisper',
  reply: 'reply',
  at: 'at',
  love: 'love',
  system: 'system',
  settings: 'config',
}
const SECTION_BY_ORIGINAL_ROUTE: Readonly<Record<string, NotificationSection>> = {
  whisper: 'whisper',
  reply: 'reply',
  at: 'at',
  love: 'love',
  system: 'system',
  config: 'settings',
  settings: 'settings',
}

export function normalizeNotificationSection(value: unknown): NotificationSection {
  return typeof value === 'string' && NOTIFICATION_SECTION_SET.has(value)
    ? value as NotificationSection
    : 'whisper'
}

function parseUrl(rawUrl: string | URL): URL | undefined {
  try {
    return rawUrl instanceof URL
      ? new URL(rawUrl.toString())
      : new URL(rawUrl, 'https://www.bilibili.com/')
  }
  catch {
    return undefined
  }
}

function parseOriginalSection(url: URL): NotificationSection {
  const routeName = url.hash
    .replace(/^#\/?/, '')
    .split(/[/?]/, 1)[0]
    ?.trim()

  return routeName ? SECTION_BY_ORIGINAL_ROUTE[routeName] ?? 'whisper' : 'whisper'
}

function parseOriginalConversation(url: URL): NotificationConversationRoute | undefined {
  const routeParts = url.hash.replace(/^#\/?/, '').split('/')
  if (routeParts[0] !== 'whisper' || !routeParts[1])
    return undefined
  const [kind, ...idParts] = routeParts[1].split('_')
  const talker = idParts.join('_').trim()
  if (!talker || !['contact', 'group'].includes(kind))
    return undefined
  return {
    talker,
    sessionType: kind === 'group' ? '2' : '1',
  }
}

export function parseNotificationRoute(rawUrl: string | URL): NotificationRoute {
  const url = parseUrl(rawUrl)
  if (!url)
    return { section: 'whisper' }

  const section = url.hostname === 'message.bilibili.com'
    ? parseOriginalSection(url)
    : normalizeNotificationSection(url.searchParams.get('notificationView'))
  const originalConversation = url.hostname === 'message.bilibili.com'
    ? parseOriginalConversation(url)
    : undefined
  const talker = originalConversation?.talker || url.searchParams.get('notificationTalker')?.trim()
  const sessionType = originalConversation?.sessionType || url.searchParams.get('notificationSessionType')?.trim()

  return talker && sessionType
    ? { section, conversation: { talker, sessionType } }
    : { section }
}

export function buildBewlyNotificationUrl(
  section: NotificationSection,
  conversation?: NotificationConversationRoute,
): string {
  const url = new URL('https://www.bilibili.com/')
  url.searchParams.set('page', 'Notifications')
  url.searchParams.set('notificationView', normalizeNotificationSection(section))

  if (conversation?.talker && conversation.sessionType) {
    url.searchParams.set('notificationTalker', conversation.talker)
    url.searchParams.set('notificationSessionType', conversation.sessionType)
  }

  return url.toString()
}

export function buildOriginalNotificationUrl(
  section: NotificationSection,
  conversation?: NotificationConversationRoute,
): string {
  const url = new URL('https://message.bilibili.com/')
  const normalizedSection = normalizeNotificationSection(section)
  const conversationRoute = normalizedSection === 'whisper' && conversation?.talker
    ? `/${conversation.sessionType === '2' ? 'group' : 'contact'}_${conversation.talker}`
    : ''
  url.hash = `/${ORIGINAL_ROUTE_BY_SECTION[normalizedSection]}${conversationRoute}`
  return url.toString()
}

export function resolveNotificationHref(
  section: NotificationSection,
  options: NotificationHrefOptions,
): string {
  return options.openAsDrawer || options.useOriginalPage
    ? buildOriginalNotificationUrl(section)
    : buildBewlyNotificationUrl(section)
}
