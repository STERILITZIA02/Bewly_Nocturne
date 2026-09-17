<script lang="ts">
let tooltipWarmUntil = 0
</script>

<script lang="ts" setup>
defineProps<{
  content: string
  placement: 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'
  type?: 'default' | 'dark' | 'white'
}>()

const wrapperRef = ref<HTMLElement>()
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
  >
    <div
      v-if="content"
      class="b-tooltip"
      role="tooltip"
      :aria-hidden="!visible"
      :class="[`b-tooltip--placement-${placement ?? 'top'}`, `b-tooltip--type-${type ?? 'default'}`, { 'is-visible': visible, 'is-instant': instant }]"
    >
      {{ content }}
    </div>
    <slot />
  </span>
</template>

<style lang="scss" scoped>
.b-tooltip-wrapper {
  --uno: "flex items-center relative";

  .b-tooltip {
    --uno: "absolute px-2 rounded-$bew-radius-half pointer-events-none opacity-0 shadow-$bew-shadow-2 whitespace-nowrap";
    transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);

    &.is-instant {
      transition: none;
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
}
</style>
