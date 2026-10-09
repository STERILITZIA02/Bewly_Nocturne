export interface AppAccessTokenState {
  accessToken: string
  accessTokenExpiresAt: number | null
  refreshToken: string
  refreshTokenExpiresAt: number | null
}

export type AppAccessTokenFreshness = 'missing' | 'refresh-expired' | 'refresh-required' | 'valid'
export type AppAuthorizationState = 'valid' | 'invalid' | 'authorizing' | 'dismissed'

export interface AppAuthorizationSnapshot {
  state: AppAuthorizationState
  invalidToken: string
}

export type AppAuthorizationEvent
  = | { type: 'invalid', token: string }
    | { type: 'authorize', token: string }
    | { type: 'dismiss' }
    | { type: 'authorized', token: string }
    | { type: 'token-valid', token: string }

export function resolveAppAuthorizationState(
  current: AppAuthorizationSnapshot,
  event: AppAuthorizationEvent,
): AppAuthorizationSnapshot {
  if (event.type === 'authorized' || event.type === 'token-valid') {
    return {
      state: 'valid',
      invalidToken: event.token,
    }
  }

  if (event.type === 'dismiss') {
    return {
      ...current,
      state: 'dismissed',
    }
  }

  if (event.type === 'authorize') {
    return {
      state: 'authorizing',
      invalidToken: event.token,
    }
  }

  if (
    current.state === 'authorizing'
    || (current.state === 'dismissed' && current.invalidToken === event.token)
  ) {
    return current
  }

  return {
    state: 'invalid',
    invalidToken: event.token,
  }
}

export function createBooleanSingleFlight() {
  let active: { key: unknown, version: unknown, promise: Promise<boolean> } | null = null
  return (task: () => Promise<boolean>, key?: unknown, version?: unknown): Promise<boolean> => {
    if (active && active.key === key && active.version === version)
      return active.promise
    const promise = task().finally(() => {
      if (active?.promise === promise)
        active = null
    })
    active = { key, version, promise }
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
