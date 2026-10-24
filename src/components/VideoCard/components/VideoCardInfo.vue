<script setup lang="ts">
import { computed } from 'vue'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { settings } from '~/logic'
import { calcTimeSince } from '~/utils/dataFormatter'

import type { Video } from '../types'
import VideoCardAuthorName from '../VideoCardAuthor/components/VideoCardAuthorName.vue'

interface Props {
  skeleton?: boolean
  video?: Video
  horizontal?: boolean
  videoUrl?: string
  /** Shared size/line-height variables from useVideoCardSharedStyles. */
  textStyle: Record<string, string>
  hideAuthor?: boolean
}
const props = defineProps<Props>()
// Apple Music style: flush with the cover's left edge, a primary title, then one
// quiet line "uploader · time". The only marker is "followed" after the name.
const content = computed(() => {
  const name = !props.hideAuthor && settings.value.showVideoCardAuthorName
  const publishTime = settings.value.showVideoCardPublishTime
  const video = props.video
  return {
    name,
    showName: name && (Array.isArray(video?.author) ? video.author.some(author => author.name) : Boolean(video?.author?.name)),
    publishTime,
    publishText: publishTime && video
      ? video.publishedTimestamp ? calcTimeSince(video.publishedTimestamp * 1000) : video.capsuleText?.trim() ?? ''
      : '',
  }
})
</script>

<template>
  <div class="video-card-info" :class="{ 'video-card-info--horizontal': horizontal }" :style="textStyle">
    <template v-if="skeleton">
      <div class="video-card-info-title video-card-info-title--skeleton">
        <SkeletonBlock width="100%" height="1em" />
        <SkeletonBlock width="75%" height="1em" />
      </div>
      <SkeletonBlock v-if="content.name || content.publishTime" width="55%" height="var(--bew-author-line-height)" />
    </template>
    <template v-else-if="video">
      <h3 class="video-card-info-title video-card-title keep-two-lines" :title="video.title">
        <a :href="videoUrl" target="_blank">{{ video.title }}</a>
      </h3>
      <div v-if="content.showName || content.publishText" class="video-card-info__subtitle">
        <VideoCardAuthorName v-if="content.showName" :author="video.author" />
        <span v-if="content.showName && content.publishText" class="video-card-info__separator" aria-hidden="true">·</span>
        <span v-if="content.publishText" class="video-card-info__time">{{ content.publishText }}</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/contentCard";

.video-card-info {
  @include contentCard.video-details;
  margin-top: var(--bew-space-3);
  color: var(--bew-text-2);
}
.video-card-info--horizontal {
  width: 100%;
  margin-top: 0;
}
.video-card-info-title {
  @include contentCard.video-title;
}
.video-card-info-title--skeleton {
  display: flex;
  flex-direction: column;
  min-height: calc(var(--bew-title-line-height) * 2);
  justify-content: space-around;
}
// One secondary line; the name shrinks, separator and time never wrap.
.video-card-info__subtitle {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-width: 0;
  @include contentCard.video-subtitle;
  white-space: nowrap;
}
.video-card-info__separator,
.video-card-info__time {
  flex: none;
  font-variant-numeric: tabular-nums;
}
</style>
