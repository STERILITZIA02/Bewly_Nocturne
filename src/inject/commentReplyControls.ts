export interface CommentReplyPageLabels {
  loading: string
  page?: string
  go?: string
  failed?: string
  retry?: string
}

export const COMMENT_REPLY_PAGE_CONTROL_CLASS = 'bewly-comment-reply-page-control'
const STYLE_ID = 'bewly-comment-reply-page-style'

export function removeCommentReplyPageControl(renderer: HTMLElement) {
  renderer.shadowRoot?.querySelector(`.${COMMENT_REPLY_PAGE_CONTROL_CLASS}`)?.remove()
  renderer.shadowRoot?.getElementById(STYLE_ID)?.remove()
  renderer.removeAttribute('data-bewly-reply-paging')
}

/** Owns only our footer controls; the native footer and Lit children stay in place. */
export function updateCommentReplyPageControl(renderer: HTMLElement, options: {
  enabled: boolean
  page: number
  total: number
  pages: number[]
  loading: boolean
  failed: boolean
  labels: CommentReplyPageLabels
  navigate: (page: number) => void
  retry: () => void
}) {
  const root = renderer.shadowRoot
  const footer = root?.querySelector<HTMLElement>('#pagination')
  if (!root || !footer || !options.enabled) {
    removeCommentReplyPageControl(renderer)
    return
  }
  let control = root.querySelector<HTMLDivElement>(`.${COMMENT_REPLY_PAGE_CONTROL_CLASS}`)
  if (!control) {
    control = document.createElement('div')
    control.className = COMMENT_REPLY_PAGE_CONTROL_CLASS
    const input = document.createElement('input')
    input.type = 'number'
    input.inputMode = 'numeric'
    input.min = '1'
    input.step = '1'
    const go = document.createElement('button')
    go.type = 'button'
    go.className = 'bewly-comment-reply-page-go'
    const status = document.createElement('span')
    status.className = 'bewly-comment-reply-page-status'
    status.setAttribute('aria-live', 'polite')
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'bewly-comment-reply-page-retry'
    control.append(input, go, status, retry)
    footer.prepend(control)
  }
  if (!root.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      :host([data-bewly-reply-paging]) #pagination { flex-wrap: wrap; gap: var(--bew-space-2, 8px); }
      :host([data-bewly-reply-paging]) #pagination-head { display: none; }
      .${COMMENT_REPLY_PAGE_CONTROL_CLASS} { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bew-space-2, 8px); color: var(--bew-text-2, var(--text2)); font-size: var(--bew-font-size-control, 13px); }
      .${COMMENT_REPLY_PAGE_CONTROL_CLASS} input, .${COMMENT_REPLY_PAGE_CONTROL_CLASS} button { box-sizing: border-box; min-height: var(--bew-control-height-sm, 28px); border: 0; border-radius: var(--bew-interactive-radius, 8px); font: inherit; color: var(--bew-text-1, var(--text1)); background: var(--bew-content-solid, var(--bg2)); padding-inline: var(--bew-space-2, 8px); }
      .${COMMENT_REPLY_PAGE_CONTROL_CLASS} input { width: 8ch; }
      .${COMMENT_REPLY_PAGE_CONTROL_CLASS} button { cursor: pointer; }
      .${COMMENT_REPLY_PAGE_CONTROL_CLASS} button:hover { background: var(--bew-theme-surface, var(--graph_bg_regular)); }
      .${COMMENT_REPLY_PAGE_CONTROL_CLASS} button:active { background: var(--bew-theme-surface-hover, var(--graph_bg_thick)); }
      .${COMMENT_REPLY_PAGE_CONTROL_CLASS} :focus-visible { outline: 2px solid var(--bew-theme-foreground, var(--brand_blue)); outline-offset: 2px; }
    `
    root.append(style)
  }
  renderer.setAttribute('data-bewly-reply-paging', '')
  const { labels } = options
  const input = control.querySelector('input')!
  input.max = String(Math.max(1, options.total || 1))
  input.setAttribute('aria-label', labels.page ?? 'Page')
  if (root.activeElement !== input)
    input.value = String(options.page)
  const navigate = () => {
    const value = Math.max(1, Math.min(options.total, Math.floor(input.valueAsNumber)))
    if (Number.isFinite(value))
      options.navigate(value)
  }
  input.onkeydown = (event) => {
    if (event.isComposing || event.repeat || event.key !== 'Enter')
      return
    event.preventDefault()
    event.stopPropagation()
    navigate()
  }
  const go = control.querySelector<HTMLButtonElement>('.bewly-comment-reply-page-go')!
  go.textContent = labels.go ?? 'Go'
  go.onclick = navigate
  const retry = control.querySelector<HTMLButtonElement>('.bewly-comment-reply-page-retry')!
  retry.hidden = !options.failed
  retry.textContent = labels.retry ?? 'Retry'
  retry.onclick = options.retry
  const pages = options.pages.toSorted((a, b) => a - b)
  const start = pages[0] ?? options.page
  const end = pages.at(-1) ?? options.page
  const text = options.failed ? (labels.failed ?? 'Failed to load') : options.loading ? labels.loading : `${start === end ? start : `${start}–${end}`} / ${options.total}`
  const status = control.querySelector('.bewly-comment-reply-page-status')!
  if (status.textContent !== text)
    status.textContent = text
}
