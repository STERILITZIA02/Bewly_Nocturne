import { watch } from 'vue'

import { useRouteState } from '~/composables/useRouteState'
import { settings } from '~/logic'
import { applyBewlyWidescreen } from '~/utils/bewlyWidescreen'
import { i18n } from '~/utils/i18n'
import { isVideoOrBangumiPage } from '~/utils/main'

import { observePlayerDom } from './playerDomLifecycle'

const CONTROL_CLASS = 'bewly-widescreen-entry-control'
const CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
const CONTROL_ANCHOR_SELECTOR = '.bpx-player-ctrl-wide, .bpx-player-ctrl-volume'

const widescreenIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" aria-hidden="true" focusable="false" style="width: 100%; height: 100%;">
  <path d="M18 34V20a2 2 0 0 1 2-2h14M54 18h14a2 2 0 0 1 2 2v14M70 54v14a2 2 0 0 1-2 2H54M34 70H20a2 2 0 0 1-2-2V54" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M31 44h26" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
</svg>`

let controlButton: HTMLButtonElement | null = null
let controlButtonAbortController: AbortController | null = null
let stopPlayerObserver: (() => void) | null = null
let stopLifecycleWatch: (() => void) | null = null
let initialized = false

function translate(key: string) {
  return String(i18n.global.t(key, settings.value.language))
}

function updateControlLabel(button = controlButton) {
  if (!button)
    return
  const label = translate('widescreen.enter')
  button.title = label
  button.setAttribute('aria-label', label)
}

function createControlButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `bpx-player-ctrl-btn ${CONTROL_CLASS}`
  button.style.cssText = 'appearance:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;'
  updateControlLabel(button)

  const icon = document.createElement('span')
  icon.className = 'bpx-player-ctrl-btn-icon bewly-widescreen-entry-icon'
  icon.innerHTML = widescreenIcon
  button.appendChild(icon)
  controlButtonAbortController?.abort()
  controlButtonAbortController = new AbortController()
  button.addEventListener('click', () => {
    applyBewlyWidescreen(settings.value.bewlyWidescreenSidebarPosition)
  }, { signal: controlButtonAbortController.signal })
  return button
}

function injectControl() {
  if (!settings.value.showBewlyWidescreenButton)
    return
  if (controlButton?.isConnected) {
    updateControlLabel()
    return
  }

  const controlBar = document.querySelector<HTMLElement>(CONTROL_BAR_SELECTOR)
  if (!controlBar)
    return

  document.querySelectorAll<HTMLElement>(`.${CONTROL_CLASS}`).forEach(element => element.remove())
  const anchor = controlBar.querySelector<HTMLElement>(CONTROL_ANCHOR_SELECTOR)
  if (!anchor)
    return

  controlButton = createControlButton()
  anchor.insertAdjacentElement('beforebegin', controlButton)
}

function releaseControlDiscovery() {
  stopPlayerObserver?.()
  stopPlayerObserver = null
  controlButtonAbortController?.abort()
  controlButtonAbortController = null
  controlButton?.remove()
  controlButton = null
  document.querySelectorAll<HTMLElement>(`.${CONTROL_CLASS}`).forEach(element => element.remove())
}

export function stopBewlyWidescreenControl() {
  stopLifecycleWatch?.()
  stopLifecycleWatch = null
  releaseControlDiscovery()
  initialized = false
}

export function initBewlyWidescreenControl() {
  if (initialized || location.hostname === 'live.bilibili.com')
    return

  initialized = true
  const routeState = useRouteState()
  const updateLifecycle = () => {
    releaseControlDiscovery()
    if (settings.value.showBewlyWidescreenButton && isVideoOrBangumiPage(routeState.href))
      stopPlayerObserver = observePlayerDom(injectControl)
  }

  stopLifecycleWatch = watch(
    [
      () => settings.value.showBewlyWidescreenButton,
      () => settings.value.language,
      () => routeState.navigationId,
    ],
    updateLifecycle,
    { immediate: true },
  )
}
