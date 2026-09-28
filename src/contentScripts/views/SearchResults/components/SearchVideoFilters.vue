<script setup lang="ts">
import './searchFilters.scss'

import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import DatePicker from './DatePicker.vue'

const props = defineProps<{
  orderOptions: ReadonlyArray<{ value: string, label: string }>
  durationOptions: ReadonlyArray<{ value: number, label: string }>
  timeRangeOptions: ReadonlyArray<{ value: string, label: string }>
}>()

const videoOrder = defineModel<string>('videoOrder', { default: '' })
const duration = defineModel<number>('duration', { default: 0 })
const timeRange = defineModel<string>('timeRange', { default: 'all' })
const customStartDate = defineModel<string>('customStartDate', { default: '' })
const customEndDate = defineModel<string>('customEndDate', { default: '' })

const customStartInput = ref('')
const customEndInput = ref('')
const { t } = useI18n()
const activeSummary = computed(() => [
  videoOrder.value ? props.orderOptions.find(option => option.value === videoOrder.value)?.label : undefined,
  duration.value ? props.durationOptions.find(option => option.value === duration.value)?.label : undefined,
  timeRange.value === 'custom'
    ? `${customStartDate.value} – ${customEndDate.value}`
    : timeRange.value !== 'all' ? props.timeRangeOptions.find(option => option.value === timeRange.value)?.label : undefined,
].filter((label): label is string => !!label))

const filtersRoot = useTemplateRef<HTMLElement>('filtersRoot')

function clearFilters() {
  videoOrder.value = ''
  duration.value = 0
  handleTimeRangeSelect('all')
  // The clear button unmounts with the summary; hand focus to the reset choice.
  nextTick(() => filtersRoot.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus())
}

// 更多筛选的展开状态
const isMoreFiltersExpanded = ref(false)
const moreFiltersId = useId()

// 监听父组件的日期变化，同步到本地输入
watch([customStartDate, customEndDate], ([start, end]) => {
  if (customStartInput.value !== start)
    customStartInput.value = start || ''
  if (customEndInput.value !== end)
    customEndInput.value = end || ''
}, { immediate: true })

// 监听自定义日期输入，只有两个日期都选择后才触发筛选
watch([customStartInput, customEndInput], ([start, end]) => {
  // 两个日期都选择后才触发
  if (start && end) {
    timeRange.value = 'custom'
    customStartDate.value = start
    customEndDate.value = end
  }
  // 如果清空了所有日期
  else if (!start && !end && timeRange.value === 'custom') {
    timeRange.value = 'all'
    customStartDate.value = ''
    customEndDate.value = ''
  }
})

function handleTimeRangeSelect(value: string) {
  // 选择预设选项时，切换模式并清空自定义日期
  timeRange.value = value
  customStartInput.value = ''
  customEndInput.value = ''
  customStartDate.value = ''
  customEndDate.value = ''
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取今天的日期，用于限制日期选择器的最大日期
const maxDate = computed(() => formatDate(new Date()))
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
          :data-active="videoOrder === option.value ? 'true' : undefined"
          :aria-pressed="videoOrder === option.value"
          type="button"
          @click="videoOrder = option.value"
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
      <!-- 时长 -->
      <div class="bew-search-filter-row">
        <span class="bew-search-filter-label">{{ t('search.filters.duration') }}</span>
        <div
          class="bew-search-filter-options bew-segment-control bew-segment-control--surface bew-segment-control--static bew-segment-control--secondary"
          role="group"
          :aria-label="t('search.filters.duration')"
        >
          <button
            v-for="option in props.durationOptions"
            :key="option.value"
            class="bew-segment-control__item"
            :data-active="duration === option.value ? 'true' : undefined"
            :aria-pressed="duration === option.value"
            type="button"
            @click="duration = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- 日期 -->
      <div class="bew-search-filter-row">
        <span class="bew-search-filter-label">{{ t('search.filters.date') }}</span>
        <div class="bew-search-filter-choices">
          <div
            class="bew-search-filter-options bew-segment-control bew-segment-control--surface bew-segment-control--static bew-segment-control--secondary"
            role="group" :aria-label="t('search.filters.date')"
          >
            <button
              v-for="option in props.timeRangeOptions"
              :key="option.value"
              class="bew-segment-control__item"
              :data-active="timeRange === option.value ? 'true' : undefined"
              :aria-pressed="timeRange === option.value"
              type="button"
              @click="handleTimeRangeSelect(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <DatePicker
            v-model="customStartInput"
            :max="maxDate"
            :placeholder="t('search.filters.start_date')"
          />
          <span text="sm $bew-text-3">{{ t('search.filters.to') }}</span>
          <DatePicker
            v-model="customEndInput"
            :max="maxDate"
            :placeholder="t('search.filters.end_date')"
          />
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
