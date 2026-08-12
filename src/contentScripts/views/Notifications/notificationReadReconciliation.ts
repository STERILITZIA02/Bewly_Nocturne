export type NotificationBadgeReconcileResult
  = | 'reconciled'
    | 'pending'
    | 'cancelled'
    | 'failed'

interface NotificationBadgeReconcileOptions {
  getUnreadCount: () => number
  isCurrent: () => boolean
  retryDelays: readonly number[]
  sync: () => Promise<void>
  wait: (delay: number) => Promise<boolean>
}

export async function reconcileNotificationBadge(
  options: NotificationBadgeReconcileOptions,
): Promise<NotificationBadgeReconcileResult> {
  for (let attempt = 0; attempt <= options.retryDelays.length; attempt++) {
    if (!options.isCurrent())
      return 'cancelled'
    if (options.getUnreadCount() <= 0)
      return 'reconciled'

    try {
      await options.sync()
    }
    catch {
      return 'failed'
    }

    if (!options.isCurrent())
      return 'cancelled'
    if (options.getUnreadCount() <= 0)
      return 'reconciled'
    if (attempt === options.retryDelays.length)
      return 'pending'

    if (!await options.wait(options.retryDelays[attempt]))
      return 'cancelled'
  }

  return 'pending'
}
