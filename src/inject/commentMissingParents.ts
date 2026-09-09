import type { MissingCommentParent } from '~/utils/commentMissingParents'

export const MISSING_COMMENT_PARENT_CLASS = 'bewly-comment-missing-parent'
export const MISSING_COMMENT_PARENT_SELECTOR = `.${MISSING_COMMENT_PARENT_CLASS}`
const labels: Record<string, string> = {
  'cmn-CN': '父评论未在本页加载',
  'cmn-TW': '父評論尚未在本頁載入',
  jyut: '上一層留言未喺呢頁載入',
  en: 'Parent comment has not been loaded on this page',
}

export const MISSING_COMMENT_PARENT_CSS = `
  ${MISSING_COMMENT_PARENT_SELECTOR} .bewly-comment-missing-parent__body {
    display: flex;
    align-items: flex-start;
    gap: var(--bew-space-2, 8px);
    padding-block: var(--bew-space-3, 12px);
    color: var(--bew-text-2, var(--text2));
    font-size: var(--bew-font-size-caption, 12px);
    line-height: var(--bew-line-height-caption, 16px);
    overflow-wrap: anywhere;
  }
  ${MISSING_COMMENT_PARENT_SELECTOR} .bewly-comment-missing-parent__avatar {
    display: grid;
    place-items: center;
    flex: 0 0 var(--bew-space-6, 24px);
    height: var(--bew-space-6, 24px);
    border-radius: 50%;
    corner-shape: var(--bew-corner-shape-round);
    background: var(--bew-fill-2, var(--bg2));
  }
`

export function clearMissingCommentParents(container: HTMLElement) {
  container.querySelectorAll(MISSING_COMMENT_PARENT_SELECTOR).forEach(node => node.remove())
}

/** These placeholders are Nocturne-owned siblings; native renderers are never cloned. */
export function syncMissingCommentParents(container: HTMLElement, parents: MissingCommentParent[], language: string) {
  const existing = new Map(Array.from(container.querySelectorAll<HTMLElement>(MISSING_COMMENT_PARENT_SELECTOR))
    .map(node => [node.dataset.parentRpid!, node]))
  const retained = new Set<string>()
  const result = parents.map((parent) => {
    let renderer = existing.get(parent.rpid)
    if (!renderer) {
      renderer = document.createElement('div')
      renderer.className = MISSING_COMMENT_PARENT_CLASS
      renderer.dataset.parentRpid = parent.rpid
      const body = document.createElement('div')
      body.className = 'bewly-comment-missing-parent__body'
      const avatar = document.createElement('span')
      avatar.className = 'bewly-comment-missing-parent__avatar'
      avatar.textContent = '?'
      avatar.setAttribute('aria-hidden', 'true')
      const text = document.createElement('span')
      text.className = 'bewly-comment-missing-parent__text'
      body.append(avatar, text)
      renderer.append(body)
      container.append(renderer)
    }
    const characters = Array.from(parent.messageText ?? '')
    const snippet = characters.slice(0, 96).join('') + (characters.length > 96 ? '…' : '')
    const text = `${parent.authorName ? `@${parent.authorName} · ` : ''}${labels[language] ?? labels['cmn-CN']}${snippet ? `：${snippet}` : ''}`
    const content = renderer.querySelector<HTMLElement>('.bewly-comment-missing-parent__text')!
    if (content.textContent !== text)
      content.textContent = text
    retained.add(parent.rpid)
    return { ...parent, renderer }
  })
  existing.forEach((node, id) => {
    if (!retained.has(id))
      node.remove()
  })
  return result
}

export function isMissingCommentParentMutationNode(node: Node) {
  return node instanceof Element && (node.matches(MISSING_COMMENT_PARENT_SELECTOR) || !!node.closest(MISSING_COMMENT_PARENT_SELECTOR))
}
