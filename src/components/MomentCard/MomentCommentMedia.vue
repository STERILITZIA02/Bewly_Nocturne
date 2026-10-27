<script setup lang="ts">
import { computed, ref } from 'vue'

import { useImageViewer } from '~/composables/useImageViewer'
import { i18n } from '~/utils/i18n'

import type { MomentCommentPicture } from './commentUtils'
import { getMomentOriginalImageUrl, getMomentThumbnailUrl } from './utils'

const { pictures } = defineProps<{
  pictures: MomentCommentPicture[]
}>()

const { t } = i18n.global
const MAX_VISIBLE_PICTURES = 9
const visiblePictures = computed(() => pictures.slice(0, MAX_VISIBLE_PICTURES))
const hiddenPictureCount = computed(() => Math.max(0, pictures.length - visiblePictures.value.length))
const failedPictures = ref(new Set<string>())

function markPictureFailed(url: string) {
  failedPictures.value = new Set(failedPictures.value).add(url)
}

// Each visible thumbnail is where its image opens from and closes back to.
const buttons: HTMLElement[] = []
const imageViewer = useImageViewer()
function handleOpenImage(index: number, event: MouseEvent) {
  imageViewer.open({
    urls: pictures.map(picture => getMomentOriginalImageUrl(picture.url)),
    index,
    trigger: event.currentTarget as HTMLElement,
    getOrigin: (shown) => {
      const button = buttons[shown]
      return button?.isConnected ? button.getBoundingClientRect() : undefined
    },
  })
}
</script>

<template>
  <div
    v-if="visiblePictures.length"
    class="moment-comment-media"
  >
    <button
      v-for="(picture, index) in visiblePictures"
      :key="`${picture.url}-${index}`"
      :ref="element => buttons[index] = element as HTMLElement"
      type="button"
      class="moment-comment-media__item"
      :aria-label="t('image_viewer.view_image', { index: index + 1 })"
      @click="handleOpenImage(index, $event)"
    >
      <img
        v-if="!failedPictures.has(picture.url)"
        :src="getMomentThumbnailUrl(picture.url)"
        :width="picture.width || undefined"
        :height="picture.height || undefined"
        alt=""
        loading="lazy"
        decoding="async"
        @error="markPictureFailed(picture.url)"
      >
      <span v-else class="moment-comment-media__fallback" aria-hidden="true">
        <span i-tabler-photo-off />
      </span>
      <span
        v-if="index === visiblePictures.length - 1 && hiddenPictureCount"
        class="moment-comment-media__more"
        aria-hidden="true"
      >
        +{{ hiddenPictureCount }}
      </span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.moment-comment-media {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bew-space-1);
  width: 100%;
  margin-top: var(--bew-space-2);
}
.moment-comment-media__item {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--bew-thumb-radius);
  background: var(--bew-fill-1);
  cursor: pointer;
  corner-shape: var(--bew-corner-shape);
}
.moment-comment-media__item img,
.moment-comment-media__fallback {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
.moment-comment-media__fallback {
  display: grid;
  place-items: center;
  color: var(--bew-text-3);
  background: var(--bew-fill-2);
  font-size: var(--bew-icon-size-lg);
}
.moment-comment-media__item:active {
  transform: scale(0.99);
}
.moment-comment-media__item:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: 2px;
}
.moment-comment-media__more {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: white;
  background: rgb(0 0 0 / 58%);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-title);
}
</style>
