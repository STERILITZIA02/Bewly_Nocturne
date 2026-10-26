<script setup lang="ts">
import { computed, ref } from 'vue'

import LibraryBleedStrip from '~/components/LibraryBleedStrip.vue'
import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'

import HistoryDayToggle from './HistoryDayToggle.vue'

/**
 * One watch-history group (user-specified): its time heading over a sideways
 * strip of video cards that passes under the rail glass like the other
 * library strips. The heading folds the strip away (a measured disclosure).
 */
const props = defineProps<{ label: string, expanded: boolean, disabled?: boolean }>()
const emit = defineEmits<{ (event: 'toggle', trigger: MouseEvent): void }>()

const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const rendered = ref(props.expanded)
const expanded = computed(() => props.expanded)
const { height, moving, onTransitionEnd } = useMeasuredDisclosure(outer, inner, expanded, () => rendered.value = false, () => {})
function toggle(event: MouseEvent) {
  if (!props.expanded)
    rendered.value = true
  emit('toggle', event)
}
</script>

<template>
  <section class="history-group" :aria-label="label">
    <h4 class="history-group__heading">
      <HistoryDayToggle :label="label" :expanded="expanded" :disabled="disabled" @toggle="toggle" />
    </h4>
    <div
      ref="outer" class="history-group__disclosure" :class="{ 'is-open': expanded, 'is-settled': expanded && !moving }"
      :style="{ height: height === undefined ? undefined : `${height}px` }" :inert="expanded ? undefined : true" @transitionend="onTransitionEnd"
    >
      <div ref="inner" class="history-group__inner">
        <LibraryBleedStrip v-if="rendered || expanded" :label="label">
          <slot />
        </LibraryBleedStrip>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.history-group {
  display: grid;
  min-width: 0;
}
.history-group__heading {
  margin: 0;
  font: inherit;
}
.history-group__disclosure {
  display: block;
  height: 0;
  min-width: 0;
  // The strip reaches past the content box sideways (under the rail glass):
  // clip only vertically, and only while folding, so hover lifts stay whole.
  overflow: visible clip;
  transition: height var(--bew-duration-normal) var(--bew-ease-standard);
  &.is-open {
    height: auto;
  }
  &.is-settled {
    overflow: visible;
  }
}
.history-group__inner {
  display: flow-root;
  // Inside the fold, so a folded group is only its heading.
  padding-top: var(--bew-space-3);
}
@media (prefers-reduced-motion: reduce) {
  .history-group__disclosure {
    transition: none;
  }
}
</style>
