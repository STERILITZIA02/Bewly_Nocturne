import { getMotionDuration } from './motionTiming'
import { prefersReducedMotion } from './reducedMotion'

/**
 * Deleted elements break into particles that drift away. One read pass builds a
 * low-resolution picture of each element (backgrounds, loaded images and video
 * frames, text lines as bars) on an offscreen canvas; particles are cells of
 * that picture drawn onto one fixed canvas. The canvas is independent of the
 * element, so its data can be removed while the particles are still in flight.
 * Images are drawn, never read back, so cross-origin covers need no CORS copy.
 */

/** Particles across every running dissolve; each call gets a share. */
const PARTICLE_BUDGET = 3600
const CALL_PARTICLES = 2400
const MIN_CELL = 2
const NODE_BUDGET = 400
/** Furthest a particle travels, in CSS px. */
const DRIFT = 112
/** The particle layer blurs toward this as the dust thins into mist. */
const MIST_BLUR = 3
/**
 * Fractions of the duration: the element fades out, then its data may go and
 * the rest close the gap. Nothing waits on the particles: they play on their
 * own layer and never delay a page or tab change.
 */
const ELEMENT_FADE = 0.2
const RELEASE = 0.3

interface Box { x: number, y: number, w: number, h: number }
interface Clip extends Box { r: number }
type Paint
  = | { kind: 'fill', box: Box, r: number, color: string, alpha: number, clip?: Clip }
    | { kind: 'image', box: Box, r: number, source: CanvasImageSource, width: number, height: number, fit: string, alpha: number, clip?: Clip }

export interface ParticleDissolve {
  /** The elements have faded: remove their data now (the particles play on). */
  released: Promise<void>
  /** The removal did not happen (failed write): stop and show the elements again. */
  restore: () => void
}

interface Piece {
  element: HTMLElement
  /** Visible part of the element, viewport coordinates. */
  box: Box
  cell: number
  scale: number
  paints: Paint[]
}

let activeParticles = 0
let activeRuns = 0
const running = new WeakMap<Element, ParticleDissolve>()
const settled: ParticleDissolve = { released: Promise.resolve(), restore: () => {} }
const activeFinishes = new Set<() => void>()
function stopHiddenParticles() {
  if (document.hidden)
    activeFinishes.forEach(finish => finish())
}

function isTransparent(color: string) {
  return !color || color === 'transparent' || /(?:,|\/)\s*0(?:\.0+)?\s*\)$/.test(color)
}

function radiusOf(style: CSSStyleDeclaration, box: Box) {
  const value = style.borderTopLeftRadius
  const radius = value.endsWith('%') ? Number.parseFloat(value) / 100 * Math.min(box.w, box.h) : Number.parseFloat(value)
  return Math.min(Number.isFinite(radius) ? radius : 0, box.w / 2, box.h / 2)
}

function toBox(rect: DOMRect): Box {
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
}

function intersect(a: Box, b: Box): Box | undefined {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : undefined
}

function mediaSize(element: Element): [CanvasImageSource, number, number] | undefined {
  if (element instanceof HTMLImageElement && element.complete && element.naturalWidth)
    return [element, element.naturalWidth, element.naturalHeight]
  if (element instanceof HTMLVideoElement && element.readyState >= 2 && element.videoWidth)
    return [element, element.videoWidth, element.videoHeight]
  if (element instanceof HTMLCanvasElement && element.width)
    return [element, element.width, element.height]
}

