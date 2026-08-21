export interface MomentCommentAuthor {
  id: string
  name: string
  avatar: string
  nameColor?: string
}

export type MomentCommentSegment
  = | { type: 'text', text: string }
    | { type: 'emote', text: string, url: string }
    | { type: 'mention', text: string, mid: string }
    | { type: 'link', text: string, url: string }

export interface MomentCommentItem {
  id: string
  author: MomentCommentAuthor
  message: string
  segments: MomentCommentSegment[]
  createdAt: number
  likeCount: number
  replyCount: number
  replies: MomentCommentItem[]
}

export interface MomentCommentPage {
  items: MomentCommentItem[]
  hasMore: boolean
  nextPage: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toId(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value)
  return ''
}

function firstString(...values: unknown[]): string {
  return values.find(value => typeof value === 'string' && value) as string | undefined ?? ''
}

function isSafeRemoteUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url)
}

function appendText(segments: MomentCommentSegment[], text: string) {
  if (!text)
    return
  const previous = segments[segments.length - 1]
  if (previous?.type === 'text')
    previous.text += text
  else
    segments.push({ type: 'text', text })
}

function getRichNodeReplacements(content: Record<string, unknown>): Map<string, MomentCommentSegment> {
  const replacements = new Map<string, MomentCommentSegment>()
  const emoteMap = asRecord(content.emote)

  Object.entries(emoteMap).forEach(([text, value]) => {
    const emote = asRecord(value)
    const url = firstString(emote.url, emote.gif_url, emote.webp_url)
    if (text && isSafeRemoteUrl(url))
      replacements.set(text, { type: 'emote', text, url })
  })

  asArray(content.members).forEach((value) => {
    const member = asRecord(value)
    const mid = toId(member.mid)
    const name = firstString(member.uname, member.name)
    if (mid && name)
      replacements.set(`@${name}`, { type: 'mention', text: `@${name}`, mid })
  })

  Object.entries(asRecord(content.at_name_to_mid)).forEach(([name, value]) => {
    const mid = toId(value)
    if (mid && name)
      replacements.set(`@${name}`, { type: 'mention', text: `@${name}`, mid })
  })

  Object.entries(asRecord(content.jump_url)).forEach(([text, value]) => {
    const jump = asRecord(value)
    const url = firstString(jump.pc_url, jump.url, jump.app_url)
    if (text && isSafeRemoteUrl(url))
      replacements.set(text, { type: 'link', text, url })
  })

  asArray(content.rich_text_nodes).forEach((value) => {
    const node = asRecord(value)
    const text = firstString(node.text, node.orig_text)
    const type = firstString(node.type).toUpperCase()
    if (!text)
      return

    if (type.includes('AT')) {
      const mid = toId(node.rid || node.mid)
      if (mid)
        replacements.set(text, { type: 'mention', text, mid })
      return
    }

    if (type.includes('EMOJI')) {
      const emoji = asRecord(node.emoji)
      const url = firstString(node.icon_url, emoji.icon_url, emoji.url)
      if (isSafeRemoteUrl(url))
        replacements.set(text, { type: 'emote', text, url })
      return
    }

    if (type.includes('WEB') || type.includes('LINK')) {
      const url = firstString(node.jump_url, node.url)
      if (isSafeRemoteUrl(url))
        replacements.set(text, { type: 'link', text, url })
    }
  })

  return replacements
}

export function normalizeMomentCommentSegments(
  contentValue: unknown,
  message: string,
): MomentCommentSegment[] {
  const replacements = Array.from(getRichNodeReplacements(asRecord(contentValue)).values())
    .sort((left, right) => right.text.length - left.text.length)
  if (!replacements.length)
    return [{ type: 'text', text: message }]

  const segments: MomentCommentSegment[] = []
  let cursor = 0
  while (cursor < message.length) {
    let nextIndex = message.length
    let nextReplacement: MomentCommentSegment | undefined
    replacements.forEach((replacement) => {
      const index = message.indexOf(replacement.text, cursor)
      if (index >= 0 && index < nextIndex) {
        nextIndex = index
        nextReplacement = replacement
      }
    })

    if (!nextReplacement) {
      appendText(segments, message.slice(cursor))
      break
    }

    appendText(segments, message.slice(cursor, nextIndex))
    segments.push({ ...nextReplacement })
    cursor = nextIndex + nextReplacement.text.length
  }

  return segments.length ? segments : [{ type: 'text', text: message }]
}

function normalizeComment(value: unknown): MomentCommentItem | null {
  const raw = asRecord(value)
  const member = asRecord(raw.member)
  const vip = asRecord(member.vip)
  const content = asRecord(raw.content)
  const richNodeMessage = asArray(content.rich_text_nodes)
    .map(node => firstString(asRecord(node).text, asRecord(node).orig_text))
    .join('')
  const message = firstString(content.message, richNodeMessage).trim()
  const createdAt = Number(raw.ctime) || 0
  const authorId = toId(member.mid || raw.mid)
  const id = toId(raw.rpid_str || raw.rpid)
    || `${authorId}-${createdAt}-${message}`
  if (!id || !message)
    return null

  const replies = asArray(raw.replies)
    .map(normalizeComment)
    .filter((item): item is MomentCommentItem => Boolean(item))

  return {
    id,
    author: {
      id: authorId,
      name: typeof member.uname === 'string' && member.uname.trim()
        ? member.uname.trim()
        : '',
      avatar: typeof member.avatar === 'string' ? member.avatar : '',
      nameColor: typeof vip.nickname_color === 'string' && vip.nickname_color
        ? vip.nickname_color
        : undefined,
    },
    message,
    segments: normalizeMomentCommentSegments(content, message),
    createdAt,
    likeCount: Math.max(0, Number(raw.like) || 0),
    replyCount: Math.max(replies.length, Number(raw.rcount ?? raw.count) || 0),
    replies,
  }
}

export function mergeMomentComments(
  current: MomentCommentItem[],
  incoming: MomentCommentItem[],
) {
  const items = [...current]
  const indexes = new Map(items.map((item, index) => [item.id, index]))
  for (const item of incoming) {
    const index = indexes.get(item.id)
    if (index === undefined) {
      indexes.set(item.id, items.length)
      items.push(item)
    }
    else {
      items[index] = item
    }
  }
  return items
}

export function normalizeMomentCommentPage(
  response: unknown,
  requestedPage: number,
  requestedPageSize: number,
): MomentCommentPage {
  const root = asRecord(response)
  if (Number(root.code) !== 0)
    throw new Error(typeof root.message === 'string' && root.message ? root.message : 'Comment request failed')

  const data = asRecord(root.data)
  const page = asRecord(data.page)
  const cursor = asRecord(data.cursor)
  const replies = asArray(data.replies)
  const source = requestedPage === 1
    ? [...asArray(data.hots), ...replies]
    : replies
  const items = mergeMomentComments(
    [],
    source
      .map(normalizeComment)
      .filter((item): item is MomentCommentItem => Boolean(item)),
  )

  const pageNumber = Math.max(1, Number(page.num) || requestedPage)
  const pageSize = Math.max(1, Number(page.size) || requestedPageSize)
  const total = Math.max(0, Number(page.count ?? page.acount) || 0)
  const hasCursorEnd = typeof cursor.is_end === 'boolean'
  const hasMore = hasCursorEnd
    ? !cursor.is_end
    : total > 0
      ? pageNumber * pageSize < total
      : replies.length >= pageSize

  return {
    items,
    hasMore,
    nextPage: pageNumber + 1,
  }
}
