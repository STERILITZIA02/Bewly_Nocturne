<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { getMomentThumbnailUrl } from '~/components/MomentCard/utils'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useDark } from '~/composables/useDark'
import { useImageTone } from '~/composables/useImageTone'
import api from '~/utils/api'
import { readCoverField } from '~/utils/coverField'
import type { LyricLine, LyricTrack } from '~/utils/listenLyrics'
import { pickLyricTrack, readLyricLines, readLyricTracks } from '~/utils/listenLyrics'
import { LISTEN_TONED_ATTRIBUTE } from '~/utils/listenPlayback'
import { listenStage } from '~/utils/listenStage'
import { getUserID } from '~/utils/main'
import { getPlaybackVideoInfo } from '~/utils/playbackVideoInfo'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { springTiming } from '~/utils/spring'
import type { NativePlaybackUnit } from '~/utils/videoMetadataBridge'
import { claimNativeMediaSession, getNativePlaybackUnitKey } from '~/utils/videoMetadataBridge'

import ListenLyrics from './ListenLyrics.vue'
import ListenTurntable from './ListenTurntable.vue'

/**
 * Listening to a video: a record player takes the picture's place on a field
 * of the cover's own colours, under Bpx's control bar, which plays the audio
 * (listenNativeBar). The record carries the cover as its label
 * (ListenTurntable); a video with subtitles shows them beside or below it as
 * scrolling lyrics (ListenLyrics). The field turns slowly with the record,
 * running up and down at its pace.
 */
const { t, locale } = useI18n()
const { isDark } = useDark()
const stage = listenStage

// ---- What is playing --------------------------------------------------------

interface ListenMeta { title: string, cover: string, author?: string, authorMid?: number, detail?: string }
interface Episode { id?: number, ep_id?: number, cover?: string, title?: string, long_title?: string, show_title?: string }
interface Season { season_title?: string, title?: string, cover?: string, episodes?: Episode[], section?: { episodes?: Episode[] }[] }

async function readMeta(unit: NativePlaybackUnit, signal: AbortSignal): Promise<ListenMeta | null> {
  if (unit.episodeId) {
    const response = await api.anime.getAnimeDetail({ ep_id: unit.episodeId }, { signal }) as { code: number, result?: Season }
    const season = response?.code === 0 ? response.result : undefined
    if (!season)
      return null
    const episode = [...season.episodes ?? [], ...(season.section ?? []).flatMap(section => section.episodes ?? [])]
      .find(item => (item.id ?? item.ep_id) === unit.episodeId)
    return {
      title: season.season_title || season.title || '',
      cover: episode?.cover || season.cover || '',
      detail: episode?.show_title || [episode?.title, episode?.long_title].filter(Boolean).join(' '),
    }
  }
  const response = await getPlaybackVideoInfo(unit.bvid ? { bvid: unit.bvid } : { aid: String(unit.aid) }, signal)
  const info = response?.code === 0 ? response.data : undefined
  if (!info)
    return null
  const part = (info.pages?.length ?? 0) > 1 ? info.pages!.find(page => page.cid === unit.cid) : undefined
  return {
    title: info.title ?? '',
    cover: info.pic ?? '',
    author: info.owner?.name,
    authorMid: info.owner?.mid,
    detail: part ? `P${part.page} ${part.part}` : undefined,
  }
}

const meta = shallowRef<ListenMeta | null>(null)
const metaFailed = ref(false)
watch(() => stage.value && getNativePlaybackUnitKey(stage.value.unit), async (key, _previous, onCleanup) => {
  meta.value = null
  metaFailed.value = false
  const unit = stage.value?.unit
  if (!key || !unit)
    return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const result = await readMeta(unit, controller.signal)
    if (!controller.signal.aborted) {
      meta.value = result
      metaFailed.value = !result
    }
  }
  catch {
    if (!controller.signal.aborted)
      metaFailed.value = true
  }
}, { immediate: true })

const cover = computed(() => meta.value?.cover ? getMomentThumbnailUrl(meta.value.cover, 480) : '')
// The whole cover's average colour, with black or white text on it.
const tone = useImageTone(() => ({ portrait: !!meta.value?.cover, image: meta.value?.cover, edge: 'all' }))

