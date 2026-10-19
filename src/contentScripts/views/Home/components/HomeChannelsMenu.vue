<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import { computed, inject, nextTick, onScopeDispose, ref, useId } from 'vue'

import ChannelsPop from '~/components/TopBar/components/pops/ChannelsPop.vue'
import { useAnchoredPopoverPosition } from '~/composables/useAnchoredPopoverPosition'
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { settings } from '~/logic'

const app = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const trigger = ref<HTMLButtonElement>()
const panel = ref<InstanceType<typeof ChannelsPop>>()
const open = ref(false)
const panelId = useId()
const target = computed(() => {
  const root = trigger.value?.getRootNode()
  return app?.mainAppRef.value ?? (root?.nodeType === 11 ? root as ShadowRoot : trigger.value?.ownerDocument.body)
})
let closeTimer: ReturnType<typeof setTimeout> | undefined
let pinnedOpen = false
function keepOpen() {
  clearTimeout(closeTimer)
  closeTimer = undefined
}
function close(restoreFocus = false) {
  keepOpen()
  open.value = false
  pinnedOpen = false
  if (restoreFocus)
    trigger.value?.focus({ preventScroll: true })
}
function enter(event: PointerEvent) {
  keepOpen()
  if (event.pointerType === 'mouse' && !settings.value.touchScreenOptimization)
    open.value = true
}
function leave() {
  keepOpen()
  closeTimer = setTimeout(() => {
    const element = panel.value?.$el as HTMLElement | undefined
    if (!pinnedOpen && !element?.matches(':focus-within'))
      close()
  }, 200)
}
async function toggle(event: MouseEvent) {
  keepOpen()
  // Clicking an already-hovered trigger keeps the panel open; a second click
  // closes it. Touch/keyboard openings remain available until dismissed.
  if (event.detail > 0 && open.value && !pinnedOpen) {
    pinnedOpen = true
    return
  }
  open.value = !open.value
  pinnedOpen = open.value
  if (open.value && event.detail === 0) {
    await nextTick()
    ;(panel.value?.$el as HTMLElement | undefined)?.querySelector<HTMLElement>('a')?.focus()
  }
}
function focusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  const element = panel.value?.$el as HTMLElement | undefined
  if (!next || (!element?.contains(next) && !trigger.value?.contains(next)))
    close()
}
useAnchoredPopoverPosition(trigger, panel, open)
onClickOutside(panel, () => close(), { ignore: [trigger] })
useEventListener(window, 'blur', () => close())
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden)
    close()
})
onScopeDispose(keepOpen)
</script>

<template>
  <div class="home-channels-menu bew-segment-control bew-segment-control--surface bew-segment-control--static bew-segment-control--flush">
    <button
      ref="trigger" type="button" class="bew-segment-control__item"
      :aria-expanded="open" :aria-controls="panelId" :data-active="open ? 'true' : undefined"
      @click="toggle" @pointerenter="enter" @pointerleave="leave" @focusout="focusOut" @keydown.esc.stop.prevent="close(true)"
    >
      <i class="i-tabler:category bew-segment-control__icon" aria-hidden="true" />
      {{ $t('home.channels') }}
    </button>
    <Teleport v-if="target" :to="target">
      <Transition name="home-channels">
        <ChannelsPop
          v-if="open" :id="panelId" ref="panel" class="home-channels-panel"
          :aria-label="$t('home.channels')"
          @pointerenter="keepOpen" @pointerleave="leave" @focusout="focusOut"
          @keydown.esc.stop.prevent="close(true)" @click="close()"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.home-channels-menu {
  flex: none;
}
.home-channels-panel {
  max-height: calc(100dvh - var(--bew-space-4));
}
.home-channels-enter-active,
.home-channels-leave-active {
  transition:
    opacity var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-emphasized);
}
.home-channels-leave-active {
  pointer-events: none;
}
.home-channels-enter-from,
.home-channels-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .home-channels-enter-active,
  .home-channels-leave-active {
    transition: none;
  }
}
</style>
