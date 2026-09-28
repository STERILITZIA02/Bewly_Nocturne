<script lang="ts" setup>
import './searchFilters.scss'

import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

interface UserFilterOption {
  value: string | number
  label: string
}

const props = defineProps<{
  orderOptions: ReadonlyArray<UserFilterOption>
  userTypeOptions: ReadonlyArray<UserFilterOption>
}>()

const userOrder = defineModel<string>('order', { default: '' })
const userType = defineModel<number>('userType', { default: 0 })

// 更多筛选的展开状态
const isMoreFiltersExpanded = ref(false)
const moreFiltersId = useId()
const { t } = useI18n()
const activeSummary = computed(() => [
  userOrder.value ? props.orderOptions.find(option => option.value === userOrder.value)?.label : undefined,
  userType.value ? props.userTypeOptions.find(option => option.value === userType.value)?.label : undefined,
].filter((label): label is string => !!label))

const filtersRoot = useTemplateRef<HTMLElement>('filtersRoot')

function clearFilters() {
  userOrder.value = ''
  userType.value = 0
  // The clear button unmounts with the summary; hand focus to the reset choice.
  nextTick(() => filtersRoot.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus())
}

function handleOrderChange(value: string) {
  userOrder.value = value
}

function handleUserTypeSelect(value: number) {
  userType.value = value
}
</script>

<template>
  <div ref="filtersRoot" class="bew-search-filters">
    <!-- 排序 + 更多筛选按钮 -->
    <div class="bew-search-filter-row">
      <span class="bew-search-filter-label">{{ t('search.filters.order') }}</span>
      <div
        class="bew-search-filter-options bew-segment-control bew-segment-control--surface bew-segment-control--static bew-segment-control--secondary"
        role="group" :aria-label="t('search.filters.order')"
      >
        <button
          v-for="option in props.orderOptions"
          :key="option.value"
          class="bew-segment-control__item"
          :data-active="userOrder === option.value ? 'true' : undefined"
          :aria-pressed="userOrder === option.value"
          type="button"
          @click="handleOrderChange(option.value as string)"
        >
          {{ option.label }}
        </button>
      </div>
      <button
        class="bew-search-filter-more"
        :aria-expanded="isMoreFiltersExpanded"
        :aria-controls="moreFiltersId"
        type="button"
        @click="isMoreFiltersExpanded = !isMoreFiltersExpanded"
      >
        <span>{{ t('search.filters.more') }}</span>
        <i class="i-tabler:chevron-down" aria-hidden="true" />
      </button>
    </div>

    <!-- 更多筛选内容 -->
    <div v-show="isMoreFiltersExpanded" :id="moreFiltersId" flex="~ col" gap-3>
      <!-- 用户类型 -->
      <div class="bew-search-filter-row">
        <span class="bew-search-filter-label">{{ t('search.filters.user_type') }}</span>
        <div
          class="bew-search-filter-options bew-segment-control bew-segment-control--surface bew-segment-control--static bew-segment-control--secondary"
          role="group"
          :aria-label="t('search.filters.user_type')"
        >
          <button
            v-for="option in props.userTypeOptions"
            :key="option.value"
            class="bew-segment-control__item"
            :data-active="userType === option.value ? 'true' : undefined"
            :aria-pressed="userType === option.value"
            type="button"
            @click="handleUserTypeSelect(option.value as number)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="activeSummary.length" class="bew-search-filter-summary">
      <span>{{ t('search.filters.applied', { filters: activeSummary.join(' · ') }) }}</span>
      <button type="button" class="bew-search-filter-clear" @click="clearFilters">
        {{ t('search.filters.clear') }}
      </button>
    </div>
  </div>
</template>