// The playback page's control card is glass in the page's colours; under the
// stage it takes the stage's (user-approved 2026-11-12). The tone goes on the
// player root, where videoPlayer.scss derives the card's tokens from it, and
// leaves with the session, before the stage dissolves. The root is read from
// each published stage: Bilibili may rebuild the player and the stage host
// moves to the new one (listenControl.ts) with the same mount.
function playerRoot() {
  const current = stage.value
  return current && !current.leaving ? (current.mount.getRootNode() as ShadowRoot).host?.parentElement ?? null : null
}
watch([tone, playerRoot], ([colors, root], _previous, onCleanup) => {
  if (!root || !colors)
    return
  const names = Object.keys(colors)
  for (const name of names)
    root.style.setProperty(name, String(colors[name as keyof typeof colors]))
  root.setAttribute(LISTEN_TONED_ATTRIBUTE, '')
  onCleanup(() => {
    for (const name of names)
      root.style.removeProperty(name)
    root.removeAttribute(LISTEN_TONED_ATTRIBUTE)
  })
}, { immediate: true })

// ---- The audio's state --------------------------------------------------------

const playing = ref(false)
const buffering = ref(false)

watch(() => stage.value?.audio, (audio, _previous, onCleanup) => {
  if (!audio) {
    playing.value = buffering.value = false
    return
  }
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const read = () => playing.value = !audio.paused && !audio.ended
  read()
  for (const name of ['play', 'pause', 'ended'])
    audio.addEventListener(name, read, { signal: controller.signal })
  audio.addEventListener('waiting', () => buffering.value = !audio.paused, { signal: controller.signal })
  for (const name of ['playing', 'pause', 'canplay', 'ended', 'emptied'])
    audio.addEventListener(name, () => buffering.value = false, { signal: controller.signal })
}, { immediate: true })

const loading = computed(() => !!stage.value && !stage.value.failed && !stage.value.leaving && (stage.value.loading || !stage.value.audio || buffering.value))
const unavailable = computed(() => !stage.value?.audio || !!stage.value.failed)

function toggle() {
  const audio = stage.value?.audio
  if (!audio || stage.value?.failed)
    return
  if (audio.paused || audio.ended)
    void audio.play().catch(() => {})
  else
    audio.pause()
}

const present = computed(() => playing.value && !stage.value?.failed)

// ---- Lyrics: the video's subtitles ----------------------------------------------

// Read for the signed-in account, one request per part and per track
// (listenLyrics.ts); a new part, another track or leaving cancels the wait.
const tracks = shallowRef<LyricTrack[]>([])
const chosenTrack = ref<string>()
const lines = shallowRef<LyricLine[]>([])
watch(() => stage.value && getNativePlaybackUnitKey(stage.value.unit), async (key, _previous, onCleanup) => {
  tracks.value = []
  chosenTrack.value = undefined
  const unit = stage.value?.unit
  if (!key || !unit)
    return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const result = await readLyricTracks(unit, getUserID(), controller.signal)
    if (!controller.signal.aborted)
      tracks.value = result
  }
  catch { /* A video without readable subtitles has no lyrics. */ }
}, { immediate: true })
const track = computed(() => tracks.value.find(item => item.id === chosenTrack.value) ?? pickLyricTrack(tracks.value, locale.value))
watch(track, async (current, _previous, onCleanup) => {
  if (!current) {
    lines.value = []
    return
  }
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    // The lines shown stay until the other track's arrive.
    const result = await readLyricLines(current, getUserID(), controller.signal)
    if (!controller.signal.aborted)
      lines.value = result
  }
  catch {
    if (!controller.signal.aborted)
      lines.value = []
  }
}, { immediate: true })
const hasLyrics = computed(() => lines.value.length > 0)

// The record and its title give way to the lyrics, or take the stage back,
// in one move from where they were painted.
const main = ref<HTMLElement>()
watch(hasLyrics, async () => {
  const element = main.value
  if (!element || prefersReducedMotion() || typeof element.animate !== 'function')
    return
  const before = element.getBoundingClientRect()
  await nextTick()
  const after = element.getBoundingClientRect()
  if (!before.width || !after.width)
    return
  const x = before.left - after.left
  const y = before.top - after.top
  element.animate(
    { transformOrigin: ['0 0', '0 0'], transform: [`translate(${x}px, ${y}px) scale(${before.width / after.width})`, 'none'] },
    springTiming(0.3, Math.hypot(x, y)),
  )
})

// ---- Arriving -----------------------------------------------------------------------

// The picture's last frame lies under the stage while it fades in
// (listenStageMotion.ts) and goes once the stage covers it.
let arrived = prefersReducedMotion()
function handleArrived() {
  arrived = true
  stage.value?.frame?.remove()
}
watch(() => stage.value?.frame, frame => arrived && frame?.remove(), { immediate: true })

// ---- A field in the cover's colours ---------------------------------------------

