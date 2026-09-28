export type AccountId = number | null

export function resolveAuthenticatedAccountId(
  isLoggedIn: boolean,
  mid: number | string | null | undefined,
): AccountId {
  if (!isLoggedIn)
    return null

  const accountId = typeof mid === 'string' && mid.trim() === '' ? Number.NaN : Number(mid)
  return Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null
}

export function isSameAccount(cachedAccountId: AccountId, currentAccountId: AccountId): boolean {
  return cachedAccountId === currentAccountId
}

/** undefined means the profile is stale; null is an agreed logged-out scope. */
export function resolveCookieMatchedAccountId(mid: number | string | undefined, cookieMid: string | undefined): AccountId | undefined {
  const profileId = resolveAuthenticatedAccountId(true, mid)
  const cookieId = resolveAuthenticatedAccountId(true, cookieMid)
  return profileId === cookieId ? profileId : undefined
}

export function isAccountRequestCurrent(
  requestAccountId: number,
  requestGeneration: number,
  currentAccountId: AccountId,
  currentGeneration: number,
): boolean {
  return requestGeneration === currentGeneration && requestAccountId === currentAccountId
}

export function getAccountScopedStorageKey(baseKey: string, accountId: number): string {
  return `${baseKey}:${accountId}`
}
