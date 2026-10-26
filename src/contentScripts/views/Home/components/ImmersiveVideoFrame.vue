<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useIframeDocumentHost } from '~/composables/useIframeDocumentHost'
import { IMMERSIVE_CONFIG, IMMERSIVE_EVENT, IMMERSIVE_FRAME_NAME, IMMERSIVE_RECOMMENDATIONS } from '~/constants/immersive'
import { settings } from '~/logic'
import { getIframeMessageData, markIframeReadyForMessaging } from '~/utils/iframeMessage'
import type { ImmersiveRailWindow } from '~/utils/immersivePlayback'
import { releaseIframeMedia } from '~/utils/mediaResources'

const props = defineProps<{ url: string, itemKey: string, title: string, active: boolean, uiVisible: boolean, recommendations: ImmersiveRailWindow }>()
const emit = defineEmits<{
  (event: 'action', value: { key: string, action: 'next' | 'previous' | 'close' | 'ended' }): void
  (event: 'railAction', action: { action: string, key?: string, revision?: number }): void
  (event: 'navigation', href: string): void
}>()
const frame = ref<HTMLIFrameElement>()
const layoutReady = ref(false)
const timedOut = ref(false)
const playbackState = ref('requesting')
let timer: ReturnType<typeof setTimeout> | undefined
let playbackId = 0
const { currentHref, channel } = useIframeDocumentHost(frame, () => true)
function clearTimer() {
  clearTimeout(timer)
  timer = undefined
}
function configure() {
  channel.send({
    type: IMMERSIVE_CONFIG,
    key: props.itemKey,
    playbackId,
    targetUrl: props.url,
    active: props.active,
    uiVisible: props.uiVisible,
    autoPlay: settings.value.immersiveAutoPlay,
    autoNext: settings.value.immersiveAutoNext,
    keyboard: settings.value.immersiveKeyboardSwitch,
    wheel: settings.value.immersiveWheelSwitch,
  })
  if (props.uiVisible)
    channel.send({ type: IMMERSIVE_RECOMMENDATIONS, key: props.itemKey, playbackId, window: props.recommendations })
}
watch([currentHref, () => props.active, () => props.uiVisible, () => settings.value.immersiveAutoPlay, () => settings.value.immersiveAutoNext, () => settings.value.immersiveKeyboardSwitch, () => settings.value.immersiveWheelSwitch], configure, { flush: 'post' })
function waitForLayout() {
  clearTimer()
  if (props.active && props.uiVisible && !layoutReady.value) {
    timer = setTimeout(() => {
      timer = undefined
      timedOut.value = true
    }, 8_000)
  }
}
watch(() => props.active, (active) => {
  layoutReady.value = false
  if (active) {
    playbackId++
    timedOut.value = false
  }
  waitForLayout()
}, { immediate: true, flush: 'sync' })
watch(() => props.uiVisible, waitForLayout)
watch(() => props.recommendations, configure, { flush: 'post' })
useEventListener(window, 'message', (event) => {
  const data = getIframeMessageData(event, frame.value)
  if (!props.active || data?.type !== IMMERSIVE_EVENT || !channel.matches(data) || data.key !== props.itemKey || data.playbackId !== playbackId)
    return
  if ((data.input === 'wheel' && !settings.value.immersiveWheelSwitch)
    || (data.input === 'keyboard' && data.action !== 'close' && !settings.value.immersiveKeyboardSwitch)) {
    return
  }
  if (data.action === 'status' && typeof data.layoutReady === 'boolean' && typeof data.playing === 'boolean') {
    if (typeof data.state === 'string')
      playbackState.value = data.state
    const previous = layoutReady.value
    layoutReady.value = data.layoutReady
    if (data.layoutReady)
      clearTimer()
    else if (previous && !timedOut.value)
      waitForLayout()
  }
  else if (data.action === 'navigation' && typeof data.href === 'string') {
    emit('navigation', data.href)
  }
  else if (data.action === 'select' || data.action === 'more') {
    emit('railAction', { action: data.action, key: typeof data.selectedKey === 'string' ? data.selectedKey : undefined, revision: Number(data.revision) })
  }
  else if (['next', 'previous', 'close'].includes(String(data.action))
    || (data.action === 'ended' && settings.value.immersiveAutoNext)) {
    emit('action', { key: props.itemKey, action: data.action as 'next' | 'previous' | 'close' | 'ended' })
  }
})
function loaded() {
  layoutReady.value = false
  timedOut.value = false
  waitForLayout()
  markIframeReadyForMessaging(frame.value)
}
onBeforeUnmount(() => {
  configureInactive()
  clearTimer()
  channel.clear()
  releaseIframeMedia(frame.value ?? null)
})
function configureInactive() {
  channel.send({ type: IMMERSIVE_CONFIG, key: props.itemKey, playbackId, targetUrl: props.url, active: false, uiVisible: false, autoPlay: false, autoNext: false, keyboard: false, wheel: false })
}
</script>

<template>
  <div v-show="active" class="immersive-frame" :inert="!active || undefined" :aria-hidden="!active || undefined">
    <iframe
      ref="frame"
      :src="url"
      :name="IMMERSIVE_FRAME_NAME"
      :title="title"
      :tabindex="active ? 0 : -1"
      allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
      @load="loaded"
    />
    <div v-if="!layoutReady && !timedOut" class="immersive-frame__loading" role="status" :aria-label="$t('common.loading')">
      <SkeletonBlock class="immersive-frame__skeleton" />
    </div>
    <p v-if="timedOut && !layoutReady" class="immersive-frame__notice" role="status">
      {{ $t('settings.immersive_native_pending') }}
    </p>
    <p v-else-if="['gesture', 'error', 'unknown'].includes(playbackState)" class="immersive-frame__notice" role="status">
      {{ $t(`settings.immersive_playback_${playbackState}`) }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.immersive-frame {
  position: absolute;
  inset: 0;

  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: var(--bew-bg);
  }
}

.immersive-frame__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--bew-space-6);
  background: var(--bew-bg);
}

.immersive-frame__skeleton {
  width: 100%;
  aspect-ratio: var(--bew-video-cover-aspect-ratio);
}

.immersive-frame__notice {
  position: absolute;
  top: var(--bew-space-2);
  left: var(--bew-space-2);
  margin: 0;
  padding: var(--bew-space-2) var(--bew-space-3);
  background: var(--bew-elevated-solid);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
  pointer-events: none;
}
</style>
