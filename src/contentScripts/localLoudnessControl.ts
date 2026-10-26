import { watch } from 'vue'

import { audioDelayMs, localLoudnessPanelOpen, localLoudnessState, notifyLocalLoudnessPanel, observeLocalLoudnessState, setAudioDelay, setLocalAudioConfiguration, setLocalLoudnessMediaToken } from '~/composables/useLocalLoudness'
import { bindPlayerAdjustment, observePlayerAdjustment } from '~/composables/usePlayerAdjustment'
import { onRouteChange } from '~/composables/useRouteState'
import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { LOCAL_LOUDNESS_BIND, LOCAL_LOUDNESS_BIND_REQUEST } from '~/utils/localLoudnessProtocol'
import { isVideoPlaybackPage } from '~/utils/main'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'
import { getPlayerRoot, getVideoElement } from '~/utils/playerMedia'
import { getNativePlaybackUnitKey, parseVideoMetadataEvent, readNativeMediaSnapshot, VIDEO_COMPONENT_CHANGED, VIDEO_METADATA_CHANGED } from '~/utils/videoMetadataBridge'

import { registerPlayerControlFit } from './playerControlFit'
import { createPlayerControlTooltip, updatePlayerControlTooltip } from './playerControlTooltip'
import { hasPlayerMediaMutation, observePlayerDom } from './playerDomLifecycle'

export function setupLocalLoudnessControl() {
  let stopPlayer: (() => void) | undefined
  let events: AbortController | undefined
  let fit: ReturnType<typeof registerPlayerControlFit> | undefined
  let button: HTMLElement | undefined
  let media: HTMLVideoElement | null = null
  let token = ''
  let unit = ''
  let configuration = 0
  const stopState = observeLocalLoudnessState()
  const stopAdjustment = observePlayerAdjustment()
  const label = () => String(i18n.global.t(settings.value.playerAdjustmentEnabled ? 'player_adjustment.title' : 'local_loudness.title', settings.value.language))
  function bind(clear = false) {
    const channelId = getPageBridgeChannelId()
    if (!channelId || !token)
      return
    const target = clear ? document : media
    target?.dispatchEvent(new CustomEvent(LOCAL_LOUDNESS_BIND, { bubbles: true, detail: JSON.stringify({ channelId, token, unit, href: location.href, configuration, clear }) }))
    if (!clear && audioDelayMs.value)
      setAudioDelay(audioDelayMs.value)
    notifyLocalLoudnessPanel()
  }
  function removeButton() {
    fit?.dispose()
    fit = undefined
    button?.remove()
    button = undefined
  }
  function open(trigger: HTMLElement) {
    trigger.focus({ preventScroll: true })
    localLoudnessPanelOpen.value = true
  }
  function sync(records?: MutationRecord[]) {
    if ((!settings.value.localLoudnessEnabled && !settings.value.playerAdjustmentEnabled) || !isVideoPlaybackPage(location.href))
      return
    if (records && button?.isConnected && media?.isConnected && !hasPlayerMediaMutation(records))
      return
    const video = getVideoElement()
    const snapshot = video instanceof HTMLVideoElement ? readNativeMediaSnapshot(video) : undefined
    const nextUnit = snapshot?.unit ? getNativePlaybackUnitKey(snapshot.unit) : ''
    bindPlayerAdjustment(video instanceof HTMLVideoElement ? video : null, nextUnit, settings.value.playerAdjustmentEnabled)
    if (nextUnit && (media !== video || unit !== nextUnit)) {
      bind(true)
      media = video instanceof HTMLVideoElement ? video : null
      unit = nextUnit
      token = media ? crypto.randomUUID() : ''
      setLocalLoudnessMediaToken(token)
    }
    if (nextUnit)
      bind()
    if (!media)
      localLoudnessState.value = video ? 'unsupported' : 'waiting'
    const bar = getPlayerRoot()?.querySelector('.bpx-player-control-bottom-right')
    if (!settings.value.showPlayerAdjustmentButton) {
      removeButton()
      return
    }
    if (button?.parentElement === bar)
      return
    removeButton()
    if (!bar)
      return
    button = document.createElement('div')
    button.className = 'bpx-player-ctrl-btn bewly-local-loudness-control'
    button.setAttribute('role', 'button')
    button.tabIndex = 0
    button.setAttribute('aria-label', label())
    button.setAttribute('aria-haspopup', 'dialog')
    button.innerHTML = '<div class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon"><svg viewBox="0 0 88 88" aria-hidden="true"><path d="M24 36v16m10-27v38m10-47v56m10-47v38m10-27v16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg></span></div>'
    button.append(createPlayerControlTooltip(label()))
    button.addEventListener('click', () => open(button!))
    button.addEventListener('keydown', (event) => {
      if (!event.isComposing && !event.repeat && ['Enter', ' '].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        open(button!)
      }
    })
    bar.prepend(button)
    fit = registerPlayerControlFit(button, { priority: 40, label, activate: open })
  }
  function clear() {
    stopPlayer?.()
    stopPlayer = undefined
    events?.abort()
    events = undefined
    removeButton()
    bind(true)
    media = null
    token = ''
    setLocalLoudnessMediaToken('')
  }
  function update() {
    if ((!settings.value.localLoudnessEnabled && !settings.value.playerAdjustmentEnabled) || !isVideoPlaybackPage(location.href)) {
      localLoudnessPanelOpen.value = false
      bindPlayerAdjustment(null, '', false)
      clear()
      return
    }
    if (events) {
      sync()
      return
    }
    events = new AbortController()
    window.addEventListener(LOCAL_LOUDNESS_BIND_REQUEST, (event) => {
      const data = parseVideoMetadataEvent(event)
      if (data && data.channelId === getPageBridgeChannelId() && data.href === location.href && Number.isSafeInteger(data.configuration)) {
        configuration = Number(data.configuration)
        setLocalAudioConfiguration(configuration)
        sync()
      }
    }, { signal: events.signal })
    for (const name of ['loadedmetadata', 'loadeddata', 'play'])
      document.addEventListener(name, () => sync(), { capture: true, signal: events.signal })
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden)
        sync()
    }, { signal: events.signal })
    stopPlayer = observePlayerDom(sync)
    window.addEventListener(VIDEO_COMPONENT_CHANGED, () => sync(), { signal: events.signal })
    window.addEventListener(VIDEO_METADATA_CHANGED, () => sync(), { signal: events.signal })
  }
  const stopSettings = watch(() => [settings.value.localLoudnessEnabled, settings.value.playerAdjustmentEnabled, settings.value.showPlayerAdjustmentButton], update, { immediate: true, flush: 'post' })
  const stopRoute = onRouteChange(() => {
    localLoudnessPanelOpen.value = false
    update()
  })
  const stopLanguage = watch(() => settings.value.language, () => {
    if (button) {
      button.setAttribute('aria-label', label())
      updatePlayerControlTooltip(button, label())
      fit?.refresh()
    }
  })
  const stopPanel = watch(localLoudnessPanelOpen, notifyLocalLoudnessPanel)
  return () => {
    stopSettings()
    stopRoute()
    stopLanguage()
    stopPanel()
    localLoudnessPanelOpen.value = false
    clear()
    stopState()
    stopAdjustment()
  }
}
