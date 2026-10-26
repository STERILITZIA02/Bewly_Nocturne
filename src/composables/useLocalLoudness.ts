import { ref, shallowRef } from 'vue'

import type { LocalLoudnessMeasurement, LocalLoudnessState } from '~/utils/localLoudnessProtocol'
import { LOCAL_AUDIO_DELAY, LOCAL_LOUDNESS_PANEL, LOCAL_LOUDNESS_SAMPLE_LIMIT, LOCAL_LOUDNESS_STATE, LOCAL_LOUDNESS_STATES, readLocalLoudnessMeasurement } from '~/utils/localLoudnessProtocol'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'
import { parseVideoMetadataEvent } from '~/utils/videoMetadataBridge'

// Session-only UI; none of these refs enter settings or cloud storage.
export const localLoudnessPanelOpen = ref(false)
export const localLoudnessState = ref<LocalLoudnessState>('off')
export const localLoudnessSamples = shallowRef<LocalLoudnessMeasurement[]>([])
export const audioDelayMs = ref(0)
export const audioDelayState = ref<LocalLoudnessState>('off')
let mediaToken = ''
let configuration = 0

export function setLocalAudioConfiguration(value: number) {
  configuration = value
}

export function setAudioDelay(value: number) {
  audioDelayMs.value = Math.round(Math.max(0, Math.min(1000, value)))
  const channelId = getPageBridgeChannelId()
  if (channelId && mediaToken)
    window.dispatchEvent(new CustomEvent(LOCAL_AUDIO_DELAY, { detail: JSON.stringify({ channelId, token: mediaToken, href: location.href, configuration, delay: audioDelayMs.value }) }))
}

export function setLocalLoudnessMediaToken(token: string) {
  if (mediaToken === token)
    return
  mediaToken = token
  localLoudnessSamples.value = []
  localLoudnessState.value = token ? 'waiting' : 'off'
  notifyLocalLoudnessPanel()
}

export function notifyLocalLoudnessPanel(visible = localLoudnessPanelOpen.value) {
  const channelId = getPageBridgeChannelId()
  if (channelId && mediaToken)
    window.dispatchEvent(new CustomEvent(LOCAL_LOUDNESS_PANEL, { detail: JSON.stringify({ channelId, token: mediaToken, configuration, href: location.href, visible: visible && !document.hidden }) }))
}

export function observeLocalLoudnessState() {
  const receive = (event: Event) => {
    const data = parseVideoMetadataEvent(event)
    if (!data || data.channelId !== getPageBridgeChannelId() || data.token !== mediaToken || data.href !== location.href || data.configuration !== configuration || !LOCAL_LOUDNESS_STATES.includes(data.state as LocalLoudnessState))
      return
    localLoudnessState.value = data.state as LocalLoudnessState
    if (LOCAL_LOUDNESS_STATES.includes(data.delayState as LocalLoudnessState))
      audioDelayState.value = data.delayState as LocalLoudnessState
    const sample = readLocalLoudnessMeasurement(data.measurement)
    if (sample && localLoudnessPanelOpen.value && !document.hidden)
      localLoudnessSamples.value = [...localLoudnessSamples.value.slice(-(LOCAL_LOUDNESS_SAMPLE_LIMIT - 1)), sample]
  }
  window.addEventListener(LOCAL_LOUDNESS_STATE, receive)
  return () => window.removeEventListener(LOCAL_LOUDNESS_STATE, receive)
}
