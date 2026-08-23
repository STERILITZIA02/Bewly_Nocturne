import DOMPurify from 'dompurify'

const SEARCH_HIGHLIGHT_SANITIZE_OPTIONS = {
  ALLOWED_ATTR: ['class'],
  ALLOWED_TAGS: ['em'],
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sanitizeWithoutDom(value: string): string {
  const withoutBlockedContent = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|svg|math|object|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  let openEmCount = 0
  return withoutBlockedContent.replace(/<[^>]*>/g, (tag) => {
    const opening = /^<em(?:\s+class=(['"])([^'"]*)\1)?\s*>$/i.exec(tag)
    if (opening) {
      openEmCount++
      const className = opening[2]
      return className === undefined ? '<em>' : `<em class="${escapeAttribute(className)}">`
    }
    if (/^<\/em\s*>$/i.test(tag) && openEmCount > 0) {
      openEmCount--
      return '</em>'
    }
    return ''
  })
}

export function sanitizeSearchHighlight(value: unknown): string {
  const text = String(value ?? '')
  if (typeof DOMPurify.sanitize !== 'function')
    return sanitizeWithoutDom(text)

  return DOMPurify.sanitize(text, SEARCH_HIGHLIGHT_SANITIZE_OPTIONS)
}
