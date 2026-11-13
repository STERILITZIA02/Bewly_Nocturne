import { getMomentThumbnailUrl } from '~/components/MomentCard/utils'
import { RAIL_HEAD_TONE_ATTRIBUTE } from '~/utils/bewlyWidescreen/constants'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { peekImageBandTone, readImageBandTone } from '~/utils/imageTone'
import { getContrastingForeground } from '~/utils/themeColor'

type Rgb = [number, number, number]
type Tone = 'dark' | 'light'

const SAMPLE_OFFSETS = [0.25, 0.5, 0.75]
const STACK_LIMIT = 48
const URL_PATTERN = /url\(["']?([^"')]+)["']?\)/

function parseColor(value: string): [number, number, number, number] | null {
  const match = value.match(/^rgba?\(([^)]+)\)$/)
  if (!match)
    return null
  const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  return [r, g, b, a].every(Number.isFinite) ? [r, g, b, a] : null
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Everything painted at a point, topmost first, through open shadow roots. */
function paintedAt(root: Document | ShadowRoot, x: number, y: number, seen: Set<Element>, out: Element[]) {
  for (const element of root.elementsFromPoint(x, y)) {
    if (out.length >= STACK_LIMIT || seen.has(element))
      continue
    seen.add(element)
    // A host's shadow content is painted over the host's own background.
    if (element.shadowRoot)
      paintedAt(element.shadowRoot, x, y, seen, out)
    out.push(element)
  }
}

/**
 * The column's head is clear glass: whatever scrolls up under it shows
 * through, blurred, and a dark cover under dark text (or a bright one under
 * white) leaves a tab unreadable. Each tab takes black or white by what is
 * actually painted beneath it (user-specified 2026-11-10): a picture's
 * average colour (imageTone.ts, read once per picture) or the first opaque
 * background, sampled at three points across the tab.
 *
 * Sampling runs once per frame in which a panel scrolled, and when the tab,
 * the column's size or a read picture changes; never on a timer. Nothing is
 * under the head while the panel rests at its top, so that state is free.
 * The danmaku panel's own head rows need none of it: only text rows on the
 * column's colour pass under them.
 */
export function setupRailHeadTone(currentState: BewlyWidescreenState) {
  const { sidebarEl, tabButtons } = currentState
  const buttons = Object.values(tabButtons)
  const tablist = buttons[0].parentElement!
  const controller = new AbortController()
  let frame = 0
  // Pictures whose colour is being read; each schedules one more sample.
  const reading = new Set<string>()

  function pictureColor(source: string): Rgb | null {
    const url = getMomentThumbnailUrl(source, 64)
    const known = peekImageBandTone(url, 0, 1)
    if (known)
      return hexToRgb(known.color)
    if (known === undefined && !reading.has(url)) {
      reading.add(url)
      void readImageBandTone(url, 0, 1).then((tone) => {
        reading.delete(url)
        if (tone)
          schedule()
      })
    }
    return null
  }

  /** What an element paints: a picture's colour or its background, with its alpha. */
  function layerOf(element: Element): [Rgb, number] | null {
    if (element instanceof HTMLImageElement) {
      const picture = element.complete && element.naturalWidth > 0 ? pictureColor(element.currentSrc || element.src) : null
      return picture && [picture, 1]
    }
    const style = getComputedStyle(element)
    const image = style.backgroundImage.match(URL_PATTERN)?.[1]
    const picture = image ? pictureColor(image) : null
    if (picture)
      return [picture, 1]
    const background = parseColor(style.backgroundColor)
    return background && background[3] > 0 ? [[background[0], background[1], background[2]], background[3]] : null
  }

  /**
   * The colour under a point of the head, or null while it cannot be told.
   * The nine points of a sample share most of their stack, so each element's
   * style is read once per sample (`layers`).
   */
  function colorAt(x: number, y: number, layers: Map<Element, [Rgb, number] | null>): Rgb | null {
    const stack: Element[] = []
    paintedAt(document, x, y, new Set(), stack)
    let color: Rgb = [0, 0, 0]
    let covered = 0
    const lay = (layer: Rgb, alpha: number) => {
      const share = (1 - covered) * alpha
      color = [color[0] + layer[0] * share, color[1] + layer[1] * share, color[2] + layer[2] * share]
      covered += share
    }
    for (const element of stack) {
      // The head's own layers and the column around them are not beneath it.
      if (tablist.contains(element) || element.contains(tablist))
        continue
      let layer = layers.get(element)
      if (layer === undefined) {
        layer = layerOf(element)
        layers.set(element, layer)
      }
      if (layer)
        lay(layer[0], layer[1])
      if (covered >= 0.98)
        return [color[0] / covered, color[1] / covered, color[2] / covered]
    }
    return null
  }

  function write(element: HTMLElement, tone: Tone | undefined) {
    if (tone === undefined)
      element.removeAttribute(RAIL_HEAD_TONE_ATTRIBUTE)
    else if (element.getAttribute(RAIL_HEAD_TONE_ATTRIBUTE) !== tone)
      element.setAttribute(RAIL_HEAD_TONE_ATTRIBUTE, tone)
  }

  function sample() {
    frame = 0
    if (session.current !== currentState)
      return
    const panel = currentState.panels[currentState.activeTab]
    // At rest the panel's content starts below the head.
    const under = currentState.displayMode === 'card' && panel.scrollTop > 0
    const layers = new Map<Element, [Rgb, number] | null>()
    // Every read comes before the first write.
    const tones = buttons.map((button) => {
      if (!under)
        return undefined
      const box = button.getBoundingClientRect()
      if (!box.width || !box.height)
        return undefined
      const colors = SAMPLE_OFFSETS.map(offset => colorAt(box.left + box.width * offset, box.top + box.height / 2, layers))
      if (colors.includes(null))
        return undefined
      const mean = [0, 1, 2].map(channel => Math.round(colors.reduce((sum, color) => sum + color![channel], 0) / colors.length))
      const background = `#${mean.map(value => value.toString(16).padStart(2, '0')).join('')}`
      return getContrastingForeground(background) === '#ffffff' ? 'dark' : 'light'
    })
    buttons.forEach((button, index) => write(button, tones[index]))
    // The sliding plate lies under the selected tab.
    write(tablist, tones[buttons.indexOf(tabButtons[currentState.activeTab])])
  }

  function schedule() {
    if (!frame && !controller.signal.aborted)
      frame = requestAnimationFrame(sample)
  }

  // Scroll does not bubble; the capture reaches every panel's scroller.
  sidebarEl.addEventListener('scroll', schedule, { capture: true, passive: true, signal: controller.signal })
  const resize = new ResizeObserver(schedule)
  resize.observe(sidebarEl)
  // A picked tab's panel swaps in once the plate lands (shell.ts).
  const shown = new MutationObserver(schedule)
  for (const panel of Object.values(currentState.panels))
    shown.observe(panel, { attributes: true, attributeFilter: ['hidden'] })

  return () => {
    controller.abort()
    resize.disconnect()
    shown.disconnect()
    cancelAnimationFrame(frame)
    for (const element of [tablist, ...buttons])
      element.removeAttribute(RAIL_HEAD_TONE_ATTRIBUTE)
  }
}
