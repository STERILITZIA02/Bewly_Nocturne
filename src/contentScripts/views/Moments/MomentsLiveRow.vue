<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import MomentVideoPreview from '~/components/MomentCard/MomentVideoPreview.vue'

import type { MomentsPortalLiveUser } from './momentPortal'
import { getSidebarAvatarUrl } from './momentPortal'
import type { MomentPreviewMedia, useMomentPreviews } from './useMomentPreviews'

const props = defineProps<{ user: MomentsPortalLiveUser, previews?: ReturnType<typeof useMomentPreviews> }>()
const { t } = useI18n()
const root = ref<HTMLElement>()
const trigger = ref<HTMLAnchorElement>()
const previewId = `moments-live-preview-${useId()}`
const media = computed<MomentPreviewMedia>(() => ({ id: `sidebar-live:${props.user.room_id}`, isLive: true, isVideo: false, roomId: Number(props.user.room_id) }))
const active = computed(() => props.previews?.hoveredMediaId.value === media.value.id)
const failed = computed(() => active.value && props.previews?.previewState.value === 'error')
const url = computed(() => props.previews?.previewUrls[media.value.id] || '')
const href = computed(() => props.user.jump_url || `https://live.bilibili.com/${props.user.room_id}`)
function enter(event?: MouseEvent) {
  if (Number.isSafeInteger(media.value.roomId) && media.value.roomId! > 0)
    void props.previews?.handleMediaEnter(media.value, event)
}
function leave() {
  props.previews?.handleMediaLeave(media.value)
}
function retry() {
  trigger.value?.focus({ preventScroll: true })
  leave()
  enter()
}
function blur(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    leave()
}
useIntersectionObserver(root, ([entry]) => {
  if (!entry.isIntersecting)
    leave()
})
onBeforeUnmount(leave)
</script>

<template>
  <div
    ref="root" class="moments-live-row" @mouseenter="enter" @mouseleave="leave" @focusin="enter()"
    @focusout="blur"
  >
    <a
      ref="trigger" class="moments-live-row__link" :href="href" :aria-expanded="active" :aria-controls="previewId"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="moments-live-row__avatar">
        <img :src="getSidebarAvatarUrl(user.face, 80)" :alt="user.uname" loading="lazy" decoding="async">
      </span>
      <span class="moments-live-row__info"><strong>{{ user.uname }}</strong><small>{{ user.title }}</small></span>
      <span class="moments-live-row__badge" :title="t('moments.live_badge')"><i i-tabler:broadcast aria-hidden="true" /></span>
    </a>
    <div :id="previewId" class="moments-live-row__reveal" :data-expanded="active" :inert="active ? undefined : true" :aria-hidden="!active">
      <div class="moments-live-row__clip">
        <div class="moments-live-row__preview">
          <div v-if="failed" class="moments-live-row__error" role="status">
            <span>{{ t('moments.live_preview_unavailable') }}</span>
            <button type="button" @click="retry">
              {{ t('common.retry') }}
            </button>
          </div>
          <a
            v-else class="moments-live-row__preview-link" :href="href" :aria-label="t('moments.enter_live_room', { name: user.uname })" target="_blank"
            rel="noopener noreferrer"
          >
            <!-- Mounted before the stream URL arrives, so one dark scrim and its
                 ring cover the whole load (no second placeholder to hand over from). -->
            <MomentVideoPreview
              v-if="active" :url="url" :loading="previews?.previewState.value !== 'ready'" :generation="previews?.previewGeneration.value"
              live hover-surface=".moments-live-row" @video="element => previews?.bindPreviewVideo(element, media)" @leave="leave"
            />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../../../styles/contentCard";
@use "../../../styles/truncateFade";
.moments-live-row {
  min-width: 0;
  border-radius: var(--bew-interactive-radius);
}
.moments-live-row__link {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
  min-height: calc(var(--bew-space-10) + var(--bew-space-4));
  // Avatar on the rail's content line; the live icon ends as far from the right.
  padding: var(--bew-space-2) var(--bew-sidebar-label-inset);
  box-sizing: border-box;
  color: var(--bew-text-1);
  border-radius: inherit;
  text-decoration: none;
}
// Avatars carry the media hairline drawn over the picture.
.moments-live-row__avatar {
  @include contentCard.media-frame;
  position: relative;
  flex: none;
  width: var(--bew-space-10);
  height: var(--bew-space-10);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    corner-shape: inherit;
  }
}
// The bare icon, no disc behind it.
.moments-live-row__badge {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--bew-text-1);
  i {
    display: block;
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
  }
}
.moments-live-row__info {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: var(--bew-space-1);
  strong,
  small {
    @include truncateFade.line;
  }
  strong {
    font-size: var(--bew-font-size-control);
    color: var(--bew-text-1);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-control);
  }
  small {
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    color: var(--bew-text-2);
  }
}
.moments-live-row__reveal {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard);
  &[data-expanded="true"] {
    grid-template-rows: 1fr;
  }
}
.moments-live-row__clip {
  min-height: 0;
  overflow: hidden;
}
// The video cover's hairline drawn over the picture; no shadow, which the
// reveal's clip would cut.
.moments-live-row__preview {
  @include contentCard.media-frame;
  box-shadow: none;
  display: block;
  position: relative;
  aspect-ratio: 16 / 9;
  width: 100%;
  overflow: hidden;
  // One step below the video cover (media) radius, with the same smooth corner.
  border-radius: var(--bew-thumb-radius);
  corner-shape: var(--bew-corner-shape);
  // No surface of its own: while loading only the preview's scrim shows.
  background: transparent;
  border: 0;
  box-sizing: border-box;
}
.moments-live-row__preview-link {
  position: absolute;
  inset: 0;
  display: block;
  border-radius: inherit;
  corner-shape: inherit;
}
.moments-live-row__error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  button {
    min-height: var(--bew-control-item-height);
    padding-inline: var(--bew-space-3);
    border: 0;
    border-radius: var(--bew-pill-radius);
    corner-shape: var(--bew-corner-shape-capsule);
    background: var(--bew-fill-1);
    color: var(--bew-text-1);
    font: inherit;
    cursor: pointer;
    &:hover {
      background: var(--bew-fill-2);
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .moments-live-row__reveal {
    transition: none;
  }
}
</style>
