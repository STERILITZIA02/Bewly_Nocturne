<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

const props = defineProps<{
  /** Back to the last card worked with: shown while it is out of view. */
  jump: boolean
  latest: boolean
  busy: boolean
  status?: string
}>()
const emit = defineEmits<{ jump: [], latest: [], refresh: [] }>()
const { t } = useI18n()

// What is on screen. It follows the props one finished step at a time: the
// buttons that change shrink away, the layout switches at once, then the
// buttons of the new layout float in. Only transform and opacity animate, on
// the compositor, so a busy scrolling feed does not slow them down.
const buttonsRef = ref<HTMLElement | null>(null)
const shownJump = ref(props.jump)
const shownLatest = ref(props.latest)
const animations = new Map<Element, Animation>()
let syncing = false
let disposed = false

const SHOWN = { opacity: 1, transform: 'none' }
const HIDDEN = { opacity: 0, transform: 'scale(0.92)' }

function play(keys: string[], frames: Keyframe[], duration: number, easing: string) {
  const elements = keys.flatMap(key => [...buttonsRef.value?.querySelectorAll(`[data-reading-key="${key}"]`) ?? []])
  return Promise.all(elements.map((element) => {
    const animation = element.animate(frames, { duration, easing, fill: 'forwards' })
    // Replaced only after the new one starts, so nothing flashes in between.
    animations.get(element)?.cancel()
    animations.set(element, animation)
    return animation.finished.catch(() => {})
  }))
}

async function sync() {
  if (syncing)
    return
  syncing = true
  while (shownJump.value !== props.jump || shownLatest.value !== props.latest) {
    const { jump, latest } = props
    const style = buttonsRef.value && getComputedStyle(buttonsRef.value)
    const animate = style && !prefersReducedMotion()
    // A changed first row moves the row below it, so that row leaves and returns too.
    const keys = jump !== shownJump.value ? ['jump', 'latest', 'refresh'] : ['latest', 'refresh']
    if (animate)
      await play(keys, [SHOWN, HIDDEN], getMotionDuration(style, '--bew-duration-fast', 150), 'ease-in')
    if (disposed)
      break
    shownJump.value = jump
    shownLatest.value = latest
    await nextTick()
    // Out then in: the two phases together stay within the 300ms ceiling.
    if (animate)
      await play(keys, [HIDDEN, SHOWN], getMotionDuration(style, '--bew-duration-fast', 150), style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out')
  }
  // Hover, press and the solid fallback own the buttons again.
  for (const animation of animations.values())
    animation.cancel()
  animations.clear()
  syncing = false
}

watch([() => props.jump, () => props.latest], () => {
  if (!disposed)
    void sync()
})
onBeforeUnmount(() => {
  disposed = true
  for (const animation of animations.values())
    animation.cancel()
  animations.clear()
})
</script>

<template>
  <div class="moments-reading" :class="{ 'moments-reading--solid': settings.disableFrostedGlass }">
    <div ref="buttonsRef" class="moments-reading__buttons">
      <button
        v-if="shownJump" type="button" data-reading-key="jump" class="moments-reading__button" :disabled="busy"
        @click="emit('jump')"
      >
        <i i-tabler:history aria-hidden="true" />
        <span class="keep-one-line">{{ t('moments.jump_to_last_seen') }}</span>
      </button>
      <div class="moments-reading__row" :class="{ 'moments-reading__row--single': !shownLatest }">
        <button
          v-if="shownLatest" type="button" data-reading-key="latest" class="moments-reading__button" :disabled="busy"
          @click="emit('latest')"
        >
          <i i-tabler:arrow-bar-to-up aria-hidden="true" />
          <span class="keep-one-line">{{ t('moments.jump_to_latest') }}</span>
        </button>
        <button type="button" data-reading-key="refresh" class="moments-reading__button moments-reading__refresh" :disabled="busy" @click="emit('refresh')">
          <i i-tabler:refresh aria-hidden="true" />
          <span class="keep-one-line">{{ t('moments.refresh_moments') }}</span>
        </button>
      </div>
    </div>
    <Transition name="moments-reading-status">
      <p v-if="status" class="moments-reading__status bew-help" role="status">
        {{ status }}
      </p>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use "../../../styles/sidebarSurface";

.moments-reading {
  flex: none;
  display: grid;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
}
// Always the height of both rows, so a row coming or going lays out only this
// box: the sticky aside shares a grid with the feed, which must not lay out again.
.moments-reading__buttons {
  contain: layout size style;
  height: calc(2 * var(--bew-control-height) + var(--bew-space-2));
  display: grid;
  grid-auto-rows: var(--bew-control-height);
  align-content: start;
  gap: var(--bew-space-2);
}
// Floating glass pills: the same material, rim and lift as the top bar capsule.
.moments-reading__button {
  @include sidebarSurface.floating;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  min-width: 0;
  height: var(--bew-control-height);
  padding-inline: var(--bew-space-3);
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
  i {
    flex: none;
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
  }
  &:is(:hover, :focus-visible):not(:disabled) {
    background: var(--bew-glass-tint-hover);
  }
  &:active:not(:disabled) {
    transform: scale(var(--bew-control-press-scale));
  }
  &:disabled {
    color: var(--bew-text-4);
    cursor: default;
  }
}
.moments-reading--solid .moments-reading__button {
  @include sidebarSurface.solid;
  &:is(:hover, :focus-visible):not(:disabled) {
    background: var(--bew-glass-tint-solid-hover);
  }
}
// Latest and Refresh share a row; without Latest, Refresh fills it.
.moments-reading__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--bew-space-2);
}
.moments-reading__row--single .moments-reading__refresh {
  grid-column: 1 / -1;
}
.moments-reading__status {
  margin: 0;
  padding-inline: var(--bew-space-2);
}
.moments-reading-status-enter-active,
.moments-reading-status-leave-active {
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
}
.moments-reading-status-enter-from,
.moments-reading-status-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .moments-reading__button,
  .moments-reading-status-enter-active,
  .moments-reading-status-leave-active {
    transition: none;
  }
}
</style>