/** Reads only: computed styles and client rects of a bounded subtree. */
function readPaints(root: HTMLElement): Paint[] {
  const paints: Paint[] = []
  let budget = NODE_BUDGET
  const visit = (element: Element, parentAlpha: number, clip: Clip | undefined, isRoot: boolean) => {
    if (budget-- <= 0)
      return
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden')
      return
    const alpha = parentAlpha * Number(style.opacity || 1)
    if (alpha < 0.02)
      return
    const box = toBox(element.getBoundingClientRect())
    if (!box.w || !box.h)
      return
    const r = radiusOf(style, box)
    let background = style.backgroundColor
    if (isRoot && isTransparent(background))
      background = getComputedStyle(element, '::before').backgroundColor
    const media = mediaSize(element)
    if (media) {
      paints.push({ kind: 'image', box, r, source: media[0], width: media[1], height: media[2], fit: style.objectFit, alpha, clip })
      return
    }
    // Icons (UnoCSS masks, inline SVG) read as a soft dot of their colour.
    if (element instanceof SVGElement || (style.maskImage && style.maskImage !== 'none')) {
      const inset = Math.min(box.w, box.h) * 0.2
      paints.push({ kind: 'fill', box: { x: box.x + inset, y: box.y + inset, w: box.w - inset * 2, h: box.h - inset * 2 }, r: inset, color: isTransparent(background) ? style.color : background, alpha: alpha * 0.5, clip })
      return
    }
    if (!isTransparent(background))
      paints.push({ kind: 'fill', box, r, color: background, alpha, clip })
    const childClip = style.overflowX !== 'visible' || style.overflowY !== 'visible' ? { ...box, r } : clip
    for (const node of element.childNodes) {
      if (node instanceof Element) {
        visit(node, alpha, childClip, false)
      }
      else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        const size = Number.parseFloat(style.fontSize) || 13
        for (const line of range.getClientRects()) {
          const h = Math.min(line.height, size * 0.6)
          paints.push({ kind: 'fill', box: { x: line.left, y: line.top + (line.height - h) / 2, w: line.width, h }, r: h / 3, color: style.color, alpha: alpha * 0.6, clip: childClip })
        }
      }
    }
  }
  visit(root, 1, undefined, true)
  return paints
}

function roundRect(context: OffscreenCanvasRenderingContext2D, box: Box, r: number) {
  context.beginPath()
  context.roundRect(box.x, box.y, box.w, box.h, r)
}

/** Draws the picture, plus an untainted coverage map at one pixel per cell. */
function paintPiece(piece: Piece) {
  const { box, cell, scale, paints } = piece
  const picture = new OffscreenCanvas(Math.ceil(box.w * scale), Math.ceil(box.h * scale))
  const coverage = new OffscreenCanvas(Math.ceil(box.w / cell), Math.ceil(box.h / cell))
  const draw = picture.getContext('2d')!
  const cover = coverage.getContext('2d', { willReadFrequently: true })!
  for (const [context, factor] of [[draw, scale], [cover, 1 / cell]] as const) {
    context.setTransform(factor, 0, 0, factor, -box.x * factor, -box.y * factor)
    for (const paint of paints) {
      context.save()
      context.globalAlpha = paint.alpha
      if (paint.clip) {
        roundRect(context, paint.clip, paint.clip.r)
        context.clip()
      }
      roundRect(context, paint.box, paint.r)
      context.clip()
      if (context === cover) {
        context.fillStyle = '#fff'
        context.fill()
      }
      else if (paint.kind === 'fill') {
        context.fillStyle = paint.color
        context.fill()
      }
      else {
        drawFitted(context, paint)
      }
      context.restore()
    }
  }
  const { data } = cover.getImageData(0, 0, coverage.width, coverage.height)
  return { picture, data, columns: coverage.width, rows: coverage.height }
}

function drawFitted(context: OffscreenCanvasRenderingContext2D, paint: Extract<Paint, { kind: 'image' }>) {
  const { box, width, height, fit } = paint
  if (fit !== 'cover' && fit !== 'contain') {
    context.drawImage(paint.source, box.x, box.y, box.w, box.h)
    return
  }
  const scale = (fit === 'cover' ? Math.max : Math.min)(box.w / width, box.h / height)
  const w = width * scale
  const h = height * scale
  context.drawImage(paint.source, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h)
}

/** The element stays hidden (fill) until its owner removes it or restores it. */
function fadeElements(elements: HTMLElement[], duration: number) {
  const snapshots = elements.map(element => ({ element, inert: element.inert, opacity: getComputedStyle(element).opacity }))
  const fades = snapshots.map(({ element, inert, opacity }) => {
    element.inert = true
    const fade = element.animate([{ opacity }, { opacity: 0 }], { duration, easing: 'linear', fill: 'forwards' })
    return () => {
      fade.cancel()
      element.inert = inert
    }
  })
  return () => fades.forEach(restore => restore())
}

