<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import Dialog from '~/components/Dialog.vue'
import LocalLoudnessPreferences from '~/components/LocalLoudnessPreferences.vue'
import { localLoudnessPanelOpen, localLoudnessSamples, localLoudnessState, notifyLocalLoudnessPanel } from '~/composables/useLocalLoudness'

const { t } = useI18n()
const points = computed(() => localLoudnessSamples.value.map((sample, index) => `${index * 5},${(6 - sample.gainDb) * 4}`).join(' '))
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
      <svg viewBox="0 0 300 96" role="img" :aria-label="t('local_loudness.curve')">
        <path d="M0 24H300" class="loudness-zero" />
        <polyline v-if="points" :points="points" />
      </svg>
    </figure>
    <p class="loudness-note">
      {{ t('local_loudness.limits') }}
    </p>
  </Dialog>
</template>

<style scoped lang="scss">
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
  margin-top: var(--bew-space-2);
}
polyline {
  stroke: var(--bew-theme-foreground);
  stroke-width: 2;
  fill: none;
}
.loudness-zero {
  stroke: var(--bew-border-color);
  stroke-width: 1;
}
.loudness-note {
  margin-top: var(--bew-space-3);
}
</style>
