export interface IframeFocusRetryState {
  attemptCount: number
  maxAttempts: number
  elapsedMs: number
  deadlineMs: number
  cancelled: boolean
  iframeReplaced: boolean
  viewerOpen: boolean
  userMovedFocus: boolean
}

export function shouldContinueIframeFocusRetry(state: IframeFocusRetryState) {
  return !state.cancelled
    && !state.iframeReplaced
    && !state.viewerOpen
    && !state.userMovedFocus
    && state.attemptCount < state.maxAttempts
    && state.elapsedMs <= state.deadlineMs
}
