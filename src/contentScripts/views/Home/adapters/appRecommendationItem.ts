import type { Item as AppVideoItem } from '~/models/video/appForYou'
import { av2bv } from '~/utils/bvid'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { parseBilibiliUri } from '~/utils/uriParse'

export const APP_FOLLOWED_REASONS: ReadonlySet<string> = new Set(['已关注', '已關注', '新关注', '新關注'])

export interface NormalizedAppVideoItem extends AppVideoItem {
  normalized: {
    reasons: string[]
    followed?: boolean
    authorName?: string
    publishedText?: string
    publishedTimestamp?: number
    portrait?: boolean
    vertical?: boolean
  }
}

function positiveId(value: unknown): number | undefined {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

export function getAppRcmdReasonText(item: Pick<AppVideoItem, 'rcmd_reason'>): string | undefined {
  const reason = item.rcmd_reason
  return (typeof reason === 'string' ? reason : reason?.content)?.trim() || undefined
}

export function getAppBangumiUrl(uri?: string): string {
  if (!uri)
    return ''
  if (/^https:\/\//.test(uri))
    return uri
  const match = /^bilibili:\/\/pgc\/season\/(ep\/)?(\d+)/.exec(uri)
  return match ? `https://www.bilibili.com/bangumi/play/${match[1] ? 'ep' : 'ss'}${match[2]}` : ''
}

export function getAppVideoAid(item: AppVideoItem): number | undefined {
  // PGC args/param may identify a season; only player_args explicitly identifies its video.
  return positiveId(item.player_args?.aid)
    ?? (item.card_goto === 'av' ? positiveId(item.args?.aid) ?? positiveId(item.param) : undefined)
}

export function normalizeAppVideoItem(item: AppVideoItem): NormalizedAppVideoItem {
  const aid = getAppVideoAid(item)
  const reasons = [getAppRcmdReasonText(item), item.bottom_rcmd_reason, item.top_rcmd_reason]
    .flatMap(reason => reason?.split(/[|｜]/).map(text => text.trim()).filter(Boolean) ?? [])
  const followed = typeof item.is_atten === 'boolean' ? item.is_atten : reasons.some(reason => APP_FOLLOWED_REASONS.has(reason)) ? true : undefined
  const authorName = [item.args?.up_name, item.multiply_desc?.author_name, item.mask?.avatar?.text, item.avatar?.text, item.desc_button?.text].map(text => text?.trim()).find(Boolean)
  const descriptionSuffix = (item.multiply_desc?.extra || item.desc)?.split('·').slice(1).join('·').trim()
  const publishedText = descriptionSuffix && /^(?:刚刚|剛剛|今天|昨天|前天|\d+\s*(?:[秒天周週年]|分钟|分鐘|小时|小時|个月|個月)前|(?:\d{4}[-/.年])?\d{1,2}[-/.月]\d{1,2}日?)(?:\s+\d{1,2}:\d{2})?$/.test(descriptionSuffix) ? descriptionSuffix : undefined
  const dimensions = item.uri ? parseBilibiliUri(item.uri) : undefined
  const width = positiveId(dimensions?.player_width)
  const height = positiveId(dimensions?.player_height)
  const vertical = reasons.some(reason => reason === '竖屏' || reason === '豎屏') ? true : width && height ? height > width : undefined
  const portrait = vertical === true ? true : width && height ? height >= width : undefined
  const bvid = item.bvid?.trim() || (item.card_goto === 'av' && aid ? av2bv(aid) : undefined)
  return {
    ...item,
    bvid,
    cover: item.cover?.replace(/^http:/i, 'https:'),
    args: {
      ...item.args,
      aid,
      up_id: positiveId(item.args?.up_id) ?? positiveId(item.mask?.avatar?.up_id) ?? positiveId(item.avatar?.up_id),
      up_name: authorName,
    },
    normalized: {
      reasons,
      followed,
      authorName: authorName ? decodeHtmlEntities(authorName) : undefined,
      publishedText: publishedText ? decodeHtmlEntities(publishedText) : undefined,
      publishedTimestamp: positiveId(item.pubdate),
      portrait,
      vertical,
    },
  }
}

export function getAppVideoKeys(item: AppVideoItem): string[] {
  const keys: string[] = []
  const bvid = item.bvid?.trim()
  if (bvid)
    keys.push(`bvid:${bvid}`)
  const aid = getAppVideoAid(item)
  if (aid)
    keys.push(`aid:${aid}`)
  const param = `${item.param ?? ''}`.trim()
  if (param && item.card_goto !== 'av')
    keys.push(`${item.card_goto}:${param}`)
  return keys
}

export function isRepresentableAppVideo(item: AppVideoItem): boolean {
  return (item.card_goto === 'av' || item.card_goto === 'bangumi')
    && !item.card_type?.includes('banner')
    && getAppVideoKeys(item).length > 0
}
