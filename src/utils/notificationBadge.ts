import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'
import type { Settings } from '~/logic/storage'

type BadgeSettings = Partial<Pick<Settings, 'showReplyNotificationReminder' | 'showAtNotificationReminder'
  | 'showLikeNotificationReminder' | 'showSystemNotificationReminder'
  | 'showFollowedPrivateMessageUnreadCount' | 'showUnfollowedPrivateMessageUnreadCount'>>

const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const count = (value: unknown) => validCount(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)) : 0
const total = (values: number[]) => Math.min(Number.MAX_SAFE_INTEGER, values.reduce((sum, value) => sum + value, 0))

/**
 * Display-only projection. The current Web IM client reads follow/unfollow
 * counts, never adds the legacy chat field to them. Preserve chat as a fallback
 * only when neither categorized count is available and both categories show.
 */
export function getNotificationBadgeCounts(
  config: BadgeSettings,
  message: Partial<UnReadMessage> & { recv_like?: unknown } = {},
  dm: Partial<UnReadDm> = {},
) {
  const reply = config.showReplyNotificationReminder !== false ? count(message.reply) : 0
  const at = config.showAtNotificationReminder !== false ? count(message.at) : 0
  const like = config.showLikeNotificationReminder === true ? Math.max(count(message.like), count(message.recv_like)) : 0
  const system = config.showSystemNotificationReminder !== false ? count(message.sys_msg) : 0
  const followed = config.showFollowedPrivateMessageUnreadCount !== false ? count(dm.follow_unread) : 0
  const unfollowed = config.showUnfollowedPrivateMessageUnreadCount !== false ? count(dm.unfollow_unread) : 0
  const privateMessages = !validCount(dm.follow_unread) && !validCount(dm.unfollow_unread)
    && config.showFollowedPrivateMessageUnreadCount !== false && config.showUnfollowedPrivateMessageUnreadCount !== false
    ? count(message.chat)
    : total([followed, unfollowed])
  return { reply, at, like, system, followed, unfollowed, privateMessages, total: total([reply, at, like, system, privateMessages]) }
}
