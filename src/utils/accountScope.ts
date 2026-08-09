export type AccountId = number | null

export function isSameAccount(cachedAccountId: AccountId, currentAccountId: AccountId): boolean {
  return cachedAccountId === currentAccountId
}

export function getAccountScopedStorageKey(baseKey: string, accountId: number): string {
  return `${baseKey}:${accountId}`
}
