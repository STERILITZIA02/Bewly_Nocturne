<script setup lang="ts">
import './searchFilters.scss'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export type LiveSubCategory = 'all' | 'live_room' | 'live_user'

interface LiveSubCategoryOption {
  value: LiveSubCategory
  label: string
}

const props = defineProps<{
  subCategory: LiveSubCategory
}>()

const emit = defineEmits<{
  'update:subCategory': [value: LiveSubCategory]
}>()

const { t } = useI18n()
const subCategories = computed<LiveSubCategoryOption[]>(() => [
  { value: 'all', label: t('search.live.all') },
  { value: 'live_room', label: t('search.live.rooms') },
  { value: 'live_user', label: t('search.live.streamers') },
])

function handleSubCategoryChange(value: LiveSubCategory) {
  emit('update:subCategory', value)
}
</script>

<template>
  <div class="bew-search-filters">
    <!-- 子分类切换 -->
    <div
      class="bew-search-filter-options bew-segment-control bew-segment-control--surface bew-segment-control--static bew-segment-control--secondary"
      role="group"
      :aria-label="t('search.categories.live')"
    >
      <button
        v-for="category in subCategories"
        :key="category.value"
        class="bew-segment-control__item"
        :data-active="props.subCategory === category.value ? 'true' : undefined"
        :aria-pressed="props.subCategory === category.value"
        type="button"
        @click="handleSubCategoryChange(category.value)"
      >
        <span>{{ category.label }}</span>
      </button>
    </div>
  </div>
</template>
