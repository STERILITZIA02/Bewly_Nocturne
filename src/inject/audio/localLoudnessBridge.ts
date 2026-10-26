import { getBilibiliLogicalPathname } from '~/utils/bilibiliLocale'
import type { LocalLoudnessConfig } from '~/utils/localLoudnessProtocol'
import { LOCAL_AUDIO_DELAY, LOCAL_LOUDNESS_BIND, LOCAL_LOUDNESS_BIND_REQUEST, LOCAL_LOUDNESS_DEFAULTS, LOCAL_LOUDNESS_PANEL, LOCAL_LOUDNESS_STATE } from '~/utils/localLoudnessProtocol'
import type { PageSettingsPayload } from '~/utils/pageSettingsProtocol'
import { isPgcPlaybackPage, parseVideoMetadataEvent, parseVideoPageIdentity } from '~/utils/videoMetadataBridge'

import { getNativePlayer } from '../videoMetadata'
import { createLocalLoudnessController } from './localLoudness'
import { trackMediaSourceOwnership } from './mediaSourceOwnership'

/** Reuses the page-settings channel and the existing player's public identity. */
export function setupLocalLoudnessBridge(channelId: string) {
  const lifetime = new AbortController()
  let enabled = false
  let adjustments = false
  let configuration = 0
  let activeMedia: HTMLVideoElement | undefined
  let activeUnit = ''
  let config: LocalLoudnessConfig = { ...LOCAL_LOUDNESS_DEFAULTS }
  let activeToken = ''
  let controller: ReturnType<typeof createLocalLoudnessController> | undefined
  // Before first opt-in, only these weak records and the existing bridge remain.
  const ownership = trackMediaSourceOwnership(media => controller?.handleConflict(media))
  const report: Parameters<typeof createLocalLoudnessController>[0] = (token, state, measurement, delayState) => {
    window.dispatchEvent(new CustomEvent(LOCAL_LOUDNESS_STATE, { detail: JSON.stringify({ channelId, token: token || activeToken, href: location.href, configuration, state, measurement, delayState }) }))
  }
  function ensureController() {
    if (!controller) {
      controller = createLocalLoudnessController(report, ownership)
      controller.update(config)
    }
    return controller
  }
  document.addEventListener(LOCAL_LOUDNESS_BIND, (event) => {
    const data = parseVideoMetadataEvent(event)
    if (data?.channelId !== channelId || data.href !== location.href || typeof data.token !== 'string' || data.token.length > 100)
      return
    if (data.clear === true) {
      if (activeToken !== data.token || data.configuration !== configuration)
        return
      controller?.bind(undefined, activeToken)
      activeToken = ''
      activeMedia = undefined
      activeUnit = ''
      return
    }
    if (data.configuration !== configuration) {
      window.dispatchEvent(new CustomEvent(LOCAL_LOUDNESS_BIND_REQUEST, { detail: JSON.stringify({ channelId, href: location.href, configuration }) }))
      return
    }
    if ((!enabled && !adjustments) || !(event.target instanceof HTMLVideoElement) || !event.target.isConnected)
      return
    try {
      const player = getNativePlayer()
      if (player?.mediaElement?.() !== event.target)
        return
      const manifest = player.getManifest?.()
      const route = parseVideoPageIdentity(location.href)
      const url = new URL(location.href)
      const episode = /^\/bangumi\/play\/(ep|ss)(\d+)/.exec(getBilibiliLogicalPathname(url))
      if (!manifest || (route
        ? (route.aid ? route.aid !== manifest.aid : route.bvid !== manifest.bvid)
        || (Number.isSafeInteger(manifest.p) && manifest.p !== Number(url.searchParams.get('p') || 1))
        : !isPgcPlaybackPage() || !episode || Number(episode[2]) !== manifest[episode[1] === 'ep' ? 'episodeId' : 'seasonId'])) {
        return
      }
      if (data.unit !== `${manifest.aid}:${manifest.cid}:${manifest.episodeId ?? ''}`)
        return
      activeToken = data.token
      activeMedia = event.target
      activeUnit = `${manifest.aid}:${manifest.cid}:${manifest.episodeId ?? ''}`
      if (enabled)
        ensureController()
      controller?.bind(event.target, activeToken)
    }
    catch { /* Native ownership unavailable: leave its audio untouched. */ }
  }, { capture: true, signal: lifetime.signal })
  window.addEventListener(LOCAL_AUDIO_DELAY, (event) => {
    const data = parseVideoMetadataEvent(event)
    if (!adjustments || !activeToken || data?.channelId !== channelId || data.token !== activeToken || data.configuration !== configuration
      || data.href !== location.href || !Number.isSafeInteger(data.delay) || Number(data.delay) < 0 || Number(data.delay) > 1000) {
      return
    }
    try {
      const player = getNativePlayer()
      const manifest = player?.getManifest?.()
      if (player?.mediaElement?.() !== activeMedia || !manifest || `${manifest.aid}:${manifest.cid}:${manifest.episodeId ?? ''}` !== activeUnit)
        return
      if (Number(data.delay) > 0 && !controller)
        ensureController().bind(activeMedia, activeToken)
      controller?.setDelay(Number(data.delay))
    }
    catch { /* A retired native unit cannot accept a delayed panel command. */ }
  }, { signal: lifetime.signal })
  window.addEventListener(LOCAL_LOUDNESS_PANEL, (event) => {
    const data = parseVideoMetadataEvent(event)
    if (data?.channelId === channelId && data.token === activeToken && data.configuration === configuration && data.href === location.href && typeof data.visible === 'boolean')
      controller?.showPanel(data.visible)
  }, { signal: lifetime.signal })
  window.addEventListener('pagehide', (event) => {
    controller?.suspend(event.persisted)
    if (!event.persisted) {
      ownership.dispose()
      lifetime.abort()
    }
  }, { signal: lifetime.signal })
  window.addEventListener('pageshow', () => controller?.resume(), { signal: lifetime.signal })
  return {
    update(settings: PageSettingsPayload) {
      if (adjustments !== settings.playerAdjustmentEnabled) {
        adjustments = settings.playerAdjustmentEnabled
        configuration++
        if (!adjustments)
          controller?.setDelay(0)
      }
      enabled = settings.localLoudnessEnabled
      config = { enabled, target: settings.localLoudnessTarget, strength: settings.localLoudnessStrength }
      controller?.update(config)
      if (enabled || adjustments)
        window.dispatchEvent(new CustomEvent(LOCAL_LOUDNESS_BIND_REQUEST, { detail: JSON.stringify({ channelId, href: location.href, configuration }) }))
    },
  }
}
