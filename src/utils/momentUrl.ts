export function normalizeMomentRemoteUrl(value: unknown, baseUrl = 'https://www.bilibili.com'): string {
  if (typeof value !== 'string')
    return ''
  const trimmedValue = value.trim()
  if (!trimmedValue)
    return ''
  try {
    const url = new URL(trimmedValue.startsWith('//') ? `https:${trimmedValue}` : trimmedValue, baseUrl)
    if (url.protocol === 'http:')
      url.protocol = 'https:'
    return url.protocol === 'https:' ? url.toString() : ''
  }
  catch {
    return ''
  }
}

export function isMomentVideoUrl(value: string) {
  try {
    const url = new URL(normalizeMomentRemoteUrl(value))
    return url.hostname === 'www.bilibili.com' && /^\/(?:video\/(?:BV[\da-z]+|av\d+)|(?:bangumi|cheese)\/play\/(?:ep|ss)\d+)(?:[/?#]|$)/i.test(url.pathname)
  }
  catch {
    return false
  }
}
