import type { FavoriteResource } from '~/components/TopBar/types'
import type { Video } from '~/components/VideoCard/types'
import type { FavoriteArticle } from '~/models/article/favorite'
import type { Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoriteSeasonMedia } from '~/models/video/favoriteSeason'

export function getFavoriteResourceKey(item: FavoriteResource | FavoriteItem) {
  return `${item.id}:${item.type}`
}

export function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}

export function transformFavoriteItem(item: FavoriteItem): Video {
  return {
    id: item.id,
    duration: item.duration,
    title: item.title,
    cover: item.cover,
    author: {
      name: item.upper.name,
      authorFace: item.upper.face,
      mid: item.upper.mid,
    },
    view: item.cnt_info.play,
    danmaku: item.cnt_info.danmaku,
    publishedTimestamp: item.pubtime,
    bvid: isMusic(item) ? undefined : item.bvid,
    url: isMusic(item) ? `https://www.bilibili.com/audio/au${item.id}` : undefined,
    threePointV2: [],
  }
}

export function normalizeSeasonMedia(item: FavoriteSeasonMedia): FavoriteItem {
  return {
    id: item.id,
    type: 2,
    title: item.title,
    cover: item.cover,
    intro: '',
    page: 1,
    duration: item.duration,
    upper: {
      mid: item.upper.mid,
      name: item.upper.name,
      face: item.upper.face || '',
    },
    attr: 0,
    cnt_info: {
      ...item.cnt_info,
      play_switch: 0,
      reply: 0,
      view_text_1: '',
    },
    link: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : '',
    ctime: item.pubtime,
    pubtime: item.pubtime,
    fav_time: item.pubtime,
    bv_id: item.bvid,
    bvid: item.bvid,
    season: null,
    ogv: null,
    ugc: {
      first_cid: 0,
    },
  }
}

export function getFavoriteArticleCover(item: FavoriteArticle) {
  return item.cover?.url || ''
}

export function normalizeFavoriteArticleUrl(url: string) {
  if (url.startsWith('//'))
    return `https:${url}`
  if (url.startsWith('/'))
    return `https://www.bilibili.com${url}`
  return url
}

export function getFavoriteArticleUrl(item: FavoriteArticle) {
  if (item.jump_url)
    return normalizeFavoriteArticleUrl(item.jump_url)
  return `https://www.bilibili.com/opus/${item.opus_id}`
}

export function transformFavoriteArticle(item: FavoriteArticle) {
  const mid = item.author?.mid
  return {
    id: item.opus_id,
    url: getFavoriteArticleUrl(item),
    title: item.content || '',
    cover: getFavoriteArticleCover(item),
    author: item.author?.name || '',
    authorMid: mid != null && mid !== '' ? Number(mid) : undefined,
    view: item.stat?.view || undefined,
    like: item.stat?.like || undefined,
    publishTime: item.pub_time || undefined,
  }
}
