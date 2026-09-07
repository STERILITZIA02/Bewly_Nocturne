import type { AccountId } from './accountScope'

/** Identity of work issued by one mounted account view; invalidation does not undo sent writes. */
export function createAccountLifetime(getAccountId: () => AccountId) {
  let generation = 0
  let disposed = false
  return {
    capture() {
      const accountId = getAccountId()
      const version = generation
      return {
        accountId,
        isCurrent: () => !disposed && accountId !== null && version === generation && accountId === getAccountId(),
      }
    },
    invalidate() { generation++ },
    dispose() {
      disposed = true
      generation++
    },
  }
}
