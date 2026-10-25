<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'
import { getRecommendationModeOption, getRecommendationModeOptions, selectRecommendationMode } from '~/logic/recommendationMode'

const { t } = useI18n()
const options = computed(() => getRecommendationModeOptions(t))
const visibleOptions = computed(() => settings.value.recommendationModeSwitcherOptions.flatMap(({ mode, visible }) => visible ? options.value.filter(option => option.value === mode) : []))
const activeOption = computed(getRecommendationModeOption)
const indicator = ref<InstanceType<typeof LiquidSegmentIndicator>>()
watch(visibleOptions, () => indicator.value?.updateIndicator(true), { flush: 'post' })
</script>

<template>
  <div
    v-if="visibleOptions.length"
    v-layout-editable="'home-recommendation-switcher'"
    class="home-recommendation-mode-switcher bew-segment-control bew-segment-control--surface bew-segment-control--track"
    role="group" :aria-label="$t('settings.recommendation_mode')"
  >
    <LiquidSegmentIndicator ref="indicator" :active-key="activeOption" />
    <button
      v-for="option in visibleOptions" :key="option.value" type="button"
      class="bew-segment-control__item" data-segment-item
      :data-active="activeOption === option.value ? 'true' : undefined"
      :aria-pressed="activeOption === option.value"
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
