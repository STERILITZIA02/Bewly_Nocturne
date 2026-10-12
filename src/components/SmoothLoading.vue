<script setup lang="ts">
import PageLoadingIndicator from '~/components/PageLoadingIndicator.vue'

const props = defineProps<{
  show: boolean | null | undefined
  keepSpace?: boolean
  minHeight?: string
}>()

const containerClass = computed(() => ({
  'loading-visible': Boolean(props.show),
  'loading-hidden': !props.show && !props.keepSpace,
  'loading-keep-space': !props.show && props.keepSpace,
}))
</script>

<template>
  <div
    class="loading-container"
    :class="containerClass"
    :aria-hidden="!show"
    :inert="show ? undefined : true"
  >
    <div class="loading-clip">
      <div class="loading-body" :style="{ minHeight: minHeight || '46px' }">
        <Transition name="loading-fade">
          <PageLoadingIndicator v-if="show" :label="$t('common.loading')" />
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.loading-container {
  display: grid;
  grid-template-rows: 1fr;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  contain: layout style paint;
  transition:
    grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.loading-clip {
  min-height: 0;
  overflow: hidden;
}
.loading-body {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: var(--bew-space-8) 0;
}

.loading-visible {
  visibility: visible;
  opacity: 1;
}

.loading-hidden {
  grid-template-rows: 0fr;
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
