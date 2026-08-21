export interface MomentCommentAuthor {
  id: string
  name: string
  avatar: string
  nameColor?: string
}

export interface MomentCommentItem {
  id: string
  author: MomentCommentAuthor
  message: string
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

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toId(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value)
  return ''
}

function normalizeComment(value: unknown): MomentCommentItem | null {
  const raw = asRecord(value)
  const member = asRecord(raw.member)
  const vip = asRecord(member.vip)
  const content = asRecord(raw.content)
  const message = typeof content.message === 'string' ? content.message.trim() : ''
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
