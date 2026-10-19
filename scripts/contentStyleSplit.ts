/**
 * Splits the single compiled content stylesheet into the copy the host page
 * loads (manifest `css`) and the copy embedded for the Bewly Shadow root.
 *
 * - Host: everything except selectors that can only match inside the Shadow
 *   root (`:host…`) or inside Vue-rendered component trees (`[data-v-…]`
 *   scoped styles). Theme variables, native-page adaptations, ad blocking,
 *   fonts, toast (mounted in the host body) and utilities stay.
 * - Shadow: everything except selectors that can only match the host
 *   document (`html…`, `body…`, `:root…` without `:host`).
 *
 * One source, one compile; the split only drops rules a context can never
 * match, keeping the original rule order (and therefore the cascade).
 */

interface Block {
  /** Text before `{` (selector list or at-rule prelude), or a full statement. */
  prelude: string
  /** Inner text between braces; undefined for statements like `@import …;`. */
  body?: string
}

const NESTED_AT_RULES = /^@(?:media|supports|container|layer|document)\b/i

function stripComments(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').trim()
}

function parseBlocks(css: string): Block[] {
  const blocks: Block[] = []
  let index = 0
  let start = 0
  while (index < css.length) {
    const char = css[index]
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      index = end < 0 ? css.length : end + 2
      continue
    }
    if (char === '"' || char === '\'') {
      index = skipString(css, index)
      continue
    }
    if (char === ';') {
      const statement = stripComments(css.slice(start, index + 1))
      if (statement)
        blocks.push({ prelude: statement })
      start = ++index
      continue
    }
    if (char === '{') {
      const end = findBlockEnd(css, index)
      blocks.push({ prelude: stripComments(css.slice(start, index)), body: css.slice(index + 1, end) })
      start = index = end + 1
      continue
    }
    index++
  }
  const rest = stripComments(css.slice(start))
  if (rest)
    blocks.push({ prelude: rest })
  return blocks
}

function skipString(css: string, index: number) {
  const quote = css[index]
  for (let cursor = index + 1; cursor < css.length; cursor++) {
    if (css[cursor] === '\\')
      cursor++
    else if (css[cursor] === quote)
      return cursor + 1
  }
  return css.length
}

function findBlockEnd(css: string, open: number) {
  let depth = 0
  for (let index = open; index < css.length; index++) {
    const char = css[index]
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      index = end < 0 ? css.length : end + 1
      continue
    }
    if (char === '"' || char === '\'') {
      index = skipString(css, index) - 1
      continue
    }
    if (char === '{')
      depth++
    else if (char === '}' && --depth === 0)
      return index
  }
  return css.length
}

function splitSelectorList(prelude: string) {
  const selectors: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < prelude.length; index++) {
    const char = prelude[index]
    if (char === '(' || char === '[') {
      depth++
    }
    else if (char === ')' || char === ']') {
      depth--
    }
    else if (char === ',' && depth === 0) {
      selectors.push(prelude.slice(start, index).trim())
      start = index + 1
    }
  }
  selectors.push(prelude.slice(start).trim())
  return selectors.filter(Boolean)
}

export function isShadowOnlySelector(selector: string) {
  return /:host\b/.test(selector) || /\[data-v-[\w-]+\]/.test(selector)
}

export function isHostOnlySelector(selector: string) {
  return !/:host\b/.test(selector) && /^(?:html|body|:root)(?![\w-])/i.test(selector.trim())
}

function filterBlocks(blocks: Block[], keepSelector: (selector: string) => boolean): string {
  let output = ''
  for (const block of blocks) {
    if (block.body === undefined) {
      output += `${block.prelude}\n`
      continue
    }
    if (block.prelude.startsWith('@')) {
      if (NESTED_AT_RULES.test(block.prelude)) {
        const inner = filterBlocks(parseBlocks(block.body), keepSelector)
        if (inner.trim())
          output += `${block.prelude}{${inner}}\n`
      }
      else {
        // @font-face, @keyframes, @property, @page…: context-free definitions.
        output += `${block.prelude}{${block.body}}\n`
      }
      continue
    }
    const selectors = splitSelectorList(block.prelude).filter(keepSelector)
    if (selectors.length)
      output += `${selectors.join(',')}{${block.body}}\n`
  }
  return output
}

export function splitContentStyles(css: string) {
  const blocks = parseBlocks(css)
  return {
    host: filterBlocks(blocks, selector => !isShadowOnlySelector(selector)),
    shadow: filterBlocks(blocks, selector => !isHostOnlySelector(selector)),
  }
}
