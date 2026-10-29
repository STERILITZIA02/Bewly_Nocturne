<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import LoadingRing from '~/components/LoadingRing.vue'

const props = defineProps<{
  currentPage: number
  totalPages: number
  disabled?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'change', page: number): void
}>()

const { t } = useI18n()

// 生成页码数组
const pageNumbers = computed(() => {
  const { currentPage, totalPages } = props
  const maxVisiblePages = 7 // 最多显示7个页码按钮
  const pages: (number | 'ellipsis')[] = []

  if (totalPages <= maxVisiblePages) {
    // 如果总页数小于最大显示数,显示所有页码
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
  }
  else {
    // 始终显示第一页
    pages.push(1)

    let startPage = Math.max(2, currentPage - 2)
    let endPage = Math.min(totalPages - 1, currentPage + 2)

    // 如果当前页靠近开始
    if (currentPage <= 4) {
      startPage = 2
      endPage = 5
    }

    // 如果当前页靠近结尾
    if (currentPage >= totalPages - 3) {
      startPage = totalPages - 4
      endPage = totalPages - 1
    }

    // 添加左侧省略号
    if (startPage > 2) {
      pages.push('ellipsis')
    }

    // 添加中间页码
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }

    // 添加右侧省略号
    if (endPage < totalPages - 1) {
      pages.push('ellipsis')
    }

    // 始终显示最后一页
    pages.push(totalPages)
  }

  return pages
})

function handlePageChange(page: number) {
  if (props.disabled || props.loading || page === props.currentPage || page < 1 || page > props.totalPages)
    return

  emit('change', page)
}

function goToPrevPage() {
  if (props.currentPage > 1) {
    handlePageChange(props.currentPage - 1)
  }
}

function goToNextPage() {
  if (props.currentPage < props.totalPages) {
    handlePageChange(props.currentPage + 1)
  }
}
</script>

<template>
  <div v-if="totalPages > 1" class="pagination" :aria-busy="loading">
    <button
      class="pagination-btn"
      :disabled="disabled || loading || currentPage === 1"
      :aria-label="t('search.pagination.previous')"
      @click="goToPrevPage"
    >
      <div class="i-tabler:chevron-left" />
    </button>

    <template v-for="(page, index) in pageNumbers" :key="index">
      <span v-if="page === 'ellipsis'" class="pagination-ellipsis">
        ...
      </span>
      <button
        v-else
        class="pagination-btn pagination-btn--page"
        :class="{ active: page === currentPage, loading: loading && page === currentPage }"
        :disabled="disabled || loading"
        :aria-label="t('search.pagination.page', { page })"
        :aria-current="page === currentPage ? 'page' : undefined"
        @click="handlePageChange(page)"
      >
        <LoadingRing :loading="Boolean(loading && page === currentPage)">
          <span>{{ page }}<span v-if="page === currentPage" class="pagination-total"> / {{ totalPages }}</span></span>
        </LoadingRing>
      </button>
    </template>

    <button
      class="pagination-btn"
      :disabled="disabled || loading || currentPage === totalPages"
      :aria-label="t('search.pagination.next')"
      @click="goToNextPage"
    >
      <div class="i-tabler:chevron-right" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.pagination {
  container-type: inline-size;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-8) 0;
  user-select: none;
}

.pagination-btn {
  position: relative;
  min-width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  padding: 0 var(--bew-space-3);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  background-color: var(--bew-content-solid);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background-color var(--bew-duration-moderate) var(--bew-ease-out),
    color var(--bew-duration-moderate) var(--bew-ease-out),
    opacity var(--bew-duration-moderate) var(--bew-ease-out);

  &:hover:not(:disabled):not(.active) {
    background-color: var(--bew-hover-bg);
  }

  &.active {
    background-color: var(--bew-selected-bg);
    color: var(--bew-text-1);
  }

  &:focus-visible:not(:disabled) {
    background-color: var(--bew-pressed-bg);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  &.loading {
    pointer-events: none;
  }
}

.pagination-ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
}

.pagination-total {
  display: none;
}

// The full row contains up to eleven targets. A narrow container keeps the
// current/total count and both navigation buttons without shrinking hit areas.
@container (max-width: 560px) {
  .pagination-btn--page:not(.active),
  .pagination-ellipsis {
    display: none;
  }
  .pagination-total {
    display: inline;
  }
}
</style>