function run(elements: HTMLElement[]): ParticleDissolve {
  const availableParticles = Math.max(0, PARTICLE_BUDGET - activeParticles)
  if (prefersReducedMotion() || typeof OffscreenCanvas === 'undefined' || availableParticles === 0 || document.hidden) {
    const duration = getMotionDuration(getComputedStyle(elements[0]), '--bew-duration-fast', 150)
    return { released: new Promise(resolve => setTimeout(resolve, duration)), restore: fadeElements(elements, duration) }
  }
  const viewport = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
  // Reads first: every rect and style before any canvas or animation exists.
  const rootStyle = getComputedStyle(elements[0])
  const duration = getMotionDuration(rootStyle, '--bew-dissolve-duration', 300)
  const zIndex = rootStyle.getPropertyValue('--bew-z-dissolve').trim()
  const visible = elements.flatMap((element) => {
    const box = intersect(toBox(element.getBoundingClientRect()), viewport)
    return box ? [{ element, box, paints: readPaints(element) }] : []
  })
  // Nothing on screen: there is nothing to watch, remove the data now.
  if (!visible.length)
    return settled
  const restoreElements = fadeElements(elements, duration * ELEMENT_FADE)
  const released = new Promise<void>(resolve => setTimeout(resolve, duration * RELEASE))

  const budget = Math.min(CALL_PARTICLES, availableParticles)
  const area = visible.reduce((sum, { box }) => sum + box.w * box.h, 0)
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const cell = Math.max(MIN_CELL, Math.ceil(Math.sqrt(area / budget)))
  const pieces: Piece[] = visible.map(({ element, box, paints }) => ({ element, box, cell, scale: cell <= MIN_CELL ? ratio : 1, paints }))
  // Room for the drift: up and to the right of every piece.
  const left = Math.min(...pieces.map(({ box }) => box.x)) - 8
  const top = Math.min(...pieces.map(({ box }) => box.y)) - DRIFT - 8
  const right = Math.max(...pieces.map(({ box }) => box.x + box.w)) + DRIFT + 8
  const bottom = Math.max(...pieces.map(({ box }) => box.y + box.h)) + 8
  const frame = intersect({ x: left, y: top, w: right - left, h: bottom - top }, viewport)!

  // Particle i: source cell, origin, timing and path, all relative to `frame`.
  const sources: { picture: OffscreenCanvas, scale: number, element: HTMLElement }[] = []
  const particles: number[] = []
  const STRIDE = 11
  for (const piece of pieces) {
    if (particles.length / STRIDE >= budget)
      break
    const { picture, data, columns, rows } = paintPiece(piece)
    sources.push({ picture, scale: piece.scale, element: piece.element })
    const source = sources.length - 1
    for (let row = 0; row < rows && particles.length / STRIDE < budget; row++) {
      for (let column = 0; column < columns && particles.length / STRIDE < budget; column++) {
        if (data[(row * columns + column) * 4 + 3] < 24)
          continue
        const u = column / Math.max(1, columns - 1)
        const v = row / Math.max(1, rows - 1)
        // The break sweeps from the left edge with a little noise.
        const delay = (0.04 + (u * 0.82 + v * 0.18) * 0.38 + Math.random() * 0.08) * duration
        const life = Math.max(0.4 * duration, duration - delay - Math.random() * 0.08 * duration)
        particles.push(
          source,
          column * piece.cell,
          row * piece.cell,
          piece.box.x - frame.x + column * piece.cell,
          piece.box.y - frame.y + row * piece.cell,
          delay,
          life,
          DRIFT * (0.3 + Math.random() * 0.7),
          -DRIFT * (0.15 + Math.random() * 0.75),
          Math.random() * Math.PI * 2,
          piece.cell,
        )
      }
    }
  }
  const count = particles.length / STRIDE
  activeParticles += count

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(frame.w * ratio)
  canvas.height = Math.ceil(frame.h * ratio)
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    width: `${frame.w}px`,
    height: `${frame.h}px`,
    zIndex,
    pointerEvents: 'none',
    contain: 'strict',
  })
  const host = elements[0].getRootNode()
  ;(host instanceof ShadowRoot ? host : document.body).append(canvas)
  const context = canvas.getContext('2d')!
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  // Mist: the whole layer softens as the cells crumble (a composited filter).
  const mist = canvas.animate([{ filter: 'blur(0px)' }, { filter: `blur(${MIST_BLUR}px)` }], { duration, easing: 'ease-in', fill: 'forwards' })
  const start = performance.now()
  const resting = new Float32Array(sources.length)
  let frameId = 0
  let finished = false
  activeRuns++

  const finish = () => {
    if (finished)
      return
    finished = true
    activeRuns--
    activeParticles -= count
    cancelAnimationFrame(frameId)
    mist.cancel()
    activeFinishes.delete(finish)
    if (!activeFinishes.size)
      document.removeEventListener('visibilitychange', stopHiddenParticles)
    canvas.remove()
    canvas.width = 0
    for (const { picture } of sources)
      picture.width = 0
  }
  const render = (time: number) => {
    if (finished)
      return
    const t = time - start
    if (t >= duration || !canvas.isConnected) {
      finish()
      return
    }
    // Cells still in place cross-fade in as the element itself fades out, or
    // take over at once when its owner removed it early.
    const fading = Math.min(1, t / (duration * ELEMENT_FADE))
    sources.forEach(({ element }, index) => resting[index] = element.isConnected ? fading : 1)
    context.clearRect(0, 0, frame.w, frame.h)
    for (let offset = 0; offset < particles.length; offset += STRIDE) {
      const { picture, scale } = sources[particles[offset]]
      const cell = particles[offset + 10]
      const p = Math.min(1, Math.max(0, (t - particles[offset + 5]) / particles[offset + 6]))
      if (p === 1)
        continue
      let x = particles[offset + 3]
      let y = particles[offset + 4]
      let size = cell
      if (p > 0) {
        const eased = p * p * (3 - 2 * p)
        // A cell crumbles into a finer grain at once, then thins out as it drifts.
        size = cell * (1 - 0.45 * Math.min(1, p * 4) - 0.35 * p)
        const sway = Math.sin(particles[offset + 9] + p * 7) * 10 * p
        x += particles[offset + 7] * eased + sway + (cell - size) / 2
        y += particles[offset + 8] * eased + Math.cos(particles[offset + 9] + p * 5) * 4 * p + (cell - size) / 2
        context.globalAlpha = 0.9 * (1 - p) ** 1.6
      }
      else {
        context.globalAlpha = resting[particles[offset]]
      }
      context.drawImage(picture, particles[offset + 1] * scale, particles[offset + 2] * scale, cell * scale, cell * scale, x, y, size, size)
    }
    frameId = requestAnimationFrame(render)
  }
  if (!activeFinishes.size)
    document.addEventListener('visibilitychange', stopHiddenParticles)
  activeFinishes.add(finish)
  frameId = requestAnimationFrame(render)
  return {
    released,
    restore() {
      finish()
      restoreElements()
    },
  }
}