// Scaled up from the shared 64px field (coverField.ts), so turning it costs a
// transform, not a filter, per frame.
const field = ref<string | null>(null)
const fieldLayers = ref<HTMLElement[]>([])

/**
 * The field turns at the record's pace: the record's own ramp (ListenTurntable)
 * sets the speed of the layers' endless turns, so the whole stage runs up and
 * settles together. The turns are CSS animations, paused until then; reduced
 * motion has none.
 */
function paceField(rate: number) {
  for (const layer of fieldLayers.value) {
    for (const animation of layer.getAnimations()) {
      animation.playbackRate = rate
      if (rate)
        animation.play()
      else
        animation.pause()
    }
  }
}
watch(() => meta.value?.cover, async (source, _previous, onCleanup) => {
  field.value = null
  if (!source)
    return
  let current = true
  onCleanup(() => current = false)
  const url = await readCoverField(getMomentThumbnailUrl(source, 160))
  if (current)
    field.value = url
}, { immediate: true })

// ---- System media controls --------------------------------------------------------

watch(() => stage.value?.audio, (audio, _previous, onCleanup) => {
  if (!audio || !('mediaSession' in navigator))
    return
  const session = navigator.mediaSession
  const restore = claimNativeMediaSession()
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => void audio.play().catch(() => {})],
    ['pause', () => audio.pause()],
    ['seekbackward', details => audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset ?? 10))],
    ['seekforward', details => audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (details.seekOffset ?? 10))],
    ['seekto', (details) => {
      if (details.seekTime !== undefined)
        audio.currentTime = details.seekTime
    }],
  ]
  // A browser without one of these actions throws for it.
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      session.setActionHandler(action, handler)
    }
    catch {}
  }
  actions.forEach(([action, handler]) => set(action, handler))
  onCleanup(() => {
    actions.forEach(([action]) => set(action, null))
    restore()
  })
}, { immediate: true })
watch([meta, () => stage.value?.audio], ([info, audio]) => {
  if (audio && 'mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: info?.title ?? '',
      artist: info?.author ?? info?.detail ?? '',
      artwork: info?.cover ? [{ src: getMomentThumbnailUrl(info.cover, 512) }] : [],
    })
  }
}, { immediate: true })
</script>

<template>
  <Teleport v-if="stage" :to="stage.mount">
    <div class="bewly-wrapper" :class="{ dark: isDark }">
      <section
        class="listen-stage"
        :class="{ 'is-leaving': stage.leaving }"
        :style="tone"
        :aria-label="t('widescreen.listen')"
        @animationend.self="handleArrived"
      >
        <div class="listen-stage__surface">
          <div
            class="listen-field"
            :class="{ 'is-painted': field }"
            :style="field ? { '--listen-field': `url(${field})` } : undefined"
            aria-hidden="true"
          >
            <span v-for="index in 2" :key="index" ref="fieldLayers" class="listen-field__layer" />
          </div>

          <div class="listen-stage__body" :class="{ 'has-lyrics': hasLyrics }">
            <div ref="main" class="listen-main">
              <ListenTurntable
                class="listen-main__deck"
                :cover="cover"
                :pending="!meta && !metaFailed"
                :playing="present"
                :audio="stage.audio"
                :loading="loading"
                :failed="stage.failed"
                :disabled="unavailable"
                :label="t(playing ? 'widescreen.listen_pause' : 'widescreen.listen_play')"
                @toggle="toggle"
                @rate="paceField"
              />

              <div class="listen-meta">
                <template v-if="meta">
                  <h2 class="listen-meta__title keep-two-lines">
                    {{ meta.title }}
                  </h2>
                  <p v-if="meta.author || meta.detail" class="listen-meta__detail keep-one-line">
                    <a
                      v-if="meta.author && meta.authorMid"
                      class="listen-meta__author"
                      :href="`https://space.bilibili.com/${meta.authorMid}`"
                      target="_blank"
                      rel="noopener"
                    >{{ meta.author }}</a>
                    <template v-if="meta.author && meta.detail">
                      ·
                    </template>
                    <template v-if="meta.detail">
                      {{ meta.detail }}
                    </template>
                  </p>
                </template>
                <template v-else-if="!metaFailed">
                  <SkeletonBlock class="listen-meta__skeleton-title" height="var(--bew-line-height-heading)" />
                  <SkeletonBlock class="listen-meta__skeleton-detail" height="var(--bew-line-height-callout)" />
                </template>
                <div v-if="stage.failed" class="listen-meta__error" role="alert">
                  <span>{{ t('common.load_failed') }}</span>
                  <button type="button" class="listen-meta__retry" :disabled="stage.loading" @click="stage.retry()">
                    {{ t('common.retry') }}
                  </button>
                </div>
              </div>
            </div>

            <Transition name="listen-lyrics">
              <ListenLyrics
                v-if="hasLyrics"
                class="listen-stage__lyrics"
                :lines="lines"
                :audio="stage.audio"
                :tracks="tracks"
                :track-id="track?.id ?? ''"
                @select="chosenTrack = $event.id"
              />
            </Transition>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use "../../styles/hoverState";
