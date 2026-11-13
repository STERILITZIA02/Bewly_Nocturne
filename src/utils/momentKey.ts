import { asObject } from './plainObject'

function toStablePart(value: unknown): string {
  if (typeof value === 'string')
    return value.trim()
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  return ''
}

function hashStableIdentity(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function resolveStableMomentKey(value: unknown, kind: 'moment' | 'live'): string {
  const item = asObject(value)
  const apiId = toStablePart(item.id_str)
  if (apiId)
    return `${kind}:api:${apiId}`

  const businessId = kind === 'live'
    ? toStablePart(item.roomid) || toStablePart(item.id)
    : toStablePart(item.rid) || toStablePart(item.id) || toStablePart(item.bvid)
  if (businessId) {
    const type = toStablePart(item.type) || kind
    return `${kind}:${type}:${businessId}`
  }

  const link = toStablePart(item.jump_url) || toStablePart(item.link)
  if (link)
    return `${kind}:link:${link}`

  const author = asObject(item.author)
  const composite = [
    kind,
    toStablePart(item.type),
    toStablePart(author?.mid) || toStablePart(item.uid),
    toStablePart(item.pub_time) || toStablePart(item.timestamp),
    toStablePart(item.title),
    toStablePart(item.desc) || toStablePart(item.description) || toStablePart(item.content),
    toStablePart(item.cover) || toStablePart(item.pic),
  ].join('\u001F')

  return `${kind}:composite:${hashStableIdentity(composite)}`
}
