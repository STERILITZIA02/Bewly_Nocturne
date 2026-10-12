export type OtherFavoriteKind = 'topic' | 'article' | 'course'
export type OtherFavoriteSearchScope = 'all' | 'title' | 'detail'
export type FavoriteVideoOrder = 'mtime' | 'view' | 'pubtime'
export type SubscriptionFilter = 'all' | 'season' | 'folder'

export const OTHER_FAVORITE_PAGE_SIZE = { topic: 24, course: 20 } as const

export interface OtherFavoriteItem {
  id: string
  title: string
  desc: string
  url: string
  cover: string
  author: string
  view?: number | string
  reply?: number | string
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid-other-favorite-response')
  return value as Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function statistic(value: unknown) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined
}

/** Native space client: topic_list.topic_items/page_info; course items/page. */
export function parseOtherFavoritePage(kind: Exclude<OtherFavoriteKind, 'article'>, response: unknown) {
  const result = record(response)
  if (result.code !== 0)
    throw new Error('other-favorites-read-failed')
  const data = kind === 'course' && result.data == null ? {} : record(result.data)
  // The native client treats a missing topic_list on a successful read as empty.
  const list = kind === 'topic' ? record(data.topic_list ?? { topic_items: [], page_info: { total: 0 } }) : data
  const rawItems = kind === 'topic' ? list.topic_items : list.items
  const rawPagination = kind === 'topic' ? list.page_info : list.page
  const pagination = rawPagination == null ? {} : record(rawPagination)
  // The native course client permits a successful empty response without page
  // metadata. A positive count/next page must still be treated as incomplete.
  if (kind === 'course' && (rawItems == null || (Array.isArray(rawItems) && !rawItems.length))
    && pagination.total == null && pagination.next !== true) {
    return { items: [] as OtherFavoriteItem[], total: 0 }
  }
  const total = typeof pagination.total === 'string' && /^\d+$/.test(pagination.total)
    ? Number(pagination.total)
    : pagination.total
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0)
    throw new Error('invalid-other-favorite-count')
  if (!Array.isArray(rawItems) && !(rawItems == null && total === 0))
    throw new Error('invalid-other-favorite-items')
  const items: OtherFavoriteItem[] = (rawItems ?? []).map((value: unknown) => {
    const item = record(value)
    const id = String(kind === 'topic' ? item.id : item.season_id)
    const title = text(kind === 'topic' ? item.name : item.title)
    if (!/^\d+$/.test(id) || !title)
      throw new Error('invalid-other-favorite-item')
    const url = new URL(kind === 'topic' ? text(item.jump_url) : `/cheese/play/ss${id}`, 'https://www.bilibili.com')
    if (!['https:', 'http:'].includes(url.protocol) || (kind === 'topic' && !text(item.jump_url)))
      throw new Error('invalid-other-favorite-link')
    return {
      id,
      title,
      desc: text(kind === 'topic' ? item.stat_desc : item.status),
      url: url.href,
      cover: kind === 'course' ? text(item.cover) : '',
      author: '',
      view: kind === 'topic' && !item.show_interact_data ? undefined : statistic(item.view ?? item.play),
      reply: kind === 'topic' && item.show_interact_data ? statistic(item.discuss) : undefined,
    }
  })
  return { items, total }
}

export function matchesSubscriptionType(type: number, filter: SubscriptionFilter) {
  return filter === 'all' || type === (filter === 'season' ? 21 : 11)
}
