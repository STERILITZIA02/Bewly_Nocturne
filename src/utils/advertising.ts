import type { VideoCardDisplayData } from '~/components/VideoCard/types'

/** Only explicit API markers identify advertising; titles and missing menus do not. */
export function isBilibiliAdvertisement(value: unknown): boolean {
  if (!value || typeof value !== 'object')
    return false
  const item = value as Record<string, unknown>
  if (item.is_ad === true || item.is_ad === 1 || item.is_ad_loc === true || item.is_ad_loc === 1)
    return true
  if (item.goto === 'ad' || item.card_type === 'cm_v1')
    return true
  if ([item.type, item.card_type].some(type => typeof type === 'string' && /(?:^|_)ad(?:_|$)/i.test(type)))
    return true
  return ['ad_info', 'ad_extra', 'cm_info'].some((key) => {
    const marker = item[key]
    return marker !== null && typeof marker === 'object' && Object.keys(marker).length > 0
  }) || item.cm_mark === 1
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function webUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim())
    return undefined
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  }
  catch { return undefined }
}

/** A promotion is a link card, never a video ID or a watch-later candidate. */
export function toAdvertisementCard(value: unknown): VideoCardDisplayData {
  const item = record(value)
  const ad = record(item.ad_info)
  const creative = record(ad.creative_content)
  const title = typeof item.title === 'string' ? item.title : typeof creative.title === 'string' ? creative.title : ''
  const url = webUrl(creative.url) ?? webUrl(item.uri) ?? webUrl(item.arcurl) ?? webUrl(item.url)
  const cover = webUrl(creative.image_url) ?? webUrl(item.pic) ?? webUrl(item.cover) ?? ''
  return {
    id: 0,
    bvid: '',
    isAdvertisement: true,
    advertisementKey: `ad:${String(ad.creative_id ?? item.id ?? url ?? `${title}:${cover}`)}`,
    title,
    cover,
    url,
    author: { name: '', authorFace: '', followed: false, mid: 0 },
    threePointV2: [],
  }
}

/** The native search brand_ad section is separate from ordinary video results. */
export function toSearchBrandAdvertisementCards(value: unknown): VideoCardDisplayData[] {
  const item = record(value)
  const card = record(item.card)
  const advertiser = record(card.adver)
  const user = record(item.bili_user)
  const mid = String(user.mid ?? '')
  const advertiserUrl = /^\d+$/.test(mid) && mid !== '0'
    ? `https://space.bilibili.com/${mid}`
    : advertiser.adver_page_url
  const fallback = toAdvertisementCard({
    id: item.id,
    title: user.uname ?? advertiser.adver_name ?? item.title,
    cover: user.upic ?? advertiser.adver_logo,
    url: webUrl(advertiserUrl) ?? webUrl(record(card.button).jump_url)
      ?? webUrl(record(Array.isArray(card.choose_button_list) ? card.choose_button_list[0] : undefined).jump_url),
  })
  // Numeric values are the native BrandAdverCard's layout kinds, not a
  // general advertisement detector. Only the explicit brand_ad outlet calls us.
  const kind = card.card_type === 105 || item.type === 'brand_ad_154'
    ? 'cover'
    : card.card_type === 106 ? 'video' : card.card_type === 107 ? 'archive' : 'brand'
  const content = kind === 'cover' ? card.covers : kind === 'video' ? card.videos : kind === 'archive' ? user.res : undefined
  if (!Array.isArray(content) || !content.length)
    return [fallback]
  return content.map((value, index) => {
    const creative = record(value)
    const firstButton = record(Array.isArray(creative.button_list) ? creative.button_list[0] : undefined)
    const archiveUrl = typeof creative.bvid === 'string' && /^BV[0-9A-Za-z]+$/.test(creative.bvid)
      ? `https://www.bilibili.com/video/${creative.bvid}/`
      : undefined
    const result = toAdvertisementCard({
      title: creative.title ?? fallback.title,
      cover: kind === 'cover' ? creative.url : creative.cover ?? creative.pic,
      url: webUrl(firstButton.jump_url) ?? webUrl(creative.arcurl) ?? archiveUrl ?? fallback.url,
    })
    return { ...result, advertisementKey: `${fallback.advertisementKey}:${kind}:${index}` }
  })
}
