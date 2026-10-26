import { shallowRef } from 'vue'

import type { MomentCommentItem } from '~/components/MomentCard/commentUtils'
import { normalizeMomentComment } from '~/components/MomentCard/commentUtils'
import { getPageBridgeTargetOrigin, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '~/constants/pageBridge'
import { createPlaybackAppHost } from '~/utils/bewlyWidescreen/appHost'
import { COMMENT_COMPOSER_HEIGHT_PROPERTY, COMMENT_COMPOSER_HOST_CLASS } from '~/utils/bewlyWidescreen/constants'
import { EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE, parseCommentListParams, toCommentComposerReply } from '~/utils/commentComposerBridge'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'

export interface PlaybackCommentComposerContext {
  /** Inside the docked host's shadow root; the app teleports the composer here. */
  mount: HTMLElement
  /** The comment list the composer posts to, as the native list reports it. */
  oid: string
  type: number
}

export interface PlaybackCommentReplyRequest {
  reply: MomentCommentItem
  sequence: number
}

/** Null whenever the playback page shows no comment list to post to. */
export const playbackCommentComposer = shallowRef<PlaybackCommentComposerContext | null>(null)
/** The latest native "reply" click handed over by MAIN. */
export const playbackCommentReplyRequest = shallowRef<PlaybackCommentReplyRequest | null>(null)

/**
 * Docks the app's comment composer at the bottom of the playback page's
 * comment column. The host sits beside the panels, outside the scroller, so
 * the list scrolls under it while overscroll bounce, late pages and a
 * shrinking list never move it; the panel keeps its measured height clear at
 * the end. It shows only with the comment panel and fades with the column.
 * Its shadow root carries the app's own stylesheet; the theme follows the
 * app host. The panel attribute tells MAIN to hide native comment boxes and
 * hand over native "reply" clicks.
 */
export function setupPlaybackCommentComposer(panel: HTMLElement) {
  const { host, mount, dispose: disposeHost } = createPlaybackAppHost(COMMENT_COMPOSER_HOST_CLASS)
  panel.setAttribute(EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE, '')

  const dock = panel.parentElement ?? panel
  // Written on the panel that reads it; the property is registered without
  // inheritance, so a growing editor never restyles the comment tree.
  const heightObserver = new ResizeObserver(() => {
    const height = `${Math.ceil(host.getBoundingClientRect().height)}px`
    if (panel.style.getPropertyValue(COMMENT_COMPOSER_HEIGHT_PROPERTY) !== height)
      panel.style.setProperty(COMMENT_COMPOSER_HEIGHT_PROPERTY, height)
  })
  heightObserver.observe(host)

  let sequence = 0
  const syncPanel = () => {
    if (host.parentElement !== dock)
      dock.append(host)
    const identity = parseCommentListParams(panel.querySelector('bili-comments')?.getAttribute('data-params'))
    const current = playbackCommentComposer.value
    if (!identity) {
      if (current)
        playbackCommentComposer.value = null
    }
    else if (current?.oid !== identity.oid || current.type !== identity.type || current.mount !== mount) {
      playbackCommentReplyRequest.value = null
      playbackCommentComposer.value = { mount, ...identity }
    }
  }
  // Light DOM only: the native list renders inside its own shadow roots.
  const panelObserver = new MutationObserver(syncPanel)
  panelObserver.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-params'] })

  const receive = (event: MessageEvent) => {
    const channelId = getPageBridgeChannelId()
    const origin = getPageBridgeTargetOrigin()
    if (!channelId || !origin || !matchesPageBridgeEvent(event, { channelId, origin, source: window, type: PAGE_BRIDGE_MESSAGE.COMMENT_COMPOSER_TARGET }))
      return
    const context = playbackCommentComposer.value
    const target = toCommentComposerReply((event.data.data as { reply?: unknown } | null)?.reply)
    const reply = target && normalizeMomentComment(target)
    if (!context || !target || !reply || target.oid_str !== context.oid || target.type !== context.type)
      return
    playbackCommentReplyRequest.value = { reply, sequence: ++sequence }
  }
  window.addEventListener('message', receive)

  syncPanel()

  return () => {
    window.removeEventListener('message', receive)
    heightObserver.disconnect()
    panel.style.removeProperty(COMMENT_COMPOSER_HEIGHT_PROPERTY)
    panelObserver.disconnect()
    panel.removeAttribute(EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE)
    disposeHost()
    if (playbackCommentComposer.value?.mount === mount) {
      playbackCommentComposer.value = null
      playbackCommentReplyRequest.value = null
    }
  }
}

/** Has the native list show a reply the server confirmed (see insertExternalComposerReply). */
export function showPostedPlaybackComment(reply: unknown) {
  const channelId = getPageBridgeChannelId()
  if (!channelId || !reply || typeof reply !== 'object')
    return false
  return postPageBridgeMessage(window, {
    protocol: PAGE_BRIDGE_PROTOCOL,
    channelId,
    type: PAGE_BRIDGE_MESSAGE.COMMENT_COMPOSER_INSERT,
    // Plain JSON crosses the bridge; a reactive copy would not clone.
    data: { reply: JSON.parse(JSON.stringify(reply)) },
  })
}