/**
 * True while particles are in flight. Lists whose data is removed elsewhere (a
 * store, a relation event) gate their `useLayoutMotion` on it, so only the gap
 * left by a deletion animates, not ordinary updates.
 */
export function isDissolving() {
  return activeRuns > 0
}

/**
 * Plays the shared delete effect on elements that are leaving. Start it when
 * the removal is decided (or right before an owner's write) and remove the
 * data once `released` resolves; the particles keep drifting on their own
 * canvas while the remaining items close the gap. An owner that removes the
 * data earlier is fine too: the particles take over where the element was.
 * Missing, detached and off-screen elements release at once.
 */
export function dissolveElements(targets: Iterable<Element | null | undefined> | Element | null | undefined): ParticleDissolve {
  const list = targets instanceof Element || !targets ? [targets] : [...targets]
  const joined: ParticleDissolve[] = []
  const fresh: HTMLElement[] = []
  for (const element of list) {
    if (!(element instanceof HTMLElement) || !element.isConnected)
      continue
    const current = running.get(element)
    if (current)
      joined.push(current)
    else fresh.push(element)
  }
  if (fresh.length && typeof fresh[0].animate === 'function') {
    const dissolve = run(fresh)
    fresh.forEach(element => running.set(element, dissolve))
    const forget = () => fresh.forEach(element => running.get(element) === dissolve && running.delete(element))
    void dissolve.released.then(forget)
    joined.push({ released: dissolve.released, restore: () => {
      forget()
      dissolve.restore()
    } })
  }
  if (joined.length === 1)
    return joined[0]
  return {
    released: Promise.all(joined.map(({ released }) => released)).then(() => {}),
    restore: () => joined.forEach(({ restore }) => restore()),
  }
}
