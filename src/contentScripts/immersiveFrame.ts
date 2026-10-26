import { onRouteChange } from '~/composables/useRouteState'
import { BEWLY_WIDESCREEN_MANUAL_TOGGLE, IFRAME_PLAYER_CONTEXT } from '~/constants/globalEvents'
import type { ImmersiveConfig } from '~/constants/immersive'
import { IMMERSIVE_CONFIG, IMMERSIVE_EVENT, IMMERSIVE_RECOMMENDATIONS } from '~/constants/immersive'
import { isBewlyPlaybackLayoutReady } from '~/utils/bewlyWidescreen'
import { hasIframeEscapePriorityState, isBrowserFullscreenActive } from '~/utils/escapePriority'
import { isIframeDocumentActive, isImmersiveFrame, setIframeDocumentActive } from '~/utils/iframeActivity'
import type { createIframeDocumentClient, IframeDocumentBinding } from '~/utils/iframeDocument'
import { getParentMessageData } from '~/utils/iframeMessage'
import type { ImmersiveRailWindow } from '~/utils/immersivePlayback'
import { immersiveRail } from '~/utils/immersivePlayback'
import { IMMERSIVE_WINDOW_SIZE, isImmersiveInput } from '~/utils/immersiveRecommendation'
import { getPlaybackNavigationKey, parsePlaybackTabUrl } from '~/utils/playbackTab'
import { createImmersiveEndPlaybackPolicy } from '~/utils/player'
import { getPlayerModeContainer, getPlayerRoot, getVideoElement, isPlayerAdvertisement } from '~/utils/playerMedia'
import type { NativePlaybackUnit } from '~/utils/videoMetadataBridge'
import { getNativePlaybackUnitKey, readNativeMediaSnapshot, readNativeQualityState, readVideoPageMetadata, VIDEO_COMPONENT_CHANGED, VIDEO_METADATA_CHANGED } from '~/utils/videoMetadataBridge'
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
  let playRetries = 0
  let playbackStarted = false
  let unit: NativePlaybackUnit | undefined
  let unitKey = ''
  let boundary = false
  let endOwned = false
  let state = 'requesting'
  let endPolicy: ReturnType<typeof createImmersiveEndPlaybackPolicy> | undefined
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
  function releaseMediaBinding(reset: boolean) {
    generation++
    mediaCleanup?.()
    mediaCleanup = undefined
    if (reset) {
      media = null
      source = navigation = ''
      unit = undefined
      unitKey = ''
      playAttempted = playbackStarted = endedReported = false
      playRetries = 0
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
      endPolicy?.dispose()
      endPolicy = undefined
      immersiveRail.value = null
      window.removeEventListener(VIDEO_COMPONENT_CHANGED, sync)
      window.removeEventListener(VIDEO_METADATA_CHANGED, sync)
      window.removeEventListener(IFRAME_PLAYER_CONTEXT, status)
    }
    setIframeDocumentActive(active)
    if (wasActive !== active)
      activityChanged(active)
    if (active) {
      endPolicy ??= createImmersiveEndPlaybackPolicy()
      if (!stopDom) {
        stopDom = observePlayerDom((records) => {
          if (!records || hasPlayerMediaMutation(records) || records.some(record => record.target instanceof Element && record.target.closest('.auto-play, .continuous-btn, .bpx-player-ctrl-setting')))
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
    const value = JSON.stringify([navigation, layoutReady, playing, state])
    if (value !== lastStatus) {
      lastStatus = value
      send('status', { layoutReady, playing, state })
    }
  }
  function tryPlay() {
    if (config?.active && config.autoPlay && unit && media?.readyState && !playAttempted && !playbackStarted) {
      playAttempted = true
      state = 'requesting'
      const video = media
      const attemptedUnit = unitKey
      const attemptedPlayback = config.playbackId
      void video.play().catch((error: unknown) => {
        if (media !== video || unitKey !== attemptedUnit || config?.playbackId !== attemptedPlayback || !config?.active || playbackStarted)
          return
        const name = error instanceof DOMException ? error.name : ''
        state = name === 'NotAllowedError' ? 'gesture' : name === 'AbortError' ? 'buffering' : 'error'
        // Only a later native readiness event may retry an interrupted initial
        // request. A denied gesture and an already played unit never autoplay.
        if (name === 'AbortError' && playRetries++ < 1)
          playAttempted = false
        status()
      })
    }
  }
  function ended() {
    const video = media
    const version = generation
    const endVersion = endGeneration
    const key = config?.key
    const playbackId = config?.playbackId
    const endedUnit = unitKey
    const isCurrent = () => !disposed && config?.active && config.autoNext && config.key === key && config.playbackId === playbackId
      && generation === version && endGeneration === endVersion && video === media && video === getVideoElement()
      && navigation === getPlaybackNavigationKey(location.href) && source === (video?.currentSrc || video?.getAttribute('src') || '')
      && video?.ended && !video.seeking && !video.error && unitKey === endedUnit
    const quality = video ? readNativeQualityState(video) : undefined
    if (!isCurrent() || !playbackStarted || endedReported || !video || isPlayerAdvertisement(video)
      || !unit || !quality?.ready || quality.preview || !Number.isFinite(video.duration) || video.currentTime < video.duration - 0.5) {
      return
    }
    const snapshot = readNativeMediaSnapshot(video)
    if (!snapshot?.unit || getNativePlaybackUnitKey(snapshot.unit) !== endedUnit)
      return
    if (boundary && endOwned && endPolicy?.allowsAdvance() && isCurrent()) {
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
    const snapshot = next ? readNativeMediaSnapshot(next) : undefined
    const nextUnit = snapshot?.unit
    const nextUnitKey = nextUnit ? getNativePlaybackUnitKey(nextUnit) : ''
    const navigationChanged = nextNavigation !== navigation
    const mediaChanged = next !== media
    const unitChanged = !!nextUnitKey && nextUnitKey !== unitKey
    if (mediaChanged || navigationChanged || unitChanged || nextSource !== source || (next && !mediaCleanup)) {
      generation++
      mediaCleanup?.()
      media = next
      navigation = nextNavigation
      source = nextSource
      if (unitChanged) {
        unit = nextUnit
        unitKey = nextUnitKey
        playAttempted = playbackStarted = endedReported = false
        playRetries = 0
        state = 'requesting'
        const expected = parsePlaybackTabUrl(config.targetUrl)
        const sameTarget = expected && (('bvid' in expected && expected.bvid === unit?.bvid)
          || ('aid' in expected && expected.aid === unit?.aid)
          || ('epid' in expected && expected.epid === unit?.episodeId)
          || ('seasonId' in expected && expected.seasonId === unit?.seasonId))
        send('navigation', { href: sameTarget ? '' : location.href })
      }
      playbackStarted ||= !!nextUnit && !!next && !next.paused && !next.ended
      if (media) {
        const current = media
        const version = generation
        const update = (event: Event) => {
          if (media === current && generation === version) {
            if (event.type === 'playing') {
              playbackStarted = true
              state = 'playing'
            }
            else if (event.type === 'error' && current.error) {
              state = 'error'
            }
            else if (['waiting', 'stalled', 'emptied'].includes(event.type)) {
              state = 'buffering'
            }
            else if (event.type === 'pause' && !current.ended) {
              // Paused is an observed state, not a user-intent latch: BTR may
              // pause internally and owns its subsequent recovery.
              state = current.readyState < 3 ? 'buffering' : 'paused'
            }
            sync()
          }
        }
        const onEnded = (event: Event) => {
          if (event.target === current && media === current && generation === version)
            void ended()
        }
        const events = ['loadedmetadata', 'canplay', 'emptied', 'playing', 'pause', 'waiting', 'stalled', 'error'] as const
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
    // An EP is one episode; an SS entry resolves to its current episode, never
    // an inferred season end based on a possibly partial section response.
    const metadata = nextUnit && !nextUnit.episodeId ? readVideoPageMetadata() : null
    boundary = !!nextUnit && (!!nextUnit.episodeId || (!!metadata && nextUnit.page === metadata.pageCount))
    endOwned = !!nextUnit && endPolicy?.sync(boundary, !!metadata && metadata.pageCount > 1) === true
    if (nextUnit)
      tryPlay()
    else if (!playbackStarted)
      state = 'unknown'
    status()
  }
  function receive(event: MessageEvent) {
    const data = getParentMessageData(event, [IMMERSIVE_CONFIG, IMMERSIVE_RECOMMENDATIONS])
    if (data?.type === IMMERSIVE_RECOMMENDATIONS) {
      const value = data.window as ImmersiveRailWindow | undefined
      if (!config?.active || !client.matches(data) || data.key !== config.key || data.playbackId !== config.playbackId
        || !value || !Number.isSafeInteger(value.revision) || (immersiveRail.value && value.revision < immersiveRail.value.window.revision)
        || !Array.isArray(value.items) || value.items.length > IMMERSIVE_WINDOW_SIZE
        || !value.items.every(item => typeof item?.uniqueId === 'string' && typeof item.displayData?.title === 'string' && typeof item.displayData.cover === 'string')
        || !['loading', 'hasMore', 'failed'].every(key => typeof (value as unknown as Record<string, unknown>)[key] === 'boolean')) {
        return
      }
      immersiveRail.value = { window: value, visible: config.uiVisible, action: (action, selectedKey) => send(action, { selectedKey, revision: value.revision }) }
      return
    }
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
    if (immersiveRail.value)
      immersiveRail.value = { ...immersiveRail.value, visible: config.uiVisible }
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
