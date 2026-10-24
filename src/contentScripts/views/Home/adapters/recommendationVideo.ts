import type { VideoCardDisplayData } from '~/components/VideoCard/types'
import type { Item as VideoItem } from '~/models/video/forYou'
import { isBilibiliAdvertisement, toAdvertisementCard } from '~/utils/advertising'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

import type { NormalizedAppVideoItem } from './appRecommendationItem'
import { getAppBangumiUrl, getAppVideoAid } from './appRecommendationItem'

export function transformWebVideo(item: VideoItem): VideoCardDisplayData {
  if (isBilibiliAdvertisement(item))
    return toAdvertisementCard(item)
  return {
    recommendationSource: 'web',
    id: item.id,
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    cover: item.pic,
    author: {
      name: decodeHtmlEntities(item.owner?.name || ''),
      authorFace: item.owner?.face || '',
      followed: !!item.is_followed,
      mid: item.owner?.mid || 0,
    },
    displayTags: [decodeHtmlEntities(item?.rcmd_reason?.content)].filter(Boolean),
    view: item.stat?.view || 0,
    danmaku: item.stat?.danmaku || 0,
    like: item.stat?.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    cid: item.cid,
    goto: item.goto,
    trackId: item.track_id,
    threePointV2: [],
  }
}

export function transformAppVideo(item: NormalizedAppVideoItem): VideoCardDisplayData {
  if (isBilibiliAdvertisement(item))
    return toAdvertisementCard(item)
  const { followed, authorName, publishedText, publishedTimestamp, portrait, vertical } = item.normalized
  const type = item.card_goto === 'bangumi' ? 'bangumi' : vertical ? 'vertical' : 'horizontal'
  const aid = getAppVideoAid(item)
  return {
    recommendationSource: 'app',
    // 注意：aid 可能为 0 或 undefined，但只要有 bvid 就是有效视频
    // VideoCardGrid 的骨架屏判断已优化为同时检查 id 和 bvid
    id: aid ?? 0,
    aid,
    durationStr: item.cover_right_text,
    title: decodeHtmlEntities(item.title),
    cover: item.cover || '',
    author: {
      name: authorName,
      authorFace: '',
      followed,
      mid: item.args?.up_id,
    },
    capsuleText: publishedText,
    publishedTimestamp,
    bvid: item.bvid || '',
    viewStr: item.cover_left_text_1,
    danmakuStr: item.cover_left_text_2,
    cid: item?.player_args?.cid,
    goto: item.card_goto,
    portrait,
    param: item?.param,
    trackId: item?.track_id,
    url: item.card_goto === 'bangumi' ? getAppBangumiUrl(item.uri) : '',
    type,
    threePointV2: item?.three_point_v2 || [],
  }
}
