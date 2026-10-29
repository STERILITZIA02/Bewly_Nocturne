<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import LocalLoudnessPreferences from '~/components/LocalLoudnessPreferences.vue'
import Slider from '~/components/Slider.vue'
import { audioDelayMs, audioDelayState, localLoudnessPanelOpen, localLoudnessSamples, localLoudnessState, notifyLocalLoudnessPanel, setAudioDelay } from '~/composables/useLocalLoudness'
import { playerAdjustment, resetPlayerAdjustment } from '~/composables/usePlayerAdjustment'
import { settings } from '~/logic'
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
    :title="t(settings.playerAdjustmentEnabled ? 'player_adjustment.title' : 'local_loudness.title')" width="480px" :show-footer="false" @before-close="notifyLocalLoudnessPanel(false)"
    @close="closing"
  >
    <section v-if="settings.playerAdjustmentEnabled" class="player-adjustment">
      <div class="player-adjustment__buttons">
        <Button type="secondary" :disabled="!playerAdjustment.available" @click="playerAdjustment.rotation = (playerAdjustment.rotation + 270) % 360">
          <span i-tabler:rotate-2 />{{ t('player_adjustment.rotate_left') }}
        </Button>
        <Button type="secondary" :disabled="!playerAdjustment.available" @click="playerAdjustment.rotation = (playerAdjustment.rotation + 90) % 360">
          <span i-tabler:rotate-clockwise-2 />{{ t('player_adjustment.rotate_right') }}
        </Button>
        <Button type="secondary" :disabled="!playerAdjustment.available" :aria-pressed="playerAdjustment.horizontal" @click="playerAdjustment.horizontal = !playerAdjustment.horizontal">
          {{ t('player_adjustment.horizontal') }}
        </Button>
        <Button type="secondary" :disabled="!playerAdjustment.available" :aria-pressed="playerAdjustment.vertical" @click="playerAdjustment.vertical = !playerAdjustment.vertical">
          {{ t('player_adjustment.vertical') }}
        </Button>
        <Button type="secondary" @click="resetPlayerAdjustment">
          {{ t('player_adjustment.reset') }}
        </Button>
      </div>
      <p class="bew-help">
        {{ t('player_adjustment.picture_note') }}
      </p>
      <label>{{ t('player_adjustment.delay') }}</label>
      <Slider
        :model-value="audioDelayMs" :min="0" :max="1000" :step="10" :label="`${audioDelayMs} ms`"
        :accessible-label="t('player_adjustment.delay')" :disabled="!playerAdjustment.available" @update:model-value="setAudioDelay"
      />
      <p class="bew-help">
        {{ t('player_adjustment.delay_note') }}
      </p>
      <p v-if="audioDelayMs" class="bew-help" role="status">
        {{ t(`local_loudness.state.${audioDelayState}`) }}
      </p>
    </section>
    <LocalLoudnessPreferences v-if="settings.localLoudnessEnabled" />
    <div v-if="settings.localLoudnessEnabled" class="loudness-status" role="status">
      {{ t(`local_loudness.state.${localLoudnessState}`) }}
    </div>
    <figure v-if="settings.localLoudnessEnabled" class="loudness-curve">
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
    <p v-if="settings.localLoudnessEnabled" class="loudness-note">
      {{ t('local_loudness.limits') }}
    </p>
  </Dialog>
</template>

<style scoped lang="scss">
@use "../styles/dataChart";
.player-adjustment {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  margin-bottom: var(--bew-space-4);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  p {
    margin: 0;
  }
}
.player-adjustment__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
}
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
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
}
.loudness-note {
  margin-top: var(--bew-space-3);
}
</style>
