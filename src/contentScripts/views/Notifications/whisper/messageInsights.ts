import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'
import { getNotificationBadgeCounts } from '~/utils/notificationBadge'

import type { DisplayPrivateSession } from './privateSession'

function known(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export interface MessageActivityDay {
  timestamp: number
  followed: number
  unfollowed: number
}

export const MESSAGE_ACTIVITY_DAYS = 7

// Session metadata contains its latest activity, not a complete message log.
// Count each loaded conversation once, on its latest active local-calendar day.
export function getRecentConversationActivity(sessions: readonly DisplayPrivateSession[], now = Date.now()): MessageActivityDay[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: MESSAGE_ACTIVITY_DAYS }, (_, index) => {
    const day = new Date(today)
    day.setDate(day.getDate() - MESSAGE_ACTIVITY_DAYS + 1 + index)
    return { timestamp: day.getTime(), followed: 0, unfollowed: 0 }
  })
  for (const session of sessions) {
    const timestamp = Math.trunc(session.timestamp / 1000)
    if (!Number.isFinite(timestamp) || timestamp > now)
      continue
    const day = days.findLast(item => item.timestamp <= timestamp)
    if (day)
      day[session.followed ? 'followed' : 'unfollowed']++
  }
  return days
}

export function getMessageInsights(
  sessions: readonly DisplayPrivateSession[],
  message: Partial<UnReadMessage> & { recv_like?: unknown } = {},
  dm: Partial<UnReadDm> = {},
) {
  const counts = getNotificationBadgeCounts({ showLikeNotificationReminder: true }, message, dm)
  const notifications = [
    { key: 'reply', count: known(message.reply) ? counts.reply : null },
    { key: 'at', count: known(message.at) ? counts.at : null },
    { key: 'love', count: known(message.like) || known(message.recv_like) ? counts.like : null },
    { key: 'system', count: known(message.sys_msg) ? counts.system : null },
  ] as const
  const privateCount = known(dm.follow_unread) || known(dm.unfollow_unread) || known(message.chat)
    ? counts.privateMessages
    : null
  return {
    notifications,
    total: privateCount !== null && notifications.every(item => item.count !== null) ? counts.total : null,
    privateCount,
    followed: known(dm.follow_unread) ? counts.followed : null,
    unfollowed: known(dm.unfollow_unread) ? counts.unfollowed : null,
    sessions: sessions.length,
    pinned: sessions.filter(item => item.pinned).length,
    muted: sessions.filter(item => item.muted).length,
    recent: [...sessions]
      .filter(item => item.timestamp > 0 && Number.isFinite(new Date(Math.trunc(item.timestamp / 1000)).getTime()))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4),
  }
}
