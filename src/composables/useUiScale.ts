import { shallowRef, watch } from 'vue'

import { settings } from '~/logic'
import { resolveInterfaceScale, scaleDesignLength } from '~/utils/uiScale'

/** The interface scale (utils/uiScale.ts) and the device pixel lengths snap to, in CSS px. */
export const uiScale = shallowRef({ scale: 1, pixel: 1 })

/** A design length (px on the reference 14-inch display) on this display; tracked inside computeds. */
export function uiPx(length: number) {
  const { scale, pixel } = uiScale.value
  return scaleDesignLength(length, scale, pixel)
}

/** Writes the current scale on an element that declares the tokens (the document root, the Bewly host). */
export function applyUiScale(element: HTMLElement) {
  const { scale, pixel } = uiScale.value
  if (scale === 1) {
    element.style.removeProperty('--bew-ui-scale')
    element.style.removeProperty('--bew-ui-pixel')
    return
  }
  element.style.setProperty('--bew-ui-scale', String(scale))
  element.style.setProperty('--bew-ui-pixel', `${pixel}px`)
}

/**
 * Resolves the scale now and again only when the window reaches another
 * display, the page zoom changes or the setting changes (events, no polling).
 * The inherited variables are written only when the value actually changes.
 */
export function setupUiScale(): () => void {
  // The first pass always writes: a reloaded content script may find the previous one's value on the root.
  let written = false
  const update = () => {
    const display = { width: screen.width, height: screen.height, dpr: devicePixelRatio, mac: navigator.platform.startsWith('Mac') }
    const scale = resolveInterfaceScale(settings.value.interfaceSize, display)
    const pixel = scale === 1 ? 1 : 1 / devicePixelRatio
    if (written && scale === uiScale.value.scale && pixel === uiScale.value.pixel)
      return
    written = true
    uiScale.value = { scale, pixel }
    applyUiScale(document.documentElement)
    const host = document.getElementById('bewly')
    if (host)
      applyUiScale(host)
  }

  let resolution: MediaQueryList | undefined
  const onResolution = () => {
    watchResolution()
    update()
  }
  function watchResolution() {
    resolution?.removeEventListener('change', onResolution)
    resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
    resolution.addEventListener('change', onResolution)
  }
  watchResolution()
  // Chromium fires `change` on window.screen when the window moves to another display.
  const screenEvents = screen as Screen & Partial<EventTarget>
  screenEvents.addEventListener?.('change', update)
  const stopSetting = watch(() => settings.value.interfaceSize, update, { immediate: true })

  return () => {
    stopSetting()
    resolution?.removeEventListener('change', onResolution)
    screenEvents.removeEventListener?.('change', update)
  }
}
