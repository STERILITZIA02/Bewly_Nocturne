<script lang="ts">
import type { BewlyAppProvider } from '~/composables/useAppProvider'

let tooltipWarmUntil = 0
</script>

<script lang="ts" setup>
const props = defineProps<{
  content: string
  placement: 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'
  type?: 'default' | 'dark' | 'white'
  teleport?: boolean
}>()

const app = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const teleportTarget = computed(() => props.teleport ? app?.mainAppRef.value : undefined)
const wrapperRef = ref<HTMLElement>()
const tooltipRef = ref<HTMLElement>()
const floatingPosition = ref<{ top: string, left: string }>()
const visible = ref(false)
const instant = ref(false)
let enterTimer: ReturnType<typeof setTimeout> | undefined

function showTooltip(keyboard = false) {
  clearTimeout(enterTimer)
  instant.value = keyboard || Date.now() < tooltipWarmUntil
  if (instant.value) {
    visible.value = true
    return
  }
  enterTimer = setTimeout(() => {
    enterTimer = undefined
    visible.value = true
  }, 320)
}

function hideTooltip() {
  if (wrapperRef.value?.matches(':focus-within'))
    return
  clearTimeout(enterTimer)
  enterTimer = undefined
  if (visible.value)
    tooltipWarmUntil = Date.now() + 500
  visible.value = false
}

function dismissTooltip() {
  clearTimeout(enterTimer)
  enterTimer = undefined
  visible.value = false
}

function updateFloatingPosition() {
  if (!wrapperRef.value || !tooltipRef.value)
    return
  const anchor = wrapperRef.value.getBoundingClientRect()
  const tip = tooltipRef.value.getBoundingClientRect()
  const inset = 8
  let left = anchor.left + (anchor.width - tip.width) / 2
  let top = anchor.top - tip.height - inset
  if (props.placement.startsWith('bottom')) {
    top = anchor.bottom + inset
    if (top + tip.height > window.innerHeight - inset)
      top = anchor.top - tip.height - inset
    if (props.placement === 'bottom-left')
      left = anchor.left
    if (props.placement === 'bottom-right')
      left = anchor.right - tip.width
  }
  else if (props.placement === 'left' || props.placement === 'right') {
    left = props.placement === 'left' ? anchor.left - tip.width - inset : anchor.right + inset
    top = anchor.top + (anchor.height - tip.height) / 2
  }
  else if (top < inset) {
    top = anchor.bottom + inset
  }
  floatingPosition.value = {
    left: `${Math.max(inset, Math.min(left, window.innerWidth - tip.width - inset))}px`,
    top: `${Math.max(inset, Math.min(top, window.innerHeight - tip.height - inset))}px`,
  }
}

watch([visible, teleportTarget], ([shown, target], _previous, onCleanup) => {
  floatingPosition.value = undefined
  if (!shown || !target)
    return
  updateFloatingPosition()
  window.addEventListener('resize', updateFloatingPosition, { passive: true })
  window.addEventListener('scroll', updateFloatingPosition, { passive: true, capture: true })
  onCleanup(() => {
    window.removeEventListener('resize', updateFloatingPosition)
    window.removeEventListener('scroll', updateFloatingPosition, true)
  })
}, { flush: 'post' })

onDeactivated(dismissTooltip)
onBeforeUnmount(() => clearTimeout(enterTimer))
</script>

<template>
  <span
    ref="wrapperRef"
    class="b-tooltip-wrapper"
    @mouseenter="showTooltip()"
    @mouseleave="hideTooltip"
    @focusin="showTooltip(true)"
    @focusout="hideTooltip"
    @keydown.esc="dismissTooltip"
  >
    <Teleport :to="teleportTarget" :disabled="!teleportTarget">
      <div
        v-if="content"
        ref="tooltipRef"
        class="b-tooltip"
        role="tooltip"
        :aria-hidden="!visible"
        :class="[!teleportTarget && `b-tooltip--placement-${placement ?? 'top'}`, `b-tooltip--type-${type ?? 'default'}`, { 'is-visible': visible, 'is-instant': instant, 'is-teleported': teleportTarget }]"
        :style="teleportTarget ? { ...floatingPosition, visibility: floatingPosition ? undefined : 'hidden' } : undefined"
      >
        {{ content }}
      </div>
    </Teleport>
    <slot />
  </span>
</template>

<style lang="scss" scoped>
.b-tooltip-wrapper {
  --uno: "flex items-center relative";
}

.b-tooltip {
  --uno: "absolute px-2 rounded-$bew-radius-half pointer-events-none opacity-0 shadow-$bew-shadow-2 whitespace-nowrap";
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);

  &.is-instant {
    transition: none;
  }

  &.is-teleported {
    position: fixed;
    width: max-content;
    max-width: calc(100vw - var(--bew-space-4));
    white-space: normal;
  }

  z-index: var(--bew-z-popover);
  padding-block: var(--bew-space-1);
  box-sizing: border-box;
  border: 1px solid var(--bew-surface-border-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);

  &--placement-right {
    --uno: "left-[calc(100%+0.5em)]";
  }

  &--placement-left {
    --uno: "right-[calc(100%+0.5em)]";
  }

  &--placement-top {
    --uno: "top--2.5em left-1/2 translate-x--1/2";
  }

  &--placement-bottom {
    --uno: "bottom--2.5em left-1/2 translate-x--1/2";
  }

  &--placement-bottom-left {
    --uno: "bottom--2.5em left--2";
  }

  &--placement-bottom-right {
    --uno: "bottom--2.5em right--2";
  }

  &--type-default {
    --uno: "text-white dark:text-black bg-black dark:bg-white";
  }

  &--type-dark {
    --uno: "text-white bg-black";
  }

  &--type-white {
    --uno: "text-black bg-white";
  }
}

.b-tooltip.is-visible {
  --uno: "opacity-100";
}

@media (prefers-reduced-motion: reduce) {
  .b-tooltip {
    transition: none;
  }
}
</style>
