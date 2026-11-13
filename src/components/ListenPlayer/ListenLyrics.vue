<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import IconButton from '~/components/IconButton.vue'
import type { LyricLine, LyricTrack } from '~/utils/listenLyrics'
import { findLyricLine } from '~/utils/listenLyrics'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { landingResponse, stepCriticalSpring } from '~/utils/spring'

/**
 * A video's subtitles as scrolling lyrics (user-specified 2026-11-10): the
 * line being sung is lit and held at the middle of the column, the others
 * dim with their distance from it, and a line pressed seeks to its time. The column is an ordinary
 * scroller, so the wheel browses it; following resumes a moment after.
 *
 * Nothing here runs per frame while a line holds: the next line's start is one
 * timer set from the audio's clock, and the current line and its neighbours
 * are marked on their own elements, not through a re-render of the list.
 */
const props = defineProps<{
  lines: LyricLine[]
  audio: HTMLAudioElement | null
  tracks: LyricTrack[]
  trackId: string
}>()
const emit = defineEmits<{ select: [track: LyricTrack] }>()
const { t } = useI18n()

const scroller = ref<HTMLElement>()
const list = ref<HTMLElement>()
// By distance from the line being sung; lines further off carry none.
const DEPTH_CLASSES = ['is-current', 'is-near', 'is-mid']
/** After the reader scrolls, the column stays put this long before following again. */
const BROWSE_HOLD_MS = 3000
const SCROLL_RESPONSE = landingResponse(0.3)

let current = -1
let nextLine: ReturnType<typeof setTimeout> | undefined
let heldUntil = 0

// ---- The column follows the current line ------------------------------------------

let frame = 0
let position = 0
let velocity = 0
let target = 0

function stopScroll() {
  cancelAnimationFrame(frame)
  frame = 0
  velocity = 0
}

/** The current line's middle at the column's middle; before the first line, the top. */
function follow(animate = true) {
  const box = scroller.value
  if (!box || performance.now() < heldUntil)
    return
  const line = list.value?.children[current] as HTMLElement | undefined
  target = Math.max(0, line ? line.offsetTop + line.offsetHeight / 2 - box.clientHeight / 2 : 0)
  if (!animate || prefersReducedMotion()) {
    stopScroll()
    box.scrollTop = target
    return
  }
  if (frame)
    return
  position = box.scrollTop
  let last = performance.now()
  const step = (now: number) => {
    const next = stepCriticalSpring(position, velocity, target, Math.min(0.064, (now - last) / 1000), SCROLL_RESPONSE)
    last = now
    position = next.position
    velocity = next.velocity
    const landed = Math.abs(position - target) < 0.5 && Math.abs(velocity) < 8
    box.scrollTop = landed ? target : position
    frame = landed ? 0 : requestAnimationFrame(step)
    if (landed)
      velocity = 0
  }
  frame = requestAnimationFrame(step)
}

function browse() {
  heldUntil = performance.now() + BROWSE_HOLD_MS
  stopScroll()
}

// ---- The current line -------------------------------------------------------------

function mark(index: number) {
  const items = list.value?.children
  // The marks leave the last line's neighbourhood and land on this one's.
  for (const [line, add] of [[current, false], [index, true]] as const) {
    for (let offset = 1 - DEPTH_CLASSES.length; offset < DEPTH_CLASSES.length; offset++)
      items?.[line + offset]?.classList.toggle(DEPTH_CLASSES[Math.abs(offset)], add)
  }
  current = index
}

function sync() {
  clearTimeout(nextLine)
  const audio = props.audio
  if (!audio || !props.lines.length)
    return
  const time = audio.currentTime
  const index = findLyricLine(props.lines, time)
  if (index !== current) {
    mark(index)
    follow()
  }
  else if (heldUntil && performance.now() >= heldUntil) {
    heldUntil = 0
    follow()
  }
  const next = props.lines[index + 1]
  if (next && !audio.paused && !audio.ended)
    nextLine = setTimeout(sync, Math.max(16, (next.from - time) / (audio.playbackRate || 1) * 1000))
}

watch(() => props.audio, (audio, _previous, onCleanup) => {
  clearTimeout(nextLine)
  if (!audio)
    return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  for (const name of ['play', 'pause', 'seeked', 'ratechange', 'timeupdate', 'ended'])
    audio.addEventListener(name, sync, { signal: controller.signal })
  sync()
}, { immediate: true })

// Another track's lines replace the list: start from its line for this moment.
watch(() => props.lines, async () => {
  mark(-1)
  heldUntil = 0
  stopScroll()
  await nextTick()
  const audio = props.audio
  mark(audio ? findLyricLine(props.lines, audio.currentTime) : -1)
  follow(false)
  sync()
}, { immediate: true, flush: 'post' })

const resize = new ResizeObserver(() => follow(false))
watch(scroller, (box, previous) => {
  if (previous)
    resize.unobserve(previous)
  if (box)
    resize.observe(box)
}, { flush: 'post' })

function seek(event: MouseEvent) {
  const item = (event.target as Element).closest<HTMLElement>('[data-line]')
  const line = item && props.lines[Number(item.dataset.line)]
  const audio = props.audio
  if (!line || !audio)
    return
  heldUntil = 0
  audio.currentTime = line.from
  if (audio.paused)
    sync()
}

// ---- Subtitle language ------------------------------------------------------------

const menuOpen = ref(false)
const menu = ref<HTMLElement>()
watch(menuOpen, (open, _previous, onCleanup) => {
  if (!open)
    return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  // The stage lives in the player's shadow root; a press elsewhere closes the menu.
  menu.value?.getRootNode().addEventListener('pointerdown', (event) => {
    if (!menu.value?.contains(event.target as Node))
      menuOpen.value = false
  }, { capture: true, signal: controller.signal })
}, { flush: 'post' })

