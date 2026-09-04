/** Only dynamic_id is emitted as a raw JSON integer; every other field uses JSON.stringify. */
export function serializeMomentVoteBody(body: Record<string, unknown>): string {
  const { dynamic_id: dynamicId, ...rest } = body
  // Require the original decimal string. A Number may already have lost precision.
  if (typeof dynamicId !== 'string' || !/^[1-9]\d*$/.test(dynamicId))
    throw new TypeError('Invalid vote dynamic_id')
  const serialized = JSON.stringify(rest)
  return `${serialized.slice(0, -1)}${serialized === '{}' ? '' : ','}"dynamic_id":${dynamicId}}`
}
