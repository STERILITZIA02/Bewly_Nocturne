<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import LoadingRing from '~/components/LoadingRing.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { hasLoadedPicture, rememberLoadedPicture } from '~/utils/pictureRevealMemory'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { landingResponse, springTiming, stepCriticalSpring } from '~/utils/spring'

/**
 * A record player in place of the picture (user-specified 2026-11-10): a
 * glass record with its grooves and the video's cover as its label, under a
 * tonearm. It behaves as one does. While the sound plays the record turns and
 * the needle rests in the groove, travelling inward with the track; when it
 * stops the arm lifts away and the record runs down.
 */
const props = defineProps<{
  cover: string
  /** The cover is still unknown (not: there is none). */
  pending: boolean
  /** The sound is playing: the record turns under the needle. */
  playing: boolean
  audio: HTMLAudioElement | null
  loading: boolean
  failed: boolean
  disabled: boolean
  label: string
}>()
const emit = defineEmits<{
  toggle: []
  /** The record's speed as a share of full speed, each frame it runs up or down. */
  rate: [rate: number]
}>()

// ---- Label -------------------------------------------------------------------

const coverLoaded = ref(false)
watch(() => props.cover, src => coverLoaded.value = !!src && hasLoadedPicture(src), { immediate: true })
function handleCoverLoad() {
  coverLoaded.value = true
  rememberLoadedPicture(props.cover)
}

// ---- The record turns ----------------------------------------------------------

/** One turn; the reference's pace (420° in six seconds, slowed a little for a picture label). */
const TURN_MS = 6000
const SPIN_RESPONSE = landingResponse(0.3)
const spin = ref<HTMLElement>()
let rotation: Animation | undefined
let rate = 0
let rateVelocity = 0
let rampFrame = 0

/**
 * The turn itself is the browser's (one endless rotation on the compositor);
 * only its speed is stepped here, for the few frames a record takes to run up
 * or down, by real elapsed time.
 */
function turn(target: 0 | 1) {
  cancelAnimationFrame(rampFrame)
  const element = spin.value
  if (!element || typeof element.animate !== 'function')
    return
  if (prefersReducedMotion()) {
    rotation?.pause()
    rate = rateVelocity = 0
    return
  }
  if (!rotation) {
    if (!target)
      return
    rotation = element.animate({ rotate: ['0turn', '1turn'] }, { duration: TURN_MS, iterations: Infinity })
    rotation.playbackRate = 0
  }
  rotation.play()
  let last = performance.now()
  const step = (now: number) => {
    const next = stepCriticalSpring(rate, rateVelocity, target, Math.min(0.064, (now - last) / 1000), SPIN_RESPONSE)
    last = now
    rate = next.position
    rateVelocity = next.velocity
    if (Math.abs(rate - target) < 0.01) {
      rate = target
      rateVelocity = 0
    }
    rotation!.playbackRate = Math.max(0, rate)
    emit('rate', Math.max(0, rate))
    if (rate !== target)
      rampFrame = requestAnimationFrame(step)
    else if (!target)
      rotation!.pause()
  }
  rampFrame = requestAnimationFrame(step)
}

// ---- The tonearm ---------------------------------------------------------------

// Degrees about the pivot; 0 hangs the needle straight down, off the record.
const ARM_REST = -2
// The needle on the outermost groove and at the label's edge.
const ARM_FIRST_GROOVE = 13.5
const ARM_LAST_GROOVE = 27
// The arm's length as a share of the record's width (157 of the 200 units).
const ARM_LENGTH = 0.785
const arm = ref<SVGSVGElement>()
let armAngle = ARM_REST
let armMotion: Animation | undefined

function armTarget() {
  if (!props.playing)
    return ARM_REST
  const audio = props.audio
  const progress = audio && audio.duration > 0 ? Math.min(1, Math.max(0, audio.currentTime / audio.duration)) : 0
  return ARM_FIRST_GROOVE + (ARM_LAST_GROOVE - ARM_FIRST_GROOVE) * progress
}

/** A lift, a drop or a seek swings the arm; the track's own progress just places it. */
function moveArm() {
  const element = arm.value
  if (!element)
    return
  const target = armTarget()
  const swing = Math.abs(target - armAngle) > 0.25
  const from = swing && armMotion ? Number.parseFloat(getComputedStyle(element).rotate) || armAngle : armAngle
  armAngle = target
  element.style.rotate = `${target}deg`
  // Progress arrives while the needle is still dropping: the swing in flight
  // keeps going and lands on the place just written.
  if (!swing)
    return
  armMotion?.cancel()
  armMotion = undefined
  if (prefersReducedMotion() || typeof element.animate !== 'function')
    return
  const travel = Math.abs(target - from) * Math.PI / 180 * ARM_LENGTH * (element.parentElement?.offsetWidth ?? 0)
  const motion = element.animate({ rotate: [`${from}deg`, `${target}deg`] }, springTiming(0.3, travel))
  armMotion = motion
  void motion.finished.then(() => {
    if (armMotion === motion)
      armMotion = undefined
  }, () => {})
}