function choose(track: LyricTrack) {
  menuOpen.value = false
  if (track.id !== props.trackId)
    emit('select', track)
}

onBeforeUnmount(() => {
  clearTimeout(nextLine)
  stopScroll()
  resize.disconnect()
})
</script>

<template>
  <section class="listen-lyrics" :aria-label="t('widescreen.listen_lyrics')">
    <div
      ref="scroller"
      class="listen-lyrics__scroller"
      @wheel.passive="browse"
      @touchmove.passive="browse"
    >
      <ol ref="list" class="listen-lyrics__lines" @click="seek">
        <li v-for="(line, index) in lines" :key="index" class="listen-lyrics__item">
          <button type="button" class="listen-lyrics__line" :data-line="index">
            {{ line.text }}
          </button>
        </li>
      </ol>
    </div>

    <div v-if="tracks.length > 1" ref="menu" class="listen-lyrics__language" @keydown.esc.stop="menuOpen = false">
      <IconButton
        class="listen-lyrics__language-button"
        variant="plain"
        shape="smooth-rect"
        :label="t('widescreen.listen_lyrics_language')"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <i class="i-tabler:language" aria-hidden="true" />
      </IconButton>
      <Transition name="listen-lyrics-menu">
        <div v-if="menuOpen" class="listen-lyrics__menu bew-popover-surface" role="menu">
          <button
            v-for="track in tracks"
            :key="track.id"
            type="button"
            class="listen-lyrics__option"
            role="menuitemradio"
            :aria-checked="track.id === trackId"
            @click="choose(track)"
          >
            <span>{{ track.label }}</span>
            <i v-if="track.id === trackId" class="i-tabler:check listen-lyrics__check" aria-hidden="true" />
          </button>
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../styles/hoverState";
@use "../../styles/scrollEdgeFade";

.listen-lyrics {
  position: relative;
  min-width: 0;
  min-height: 0;
  container-type: size;
}

// Half the column of padding at each end lets the first and the last line
// reach the middle. Lines dim into the edges.
.listen-lyrics__scroller {
  @include scrollEdgeFade.vertical;
  position: relative;
  height: 100%;
  overflow: hidden auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.listen-lyrics__lines {
  display: grid;
  gap: var(--bew-space-1);
  margin: 0;
  padding: 50cqh 0;
  list-style: none;
}

// Depth of field (user-approved 2026-11-12): the line being sung is in focus,
// a touch larger (2026-11-13, transform only), and the others fall away with
// their distance from it.
.listen-lyrics__item {
  opacity: 0.24;
  transform-origin: var(--listen-lyric-origin, center);
  transition:
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    scale var(--bew-duration-moderate) var(--bew-ease-standard);

  &.is-mid {
    opacity: 0.38;
  }

  &.is-near {
    opacity: 0.6;
  }

  &.is-current {
    opacity: 1;
    scale: 1.02;
  }
}

@media (hover: hover) and (pointer: fine) {
  .listen-lyrics__item:not(.is-current):hover {
    opacity: 0.7;
  }
}

.listen-lyrics__line {
  display: block;
  width: 100%;
  padding: var(--bew-space-2) 0;
  border: 0;
  color: var(--bew-text-1);
  background: none;
  font-family: inherit;
  font-size: var(--listen-lyric-size, var(--bew-font-size-heading));
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--listen-lyric-line, var(--bew-line-height-heading));
  text-align: var(--listen-lyric-align, start);
  text-wrap: balance;
  overflow-wrap: anywhere;
  cursor: pointer;

  &:focus-visible {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-0-5);
  }
}

// ---- Language ----

.listen-lyrics__language {
  position: absolute;
  top: 0;
  inset-inline-end: 0;
  z-index: 1;
}

// IconButton's plain variant gives the resting, hover and pressed states.
.listen-lyrics__language-button {
  --bew-icon-button-size: var(--bew-control-item-height);

  width: var(--bew-icon-button-size);
  height: var(--bew-icon-button-size);

  &[aria-expanded="true"] {
    color: var(--bew-text-1);
    background: var(--bew-hover-bg);
  }

  i {
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
  }
}

.listen-lyrics__menu {
  position: absolute;
  top: calc(100% + var(--bew-space-1));
  inset-inline-end: 0;
  display: grid;
  gap: var(--bew-space-1);
  min-width: calc(var(--bew-space-10) * 4);
  max-height: 60cqh;
  padding: var(--bew-popover-padding);
  // The stage is a toned surface: the menu takes its raised colour, not the page's.
  background: var(--bew-elevated-solid);
  overflow: hidden auto;
  overscroll-behavior: contain;
  transform-origin: top right;
}

.listen-lyrics__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  min-height: var(--bew-row-height);
  padding: var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-1);
  background: transparent;
  font-family: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  text-align: start;
  white-space: nowrap;
  cursor: pointer;
  @include hoverState.transition(background-color);

  &:hover,
  &:focus-visible {
    background: var(--bew-hover-bg);
  }
}

.listen-lyrics__check {
  flex: none;
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
}

.listen-lyrics-menu-enter-active,
.listen-lyrics-menu-leave-active {
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}

.listen-lyrics-menu-enter-from,
.listen-lyrics-menu-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .listen-lyrics__item,
  .listen-lyrics-menu-enter-active,
  .listen-lyrics-menu-leave-active {
    transition: none;
  }

  .listen-lyrics__item.is-current {
    scale: none;
  }
}
</style>
