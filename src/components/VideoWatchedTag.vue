<script setup lang="ts">
import { settings } from '~/logic'
import { calcCurrentTime } from '~/utils/dataFormatter'
import type { VideoIdentity } from '~/utils/videoVisitHistory'
import { getVideoWatchState } from '~/utils/videoVisitHistory'
import type { VideoWatchState } from '~/utils/videoVisitRecord'

const props = defineProps<VideoIdentity>()

const state = computed<VideoWatchState | undefined>((previous) => {
  const next = settings.value.showVideoWatchedBadge ? getVideoWatchState(props) : undefined
  if (previous?.status === 'browsed' && next?.status === 'browsed')
    return previous
  if (previous?.status === 'played' && next?.status === 'played'
    && previous.progress === next.progress && previous.duration === next.duration && previous.completed === next.completed) {
    return previous
  }
  return next
})
</script>

<template>
  <span v-if="state" class="video-watched-tag">
    {{ state.status === 'browsed' ? $t('video_card.browsed')
      : state.completed ? $t('video_card.completed')
        : state.progress !== undefined ? $t('video_card.played_progress', { time: calcCurrentTime(state.progress) })
          : $t('video_card.played') }}
  </span>
</template>

<style scoped>
/* The same quiet marker as "followed" beside an uploader's name
   (VideoCardAuthorName): a neutral capsule with no outline. */
.video-watched-tag {
  display: inline-flex;
  align-items: center;
  margin-right: var(--bew-space-1);
  padding-inline: var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
  vertical-align: 0.08em;
  white-space: nowrap;
}
</style>
