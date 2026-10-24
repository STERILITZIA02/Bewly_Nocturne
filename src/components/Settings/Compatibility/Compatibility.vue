<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="settings.group_common" :title="$t('settings.group_common')">
      <SettingsItem
        setting-id="settings.prevent_mobile_redirect" :title="$t('settings.prevent_mobile_redirect')"
        :desc="$t('settings.prevent_mobile_redirect_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.preventMobileRedirect" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_ad_blocking" :title="$t('settings.group_ad_blocking')">
      <SettingsItem setting-id="settings.block_ads" :title="$t('settings.block_ads')" :desc="$t('settings.block_ads_desc')" right-width="auto">
        <Radio v-model="settings.blockAds" />
      </SettingsItem>
      <SettingsItem setting-id="settings.block_top_search_page_ads" :title="$t('settings.block_top_search_page_ads')" :desc="$t('settings.block_top_search_page_ads_desc')" right-width="auto">
        <Radio v-model="settings.blockTopSearchPageAds" />
      </SettingsItem>
      <SettingsItem setting-id="settings.clean_url_argument" :title="$t('settings.clean_url_argument')" :desc="$t('settings.clean_url_argument_desc')" right-width="auto">
        <Radio v-model="settings.cleanUrlArgument" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_clean_share_link" :title="$t('settings.group_clean_share_link')">
      <SettingsItem setting-id="settings.enable_clean_share_link" :title="$t('settings.enable_clean_share_link')" :desc="$t('settings.enable_clean_share_link_desc')" right-width="auto">
        <Radio v-model="settings.enableCleanShareLink" />
      </SettingsItem>
      <template v-if="settings.enableCleanShareLink">
        <SettingsItem setting-id="settings.clean_share_link_include_title" :title="$t('settings.clean_share_link_include_title')" :desc="$t('settings.clean_share_link_include_title_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkIncludeTitle" />
        </SettingsItem>
        <SettingsItem setting-id="settings.clean_share_link_remove_tracking_params" :title="$t('settings.clean_share_link_remove_tracking_params')" :desc="$t('settings.clean_share_link_remove_tracking_params_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkRemoveTrackingParams" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>
  </div>
</template>
