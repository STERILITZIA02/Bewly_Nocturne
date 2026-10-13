<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MomentVideoPreview from '~/components/MomentCard/MomentVideoPreview.vue'

import type { MomentPreviewMedia } from '../../Moments/useMomentPreviews'
import { privateMessagePreviewsKey } from './usePrivateMessagePreviews'

const props = defineProps<{ src: string, href: string, video?: boolean }>()
const { t } = useI18n()
const previews = inject(privateMessagePreviewsKey, undefined)
const root = ref<HTMLElement>()
const id = useId()
const bvid = computed(() => props.video ? props.href.match(/^https:\/\/www\.bilibili\.com\/video\/(BV\w+)(?:[/?#]|$)/i)?.[1] : undefined)
const media = computed<MomentPreviewMedia>(() => ({ id, isLive: false, isVideo: Boolean(bvid.value), bvid: bvid.value, videoUrl: props.href }))
const active = computed(() => previews?.hoveredMediaId.value === id)
const url = computed(() => active.value ? previews?.previewUrls[id] ?? '' : '')
const loading = computed(() => active.value && previews?.previewState.value === 'loading')
let observer: IntersectionObserver | undefined

function leave() {
  previews?.handleMediaLeave(media.value)
  observer?.disconnect()
  observer = undefined
}

function enter(event: MouseEvent) {
  if (!bvid.value || !previews || event.buttons || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  void previews.handleMediaEnter(media.value, event)
  if (!observer && root.value && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => !entry.isIntersecting))
        leave()
    })
    observer.observe(root.value)
  }
}

watch(() => [props.src, props.href], leave)
watch(active, (value) => {
  if (!value) {
    observer?.disconnect()
    observer = undefined
  }
})
onBeforeUnmount(leave)
</script>

<template>
  <div ref="root" class="private-message-media-cover" @mouseenter="enter" @mouseleave="leave">
    <ALink :href="href" type="content" class="private-message-media-cover__link">
      <img :src="src" alt="" loading="lazy" decoding="async">
      <span class="private-message-media-cover__hint">
        <i :class="video ? 'i-mingcute:play-line' : 'i-mingcute:external-link-line'" aria-hidden="true" />
        {{ t(video ? 'notifications.whisper.messages.play_video' : 'notifications.whisper.messages.open_media') }}
      </span>
    </ALink>
    <MomentVideoPreview
      v-if="active && (url || loading)"
      :url="url"
      :loading="loading"
      :generation="previews?.previewGeneration.value"
      controls
      hover-surface=".private-message-media-cover"
      @video="previews?.bindPreviewVideo($event, media)"
      @leave="leave"
    />
  </div>
</template>

<style scoped lang="scss">
.private-message-media-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--bew-radius-md);
  corner-shape: var(--bew-corner-shape);
}
.private-message-media-cover__link,
.private-message-media-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.private-message-media-cover__hint {
  position: absolute;
  inset: 0;
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: white;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  background: rgb(0 0 0 / 56%);
  opacity: 0;
  transition: opacity var(--bew-duration-normal) var(--bew-ease-standard);
}
.private-message-media-cover:focus-within .private-message-media-cover__hint {
  opacity: 1;
}
@media (hover: hover) {
  .private-message-media-cover:hover .private-message-media-cover__hint {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .private-message-media-cover__hint {
    transition: none;
  }
}
</style>
