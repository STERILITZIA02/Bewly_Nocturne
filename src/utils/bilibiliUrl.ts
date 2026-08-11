const COMMON_TRACKING_PARAMS = new Set([
  '-Arouter',
  'bbid',
  'broadcast_type',
  'bsource',
  'csource',
  'from',
  'from_source',
  'from_spmid',
  'hotRank',
  'is_story_h5',
  'launch_id',
  'live_from',
  'msource',
  'plat_id',
  'seid',
  'session_id',
  'share_from',
  'share_medium',
  'share_plat',
  'share_session_id',
  'share_source',
  'share_tag',
  'share_times',
  'source',
  'sourceFrom',
  'spm_id_from',
  'timestamp',
  'trackid',
  'ts',
  'unique_k',
  'vd_source',
  'visit_id',
])

const VIDEO_TRACKING_PARAMS = new Set([
  'buvid',
  'mid',
  'spmid',
  'up_id',
])

function isBilibiliHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'bilibili.com'
    || normalized === 'b23.tv'
    || normalized.endsWith('.bilibili.com')
    || normalized.endsWith('.b23.tv')
}

export function cleanBilibiliUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (!isBilibiliHost(parsed.hostname))
      return url

    for (const param of COMMON_TRACKING_PARAMS)
      parsed.searchParams.delete(param)

    if (parsed.pathname.startsWith('/video/') || parsed.pathname.startsWith('/bangumi/play/')) {
      for (const param of VIDEO_TRACKING_PARAMS)
        parsed.searchParams.delete(param)
    }

    if (!parsed.searchParams.size)
      parsed.search = ''

    return parsed.toString()
  }
  catch {
    return url
  }
}

function extractFirstBracketContent(text: string): string | null {
  const start = text.indexOf('【')
  if (start === -1)
    return null

  let depth = 0
  for (let index = start; index < text.length; index++) {
    if (text[index] === '【')
      depth++
    else if (text[index] === '】')
      depth--
    if (depth === 0 && index > start)
      return text.slice(start + 1, index)
  }
  return null
}

export function cleanBilibiliShareText(
  text: string,
  options: { includeTitle?: boolean, removeTrackingParams?: boolean } = {},
): string {
  const { includeTitle = false, removeTrackingParams = true } = options
  const title = extractFirstBracketContent(text)
  const url = text.match(/(https?:\/\/\S+)/)?.[1]

  if (url) {
    const cleanedUrl = removeTrackingParams ? cleanBilibiliUrl(url) : url
    if (title)
      return includeTitle ? `${title} ${cleanedUrl}` : cleanedUrl
  }

  return removeTrackingParams
    ? text.replace(/(https?:\/\/\S+)/g, matchedUrl => cleanBilibiliUrl(matchedUrl))
    : text
}
