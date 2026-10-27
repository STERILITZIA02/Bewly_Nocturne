import { createPlayerControlTooltip, updatePlayerControlTooltip } from '~/contentScripts/playerControlTooltip'
import { observePlayerDom } from '~/contentScripts/playerDomLifecycle'
import { FILL_TOGGLE_CLASS, HOST_ZOOMING_ATTRIBUTE, PLAYER_ZOOMING_ATTRIBUTE } from '~/utils/bewlyWidescreen/constants'
import { schedulePlayerResizeSync, syncAnchoredPlayerGeometry, syncDisplayModeAttributes } from '~/utils/bewlyWidescreen/geometry'
import { t } from '~/utils/bewlyWidescreen/labels'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState, WidescreenZoom } from '~/utils/bewlyWidescreen/types'
import type { WidescreenDisplayMode, WidescreenRect, WidescreenZoomFrame, WidescreenZoomVisual } from '~/utils/bewlyWidescreenPolicy'
import { interpolateWidescreenZoomFrame, resolveWidescreenContentWidth, resolveWidescreenZoomFrame, resolveWidescreenZoomVisual, WIDESCREEN_IDENTITY_ZOOM_FRAME } from '~/utils/bewlyWidescreenPolicy'
import { holdAnimation } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

// @unocss-include: `.ts` is outside UnoCSS's watch pipeline, so without it a
// running `pnpm dev` never generates icons named only here.
const FILL_ICON_CLASS = 'i-tabler:maximize'
const CARD_ICON_CLASS = 'i-tabler:minimize'

export function syncFillToggleButton(currentState: BewlyWidescreenState) {
  const button = currentState.fillToggleButton
  if (!button)
    return
  const filling = currentState.displayMode === 'fill'
  const label = t(filling ? 'widescreen.exit_fill_window' : 'widescreen.fill_window')
  if (button.getAttribute('aria-label') !== label)
    button.setAttribute('aria-label', label)
  // The tooltip names the key that also leaves the filled window.
  if (filling)
    button.setAttribute('aria-keyshortcuts', 'Escape')
  else
    button.removeAttribute('aria-keyshortcuts')
  updatePlayerControlTooltip(button, filling ? `${label} (Esc)` : label)
  const icon = button.querySelector<HTMLElement>(`.${FILL_TOGGLE_CLASS}__icon`)
  const iconClass = `${filling ? CARD_ICON_CLASS : FILL_ICON_CLASS} ${FILL_TOGGLE_CLASS}__icon`
  if (icon && icon.className !== iconClass)
    icon.className = iconClass
}

function createFillToggleButton(currentState: BewlyWidescreenState) {
  // Same structure as Bpx's own controls so the bar spaces and themes it natively.
  const button = document.createElement('div')
  button.className = `bpx-player-ctrl-btn ${FILL_TOGGLE_CLASS}`
  button.setAttribute('role', 'button')
  button.tabIndex = 0
  const iconBox = document.createElement('div')
  iconBox.className = 'bpx-player-ctrl-btn-icon'
  const icon = document.createElement('i')
  icon.className = `${FILL_ICON_CLASS} ${FILL_TOGGLE_CLASS}__icon`
  icon.setAttribute('aria-hidden', 'true')
  iconBox.append(icon)
  button.append(iconBox, createPlayerControlTooltip(''))

  const toggle = () => setWidescreenDisplayMode(
    currentState,
    currentState.displayMode === 'fill' ? 'card' : 'fill',
  )
  button.addEventListener('click', toggle)
  button.addEventListener('keydown', (event) => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || !['Enter', ' '].includes(event.key))
      return
    // Keep this control's activation ahead of Bpx's document shortcuts (Space plays).
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat)
      toggle()
  })
  button.addEventListener('keyup', (event) => {
    if (event.isComposing || !['Enter', ' '].includes(event.key))
      return
    event.preventDefault()
    event.stopPropagation()
  })
  return button
}

/**
 * The fill control takes the place of the hidden native wide / web / full
 * buttons at the end of the Bpx control bar, and follows rebuilt bars.
 */
export function setupFillToggle(currentState: BewlyWidescreenState) {
  const ensure = () => {
    if (session.current !== currentState)
      return
    const bar = currentState.playerEl.querySelector<HTMLElement>('.bpx-player-control-bottom-right')
    if (!bar || currentState.fillToggleButton?.parentElement === bar)
      return
    currentState.fillToggleButton ??= createFillToggleButton(currentState)
    bar.append(currentState.fillToggleButton)
    syncFillToggleButton(currentState)
  }
  const stopObserving = observePlayerDom(ensure)
  ensure()
  currentState.fillToggleCleanup = () => {
    stopObserving()
    currentState.fillToggleButton?.remove()
    currentState.fillToggleButton = undefined
  }
}

function setZoomingAttributes(currentState: BewlyWidescreenState, zooming: boolean) {
  if (zooming)
    currentState.root.dataset.zooming = 'true'
  else
    delete currentState.root.dataset.zooming
  currentState.playerEl.toggleAttribute(PLAYER_ZOOMING_ATTRIBUTE, zooming)
  // Bewly's docked side controls sit on the control glass and leave with it.
  document.querySelector<HTMLElement>('#bewly')?.toggleAttribute(HOST_ZOOMING_ATTRIBUTE, zooming)
}

