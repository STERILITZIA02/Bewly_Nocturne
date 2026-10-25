<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import SettingsItem from '~/components/Settings/components/SettingsItem.vue'
import SettingsItemSubgroup from '~/components/Settings/components/SettingsItemSubgroup.vue'
import Slider from '~/components/Slider.vue'
import { settings } from '~/logic'
import { LOCAL_LOUDNESS_RANGE } from '~/utils/localLoudnessProtocol'

const { t } = useI18n()
</script>

<template>
  <div>
    <SettingsItem setting-id="local_loudness.enable" :title="t('local_loudness.enable')" :desc="t('local_loudness.description')" right-width="auto">
      <Radio v-model="settings.localLoudnessEnabled" />
    </SettingsItem>
    <SettingsItemSubgroup v-if="settings.localLoudnessEnabled" :title="t('settings.parameters')">
      <SettingsItem setting-id="local_loudness.target" :title="t('local_loudness.target')">
        <Slider v-model="settings.localLoudnessTarget" v-bind="LOCAL_LOUDNESS_RANGE.target" :label="`${settings.localLoudnessTarget} LUFS`" />
      </SettingsItem>
      <SettingsItem setting-id="local_loudness.strength" :title="t('local_loudness.strength')">
        <Slider v-model="settings.localLoudnessStrength" v-bind="LOCAL_LOUDNESS_RANGE.strength" :label="`${settings.localLoudnessStrength}%`" />
      </SettingsItem>
    </SettingsItemSubgroup>
  </div>
</template>
