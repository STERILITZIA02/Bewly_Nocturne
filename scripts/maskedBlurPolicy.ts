import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'

/**
 * Finds rules that fade a single backdrop blur with a mask.
 *
 * One `backdrop-filter: blur()` layer under a gradient mask does not make a
 * gradient blur: it mixes the sharp image with a fixed-strength blurred copy,
 * so the blurred region keeps a visible rectangular (or elliptical) boundary.
 * A real gradient blur stacks layers whose radius doubles while their mask
 * window shrinks (`ProgressiveBlur.vue` / `utils/progressiveBlur.ts`). Only
 * those layers may combine the two properties.
 */

const BACKDROP = /(?:^|;)\s*(?:-webkit-)?backdrop-filter\s*:\s*([^;]+)/i
const MASK = /(?:^|;)\s*(?:-webkit-)?mask(?:-image)?\s*:\s*([^;]+)/i

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function isActive(value: string | undefined) {
  return Boolean(value && !/^\s*(?:none|initial|unset|inherit|revert)\b/i.test(value))
}

/** Last compound of a selector: its classes (BEM modifiers folded to the base) plus any pseudo-element. */
function subjectKeys(selector: string, foldModifiers = true) {
  // Drop functional-pseudo arguments (:has(> .x), :not(...)) before splitting at combinators.
  const last = selector.replace(/\([^()]*\)/g, '').trim().split(/[\s>+~]+/).pop() ?? ''
  const pseudo = last.match(/::?(?:before|after)\b/)?.[0].replace(/^:+/, '::') ?? ''
  return [...last.matchAll(/\.([\w-]+)/g)].map(([, name]) => `${foldModifiers ? name.replace(/--[\w-]+$/, '') : name}${pseudo}`)
}

/**
 * Elements whose rules blur the backdrop and apply a mask, keyed by subject
 * class (so `.edge { backdrop-filter }` + `.edge--top { mask-image }` counts).
 */
export function findMaskedBackdropRules(css: string): string[] {
  const blurred = new Set<string>()
  const masked = new Set<string>()
  for (const [, selectorList, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/^\s*@/.test(selectorList))
      continue
    const blur = body.match(BACKDROP)?.[1]
    const mask = body.match(MASK)?.[1]
    const hasBlur = isActive(blur) && /blur|var\(/i.test(blur!)
    const hasMask = isActive(mask)
    if (!hasBlur && !hasMask)
      continue
    for (const selector of selectorList.split(',')) {
      for (const key of subjectKeys(selector)) {
        if (hasBlur)
          blurred.add(key)
        if (hasMask)
          masked.add(key)
      }
    }
  }
  return [...blurred].filter(key => masked.has(key)).map(key => `.${key}`)
}

/** Inline style objects in scripts (`backdropFilter` beside `maskImage`). */
export function hasInlineMaskedBackdrop(source: string) {
  const scripts = source.includes('<script')
    ? [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(([, body]) => body)
    : [source]
  let found = false
  for (const script of scripts) {
    const file = ts.createSourceFile('styles.ts', script, ts.ScriptTarget.Latest, true)
    function visit(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) {
        const names = node.properties.filter(ts.isPropertyAssignment).map(property => property.name.getText(file).replace(/['"-]/g, '').toLowerCase())
        if (names.some(name => /^(?:webkit)?backdropfilter$/.test(name)) && names.some(name => /^(?:webkit)?mask(?:image)?$/.test(name)))
          found = true
      }
      if (!found)
        ts.forEachChild(node, visit)
    }
    visit(file)
  }
  return found || [...source.matchAll(/\bstyle="([^"]*)"/g)].some(([, style]) => findMaskedBackdropRules(`.inline{${style}}`).length > 0)
}

/** Catch the Chromium mask loss caused by a rounded overflow clip above a blur. */
export function findProgressiveBlurClippingAncestors(source: string, css: string): string[] {
  if (!/<(?:ProgressiveBlur|PanelTopBlur)[\s/>]/.test(source))
    return []
  const ast = parse(source).descriptor.template?.ast
  if (!ast)
    return []

  const declarations = new Map<string, Map<string, string>>()
  for (const [, selectorList, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/^\s*@/.test(selectorList))
      continue
    for (const selector of selectorList.split(',')) {
      for (const key of subjectKeys(selector, false)) {
        if (key.includes('::'))
          continue
        const values = declarations.get(key) ?? new Map<string, string>()
        for (const [, property, value] of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g))
          values.set(property, value.trim())
        declarations.set(key, values)
      }
    }
  }

  type Children = typeof ast.children
  type Element = Extract<Children[number], { type: 1 }>
  const failures = new Set<string>()
  function visit(children: Children, ancestors: Element[]) {
    for (const node of children) {
      if (node.type !== 1)
        continue
      if (node.tag === 'ProgressiveBlur' || node.tag === 'PanelTopBlur') {
        for (const ancestor of [...ancestors, node]) {
          const classes = ancestor.props.filter(prop => prop.type === 6 && prop.name === 'class')
            .flatMap(prop => prop.type === 6 ? prop.value?.content.split(/\s+/) ?? [] : [])
          const values = new Map(classes.flatMap(name => [...declarations.get(name) ?? []]))
          const clips = ['overflow', 'overflow-x', 'overflow-y'].some(property => /\b(?:hidden|clip|auto|scroll)\b/.test(values.get(property) ?? ''))
            || ancestor.props.some(prop => prop.type === 6 && /^overflow-(?:hidden|clip|auto|scroll)$/.test(prop.name))
          const shape = values.get('corner-shape')
          const rounded = [...values].some(([property, value]) => /^border(?:-(?:top|bottom)-(?:left|right))?-radius$/.test(property) && !/^0(?:px|%)?(?:\s+0(?:px|%)?)*$/.test(value))
          if (clips && rounded && shape && !/^(?:round|superellipse\(1\))$/.test(shape))
            failures.add(`.${classes.join('.')}: rounded overflow ancestor of ${node.tag}`)
        }
      }
      // Teleported content no longer inherits these ancestors' clipping.
      visit(node.children, node.tag === 'Teleport' ? [] : [...ancestors, node])
    }
  }
  visit(ast.children, [])
  return [...failures]
}
