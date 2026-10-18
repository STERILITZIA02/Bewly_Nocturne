<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'

import { useLoadingRingPhase } from '~/composables/useLoadingRingPhase'
import { LOADING_RING_ARC, LOADING_RING_SVG } from '~/utils/loadingRing'

/**
 * Indeterminate loading for a single icon slot or a region without a known
 * layout. The default slot is the idle content that the ring temporarily
 * replaces; without a slot the ring removes itself once closed, so an owner
 * class can turn the root into an overlay that also waits for the close.
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  loading: boolean
  size?: string
}>(), {
  size: '1em',
})

const slots = useSlots()
const ring = ref<SVGSVGElement>()
const phase = useLoadingRingPhase(() => props.loading, () => ring.value)
const visible = computed(() => Boolean(slots.default) || phase.value !== 'idle')
</script>

<template>
  <Transition name="bew-loading-ring-fade">
    <span v-if="visible" v-bind="$attrs" class="bew-loading-ring-slot" :data-state="phase">
      <span v-if="$slots.default" class="bew-loading-ring-slot__content"><slot /></span>
      <Transition name="bew-loading-ring-fade">
        <svg
          v-if="phase !== 'idle'" ref="ring" v-bind="LOADING_RING_SVG" class="bew-loading-ring" :data-state="phase"
          :style="{ '--bew-loading-ring-size': size }"
        >
          <circle v-bind="LOADING_RING_ARC" class="bew-loading-ring__arc" />
        </svg>
      </Transition>
    </span>
  </Transition>
</template>