watch(() => props.playing, (playing) => {
  turn(playing ? 1 : 0)
  moveArm()
}, { flush: 'post' })
watch([spin, arm], () => {
  if (props.playing)
    turn(1)
  moveArm()
}, { flush: 'post' })
watch(() => props.audio, (audio, _previous, onCleanup) => {
  if (!audio)
    return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  for (const name of ['timeupdate', 'seeked', 'durationchange'])
    audio.addEventListener(name, moveArm, { signal: controller.signal })
}, { immediate: true })

onBeforeUnmount(() => {
  cancelAnimationFrame(rampFrame)
  rotation?.cancel()
  armMotion?.cancel()
})
</script>

<template>
  <div class="listen-deck" :class="{ 'is-playing': playing }">
    <button
      type="button"
      class="listen-record"
      :aria-label="label"
      :disabled="disabled"
      @click="emit('toggle')"
    >
      <span class="listen-record__body">
        <!-- Still: the glass and the light on it. -->
        <span class="listen-record__glass" aria-hidden="true" />
        <!-- Turning: the grooves and the label. -->
        <span ref="spin" class="listen-record__spin">
          <span class="listen-record__grooves" aria-hidden="true" />
          <span class="listen-record__label">
            <Transition name="listen-label">
              <img
                v-if="cover"
                :key="cover"
                class="listen-record__cover"
                :class="{ 'is-loaded': coverLoaded }"
                :src="cover"
                alt=""
                decoding="async"
                @load="handleCoverLoad"
              >
              <SkeletonBlock v-else-if="pending" class="listen-record__cover is-loaded" width="79%" height="79%" radius="circle" />
            </Transition>
          </span>
        </span>
        <span class="listen-record__sheen" aria-hidden="true" />
        <span v-if="loading || failed" class="listen-record__state">
          <i v-if="failed" class="i-tabler:alert-circle listen-record__glyph" aria-hidden="true" />
          <LoadingRing v-else :loading="loading" size="var(--bew-icon-size-xl)" />
        </span>
      </span>
    </button>

    <!-- 200 units to the record's width, the pivot at the origin. -->
    <svg ref="arm" class="listen-arm" viewBox="-28 -44 56 212" aria-hidden="true">
      <!-- Counterweight, behind the pivot. -->
      <rect
        x="-7" y="-41" width="14" height="24" rx="4"
        class="listen-arm__part"
      />
      <path d="M-7 -33h14M-7 -29h14M-7 -25h14" class="listen-arm__ridge" />
      <!-- The wand, the headshell and its finger lift. -->
      <path d="M0 0 12.1 133.4" class="listen-arm__wand" />
      <path d="M12.6 132.6 1.6 153.4" class="listen-arm__shell" />
      <path d="M3.4 150.4 10.4 154.2" class="listen-arm__lift" />
      <path d="M1 154.6 0 159" class="listen-arm__needle" />
      <!-- The bearing. -->
      <circle r="24" class="listen-arm__halo" />
      <circle r="16" class="listen-arm__part" />
      <circle r="9" class="listen-arm__cap" />
    </svg>
  </div>
</template>

<style scoped lang="scss">
// The deck is the record's own square (--listen-disc, set by the stage); the
// arm reaches past its top and right, where the stage keeps room.
.listen-deck {
  --disc: var(--listen-disc);
  // The label: the black ring around the cover, as shares of the record.
  --label: calc(var(--disc) * 0.48);
  --ink: var(--moment-tone-fg, #fff);

  position: relative;
  flex: none;
  width: var(--disc);
  height: var(--disc);
}

.listen-record {
  position: absolute;
  inset: 0;
  display: block;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: none;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }

  &:focus-visible {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-1);
  }
}

.listen-record__body {
  position: absolute;
  inset: 0;
  display: block;
  border-radius: 50%;
  box-shadow: var(--bew-shadow-1);
  transition: transform var(--bew-duration-fast) var(--bew-ease-standard);
}

.listen-record:not(:disabled):active .listen-record__body {
  transform: scale(var(--bew-control-press-scale));
}

// The record is glass over the field: the shared frosted filter (it follows
// the global blur strength and the frosted-glass switch) under a thin share of
// the glass tint, so the field's colours stay readable through the vinyl, a
// soft light toward the label and a fine rim.
.listen-record__glass {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(
      circle,
      color-mix(in srgb, var(--ink) 16%, transparent) 24%,
      color-mix(in srgb, var(--ink) 5%, transparent) 62%,
      color-mix(in srgb, var(--ink) 10%, transparent) 100%
    ),
    rgb(from var(--bew-glass-tint-solid) r g b / calc(var(--bew-glass-opacity) * 0.3));
  box-shadow: inset 0 0 0 var(--bew-hairline) color-mix(in srgb, var(--ink) 28%, transparent);
  backdrop-filter: var(--bew-filter-glass-1);
}

