<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'

import { useImageTone } from '~/composables/useImageTone'
import { removeHttpFromUrl } from '~/utils/main'
import { getMotionDuration } from '~/utils/motionTiming'
import { hasLoadedPicture, rememberLoadedPicture } from '~/utils/pictureRevealMemory'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { keepSelectionScrollAnchor } from '~/utils/selectionScrollAnchor'

const props = defineProps<{
  title: string
  count: number
  cover?: string
  expanded: boolean
  selected?: boolean
  managing?: boolean
  disabled?: boolean
  locked?: boolean
  icon: string
  iconLabel?: string
}>()
const emit = defineEmits<{ select: [], visible: [] }>()
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const failedImage = ref(false)
const panelId = `favorite-folder-${useId()}`
const renderActions = ref(props.expanded)
let closeActionsTimer: ReturnType<typeof setTimeout> | undefined
let releaseAnchor: (() => void) | undefined
watch(() => props.expanded, (expanded) => {
  clearTimeout(closeActionsTimer)
  if (expanded) {
    renderActions.value = true
  }
  else if (prefersReducedMotion()) {
    renderActions.value = false
  }
  else {
    const duration = root.value ? getMotionDuration(getComputedStyle(root.value), '--bew-duration-normal') : 200
    closeActionsTimer = setTimeout(() => renderActions.value = false, duration + 50)
  }
  releaseAnchor?.()
  if (expanded && root.value?.parentElement)
    releaseAnchor = keepSelectionScrollAnchor(root.value, root.value.parentElement)
}, { flush: 'pre' })
onBeforeUnmount(() => {
  clearTimeout(closeActionsTimer)
  releaseAnchor?.()
})
watch(() => props.cover, () => failedImage.value = false)
// The open folder is a card after the portrait moment cards (user-specified):
// its cover unfolds across the top and fades into the colour the cover has
// where it is cut; the card takes that colour, with black or white text.
const bandCover = computed(() => props.cover && !failedImage.value ? removeHttpFromUrl(`${props.cover}@480w_252h_1c.webp`) : '')
const toned = computed(() => props.expanded && Boolean(bandCover.value))
const tone = useImageTone(() => ({ portrait: toned.value, image: props.cover }))
const bandLoaded = ref(false)
watch(bandCover, src => bandLoaded.value = hasLoadedPicture(src), { immediate: true })
function handleBandLoad() {
  bandLoaded.value = true
  rememberLoadedPicture(bandCover.value)
}
watch(() => props.expanded, (expanded) => {
  const active = (panel.value?.getRootNode() as Document | ShadowRoot | undefined)?.activeElement
  if (!expanded && active && panel.value?.contains(active))
    trigger.value?.focus({ preventScroll: true })
}, { flush: 'sync' })
const { stop } = useIntersectionObserver(root, ([entry]) => {
  if (entry?.isIntersecting) {
    emit('visible')
    stop()
  }
})
</script>

