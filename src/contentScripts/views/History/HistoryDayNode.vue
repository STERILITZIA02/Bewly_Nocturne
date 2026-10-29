<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import ChevronIcon from '~/components/ChevronIcon.vue'
import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'

/**
 * One day of the rail's day tree (user-specified, like a session with its
 * sub-sessions): the day over its periods, a branch line from the day curving
 * into the last one. A day added by a later page grows the tree into place (a
 * measured disclosure).
 */
const props = defineProps<{ label: string, groupKey: string, periods: { key: string, label: string }[], current?: string, expanded: boolean, animateIn: boolean }>()
const emit = defineEmits<{ (event: 'select', key: string): void, (event: 'toggle'): void }>()

const node = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const shown = ref(!props.animateIn)
// Once in place the node follows its content freely: the fold below animates itself.
const appeared = ref(!props.animateIn)
const entrance = useMeasuredDisclosure(node, computed(() => appeared.value ? null : body.value), shown, () => {}, (moving) => {
  if (!moving)
    appeared.value = true
})
const entranceHeight = entrance.height
// Reduced motion lands at once, without a motion to end.
watch(entranceHeight, (height) => {
  if (height && !entrance.moving.value)
    appeared.value = true
}, { flush: 'post' })
onMounted(() => shown.value = true)

const fold = ref<HTMLElement | null>(null)
const periodList = ref<HTMLElement | null>(null)
const { height, onTransitionEnd } = useMeasuredDisclosure(fold, periodList, computed(() => props.expanded), () => {}, () => {})
</script>

<template>
  <li
    ref="node" class="history-day-node" :class="{ 'is-appearing': !appeared }"
    :style="appeared ? undefined : { height: `${entranceHeight ?? 0}px` }" @transitionend="entrance.onTransitionEnd"
  >
    <div ref="body" class="history-day-node__body">
      <div class="history-day-node__head">
        <button
          type="button" class="library-sidebar-action history-day-node__row" :class="{ 'history-day-node__row--foldable': periods.length }"
          :aria-current="!periods.length && groupKey === current ? 'true' : undefined" @click="emit('select', groupKey)"
        >
          <span class="keep-one-line">{{ label }}</span>
        </button>
        <button
          v-if="periods.length" type="button" class="history-day-node__chevron" :class="{ 'is-collapsed': !expanded }"
          :aria-expanded="expanded" :aria-label="label" @click="emit('toggle')"
        >
          <ChevronIcon />
        </button>
      </div>
      <div
        ref="fold" class="history-day-node__fold" :class="{ 'is-open': expanded }"
        :style="{ height: height === undefined ? undefined : `${height}px` }" :inert="expanded ? undefined : true" @transitionend="onTransitionEnd"
      >
        <ul ref="periodList" class="history-day-node__periods">
          <li v-for="period in periods" :key="period.key">
            <button
              type="button" class="library-sidebar-action history-day-node__row history-day-node__period"
              :aria-current="period.key === current ? 'true' : undefined" @click="emit('select', period.key)"
            >
              <span class="keep-one-line">{{ period.label }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </li>
</template>

<style scoped lang="scss">
@use "./historyTree";

.history-day-node {
  display: block;
  min-width: 0;
  &.is-appearing {
    // Clips the growth only: the branch line hangs left of the node.
    overflow: visible clip;
    transition: height var(--bew-duration-normal) var(--bew-ease-standard);
  }
}
.history-day-node__body {
  display: flow-root;
}
.history-day-node__head {
  position: relative;
}
.history-day-node__row {
  font-family: inherit;
  > span {
    min-width: 0;
  }
}
.history-day-node__head .history-day-node__row--foldable {
  // Room for the chevron over the row's end.
  padding-inline-end: calc(var(--bew-sidebar-action-padding) + var(--bew-space-6));
}
.history-day-node__row[aria-current="true"] {
  background: var(--bew-sidebar-selected-bg);
  color: var(--bew-text-1);
}
.history-day-node__chevron {
  position: absolute;
  inset-block: 0;
  inset-inline-end: var(--bew-sidebar-action-inset);
  display: grid;
  place-items: center;
  width: var(--bew-space-6);
  margin: auto 0;
  height: var(--bew-space-6);
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  appearance: none;
  background: transparent;
  color: var(--bew-text-3);
  cursor: pointer;
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
  &:hover {
    color: var(--bew-text-1);
  }
  &:focus-visible {
    outline: var(--bew-focus-ring);
  }
  svg {
    width: var(--bew-icon-size-xs);
    height: var(--bew-icon-size-xs);
    transition: transform var(--bew-duration-normal) var(--bew-ease-standard);
  }
  &.is-collapsed svg {
    transform: rotate(-90deg);
  }
}
.history-day-node__fold {
  height: 0;
  min-width: 0;
  overflow: visible clip;
  transition: height var(--bew-duration-normal) var(--bew-ease-standard);
  &.is-open {
    height: auto;
  }
}
// The periods hang a second level in, their line just right of the day's text.
.history-day-node__periods {
  @include historyTree.branches(calc(var(--bew-sidebar-label-inset) + var(--bew-space-3)));
  display: grid;
  min-width: 0;
}
.history-day-node__period {
  --bew-library-action-foreground: var(--bew-text-2);
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .history-day-node.is-appearing,
  .history-day-node__fold,
  .history-day-node__chevron,
  .history-day-node__chevron svg {
    transition: none;
  }
}
</style>
