import { isContentScriptTargetUrl } from '~/constants/contentScript'

/** Read the live same-origin address, otherwise use only the ready document's report. */
export function resolveIframeExternalUrl(frame: HTMLIFrameElement | null | undefined, reported: string, entry: string): string {
  let current = reported
  try {
    current = frame?.contentWindow?.location.href || reported
  }
  catch {}
  try {
    const url = new URL(current)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && isContentScriptTargetUrl(url.href))
      return url.href
  }
  catch {}
  return entry
}
