import { getPlayerRoot } from '~/utils/playerMedia'

import { observePlayerDom } from './playerDomLifecycle'

interface Control {
  priority: number
  label: () => string
  activate: (trigger: HTMLElement) => void
  disabled?: () => boolean
}
interface Registration extends Control { inert: boolean, ariaHidden: string | null }
const COLLAPSED = 'bewly-player-control-collapsed'
const controls = new Map<HTMLElement, Registration>()
const observed = new Set<Element>()
const alternatives = new Map<HTMLElement, HTMLButtonElement>()
let alternativeGroup: HTMLElement | undefined
let resizeObserver: ResizeObserver | undefined
let stopStructure: (() => void) | undefined
let frame: number | undefined

const pixels = (value: string) => Number.parseFloat(value) || 0
function outerWidth(element: HTMLElement) {
  const style = getComputedStyle(element)
  if (style.display === 'none' || style.position === 'fixed')
    return 0
  return element.getBoundingClientRect().width + pixels(style.marginLeft) + pixels(style.marginRight)
}

function inputReserve(section: HTMLElement) {
  const style = getComputedStyle(section)
  if (style.display === 'none')
    return 0
  const input = section.querySelector<HTMLElement>('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]')
  if (!input)
    return Math.max(pixels(style.minWidth), section.children.length ? outerWidth(section) : 0)
  const inputStyle = getComputedStyle(input)
  // Keep ten characters usable at the current font scale. Fixed native send,
  // style and switch controls retain their measured widths alongside it.
  const minimumInput = Math.max(pixels(inputStyle.minWidth), pixels(inputStyle.fontSize) * 10)
    + pixels(inputStyle.paddingLeft) + pixels(inputStyle.paddingRight)
    + pixels(inputStyle.borderLeftWidth) + pixels(inputStyle.borderRightWidth)
  return Math.max(pixels(style.minWidth), section.getBoundingClientRect().width - input.getBoundingClientRect().width + minimumInput)
}

function syncAlternatives(collapsed: HTMLElement[]) {
  // Native context-menu rows are an alternative entry, not copies of native
  // business buttons. They call the same registered action as the toolbar.
  const menu = getPlayerRoot()?.querySelector<HTMLElement>('.bpx-player-contextmenu')
  if (!menu || collapsed.length === 0) {
    alternativeGroup?.remove()
    alternativeGroup = undefined
    alternatives.clear()
    return
  }
  if (!alternativeGroup || alternativeGroup.parentElement !== menu) {
    alternativeGroup?.remove()
    alternatives.clear()
    alternativeGroup = document.createElement('div')
    alternativeGroup.className = 'bewly-player-control-alternatives'
    menu.append(alternativeGroup)
  }
  for (const [control, button] of alternatives) {
    if (!collapsed.includes(control)) {
      button.remove()
      alternatives.delete(control)
    }
  }
  for (const control of collapsed) {
    const registration = controls.get(control)!
    let button = alternatives.get(control)
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.className = 'bewly-player-control-alternative'
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (!registration.disabled?.())
          registration.activate(button!)
      })
      button.addEventListener('keydown', (event) => {
        if (event.isComposing || event.repeat)
          event.preventDefault()
      })
      alternativeGroup.append(button)
      alternatives.set(control, button)
    }
    const label = registration.label()
    if (button.textContent !== label)
      button.textContent = label
    button.disabled = registration.disabled?.() ?? false
  }
}

