<script setup lang="ts">
defineProps<{
  active: boolean
  darkened?: boolean
  blurred?: boolean
}>()

defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <Transition name="search-focus-overlay">
    <div
      v-if="active"
      class="search-focus-overlay"
      :class="{
        'search-focus-overlay--darkened': darkened,
        'search-focus-overlay--blurred': blurred,
      }"
      aria-hidden="true"
      @click="$emit('dismiss')"
    />
  </Transition>
</template>

<style scoped lang="scss">
.search-focus-overlay {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100vw;
  height: 100dvh;
  background: transparent;

  &--darkened {
    background: rgb(0 0 0 / 60%);
  }

  &--blurred {
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
  }
}

.search-focus-overlay-enter-active,
.search-focus-overlay-leave-active {
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-in-out);
}

.search-focus-overlay-enter-from,
.search-focus-overlay-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .search-focus-overlay-enter-active,
  .search-focus-overlay-leave-active {
    transition-duration: 1ms;
  }
}
</style>
