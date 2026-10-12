import { isBilibiliAdvertisement } from './advertising'
import type { TextPromotionReason } from './momentPromotionText'
import { detectTextCommerce, isPromotionWarning, MOMENT_PROMOTION_TEXT_LIMIT } from './momentPromotionText'

export type MomentPromotionKind = 'advertisement' | 'commerce' | 'suspected'
export type MomentPromotionReason = 'api' | 'goods' | 'disclosure' | 'purchase-and-offer' | 'purchase-and-link' | TextPromotionReason
export interface MomentPromotion {
  kind: MomentPromotionKind
  reason: MomentPromotionReason
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function shoppingLink(value: unknown) {
  if (typeof value !== 'string')
    return false
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (!['http:', 'https:'].includes(url.protocol))
      return false
    return ['item.taobao.com', 's.click.taobao.com', 'detail.tmall.com', 'item.jd.com', 'u.jd.com', 'mall.bilibili.com'].includes(url.hostname)
  }
  catch { return false }
}

const TEXT_DYNAMIC_TYPES = new Set(['DYNAMIC_TYPE_WORD', 'DYNAMIC_TYPE_DRAW', 'DYNAMIC_TYPE_ARTICLE', 'DYNAMIC_TYPE_FORWARD'])
const TEXT_MAJOR_TYPES = new Set(['MAJOR_TYPE_ARTICLE', 'MAJOR_TYPE_DRAW', 'MAJOR_TYPE_OPUS'])
const MAX_FORWARD_DEPTH = 8

function detectOwnPromotion(value: unknown, budget: { remaining: number }): MomentPromotion | undefined {
  const item = record(value)
  const dynamic = record(record(item.modules).module_dynamic)
  const major = record(dynamic.major)
  const article = record(major.article)
  const opus = record(major.opus)
  if ([item, dynamic, major, article, opus].some(isBilibiliAdvertisement))
    return { kind: 'advertisement', reason: 'api' }
  const additional = record(dynamic.additional)
  const desc = record(dynamic.desc)
  const summary = record(opus.summary)
  const nodes = [desc.rich_text_nodes, summary.rich_text_nodes].flatMap(value => Array.isArray(value) ? value : []).map(record)
  if ((additional.type === 'ADDITIONAL_TYPE_GOODS' && Array.isArray(record(additional.goods).items) && (record(additional.goods).items as unknown[]).length > 0)
    || nodes.some(node => node.type === 'RICH_TEXT_NODE_TYPE_GOODS' || node.type === 'RICH_TEXT_NODE_TYPE_TAOBAO')) {
    return { kind: 'commerce', reason: 'goods' }
  }
  if (!TEXT_DYNAMIC_TYPES.has(String(item.type)) && !TEXT_MAJOR_TYPES.has(String(major.type)) && Number(record(item.basic).comment_type) !== 12)
    return undefined

  // Bounded analysis of the text already supplied with this post. No extra
  // article requests, remote model, title blacklist or inferred author reputation.
  const parts: string[] = []
  const seen = new Set<string>()
  let remaining = budget.remaining
  let richText = ''
  for (const node of nodes) {
    if (richText.length >= remaining)
      break
    const value = node.text || node.orig_text
    if (typeof value === 'string')
      richText += value.slice(0, remaining - richText.length)
  }
  for (const value of [article.title, article.desc, opus.title, summary.text, desc.text, richText]) {
    if (remaining <= 0)
      break
    if (typeof value !== 'string' || seen.has(value))
      continue
    seen.add(value)
    const part = value.slice(0, remaining)
    parts.push(part)
    remaining -= part.length + 1
  }
  budget.remaining = Math.max(0, remaining)
  const text = parts.join('\n')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')
  const commerce = detectTextCommerce(text)
  if (commerce)
    return { kind: commerce.cautious ? 'suspected' : 'commerce', reason: commerce.reason }
  const disclosure = /本[文篇期](?:内容)?由[^。！？\n]{1,24}(?:赞助|贊助|提供赞助)|#(?:商业合作|商業合作|品牌合作|赞助|贊助)#|(?:广告|廣告|推广|推廣)声明[：:]/u
  if (disclosure.test(text) && !/(?:广告|廣告|推广|推廣)声明[：:]\s*(?:无|無|没有|沒有|不含|未接受)/u.test(text))
    return { kind: 'suspected', reason: 'disclosure' }
  const purchase = /(?:点击|點擊|戳|前往|通过|通過|使用|输入|輸入)[^。！？\n]{0,16}(?:购买|購買|下单|下單|领券|領券|优惠码|優惠碼)|(?:购买|購買)(?:链接|連結)|(?:下单|下單)(?:立减|立減|享|返)/u
  if (!purchase.test(text))
    return undefined
  const offer = /到手[价價]|(?:优惠|優惠)[券码碼]|专属优惠|專屬優惠|限[时時][折优優]|立[减減]\s*\d|[返省]\s*\d+\s*元/u
  if (offer.test(text))
    return { kind: 'suspected', reason: 'purchase-and-offer' }
  if (nodes.some(node => shoppingLink(node.jump_url)))
    return { kind: 'suspected', reason: 'purchase-and-link' }
  return undefined
}

/**
 * Analyze each forwarding layer independently so unrelated captions do not
 * combine into advertising evidence. The whole chain shares one text budget.
 */
export function detectMomentPromotion(value: unknown): MomentPromotion | undefined {
  const budget = { remaining: MOMENT_PROMOTION_TEXT_LIMIT }
  const visited = new Set<object>()
  let current = value
  let suspected: MomentPromotion | undefined
  let warningContext = false
  for (let depth = 0; depth < MAX_FORWARD_DEPTH; depth++) {
    if (!current || typeof current !== 'object' || visited.has(current))
      break
    visited.add(current)
    const item = record(current)
    const promotion = detectOwnPromotion(item, budget)
    if (promotion) {
      if (!warningContext && promotion.kind !== 'suspected')
        return promotion
      suspected ??= { ...promotion, kind: 'suspected' }
    }
    if (item.type !== 'DYNAMIC_TYPE_FORWARD')
      break
    const desc = record(record(record(item.modules).module_dynamic).desc)
    warningContext ||= typeof desc.text === 'string' && isPromotionWarning(desc.text.slice(0, 480))
    current = item.orig
  }
  return suspected
}
