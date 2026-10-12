<script lang="ts">
import { useAnchoredPopoverPosition } from '~/composables/useAnchoredPopoverPosition'
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import type { TooltipPlacement } from '~/utils/floatingMenu'
import { computeTooltipPosition } from '~/utils/floatingMenu'

let tooltipWarmUntil = 0
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  content: string
  placement?: TooltipPlacement
  type?: 'default' | 'dark' | 'white'
  teleport?: boolean
}>(), { placement: 'top' })

const app = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const teleportTarget = computed(() => props.teleport ? app?.mainAppRef.value : undefined)
const wrapperRef = ref<HTMLElement>()
const tooltipRef = ref<HTMLElement>()
const visible = ref(false)
const instant = ref(false)
let enterTimer: ReturnType<typeof setTimeout> | undefined
const floatingVisible = computed(() => visible.value && Boolean(teleportTarget.value))
const { scheduleUpdate } = useAnchoredPopoverPosition(wrapperRef, tooltipRef, floatingVisible, (anchor, popup, width, height) => computeTooltipPosition(anchor, popup, width, height, props.placement))
watch([() => props.placement, () => props.content, teleportTarget], ([,, target]) => {
  if (!target) {
    tooltipRef.value?.style.removeProperty('top')
    tooltipRef.value?.style.removeProperty('left')
    tooltipRef.value?.removeAttribute('data-positioned')
  }
  scheduleUpdate()
})

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

    &:not([data-positioned]) {
      visibility: hidden;
    }
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
