<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import SearchBar from '~/components/SearchBar/SearchBar.vue'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { arriveSearchAt, departSearchFrom } from '~/utils/searchHandoff'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{
  focusChange: [focused: boolean]
}>()
const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)

const useLightText = computed(() => forceWhiteIcon.value && !settings.value.disableFrostedGlass)
</script>

<template>
  <div flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <!-- Leaving for Home hands its position to the home search, and arriving from
         Home starts where the home search was. -->
    <Transition name="slide-out" @before-leave="departSearchFrom" @enter="(element: Element) => arriveSearchAt(element as HTMLElement)">
      <SearchBar
        v-if="showSearchBar"
        v-model="searchKeyword"
        layout-editable-id="topbar-search"
        :active="active"
        class="search-bar"
        :force-light-text="useLightText"
        :show-hot-search="settings.showHotSearchInTopBar"
        :top-bar-appearance="true"
        :top-bar-mode="true"
        @focus-change="emit('focusChange', $event)"
      />
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";
</style>