@use "../../styles/imageTone" as *;

// The fallbacks sit on the host and the overrides on the surface (as in
// LibraryHero): until the cover's colour is read the stage is a page surface.
.listen-stage {
  --moment-tone: var(--bew-elevated-over-page);
  --moment-tone-fg: var(--bew-neutral-fg);
  // Clear of the playback page's header (layout.ts) and of Bpx's control bar:
  // on the playback page its glass card as measured (geometry.ts) with the
  // inset below and a gap above, on the native page two control rows.
  --listen-top: var(--bewly-listen-top, var(--bew-space-6));
  --listen-inset: var(--bewly-widescreen-card-inset, var(--bew-space-3));
  --listen-card: calc(
    var(--bewly-widescreen-controls-glass-height, var(--bew-control-height) * 2) + var(--listen-inset) * 2
  );

  position: absolute;
  inset: 0;
  overflow: hidden;
  container-type: size;
  transition: $tone-transition;
  animation: listen-stage-enter var(--bew-duration-moderate) var(--bew-ease-standard) backwards;
}

.listen-stage__surface {
  @include toned-surface;
  position: absolute;
  inset: 0;
  isolation: isolate;
  background: var(--moment-tone);
}

// ---- Field ----

.listen-field {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  opacity: 0;
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);

  &.is-painted {
    opacity: 1;
  }

  // A veil of the average colour keeps the text's contrast where the cover's
  // colours swing away from it.
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--moment-tone) 40%, transparent);
  }
}

// Squares wider than the box's diagonal, so a turn never shows a corner.
.listen-field__layer {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 160cqmax;
  height: 160cqmax;
  background: var(--listen-field) center / cover no-repeat;
  // Individual properties only: they compose translate, rotate, scale, so the
  // mirror below flips the square in place. A `scale` beside a `transform`
  // translate would mirror it about its untranslated centre and push it a
  // whole side off, its corner turning in at the box's edge.
  translate: -50% -50%;
  // Paused here; the record's ramp plays and paces it (paceField).
  animation: listen-field-turn 60s linear infinite paused;

  // Mirrored, so the two pass different colours over each other.
  & + & {
    scale: -1 1;
    opacity: 0.55;
    animation-duration: 42s;
    animation-direction: reverse;
  }
}

// ---- Layout ----

// Between the header and the control card. The record is sized from what the
// box leaves: its own square plus the arm's reach above it (0.19 of its
// width) and the title under it. Alone it takes the middle; with lyrics it
// shares the box with them, below it in a box that is square or upright and
// beside it in a wide one (user-specified). Its largest sizes are multiples of
// a spacing step, so they follow the interface size like the rest.
.listen-stage__body {
  --listen-pad: var(--bew-space-6);
  --listen-gap: var(--bew-space-5);
  --listen-height: calc(100cqh - var(--listen-top) - var(--listen-card) - var(--listen-pad) * 2);
  --listen-width: calc(100cqw - var(--listen-pad) * 2);
  // The title under the record: the gap to it, two lines and the detail line.
  --listen-title-gap: var(--bew-space-4);
  --listen-meta: calc(
    var(--listen-title-gap) + var(--bew-line-height-heading) * 2 + var(--bew-line-height-callout) + var(--bew-space-1)
  );
  --listen-disc: min(
    calc(var(--bew-space-10) * 14),
    calc(var(--listen-width) / 1.4),
    calc((var(--listen-height) - var(--listen-meta)) / 1.19)
  );
  --listen-lyric-size: var(--bew-font-size-heading);
  --listen-lyric-line: var(--bew-line-height-heading);

  position: absolute;
  inset: var(--listen-top) 0 var(--listen-card);
  display: grid;
  grid-template-columns: minmax(0, auto);
  place-content: center;
  justify-items: center;
  gap: var(--listen-gap);
  padding: var(--listen-pad);

  // Below the record: it keeps half the height, the lyrics take the rest.
  &.has-lyrics {
    --listen-disc: min(
      calc(var(--bew-space-10) * 12),
      calc(var(--listen-width) / 1.4),
      calc((var(--listen-height) - var(--listen-gap) - var(--listen-meta)) * 0.5 / 1.19)
    );

    grid-template-rows: auto minmax(0, 1fr);
    align-content: stretch;
  }
}

