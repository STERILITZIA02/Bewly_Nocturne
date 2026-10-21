import { PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '~/constants/pageBridge'
import { EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE, parseCommentListParams, toCommentComposerReply } from '~/utils/commentComposerBridge'

const EXTERNAL_COMPOSER_REPLY_PATCHED = Symbol('bewly-external-composer-reply-patched')

/** Inside an owning panel both native boxes (top and the moving reply box) stay hidden. */
export const EXTERNAL_COMPOSER_COMMENT_BOX_CSS = `
  :host-context([${EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE}]) {
    display: none !important;
  }
`

export const EXTERNAL_COMPOSER_HEADER_CSS = `
  :host-context([${EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE}]) #commentbox {
    display: none !important;
  }
`

function findOwningPanel(node: Node | null): HTMLElement | null {
  let current: Node | null = node
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute(EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE))
      return current
    current = current instanceof ShadowRoot ? current.host : current.parentNode
  }
  return null
}

/**
 * A thread renders every reply in it (its root and nested replies) and routes
 * their "reply" clicks through `handleReply(target)`, which normally mounts
 * the shared native reply box under the target. In an owning panel the target
 * goes to the Bewly composer instead. The native path still runs when the
 * list disables commenting (signed out, closed comments), so its own login
 * prompt or notice explains why.
 */
export function patchExternalComposerReply(classConstructor: unknown, channelId: string) {
  const prototype = (classConstructor as { prototype?: Record<PropertyKey, unknown> } | undefined)?.prototype
  const original = prototype?.handleReply
  if (!prototype || typeof original !== 'function' || prototype[EXTERNAL_COMPOSER_REPLY_PATCHED])
    return false
  Object.defineProperty(prototype, 'handleReply', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, target: unknown, ...rest: unknown[]) {
      const panel = findOwningPanel(this)
      const list = panel?.querySelector('bili-comments') as (HTMLElement & { commentBoxDisabledState?: unknown }) | null | undefined
      const reply = panel && list && !list.commentBoxDisabledState ? toCommentComposerReply(target) : null
      if (!reply)
        return Reflect.apply(original, this, [target, ...rest])
      postPageBridgeMessage(window, {
        protocol: PAGE_BRIDGE_PROTOCOL,
        channelId,
        type: PAGE_BRIDGE_MESSAGE.COMMENT_COMPOSER_TARGET,
        data: { reply },
      })
    },
  })
  Object.defineProperty(prototype, EXTERNAL_COMPOSER_REPLY_PATCHED, { configurable: true, value: true })
  return true
}

interface NativeList extends HTMLElement {
  newItems?: unknown[]
}

/**
 * Shows a reply the server confirmed, exactly as the native box would after
 * its own publish: a root comment is prepended to the list's `newItems`, a
 * nested reply appended to its thread's. A thread that is not rendered just
 * shows the reply when it next loads.
 */
export function insertExternalComposerReply(value: unknown) {
  const reply = toCommentComposerReply(value)
  if (!reply)
    return false
  for (const panel of Array.from(document.querySelectorAll<HTMLElement>(`[${EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE}]`))) {
    const list = panel.querySelector<NativeList>('bili-comments')
    const identity = parseCommentListParams(list?.getAttribute('data-params'))
    if (!list || identity?.oid !== reply.oid_str || identity.type !== reply.type)
      continue
    if (reply.root_str === '0' || reply.root_str === reply.rpid_str) {
      list.newItems = [value, ...(list.newItems ?? [])]
      return true
    }
    for (const thread of Array.from(list.shadowRoot?.querySelectorAll('bili-comment-thread-renderer') ?? [])) {
      const replies = thread.shadowRoot?.querySelector<NativeList & { root?: unknown }>('bili-comment-replies-renderer')
      if (replies && String(replies.root) === reply.root_str) {
        replies.newItems = [...(replies.newItems ?? []), value]
        return true
      }
    }
    return false
  }
  return false
}
