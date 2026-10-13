<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { Info } from '~/models/video/favorite'
import { removeHttpFromUrl } from '~/utils/main'

defineProps<{ info?: Info, own: boolean, pending: boolean, loading: boolean, failed: boolean }>()
const emit = defineEmits<{ like: [], subscribe: [], share: [], retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="favorite-folder-social">
    <template v-if="info">
      <a class="favorite-folder-social__creator" :href="`https://space.bilibili.com/${info.upper.mid}`" target="_blank" rel="noopener noreferrer">
        <img v-if="info.upper.face" :src="removeHttpFromUrl(`${info.upper.face}@64w_64h_1c.webp`)" alt="" loading="lazy">
        <span><small>{{ t('favorites.folder_creator') }}</small><span>{{ info.upper.name }}</span></span>
      </a>
      <button type="button" :disabled="pending" :aria-busy="pending" :aria-pressed="info.like_state === 1" @click="emit('like')">
        <span i-tabler:thumb-up />{{ t(info.like_state === 1 ? 'favorites.folder_unlike' : 'favorites.folder_like') }}<span>{{ info.cnt_info.thumb_up }}</span>
      </button>
      <button type="button" :disabled="own || pending" :aria-busy="!own && pending" :aria-pressed="!own && info.fav_state === 1" @click="!own && emit('subscribe')">
        <span :class="!own && info.fav_state === 1 ? 'i-tabler:star-filled' : 'i-tabler:star'" />{{ t(!own && info.fav_state === 1 ? 'favorites.unfavorite' : 'favorites.folder_collect') }}<span>{{ info.cnt_info.collect }}</span>
      </button>
      <button type="button" @click="emit('share')">
        <span i-tabler:share />{{ t('favorites.folder_share') }}
      </button>
    </template>
    <template v-else-if="loading">
      <SkeletonBlock width="8em" height="var(--bew-control-height)" />
      <SkeletonBlock v-for="index in 3" :key="index" width="5em" height="var(--bew-control-height)" />
    </template>
    <button v-else-if="failed" type="button" @click="emit('retry')">
      {{ t('common.operation.refresh') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.favorite-folder-social {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-4);
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-2);
    min-height: var(--bew-control-height);
    padding: var(--bew-space-1) var(--bew-space-3);
    border: 0;
    border-radius: var(--bew-radius-full);
    background: var(--bew-fill-1);
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-medium);
    line-height: var(--bew-line-height-control);
    cursor: pointer;
    transition:
      color var(--bew-duration-fast),
      background-color var(--bew-duration-fast);
    &:hover:not(:disabled) {
      color: var(--bew-on-theme-surface);
      background: var(--bew-theme-surface);
    }
    &[aria-pressed="true"] {
      color: var(--bew-on-theme-color);
      background: var(--bew-theme-color);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
    span:first-child {
      font-size: var(--bew-icon-size-sm);
    }
    span:last-child {
      font-variant-numeric: tabular-nums;
    }
  }
}
.favorite-folder-social__creator {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-2);
  max-width: 100%;
  min-height: var(--bew-control-height);
  margin-inline-end: var(--bew-space-2);
  color: var(--bew-text-1);
  text-decoration: none;
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  img {
    flex: none;
    width: var(--bew-space-8);
    height: var(--bew-space-8);
    border-radius: var(--bew-radius-full);
    object-fit: cover;
  }
  > span {
    display: grid;
    min-width: 0;
    > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  small {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
  &:hover {
    color: var(--bew-theme-foreground);
  }
}
@media (prefers-reduced-motion: reduce) {
  .favorite-folder-social button {
    transition: none;
  }
}
</style>
