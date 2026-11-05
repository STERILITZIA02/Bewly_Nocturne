<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LoadingRing from '~/components/LoadingRing.vue'
import { getMomentThumbnailUrl } from '~/components/MomentCard/utils'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useDark } from '~/composables/useDark'
import { useImageTone } from '~/composables/useImageTone'
import api from '~/utils/api'
import { readCoverField } from '~/utils/coverField'
import { listenStage } from '~/utils/listenStage'
import { hasLoadedPicture, rememberLoadedPicture } from '~/utils/pictureRevealMemory'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { springTiming } from '~/utils/spring'
import type { NativePlaybackUnit } from '~/utils/videoMetadataBridge'
import { getNativePlaybackUnitKey } from '~/utils/videoMetadataBridge'

/**
 * Listening to a video: the cover takes the picture's place on a field of its
 * own colours, under Bpx's control bar, which plays the audio
 * (listenNativeBar). The cover
 * comes forward while the sound plays and recedes when it stops; the field
 * turns slowly only while it plays.
 */
const { t } = useI18n()
const { isDark } = useDark()
const stage = listenStage

// ---- What is playing --------------------------------------------------------

interface ListenMeta { title: string, cover: string, author?: string, authorMid?: number, detail?: string }
interface VideoInfo { pic?: string, title?: string, owner?: { mid?: number, name?: string }, pages?: { cid: number, page: number, part: string }[] }
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
  const response = await api.video.getVideoInfo(unit.bvid ? { bvid: unit.bvid } : { aid: String(unit.aid) }, { signal }) as { code: number, data?: VideoInfo }
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
    meta.value = await readMeta(unit, controller.signal)
    metaFailed.value = !meta.value
  }
  catch {
    if (!controller.signal.aborted)
      metaFailed.value = true
  }
}, { immediate: true })

const cover = computed(() => meta.value?.cover ? getMomentThumbnailUrl(meta.value.cover, 960) : '')
const coverLoaded = ref(false)
watch(cover, src => coverLoaded.value = !!src && hasLoadedPicture(src), { immediate: true })
function handleCoverLoad() {
  coverLoaded.value = true
  rememberLoadedPicture(cover.value)
}
// The whole cover's average colour, with black or white text on it.
const tone = useImageTone(() => ({ portrait: !!meta.value?.cover, image: meta.value?.cover, edge: 'all' }))

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

const loading = computed(() => !!stage.value && !stage.value.failed && (stage.value.loading || !stage.value.audio || buffering.value))
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

// ---- The cover comes forward while the sound plays ----------------------------

const RECEDED = 0.88
const art = ref<HTMLElement>()
let artMotion: Animation | undefined
const present = computed(() => playing.value && !stage.value?.failed)

function settleArt(from?: number) {
  const element = art.value
  if (!element)
    return
  const target = present.value ? 1 : RECEDED
  const start = from ?? (Number(getComputedStyle(element).scale) || target)
  artMotion?.cancel()
  element.style.scale = String(target)
  if (prefersReducedMotion() || Math.abs(start - target) < 0.001)
    return
  artMotion = element.animate({ scale: [String(start), String(target)] }, springTiming(0.3, Math.abs(target - start) * element.offsetWidth))
}
watch(present, () => settleArt(), { flush: 'post' })
// The stage arrives with its cover rising from further back.
watch(art, element => element && settleArt(RECEDED * 0.92), { flush: 'post' })

// ---- A field in the cover's colours ---------------------------------------------

// Scaled up from the shared 64px field (coverField.ts), so turning it costs a
// transform, not a filter, per frame.
const field = ref<string | null>(null)
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

watch([meta, () => stage.value?.audio], ([info, audio], _previous, onCleanup) => {
  if (!audio || !('mediaSession' in navigator))
    return
  const session = navigator.mediaSession
  session.metadata = new MediaMetadata({
    title: info?.title ?? '',
    artist: info?.author ?? info?.detail ?? '',
    artwork: info?.cover ? [{ src: getMomentThumbnailUrl(info.cover, 512) }] : [],
  })
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
    session.metadata = null
  })
}, { immediate: true })
</script>

