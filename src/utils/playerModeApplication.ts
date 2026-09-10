type PlayerModeApplicationStatus = 'pending' | 'applied' | 'cancelled' | 'failed'

export interface PlayerModeApplication {
  readonly status: PlayerModeApplicationStatus
  shouldApply: () => boolean
  onApplied: () => void
  cancel: () => void
  fail: () => void
}

/** One navigation owns both mode confirmation and its companion settings. */
export function createPlayerModeApplication(
  shouldApply: () => boolean,
  onApplied: () => void,
  onSettled?: (status: Exclude<PlayerModeApplicationStatus, 'pending'>) => void,
): PlayerModeApplication {
  let status: PlayerModeApplicationStatus = 'pending'
  const finish = (next: Exclude<PlayerModeApplicationStatus, 'pending'>) => {
    if (status !== 'pending')
      return
    status = next
    try {
      if (next === 'applied')
        onApplied()
    }
    finally {
      onSettled?.(next)
    }
  }
  return {
    get status() { return status },
    shouldApply: () => status !== 'cancelled' && status !== 'failed' && shouldApply(),
    onApplied() {
      if (status !== 'pending' || !shouldApply())
        return
      finish('applied')
    },
    cancel: () => finish('cancelled'),
    fail: () => finish('failed'),
  }
}
