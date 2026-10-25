import { onRouteChange } from '~/composables/useRouteState'
import { BEWLY_WIDESCREEN_MANUAL_TOGGLE, IFRAME_PLAYER_CONTEXT } from '~/constants/globalEvents'
import type { ImmersiveConfig } from '~/constants/immersive'
import { IMMERSIVE_CONFIG, IMMERSIVE_EVENT, IMMERSIVE_MAIN_ACTIVITY } from '~/constants/immersive'
import { isBewlyPlaybackLayoutReady } from '~/utils/bewlyWidescreen'
import { hasIframeEscapePriorityState, isBrowserFullscreenActive } from '~/utils/escapePriority'
import { isIframeDocumentActive, isImmersiveFrame, setIframeDocumentActive } from '~/utils/iframeActivity'
import type { createIframeDocumentClient, IframeDocumentBinding } from '~/utils/iframeDocument'
import { getParentMessageData } from '~/utils/iframeMessage'
import { isImmersiveInput } from '~/utils/immersiveRecommendation'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'
import { resolvePgcEpisodeVideoIds } from '~/utils/pgcEpisode'
import { getPlaybackNavigationKey, parsePlaybackTabUrl } from '~/utils/playbackTab'
import { getPlayerModeContainer, getPlayerRoot, getVideoElement, isPlayerAdvertisement } from '~/utils/playerMedia'
import { isNativeVideoComponentReady, readNativePlaybackEpisodeId, readNativeQualityState, readVideoPageMetadata, VIDEO_COMPONENT_CHANGED, VIDEO_METADATA_CHANGED } from '~/utils/videoMetadataBridge'
import { createWheelStepper } from '~/utils/wheelStep'

import { hasPlayerMediaMutation, observePlayerDom } from './playerDomLifecycle'

