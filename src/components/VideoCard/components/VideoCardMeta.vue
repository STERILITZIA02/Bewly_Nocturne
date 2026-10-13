<script setup lang="ts">
import { computed } from 'vue'

import { settings } from '~/logic'
import { calcTimeSince } from '~/utils/dataFormatter'

import { vWholeMeta } from '../directives/wholeMeta'
import type { NormalizedVideoCardTag } from '../tagPolicy'
import type { Video } from '../types'
import { getTagSearchUrl } from '../utils'

const props = defineProps<{
  video: Video
  tags: { leading: NormalizedVideoCardTag[], highlights: string[] }
  publishTime: boolean
}>()
const textParts = computed(() => [
  props.publishTime ? props.video.publishedTimestamp ? calcTimeSince(props.video.publishedTimestamp * 1000) : props.video.capsuleText?.trim() : '',
  ...props.tags.leading.filter(tag => !tag.searchable).map(tag => tag.text),
  ...props.tags.highlights,
].filter(Boolean))
const searchable = computed(() => props.tags.leading.find(tag => tag.searchable))
const metrics = computed(() => [settings.value.videoCardMetaFontSize, settings.value.customizeFont, settings.value.fontFamily].join(':'))
</script>

<template>
  <div v-if="textParts.length || searchable || video.type === 'vertical' || video.type === 'bangumi'" v-whole-meta="metrics" class="video-card-meta-row">
    <span v-for="(part, index) in textParts" :key="index" class="video-card-meta__text" :title="part">{{ part }}</span>
    <a v-if="searchable" class="video-card-meta__chip video-card-meta__chip--searchable" :href="getTagSearchUrl(searchable.text)" target="_blank" @click.stop>
      {{ searchable.text }}
    </a>
    <span v-if="video.type === 'vertical'" i-mingcute:cellphone-2-line />
    <span v-else-if="video.type === 'bangumi'" i-mingcute:movie-line />
  </div>
</template>

<style scoped lang="scss">
.video-card-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  gap: var(--bew-space-2);
  height: var(--bew-video-card-meta-row-height);
  overflow: hidden;
  min-width: 0;
  color: var(--bew-text-3);
  line-height: var(--bew-meta-line-height);
  > * {
    flex: 0 0 auto;
    max-width: 100%;
    white-space: nowrap;
  }
}
.video-card-meta__text {
  line-height: var(--bew-video-card-meta-row-height);
  overflow: hidden;
  text-overflow: ellipsis;
}
.video-card-meta__text + .video-card-meta__text::before {
  content: "·";
  margin-right: var(--bew-space-2);
}
.video-card-meta__chip {
  display: inline-flex;
  align-items: center;
  min-height: var(--bew-space-6);
  padding-inline: var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
  font-weight: var(--bew-font-weight-medium);
  &:hover {
    background: var(--bew-theme-surface-hover);
  }
}
</style>
