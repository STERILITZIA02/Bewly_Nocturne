import { splitCssSelectors } from './cssSelectors'

export type MotionPreference = 'system' | 'reduce' | 'full'
export type MotionStyleScope = 'host' | 'shadow' | 'native-shadow' | 'universal'
export const MOTION_PREFERENCE_CHANGE = 'bewly-motion-preference-change'
let systemMotion: MediaQueryList | undefined

/** The document attribute is shared by ISOLATED, MAIN and native CSS. */
export function prefersReducedMotion(): boolean {
  const preference = document.documentElement.dataset.bewMotion
  return preference === 'reduce' || (preference !== 'full' && (systemMotion ??= window.matchMedia('(prefers-reduced-motion: reduce)')).matches)
}

export function applyMotionPreference(element: HTMLElement, preference: MotionPreference | undefined) {
  const previous = element.dataset.bewMotion
  if (previous === preference)
    return
  if (preference)
    element.dataset.bewMotion = preference
  else delete element.dataset.bewMotion
  if ((previous ?? 'system') !== (preference ?? 'system') && element === element.ownerDocument.documentElement)
    element.ownerDocument.defaultView?.dispatchEvent(new Event(MOTION_PREFERENCE_CHANGE))
}

export function motionScopeSelector(selector: string, gate: string, scope: MotionStyleScope): string {
  if (scope === 'universal') {
    if (/^(?:html|:root)(?![\w-])/.test(selector))
      return selector.replace(/^(?:html|:root)/, match => `${match}:where(${gate})`)
    if (selector.startsWith(':host'))
      return `:host-context(:root${gate})${selector}`
    return `:where(:root${gate},:host([data-bew-motion]${gate}),:host-context(:root${gate})) ${selector}`
  }
  if (scope !== 'host') {
    const host = scope === 'shadow' ? `:host(${gate})` : `:host-context(:root${gate})`
    return `${host}${selector.startsWith(':host') ? '' : ' '}${selector}`
  }
  if (/^(?:html|:root)(?![\w-])/.test(selector))
    return selector.replace(/^(?:html|:root)/, match => `${match}:where(${gate})`)
  return `:where(:root${gate}) ${selector}`
}

/** The same policy for small styles injected into native documents and Shadow roots. */
export function reducedMotionCss(selectors: string, declarations: string, scope: 'host' | 'native-shadow' = 'host'): string {
  const list = splitCssSelectors(selectors)
  const forced = list.map(selector => motionScopeSelector(selector, '[data-bew-motion="reduce"]', scope)).join(',')
  const system = list.map(selector => motionScopeSelector(selector, ':not([data-bew-motion="full"])', scope)).join(',')
  const fallback = scope === 'native-shadow'
    ? `@supports not selector(:host-context(*)){@media (prefers-reduced-motion: reduce){${list.map(selector => motionScopeSelector(selector, ':not([data-bew-motion])', 'shadow')).join(',')}{${declarations}}}}`
    : ''
  return `@media (prefers-reduced-motion: reduce){${system}{${declarations}}}${forced}{${declarations}}${fallback}`
}
