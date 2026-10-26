<script setup lang="ts">
import LibraryVideoCardSkeleton from '~/components/LibraryVideoCardSkeleton.vue'
import { useGridLayout } from '~/composables/useGridLayout'

withDefaults(defineProps<{ count?: number }>(), { count: 12 })
const { gridClass } = useGridLayout(() => 'adaptive')
</script>

<template>
  <div class="library-video-grid-skeleton" aria-hidden="true">
    <div :class="gridClass">
      <LibraryVideoCardSkeleton v-for="index in count" :key="index" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.library-video-grid-skeleton {
  min-width: 0;
  container-type: inline-size;
}
</style>
