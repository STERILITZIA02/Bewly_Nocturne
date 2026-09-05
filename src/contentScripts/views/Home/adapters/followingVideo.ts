import type { Author, Video } from '~/components/VideoCard/types'
import type { DataItem as MomentItem } from '~/models/moment/moment'
import { parseStatNumber } from '~/utils/dataFormatter'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

export function mapMomentItemToVideo(item?: MomentItem, authors?: Author[]): Video | undefined {
  if (!item)
    return undefined

  const major = item.modules?.module_dynamic?.major
  const archive = major?.archive || major?.ugc_season
  if (!archive)
    return undefined

  const stat = archive.stat
  const likeCount = item.modules?.module_stat?.like?.count

  const decodedAuthors = authors?.map(author => ({
    ...author,
    name: decodeHtmlEntities(author.name),
  }))

  const authorValue = decodedAuthors && decodedAuthors.length > 0
    ? (decodedAuthors.length === 1 ? decodedAuthors[0] : decodedAuthors)
    : undefined

  const isCollaboration = authors && authors.length > 1

  const badge = archive.badge?.text && archive.badge.text !== '投稿视频'
    ? {
        bgColor: archive.badge.bg_color,
        color: archive.badge.color,
        iconUrl: archive.badge.icon_url || undefined,
        text: decodeHtmlEntities(archive.badge.text),
      }
    : undefined

  const id = Number.parseInt(archive.aid, 10)

  return {
    id: Number.isNaN(id) ? 0 : id,
    durationStr: archive.duration_text,
    title: decodeHtmlEntities(archive.title),
    desc: decodeHtmlEntities(archive.desc),
    cover: archive.cover,
    author: authorValue,
    view: parseStatNumber(stat?.play),
    viewStr: stat?.play,
    danmaku: parseStatNumber(stat?.danmaku),
    danmakuStr: stat?.danmaku,
    like: typeof likeCount === 'number' ? likeCount : parseStatNumber(stat?.like),
    likeStr: stat?.like_str ?? stat?.like,
    capsuleText: decodeHtmlEntities(item.modules?.module_author?.pub_time?.trim() || undefined),
    publishedTimestamp: item.modules?.module_author?.pub_ts,
    bvid: archive.bvid,
    badge,
    displayTags: isCollaboration ? ['联合投稿'] : undefined,
    threePointV2: [],
  }
}
