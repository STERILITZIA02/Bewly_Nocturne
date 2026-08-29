<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useSearchFocusEffect } from '~/composables/useSearchFocusEffect'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const emit = defineEmits<{
  focusChange: [focused: boolean]
}>()

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)
const searchFocusEffect = useSearchFocusEffect()

const useLightText = computed(() => forceWhiteIcon.value && !settings.value.disableFrostedGlass)
</script>

<template>
  <div flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <Transition name="slide-out">
      <SearchBar
        v-if="showSearchBar"
        v-model="searchKeyword"
        class="search-bar"
        :darken-on-focus="searchFocusEffect.darkened"
        :blurred-on-focus="searchFocusEffect.blurred"
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