export function stopWidescreenZoom(currentState: BewlyWidescreenState) {
  const zoom = currentState.zoom
  if (!zoom)
    return
  currentState.zoom = undefined
  zoom.motion.cancel()
  zoom.shape.cancel()
  setZoomingAttributes(currentState, false)
}

function toRect(rect: DOMRect): WidescreenRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * Width of the picture inside the player's current layout. Bpx letterboxes the
 * <video> (object-fit: contain); a cover crop such as the vertical video zoom
 * shows the element's whole box.
 */
function measureLayoutContentWidth(playerEl: HTMLElement) {
  const video = playerEl.querySelector<HTMLVideoElement>('video')
  if (!video || video.offsetWidth <= 0 || video.offsetHeight <= 0)
    return resolveWidescreenContentWidth({ width: playerEl.offsetWidth, height: playerEl.offsetHeight }, 16 / 9)
  const box = { width: Math.min(video.offsetWidth, playerEl.offsetWidth), height: Math.min(video.offsetHeight, playerEl.offsetHeight) }
  if (getComputedStyle(video).objectFit === 'cover')
    return box.width
  return resolveWidescreenContentWidth(box, video.videoWidth / video.videoHeight)
}

/** The player as painted right now, mid-zoom included, so a reversal never jumps. */
function measurePaintedPlayer(currentState: BewlyWidescreenState): WidescreenZoomVisual {
  const zoom = currentState.zoom
  const progress = zoom?.motion.effect?.getComputedTiming().progress
  if (zoom && typeof progress === 'number')
    return resolveWidescreenZoomVisual(zoom.layout, interpolateWidescreenZoomFrame(zoom.from, zoom.to, progress), zoom.layoutContentWidth)
  const { playerEl } = currentState
  return { rect: toRect(playerEl.getBoundingClientRect()), contentWidth: measureLayoutContentWidth(playerEl) }
}

function releaseRestMode(currentState: BewlyWidescreenState) {
  currentState.heldRestMode = undefined
  syncDisplayModeAttributes(currentState)
}

function frameTransform(frame: WidescreenZoomFrame) {
  return `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`
}

function frameClip(frame: WidescreenZoomFrame) {
  return `inset(${frame.clipY}px ${frame.clipX}px)`
}

/**
 * Switches between the video pane and the window-filling video without
 * touching the URL or the native player tree. The player takes its final
 * layout at once (one native resize, before the first frame), then zooms from
 * where it was painted, keeping the picture's width and centre. The motion is
 * transform-only so the compositor keeps it smooth while Bpx and the page
 * react to the resize on the main thread; the clip follows in a separate
 * main-thread animation on the same timing. Both ends are square. Leaving the
 * pane, the scaled player is only as tall as its picture; the backdrop paints
 * the pane's letterbox around it until the player outgrows the pane.
 */
export function setWidescreenDisplayMode(
  currentState: BewlyWidescreenState,
  mode: WidescreenDisplayMode,
  animate = true,
) {
  if (session.current !== currentState || currentState.displayMode === mode)
    return

  const { playerEl, root } = currentState
  const reducedMotion = prefersReducedMotion()
  const shouldAnimate = animate && !reducedMotion && typeof playerEl.animate === 'function'
  const painted = shouldAnimate ? measurePaintedPlayer(currentState) : undefined
  const restMode = currentState.heldRestMode ?? currentState.displayMode
  stopWidescreenZoom(currentState)

  currentState.displayMode = mode
  // Styles that only matter at rest restyle whole native and comment trees
  // through inherited properties; they wait for the settled frame.
  currentState.heldRestMode = shouldAnimate ? restMode : undefined
  syncFillToggleButton(currentState)
  syncAnchoredPlayerGeometry(currentState)

  const layout = toRect(playerEl.getBoundingClientRect())
  const layoutContentWidth = painted ? measureLayoutContentWidth(playerEl) : 0
  const from = painted ? resolveWidescreenZoomFrame(painted, layout, layoutContentWidth) : null
  if (painted && from) {
    // The clip trims the scaled box to the outline on screen and opens to the
    // settled layout.
    const to = WIDESCREEN_IDENTITY_ZOOM_FRAME
    const style = getComputedStyle(root)
    const timing: KeyframeAnimationOptions = {
      duration: getMotionDuration(style, '--bew-duration-moderate', 300),
      easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
    }
    setZoomingAttributes(currentState, true)
    const motion = playerEl.animate([{ transform: frameTransform(from) }, { transform: frameTransform(to) }], timing)
    const shape = playerEl.animate([{ clipPath: frameClip(from) }, { clipPath: frameClip(to) }], timing)
    const zoom: WidescreenZoom = { mode, layout, layoutContentWidth, from, to, motion, shape }
    currentState.zoom = zoom
    holdAnimation(motion)
    const settle = () => {
      if (currentState.zoom !== zoom)
        return
      stopWidescreenZoom(currentState)
      releaseRestMode(currentState)
      // Glass and auxiliary geometry skipped the transformed frames.
      schedulePlayerResizeSync(currentState)
    }
    void motion.finished.then(settle, settle)
  }
  else {
    releaseRestMode(currentState)
  }

  schedulePlayerResizeSync(currentState)
}
