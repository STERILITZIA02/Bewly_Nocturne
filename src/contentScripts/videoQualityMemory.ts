import { watch } from 'vue'

import { useRouteState } from '~/composables/useRouteState'
import { settings } from '~/logic'
import { getPlaybackNavigationKey, parsePlaybackTabUrl } from '~/utils/playbackTab'
import { getPlayerRoot, getVideoElement } from '~/utils/playerMedia'
import { isNativeVideoComponentReady, readNativePlaybackEpisodeId, readNativeQualityState } from '~/utils/videoMetadataBridge'

import { hasPlayerMediaMutation, observePlayerDom } from './playerDomLifecycle'

const QUALITY_ITEM = '.bpx-player-ctrl-quality-menu-item[data-value]'
const QUALITY_MENU = '.bpx-player-ctrl-quality'
const CONFIRMATION_TIMEOUT = 10_000

function qualityOf(item: HTMLElement | undefined): number | undefined {
  const value = item?.dataset.value
  if (!value || !/^\d+$/.test(value))
    return
  const quality = Number(value)
  return Number.isSafeInteger(quality) ? quality : undefined
}

function unavailable(item: HTMLElement) {
  return item.matches('[disabled], [aria-disabled="true"], .disabled, .bpx-state-disabled')
    || /试看|試看|trial/i.test(item.textContent ?? '')
}

/**
 * Player DOM owns discovery; only a trusted selection followed by media
 * readiness may change the saved preference. Menu reconstruction is not a
 * navigation and cannot reset the per-manuscript restoration attempts.
 */
