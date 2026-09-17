import type { Author } from '~/components/VideoCard/types'
import type { List as WatchLaterItem } from '~/models/video/watchLater'

export function normalizeWatchLaterItem(value: unknown): WatchLaterItem | undefined {
  if (!value || typeof value !== 'object')
    return
  const item = value as WatchLaterItem
  if (!Number.isSafeInteger(item.aid) || item.aid <= 0)
    return
  return {
    ...item,
    title: typeof item.title === 'string' ? item.title : typeof item.bangumi?.season?.title === 'string' ? item.bangumi.season.title : '',
    pic: typeof item.pic === 'string' ? item.pic : typeof item.bangumi?.cover === 'string' ? item.bangumi.cover : '',
    bvid: typeof item.bvid === 'string' ? item.bvid : '',
    duration: Number.isFinite(item.duration) ? item.duration : 0,
    progress: Number.isFinite(item.progress) ? item.progress : 0,
    pubdate: Number.isFinite(item.pubdate) ? item.pubdate : 0,
    owner: {
      mid: Number.isSafeInteger(item.owner?.mid) && item.owner.mid > 0 ? item.owner.mid : 0,
      name: typeof item.owner?.name === 'string' ? item.owner.name : '',
      face: typeof item.owner?.face === 'string' ? item.owner.face : '',
    },
  }
}

function hasPgcIdentity(item: WatchLaterItem) {
  return item.is_pgc || (Number.isSafeInteger(item.bangumi?.ep_id) && item.bangumi!.ep_id! > 0)
    || (Number.isSafeInteger(item.bangumi?.season?.season_id) && item.bangumi!.season!.season_id! > 0)
}

export function getWatchLaterPlaybackUrl(item: WatchLaterItem, queue = false): string {
  if (item.state < 0 || (item.arc_state !== undefined && item.arc_state < 0))
    return ''
  if (hasPgcIdentity(item)) {
    if (item.redirect_url && /^https:\/\/www\.bilibili\.com\/bangumi\/play\/(?:ep|ss)\d+(?:[/?#]|$)/.test(item.redirect_url))
      return item.redirect_url
    const ep = item.bangumi?.ep_id
    const season = item.bangumi?.season?.season_id ?? item.season_id
    if (ep && Number.isSafeInteger(ep) && ep > 0)
      return `https://www.bilibili.com/bangumi/play/ep${ep}`
    return season && Number.isSafeInteger(season) && season > 0 ? `https://www.bilibili.com/bangumi/play/ss${season}` : ''
  }
  if (item.is_pugv || (item.redirect_url && !/^https:\/\/www\.bilibili\.com\/video\/(?:BV[\da-z]{10}|av\d+)(?:[/?#]|$)/i.test(item.redirect_url)))
    return ''
  if (/^BV[\da-z]{10}$/i.test(item.bvid))
    return queue ? `https://www.bilibili.com/list/watchlater?bvid=${item.bvid}` : `https://www.bilibili.com/video/${item.bvid}/`
  return Number.isSafeInteger(item.aid) && item.aid > 0 ? `https://www.bilibili.com/video/av${item.aid}/` : ''
}

export function getWatchLaterAuthor(item: WatchLaterItem): Author {
  const owner = item.owner
  return {
    name: owner?.name || (hasPgcIdentity(item) ? item.bangumi?.season?.title || item.title : ''),
    authorFace: owner?.face || (hasPgcIdentity(item) ? item.bangumi?.cover || item.pic : ''),
    mid: owner?.mid || undefined,
    authorUrl: owner?.mid ? `https://space.bilibili.com/${owner.mid}` : getWatchLaterPlaybackUrl(item),
  }
}

export function mergeWatchLaterItemsByAid<T extends { aid: number }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set<number>()
  return [...existing, ...incoming].filter((item) => {
    if (!Number.isFinite(item.aid) || seen.has(item.aid))
      return false
    seen.add(item.aid)
    return true
  })
}
