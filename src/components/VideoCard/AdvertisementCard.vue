<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { Video } from './types'

defineProps<{ video: Video, horizontal?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <article class="bew-promotion-card" :class="{ 'bew-promotion-card--horizontal': horizontal }">
    <component :is="video.url ? 'a' : 'div'" :href="video.url" :target="video.url ? '_blank' : undefined" :rel="video.url ? 'noopener noreferrer' : undefined" class="bew-promotion-card__link">
      <div class="bew-promotion-card__cover">
        <LazyPicture v-if="video.cover" :src="video.cover" :alt="video.title" />
      </div>
      <div class="bew-promotion-card__info">
        <span class="bew-promotion-card__label">{{ t('common.advertisement') }}</span>
        <span class="bew-promotion-card__title">{{ video.title || t('common.advertisement') }}</span>
      </div>
    </component>
  </article>
</template>

<style scoped lang="scss">
.bew-promotion-card {
  min-width: 0;
  color: var(--bew-text-1);
}
.bew-promotion-card__link {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  color: inherit;
  text-decoration: none;
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
}
.bew-promotion-card__cover {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--bew-content-solid);
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);

  :deep(picture),
  :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    corner-shape: inherit;
  }
}
.bew-promotion-card__info {
  min-width: 0;
  display: grid;
  gap: var(--bew-space-1);
}
.bew-promotion-card__label {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.bew-promotion-card__title {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  overflow-wrap: anywhere;
}
.bew-promotion-card--horizontal .bew-promotion-card__link {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: var(--bew-space-3);
}
</style>
