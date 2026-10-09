import type { VideoInfo } from '~/models/video/videoInfo'
import { waitForDelay } from '~/utils/abort'
import api from '~/utils/api'
import { isCommentRootUsable } from '~/utils/bewlyWidescreen/nativeDom'
import { parsePlaybackTabUrl } from '~/utils/playbackTab'
import { readVideoPageMetadata } from '~/utils/videoMetadataBridge'

const COMMENT_ROOT = '#commentapp, #comment-module, #comment-body, .commentapp, .comment-container, .bili-comment-container, .bb-comment'

function commentAid(element: Element) {
  const value = Number(element.getAttribute('data-params')?.split(',')[1]?.trim())
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * Never select an empty placeholder or a comment tree from the inactive
 * layout. Prefer a native component already initialized for this manuscript.
 */
function findNavigationComments(aid: number, wide: boolean): HTMLElement | undefined {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('bili-comments')).filter((element) => {
    const root = element.closest<HTMLElement>(COMMENT_ROOT)
    if (!root || !root.isConnected || Boolean(root.closest('#bewly-widescreen-root')) !== wide)
      return false
    return wide || root.getClientRects().length > 0
  })
  const matching = candidates.find(element => commentAid(element) === aid)
  if (matching)
    return matching
  const initialized = candidates.filter(element => commentAid(element) && isCommentRootUsable(element.closest<HTMLElement>(COMMENT_ROOT)!))
  // More than one stale native tree is ambiguous; wait for the old owner to
  // release it rather than changing whichever querySelector happened to find.
  return initialized.length === 1 ? initialized[0] : undefined
}

/**
 * Owns the existing SPA comment repair, including its API read and bounded
 * readiness wait. Cancelling navigation aborts both, without reviving nodes.
 */
export function createVideoCommentNavigation(currentKey: () => string, isWide: () => boolean) {
  let owner: { key: string, controller: AbortController, request: Promise<VideoInfo> } | undefined
  function cancel() {
    owner?.controller.abort()
    owner = undefined
  }
  function start(key: string, href = location.href): Promise<VideoInfo> | undefined {
    if (owner?.key === key)
      return owner.request
    cancel()
    const target = parsePlaybackTabUrl(href)
    if (!target || (!('aid' in target) && !('bvid' in target)))
      return
    const controller = new AbortController()
    const { signal } = controller
    const identifier = 'aid' in target ? { aid: String(target.aid) } : { bvid: target.bvid }
    const request = api.video.getVideoInfo(identifier, { signal }) as Promise<VideoInfo>
    const task = { key, controller, request }
    owner = task
    const current = () => !signal.aborted && owner === task && currentKey() === key
    void (async () => {
      try {
        const response = await request
        const aid = response.data?.aid
        if (!current() || response.code !== 0 || !Number.isSafeInteger(aid) || aid <= 0
          || ('aid' in target ? aid !== target.aid : response.data.bvid !== target.bvid)) {
          return
        }
        const deadline = Date.now() + 10_000
        while (current() && Date.now() < deadline) {
          // The URL can change before MAIN has committed new manuscript data.
          const metadata = readVideoPageMetadata()
          const comments = metadata?.aid === aid ? findNavigationComments(aid, isWide()) : undefined
          if (comments) {
            if (commentAid(comments) === aid)
              return
            const params = comments.getAttribute('data-params')?.split(',')
            if (params && params.length >= 2 && current() && comments.isConnected) {
              params[1] = String(aid)
              // Retain the established native custom-element reinitialization.
              // Only the current connected instance is replaced, never a saved
              // or destroyed node from a previous layout/session.
              const replacement = document.createElement('bili-comments')
              for (const attribute of Array.from(comments.attributes))
                replacement.setAttribute(attribute.name, attribute.value)
              replacement.setAttribute('data-params', params.join(','))
              comments.replaceWith(replacement)
              return
            }
          }
          await waitForDelay(250, signal)
        }
      }
      catch { /* Navigation cancellation or a failed read leaves native recovery in charge. */ }
    })()
    return request
  }
  function cancelIfChanged(key: string) {
    if (owner?.key !== key)
      cancel()
  }
  return { start, cancel, cancelIfChanged }
}
