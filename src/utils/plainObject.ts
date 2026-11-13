/** Objects with addressable fields, including arrays and class instances. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/** Wire records exclude arrays, but do not impose a prototype on decoded data. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value)
}

/** Optional response records: callers distinguish malformed data from an empty record. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

/** Property readers and settings reconciliation also accept array-shaped objects. */
export function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

/** A record built from an object literal or `Object.create(null)`, not a class instance or array. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]')
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}
