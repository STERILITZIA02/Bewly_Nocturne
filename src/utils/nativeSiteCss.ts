const SITE_VALUE = /\[data-bewly-native-site=["']?([\w-]+)/g
const GROUPING_AT_RULE = /^@(?:media|supports|container|layer|scope)\b/i

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Index just past the `}` that closes the block opened at `open`. */
function blockEnd(css: string, open: number) {
  let depth = 0
  let quote = ''
  for (let index = open; index < css.length; index++) {
    const char = css[index]
    if (quote) {
      if (char === '\\')
        index++
      else if (char === quote)
        quote = ''
    }
    else if (char === '"' || char === '\'') {
      quote = char
    }
    else if (char === '{') {
      depth++
    }
    else if (char === '}' && --depth === 0) {
      return index + 1
    }
  }
  return css.length
}

function splitSelectors(prelude: string) {
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
      selectors.push(prelude.slice(start, index))
      start = index + 1
    }
  }
  selectors.push(prelude.slice(start))
  return selectors
}

function keepsSelector(selector: string, site: string) {
  let named = false
  for (const [, value] of selector.matchAll(SITE_VALUE)) {
    if (value === site)
      return true
    named = true
  }
  return !named
}

/**
 * The native-site sheet holds every site's rules, each scoped by
 * `[data-bewly-native-site="…"]`. Only rules that name the current site or no
 * site are kept: loading the rest would parse hundreds of kilobytes per page,
 * and their CSS-module selectors (`[class*="…"]` above the subject) would make
 * every class change restyle whole subtrees on unrelated sites.
 */
export function selectNativeSiteCss(css: string, site: string): string {
  const source = stripComments(css)
  let output = ''
  let index = 0
  while (index < source.length) {
    const open = source.indexOf('{', index)
    const semicolon = source.indexOf(';', index)
    // Statement at-rules such as @charset / @import.
    if (semicolon !== -1 && (open === -1 || semicolon < open) && source.slice(index, semicolon).trim().startsWith('@')) {
      output += `${source.slice(index, semicolon + 1).trim()}\n`
      index = semicolon + 1
      continue
    }
    if (open === -1)
      break
    const prelude = source.slice(index, open).trim()
    const end = blockEnd(source, open)
    const body = source.slice(open + 1, end - 1)
    if (prelude.startsWith('@')) {
      if (GROUPING_AT_RULE.test(prelude)) {
        const inner = selectNativeSiteCss(body, site)
        if (inner.trim())
          output += `${prelude}{${inner}}\n`
      }
      else {
        output += `${prelude}{${body}}\n`
      }
    }
    else {
      const selectors = splitSelectors(prelude).filter(selector => keepsSelector(selector, site))
      if (selectors.length)
        output += `${selectors.map(selector => selector.trim()).join(',')}{${body}}\n`
    }
    index = end
  }
  return output
}
