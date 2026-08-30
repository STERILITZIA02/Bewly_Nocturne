import type { MomentCommentItem } from '~/components/MomentCard/commentUtils'
import type { DisplayMoment } from '~/components/MomentCard/types'

function toAbsoluteHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value, 'https://www.bilibili.com')
    if (url.protocol === 'http:')
      url.protocol = 'https:'
    return url.protocol === 'https:' ? url : null
  }
  catch {
    return null
  }
}

function getVideoCommentUrl(moment: DisplayMoment): URL | null {
  const existingVideoUrl = toAbsoluteHttpUrl(moment.videoUrl || '')
  if (existingVideoUrl
    && /(?:^|\.)bilibili\.com$/i.test(existingVideoUrl.hostname)
    && /^\/video\//.test(existingVideoUrl.pathname)) {
    return existingVideoUrl
  }

  const bvid = (moment.bvid || '').trim()
  if (bvid)
    return new URL(`/video/${encodeURIComponent(bvid)}`, 'https://www.bilibili.com')

  const aid = String(moment.aid || '').trim()
  if (aid)
    return new URL(`/video/av${encodeURIComponent(aid)}`, 'https://www.bilibili.com')
  return null
}

function getDynamicCommentUrl(moment: DisplayMoment): URL {
  const existingUrl = toAbsoluteHttpUrl(moment.url || '')
  if (moment.isArticle
    && existingUrl
    && /(?:^|\.)bilibili\.com$/i.test(existingUrl.hostname)) {
    return existingUrl
  }
  if (existingUrl?.hostname === 't.bilibili.com')
    return existingUrl
  return new URL(`https://t.bilibili.com/${encodeURIComponent(moment.id)}`)
}

export function buildMomentCommentPermalink(
  moment: DisplayMoment,
  comment: Pick<MomentCommentItem, 'id' | 'rootRpid' | 'rpid'>,
): string {
  const url = moment.commentType === 1 ? getVideoCommentUrl(moment) ?? getDynamicCommentUrl(moment) : getDynamicCommentUrl(moment)
  const currentRpid = (comment.rpid || comment.id).trim()
  const rootRpid = (comment.rootRpid || currentRpid).trim()

  url.searchParams.set('comment_on', '1')
  if (rootRpid && rootRpid !== '0')
    url.searchParams.set('comment_root_id', rootRpid)
  if (currentRpid && currentRpid !== '0' && currentRpid !== rootRpid)
    url.searchParams.set('comment_secondary_id', currentRpid)
  else
    url.searchParams.delete('comment_secondary_id')
  if (currentRpid && currentRpid !== '0')
    url.hash = `reply${currentRpid}`

  return url.toString()
}
