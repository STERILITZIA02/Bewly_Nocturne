import { getPageBridgeChannelId } from './pageBridgeChannel'

export const VIDEO_METADATA_REQUEST = 'bewly:video-metadata:request'
export const VIDEO_METADATA_RESPONSE = 'bewly:video-metadata:response'
export const VIDEO_METADATA_CHANGED = 'bewly:video-metadata:changed'

export interface VideoPageMetadata {
  aid: number
  bvid: string
  pageCount: number
  isCollection: boolean
}

export function parseVideoPageIdentity(href: string): { aid?: number, bvid?: string } | null {
  try {
    const url = new URL(href)
    if (url.hostname !== 'www.bilibili.com')
      return null
    const match = /^\/video\/(BV[0-9a-z]{10}|av[1-9]\d*)\/?$/i.exec(url.pathname)
    if (!match)
      return null
    return /^av/i.test(match[1])
      ? { aid: Number(match[1].slice(2)) }
      : { bvid: `BV${match[1].slice(2)}` }
  }
  catch {
    return null
  }
}

export function validateVideoPageMetadata(value: unknown, href: string): VideoPageMetadata | null {
  if (!value || typeof value !== 'object')
    return null
  const data = value as Partial<VideoPageMetadata>
  const identity = parseVideoPageIdentity(href)
  if (!identity || !Number.isSafeInteger(data.aid) || data.aid! <= 0
    || typeof data.bvid !== 'string' || !/^BV[0-9a-z]{10}$/i.test(data.bvid)
    || !Number.isSafeInteger(data.pageCount) || data.pageCount! < 1
    || typeof data.isCollection !== 'boolean'
    || (identity.aid !== undefined && identity.aid !== data.aid)
    || (identity.bvid !== undefined && identity.bvid !== data.bvid)) {
    return null
  }
  return { aid: data.aid!, bvid: data.bvid, pageCount: data.pageCount!, isCollection: data.isCollection }
}

export function parseVideoMetadataEvent(event: Event): Record<string, unknown> | null {
  const detail = (event as CustomEvent<unknown>).detail
  if (typeof detail !== 'string')
    return null
  try {
    const value = JSON.parse(detail)
    return value && typeof value === 'object' ? value : null
  }
  catch {
    return null
  }
}

let requestId = 0

// A synchronous, string-only DOM event crosses Chrome's isolated world without
// exposing a page object, polling, or waiting on a second readiness controller.
export function readVideoPageMetadata(): VideoPageMetadata | null {
  const channelId = getPageBridgeChannelId()
  const href = location.href
  if (!channelId || !parseVideoPageIdentity(href))
    return null
  const id = ++requestId
  let metadata: VideoPageMetadata | null = null
  const receive = (event: Event) => {
    const message = parseVideoMetadataEvent(event)
    if (message?.channelId === channelId && message.requestId === id && message.href === href && location.href === href)
      metadata = validateVideoPageMetadata(message.metadata, href)
  }
  window.addEventListener(VIDEO_METADATA_RESPONSE, receive)
  try {
    window.dispatchEvent(new CustomEvent(VIDEO_METADATA_REQUEST, { detail: JSON.stringify({ channelId, requestId: id, href }) }))
  }
  finally {
    window.removeEventListener(VIDEO_METADATA_RESPONSE, receive)
  }
  return metadata
}
