import type { LocalLoudnessConfig } from '~/utils/localLoudnessProtocol'
import { LOCAL_LOUDNESS_BIND, LOCAL_LOUDNESS_BIND_REQUEST, LOCAL_LOUDNESS_DEFAULTS, LOCAL_LOUDNESS_PANEL, LOCAL_LOUDNESS_STATE } from '~/utils/localLoudnessProtocol'
import type { PageSettingsPayload } from '~/utils/pageSettingsProtocol'
import { isPgcPlaybackPage, parseVideoMetadataEvent, parseVideoPageIdentity } from '~/utils/videoMetadataBridge'

import { getNativePlayer } from '../videoMetadata'
import { createLocalLoudnessController } from './localLoudness'
import { trackMediaSourceOwnership } from './mediaSourceOwnership'

/** Reuses the page-settings channel and the existing player's public identity. */
export function setupLocalLoudnessBridge(channelId: string) {
  const lifetime = new AbortController()
  let enabled = false
  let config: LocalLoudnessConfig = { ...LOCAL_LOUDNESS_DEFAULTS }
  let activeToken = ''
  let controller: ReturnType<typeof createLocalLoudnessController> | undefined
  // Before first opt-in, only these weak records and the existing bridge remain.
  const ownership = trackMediaSourceOwnership(media => controller?.handleConflict(media))
  const report: Parameters<typeof createLocalLoudnessController>[0] = (token, state, measurement) => {
    window.dispatchEvent(new CustomEvent(LOCAL_LOUDNESS_STATE, { detail: JSON.stringify({ channelId, token: token || activeToken, href: location.href, state, measurement }) }))
  }
  document.addEventListener(LOCAL_LOUDNESS_BIND, (event) => {
    const data = parseVideoMetadataEvent(event)
    if (data?.channelId !== channelId || data.href !== location.href || typeof data.token !== 'string' || data.token.length > 100)
      return
    if (data.clear === true) {
      if (activeToken !== data.token)
        return
      controller?.bind(undefined, activeToken)
      activeToken = ''
      return
    }
    if (!enabled || !(event.target instanceof HTMLVideoElement) || !event.target.isConnected)
      return
    try {
      const player = getNativePlayer()
      if (player?.mediaElement?.() !== event.target)
        return
      const manifest = player.getManifest?.()
      const route = parseVideoPageIdentity(location.href)
      const url = new URL(location.href)
      const episode = /^\/bangumi\/play\/(ep|ss)(\d+)/.exec(url.pathname)
      if (!manifest || (route
        ? (route.aid ? route.aid !== manifest.aid : route.bvid !== manifest.bvid)
        || (Number.isSafeInteger(manifest.p) && manifest.p !== Number(url.searchParams.get('p') || 1))
        : !isPgcPlaybackPage() || !episode || Number(episode[2]) !== manifest[episode[1] === 'ep' ? 'episodeId' : 'seasonId'])) {
        return
      }
      activeToken = data.token
      if (!controller) {
        controller = createLocalLoudnessController(report, ownership)
        controller.update(config)
      }
      controller.bind(event.target, activeToken)
    }
    catch { /* Native ownership unavailable: leave its audio untouched. */ }
  }, { capture: true, signal: lifetime.signal })
  window.addEventListener(LOCAL_LOUDNESS_PANEL, (event) => {
    const data = parseVideoMetadataEvent(event)
    if (data?.channelId === channelId && data.token === activeToken && data.href === location.href && typeof data.visible === 'boolean')
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
      enabled = settings.localLoudnessEnabled
      config = { enabled, target: settings.localLoudnessTarget, strength: settings.localLoudnessStrength }
      controller?.update(config)
      if (enabled)
        window.dispatchEvent(new CustomEvent(LOCAL_LOUDNESS_BIND_REQUEST, { detail: JSON.stringify({ channelId, href: location.href }) }))
    },
  }
}