export function setupVideoQualityMemory() {
  const route = useRouteState()
  let context = ''
  let preference = settings.value.savedVideoQuality
  let menu: HTMLElement | null = null
  let stopStructure: (() => void) | undefined
  let stateObserver: MutationObserver | undefined
  let frame: number | undefined
  let confirmationTimer: ReturnType<typeof setTimeout> | undefined
  let pending: { quality: number, context: string, mediaReady: boolean } | undefined
  const attempted = new Set<number>()
  let active = false
  let settledContext = ''
  let awaitingMedia = false

  function clearPending() {
    clearTimeout(confirmationTimer)
    confirmationTimer = undefined
    pending = undefined
    document.removeEventListener('timeupdate', checkPendingQuality, true)
  }
  function currentContext() {
    const target = parsePlaybackTabUrl(route.href)
    if (!target)
      return ''
    const video = getVideoElement()
    const episode = 'seasonId' in target && video instanceof HTMLVideoElement ? readNativePlaybackEpisodeId(video) : undefined
    return `${getPlaybackNavigationKey(route.href)}:${episode ?? ''}`
  }
  function isTrial(root: HTMLElement) {
    if (root.matches('.bpx-state-trial, [data-trial="true"], [data-is-preview="true"]'))
      return true
    return Array.from(root.querySelectorAll<HTMLElement>('[class*="trial"], [class*="try-watch"]'))
      .some(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && /试看|試看|trial/i.test(element.textContent ?? ''))
  }
  function sync() {
    frame = undefined
    if (!active)
      return
    const nextContext = currentContext()
    if (nextContext !== context) {
      awaitingMedia = Boolean(context && nextContext && settledContext !== nextContext)
      context = nextContext
      clearPending()
      attempted.clear()
    }
    const root = getPlayerRoot()
    const nextMenu = root?.querySelector<HTMLElement>(QUALITY_MENU) ?? null
    if (menu !== nextMenu) {
      stateObserver?.disconnect()
      menu = nextMenu
      if (menu) {
        stateObserver ??= new MutationObserver(schedule)
        stateObserver.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-value', 'disabled', 'aria-disabled'] })
      }
    }
    const video = getVideoElement()
    if (!context || awaitingMedia || !root || !menu || !(video instanceof HTMLMediaElement) || !video.isConnected || video.readyState < 1
      || isNativeVideoComponentReady(video) === false || isTrial(root)) {
      return
    }
    const items = Array.from(menu.querySelectorAll<HTMLElement>(QUALITY_ITEM))
    const selected = items.find(item => item.classList.contains('bpx-state-active'))
    const current = qualityOf(selected)
    if (current === undefined || (selected && unavailable(selected)))
      return
    const native = readNativeQualityState(video)
    if (native?.ready === false || native?.preview) {
      clearPending()
      return
    }
    if (pending) {
      const confirmed = native?.ready
        ? native.quality === pending.quality && (pending.quality === 0 || native.actualQuality === pending.quality)
        : pending.mediaReady
      if (pending.context === context && pending.quality === current && confirmed) {
        settings.value.savedVideoQuality = current
        preference = current
        attempted.add(current)
        clearPending()
      }
      return
    }
    const saved = settings.value.savedVideoQuality
    if (saved === null) {
      if (native?.ready && (native.quality !== current || (current !== 0 && native.actualQuality !== current)))
        return
      settings.value.savedVideoQuality = current
      preference = current
      return
    }
    if (saved === current || attempted.has(saved))
      return
    const target = items.find(item => qualityOf(item) === saved)
    if (!target || unavailable(target))
      return
    attempted.add(saved)
    target.click()
  }
  function schedule() {
    if (active && frame === undefined)
      frame = requestAnimationFrame(sync)
  }
  function selection(event: MouseEvent) {
    if (!event.isTrusted || !(event.target instanceof Element))
      return
    const item = event.target.closest<HTMLElement>(QUALITY_ITEM)
    const root = getPlayerRoot()
    if (!item && root?.contains(event.target) && /试看|試看|trial/i.test(event.target.textContent?.slice(0, 100) ?? '')) {
      clearPending()
      return
    }
    const nextContext = currentContext()
    if (!item || !root?.contains(item) || !nextContext || unavailable(item) || isTrial(root))
      return
    const video = getVideoElement()
    const native = video ? readNativeQualityState(video) : undefined
    if (native?.ready === false || native?.preview) {
      clearPending()
      return
    }
    const quality = qualityOf(item)
    if (quality === undefined)
      return
    if (nextContext !== context) {
      context = nextContext
      attempted.clear()
    }
    clearPending()
    if (settings.value.savedVideoQuality === null) {
      const selected = root.querySelector<HTMLElement>(`${QUALITY_ITEM}.bpx-state-active`) ?? undefined
      const current = qualityOf(selected)
      if (current !== undefined && (!native?.ready || (native.quality === current && (current === 0 || native.actualQuality === current)))) {
        settings.value.savedVideoQuality = current
        preference = current
      }
    }
    if (settings.value.savedVideoQuality !== null)
      attempted.add(settings.value.savedVideoQuality)
    pending = { quality, context, mediaReady: item.classList.contains('bpx-state-active') }
    document.addEventListener('timeupdate', checkPendingQuality, true)
    confirmationTimer = setTimeout(() => {
      clearPending()
      // An unconfirmed choice must not provoke another restoration/prompt.
    }, CONFIRMATION_TIMEOUT)
    schedule()
  }
  function mediaReady(event: Event) {
    if (event.target !== getVideoElement())
      return
    settledContext = currentContext()
    awaitingMedia = false
    if (pending && pending.context === currentContext())
      pending.mediaReady = true
    schedule()
  }
  function checkPendingQuality(event: Event) {
    if (pending && event.target === getVideoElement())
      schedule()
  }
  function stop() {
    active = false
    clearPending()
    stopStructure?.()
    stopStructure = undefined
    stateObserver?.disconnect()
    stateObserver = undefined
    menu = null
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
    document.removeEventListener('click', selection, true)
    for (const name of ['loadeddata', 'playing'])
      document.removeEventListener(name, mediaReady, true)
  }
  const stopWatch = watch([() => settings.value.rememberVideoQuality, () => route.navigationId, () => settings.value.savedVideoQuality], () => {
    if (!settings.value.rememberVideoQuality || !currentContext()) {
      stop()
      context = ''
      attempted.clear()
      return
    }
    if (preference !== settings.value.savedVideoQuality) {
      preference = settings.value.savedVideoQuality
      clearPending()
      attempted.clear()
    }
    if (!active) {
      active = true
      document.addEventListener('click', selection, true)
      for (const name of ['loadeddata', 'playing'])
        document.addEventListener(name, mediaReady, true)
      stopStructure = observePlayerDom((records) => {
        if (hasPlayerMediaMutation(records) || (menu && !menu.isConnected) || records?.some(record => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
          .some(node => node instanceof Element && (node.matches(QUALITY_MENU) || node.querySelector(QUALITY_MENU))))) {
          schedule()
        }
      })
    }
    schedule()
  }, { immediate: true })
  return () => {
    stopWatch()
    stop()
    attempted.clear()
  }
}
