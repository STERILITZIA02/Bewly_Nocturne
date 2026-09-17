<script setup lang="ts">
import Button from '~/components/Button.vue'
import Empty from '~/components/Empty.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { openSearchResults, resolveSearchNavigationTarget } from '~/utils/searchNavigation'

import type { SearchCategory } from '../types'

const props = defineProps<{ keyword: string, category: SearchCategory }>()
const { mainAppRef } = useBewlyApp()

function editKeyword() {
  const input = mainAppRef.value?.querySelector<HTMLInputElement>('#search-wrap input')
  input?.focus({ preventScroll: true })
  input?.select()
}

function showAllResults() {
  openSearchResults(resolveSearchNavigationTarget(props.keyword), { fromSearchResultsTopBar: true })
}
</script>

<template>
  <Empty :description="$t('search.empty_results', { keyword, category: $t(`search.categories.${category}`) })" role="status" py-6>
    <p text="sm $bew-text-2">
      {{ $t('search.empty_hint') }}
    </p>
    <div flex="~ gap-3">
      <Button type="secondary" @click="editKeyword">
        {{ $t('search.edit_keyword') }}
      </Button>
      <Button v-if="category !== 'all'" type="secondary" @click="showAllResults">
        {{ $t('search.back_to_all') }}
      </Button>
    </div>
  </Empty>
</template>