export function setupImmersiveFrame(client: ReturnType<typeof createIframeDocumentClient>, activityChanged: (active: boolean) => void) {
  if (!isImmersiveFrame())
    return () => {}
  let config: (ImmersiveConfig & IframeDocumentBinding) | undefined
  let media: HTMLVideoElement | null = null
  let player: HTMLElement | null = null
  let mediaCleanup: (() => void) | undefined
  let playerCleanup: (() => void) | undefined
  let navigation = ''
  let source = ''
  let generation = 0
  let endGeneration = 0
  let playAttempted = false
  let playbackStarted = false
  let endedReported = false
  let lastStatus = ''
  let disposed = false
  let stopDom: (() => void) | undefined
  let stopRoute: (() => void) | undefined
  const headerClass = 'remove-top-bar-without-placeholder'
  const hadHeaderClass = document.documentElement.classList.contains(headerClass)
  document.documentElement.classList.add(headerClass)
  function send(action: string, extra: Record<string, unknown> = {}) {
    if (config?.active && !disposed)
      client.send({ type: IMMERSIVE_EVENT, key: config.key, playbackId: config.playbackId, action, navigation, ...extra })
  }
  function releaseMediaBinding(pause: boolean) {
    generation++
    mediaCleanup?.()
    mediaCleanup = undefined
    if (pause) {
      media?.pause()
      media = null
      source = navigation = ''
      playAttempted = playbackStarted = endedReported = false
    }
  }
  function gate(active: boolean) {
    const wasActive = isIframeDocumentActive()
    if (!active) {
      stopDom?.()
      stopDom = undefined
      stopRoute?.()
      stopRoute = undefined
      releaseMediaBinding(true)
      playerCleanup?.()
      playerCleanup = undefined
      player = null
      window.removeEventListener(VIDEO_COMPONENT_CHANGED, sync)
      window.removeEventListener(VIDEO_METADATA_CHANGED, sync)
      window.removeEventListener(IFRAME_PLAYER_CONTEXT, status)
    }
    const channelId = getPageBridgeChannelId()
    if (channelId)
      window.dispatchEvent(new CustomEvent(IMMERSIVE_MAIN_ACTIVITY, { detail: JSON.stringify({ channelId, href: location.href, active, autoPlay: config?.autoPlay === true }) }))
    setIframeDocumentActive(active)
    if (wasActive !== active)
      activityChanged(active)
    if (active) {
      if (!stopDom) {
        stopDom = observePlayerDom((records) => {
          if (!records || hasPlayerMediaMutation(records))
            sync()
        })
        stopRoute = onRouteChange(sync)
        window.addEventListener(VIDEO_COMPONENT_CHANGED, sync)
        window.addEventListener(VIDEO_METADATA_CHANGED, sync)
        window.addEventListener(IFRAME_PLAYER_CONTEXT, status)
      }
      else {
        sync()
      }
    }
  }
  function status() {
    if (disposed || !config?.active || !config.uiVisible || document.hidden || !isIframeDocumentActive())
      return
    const layoutReady = isBewlyPlaybackLayoutReady()
    const playing = !!media && !media.paused && !media.ended
    const value = JSON.stringify([navigation, layoutReady, playing])
    if (value !== lastStatus) {
      lastStatus = value
      send('status', { layoutReady, playing })
    }
  }
  function tryPlay() {
    const expected = config ? parsePlaybackTabUrl(config.targetUrl) : undefined
    const metadata = media && isNativeVideoComponentReady(media) === true ? readVideoPageMetadata() : null
    if (config?.active && expected && metadata
      && (('bvid' in expected && expected.bvid !== metadata.bvid) || ('aid' in expected && expected.aid !== metadata.aid))) {
      media?.pause()
      if (!endedReported) {
        endedReported = true
        send('close')
      }
      return
    }
    if (config?.active && config.autoPlay && media?.readyState && !playAttempted
      && isNativeVideoComponentReady(media) === true) {
      playAttempted = true
      void media.play().catch(() => status())
    }
  }
  async function ended() {
    const video = media
    const version = generation
    const endVersion = endGeneration
    const key = config?.key
    const playbackId = config?.playbackId
    const isCurrent = () => !disposed && config?.active && config.autoNext && config.key === key && config.playbackId === playbackId
      && generation === version && endGeneration === endVersion && video === media && video === getVideoElement()
      && navigation === getPlaybackNavigationKey(location.href) && source === (video?.currentSrc || video?.getAttribute('src') || '')
      && video?.ended
    const quality = video ? readNativeQualityState(video) : undefined
    if (!isCurrent() || !playbackStarted || endedReported || !video || isPlayerAdvertisement(video)
      || isNativeVideoComponentReady(video) !== true || (quality?.ready && quality.preview)) {
      return
    }
    const target = parsePlaybackTabUrl(location.href)
    let atEnd = false
    if (target && ('bvid' in target || 'aid' in target)) {
      const metadata = readVideoPageMetadata()
      atEnd = !!metadata && Number(new URL(location.href).searchParams.get('p') || 1) >= metadata.pageCount
    }
    else if (target && ('epid' in target || 'seasonId' in target)) {
      const episode = readNativePlaybackEpisodeId(video)
      const ids = episode ? await resolvePgcEpisodeVideoIds(episode) : undefined
      atEnd = ids?.hasNextEpisode === false
    }
    if (atEnd && isCurrent()) {
      endedReported = true
      send('ended')
    }
  }
  const stepper = createWheelStepper({ oncePerGesture: true })
  function keyboard(event: KeyboardEvent) {
    if (!config?.active || !config.uiVisible || isImmersiveInput(event))
      return
    if (event.key === 'Escape') {
      if (hasIframeEscapePriorityState({ documentRoot: document }) || getPlayerModeContainer()?.getAttribute('data-screen') === 'web'
        || getPlayerRoot()?.getAttribute('data-bewly-display-mode') === 'fill') {
        return
      }
      if (!event.repeat)
        send('close', { input: 'keyboard' })
    }
    else if (config.keyboard && ['ArrowUp', 'PageUp', 'w', 'W', 'ArrowDown', 'PageDown', 's', 'S'].includes(event.key)) {
      if (isBrowserFullscreenActive())
        return
      if (!event.repeat)
        send(['ArrowUp', 'PageUp', 'w', 'W'].includes(event.key) ? 'previous' : 'next', { input: 'keyboard' })
    }
    else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }
  function wheel(event: WheelEvent) {
    if (!config?.active || !config.uiVisible || !config.wheel || isBrowserFullscreenActive() || isImmersiveInput(event)
      || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)
      || !(event.target instanceof Element) || !event.target.closest('.bpx-player-video-area, .bpx-player-video-wrap, .bpx-player-dm-wrap, .bilibili-player-video-wrap')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const direction = stepper.step(event.deltaY, event.deltaMode, event.timeStamp)
    if (direction) {
      send(direction > 0 ? 'next' : 'previous', { input: 'wheel' })
    }
  }
  function sync() {
    if (disposed || !config?.active || !isIframeDocumentActive())
      return
    const next = getVideoElement()
    const nextNavigation = getPlaybackNavigationKey(location.href)
    const nextSource = next?.currentSrc || next?.getAttribute('src') || ''
    const navigationChanged = nextNavigation !== navigation
    const mediaChanged = next !== media
    if (mediaChanged || navigationChanged || nextSource !== source || (next && !mediaCleanup)) {
      generation++
      mediaCleanup?.()
      if (media && media !== next)
        media.pause()
      media = next
      navigation = nextNavigation
      source = nextSource
      if (navigationChanged) {
        playAttempted = playbackStarted = endedReported = false
      }
      else if (mediaChanged) {
        playbackStarted = false
      }
      playbackStarted ||= !!next && !next.paused && !next.ended && isNativeVideoComponentReady(next) === true
      if (media) {
        const current = media
        const version = generation
        const update = (event: Event) => {
          if (media === current && generation === version) {
            if (event.type === 'playing')
              playbackStarted = true
            sync()
          }
        }
        const onEnded = (event: Event) => {
          if (event.target === current && media === current && generation === version)
            void ended()
        }
        const events = ['loadedmetadata', 'emptied', 'playing', 'pause', 'error'] as const
        events.forEach(name => current.addEventListener(name, update))
        current.addEventListener('ended', onEnded)
        mediaCleanup = () => {
          events.forEach(name => current.removeEventListener(name, update))
          current.removeEventListener('ended', onEnded)
        }
      }
    }
    const nextPlayer = getPlayerRoot()
    if (nextPlayer !== player) {
      playerCleanup?.()
      player = nextPlayer
      if (player) {
        const current = player
        const tabIndex = current.getAttribute('tabindex')
        current.addEventListener('keydown', keyboard, true)
        current.addEventListener('wheel', wheel, { passive: false, capture: true })
        playerCleanup = () => {
          current.removeEventListener('keydown', keyboard, true)
          current.removeEventListener('wheel', wheel, true)
          if (tabIndex === null && current.getAttribute('tabindex') === '-1')
            current.removeAttribute('tabindex')
        }
      }
    }
    if (!config?.active)
      media?.pause()
    tryPlay()
    status()
  }
  function receive(event: MessageEvent) {
    const data = getParentMessageData(event, [IMMERSIVE_CONFIG])
    if (!data || !client.matches(data) || typeof data.key !== 'string' || typeof data.targetUrl !== 'string' || !parsePlaybackTabUrl(data.targetUrl)
      || !Number.isSafeInteger(data.playbackId) || Number(data.playbackId) < 0 || (config && Number(data.playbackId) < config.playbackId)
      || !['active', 'uiVisible', 'autoPlay', 'autoNext', 'keyboard', 'wheel'].every(key => typeof data[key] === 'boolean')) {
      return
    }
    const newSession = !!config && config.playbackId !== data.playbackId
    const activating = (!config?.active || newSession) && data.active === true
    if (newSession)
      gate(false)
    if (config?.autoNext && data.autoNext === false)
      endGeneration++
    config = data as unknown as ImmersiveConfig & IframeDocumentBinding
    lastStatus = ''
    gate(config.active)
    if (activating && config.uiVisible && player && !document.hidden) {
      if (!player.hasAttribute('tabindex'))
        player.tabIndex = -1
      player.focus({ preventScroll: true })
    }
  }
  const releaseBinding = client.subscribe((binding) => {
    if (binding && config?.sessionId === binding.sessionId && config.documentId === binding.documentId) {
      releaseMediaBinding(false)
      sync()
      return
    }
    config = undefined
    lastStatus = ''
    gate(false)
  })
  const visibility = () => {
    if (!document.hidden)
      status()
  }
  const suspend = () => gate(false)
  const close = (event: Event) => {
    if ((event as CustomEvent).detail?.action === 'exit')
      send('close')
  }
  window.addEventListener('message', receive)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener(BEWLY_WIDESCREEN_MANUAL_TOGGLE, close)
  window.addEventListener('pagehide', suspend)
  return () => {
    disposed = true
    gate(false)
    releaseBinding()
    window.removeEventListener('message', receive)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener(BEWLY_WIDESCREEN_MANUAL_TOGGLE, close)
    window.removeEventListener('pagehide', suspend)
    if (!hadHeaderClass)
      document.documentElement.classList.remove(headerClass)
  }
}
