import { settings } from '~/logic'
import { getVideoElement } from '~/utils/player'
import { isPgcPlaybackPage } from '~/utils/videoMetadataBridge'

import { LOADING_EXIT_DELAY, LOADING_FADE_DURATION, LOADING_ROOT_ID, PREPARED_LOADING_TIMEOUT } from './constants'
import { t } from './labels'
import { createWidescreenLoadingSkeleton } from './loadingView'
import { session } from './session'
import { injectLoadingStyle } from './styles/loading'

interface WidescreenLoadingActions {
  exit: () => void
  onPreparationTimeout: () => void
}

export function createWidescreenLoading(actions: WidescreenLoadingActions) {
  let surface:
    | { phase: 'hidden' }
    | { phase: 'visible' | 'leaving', overlay: HTMLElement, style: HTMLStyleElement }
      = { phase: 'hidden' }

  let loadingFadeTimer: ReturnType<typeof setTimeout> | undefined

  let loadingFadeFrame: number | undefined

  let loadingPlaybackCleanup: (() => void) | undefined

  let loadingPreparationFallbackTimer: ReturnType<typeof setTimeout> | undefined

  let loadingExitTimer: ReturnType<typeof setTimeout> | undefined

  let dismissal: 'layout' | 'playing' | 'suppressed' = 'layout'

  function showWidescreenLoading() {
    if (surface.phase === 'visible')
      return
    if (surface.phase === 'leaving') {
      const policy = dismissal
      removeWidescreenLoading(true)
      dismissal = policy
    }

    const style = injectLoadingStyle()

    const overlay = document.createElement('div')
    overlay.id = LOADING_ROOT_ID
    overlay.dataset.sidebarPosition = settings.value.bewlyWidescreenSidebarPosition
    overlay.setAttribute('role', 'status')
    overlay.setAttribute('aria-live', 'polite')

    const content = document.createElement('div')
    content.className = 'bewly-widescreen-loading-content'

    const status = document.createElement('div')
    status.className = 'bewly-widescreen-loading-status'

    const label = document.createElement('span')
    label.className = 'bewly-widescreen-loading-label'
    label.textContent = t('widescreen.loading')
    status.appendChild(label)
    content.append(status, createWidescreenLoadingSkeleton(isPgcPlaybackPage() ? 'pgc' : 'video'))

    overlay.appendChild(content)
    const mountTarget = document.body ?? document.documentElement
    mountTarget.appendChild(overlay)
    surface = { phase: 'visible', overlay, style }

    loadingExitTimer = setTimeout(() => {
      loadingExitTimer = undefined
      if (surface.phase !== 'visible' || surface.overlay !== overlay)
        return

      const exitButton = document.createElement('button')
      exitButton.type = 'button'
      exitButton.className = 'bewly-widescreen-loading-exit'
      exitButton.textContent = t('widescreen.exit_loading')
      exitButton.addEventListener('click', () => {
        actions.exit()
      }, { once: true })
      content.appendChild(exitButton)
    }, LOADING_EXIT_DELAY)

    const handlePlaying = (event: Event) => {
      const video = event.target
      if (video instanceof HTMLVideoElement
        && video === getVideoElement()
        && shouldDismissLoadingForPlaying()) {
        dismissWidescreenLoadingForPlaying()
      }
    }
    document.addEventListener('playing', handlePlaying, true)
    loadingPlaybackCleanup = () => {
      document.removeEventListener('playing', handlePlaying, true)
      loadingPlaybackCleanup = undefined
    }
  }

  function shouldDismissLoadingForPlaying() {
    // A playing event is media readiness, not the post-transfer shell layout.
    // Ordinary (auto)play must keep the native page covered until the shell
    // commits; only an automatic continuation may keep its video in view.
    if (session.entering || session.current)
      return false
    return dismissal === 'playing'
  }

  function dismissWidescreenLoadingForPlaying() {
    dismissal = 'suppressed'
    removeWidescreenLoading()
  }

  function removeWidescreenLoading(immediate = false) {
    loadingPlaybackCleanup?.()
    if (dismissal !== 'suppressed')
      dismissal = 'layout'

    if (loadingExitTimer) {
      clearTimeout(loadingExitTimer)
      loadingExitTimer = undefined
    }

    if (loadingPreparationFallbackTimer) {
      clearTimeout(loadingPreparationFallbackTimer)
      loadingPreparationFallbackTimer = undefined
    }

    if (loadingFadeTimer) {
      clearTimeout(loadingFadeTimer)
      loadingFadeTimer = undefined
    }
    if (loadingFadeFrame !== undefined) {
      cancelAnimationFrame(loadingFadeFrame)
      loadingFadeFrame = undefined
    }

    const retiring = surface
    if (retiring.phase === 'hidden')
      return
    const { overlay, style } = retiring

    const remove = () => {
      overlay.remove()
      style.remove()
      if (surface === retiring) {
        surface = { phase: 'hidden' }
        loadingFadeTimer = undefined
      }
    }

    if (immediate) {
      remove()
      return
    }

    retiring.phase = 'leaving'
    loadingFadeFrame = requestAnimationFrame(() => {
      loadingFadeFrame = undefined
      if (surface === retiring && overlay.isConnected) {
        // The player ring closes while the overlay fades out.
        overlay.setAttribute('data-bew-loading-complete', '')
        overlay.classList.add('is-leaving')
      }
    })
    loadingFadeTimer = setTimeout(remove, LOADING_FADE_DURATION)
  }

  function prepare(allowPlayingDismiss = false) {
    if (session.current || dismissal === 'suppressed')
      return

    if (allowPlayingDismiss)
      dismissal = 'playing'
    showWidescreenLoading()
    const video = getVideoElement()
    if (surface.phase !== 'hidden'
      && video
      && !video.paused
      && !video.ended
      && shouldDismissLoadingForPlaying()) {
      dismissWidescreenLoadingForPlaying()
      return
    }

    if (surface.phase === 'hidden')
      return

    if (!loadingPreparationFallbackTimer) {
      loadingPreparationFallbackTimer = setTimeout(() => {
        loadingPreparationFallbackTimer = undefined
        if (session.entering)
          return
        dismissal = 'suppressed'
        removeWidescreenLoading()
        actions.onPreparationTimeout()
      }, PREPARED_LOADING_TIMEOUT)
    }
  }

  function syncLabels() {
    if (surface.phase === 'hidden')
      return
    const loadingLabel = surface.overlay.querySelector<HTMLElement>('.bewly-widescreen-loading-label')
    if (loadingLabel)
      loadingLabel.textContent = t('widescreen.loading')
    const loadingExitButton = surface.overlay.querySelector<HTMLButtonElement>('.bewly-widescreen-loading-exit')
    if (loadingExitButton)
      loadingExitButton.textContent = t('widescreen.exit_loading')
  }

  function alignToCurrentLayout() {
    const currentState = session.current
    if (surface.phase === 'hidden' || !currentState)
      return
    const loadingOverlay = surface.overlay
    // The skeleton shares the shell's grid; pin each part to the measured
    // surface so the crossfade has no residual offset.
    for (const [selector, source] of [
      ['.bewly-widescreen-loading-skeleton-player', currentState.playerFrame],
      ['.bewly-widescreen-loading-skeleton-controls', currentState.danmakuGlass],
      ['.bewly-widescreen-loading-skeleton-sidebar', currentState.sidebarEl],
    ] as const) {
      const target = loadingOverlay.querySelector<HTMLElement>(selector)
      const rect = source?.getBoundingClientRect()
      if (!target || !rect || rect.width <= 0 || rect.height <= 0)
        continue
      Object.assign(target.style, {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        right: 'auto',
        bottom: 'auto',
        boxSizing: 'border-box',
      })
    }
    // Align the list placeholders with the bottom of the real overview info.
    const info = loadingOverlay.querySelector<HTMLElement>('.bewly-widescreen-loading-skeleton-info')
    const infoHeight = currentState.sidebarTop.getBoundingClientRect().height
    if (info && infoHeight > 0)
      Object.assign(info.style, { flex: 'none', height: `${infoHeight}px`, maxHeight: 'none' })
  }

  function reset() {
    dismissal = 'layout'
    removeWidescreenLoading(true)
  }

  return {
    prepare,
    show: showWidescreenLoading,
    remove: removeWidescreenLoading,
    syncLabels,
    alignToCurrentLayout,
    reset,
    get hasOverlay() { return surface.phase !== 'hidden' },
  }
}
