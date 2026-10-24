/** GitHub release tags use SemVer, optionally prefixed with v. */
export function isNewerReleaseVersion(candidate: string, current: string): boolean {
  const pattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/
  const next = pattern.exec(candidate)
  const previous = pattern.exec(current)
  if (!next || !previous)
    return false
  for (let index = 1; index <= 3; index++) {
    const difference = Number(next[index]) - Number(previous[index])
    if (difference)
      return difference > 0
  }
  if (!next[4] || !previous[4])
    return !next[4] && !!previous[4]
  const nextParts = next[4].split('.')
  const previousParts = previous[4].split('.')
  for (let index = 0; index < Math.max(nextParts.length, previousParts.length); index++) {
    const a = nextParts[index]
    const b = previousParts[index]
    if (a === b)
      continue
    if (a === undefined || b === undefined)
      return b === undefined
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric !== bNumeric)
      return bNumeric
    return aNumeric ? Number(a) > Number(b) : a > b
  }
  return false
}
