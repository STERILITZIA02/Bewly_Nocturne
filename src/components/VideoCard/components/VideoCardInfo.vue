<script setup lang="ts">
import { computed, ref } from 'vue'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { settings } from '~/logic'

import VideoWatchedTag from '../../VideoWatchedTag.vue'
import { normalizeVideoCardTags, selectVisibleVideoCardTags } from '../tagPolicy'
import type { Video } from '../types'
import VideoCardAuthorAvatar from '../VideoCardAuthor/components/VideoCardAuthorAvatar.vue'
import VideoCardAuthorName from '../VideoCardAuthor/components/VideoCardAuthorName.vue'
import VideoCardMeta from './VideoCardMeta.vue'

interface Props {
  skeleton?: boolean
  video?: Video
  horizontal?: boolean
  videoUrl?: string
  moreBtn: boolean
  showVideoOptions: boolean
  titleFontSizeClass: string
  titleStyle: Record<string, string | number>
  authorFontSizeClass: string
  metaFontSizeClass: string
  metaStyle: Record<string, string>
  highlightTags: string[]
  hideAuthor?: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ moreBtnClick: [event: MouseEvent] }>()
const moreBtnRef = ref<HTMLButtonElement | null>(null)
defineExpose({ moreBtnRef })
function hasAuthorFace(author: Video['author'] | undefined) {
  return Array.isArray(author) ? author.some(item => Boolean(item.authorFace)) : Boolean(author?.authorFace)
}
const content = computed(() => {
  const current = settings.value
  const tags = selectVisibleVideoCardTags(normalizeVideoCardTags(props.video ?? {}), props.highlightTags, current.showVideoCardVideoTag, current.showVideoCardRecommendTag)
  const avatar = !props.hideAuthor && current.showVideoCardAuthorAvatar
  const name = !props.hideAuthor && current.showVideoCardAuthorName
  return {
    avatar,
    name,
    showAvatar: avatar && hasAuthorFace(props.video?.author),
    showName: name && Boolean(props.video?.author),
    tags,
    publishTime: current.showVideoCardPublishTime,
    metaPlaceholder: current.showVideoCardVideoTag || current.showVideoCardRecommendTag || current.showVideoCardPublishTime || Boolean(props.video?.type),
    hasMeta: tags.leading.length > 0 || tags.highlights.length > 0 || (current.showVideoCardPublishTime && Boolean(props.video?.publishedTimestamp || props.video?.capsuleText)) || props.video?.type === 'vertical' || props.video?.type === 'bangumi',
    watched: current.showVideoWatchedBadge && !props.video?.roomid,
  }
})
</script>

<template>
  <div class="video-card-info" :class="{ 'video-card-info--horizontal': horizontal }" :style="{ ...metaStyle, '--bew-title-line-height': titleStyle['--bew-title-line-height'] }">
    <template v-if="skeleton">
      <div class="video-card-info__heading">
        <div class="video-card-info-title video-card-info-title--skeleton" :class="titleFontSizeClass">
          <SkeletonBlock width="100%" height="1em" />
          <SkeletonBlock width="75%" height="1em" />
        </div>
        <SkeletonBlock v-if="moreBtn" class="video-card__more-btn" width="var(--bew-icon-button-size-md)" height="var(--bew-icon-button-size-md)" radius="circle" />
      </div>
      <div v-if="content.avatar || content.name || content.metaPlaceholder" class="video-card-meta">
        <SkeletonBlock v-if="content.avatar" class="video-card-info__avatar" width="var(--bew-card-avatar-size)" height="var(--bew-card-avatar-size)" radius="circle" />
        <div class="video-card-info__identity">
          <SkeletonBlock v-if="content.name" width="60%" height="var(--bew-author-line-height)" />
          <SkeletonBlock v-if="content.metaPlaceholder" width="80%" height="var(--bew-video-card-meta-row-height)" />
        </div>
      </div>
    </template>
    <template v-else-if="video">
      <div class="video-card-info__heading">
        <h3 class="video-card-info-title video-card-title keep-two-lines" :class="titleFontSizeClass" :title="video.title">
          <a :href="videoUrl" target="_blank">
            <VideoWatchedTag v-if="content.watched" :aid="video.aid" :bvid="video.bvid" :epid="video.epid" :roomid="video.roomid" />
            {{ video.title }}
          </a>
        </h3>
        <button
          v-if="moreBtn" ref="moreBtnRef" type="button" class="video-card__more-btn bew-shape-circle"
          :class="{ 'more-active': showVideoOptions }" :aria-label="$t('video_card.operation.more_options')"
          aria-haspopup="menu" :aria-expanded="showVideoOptions" @click.stop.prevent="emit('moreBtnClick', $event)"
        >
          <div i-tabler:dots-vertical aria-hidden="true" />
        </button>
      </div>
      <div v-if="content.showAvatar || content.showName || content.hasMeta" class="video-card-meta">
        <VideoCardAuthorAvatar v-if="content.showAvatar && video.author" :author="video.author" :is-live="video.liveStatus === 1" />
        <div class="video-card-info__identity">
          <VideoCardAuthorName v-if="content.showName" :author="video.author" :class="authorFontSizeClass" />
          <VideoCardMeta :video="video" :tags="content.tags" :publish-time="content.publishTime" :class="metaFontSizeClass" />
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/contentCard";

.video-card-info {
  --bew-video-card-meta-row-height: max(var(--bew-space-6), var(--bew-meta-line-height));
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  min-width: 0;
  margin-top: var(--bew-card-stack-gap);
  color: var(--bew-text-2);
}
.video-card-info:not(.video-card-info--horizontal) {
  @include contentCard.under-cover;
}
.video-card-info--horizontal {
  width: 100%;
  margin-top: 0;
}
.video-card-info__heading {
  display: flex;
  align-items: flex-start;
  gap: var(--bew-space-2);
}
.video-card-info-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  min-height: calc(var(--bew-title-line-height) * 2);
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-title-line-height);
}
.video-card-info-title--skeleton {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}
.video-card__more-btn {
  display: grid;
  flex: none;
  width: var(--bew-icon-button-size-md);
  height: var(--bew-icon-button-size-md);
  margin-top: calc((var(--bew-title-line-height) - var(--bew-icon-button-size-md)) / 2);
  padding: 0;
  border: 0;
  place-items: center;
  color: var(--bew-text-3);
  &:not([data-bew-skeleton]) {
    background: transparent;
  }
  font-size: var(--bew-icon-size-md);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
  &:hover,
  &.more-active {
    background: var(--bew-fill-2);
    color: var(--bew-text-1);
  }
  &:active {
    background: var(--bew-fill-3);
  }
}
.video-card-info:focus-within .video-card__more-btn {
  color: var(--bew-text-1);
}
.video-card-meta {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
}
.video-card-info__identity {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-width: 0;
}
.video-card-info__avatar {
  flex: none;
}
</style>
