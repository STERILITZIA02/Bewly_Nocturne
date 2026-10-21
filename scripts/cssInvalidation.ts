/**
 * Finds selectors that make Chromium restyle whole subtrees on unrelated
 * class changes.
 *
 * Chromium keys style invalidation on the features in each compound. A class
 * attribute selector (`[class*=…]`, `[class^=…]`, `[class]`…) that is not in
 * the subject compound registers "any class change" as a trigger, and its
 * descendant set is whatever the subject needs, usually "anything with a
 * class". Toggling any class on any element then restyles its whole subtree.
 * Rules like that must only load on the page they style.
 *
 * A subject that is only an image element type is allowed: an unrelated class
 * change then restyles a few images, not the subtree.
 */

const CLASS_ATTRIBUTE = /\[\s*class\s*(?:[~|^$*]?=|\])/i
const IMAGE_SUBJECT = /^(?:picture|img)$/i
const SELECTOR_LIST_PSEUDOS = /:(?:is|where|not|has|matches|-webkit-any|host|host-context|nth-child|nth-last-child)\(/gi

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Splits at top-level occurrences of `separator` (outside (), [] and strings). */
function splitTopLevel(text: string, isSeparator: (char: string, index: number) => number) {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === '\\')
        index++
      else if (char === quote)
        quote = ''
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(' || char === '[') {
      depth++
      continue
    }
    if (char === ')' || char === ']') {
      depth--
      continue
    }
    if (depth > 0)
      continue
    const length = isSeparator(char, index)
    if (length > 0) {
      parts.push(text.slice(start, index))
      index += length - 1
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

export function splitSelectorList(selectorList: string) {
  return splitTopLevel(selectorList, char => char === ',' ? 1 : 0)
    .map(selector => selector.trim())
    .filter(Boolean)
}

/** Compounds of one complex selector, in order; combinators are dropped. */
export function splitCompounds(selector: string) {
  const normalized = selector.trim().replace(/\s*([>+~])\s*/g, '$1')
  return splitTopLevel(normalized, char => /[\s>+~]/.test(char) ? 1 : 0)
    .map(compound => compound.trim())
    .filter(Boolean)
}

/** Selector lists nested in functional pseudo-classes of one compound. */
function nestedSelectorLists(compound: string) {
  const lists: string[] = []
  for (const match of compound.matchAll(SELECTOR_LIST_PSEUDOS)) {
    let depth = 1
    let index = match.index! + match[0].length
    const start = index
    for (; index < compound.length && depth > 0; index++) {
      if (compound[index] === '(')
        depth++
      else if (compound[index] === ')')
        depth--
    }
    lists.push(compound.slice(start, index - 1))
  }
  return lists
}

export function hasAncestorClassAttribute(selector: string): boolean {
  const compounds = splitCompounds(selector)
  const imageSubject = IMAGE_SUBJECT.test(compounds[compounds.length - 1] ?? '')
  return compounds.some((compound, index) => {
    if (index < compounds.length - 1 && !imageSubject && CLASS_ATTRIBUTE.test(compound))
      return true
    return nestedSelectorLists(compound)
      .some(list => splitSelectorList(list).some(hasAncestorClassAttribute))
  })
}

/** Every style rule's selector list, at-rule blocks included. */
export function collectSelectors(css: string) {
  const selectors: string[] = []
  const text = stripComments(css)
  let depth = 0
  let preludeStart = 0
  let quote = ''
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === '\\')
        index++
      else if (char === quote)
        quote = ''
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '{') {
      const prelude = text.slice(preludeStart, index).trim()
      if (prelude && !prelude.startsWith('@') && !/^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/.test(prelude))
        selectors.push(...splitSelectorList(prelude))
      depth++
      preludeStart = index + 1
    }
    else if (char === '}' || char === ';') {
      if (char === '}')
        depth = Math.max(0, depth - 1)
      preludeStart = index + 1
    }
  }
  return selectors
}

export function findAncestorClassAttributeSelectors(css: string) {
  return collectSelectors(css).filter(hasAncestorClassAttribute)
}
