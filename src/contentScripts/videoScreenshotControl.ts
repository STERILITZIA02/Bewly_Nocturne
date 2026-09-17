import { watch } from 'vue'

import { useRouteState } from '~/composables/useRouteState'
import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { isVideoPlaybackPage } from '~/utils/main'
import { captureVideoScreenshot, handleVideoScreenshotShortcut, videoScreenshotBusy } from '~/utils/videoScreenshot'

import { createPlayerControlTooltip, updatePlayerControlTooltip } from './playerControlTooltip'
import { observePlayerDom } from './playerDomLifecycle'

const screenshotIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <path d="M25 29h9l4-6h12l4 6h9a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H25a6 6 0 0 1-6-6V35a6 6 0 0 1 6-6Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="44" cy="48" r="11" fill="none" stroke="#fff" stroke-width="5"/>
</svg>`

let controlContainer: HTMLElement | null = null
let hasInitialized = false
let stopPlayerObserver: (() => void) | null = null
let stopLifecycleWatch: (() => void) | null = null

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

  const iconWrapper = document.createElement('span')
  iconWrapper.className = 'bpx-common-svg-icon'
  iconWrapper.innerHTML = screenshotIcon
  icon.appendChild(iconWrapper)
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

  const controlBar = findPlayerControlBar()
  if (!controlBar)
    return

  const existingControl = controlBar.querySelector<HTMLElement>('.bewly-video-screenshot-control')
  if (existingControl) {
    controlContainer = existingControl
    updateControlLabel()
    return
  }

  const anchor = controlBar.querySelector('.bpx-player-ctrl-volume')
  if (!anchor?.querySelector('.bpx-player-ctrl-btn-icon'))
    return

  controlContainer = createControlContainer()
  anchor.insertAdjacentElement('afterend', controlContainer)
}

function releaseScreenshotControlResources() {
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
  if (hasInitialized || location.hostname === 'live.bilibili.com')
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
