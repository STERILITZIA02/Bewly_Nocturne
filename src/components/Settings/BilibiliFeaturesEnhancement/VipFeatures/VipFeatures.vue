<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'

const bCoinMode = computed({
  get: () => settings.value.autoReceiveBCoinCoupon ? 'auto' : settings.value.showBCoinReceiveReminder ? 'remind' : 'off',
  set: (mode: string) => {
    settings.value = { ...settings.value, autoReceiveBCoinCoupon: mode === 'auto', showBCoinReceiveReminder: mode === 'remind' }
  },
})
</script>

<template>
  <div>
    <SettingsItemGroup>
      <SettingsItem
        setting-id="settings.bcoin_mode"
        :title="$t('settings.bcoin_mode')"
        :desc="$t('settings.auto_receive_bcoin_coupon_desc')"
        right-width="auto"
      >
        <SettingsSegmentedControl
          v-model="bCoinMode" :label="$t('settings.bcoin_mode')" :options="[
            { value: 'off', label: $t('common.close') },
            { value: 'remind', label: $t('settings.bcoin_remind') },
            { value: 'auto', label: $t('settings.bcoin_auto') },
          ]"
        />
      </SettingsItem>
      <SettingsItem
        setting-id="settings.auto_receive_vip_exp" :title="$t('settings.auto_receive_vip_exp')"
        :desc="$t('settings.auto_receive_vip_exp_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.autoReceiveVipExp" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