<template>
  <Teleport v-if="stage" :to="stage.mount">
    <div class="bewly-wrapper" :class="{ dark: isDark }">
      <section
        class="listen-stage"
        :class="{ 'is-playing': playing }"
        :style="tone"
        :aria-label="t('widescreen.listen')"
      >
        <div class="listen-stage__surface">
          <div
            class="listen-field"
            :class="{ 'is-painted': field }"
            :style="field ? { '--listen-field': `url(${field})` } : undefined"
            aria-hidden="true"
          >
            <span v-for="index in 2" :key="index" class="listen-field__layer" />
          </div>

          <div class="listen-stage__body">
            <button
              ref="art"
              type="button"
              class="listen-art"
              :aria-label="t(playing ? 'widescreen.listen_pause' : 'widescreen.listen_play')"
              :disabled="unavailable"
              @click="toggle"
            >
              <span class="listen-art__face">
                <img
                  v-if="cover"
                  class="listen-art__image"
                  :class="{ 'is-loaded': coverLoaded }"
                  :src="cover"
                  alt=""
                  decoding="async"
                  @load="handleCoverLoad"
                >
                <SkeletonBlock v-else-if="!metaFailed" class="listen-art__image" height="100%" radius="media" />
                <span v-if="loading || stage.failed" class="listen-art__state">
                  <i v-if="stage.failed" class="i-tabler:alert-circle listen-art__glyph" aria-hidden="true" />
                  <LoadingRing v-else :loading="loading" size="var(--bew-icon-size-xl)" />
                </span>
              </span>
            </button>

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
                <SkeletonBlock class="listen-meta__skeleton-title" height="var(--bew-line-height-display)" />
                <SkeletonBlock class="listen-meta__skeleton-detail" height="var(--bew-line-height-subheading)" />
              </template>
              <div v-if="stage.failed" class="listen-meta__error" role="alert">
                <span>{{ t('common.load_failed') }}</span>
                <button type="button" class="listen-meta__retry" :disabled="stage.loading" @click="stage.retry()">
                  {{ t('common.retry') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use "../../styles/contentCard";
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
  --listen-meta: calc(var(--bew-line-height-display) * 2 + var(--bew-line-height-subheading) + var(--bew-space-1));
  --listen-gap: var(--bew-space-5);
  // As wide as the box allows, the cover and its title fitting between the
  // header and the card.
  --listen-art-width: min(
    640px,
    64cqw,
    calc(
      (
          100cqh - var(--listen-top) - var(--listen-card) - var(--bew-space-6) *
            2 - var(--listen-meta) - var(--listen-gap)
        ) *
        40 / 21
    )
  );

  position: absolute;
  inset: 0;
  overflow: hidden;
  container-type: size;
  transition: $tone-transition;
  animation: listen-stage-enter var(--bew-duration-moderate) var(--bew-ease-standard) both;
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
  transform: translate(-50%, -50%);
  animation: listen-field-turn 60s linear infinite paused;

  // Mirrored, so the two pass different colours over each other.
  & + & {
    scale: -1 1;
    opacity: 0.55;
    animation-duration: 42s;
    animation-direction: reverse;
  }
}

.listen-stage.is-playing .listen-field__layer {
  animation-play-state: running;
}

// ---- Cover and title ----

.listen-stage__body {
  position: absolute;
  inset: var(--listen-top) 0 var(--listen-card);
  display: grid;
  place-content: center;
  justify-items: start;
  gap: var(--listen-gap);
  padding: var(--bew-space-6);
}

.listen-art {
  @include contentCard.media-frame;
  position: relative;
  display: block;
  width: var(--listen-art-width);
  aspect-ratio: 40 / 21;
  padding: 0;
  border: 0;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-fill-2);
  box-shadow: var(--bew-shadow-4);
  cursor: pointer;
  scale: 0.88;

  &:disabled {
    cursor: default;
  }

  &:focus-visible {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-1);
  }
}

// Hover and press move the face; the cover's own spring moves the frame.
.listen-art__face {
  position: absolute;
  inset: 0;
  display: block;
  border-radius: inherit;
  corner-shape: inherit;
  overflow: hidden;
  transition: transform var(--bew-duration-fast) var(--bew-ease-standard);
}

@media (hover: hover) and (pointer: fine) {
  .listen-art:not(:disabled):hover .listen-art__face {
    transform: scale(1.015);
  }
}

.listen-art:not(:disabled):active .listen-art__face {
  transform: scale(var(--bew-control-press-scale));
}

.listen-art__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);

  &.is-loaded,
  &[data-bew-skeleton] {
    opacity: 1;
  }
}

.listen-art__state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--bew-cover-scrim);
}

.listen-art__glyph {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
}

.listen-meta {
  display: grid;
  gap: var(--bew-space-1);
  width: var(--listen-art-width);
  min-width: 0;
}

.listen-meta__title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-display);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-display);
}

.listen-meta__detail {
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-subheading);
  line-height: var(--bew-line-height-subheading);
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
  background: var(--bew-fill-2);
  font: inherit;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--bew-fill-3);
  }

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
}

// A short box keeps the title and the card; the cover gives way.
@container (max-height: 300px) {
  .listen-art {
    display: none;
  }
}

@keyframes listen-stage-enter {
  from {
    opacity: 0;
  }
}

@keyframes listen-field-turn {
  to {
    transform: translate(-50%, -50%) rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .listen-stage {
    animation: none;
  }

  .listen-field__layer {
    animation: none;
  }

  .listen-art__face {
    transition: none;
  }

  .listen-art:not(:disabled):is(:hover, :active) .listen-art__face {
    transform: none;
  }
}
</style>
