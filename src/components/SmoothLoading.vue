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
    :style="{ minHeight: minHeight || '46px' }"
  >
    <Transition name="loading-fade">
      <PageLoadingIndicator v-if="show" :label="$t('common.loading')" />
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.loading-container {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  contain: layout style paint;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.loading-visible,
.loading-keep-space {
  min-height: 100px;
  padding: var(--bew-space-8) 0;
}

.loading-visible {
  visibility: visible;
  opacity: 1;
}

.loading-hidden {
  position: absolute;
  min-height: 0;
  padding: 0;
  visibility: hidden;
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
</style>
