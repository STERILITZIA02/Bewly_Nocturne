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

import type { Plugin } from 'vite'

import { splitCssSelectors } from '../src/utils/cssSelectors.ts'
import type { MotionStyleScope } from '../src/utils/reducedMotion.ts'
import { motionScopeSelector } from '../src/utils/reducedMotion.ts'

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
    const selectors = splitCssSelectors(block.prelude).filter(keepSelector)
    if (selectors.length)
      output += `${selectors.join(',')}{${block.body}}\n`
  }
  return output
}

export function splitContentStyles(css: string) {
  const blocks = parseBlocks(css)
  return {
    host: applyMotionPreferenceRules(filterBlocks(blocks, selector => !isShadowOnlySelector(selector)), 'host'),
    shadow: applyMotionPreferenceRules(filterBlocks(blocks, selector => !isHostOnlySelector(selector)), 'shadow'),
  }
}

function gateMotionRules(css: string, gate: string, scope: MotionStyleScope): string {
  return parseBlocks(css).map((block) => {
    if (block.body === undefined)
      return block.prelude
    if (NESTED_AT_RULES.test(block.prelude))
      return `${block.prelude}{${gateMotionRules(block.body, gate, scope)}}`
    if (block.prelude.startsWith('@'))
      return `${block.prelude}{${block.body}}`
    const selectors = splitCssSelectors(block.prelude).map(selector => motionScopeSelector(selector, gate, scope))
    return `${selectors.join(',')}{${block.body}}`
  }).join('\n')
}

/** Reuse the authored reduced-motion rules; no runtime stylesheet scanning or global animation reset. */
export function applyMotionPreferenceRules(css: string, scope: MotionStyleScope): string {
  return parseBlocks(css).map((block) => {
    if (block.body === undefined)
      return block.prelude
    const motion = /^@media\s*\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)$/i.exec(block.prelude)
    if (motion) {
      const reduced = motion[1] === 'reduce'
      const system = gateMotionRules(block.body, `:not([data-bew-motion="${reduced ? 'full' : 'reduce'}"])`, scope)
      const forced = gateMotionRules(block.body, `[data-bew-motion="${reduced ? 'reduce' : 'full'}"]`, scope)
      // Native Shadow roots without :host-context retain their original OS policy.
      // Nocturne's own hosts carry the preference attribute and use the override.
      const fallback = scope === 'universal' || scope === 'native-shadow'
        ? `@supports not selector(:host-context(*)){${block.prelude}{${gateMotionRules(block.body, ':not([data-bew-motion])', 'shadow')}}}`
        : ''
      return `${block.prelude}{${system}}\n${forced}\n${fallback}`
    }
    const body = NESTED_AT_RULES.test(block.prelude) ? applyMotionPreferenceRules(block.body, scope) : block.body
    return `${block.prelude}{${body}}`
  }).join('\n')
}

/** Vite's ?inline styles also serve native Shadow roots; transform their CSS payload at build time. */
export function inlineMotionStyles(): Plugin {
  return {
    name: 'bewly-inline-motion-preference',
    enforce: 'post',
    transform: {
      filter: { id: /\.(?:css|scss)\?inline$/ },
      handler(code) {
        if (!code.includes('prefers-reduced-motion'))
          return
        const ast = this.parse(code)
        const edits: { start: number, end: number, text: string }[] = []
        for (const statement of ast.body) {
          const values = statement.type === 'VariableDeclaration'
            ? statement.declarations.map(item => item.init)
            : statement.type === 'ExportDefaultDeclaration' ? [statement.declaration] : []
          for (const value of values) {
            if (value?.type === 'Literal' && typeof value.value === 'string' && value.value.includes('prefers-reduced-motion'))
              edits.push({ start: value.start, end: value.end, text: JSON.stringify(applyMotionPreferenceRules(value.value, 'universal')) })
          }
        }
        if (!edits.length)
          return
        let result = code
        for (const edit of edits.sort((a, b) => b.start - a.start))
          result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
        return { code: result, map: null }
      },
    },
  }
}
