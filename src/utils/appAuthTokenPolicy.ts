export interface AppAccessTokenState {
  accessToken: string
  accessTokenExpiresAt: number | null
  refreshToken: string
  refreshTokenExpiresAt: number | null
}

export type AppAccessTokenFreshness = 'missing' | 'refresh-expired' | 'refresh-required' | 'valid'

export function createBooleanSingleFlight() {
  let activePromise: Promise<boolean> | null = null
  return (task: () => Promise<boolean>): Promise<boolean> => {
    if (activePromise)
      return activePromise
    const promise = task().finally(() => {
      if (activePromise === promise)
        activePromise = null
    })
    activePromise = promise
    return promise
  }
}

export function resolveAppAccessTokenFreshness(
  tokens: AppAccessTokenState,
  now: number,
  bufferMs: number,
): AppAccessTokenFreshness {
  if (!tokens.accessToken || !tokens.refreshToken)
    return 'missing'
  if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt <= now)
    return 'refresh-expired'
  if (tokens.accessTokenExpiresAt && tokens.accessTokenExpiresAt <= now + bufferMs)
    return 'refresh-required'
  return 'valid'
}
