import { BILIBILI_ACTION_ANIMATION_HUE } from '~/utils/bewlyWidescreen/constants'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'

function parseRgbColor(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match)
    return null

  return {
    r: Number(match[1]) / 255,
    g: Number(match[2]) / 255,
    b: Number(match[3]) / 255,
  }
}

function rgbToHsl({ r, g, b }: { r: number, g: number, b: number }) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2

  if (max === min)
    return { hue: 0, saturation: 0, lightness }

  const delta = max - min
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min)

  let hue = 0
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0)
      break
    case g:
      hue = (b - r) / delta + 2
      break
    default:
      hue = (r - g) / delta + 4
      break
  }

  return { hue: hue * 60, saturation, lightness }
}

function resolveCssColor(currentState: BewlyWidescreenState, value: string) {
  if (!value)
    return null

  let probe = currentState.colorProbe
  if (!probe) {
    probe = document.createElement('span')
    probe.style.position = 'fixed'
    probe.style.pointerEvents = 'none'
    probe.style.opacity = '0'
    probe.setAttribute('aria-hidden', 'true')
    currentState.root.appendChild(probe)
    currentState.colorProbe = probe
  }
  if (probe.style.color !== value)
    probe.style.color = value
  return parseRgbColor(getComputedStyle(probe).color)
}

export function syncActionAnimationTheme(currentState: BewlyWidescreenState) {
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--bew-theme-color').trim()
  const rgb = resolveCssColor(currentState, themeColor || '#00aeec')
  if (!rgb)
    return

  const { hue, saturation, lightness } = rgbToHsl(rgb)
  const hueRotate = Math.round(hue - BILIBILI_ACTION_ANIMATION_HUE)
  const saturationRatio = Math.max(0.8, Math.min(2.4, saturation / 0.85))
  const brightnessRatio = Math.max(0.75, Math.min(1.35, lightness / 0.46))
  currentState.root.style.setProperty(
    '--bewly-widescreen-action-canvas-filter',
    `hue-rotate(${hueRotate}deg) saturate(${saturationRatio.toFixed(2)}) brightness(${brightnessRatio.toFixed(2)})`,
  )
}

export function clearActionGeometry(currentState: BewlyWidescreenState) {
  if (currentState.actionGeometryFrame !== undefined)
    cancelAnimationFrame(currentState.actionGeometryFrame)
  currentState.actionGeometryFrame = undefined
  currentState.actionGeometryElements?.forEach((element) => {
    element.style.removeProperty('--bewly-action-anchor-x')
    element.style.removeProperty('--bewly-action-anchor-y')
  })
  currentState.actionGeometryElements?.clear()
}

function syncActionEffectGeometry(currentState: BewlyWidescreenState) {
  if (!session.current || session.current !== currentState)
    return

  const measurements: Array<{ element: HTMLElement, x: number, y: number }> = []
  const findVisibleAnchor = (button: HTMLElement) => {
    const buttonRect = button.getBoundingClientRect()
    const candidates = button.querySelectorAll<HTMLElement>(
      '.video-toolbar-item-icon, .video-like-icon, .video-share-icon, svg, i',
    )
    return Array.from(candidates).find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      return rect.width > 0
        && rect.height > 0
        && centerX >= buttonRect.left
        && centerX <= buttonRect.right
        && centerY >= buttonRect.top
        && centerY <= buttonRect.bottom
    }) || button
  }
  const wraps = currentState.toolbarSlot.querySelectorAll<HTMLElement>('.toolbar-left-item-wrap')
  wraps.forEach((wrap) => {
    const button = wrap.querySelector<HTMLElement>('.video-toolbar-left-item')
    if (!button)
      return
    const anchor = findVisibleAnchor(button)
    const anchorRect = anchor.getBoundingClientRect()
    for (const element of [wrap, button]) {
      const rect = element.getBoundingClientRect()
      measurements.push({
        element,
        x: anchorRect.left + anchorRect.width / 2 - rect.left,
        y: anchorRect.top + anchorRect.height / 2 - rect.top,
      })
    }
  })

  const toolbarLeft = currentState.toolbarSlot.querySelector<HTMLElement>('.video-toolbar-left')
  const firstButton = wraps[0]?.querySelector<HTMLElement>('.video-toolbar-left-item')
  const firstAnchor = firstButton ? findVisibleAnchor(firstButton) : null
  if (toolbarLeft && firstAnchor) {
    const anchorRect = firstAnchor.getBoundingClientRect()
    const toolbarRect = toolbarLeft.getBoundingClientRect()
    measurements.push({
      element: toolbarLeft,
      x: anchorRect.left + anchorRect.width / 2 - toolbarRect.left,
      y: anchorRect.top + anchorRect.height / 2 - toolbarRect.top,
    })
  }

  const nextElements = new Set(measurements.map(({ element }) => element))
  currentState.actionGeometryElements?.forEach((element) => {
    if (nextElements.has(element))
      return
    element.style.removeProperty('--bewly-action-anchor-x')
    element.style.removeProperty('--bewly-action-anchor-y')
  })
  measurements.forEach(({ element, x, y }) => {
    element.style.setProperty('--bewly-action-anchor-x', `${x}px`)
    element.style.setProperty('--bewly-action-anchor-y', `${y}px`)
  })
  currentState.actionGeometryElements = nextElements
}

export function scheduleActionGeometrySync(currentState: BewlyWidescreenState) {
  if (!session.current || session.current !== currentState || currentState.actionGeometryFrame !== undefined)
    return

  currentState.actionGeometryFrame = requestAnimationFrame(() => {
    currentState.actionGeometryFrame = undefined
    syncActionEffectGeometry(currentState)
  })
}

export function setupActionGeometryObservers(currentState: BewlyWidescreenState) {
  currentState.toolbarMutationObserver = new MutationObserver((records) => {
    if (records.some(record => record.addedNodes.length > 0 || record.removedNodes.length > 0))
      scheduleActionGeometrySync(currentState)
  })
  currentState.toolbarMutationObserver.observe(currentState.toolbarSlot, { childList: true, subtree: true })

  currentState.toolbarResizeObserver = new ResizeObserver(() => scheduleActionGeometrySync(currentState))
  currentState.toolbarResizeObserver.observe(currentState.toolbarSlot)

  currentState.themeObserver = new MutationObserver(() => syncActionAnimationTheme(currentState))
  currentState.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  const bewlyHost = document.querySelector('#bewly')
  if (bewlyHost)
    currentState.themeObserver.observe(bewlyHost, { attributes: true, attributeFilter: ['class', 'style'] })
  scheduleActionGeometrySync(currentState)
}
