import type { PrivateMessage } from '~/background/privateMessage/types'

export type ParsedPrivateMessageContent
  = | PrivateMessageTextContent
    | PrivateMessageMediaContent
    | PrivateMessageRecalledContent
    | PrivateMessageShareV2Content
    | PrivateMessageNotificationContent
    | PrivateMessageVideoCardContent
    | PrivateMessageArticleCardContent
    | PrivateMessagePictureCardContent
    | PrivateMessageCommonShareCardContent
    | PrivateMessageTextShareContent
    | PrivateMessageBusinessCardContent
    | PrivateMessageTipContent
    | PrivateMessageUnknownContent

export type PrivateMessageTextSegment
  = | { type: 'text', text: string }
    | { type: 'link', href: string, text: string }
    | { type: 'emoji', alt: string, src: string, size: number }

export interface PrivateMessageTextContent {
  type: 'text'
  segments: PrivateMessageTextSegment[]
}

export interface PrivateMessageMediaContent {
  type: 'image' | 'emoticon'
  src: string
  width: number
  height: number
}

export interface PrivateMessageRecalledContent {
  type: 'recalled'
}

type PrivateMessageShareSource = 'article' | 'dynamic' | 'pgc' | 'video'

export interface PrivateMessageShareV2Content {
  type: 'share-v2'
  source: PrivateMessageShareSource
  sourceId: string
  bvid: string
  cover: string
  title: string
  headline: string
  author: string
  href: string
}

export interface PrivateMessageNotificationContent {
  type: 'notification'
  title: string
  text: string
  modules: Array<{ title: string, detail: string }>
  links: Array<{ text: string, href: string }>
}

export interface PrivateMessageVideoCardContent {
  type: 'video-card'
  bvid: string
  cover: string
  title: string
  times: number
  attachMessage: string
  href: string
}

export interface PrivateMessageArticleCardContent {
  type: 'article-card'
  rid: string
  images: string[]
  title: string
  summary: string
  href: string
}

export interface PrivateMessagePictureCardContent {
  type: 'picture-card'
  src: string
  href: string
}

export interface PrivateMessageCommonShareCardContent {
  type: 'common-share-card'
  source: PrivateMessageShareSource
  sourceId: string
  cover: string
  title: string
  author: string
  href: string
}

export interface PrivateMessageTextShareContent {
  type: 'text-share'
  title: string
  text: string
  href: string
}

export interface PrivateMessageBusinessCardContent {
  type: 'business-card'
  title: string
  cards: Array<{
    href: string
    cover: string
    fields: [string, string, string]
  }>
}

export interface PrivateMessageTipContent {
  type: 'tip'
  lines: string[]
}

export interface PrivateMessageUnknownContent {
  type: 'unknown'
}

export interface PrivateMessageEmotion {
  alt: string
  src: string
  size: number
}

interface PrivateMessageRendererContext {
  emotions: Map<string, PrivateMessageEmotion>
}

interface PrivateMessageRenderer {
  parse: (
    rawContent: string,
    context: PrivateMessageRendererContext,
  ) => ParsedPrivateMessageContent | null
}

const CONTENT_LOSSLESS_FIELDS = new Set(['id', 'rid', 'sourceID'])
const URL_PATTERN = /https?:\/\/\S+/giu

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseContentRecord(content: string): Record<string, unknown> | null {
  try {
    const losslessContent = content.replace(
      /"([^"\\]+)"(\s*:\s*)(-?\d{16,})(?=\s*[,}])/g,
      (match, field: string, separator: string, value: string) => (
        CONTENT_LOSSLESS_FIELDS.has(field)
          ? `"${field}"${separator}"${value}"`
          : match
      ),
    )
    return asRecord(JSON.parse(losslessContent))
  }
  catch {
    return null
  }
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    return ''

  try {
    const normalized = value.startsWith('//') ? `https:${value}` : value
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  }
  catch {
    return ''
  }
}

function parseOptionalHttpUrl(value: unknown): { ok: boolean, value: string } {
  if (value === undefined || value === null || value === '')
    return { ok: true, value: '' }
  const normalized = normalizeHttpUrl(value)
  return { ok: Boolean(normalized), value: normalized }
}

