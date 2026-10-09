import { getPageBridgeTargetOrigin, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '~/constants/pageBridge'
import { withRequestDeadline } from '~/utils/abort'
import type { CommentReplyPageIdentity } from '~/utils/commentReplyPageCache'
import { normalizeNativeCommentReplyPage } from '~/utils/commentReplyRequest'

/** MAIN never imports the extension API/polyfill. Each read owns its cancellation. */
export function createNativeCommentReplyReader(channelId: string) {
  let sequence = 0
  let invalidated = false
  const documentId = crypto.randomUUID()
  return async (identity: CommentReplyPageIdentity, page: number, outerSignal: AbortSignal) => {
    const request = { requestId: `${documentId}:${++sequence}`, identity, page }
    const origin = getPageBridgeTargetOrigin()
    if (!origin || invalidated)
      throw new Error('Comment reply transport is unavailable')
    const response = await withRequestDeadline(signal => new Promise<unknown>((resolve, reject) => {
      function cleanup() {
        window.removeEventListener('message', receive)
        signal.removeEventListener('abort', abort)
      }
      function abort() {
        cleanup()
        postPageBridgeMessage(window, { protocol: PAGE_BRIDGE_PROTOCOL, channelId, type: PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_CANCEL, data: { requestId: request.requestId } })
        reject(signal.reason)
      }
      function receive(event: MessageEvent) {
        if (!matchesPageBridgeEvent(event, { origin: origin!, source: window, channelId, type: PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_RESPONSE }))
          return
        const data = event.data.data as { requestId?: unknown, response?: unknown, error?: unknown } | null
        if (data?.requestId !== request.requestId)
          return
        cleanup()
        if (data.error === 'context-invalidated')
          invalidated = true
        if (typeof data.error === 'string')
          reject(new Error(data.error))
        else resolve(data.response)
      }
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      window.addEventListener('message', receive)
      signal.addEventListener('abort', abort, { once: true })
      if (!postPageBridgeMessage(window, { protocol: PAGE_BRIDGE_PROTOCOL, channelId, type: PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_REQUEST, data: request })) {
        cleanup()
        reject(new Error('Comment reply transport is unavailable'))
      }
    }), { signal: outerSignal })
    return normalizeNativeCommentReplyPage(response, request)
  }
}
