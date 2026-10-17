<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import Dialog from '~/components/Dialog.vue'
import LocalLoudnessPreferences from '~/components/LocalLoudnessPreferences.vue'
import { localLoudnessPanelOpen, localLoudnessSamples, localLoudnessState, notifyLocalLoudnessPanel } from '~/composables/useLocalLoudness'
import { LOCAL_LOUDNESS_SAMPLE_LIMIT } from '~/utils/localLoudnessProtocol'

const { t } = useI18n()
const x = (index: number) => 40 + index / (LOCAL_LOUDNESS_SAMPLE_LIMIT - 1) * 312
const y = (gain: number) => 12 + (6 - gain) / 24 * 104
const points = computed(() => localLoudnessSamples.value.map((sample, index) => `${x(index)},${y(sample.gainDb)}`).join(' '))
const current = computed(() => localLoudnessSamples.value.at(-1))
function closing() {
  localLoudnessPanelOpen.value = false
  notifyLocalLoudnessPanel()
}
onUnmounted(closing)
</script>

<template>
  <Dialog
    :title="t('local_loudness.title')" width="480px" :show-footer="false" :frosted-glass="false" @before-close="notifyLocalLoudnessPanel(false)"
    @close="closing"
  >
    <LocalLoudnessPreferences />
    <div class="loudness-status" role="status">
      {{ t(`local_loudness.state.${localLoudnessState}`) }}
    </div>
    <figure class="loudness-curve">
      <figcaption>{{ t('local_loudness.curve') }}<span v-if="current"> · {{ current.gainDb.toFixed(1) }} dB</span></figcaption>
      <div class="loudness-plot">
        <svg viewBox="0 0 360 140" role="img" :aria-label="`${t('local_loudness.curve')}${current ? ` · ${current.gainDb.toFixed(1)} dB` : ''}`">
          <path v-for="gain in [6, 0, -18]" :key="gain" :d="`M40 ${y(gain)}H352`" class="loudness-zero" />
          <path v-for="index in 7" :key="index" :d="`M${40 + (index - 1) * 52} 116v5`" class="loudness-zero" />
          <polyline v-if="points" :points="points" />
          <circle v-if="current" :cx="x(localLoudnessSamples.length - 1)" :cy="y(current.gainDb)" r="3" class="loudness-current" />
        </svg>
        <span v-for="gain in [6, 0, -18]" :key="gain" class="loudness-scale" :style="{ top: `${y(gain) / 140 * 100}%` }" aria-hidden="true">{{ gain > 0 ? '+' : '' }}{{ gain }}</span>
      </div>
    </figure>
    <p class="loudness-note">
      {{ t('local_loudness.limits') }}
    </p>
  </Dialog>
</template>

<style scoped lang="scss">
@use "../styles/dataChart";
.loudness-status,
.loudness-note,
figcaption {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  color: var(--bew-text-2);
}
.loudness-status {
  margin-block: var(--bew-space-3);
}
.loudness-curve {
  margin: 0;
  padding: var(--bew-space-3);
  background: var(--bew-content-solid);
  border-radius: var(--bew-interactive-radius);
}
svg {
  display: block;
  width: 100%;
}
.loudness-plot {
  position: relative;
  margin-top: var(--bew-space-2);
}
polyline {
  @include dataChart.line;
}
.loudness-zero {
  @include dataChart.guide;
}
.loudness-current {
  fill: var(--bew-chart-accent);
}
.loudness-scale {
  position: absolute;
  left: 0;
  transform: translateY(-50%);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-variant-numeric: tabular-nums;
}
.loudness-note {
  margin-top: var(--bew-space-3);
}
</style>
