export interface WatchLaterWriteResponse { code: number, message?: string }

/** Shared sending boundary. The caller owns identity and the post-send reconciliation. */
export async function sendOwnedWatchLaterWrite(
  canSubmit: () => boolean | Promise<boolean>,
  send: () => Promise<WatchLaterWriteResponse>,
): Promise<WatchLaterWriteResponse | undefined> {
  const allowed = canSubmit()
  if (!(typeof allowed === 'boolean' ? allowed : await allowed))
    return
  // A rejected transport is an unknown server result, never an invitation to resend.
  return send()
}
