<script setup lang="ts">
import { computed, ref } from 'vue'

import LibraryBleedStrip from '~/components/LibraryBleedStrip.vue'
import type { CardWindowSnapshot } from '~/composables/useCardWindow'
import { CARD_WINDOW_THRESHOLD, useCardWindow } from '~/composables/useCardWindow'
import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'
import { VIDEO_CARD_MIN_WIDTH } from '~/constants/layout'
import type { List as HistoryItem } from '~/models/history/history'

import HistoryDayToggle from './HistoryDayToggle.vue'
import { historyItemKey } from './historyGroups'

/**
 * One watch-history group (user-specified): its time heading over a sideways
 * strip of video cards that passes under the rail glass like the other
 * library strips. The heading folds the strip away (a measured disclosure).
 */
const props = defineProps<{ label: string, expanded: boolean, disabled?: boolean, items: HistoryItem[], cardWidth: number, canRelease: (key: string) => boolean, snapshot?: CardWindowSnapshot }>()
const emit = defineEmits<{ (event: 'toggle', trigger: MouseEvent): void, (event: 'snapshot', value: CardWindowSnapshot): void }>()

const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const rendered = ref(props.expanded)
const expanded = computed(() => props.expanded)
const strip = ref<{ scroller: HTMLElement | null }>()
const container = ref<HTMLElement | null>(null)
const root = computed(() => strip.value?.scroller ?? null)
const renderCards = computed(() => rendered.value || expanded.value || props.items.some(item => !props.canRelease(historyItemKey(item))))
const cardExtent = computed(() => props.cardWidth || VIDEO_CARD_MIN_WIDTH)
const windowed = useCardWindow({
  root,
  container,
  keys: computed(() => props.items.map(historyItemKey)),
  columns: ref(1),
  gap: ref(16),
  axis: 'horizontal',
  estimatedHeight: cardExtent,
  enabled: computed(() => props.items.length > CARD_WINDOW_THRESHOLD),
  suspended: computed(() => !renderCards.value),
  layout: computed(() => String(cardExtent.value)),
  canRelease: key => props.canRelease(String(key)),
  snapshot: props.snapshot,
  saveSnapshot: snapshot => emit('snapshot', snapshot),
})
const rows = computed(() => windowed.ranges.value.flatMap<{ key: string, item: HistoryItem | undefined, width: number | undefined }>(range => range.height === undefined
  ? props.items.slice(range.start, range.end).map(item => ({ key: historyItemKey(item), item, width: undefined }))
  : [{ key: `spacer:${range.start}`, item: undefined, width: range.height }]))
const stripWidth = computed(() => Math.max(0, props.items.length * (cardExtent.value + 16) - 16))
defineExpose({ captureSnapshot: windowed.captureSnapshot })
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
        <LibraryBleedStrip ref="strip" :label="label">
          <div ref="container" class="history-group__cards" :style="{ minWidth: `${stripWidth}px` }">
            <template v-if="renderCards">
              <template v-for="row in rows" :key="row.key">
                <div v-if="row.width !== undefined" :style="{ flex: `0 0 ${row.width}px` }" aria-hidden="true" />
                <slot v-else :item="row.item!" :set-element="(element: unknown) => windowed.setElement(row.key, element)" />
              </template>
            </template>
          </div>
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
.history-group__cards {
  display: flex;
  gap: var(--bew-space-4);
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
