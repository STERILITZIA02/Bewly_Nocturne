import type { DisplayPrivateSession } from './privateSession'

export type PrivateRecipientSource = 'following' | 'global'

export interface TransientPrivateRecipient {
  mid: string
  name: string
  avatar: string
  source: PrivateRecipientSource
}

export interface PrivateRecipientSearchPage {
  items: TransientPrivateRecipient[]
  hasMore: boolean
}

export type PrivateRecipientSelection
  = | { session: DisplayPrivateSession }
    | { recipient: TransientPrivateRecipient }

const PRIVATE_RECIPIENT_PAGE_SIZE = 10

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function sanitizeName(value: unknown): string {
  return toText(value)
    .replace(/<em\b[^>]*>|<\/em>/gi, '')
    .replace(/[<>]/g, '')
    .trim()
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    return ''
  try {
    const candidate = value.startsWith('//') ? `https:${value}` : value
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  }
  catch {
    return ''
  }
}

function parseRecipientItems(
  values: unknown[],
  source: PrivateRecipientSource,
): TransientPrivateRecipient[] {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const record = asRecord(value)
    const mid = toText(record?.mid ?? record?.uid).trim()
    const name = sanitizeName(record?.uname ?? record?.name)
    if (!/^\d+$/.test(mid) || !name || seen.has(mid))
      return []
    seen.add(mid)
    return [{
      mid,
      name,
      avatar: normalizeHttpUrl(record?.face ?? record?.upic ?? record?.avatar),
      source,
    }]
  })
}

export function normalizePrivateRecipientQuery(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

export function canSearchPrivateRecipients(value: string): boolean {
  const query = normalizePrivateRecipientQuery(value)
  return /^\d+$/.test(query) || Array.from(query).length >= 2
}

export function buildFollowingRecipientSearchParams(
  currentMid: string,
  query: string,
  page: number,
) {
  return {
    vmid: currentMid,
    name: normalizePrivateRecipientQuery(query),
    pn: Math.max(1, Math.trunc(page)),
    ps: PRIVATE_RECIPIENT_PAGE_SIZE,
  }
}

export function buildGlobalRecipientSearchParams(query: string, page: number) {
  return {
    keyword: normalizePrivateRecipientQuery(query),
    page: Math.max(1, Math.trunc(page)),
    pagesize: PRIVATE_RECIPIENT_PAGE_SIZE,
  }
}

export function parseFollowingRecipientSearch(
  value: unknown,
  page: number,
): PrivateRecipientSearchPage | null {
  const root = asRecord(value)
  const data = asRecord(root?.data)
  if (root?.code !== 0 || !data || !Array.isArray(data.list))
    return null
  const items = parseRecipientItems(data.list, 'following')
  const total = typeof data.total === 'number' && Number.isFinite(data.total)
    ? Math.max(0, Math.trunc(data.total))
    : null
  return {
    items,
    hasMore: total === null
      ? data.list.length >= PRIVATE_RECIPIENT_PAGE_SIZE
      : page * PRIVATE_RECIPIENT_PAGE_SIZE < total,
  }
}

export function parseGlobalRecipientSearch(
  value: unknown,
  page: number,
): PrivateRecipientSearchPage | null {
  const root = asRecord(value)
  const data = asRecord(root?.data)
  if (root?.code !== 0 || !data || !Array.isArray(data.result))
    return null
  const items = parseRecipientItems(data.result, 'global')
  const totalPages = typeof data.numPages === 'number' && Number.isFinite(data.numPages)
    ? Math.max(0, Math.trunc(data.numPages))
    : null
  return {
    items,
    hasMore: totalPages === null
      ? data.result.length >= PRIVATE_RECIPIENT_PAGE_SIZE
      : page < totalPages,
  }
}

export function mergePrivateRecipientResults(
  current: TransientPrivateRecipient[],
  incoming: TransientPrivateRecipient[],
  limit = 30,
): TransientPrivateRecipient[] {
  const incomingByMid = new Map(incoming.map(item => [item.mid, item]))
  const existingMids = new Set(current.map(item => item.mid))
  return [
    ...current.map(item => incomingByMid.get(item.mid) ?? item),
    ...incoming.filter(item => !existingMids.has(item.mid)),
  ].slice(0, limit)
}

export function resolvePrivateRecipientSelection(
  recipient: TransientPrivateRecipient,
  sessions: DisplayPrivateSession[],
): PrivateRecipientSelection {
  const session = sessions.find(item => item.sessionType === 1 && item.talkerId === recipient.mid)
  return session ? { session } : { recipient }
}
