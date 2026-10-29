<script setup lang="ts">
import ALink from '~/components/ALink.vue'
import Button from '~/components/Button.vue'
import IconButton from '~/components/IconButton.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import Progress from '~/components/Progress.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useVideoCardSharedStyles } from '~/composables/useVideoCardSharedStyles'
import type { List as VideoItem } from '~/models/video/watchLater'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { removeHttpFromUrl } from '~/utils/main'
import { getVideoPlaybackProgress, getVideoProgressPercentage } from '~/utils/videoVisitHistory'
import { getWatchLaterAuthor, getWatchLaterPlaybackUrl } from '~/utils/watchLaterList'

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
const { textStyle } = useVideoCardSharedStyles()

const videoUrl = computed(() => getWatchLaterPlaybackUrl(props.item))
const author = computed(() => getWatchLaterAuthor(props.item))
const ownerUrl = computed(() => author.value.authorUrl)
const coverUrl = computed(() => props.item.pic ? removeHttpFromUrl(`${props.item.pic}@672w_378h_1c`) : '')
const progressText = computed(() => calcCurrentTime(
  props.item.progress === -1 ? props.item.duration : getVideoPlaybackProgress({ aid: props.item.aid, bvid: props.item.bvid, cid: props.item.cid, epid: props.item.bangumi?.ep_id }, props.item.progress, props.item.duration)?.progress ?? 0,
))
const durationText = computed(() => calcCurrentTime(props.item.duration))
const progressPercentage = computed(() => getVideoProgressPercentage({ aid: props.item.aid, bvid: props.item.bvid, cid: props.item.cid, epid: props.item.bangumi?.ep_id }, props.item.progress, props.item.duration))
</script>

<template>
  <article class="watch-later-grid-card bew-shape-smooth-rect" :style="textStyle">
    <div class="watch-later-grid-card__media">
      <ALink
        class="watch-later-grid-card__cover-link"
        :href="videoUrl"
        :aria-label="item.title"
        :aria-disabled="!videoUrl"
        :tabindex="videoUrl ? undefined : -1"
        type="videoCard"
      >
        <LazyPicture
          v-if="coverUrl"
          responsive-cover
          aspect-ratio="var(--bew-video-cover-aspect-ratio)"
          class="watch-later-grid-card__cover"
          :src="coverUrl"
          :alt="item.title"
          loading="lazy"
        />
      </ALink>

      <div class="watch-later-grid-card__actions">
        <Button
          size="small"
          class="watch-later-grid-card__action watch-later-grid-card__play-remove"
          :aria-label="$t('watch_later.play_video')"
          :disabled="disabled || !videoUrl"
          @click="emit('playAndRemove', item)"
        >
          <span class="watch-later-grid-card__icon i-tabler:player-play" aria-hidden="true" />
          {{ $t('watch_later.play_and_remove') }}
        </Button>
        <Tooltip :content="$t('watch_later.play_in_watch_later')" placement="top" teleport>
          <IconButton
            class="watch-later-grid-card__action"
            :label="$t('watch_later.play_in_watch_later')"
            :disabled="disabled || !videoUrl"
            @click="emit('playInWatchLater', item)"
          >
            <span class="watch-later-grid-card__icon i-tabler:list-check" aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Tooltip :content="$t('common.remove_from_watch_later')" placement="top" teleport>
          <IconButton
            class="watch-later-grid-card__action"
            :label="$t('common.remove_from_watch_later')"
            :disabled="disabled"
            @click="emit('remove', item)"
          >
            <span class="watch-later-grid-card__icon i-tabler:trash" aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </div>

      <div class="watch-later-grid-card__progress">
        <Progress :percentage="progressPercentage" />
      </div>
    </div>

    <div class="watch-later-grid-card__body">
      <ALink
        class="watch-later-grid-card__title keep-two-lines"
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
        <span>{{ author.name }}</span>
      </a>
      <!-- Times live in the details, not on the cover. -->
      <span class="watch-later-grid-card__times">{{ progressText }} / {{ durationText }}</span>
    </div>
  </article>
</template>

<style scoped lang="scss">
@use "../../../styles/truncateFade";
@use "../../../styles/contentCard";

.watch-later-grid-card {
  display: flex;
  min-width: 0;
  padding: var(--bew-space-2);
  flex-direction: column;
  gap: var(--bew-space-3);
  border-radius: var(--bew-surface-radius);
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
  aspect-ratio: var(--bew-video-cover-aspect-ratio);
  overflow: hidden;
  background: var(--bew-skeleton);
  border-radius: var(--bew-thumb-radius);
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
  color: var(--bew-on-overlay-color);
  background: var(--bew-overlay-background);

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    background: var(--bew-overlay-background-hover);
  }

  .watch-later-grid-card__icon {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
  }
}

.watch-later-grid-card__play-remove {
  width: auto;
  --b-button-color: var(--bew-overlay-background);
  --b-button-color-hover: var(--bew-overlay-background-hover);
  --b-button-text-color: var(--bew-on-overlay-color);
  --b-button-border-width: 0;
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
  @include contentCard.video-details;
}

.watch-later-grid-card__title {
  @include contentCard.video-title;

  &:hover,
  &:focus-visible {
    color: var(--bew-theme-foreground);
  }
}

.watch-later-grid-card__times {
  @include contentCard.video-subtitle;
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
}
.watch-later-grid-card__owner {
  display: flex;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  gap: var(--bew-space-2);
  align-items: center;
  @include contentCard.video-subtitle;

  span {
    @include truncateFade.line;
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
