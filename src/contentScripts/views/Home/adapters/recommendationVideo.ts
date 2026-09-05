import type { VideoCardDisplayData } from '~/components/VideoCard/types'
import type { Item as AppVideoItem } from '~/models/video/appForYou'
import type { Item as VideoItem } from '~/models/video/forYou'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { isVerticalVideo } from '~/utils/uriParse'

export function transformWebVideo(item: VideoItem): VideoCardDisplayData {
  return {
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

export function transformAppVideo(item: AppVideoItem): VideoCardDisplayData {
  // 预先计算 followed 状态，避免多次 trim 和比较
  const bottomReason = item?.bottom_rcmd_reason?.trim()
  const followed = bottomReason === '已关注' || bottomReason === '已關注'

  // 预先计算 capsuleText，提取复杂逻辑
  const descPart = item?.desc?.split('·')?.[1]?.trim()
  const capsuleText = descPart || (followed ? bottomReason : undefined)

  // 预先计算 type，避免在模板中调用函数
  let type: 'horizontal' | 'vertical' | 'bangumi' = 'horizontal'
  if (item.card_goto === 'bangumi') {
    type = 'bangumi'
  }
  else if (item.uri && isVerticalVideo(item.uri)) {
    type = 'vertical'
  }

  return {
    // 注意：aid 可能为 0 或 undefined，但只要有 bvid 就是有效视频
    // VideoCardGrid 的骨架屏判断已优化为同时检查 id 和 bvid
    id: item.args?.aid ?? 0,
    aid: item.args?.aid,
    durationStr: item.cover_right_text,
    title: decodeHtmlEntities(item.title),
    cover: item.cover || '',
    author: {
      name: decodeHtmlEntities(item?.mask?.avatar?.text || ''),
      authorFace: item?.mask?.avatar?.cover || item?.avatar?.cover || '',
      followed,
      mid: item?.mask?.avatar?.up_id || 0,
    },
    capsuleText: decodeHtmlEntities(capsuleText),
    bvid: item.bvid || '',
    viewStr: item.cover_left_text_1,
    danmakuStr: item.cover_left_text_2,
    cid: item?.player_args?.cid,
    goto: item?.goto,
    param: item?.param,
    trackId: item?.track_id,
    url: item?.goto === 'bangumi' ? item.uri : '',
    type,
    threePointV2: item?.three_point_v2 || [],
  }
}
