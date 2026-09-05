import { settings } from '~/logic'
import { getVideoElement } from '~/utils/player'

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
  let loadingOverlay: HTMLElement | null = null

  let loadingStyleEl: HTMLStyleElement | null = null

  let loadingFadeTimer: ReturnType<typeof setTimeout> | undefined

  let loadingFadeFrame: number | undefined

  let loadingPlaybackCleanup: (() => void) | undefined

  let loadingPreparationFallbackTimer: ReturnType<typeof setTimeout> | undefined

  let loadingExitTimer: ReturnType<typeof setTimeout> | undefined

  let loadingMayDismissOnPlaying = false

  let loadingSuppressedUntilExit = false

  function showWidescreenLoading() {
    if (loadingOverlay)
      return

    loadingStyleEl = injectLoadingStyle()

    const overlay = document.createElement('div')
    overlay.id = LOADING_ROOT_ID
    overlay.dataset.sidebarLayout = settings.value.bewlyWidescreenLayoutPriority === 'sidebar-first'
      ? 'expanded'
      : 'compact'
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
    content.append(status, createWidescreenLoadingSkeleton())

    overlay.appendChild(content)
    const mountTarget = document.body ?? document.documentElement
    mountTarget.appendChild(overlay)
    loadingOverlay = overlay

    loadingExitTimer = setTimeout(() => {
      loadingExitTimer = undefined
      if (loadingOverlay !== overlay)
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
        && shouldDismissLoadingForPlaying(video)) {
        dismissWidescreenLoadingForPlaying()
      }
    }
    document.addEventListener('playing', handlePlaying, true)
    loadingPlaybackCleanup = () => {
      document.removeEventListener('playing', handlePlaying, true)
      loadingPlaybackCleanup = undefined
    }
  }

  function shouldDismissLoadingForPlaying(video: HTMLVideoElement) {
    return loadingMayDismissOnPlaying
      || video.autoplay
      || video.hasAttribute('autoplay')
      || navigator.userActivation?.hasBeenActive !== true
  }

  function dismissWidescreenLoadingForPlaying() {
    loadingSuppressedUntilExit = true
    removeWidescreenLoading()
  }

  function removeWidescreenLoading(immediate = false) {
    loadingPlaybackCleanup?.()
    loadingMayDismissOnPlaying = false

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

    const overlay = loadingOverlay
    const styleEl = loadingStyleEl
    if (!overlay && !styleEl)
      return

    const remove = () => {
      overlay?.remove()
      styleEl?.remove()
      if (loadingOverlay === overlay)
        loadingOverlay = null
      if (loadingStyleEl === styleEl)
        loadingStyleEl = null
      loadingFadeTimer = undefined
    }

    if (immediate || !overlay) {
      remove()
      return
    }

    loadingFadeFrame = requestAnimationFrame(() => {
      loadingFadeFrame = undefined
      if (loadingOverlay === overlay && overlay.isConnected)
        overlay.classList.add('is-leaving')
    })
    loadingFadeTimer = setTimeout(remove, LOADING_FADE_DURATION)
  }

  function prepare(allowPlayingDismiss = false) {
    if (session.current || loadingSuppressedUntilExit)
      return

    loadingMayDismissOnPlaying ||= allowPlayingDismiss
    showWidescreenLoading()
    const video = getVideoElement()
    if (loadingOverlay
      && video
      && !video.paused
      && !video.ended
      && shouldDismissLoadingForPlaying(video)) {
      dismissWidescreenLoadingForPlaying()
      return
    }

    if (!loadingOverlay)
      return

    if (!loadingPreparationFallbackTimer) {
      loadingPreparationFallbackTimer = setTimeout(() => {
        loadingPreparationFallbackTimer = undefined
        if (session.entering)
          return
        loadingSuppressedUntilExit = true
        removeWidescreenLoading()
        actions.onPreparationTimeout()
      }, PREPARED_LOADING_TIMEOUT)
    }
  }

  function syncLabels() {
    const loadingLabel = loadingOverlay?.querySelector<HTMLElement>('.bewly-widescreen-loading-label')
    if (loadingLabel)
      loadingLabel.textContent = t('widescreen.loading')
    const loadingExitButton = loadingOverlay?.querySelector<HTMLButtonElement>('.bewly-widescreen-loading-exit')
    if (loadingExitButton)
      loadingExitButton.textContent = t('widescreen.exit_loading')
  }

  function reset() {
    loadingSuppressedUntilExit = false
    removeWidescreenLoading(true)
  }

  return {
    prepare,
    show: showWidescreenLoading,
    remove: removeWidescreenLoading,
    syncLabels,
    reset,
    get hasOverlay() { return Boolean(loadingOverlay) },
  }
}
