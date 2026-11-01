<script setup lang="ts">
import ChevronIcon from '~/components/ChevronIcon.vue'
import IconButton from '~/components/IconButton.vue'
import { goToPlaybackVisit, playbackTrail } from '~/composables/usePlaybackTrail'
</script>

<template>
  <div class="playback-history-controls" role="group" :aria-label="$t('widescreen.playback_navigation')">
    <IconButton
      shape="pill"
      :label="$t('widescreen.previous_video')"
      :title="$t('widescreen.previous_video')"
      :disabled="playbackTrail.index <= 0"
      @click="goToPlaybackVisit(-1)"
    >
      <ChevronIcon direction="left" />
    </IconButton>
    <span class="divider" aria-hidden="true" />
    <IconButton
      shape="pill"
      :label="$t('widescreen.next_video')"
      :title="$t('widescreen.next_video')"
      :disabled="playbackTrail.index + 1 >= playbackTrail.visits.length"
      @click="goToPlaybackVisit(1)"
    >
      <ChevronIcon direction="right" />
    </IconButton>
  </div>
</template>

<style scoped lang="scss">
@use "../../../styles/sidebarSurface";

.playback-history-controls {
  @include sidebarSurface.floating;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--bew-space-1);
  height: var(--bew-top-bar-primary-control-height);
  padding-inline: calc(
    (var(--bew-top-bar-primary-control-height) - var(--bew-control-height)) / 2 - var(--bew-glass-edge-width)
  );
  color: var(--bew-text-1);
  pointer-events: auto;

  .bew-icon-button {
    width: var(--bew-control-height);
    height: var(--bew-control-height);

    svg {
      width: var(--bew-icon-size-lg);
      height: var(--bew-icon-size-lg);
    }

    &:hover:not(:disabled) {
      background: var(--bew-hover-bg);
    }

    &:active:not(:disabled) {
      background: var(--bew-pressed-bg);
    }
  }

  .divider {
    width: var(--bew-hairline);
    align-self: stretch;
    margin-block: var(--bew-space-3);
    background: var(--bew-separator-color);
  }
}
</style>
