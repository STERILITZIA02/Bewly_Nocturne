<script setup lang="ts">
import PageLoadingIndicator from '~/components/PageLoadingIndicator.vue'
import { useLoadingRingPhase } from '~/composables/useLoadingRingPhase'

const props = defineProps<{
  show: boolean | null | undefined
  keepSpace?: boolean
  minHeight?: string
}>()

const container = ref<HTMLElement>()
// Stay present until the ring has closed, then collapse or hide.
const phase = useLoadingRingPhase(() => Boolean(props.show), () => container.value)
const present = computed(() => phase.value !== 'idle')
const containerClass = computed(() => ({
  'loading-visible': present.value,
  'loading-hidden': !present.value && !props.keepSpace,
  'loading-keep-space': !present.value && props.keepSpace,
}))
</script>

<template>
  <div
    ref="container"
    class="loading-container"
    :class="containerClass"
    :style="minHeight ? { '--bew-loading-min-height': minHeight } : undefined"
    :aria-hidden="!present"
    :inert="present ? undefined : true"
  >
    <div class="loading-body">
      <Transition name="loading-fade">
        <PageLoadingIndicator v-if="present" :loading="Boolean(show)" :label="$t('common.loading')" />
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
.loading-container {
  --bew-loading-height: max(
    var(--bew-loading-min-height, 0px),
    calc(var(--bew-control-height) + 2 * var(--bew-space-8))
  );

  height: var(--bew-loading-height);
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  contain: layout style paint;
  transition:
    height var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.loading-body {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: var(--bew-loading-height);
  padding: var(--bew-space-8) 0;
}

.loading-visible {
  visibility: visible;
  opacity: 1;
}

.loading-hidden {
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.loading-keep-space {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.loading-fade-enter-active,
.loading-fade-leave-active {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.loading-fade-enter-from,
.loading-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .loading-container,
  .loading-fade-enter-active,
  .loading-fade-leave-active {
    transition: none;
  }
}
</style>