function normalizeDimension(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function normalizeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string')
    return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return String(value)
  return ''
}

function splitTextUrls(text: string): PrivateMessageTextSegment[] {
  const segments: PrivateMessageTextSegment[] = []
  let offset = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const matchedText = match[0]
    const index = match.index
    if (index > offset)
      segments.push({ type: 'text', text: text.slice(offset, index) })
    const href = normalizeHttpUrl(matchedText)
    if (href)
      segments.push({ type: 'link', text: matchedText, href })
    else
      segments.push({ type: 'text', text: matchedText })
    offset = index + matchedText.length
  }
  if (offset < text.length)
    segments.push({ type: 'text', text: text.slice(offset) })
  return segments
}

function splitTextWithEmotions(
  text: string,
  emotions: Map<string, PrivateMessageEmotion>,
): PrivateMessageTextSegment[] {
  if (!text)
    return []
  if (emotions.size === 0)
    return splitTextUrls(text)

  const segments: PrivateMessageTextSegment[] = []
  let offset = 0
  while (offset < text.length) {
    let nextIndex = -1
    let nextEmotion: PrivateMessageEmotion | undefined
    for (const emotion of emotions.values()) {
      const index = text.indexOf(emotion.alt, offset)
      if (index !== -1 && (nextIndex === -1 || index < nextIndex)) {
        nextIndex = index
        nextEmotion = emotion
      }
    }

    if (nextIndex === -1 || !nextEmotion) {
      segments.push(...splitTextUrls(text.slice(offset)))
      break
    }
    if (nextIndex > offset)
      segments.push(...splitTextUrls(text.slice(offset, nextIndex)))
    segments.push({
      type: 'emoji',
      alt: nextEmotion.alt,
      src: nextEmotion.src,
      size: nextEmotion.size,
    })
    offset = nextIndex + nextEmotion.alt.length
  }

  return segments
}

export function collectPrivateMessageEmotions(eInfos: unknown[]): Map<string, PrivateMessageEmotion> {
  const result = new Map<string, PrivateMessageEmotion>()
  for (const rawInfo of eInfos) {
    const info = asRecord(rawInfo)
    const alt = typeof info?.text === 'string' ? info.text : ''
    const src = normalizeHttpUrl(info?.gif_url) || normalizeHttpUrl(info?.uri)
    if (!alt || !src)
      continue
    result.set(alt, {
      alt,
      src,
      size: normalizeDimension(info?.size),
    })
  }
  return result
}

function parseTextContent(
  content: string,
  context: PrivateMessageRendererContext,
): PrivateMessageTextContent | null {
  const record = parseContentRecord(content)
  if (typeof record?.content !== 'string')
    return null
  return {
    type: 'text',
    segments: splitTextWithEmotions(record.content, context.emotions),
  }
}

function parseMediaContent(
  content: string,
  type: 'image' | 'emoticon',
): PrivateMessageMediaContent | null {
  const record = parseContentRecord(content)
  const src = normalizeHttpUrl(record?.url)
  if (!src)
    return null
  return {
    type,
    src,
    width: normalizeDimension(record?.width),
    height: normalizeDimension(record?.height),
  }
}

function parseRecalledContent(content: string): PrivateMessageRecalledContent | null {
  return parseContentRecord(content) ? { type: 'recalled' } : null
}

function normalizeShareSource(value: unknown): PrivateMessageShareSource | null {
  const source = normalizeString(value).toLowerCase()
  if (['1', 'video', 'archive'].includes(source))
    return 'video'
  if (['dynamic', 'opus'].includes(source))
    return 'dynamic'
  if (['article', 'read'].includes(source))
    return 'article'
  if (['pgc', 'bangumi', 'season'].includes(source))
    return 'pgc'

  return null
}

