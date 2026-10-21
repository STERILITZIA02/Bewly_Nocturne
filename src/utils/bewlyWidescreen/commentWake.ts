import { PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '~/constants/pageBridge'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'

/** Asks MAIN to start a native comment list still waiting for its first page (see wakeNativeCommentLists). */
export function wakeNativeCommentList(reload = false) {
  const channelId = getPageBridgeChannelId()
  if (!channelId)
    return false
  return postPageBridgeMessage(window, {
    protocol: PAGE_BRIDGE_PROTOCOL,
    channelId,
    type: PAGE_BRIDGE_MESSAGE.COMMENT_LIST_WAKE,
    data: { reload },
  })
}
