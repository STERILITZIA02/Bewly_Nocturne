import { getPageBridgeTargetOrigin, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '~/constants/pageBridge'
import api from '~/utils/api'
import { readCommentReplyRequest } from '~/utils/commentReplyRequest'
import { getUserID } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'

/** Narrow read-only transport for MAIN's native reply renderer. */
export function setupCommentReplyApiBridge() {
  const pending = new Map<string, AbortController>()
  let disposed = false
  function cancelAll() {
    pending.forEach(controller => controller.abort())
    pending.clear()
  }
  function stop() {
    disposed = true
    cancelAll()
    window.removeEventListener('message', receive)
    document.removeEventListener('visibilitychange', visibility)
  }
  function visibility() {
    if (document.hidden)
      cancelAll()
  }
  function receive(event: MessageEvent) {
    const channelId = getPageBridgeChannelId()
    const origin = getPageBridgeTargetOrigin()
    if (disposed || !channelId || !origin)
      return
    if (matchesPageBridgeEvent(event, { channelId, origin, source: window, type: PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_CANCEL })) {
      const id = (event.data.data as { requestId?: unknown } | null)?.requestId
      if (typeof id === 'string') {
        pending.get(id)?.abort()
        pending.delete(id)
      }
      return
    }
    if (!matchesPageBridgeEvent(event, { channelId, origin, source: window, type: PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_REQUEST }))
      return
    const request = readCommentReplyRequest(event.data.data)
    if (!request || request.identity.context !== channelId || request.identity.account !== (getUserID() ?? 'guest')
      || document.hidden || pending.has(request.requestId)) {
      return
    }
    if (pending.size >= 16) {
      postPageBridgeMessage(window, { protocol: PAGE_BRIDGE_PROTOCOL, channelId, type: PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_RESPONSE, data: { requestId: request.requestId, error: 'busy' } })
      return
    }
    const controller = new AbortController()
    pending.set(request.requestId, controller)
    const current = () => !disposed && !controller.signal.aborted && getPageBridgeChannelId() === channelId
      && request.identity.account === (getUserID() ?? 'guest') && pending.get(request.requestId) === controller
    const reply = (data: Record<string, unknown>) => {
      if (current())
        postPageBridgeMessage(window, { protocol: PAGE_BRIDGE_PROTOCOL, channelId, type: PAGE_BRIDGE_MESSAGE.COMMENT_REPLY_RESPONSE, data: { requestId: request.requestId, ...data } })
    }
    void api.moment.getMomentCommentReplies({ oid: request.identity.oid, type: request.identity.type, root: request.identity.root, pn: request.page, ps: request.identity.pageSize }, { signal: controller.signal })
      .then(response => reply({ response }))
      .catch((error: unknown) => {
        if (isExtensionContextInvalidatedError(error)) {
          reply({ error: 'context-invalidated' })
          stop()
        }
        else {
          reply({ error: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'failed' })
        }
      })
      .finally(() => {
        if (pending.get(request.requestId) === controller)
          pending.delete(request.requestId)
      })
  }
  window.addEventListener('message', receive)
  document.addEventListener('visibilitychange', visibility)
  return stop
}
