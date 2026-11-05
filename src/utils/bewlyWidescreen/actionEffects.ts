import { isActionRollMutation, syncActionRolls } from '~/utils/bewlyWidescreen/actionRolls'
import { ACTION_ANIMATION_ATTRIBUTE, ACTION_ANIMATION_SELECTOR, BILIBILI_ACTION_ANIMATION_HUE, NATIVE_DIALOG_CHECK_CLASS, NATIVE_DIALOG_FIELD_CLASS, NATIVE_DIALOG_NUMERAL_CLASS, NATIVE_DIALOG_TITLE_CLASS, RAISED_MORE_MENU_CLASS } from '~/utils/bewlyWidescreen/constants'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { getViewportShiftX } from '~/utils/viewportFit'

/** Waits for bangumi's "more" menu to mount (liftMoreMenu). */
let moreMenuWatch: MutationObserver | undefined
/** Keeps the "more" menu open while the pointer crosses into it (keepMoreMenuHover). */
let moreMenuHover: AbortController | undefined

/** Marks bangumi's dialogs as they mount (markNativeDialog). */
let nativeDialogWatch: MutationObserver | undefined

// Bangumi mounts its dialogs (coin, rating) as fixed masks in the page container.
const NATIVE_DIALOG_HOST_SELECTOR = '#__next .main-container'
const NATIVE_DIALOG_SELECTOR = '[class*="dialogcoin_coin_dialog_mask"], [class*="short_short_review_masker"], [class*="modalWrapper_mask"]'
const NATIVE_DIALOG_MARKS: [selector: string, mark: string][] = [
  ['[class*="dialogcoin_coin_title"] > span', NATIVE_DIALOG_NUMERAL_CLASS],
  ['label > input[type="checkbox"] + i', NATIVE_DIALOG_CHECK_CLASS],
  ['[class*="header_review_edit_media_info"] > h4', NATIVE_DIALOG_TITLE_CLASS],
  ['[class*="short_review_body_wrap"] > textarea', NATIVE_DIALOG_FIELD_CLASS],
]

// Bangumi's watch-together panel: mounted under its chip while hovered.
const FITTED_POPOVER_SELECTOR = '[class*="WatchInfo_watch_more"]'
const FIT_X_PROPERTY = '--bewly-popover-fit-x'

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
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--bew-text-1').trim()
  const rgb = resolveCssColor(currentState, themeColor || '#888888')
  if (!rgb)
    return

  const { hue, saturation, lightness } = rgbToHsl(rgb)
  const hueRotate = Math.round(hue - BILIBILI_ACTION_ANIMATION_HUE)
  const saturationRatio = Math.max(0.8, Math.min(2.4, saturation / 0.85))
  const brightnessRatio = Math.max(0.75, Math.min(1.35, lightness / 0.46))
  const filter = `hue-rotate(${hueRotate}deg) saturate(${saturationRatio.toFixed(2)}) brightness(${brightnessRatio.toFixed(2)})`
  if (currentState.root.style.getPropertyValue('--bewly-widescreen-action-canvas-filter') !== filter)
    currentState.root.style.setProperty('--bewly-widescreen-action-canvas-filter', filter)
}

export function clearActionGeometry(currentState: BewlyWidescreenState) {
  moreMenuWatch?.disconnect()
  moreMenuWatch = undefined
  nativeDialogWatch?.disconnect()
  nativeDialogWatch = undefined
  for (const [, mark] of NATIVE_DIALOG_MARKS)
    document.querySelectorAll(`.${mark}`).forEach(node => node.classList.remove(mark))
  moreMenuHover?.abort()
  moreMenuHover = undefined
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
  // A video's chips sit in wraps; bangumi's chips are the toolbar's spans.
  const wraps = currentState.toolbarSlot.querySelectorAll<HTMLElement>('.toolbar-left-item-wrap, .toolbar > .toolbar-left > span')
  wraps.forEach((wrap) => {
    const button = wrap.querySelector<HTMLElement>('.video-toolbar-left-item') ?? (wrap.matches('.toolbar-left-item-wrap') ? null : wrap)
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
  const firstButton = wraps[0]?.querySelector<HTMLElement>('.video-toolbar-left-item') ?? null
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
    if (element.style.getPropertyValue('--bewly-action-anchor-x') !== `${x}px`)
      element.style.setProperty('--bewly-action-anchor-x', `${x}px`)
    if (element.style.getPropertyValue('--bewly-action-anchor-y') !== `${y}px`)
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

/**
 * Tags the native animation containers so their icon rules can key on an
 * attribute. Matching them by class substring above the subject would make
 * every class change on the page restyle whole subtrees. Runs in the observer
 * callback, before the inserted animation paints.
 */
function markActionAnimations(toolbarSlot: HTMLElement) {
  toolbarSlot.querySelectorAll(ACTION_ANIMATION_SELECTOR).forEach((element) => {
    if (!element.hasAttribute(ACTION_ANIMATION_ATTRIBUTE))
      element.setAttribute(ACTION_ANIMATION_ATTRIBUTE, '')
  })
}

/**
 * Bangumi's "more" chip opens a menu Bilibili mounts on <body> (on first
 * hover), under the playback shell. When the pointer reaches the chip, the
 * menu's wrapper is raised above the shell with its right edge at the chip's
 * (layout.ts); a body watch waits for it only until it first mounts.
 */
function liftMoreMenu(event: Event) {
  const chip = (event.target as Element).closest?.('.toolbar-right > span')
  if (!chip)
    return
  const right = `${document.documentElement.clientWidth - chip.getBoundingClientRect().right}px`
  const lift = () => {
    const wrap = document.querySelector('[class*="moreTool_popupWrap"]')?.parentElement
    if (!wrap)
      return false
    wrap.classList.add(RAISED_MORE_MENU_CLASS)
    wrap.style.setProperty('--bewly-more-menu-right', right)
    return true
  }
  if (lift() || moreMenuWatch)
    return
  moreMenuWatch = new MutationObserver(() => {
    if (!lift())
      return
    moreMenuWatch?.disconnect()
    moreMenuWatch = undefined
  })
  moreMenuWatch.observe(document.body, { childList: true })
}

/**
 * Bangumi's dialogs' count and checkbox have no class of their own; marked,
 * they take the dialog styles (layout.ts) without class substrings above
 * the subject.
 */
function markNativeDialog(dialog: Element) {
  for (const [selector, mark] of NATIVE_DIALOG_MARKS)
    dialog.querySelectorAll(selector).forEach(node => node.classList.add(mark))
}

function watchNativeDialogs() {
  const host = document.querySelector(NATIVE_DIALOG_HOST_SELECTOR)
  if (!host)
    return
  host.querySelectorAll(`:scope > :is(${NATIVE_DIALOG_SELECTOR})`).forEach(markNativeDialog)
  nativeDialogWatch = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element && node.matches(NATIVE_DIALOG_SELECTOR))
          markNativeDialog(node)
      })
    }
  })
  nativeDialogWatch.observe(host, { childList: true })
}

