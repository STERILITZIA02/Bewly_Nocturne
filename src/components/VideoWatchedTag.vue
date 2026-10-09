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
.video-watched-tag {
  display: inline-flex;
  align-items: center;
  margin-right: var(--bew-space-1);
  padding: 0 var(--bew-space-1);
  border: 1px solid var(--bew-text-3);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  vertical-align: 0.08em;
  white-space: nowrap;
}

:host(.dark) .video-watched-tag {
  color: var(--bew-text-1);
}
</style>