function buildShareUrl(
  source: PrivateMessageShareSource,
  sourceId: string,
  bvid = '',
): string {
  if (source === 'video') {
    const identifier = bvid || sourceId
    if (/^BV\w+$/i.test(identifier) || /^av\d+$/i.test(identifier))
      return `https://www.bilibili.com/video/${identifier}`
    if (/^\d+$/.test(identifier))
      return `https://www.bilibili.com/video/av${identifier}`
    return ''
  }
  if (source === 'dynamic') {
    const identifier = sourceId.replace(/^opus\//i, '')
    return /^\d+$/.test(identifier) ? `https://www.bilibili.com/opus/${identifier}` : ''
  }
  if (source === 'article') {
    const identifier = sourceId.replace(/^cv/i, '')
    return /^\d+$/.test(identifier) ? `https://www.bilibili.com/read/cv${identifier}` : ''
  }
  return /^(?:ep|ss)\d+$/i.test(sourceId)
    ? `https://www.bilibili.com/bangumi/play/${sourceId}`
    : ''
}

function parseShareV2Content(content: string): PrivateMessageShareV2Content | null {
  const record = parseContentRecord(content)
  if (!record)
    return null
  const sourceId = normalizeString(record.id)
  const bvid = normalizeString(record.bvid)
  const source = normalizeShareSource(record.source)
  const cover = parseOptionalHttpUrl(record.thumb)
  const title = normalizeString(record.title)
  if (!source || !cover.ok || !title)
    return null
  const href = buildShareUrl(source, sourceId, bvid)
  if (!href)
    return null
  return {
    type: 'share-v2',
    source,
    sourceId,
    bvid,
    cover: cover.value,
    title,
    headline: normalizeString(record.headline),
    author: normalizeString(record.author),
    href,
  }
}

function parseNotificationContent(content: string): PrivateMessageNotificationContent | null {
  const record = parseContentRecord(content)
  if (!record)
    return null
  const title = normalizeString(record.title)
  const text = normalizeString(record.text)
  if (!title && !text)
    return null

  const modules: Array<{ title: string, detail: string }> = []
  if (record.modules !== undefined) {
    if (!Array.isArray(record.modules))
      return null
    for (const rawModule of record.modules) {
      const module = asRecord(rawModule)
      if (!module || typeof module.title !== 'string' || typeof module.detail !== 'string')
        return null
      modules.push({ title: module.title, detail: module.detail })
    }
  }

  const links: Array<{ text: string, href: string }> = []
  for (const suffix of ['', '_2', '_3']) {
    const rawHref = record[`jump_uri${suffix}`]
    const rawText = record[`jump_text${suffix}`]
    if (rawHref === undefined && rawText === undefined)
      continue
    const href = normalizeHttpUrl(rawHref)
    if (!href || typeof rawText !== 'string' || !rawText.trim())
      return null
    links.push({ href, text: rawText.trim() })
  }
  return { type: 'notification', title, text, modules, links }
}

function parseVideoCardContent(content: string): PrivateMessageVideoCardContent | null {
  const record = parseContentRecord(content)
  if (!record)
    return null
  const bvid = normalizeString(record.bvid)
  const title = normalizeString(record.title)
  const cover = parseOptionalHttpUrl(record.cover)
  if (!/^BV\w+$/i.test(bvid) || !title || !cover.ok)
    return null
  return {
    type: 'video-card',
    bvid,
    cover: cover.value,
    title,
    times: normalizeNumber(record.times),
    attachMessage: normalizeString(record.attach_msg),
    href: `https://www.bilibili.com/video/${bvid}`,
  }
}

function parseArticleCardContent(content: string): PrivateMessageArticleCardContent | null {
  const record = parseContentRecord(content)
  if (!record || !Array.isArray(record.image_urls))
    return null
  const rid = normalizeString(record.rid).replace(/^cv/i, '')
  const title = normalizeString(record.title)
  if (!/^\d+$/.test(rid) || !title)
    return null
  const images: string[] = []
  for (const rawImage of record.image_urls) {
    const image = normalizeHttpUrl(rawImage)
    if (!image)
      return null
    images.push(image)
  }
  return {
    type: 'article-card',
    rid,
    images,
    title,
    summary: normalizeString(record.summary),
    href: `https://www.bilibili.com/read/cv${rid}`,
  }
}

function parsePictureCardContent(content: string): PrivateMessagePictureCardContent | null {
  const record = parseContentRecord(content)
  const src = normalizeHttpUrl(record?.pic_url)
  const href = normalizeHttpUrl(record?.jump_url)
  return src && href ? { type: 'picture-card', src, href } : null
}

function parseCommonShareCardContent(content: string): PrivateMessageCommonShareCardContent | null {
  const record = parseContentRecord(content)
  if (!record)
    return null
  const sourceId = normalizeString(record.sourceID)
  const source = normalizeShareSource(record.source)
  const cover = parseOptionalHttpUrl(record.cover)
  const title = normalizeString(record.title)
  if (!source || !sourceId || !cover.ok || !title)
    return null
  const href = buildShareUrl(source, sourceId)
  if (!href)
    return null
  return {
    type: 'common-share-card',
    source,
    sourceId,
    cover: cover.value,
    title,
    author: normalizeString(record.author),
    href,
  }
}

function parseTextShareContent(content: string): PrivateMessageTextShareContent | null {
  const record = parseContentRecord(content)
  const title = normalizeString(record?.title)
  const text = normalizeString(record?.text)
  const href = normalizeHttpUrl(record?.jump_url)
  return title && href ? { type: 'text-share', title, text, href } : null
}

function parseBusinessCardContent(content: string): PrivateMessageBusinessCardContent | null {
  const record = parseContentRecord(content)
  const title = normalizeString(record?.main_title)
  if (!title || !Array.isArray(record?.sub_cards) || record.sub_cards.length === 0)
    return null
  const cards: PrivateMessageBusinessCardContent['cards'] = []
  for (const rawCard of record.sub_cards) {
    const card = asRecord(rawCard)
    const href = normalizeHttpUrl(card?.jump_url)
    const cover = parseOptionalHttpUrl(card?.cover_url)
    if (
      !href
      || !cover.ok
      || typeof card?.field1 !== 'string'
      || typeof card.field2 !== 'string'
      || typeof card.field3 !== 'string'
    ) {
      return null
    }
    cards.push({
      href,
      cover: cover.value,
      fields: [card.field1, card.field2, card.field3],
    })
  }
  return { type: 'business-card', title, cards }
}

function parseTipContent(content: string): PrivateMessageTipContent | null {
  const record = parseContentRecord(content)
  if (typeof record?.content !== 'string')
    return null
  try {
    const parsed = JSON.parse(record.content) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0)
      return null
    const lines: string[] = []
    for (const rawLine of parsed) {
      const line = asRecord(rawLine)
      if (typeof line?.text !== 'string' || !line.text.trim())
        return null
      lines.push(line.text.trim())
    }
    return { type: 'tip', lines }
  }
  catch {
    return null
  }
}

export const PRIVATE_MESSAGE_RENDERERS: Readonly<Record<number, PrivateMessageRenderer>> = {
  1: { parse: parseTextContent },
  2: { parse: content => parseMediaContent(content, 'image') },
  5: { parse: parseRecalledContent },
  6: { parse: content => parseMediaContent(content, 'emoticon') },
  7: { parse: parseShareV2Content },
  10: { parse: parseNotificationContent },
  11: { parse: parseVideoCardContent },
  12: { parse: parseArticleCardContent },
  13: { parse: parsePictureCardContent },
  14: { parse: parseCommonShareCardContent },
  15: { parse: parseTextShareContent },
  16: { parse: parseBusinessCardContent },
  18: { parse: parseTipContent },
}

export function parsePrivateMessageContent(
  message: PrivateMessage,
  emotions: Map<string, PrivateMessageEmotion>,
): ParsedPrivateMessageContent {
  const renderer = PRIVATE_MESSAGE_RENDERERS[message.msg_type]
  if (!renderer)
    return { type: 'unknown' }
  try {
    return renderer.parse(message.content, { emotions }) ?? { type: 'unknown' }
  }
  catch {
    return { type: 'unknown' }
  }
}
