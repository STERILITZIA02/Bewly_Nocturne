import { IFRAME_NAVIGATION_ACK, IFRAME_NAVIGATION_REQUEST } from '~/constants/globalEvents'
import { getParentMessageData, postMessageToParent } from '~/utils/iframeMessage'

/** Runs in the child content script so cross-origin parents never access restricted Window APIs. */
export function handleIframeNavigationRequest(event: MessageEvent) {
  const data = getParentMessageData(event, [IFRAME_NAVIGATION_REQUEST])
  if (!data || typeof data.requestId !== 'number' || (data.action !== 'reload' && data.action !== 'top'))
    return
  postMessageToParent({ type: IFRAME_NAVIGATION_ACK, requestId: data.requestId })
  if (data.action === 'reload')
    window.location.reload()
  else
    window.scrollTo({ top: 0, behavior: 'smooth' })
}
