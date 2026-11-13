// @unocss-include
import { watch } from 'vue'

import { useRouteState } from '~/composables/useRouteState'
import { settings } from '~/logic'
import { BILIBILI_LIVE_HOSTNAME } from '~/utils/bilibiliLiveContext'
import { i18n } from '~/utils/i18n'
import { isVideoPlaybackPage } from '~/utils/main'
import { captureVideoScreenshot, handleVideoScreenshotShortcut, videoScreenshotBusy } from '~/utils/videoScreenshot'

import { registerPlayerControlFit } from './playerControlFit'
import { createPlayerControlTooltip, updatePlayerControlTooltip } from './playerControlTooltip'
import { observePlayerDom } from './playerDomLifecycle'

let controlContainer: HTMLElement | null = null
let hasInitialized = false
let stopPlayerObserver: (() => void) | null = null
let stopLifecycleWatch: (() => void) | null = null
let fitControl: ReturnType<typeof registerPlayerControlFit> | undefined

function translate(key: string): string {
  return String(i18n.global.t(key, settings.value.language))
}

function updateControlLabel(control = controlContainer) {
  if (!control)
    return

  const label = translate('player_screenshot.capture')
  if (control.getAttribute('aria-label') === label && !control.hasAttribute('title'))
    return
  control.removeAttribute('title')
  control.setAttribute('aria-label', label)
  updatePlayerControlTooltip(control, label)
  fitControl?.refresh()
}

function findPlayerControlBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.bpx-player-control-bottom-right')
}

function createControlContainer(): HTMLElement {
  const container = document.createElement('div')
  const label = translate('player_screenshot.capture')
  container.className = 'bpx-player-ctrl-btn bewly-video-screenshot-control'
  container.setAttribute('role', 'button')
  container.setAttribute('aria-label', label)
  container.setAttribute('tabindex', '0')

  const icon = document.createElement('div')
  icon.className = 'bpx-player-ctrl-btn-icon bewly-video-screenshot-icon'

  const glyph = document.createElement('i')
  glyph.className = 'i-tabler:camera bewly-player-glyph'
  glyph.setAttribute('aria-hidden', 'true')
  icon.appendChild(glyph)
  container.append(icon, createPlayerControlTooltip(label))

  container.addEventListener('click', () => {
    void captureVideoScreenshot()
  })
  container.addEventListener('keydown', (event) => {
    if (event.repeat || event.isComposing || (event.key !== 'Enter' && event.key !== ' '))
      return

    event.preventDefault()
    void captureVideoScreenshot()
  })

  return container
}

function injectControl() {
  if (controlContainer?.isConnected) {
    updateControlLabel()
    return
  }
  fitControl?.dispose()
  fitControl = undefined

  const controlBar = findPlayerControlBar()
  if (!controlBar)
    return

  const existingControl = controlBar.querySelector<HTMLElement>('.bewly-video-screenshot-control')
  if (existingControl) {
    controlContainer = existingControl
    updateControlLabel()
    fitControl = registerControl(controlContainer)
    return
  }

  const anchor = controlBar.querySelector('.bpx-player-ctrl-volume')
  if (!anchor?.querySelector('.bpx-player-ctrl-btn-icon'))
    return

  controlContainer = createControlContainer()
  anchor.insertAdjacentElement('afterend', controlContainer)
  fitControl = registerControl(controlContainer)
}

function registerControl(control: HTMLElement) {
  return registerPlayerControlFit(control, {
    priority: 20,
    label: () => translate('player_screenshot.capture'),
    disabled: () => videoScreenshotBusy.value,
    activate: () => { void captureVideoScreenshot() },
  })
}

function releaseScreenshotControlResources() {
  fitControl?.dispose()
  fitControl = undefined
  document.removeEventListener('keydown', handleVideoScreenshotShortcut)
  stopPlayerObserver?.()
  stopPlayerObserver = null
  controlContainer?.remove()
  controlContainer = null
  document.querySelectorAll<HTMLElement>('.bewly-video-screenshot-control').forEach(element => element.remove())
}

export function stopVideoScreenshotControl() {
  stopLifecycleWatch?.()
  stopLifecycleWatch = null
  releaseScreenshotControlResources()
  hasInitialized = false
}

export function initVideoScreenshotControl() {
  if (hasInitialized || location.hostname === BILIBILI_LIVE_HOSTNAME)
    return

  hasInitialized = true
  const routeState = useRouteState()
  const updateLifecycle = () => {
    releaseScreenshotControlResources()
    if (isVideoPlaybackPage(routeState.href)) {
      if (settings.value.videoScreenshotShortcut)
        document.addEventListener('keydown', handleVideoScreenshotShortcut)
      if (settings.value.showVideoScreenshotButton)
        stopPlayerObserver = observePlayerDom(injectControl)
    }
  }
  const stopBusyWatch = watch(videoScreenshotBusy, (busy) => {
    controlContainer?.setAttribute('aria-busy', String(busy))
    fitControl?.refresh()
  })
  const stopWatch = watch(
    [() => settings.value.showVideoScreenshotButton, () => settings.value.videoScreenshotShortcut, () => settings.value.language, () => routeState.navigationId],
    updateLifecycle,
    { immediate: true },
  )
  stopLifecycleWatch = () => {
    stopWatch()
    stopBusyWatch()
  }
}
