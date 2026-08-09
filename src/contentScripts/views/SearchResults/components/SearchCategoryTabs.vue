<script setup lang="ts">
import type { SearchCategory, SearchCategoryOption } from '../types'

const props = defineProps<{
  categories: ReadonlyArray<SearchCategoryOption>
  currentCategory: SearchCategory
}>()

const emit = defineEmits<{
  (event: 'select', category: SearchCategory): void
}>()

function handleSelect(category: SearchCategory) {
  emit('select', category)
}
</script>

<template>
  <div class="search-categories" mb-4>
    <div class="search-category-control bew-segment-control bew-segment-control--surface bew-segment-control--static">
      <button
        v-for="category in props.categories"
        :key="category.value"
        class="category-tab bew-segment-control__item bew-segment-control__item--wide"
        :class="{ active: props.currentCategory === category.value }"
        :data-active="props.currentCategory === category.value ? 'true' : undefined"
        type="button"
        @click="handleSelect(category.value)"
      >
        <div :class="category.icon" class="bew-segment-control__icon" />
        <span>{{ category.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.search-category-control {
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.search-category-control::-webkit-scrollbar {
  display: none;
}
</style>