function measure() {
  frame = undefined
  if (document.hidden)
    return
  const targets = new Set<Element>()
  const decisions: Array<[HTMLElement, boolean]> = []
  const bars = new Set([...controls.keys()].map(element => element.closest<HTMLElement>('.bpx-player-control-bottom-right')?.parentElement).filter((bar): bar is HTMLElement => !!bar?.isConnected))
  for (const bar of bars) {
    const right = bar.querySelector<HTMLElement>(':scope > .bpx-player-control-bottom-right')
    if (!right || bar.getBoundingClientRect().width <= 0)
      continue
    targets.add(bar)
    const sections = Array.from(bar.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
    sections.forEach(section => targets.add(section))
    const style = getComputedStyle(bar)
    const gap = pixels(style.columnGap)
    let occupied = pixels(style.paddingLeft) + pixels(style.paddingRight) + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth)
    const visibleSections = sections.filter(section => getComputedStyle(section).display !== 'none')
    occupied += Math.max(0, visibleSections.length - 1) * gap
    for (const section of visibleSections) {
      if (section !== right)
        occupied += section.matches('.bpx-player-control-bottom-center') ? inputReserve(section) : outerWidth(section)
    }
    const rightStyle = getComputedStyle(right)
    const rightChildren = Array.from(right.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
    const visibleNative = rightChildren.filter(child => !controls.has(child) && getComputedStyle(child).display !== 'none' && getComputedStyle(child).position !== 'absolute')
    rightChildren.forEach(child => targets.add(child))
    occupied += visibleNative.reduce((sum, child) => sum + outerWidth(child), 0)
      + pixels(rightStyle.paddingLeft) + pixels(rightStyle.paddingRight) + pixels(rightStyle.marginLeft) + pixels(rightStyle.marginRight)
      + Math.max(0, visibleNative.length - 1) * pixels(rightStyle.columnGap)
    let remaining = bar.getBoundingClientRect().width - occupied
    let exhausted = false
    let retained = visibleNative.length
    const managed = [...controls].filter(([element]) => element.parentElement === right).sort(([, a], [, b]) => a.priority - b.priority)
    for (const [element] of managed) {
      const width = outerWidth(element) + (retained ? pixels(rightStyle.columnGap) : 0)
      const collapsed = exhausted || width > remaining + 1
      decisions.push([element, collapsed])
      if (collapsed) {
        exhausted = true
      }
      else {
        remaining -= width
        retained++
      }
    }
  }
  // Measurements finish before any visibility writes. Absolute hidden controls
  // retain measurable intrinsic width, so restoring them never needs a probe.
  for (const [element, collapsed] of decisions) {
    if (element.classList.contains(COLLAPSED) === collapsed)
      continue
    if (collapsed && element.contains(document.activeElement)) {
      const native = element.parentElement?.querySelector<HTMLElement>('.bpx-player-ctrl-setting, .bpx-player-ctrl-volume')
      if (native) {
        const previous = native.getAttribute('tabindex')
        native.tabIndex = -1
        native.focus({ preventScroll: true })
        if (previous === null)
          native.removeAttribute('tabindex')
        else native.setAttribute('tabindex', previous)
      }
    }
    element.classList.toggle(COLLAPSED, collapsed)
    element.inert = collapsed
    if (collapsed)
      element.setAttribute('aria-hidden', 'true')
    else element.removeAttribute('aria-hidden')
  }
  for (const target of observed) {
    if (!targets.has(target)) {
      resizeObserver?.unobserve(target)
      observed.delete(target)
    }
  }
  for (const target of targets) {
    if (!observed.has(target)) {
      resizeObserver?.observe(target)
      observed.add(target)
    }
  }
  syncAlternatives(decisions.filter(([, collapsed]) => collapsed).map(([element]) => element))
}

function schedule() {
  if (controls.size && !document.hidden && frame === undefined)
    frame = requestAnimationFrame(measure)
}

export function registerPlayerControlFit(element: HTMLElement, control: Control) {
  controls.set(element, { ...control, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') })
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(schedule)
    document.addEventListener('visibilitychange', schedule)
    stopStructure = observePlayerDom((records) => {
      if (!records || records.some(record => record.target instanceof Element && (record.target.closest('.bpx-player-control-bottom, .bpx-player-contextmenu')
        || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => node instanceof Element && (node.matches('.bpx-player-control-bottom, .bpx-player-contextmenu') || node.querySelector('.bpx-player-control-bottom, .bpx-player-contextmenu')))))) {
        schedule()
      }
    })
  }
  schedule()
  return {
    refresh: schedule,
    dispose() {
      const entry = controls.get(element)
      if (!entry)
        return
      controls.delete(element)
      element.classList.remove(COLLAPSED)
      element.inert = entry.inert
      if (entry.ariaHidden === null)
        element.removeAttribute('aria-hidden')
      else element.setAttribute('aria-hidden', entry.ariaHidden)
      alternatives.get(element)?.remove()
      alternatives.delete(element)
      if (controls.size) {
        schedule()
        return
      }
      resizeObserver?.disconnect()
      resizeObserver = undefined
      observed.clear()
      stopStructure?.()
      stopStructure = undefined
      document.removeEventListener('visibilitychange', schedule)
      if (frame !== undefined)
        cancelAnimationFrame(frame)
      frame = undefined
      alternativeGroup?.remove()
      alternativeGroup = undefined
      alternatives.clear()
    },
  }
}
