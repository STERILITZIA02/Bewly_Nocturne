<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'
import { getRecommendationModeOption, getRecommendationModeOptions, selectRecommendationMode } from '~/logic/recommendationMode'
import type { RecommendationModeOption } from '~/logic/storage'

const { t } = useI18n()
const options = computed(() => getRecommendationModeOptions(t))
const visibleOptions = computed(() => options.value.filter(option => settings.value.recommendationModeSwitcherOptions.includes(option.value)))
const activeOption = computed(getRecommendationModeOption)
</script>

<template>
  <div
    v-layout-editable="'home-recommendation-switcher'"
    class="home-recommendation-mode-switcher bew-segment-control bew-segment-control--surface bew-segment-control--track"
    role="group" :aria-label="$t('settings.recommendation_mode')"
  >
    <LiquidSegmentIndicator :active-key="activeOption" />
    <button
      v-for="option in visibleOptions" :key="option.value" type="button"
      class="bew-segment-control__item" data-segment-item
      :data-active="activeOption === option.value ? 'true' : undefined"
      :aria-pressed="activeOption === option.value"
      @click="selectRecommendationMode(option.value)"
    >
      {{ option.label }}
    </button>
    <Select
      v-if="visibleOptions.length < options.length"
      :model-value="activeOption" :options="options" size="compact"
      :accessible-label="$t('settings.recommendation_mode')"
      @update:model-value="selectRecommendationMode($event as RecommendationModeOption)"
    />
  </div>
</template>

<style scoped>
.home-recommendation-mode-switcher {
  max-width: 100%;
  overflow: auto hidden;
  scrollbar-width: none;
}
</style>
