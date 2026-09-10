import type { Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoriteSeasonMedia, FavoriteSource } from '~/models/video/favoriteSeason'

export function getFavoriteResourceKey(item: { id: number, type?: number }) {
  return `${item.id}:${item.type ?? 'unknown'}`
}

export function getFavoriteSourceKey(source: { id: number, type: number }) {
  return `${source.type}:${source.id}`
}

export function getFavoriteResourceBvid(item: { bvid?: string, bv_id?: string }) {
  return item.bvid || item.bv_id || ''
}

export function isPlayableFavoriteVideo(item: Pick<FavoriteItem, 'type' | 'attr' | 'bvid' | 'bv_id'>) {
  return item.type === 2 && (item.attr & 1) === 0 && !!getFavoriteResourceBvid(item)
}

export function isFavoriteAudio(item: { type: number, link?: string }) {
  return item.type === 12 || !!item.link?.startsWith('bilibili://music')
}

export function getFavoriteResourceUrl(item: Pick<FavoriteItem, 'id' | 'type' | 'attr' | 'bvid' | 'bv_id' | 'link'>) {
  if ((item.attr & 1) !== 0)
    return undefined
  if (isFavoriteAudio(item))
    return `https://www.bilibili.com/audio/au${item.id}`
  return isPlayableFavoriteVideo(item) ? `https://www.bilibili.com/video/${getFavoriteResourceBvid(item)}/` : undefined
}

/** Defaults belong only to fav/season/list, never to public folder resources. */
export function normalizeFavoriteSourceMedia(item: FavoriteSeasonMedia | FavoriteItem, sourceType: FavoriteSource['type']): FavoriteItem {
  const bvid = getFavoriteResourceBvid(item)
  if (sourceType === 11)
    return { ...item, bvid } as FavoriteItem
  return {
    ...item,
    type: item.type ?? 2,
    attr: item.attr ?? 0,
    intro: item.intro ?? '',
    page: item.page ?? 1,
    upper: { ...item.upper, face: item.upper.face ?? '' },
    cnt_info: { play_switch: 0, reply: 0, view_text_1: '', ...item.cnt_info },
    link: item.link ?? (bvid ? `https://www.bilibili.com/video/${bvid}` : ''),
    ctime: item.ctime ?? item.pubtime,
    fav_time: item.fav_time ?? item.pubtime,
    bv_id: item.bv_id ?? bvid,
    bvid,
    season: 'season' in item ? item.season : null,
    ogv: 'ogv' in item ? item.ogv : null,
    ugc: 'ugc' in item ? item.ugc : { first_cid: 0 },
  }
}
