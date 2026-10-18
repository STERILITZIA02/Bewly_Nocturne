export const BILIBILI_LIVE_HOSTNAME = 'live.bilibili.com'

function isBilibiliLiveOrigin(value: string): boolean {
  try {
    return new URL(value).hostname === BILIBILI_LIVE_HOSTNAME
  }
  catch {
    return false
  }
}

function readParentHostname(win: Window): string | null {
  try {
    return win.parent.location.hostname
  }
  catch {
    return null
  }
}

export function isConfirmedLiveEmbeddedFrame(win: Window = window): boolean {
  try {
    if (win === win.top)
      return false
    const ancestors = win.location.ancestorOrigins
    if (ancestors && ancestors.length > 0)
      return Array.from(ancestors).some(isBilibiliLiveOrigin)
    return readParentHostname(win) === BILIBILI_LIVE_HOSTNAME
  }
  catch {
    return false
  }
}