// The arm stands above the record's top edge.
.listen-main {
  display: grid;
  justify-items: center;
  gap: var(--listen-title-gap);
  min-width: 0;
  padding-top: calc(var(--listen-disc) * 0.19);
}

// Transform only: fading the record would cut its glass off from the field
// behind it for the length of the fade.
.listen-main__deck {
  animation: listen-settle var(--bew-duration-moderate) var(--bew-ease-standard) backwards;
  transition: transform var(--bew-duration-moderate) var(--bew-ease-standard);
}

.listen-stage__lyrics {
  --listen-lyric-align: center;

  align-self: stretch;
  justify-self: center;
  width: min(var(--listen-width), calc(var(--bew-space-10) * 14));
  animation: listen-rise var(--bew-duration-moderate) var(--bew-ease-standard) backwards;
}

.listen-lyrics-leave-active {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.listen-lyrics-leave-to {
  opacity: 0;
}

@container (min-aspect-ratio: 3 / 2) {
  // Beside the record, across the arm's reach on its right.
  .listen-stage__body.has-lyrics {
    --listen-disc: min(
      calc(var(--bew-space-10) * 13),
      calc(var(--listen-width) * 0.36),
      calc((var(--listen-height) - var(--listen-meta)) / 1.19)
    );
    --listen-lyric-size: var(--bew-font-size-display);
    --listen-lyric-line: var(--bew-line-height-display);

    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: auto minmax(0, calc(var(--bew-space-10) * 12));
    align-items: center;
    column-gap: var(--bew-space-12);
  }

  .listen-stage__lyrics {
    --listen-lyric-align: start;
    --listen-lyric-origin: 0 50%;

    width: 100%;
  }
}

// Leaving: the record settles back as the needle lifts; the host fades the
// whole stage over the returning picture (listenStageMotion.ts).
.listen-stage.is-leaving .listen-main__deck {
  transform: scale(0.94);
}

// ---- Title ----

// The record is the stage's one subject (user-approved 2026-11-12): the title
// is a heading under it, not a display line beside it.

.listen-meta {
  display: grid;
  justify-items: center;
  gap: var(--bew-space-1);
  width: min(var(--listen-width), calc(var(--listen-disc) * 1.4));
  min-width: 0;
  text-align: center;
  animation: listen-rise var(--bew-duration-moderate) var(--bew-ease-standard) backwards;
}

.listen-meta__title {
  max-width: 100%;
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-heading);
}

.listen-meta__detail {
  max-width: 100%;
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
}

.listen-meta__author {
  color: inherit;
  text-decoration: none;
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover,
  &:focus-visible {
    color: var(--bew-text-1);
  }
}

.listen-meta__skeleton-title {
  width: 72%;
}

.listen-meta__skeleton-detail {
  width: 40%;
}

.listen-meta__error {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
}

.listen-meta__retry {
  height: var(--bew-control-item-height, 28px);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font: inherit;
  cursor: pointer;
  @include hoverState.transition(background-color, "&:hover:not(:disabled)");

  &:hover:not(:disabled) {
    background: var(--bew-fill-2);
  }

  &:disabled {
    cursor: default;
    opacity: var(--bew-disabled-opacity);
  }
}

// A short box keeps the title and the card; the record and the lyrics give way.
@container (max-height: 300px) {
  .listen-main__deck,
  .listen-stage__lyrics {
    display: none;
  }

  .listen-main {
    padding-top: 0;
  }
}

@keyframes listen-stage-enter {
  from {
    opacity: 0;
  }
}

@keyframes listen-settle {
  from {
    transform: translateY(var(--bew-space-3)) scale(0.94);
  }
}

@keyframes listen-rise {
  from {
    opacity: 0;
    transform: translateY(var(--bew-space-3));
  }
}

@keyframes listen-field-turn {
  to {
    rotate: 1turn;
  }
}

@media (prefers-reduced-motion: reduce) {
  .listen-stage,
  .listen-main__deck,
  .listen-meta,
  .listen-stage__lyrics {
    animation: none;
  }

  .listen-field__layer {
    animation: none;
  }

  .listen-main__deck,
  .listen-lyrics-leave-active {
    transition: none;
  }
}
</style>