/**
 * The "more" menu is a React portal of its chip, but the toolbar was moved out
 * of Bilibili's React root, so React reads the pointer crossing from the chip
 * into the menu (or back) as leaving the chip, and closes the menu before it
 * can be used. Those crossings are kept from React; leaving both still
 * closes it.
 */
function keepMoreMenuHover(toolbarSlot: HTMLElement, event: MouseEvent) {
  if (!(event.target instanceof Element) || !(event.relatedTarget instanceof Element))
    return
  const menu = `.${RAISED_MORE_MENU_CLASS}`
  const from = event.target
  const to = event.relatedTarget
  if ((toolbarSlot.contains(from) && to.closest(menu)) || (from.closest(menu) && toolbarSlot.contains(to)))
    event.stopPropagation()
}

/**
 * Bilibili centres a panel such as watch-together under its chip, which can
 * reach past the window's edge; it moves sideways until it is the popover
 * inset inside. Runs as the panel mounts, before it paints, so it never jumps.
 */
function fitToolbarPopovers(toolbarSlot: HTMLElement) {
  toolbarSlot.querySelectorAll<HTMLElement>(FITTED_POPOVER_SELECTOR).forEach((popover) => {
    const box = popover.getBoundingClientRect()
    if (!box.width)
      return
    const inset = Number.parseFloat(getComputedStyle(popover).getPropertyValue('--bew-space-2'))
    const shift = getViewportShiftX(box, document.documentElement.clientWidth, inset)
    if (shift)
      popover.style.setProperty(FIT_X_PROPERTY, `${(Number.parseFloat(popover.style.getPropertyValue(FIT_X_PROPERTY)) || 0) + shift}px`)
  })
}

export function setupActionGeometryObservers(currentState: BewlyWidescreenState) {
  currentState.toolbarSlot.addEventListener('pointerover', liftMoreMenu)
  currentState.toolbarSlot.addEventListener('click', liftMoreMenu)
  moreMenuHover?.abort()
  moreMenuHover = new AbortController()
  // Capturing on the document runs before React's listeners on <body>.
  document.addEventListener('mouseout', event => keepMoreMenuHover(currentState.toolbarSlot, event), { capture: true, signal: moreMenuHover.signal })
  nativeDialogWatch?.disconnect()
  if (currentState.root.dataset.pageKind === 'pgc')
    watchNativeDialogs()
  currentState.toolbarMutationObserver = new MutationObserver((mutations) => {
    // The rollers' own text changes are not Bilibili's.
    const records = mutations.filter(record => !isActionRollMutation(record))
    if (!records.length)
      return
    syncActionRolls(currentState)
    const inserted = records.some(record => record.addedNodes.length > 0)
    if (inserted)
      fitToolbarPopovers(currentState.toolbarSlot)
    if (inserted || records.some(record => record.type === 'attributes'))
      markActionAnimations(currentState.toolbarSlot)
    if (inserted || records.some(record => record.removedNodes.length > 0))
      scheduleActionGeometrySync(currentState)
  })
  currentState.toolbarMutationObserver.observe(currentState.toolbarSlot, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })
  markActionAnimations(currentState.toolbarSlot)
  syncActionRolls(currentState)

  // The anchors follow the chips' widths. The slot's height animates when the
  // info card folds; that must not measure the row on every frame.
  let width = -1
  currentState.toolbarResizeObserver = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width)
      return
    width = entry.contentRect.width
    scheduleActionGeometrySync(currentState)
  })
  currentState.toolbarResizeObserver.observe(currentState.toolbarSlot)

  currentState.themeObserver = new MutationObserver(() => syncActionAnimationTheme(currentState))
  currentState.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  const bewlyHost = document.querySelector('#bewly')
  if (bewlyHost)
    currentState.themeObserver.observe(bewlyHost, { attributes: true, attributeFilter: ['class', 'style'] })
  scheduleActionGeometrySync(currentState)
}
