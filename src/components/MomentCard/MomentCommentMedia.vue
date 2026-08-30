<script setup lang="ts">
import { computed, ref } from 'vue'

import { i18n } from '~/utils/i18n'

import type { MomentCommentPicture } from './commentUtils'
import { getMomentThumbnailUrl } from './utils'

const { pictures } = defineProps<{
  pictures: MomentCommentPicture[]
}>()

const emit = defineEmits<{
  openImagePreview: [urls: string[], index: number, trigger: HTMLElement]
}>()

const { t } = i18n.global
const MAX_VISIBLE_PICTURES = 9
const visiblePictures = computed(() => pictures.slice(0, MAX_VISIBLE_PICTURES))
const hiddenPictureCount = computed(() => Math.max(0, pictures.length - visiblePictures.value.length))
const failedPictures = ref(new Set<string>())
const mediaClass = computed(() => {
  const count = visiblePictures.value.length
  return count === 1
    ? 'moment-comment-media--single'
    : count === 2
      ? 'moment-comment-media--two'
      : count === 3
        ? 'moment-comment-media--three'
        : count === 4
          ? 'moment-comment-media--four'
          : 'moment-comment-media--grid'
})

function markPictureFailed(url: string) {
  failedPictures.value = new Set(failedPictures.value).add(url)
}

function handleOpenImage(index: number, event: MouseEvent) {
  const trigger = event.currentTarget
  if (!(trigger instanceof HTMLElement))
    return
  emit('openImagePreview', pictures.map(picture => picture.url), index, trigger)
}
</script>

<template>
  <div
    v-if="visiblePictures.length"
    class="moment-comment-media"
    :class="mediaClass"
  >
    <button
      v-for="(picture, index) in visiblePictures"
      :key="`${picture.url}-${index}`"
      type="button"
      class="moment-comment-media__item"
      :aria-label="`${t('moments.image_viewer')} ${index + 1}`"
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
  gap: var(--bew-space-2);
  width: min(100%, var(--bew-comment-media-max-width));
  margin-top: var(--bew-space-2);
}
.moment-comment-media--single {
  display: block;
}
.moment-comment-media--two,
.moment-comment-media--four {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.moment-comment-media__item {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-media-radius);
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
.moment-comment-media--single .moment-comment-media__item {
  width: fit-content;
  max-width: 100%;
  background: var(--bew-fill-1);
}
.moment-comment-media--single .moment-comment-media__item img {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: var(--bew-comment-media-single-max-height);
  aspect-ratio: auto;
  object-fit: contain;
}
.moment-comment-media--single .moment-comment-media__fallback {
  width: min(100%, var(--bew-comment-media-fallback-size));
  aspect-ratio: 1;
}
.moment-comment-media__item:hover {
  border-color: color-mix(in srgb, var(--bew-theme-color) 46%, var(--bew-surface-border-color));
}
.moment-comment-media__item:active {
  transform: scale(0.99);
}
.moment-comment-media__item:focus-visible {
  outline: 2px solid var(--bew-theme-color);
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
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}
@container (max-width: 420px) {
  .moment-comment-media--three,
  .moment-comment-media--grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
