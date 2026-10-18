import type { Item as AppVideoItem } from '~/models/video/appForYou'
import { av2bv } from '~/utils/bvid'

export const APP_FOLLOWED_REASONS: ReadonlySet<string> = new Set(['已关注', '已關注', '新关注', '新關注'])

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

export function normalizeAppVideoItem(item: AppVideoItem): AppVideoItem {
  const paramAid = item.card_goto === 'av' ? positiveId(item.param) : undefined
  const aid = positiveId(item.player_args?.aid) ?? positiveId(item.args?.aid) ?? paramAid
  const rcmdReason = getAppRcmdReasonText(item)
  const bvid = item.bvid?.trim() || (item.card_goto === 'av' && aid ? av2bv(aid) : undefined)
  return {
    ...item,
    bvid,
    cover: item.cover?.replace(/^http:/i, 'https:'),
    args: {
      ...item.args,
      aid,
      up_id: positiveId(item.args?.up_id) ?? positiveId(item.mask?.avatar?.up_id),
      up_name: item.args?.up_name || item.mask?.avatar?.text || item.desc_button?.text,
    },
    bottom_rcmd_reason: item.bottom_rcmd_reason
      || (rcmdReason && APP_FOLLOWED_REASONS.has(rcmdReason) ? rcmdReason : undefined),
  }
}

export function getAppVideoKeys(item: AppVideoItem): string[] {
  const keys: string[] = []
  const bvid = item.bvid?.trim()
  if (bvid)
    keys.push(`bvid:${bvid}`)
  const aid = positiveId(item.args?.aid)
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
