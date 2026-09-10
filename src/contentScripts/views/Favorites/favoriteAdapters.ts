import type { Video } from '~/components/VideoCard/types'
import type { FavoriteArticle } from '~/models/article/favorite'
import type { Media as FavoriteItem } from '~/models/video/favorite'
import { getFavoriteResourceBvid, getFavoriteResourceUrl, isFavoriteAudio, isPlayableFavoriteVideo } from '~/utils/favoriteResource'

export function transformFavoriteItem(item: FavoriteItem): Video {
  return {
    id: item.id,
    duration: item.duration,
    title: item.title,
    cover: item.cover,
    author: {
      name: item.upper?.name,
      authorFace: item.upper?.face || '',
      mid: item.upper?.mid,
    },
    view: item.cnt_info.play,
    danmaku: item.cnt_info.danmaku,
    publishedTimestamp: item.pubtime,
    bvid: isPlayableFavoriteVideo(item) ? getFavoriteResourceBvid(item) : undefined,
    url: isFavoriteAudio(item) ? getFavoriteResourceUrl(item) : undefined,
    threePointV2: [],
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