<template>
  <li ref="root" class="favorite-sidebar-item" :class="{ 'is-active': expanded, 'is-selected': selected, 'is-toned': toned }" :style="tone">
    <div v-if="bandCover" class="favorite-sidebar-item__band" :data-expanded="toned" aria-hidden="true">
      <div class="favorite-sidebar-item__band-clip">
        <img
          v-if="renderActions" :src="bandCover" alt="" decoding="async" :class="{ 'is-loaded': bandLoaded }"
          @load="handleBandLoad" @error="failedImage = true"
        >
      </div>
    </div>
    <button
      ref="trigger" type="button" class="favorite-sidebar-item__trigger" :disabled="disabled || locked"
      :aria-expanded="expanded" :aria-controls="panelId" :aria-current="expanded ? 'true' : undefined"
      :aria-pressed="managing ? Boolean(selected) : undefined" @click="emit('select')"
    >
      <span class="favorite-sidebar-item__cover" aria-hidden="true">
        <img v-if="cover && !failedImage" :src="removeHttpFromUrl(`${cover}@96w_96h_1c`)" alt="" loading="lazy" @error="failedImage = true">
        <span v-else i-tabler:folder-star />
      </span>
      <span class="favorite-sidebar-item__title">{{ title }}</span>
      <span class="favorite-sidebar-item__meta">
        <span :class="icon" :title="iconLabel" />
        <span>{{ count }}</span>
      </span>
    </button>
    <div
      :id="panelId" ref="panel" class="favorite-sidebar-item__panel" :data-expanded="expanded"
      :inert="expanded ? undefined : true" :aria-hidden="!expanded"
    >
      <div class="favorite-sidebar-item__clip">
        <div v-if="renderActions" class="favorite-sidebar-item__actions">
          <slot />
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped lang="scss">
@use "../../../styles/contentCard";
@use "../../../styles/imageTone" as *;
@use "../../../styles/truncateFade";
.favorite-sidebar-item {
  // Tone fallbacks sit on the row and the toned surfaces are its children: on
  // one element the two would refer to each other.
  --moment-tone: var(--bew-sidebar-selected-bg);
  --moment-tone-fg: var(--bew-neutral-fg);
  position: relative;
  flex: none;
  min-width: 0;
  // The row clips the cover band to its own smooth corners, which would make
  // Chromium drop a gradient blur's masks: the band fades through a gradient
  // only, as a portrait card does without frosted glass.
  overflow: clip;
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-sidebar-secondary);
  transition:
    $tone-transition,
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    color var(--bew-duration-fast) var(--bew-ease-standard);
  &:is(:hover, :focus-within) {
    background: var(--bew-sidebar-control);
  }
  // The rail's own selection face: the row lies flat on the rail glass.
  &.is-active,
  &.is-selected {
    color: var(--bew-text-1);
    background: var(--bew-sidebar-selected-bg);
  }
  // The open folder with a cover: a card in the cover's colour, framed like a
  // video cover, every text, fill and hover derived from its black or white.
  &.is-toned {
    @include contentCard.media-frame;
    color: var(--moment-tone-fg);
    background: var(--moment-tone);
    > * {
      @include toned-surface;
    }
  }
}
// The cover unfolds across the top with the actions below (same disclosure).
.favorite-sidebar-item__band {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard);
  &[data-expanded="true"] {
    grid-template-rows: 1fr;
  }
}
.favorite-sidebar-item__band-clip {
  position: relative;
  min-height: 0;
  overflow: hidden;
  > img {
    display: block;
    width: 100%;
    aspect-ratio: var(--bew-video-cover-aspect-ratio);
    object-fit: cover;
    opacity: 0;
    transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
    &.is-loaded {
      opacity: 1;
    }
  }
  // Into the card colour where the cover is cut; one pixel past it so the
  // solid end also covers the cover's bottom edge pixel.
  &::after {
    content: "";
    position: absolute;
    inset: auto 0 -1px;
    height: calc(var(--bew-space-12) + 1px);
    background: linear-gradient(to bottom, transparent, var(--moment-tone));
    pointer-events: none;
  }
}
.favorite-sidebar-item__trigger {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  width: 100%;
  padding: var(--bew-space-2);
  border: 0;
  border-radius: inherit;
  color: inherit;
  background: transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  text-align: start;
  cursor: pointer;
  &:disabled {
    opacity: 0.56;
    cursor: default;
  }
}
.favorite-sidebar-item__cover {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--bew-space-12);
  height: var(--bew-space-12);
  overflow: hidden;
  transition:
    width var(--bew-duration-normal) var(--bew-ease-standard),
    margin var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);
  // Its picture is the band above now: the thumbnail folds away with it.
  .is-toned & {
    width: 0;
    margin-inline-end: calc(-1 * var(--bew-space-2));
    opacity: 0;
  }
  // The 8px inset and 8px cover radius nest inside the 16px row radius.
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-2);
  background: var(--bew-content-alt-solid);
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  > span {
    width: var(--bew-icon-size-lg);
    height: var(--bew-icon-size-lg);
  }
}
.favorite-sidebar-item__title {
  flex: 1;
  min-width: 0;
  @include truncateFade.line;
}
.favorite-sidebar-item__meta {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  font-size: var(--bew-font-size-caption);
  > span:first-child {
    width: var(--bew-icon-size-xs);
    height: var(--bew-icon-size-xs);
  }
}
.favorite-sidebar-item__panel {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
  &[data-expanded="true"] {
    grid-template-rows: 1fr;
    opacity: 1;
  }
}
.favorite-sidebar-item__clip {
  min-height: 0;
  overflow: hidden;
}
.favorite-sidebar-item__actions {
  // One row: Play All takes the room left by the icon actions after it.
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-2);
  padding: 0 var(--bew-space-2) var(--bew-space-2);
  :deep(.favorite-folder-action) {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    gap: var(--bew-space-2);
    min-width: 0;
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2) var(--bew-space-3);
    border: 0;
    // The 8px inset nests the 8px radius in the card's 16px.
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    color: var(--bew-text-1);
    background: var(--bew-content-alt-solid);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-control);
    cursor: pointer;
    transition:
      background-color var(--bew-duration-fast) var(--bew-ease-standard),
      color var(--bew-duration-fast) var(--bew-ease-standard),
      transform var(--bew-duration-fast) var(--bew-ease-standard);
    &:hover:not(:disabled) {
      color: var(--bew-on-theme-surface);
      background: var(--bew-theme-surface-hover);
    }
    &:active:not(:disabled) {
      transform: scale(var(--bew-control-press-scale));
    }
    &:disabled {
      opacity: 0.56;
      cursor: default;
    }
    > span:first-child {
      flex: none;
      width: var(--bew-control-icon-size);
      height: var(--bew-control-icon-size);
    }
  }
  // Square icon actions (`IconButton` control size) share the row's surface.
  // Two classes: above the button's own hover rule.
  :deep(.favorite-folder-icon-action.bew-icon-button) {
    corner-shape: var(--bew-corner-shape);
    border-radius: var(--bew-interactive-radius);
    color: var(--bew-text-1);
    &:hover:not(:disabled) {
      color: var(--bew-on-theme-surface);
      background: var(--bew-theme-surface-hover);
    }
    &.danger {
      color: var(--bew-error-foreground);
    }
  }
  // A management bar that follows takes its own line.
  :deep(.sidebar-manage-bar) {
    flex: 1 0 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .favorite-sidebar-item__actions :deep(.favorite-folder-action):active:not(:disabled) {
    transform: none;
  }
}
// Actions on the card colour take its fills.
.is-toned .favorite-sidebar-item__actions {
  --bew-content-alt-solid: var(--bew-fill-2);
  --bew-theme-surface-hover: var(--bew-fill-3);
  --bew-on-theme-surface: var(--bew-text-1);
}
@media (prefers-reduced-motion: reduce) {
  .favorite-sidebar-item,
  .favorite-sidebar-item__panel,
  .favorite-sidebar-item__band,
  .favorite-sidebar-item__band-clip > img,
  .favorite-sidebar-item__cover {
    transition: none;
  }
}
</style>
