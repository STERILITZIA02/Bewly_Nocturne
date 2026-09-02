export const CONTENT_SCRIPT_HOSTS = [
  'www.bilibili.com',
  'search.bilibili.com',
  't.bilibili.com',
  'space.bilibili.com',
  'message.bilibili.com',
  'member.bilibili.com',
  'account.bilibili.com',
  'www.hdslb.com',
  'music.bilibili.com',
] as const

export const CONTENT_SCRIPT_MATCHES = CONTENT_SCRIPT_HOSTS.map(host => `*://${host}/*`)

export const CONTENT_SCRIPT_EXCLUDE_MATCHES = [
  '*://www.bilibili.com/match/game*',
  '*://www.bilibili.com/toy*',
]

export const CONTENT_SCRIPT_PING = 'bewly-cat:content-script:ping'
export const CONTENT_SCRIPT_PONG = 'bewly-cat:content-script:ready'

export interface ContentScriptIdentity {
  name: string
  runtimeUrl: string
  version: string
}

export interface ContentScriptPong extends ContentScriptIdentity {
  type: typeof CONTENT_SCRIPT_PONG
}

export function isCurrentContentScriptPong(
  value: unknown,
  current: ContentScriptIdentity,
): value is ContentScriptPong {
  if (typeof value !== 'object' || value === null)
    return false

  const pong = value as Partial<ContentScriptPong>
  return pong.type === CONTENT_SCRIPT_PONG
    && pong.name === current.name
    && pong.version === current.version
    && pong.runtimeUrl === current.runtimeUrl
}

const CONTENT_SCRIPT_HOST_SET = new Set<string>(CONTENT_SCRIPT_HOSTS)

export function isContentScriptTargetUrl(value?: string): boolean {
  if (!value)
    return false

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return false

    if (!CONTENT_SCRIPT_HOST_SET.has(url.hostname))
      return false

    return url.hostname !== 'www.bilibili.com'
      || (!url.pathname.startsWith('/match/game') && !url.pathname.startsWith('/toy'))
  }
  catch {
    return false
  }
}
