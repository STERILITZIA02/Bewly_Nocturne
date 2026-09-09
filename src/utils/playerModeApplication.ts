export interface PlayerModeApplication {
  shouldApply: () => boolean
  onApplied: () => void
}

/** One navigation owns both mode confirmation and its companion settings. */
export function createPlayerModeApplication(
  shouldApply: () => boolean,
  onApplied: () => void,
): PlayerModeApplication {
  let completed = false
  return {
    shouldApply,
    onApplied() {
      if (completed || !shouldApply())
        return
      completed = true
      onApplied()
    },
  }
}