.listen-record__spin {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
}

// Concentric grooves from the label's edge to just inside the rim, one
// hairline every 1.15% of the record's width.
.listen-record__grooves {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-radial-gradient(
    circle,
    transparent 0 calc(var(--disc) * 0.0115 - 1px),
    color-mix(in srgb, var(--ink) 20%, transparent) calc(var(--disc) * 0.0115 - 1px) calc(var(--disc) * 0.0115)
  );
  // A faint unevenness around the circle, so the turning shows in the vinyl
  // itself and not only in the label.
  mask-image:
    radial-gradient(
      circle closest-side,
      transparent calc(var(--label) / 2 + 1px),
      #000 calc(var(--label) / 2 + 2px) 97%,
      transparent 98.5%
    ),
    conic-gradient(#000, rgb(0 0 0 / 55%) 18%, #000 36%, rgb(0 0 0 / 70%) 61%, #000 82%, rgb(0 0 0 / 60%) 93%, #000);
  mask-composite: intersect;
}

.listen-record__label {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--label);
  height: var(--label);
  border-radius: 50%;
  background: #0b0b0b;
  box-shadow: 0 0 0 var(--bew-hairline) rgb(255 255 255 / 12%);
}

.listen-record__cover {
  grid-area: 1 / 1;
  width: 79%;
  height: 79%;
  border-radius: 50%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);

  &.is-loaded {
    opacity: 1;
  }
}

// A new track's cover fades in over the last one's.
.listen-label-leave-active {
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
}

.listen-label-leave-to {
  opacity: 0;
}

// Light across the vinyl, fixed in the room while the record turns under it.
.listen-record__sheen {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  // One lamp, up and to the left: its streak runs across the vinyl toward the
  // lower right, the way the arm's shadow falls.
  background: conic-gradient(
    from 265deg,
    transparent 0 8%,
    color-mix(in srgb, var(--ink) 9%, transparent) 14%,
    transparent 22% 56%,
    color-mix(in srgb, var(--ink) 7%, transparent) 63%,
    transparent 72%
  );
  mask-image: radial-gradient(
    circle closest-side,
    transparent calc(var(--label) / 2),
    #000 calc(var(--label) / 2 + 1px)
  );
  pointer-events: none;
  // At rest the light on the vinyl dims; it comes up as the record turns.
  opacity: 0.6;
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
}

.listen-deck.is-playing .listen-record__sheen {
  opacity: 1;
}

.listen-record__state {
  position: absolute;
  inset: calc((var(--disc) - var(--label) * 0.79) / 2);
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: var(--bew-cover-scrim);
}

.listen-record__glyph {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
}

// The pivot stands off the record's top right corner (1.04 and 0.035 of its
// width from the deck's left and top); the drawing turns about it.
.listen-arm {
  --unit: calc(var(--disc) / 200);

  position: absolute;
  top: calc(var(--disc) * 0.035 - var(--unit) * 44);
  left: calc(var(--disc) * 1.04 - var(--unit) * 28);
  width: calc(var(--unit) * 56);
  height: calc(var(--unit) * 212);
  overflow: visible;
  rotate: -2deg;
  transform-origin: 50% calc(100% * 44 / 212);
  filter: drop-shadow(calc(var(--unit) * 1) calc(var(--unit) * 1.5) calc(var(--unit) * 3) rgb(0 0 0 / 16%));
  pointer-events: none;
}

.listen-arm__part {
  fill: #f7f7f7;
}

.listen-arm__cap {
  fill: #fff;
  stroke: rgb(0 0 0 / 10%);
  stroke-width: 0.6;
}

.listen-arm__halo {
  fill: rgb(255 255 255 / 20%);
  stroke: rgb(255 255 255 / 45%);
  stroke-width: 0.6;
}

.listen-arm__ridge {
  fill: none;
  stroke: rgb(0 0 0 / 14%);
  stroke-width: 0.8;
}

.listen-arm__wand,
.listen-arm__shell,
.listen-arm__lift,
.listen-arm__needle {
  fill: none;
  stroke: #f7f7f7;
  stroke-linecap: round;
}

.listen-arm__wand {
  stroke-width: 3.4;
}

.listen-arm__shell {
  stroke-width: 7.5;
}

.listen-arm__lift {
  stroke-width: 1.8;
}

.listen-arm__needle {
  stroke-width: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  .listen-record__body,
  .listen-record__cover,
  .listen-record__sheen,
  .listen-label-leave-active {
    transition: none;
  }

  .listen-record:not(:disabled):active .listen-record__body {
    transform: none;
  }
}
</style>
