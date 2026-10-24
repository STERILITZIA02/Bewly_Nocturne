export const SUPPORTS_TEXT_AUTOSPACE = typeof CSS !== 'undefined' && CSS.supports('text-autospace', 'normal')

/** Reading content only; editing surfaces keep their original character spacing. */
export function getTextAutospaceCss(mode: 'on' | 'off') {
  const value = mode === 'on' ? 'normal' : 'no-autospace'
  return `
  :where(.video-card-info-title, .moment-card__title, .moment-card__desc,
    .moment-card__quote-title, .moment-card__quote-text, .moment-comment-rich-text,
    .video-title, .desc-info-text, .bili-rich-text__content) {
    text-autospace: ${value};
  }
  bili-comments { --bew-comment-text-autospace: ${value}; }
  :where(pre, code, kbd, samp, textarea, input, [contenteditable]:not([contenteditable="false" i]), .cm-editor, .monaco-editor) {
    text-autospace: no-autospace !important;
  }
`
}

export const COMMENT_TEXT_AUTOSPACE_CSS = `
  @supports (text-autospace: normal) {
    #content { text-autospace: var(--bew-comment-text-autospace, inherit); }
    :where(pre, code, [contenteditable]:not([contenteditable="false" i])) { text-autospace: no-autospace !important; }
  }
`
