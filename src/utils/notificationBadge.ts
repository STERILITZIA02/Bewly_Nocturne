import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'
import type { Settings } from '~/logic/storage'

type BadgeSettings = Partial<Pick<Settings, 'showReplyNotificationReminder' | 'showAtNotificationReminder'
  | 'showLikeNotificationReminder' | 'showSystemNotificationReminder'
  | 'showFollowedPrivateMessageUnreadCount' | 'showUnfollowedPrivateMessageUnreadCount'>>

const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const count = (value: unknown) => validCount(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)) : 0
const total = (values: number[]) => Math.min(Number.MAX_SAFE_INTEGER, values.reduce((sum, value) => sum + value, 0))

/** Normalize server facts once, independently of badge preferences. */
export function getNotificationCounts(
  message: Partial<UnReadMessage> & { recv_like?: unknown } = {},
  dm: Partial<UnReadDm> = {},
) {
  const reply = count(message.reply)
  const at = count(message.at)
  const like = Math.max(count(message.like), count(message.recv_like))
  const system = count(message.sys_msg)
  const followed = count(dm.follow_unread)
  const unfollowed = count(dm.unfollow_unread)
  const hasCategorizedPrivateCounts = validCount(dm.follow_unread) || validCount(dm.unfollow_unread)
  const privateMessages = hasCategorizedPrivateCounts ? total([followed, unfollowed]) : count(message.chat)
  return { reply, at, like, system, followed, unfollowed, privateMessages, hasCategorizedPrivateCounts, total: total([reply, at, like, system, privateMessages]) }
}

/** Badge preferences never change the category facts or add chat to grouped IM counts. */
export function getNotificationBadgeCounts(
  config: BadgeSettings,
  message: Partial<UnReadMessage> & { recv_like?: unknown } = {},
  dm: Partial<UnReadDm> = {},
) {
  const raw = getNotificationCounts(message, dm)
  const reply = config.showReplyNotificationReminder !== false ? raw.reply : 0
  const at = config.showAtNotificationReminder !== false ? raw.at : 0
  const like = config.showLikeNotificationReminder === true ? raw.like : 0
  const system = config.showSystemNotificationReminder !== false ? raw.system : 0
  const followed = config.showFollowedPrivateMessageUnreadCount !== false ? raw.followed : 0
  const unfollowed = config.showUnfollowedPrivateMessageUnreadCount !== false ? raw.unfollowed : 0
  const privateMessages = !raw.hasCategorizedPrivateCounts
    && config.showFollowedPrivateMessageUnreadCount !== false && config.showUnfollowedPrivateMessageUnreadCount !== false
    ? raw.privateMessages
    : total([followed, unfollowed])
  return { reply, at, like, system, followed, unfollowed, privateMessages, total: total([reply, at, like, system, privateMessages]) }
}
