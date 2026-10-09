import { commentScrollAncestors } from '~/utils/commentReadingAnchor'
import { scrollToPosition } from '~/utils/scrollIntent'

export const COMMENT_REPLY_READING_ATTRIBUTE = 'data-bewly-reply-reading'
const SCROLL_ATTRIBUTE = 'data-bewly-reply-reading-scroll'
const STYLE_ID = 'bewly-comment-reply-reading-style'

interface ReadingOptions {
  enabled: boolean
  maxHeight: number
  label: string
}

export function getCommentReplyGuideCoordinates(component: HTMLElement, container: HTMLElement, threadRoot: ShadowRoot | null, layerId: string) {
  if (component.hasAttribute(COMMENT_REPLY_READING_ATTRIBUTE)) {
    const rect = container.getBoundingClientRect()
    // An absolute old guide contributes to scrollHeight. Measure flow children
    // instead, otherwise a collapsed/replaced page can never shrink its extent.
    const height = Array.from(container.children).reduce((height, child) => {
      if (child.id === layerId || getComputedStyle(child).position === 'absolute' || !child.getClientRects().length)
        return height
      return Math.max(height, child.getBoundingClientRect().bottom - rect.top - container.clientTop + container.scrollTop)
    }, container.clientHeight)
    return {
      parent: container as HTMLElement | ShadowRoot,
      rect: new DOMRect(rect.left + container.clientLeft - container.scrollLeft, rect.top + container.clientTop - container.scrollTop, container.clientWidth, height),
      includeRoot: false,
    }
  }
  return { parent: threadRoot ?? container, rect: threadRoot ? threadRoot.host.getBoundingClientRect() : container.getBoundingClientRect(), includeRoot: true }
}

export function isCommentReplyReadingScroll(event?: Event) {
  return event?.type.startsWith('scroll') && event.composedPath().some(node => node instanceof Element && node.hasAttribute(SCROLL_ATTRIBUTE))
}

/** Only styles the existing Lit-owned container. Reply nodes never move. */
export function createCommentReplyReadingController(getOptions: () => ReadingOptions, rootKey: string) {
  const states = new WeakMap<HTMLElement, { container: HTMLElement, abort: AbortController, collapsed: Set<string>, tails?: Set<string>, rootTails: string[], rootWasCollapsed: boolean, tabIndex: string | null, label: string | null }>()
  function clear(renderer: HTMLElement) {
    const state = states.get(renderer)
    if (state) {
      state.abort.abort()
      state.container.removeAttribute(SCROLL_ATTRIBUTE)
      if (state.tabIndex === null)
        state.container.removeAttribute('tabindex')
      else state.container.setAttribute('tabindex', state.tabIndex)
      if (state.label === null)
        state.container.removeAttribute('aria-label')
      else state.container.setAttribute('aria-label', state.label)
      if (state.rootWasCollapsed)
        state.collapsed.add(rootKey)
      state.rootTails.forEach(key => state.tails?.add(key))
      states.delete(renderer)
    }
    renderer.removeAttribute(COMMENT_REPLY_READING_ATTRIBUTE)
    renderer.style.removeProperty('--bew-comment-reply-max-height')
    renderer.shadowRoot?.getElementById(STYLE_ID)?.remove()
  }
  function sync(renderer: HTMLElement, collapsed: Set<string>, tails?: Set<string>) {
    const options = getOptions()
    const container = renderer.shadowRoot?.querySelector<HTMLElement>('#expander-contents')
    if (!options.enabled || !container || !renderer.isConnected) {
      clear(renderer)
      return
    }
    let state = states.get(renderer)
    if (state && state.container !== container) {
      clear(renderer)
      state = undefined
    }
    if (!state) {
      const abort = new AbortController()
      const rootTails = [...(tails ?? [])].filter(key => key.startsWith(`tail:${rootKey}:after:`))
      state = { container, abort, collapsed, tails, rootTails, rootWasCollapsed: collapsed.has(rootKey), tabIndex: container.getAttribute('tabindex'), label: container.getAttribute('aria-label') }
      states.set(renderer, state)
      collapsed.delete(rootKey)
      rootTails.forEach(key => tails?.delete(key))
      container.setAttribute(SCROLL_ATTRIBUTE, '')
      if (state.tabIndex === null)
        container.tabIndex = 0
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        :host([${COMMENT_REPLY_READING_ATTRIBUTE}]) #expander-contents {
          max-height: min(var(--bew-comment-reply-max-height), 60dvh);
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior-y: auto;
          scrollbar-gutter: stable;
          overflow-anchor: none;
        }
        :host([${COMMENT_REPLY_READING_ATTRIBUTE}]) #expander-footer {
          position: relative;
          z-index: 1;
          padding-block: var(--bew-space-2, 8px);
          background: var(--bew-content-solid, var(--bg1));
        }
        :host([${COMMENT_REPLY_READING_ATTRIBUTE}]) #expander-contents:focus-visible {
          outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-foreground, var(--brand_blue));
          outline-offset: calc(-1 * var(--bew-space-0-5, 2px));
        }
      `
      renderer.shadowRoot!.append(style)
      container.addEventListener('keydown', (event) => {
        if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey
          || event.composedPath().some(node => node instanceof Element && node.matches('input, textarea, select, [contenteditable="true"]'))) {
          return
        }
        const amount = event.key === 'ArrowDown'
          ? 40
          : event.key === 'ArrowUp'
            ? -40
            : event.key === 'PageDown'
              ? container.clientHeight * 0.8
              : event.key === 'PageUp'
                ? -container.clientHeight * 0.8
                : event.key === 'Home'
                  ? -container.scrollHeight
                  : event.key === 'End'
                    ? container.scrollHeight
                    : event.key === ' ' && event.target === container ? container.clientHeight * (event.shiftKey ? -0.8 : 0.8) : 0
        if (!amount)
          return
        const canScroll = amount > 0 ? container.scrollTop + container.clientHeight < container.scrollHeight - 1 : container.scrollTop > 0
        const target = canScroll ? container : commentScrollAncestors(renderer).find(element => amount > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : element.scrollTop > 0)
        if (target) {
          event.preventDefault()
          event.stopPropagation()
          scrollToPosition(target, target.scrollTop + amount)
        }
      }, { signal: abort.signal })
    }
    if (!renderer.hasAttribute(COMMENT_REPLY_READING_ATTRIBUTE))
      renderer.setAttribute(COMMENT_REPLY_READING_ATTRIBUTE, '')
    const height = `${options.maxHeight}px`
    if (renderer.style.getPropertyValue('--bew-comment-reply-max-height') !== height)
      renderer.style.setProperty('--bew-comment-reply-max-height', height)
    if (container.getAttribute('aria-label') !== options.label)
      container.setAttribute('aria-label', options.label)
    return container
  }
  return { clear, sync }
}
