<script setup lang="ts">
import { Icon } from '@iconify/vue'

import ALink from '~/components/ALink.vue'
import IconButton from '~/components/IconButton.vue'
import type { List as VideoItem } from '~/models/video/watchLater'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { removeHttpFromUrl } from '~/utils/main'
import { normalizePlaybackProgress } from '~/utils/playbackProgress'

const props = withDefaults(defineProps<{
  item: VideoItem
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  (event: 'playAndRemove', item: VideoItem): void
  (event: 'playInWatchLater', item: VideoItem): void
  (event: 'remove', item: VideoItem): void
}>()

const videoUrl = computed(() => `https://www.bilibili.com/video/${props.item.bvid}/`)
const ownerUrl = computed(() => `https://space.bilibili.com/${props.item.owner.mid}`)
const coverUrl = computed(() => removeHttpFromUrl(`${props.item.pic}@672w_378h_1c`))
const progressText = computed(() => calcCurrentTime(
  props.item.progress === -1 ? props.item.duration : props.item.progress,
))
const durationText = computed(() => calcCurrentTime(props.item.duration))
const progressPercentage = computed(() => normalizePlaybackProgress(props.item.progress, props.item.duration))
</script>

<template>
  <article class="watch-later-grid-card bew-shape-smooth-rect">
    <div class="watch-later-grid-card__media">
      <ALink
        class="watch-later-grid-card__cover-link"
        :href="videoUrl"
        :aria-label="item.title"
        type="videoCard"
      >
        <img
          class="watch-later-grid-card__cover"
          :src="coverUrl"
          :alt="item.title"
          loading="lazy"
          decoding="async"
        >
        <span class="watch-later-grid-card__media-gradient" aria-hidden="true" />
        <span class="watch-later-grid-card__progress-label">
          {{ progressText }} / {{ durationText }}
        </span>
      </ALink>

      <div class="watch-later-grid-card__actions">
        <Tooltip :content="$t('watch_later.play_video')" placement="top">
          <IconButton
            class="watch-later-grid-card__action"
            :label="$t('watch_later.play_video')"
            :disabled="disabled"
            @click="emit('playAndRemove', item)"
          >
            <Icon icon="tabler:player-play" aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Tooltip :content="$t('watch_later.play_in_watch_later')" placement="top">
          <IconButton
            class="watch-later-grid-card__action"
            :label="$t('watch_later.play_in_watch_later')"
            :disabled="disabled"
            @click="emit('playInWatchLater', item)"
          >
            <Icon icon="tabler:list-check" aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Tooltip :content="$t('watch_later.remove_from_watch_later')" placement="top">
          <IconButton
            class="watch-later-grid-card__action"
            :label="$t('watch_later.remove_from_watch_later')"
            :disabled="disabled"
            @click="emit('remove', item)"
          >
            <Icon icon="tabler:trash" aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </div>

      <div class="watch-later-grid-card__progress">
        <Progress :percentage="progressPercentage" />
      </div>
    </div>

    <div class="watch-later-grid-card__body">
      <ALink
        class="watch-later-grid-card__title"
        :href="videoUrl"
        :title="item.title"
        type="videoCard"
      >
        {{ item.title }}
      </ALink>
      <a
        class="watch-later-grid-card__owner"
        :href="ownerUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img :src="removeHttpFromUrl(`${item.owner.face}@40w_40h_1c`)" alt="" loading="lazy" decoding="async">
        <span>{{ item.owner.name }}</span>
      </a>
    </div>
  </article>
</template>

<style scoped lang="scss">
.watch-later-grid-card {
  display: flex;
  min-width: 0;
  padding: var(--bew-space-2);
  flex-direction: column;
  gap: var(--bew-space-3);
  border-radius: var(--bew-card-radius);
  content-visibility: auto;
  contain: layout style;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-emphasized);

  &:hover,
  &:focus-within {
    background: var(--bew-fill-2);
  }
}

.watch-later-grid-card__media {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--bew-skeleton);
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
}

.watch-later-grid-card__cover-link {
  position: absolute;
  inset: 0;
  display: block;
  color: white;
}

.watch-later-grid-card__cover {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--bew-duration-moderate) var(--bew-ease-standard);
}

.watch-later-grid-card:hover .watch-later-grid-card__cover {
  transform: scale(1.025);
}

.watch-later-grid-card__media-gradient {
  position: absolute;
  inset: auto 0 0;
  height: 48%;
  background: linear-gradient(to top, rgb(0 0 0 / 68%), transparent);
  pointer-events: none;
}

.watch-later-grid-card__progress-label {
  position: absolute;
  right: var(--bew-space-2);
  bottom: var(--bew-space-3);
  color: white;
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  text-shadow: 0 1px 3px rgb(0 0 0 / 72%);
}

.watch-later-grid-card__actions {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  display: flex;
  gap: var(--bew-space-1);
  opacity: 0;
  transform: translateY(calc(-1 * var(--bew-space-1)));
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}

.watch-later-grid-card:hover .watch-later-grid-card__actions,
.watch-later-grid-card:focus-within .watch-later-grid-card__actions {
  opacity: 1;
  transform: translateY(0);
}

.watch-later-grid-card__action {
  width: var(--bew-space-8);
  height: var(--bew-space-8);
  color: white;
  background: rgb(0 0 0 / 54%);
  backdrop-filter: var(--bew-filter-glass-1);

  &:hover,
  &:focus-visible {
    background: rgb(0 0 0 / 72%);
  }

  svg {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
  }
}

.watch-later-grid-card__progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: var(--bew-space-1);
  overflow: hidden;
  pointer-events: none;
}

.watch-later-grid-card__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.watch-later-grid-card__title {
  display: -webkit-box;
  min-height: calc(var(--bew-line-height-title) * 2);
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;

  &:hover,
  &:focus-visible {
    color: var(--bew-theme-foreground);
  }
}

.watch-later-grid-card__owner {
  display: flex;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  gap: var(--bew-space-2);
  align-items: center;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  img {
    width: var(--bew-space-6);
    height: var(--bew-space-6);
    flex: 0 0 auto;
    object-fit: cover;
    border-radius: 50%;
    corner-shape: var(--bew-corner-shape-round);
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover,
  &:focus-visible {
    color: var(--bew-theme-foreground);
  }
}

@media (hover: none) {
  .watch-later-grid-card__actions {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .watch-later-grid-card,
  .watch-later-grid-card__cover,
  .watch-later-grid-card__actions {
    transition-duration: 1ms;
  }
}
</style>
