<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'
import { getRecommendationModeOptions, selectRecommendationMode } from '~/logic/recommendationMode'

const { t } = useI18n()
const options = computed(() => getRecommendationModeOptions(t))
</script>

<template>
  <div
    v-layout-editable="'home-recommendation-switcher'"
    class="home-recommendation-mode-switcher bew-segment-control bew-segment-control--surface"
    role="group" :aria-label="$t('settings.recommendation_mode')"
  >
    <LiquidSegmentIndicator :active-key="settings.recommendationMode" />
    <button
      v-for="option in options" :key="option.value" type="button"
      class="bew-segment-control__item" data-segment-item
      :data-active="settings.recommendationMode === option.value ? 'true' : undefined"
      :aria-pressed="settings.recommendationMode === option.value"
      @click="selectRecommendationMode(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.home-recommendation-mode-switcher {
  max-width: 100%;
  overflow: auto hidden;
  scrollbar-width: none;
}
</style>
