<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()

type MomentToggleSetting
  = | 'originalMomentsShowUserCard'
    | 'originalMomentsShowLiveList'
    | 'originalMomentsShowCommunityCenter'
    | 'originalMomentsShowHotSearch'
    | 'originalMomentsShowUpList'
    | 'momentsSidebarShowUserCard'
    | 'momentsSidebarShowPublish'
    | 'momentsSidebarShowLive'
    | 'momentsShowUpList'
    | 'momentsFilterUpRecommendation'
    | 'momentsHideChargeExclusive'
    | 'momentsHideVideoReservation'
    | 'momentsHideLiveReservation'
    | 'momentsHideLiveDynamics'
    | 'momentsHideVideoDynamics'
    | 'momentsHideDrawDynamics'
    | 'momentsHideUgcSeasonDynamics'
    | 'momentsHideForwardDynamics'
    | 'momentsHidePgcDynamics'
    | 'momentsHideArticleDynamics'

interface MomentTagOption {
  setting: MomentToggleSetting
  labelKey: string
  icon: string
}

const originalComponentOptions = computed<MomentTagOption[]>(() => [
  { setting: 'originalMomentsShowUserCard', labelKey: 'settings.original_moments_show_user_card', icon: 'i-tabler-user-square-rounded' },
  { setting: 'originalMomentsShowLiveList', labelKey: 'settings.original_moments_show_live_list', icon: 'i-tabler-live-photo' },
  { setting: 'originalMomentsShowCommunityCenter', labelKey: 'settings.original_moments_show_community_center', icon: 'i-tabler-layout-dashboard' },
  { setting: 'originalMomentsShowHotSearch', labelKey: 'settings.original_moments_show_hot_search', icon: 'i-tabler-flame' },
  { setting: 'originalMomentsShowUpList', labelKey: 'settings.original_moments_show_up_list', icon: 'i-tabler-users' },
])

const pluginComponentOptions = computed<MomentTagOption[]>(() => [
  { setting: 'momentsSidebarShowUserCard', labelKey: 'settings.moments_show_user_card', icon: 'i-tabler-user-square-rounded' },
  { setting: 'momentsSidebarShowPublish', labelKey: 'settings.moments_show_publish', icon: 'i-tabler-edit' },
  { setting: 'momentsSidebarShowLive', labelKey: 'settings.moments_show_live', icon: 'i-tabler-live-photo' },
  { setting: 'momentsShowUpList', labelKey: 'settings.moments_show_up_list', icon: 'i-tabler-users' },
])

const pluginFilterOptions = computed<MomentTagOption[]>(() => [
  { setting: 'momentsHideVideoDynamics', labelKey: 'settings.moments_filter_video_dynamic', icon: 'i-tabler-player-play' },
  { setting: 'momentsHideDrawDynamics', labelKey: 'settings.moments_filter_draw_dynamic', icon: 'i-tabler-photo' },
  { setting: 'momentsHideUgcSeasonDynamics', labelKey: 'settings.moments_filter_ugc_season_dynamic', icon: 'i-tabler-stack' },
  { setting: 'momentsHideForwardDynamics', labelKey: 'settings.moments_filter_forward_dynamic', icon: 'i-tabler-repeat' },
  { setting: 'momentsHidePgcDynamics', labelKey: 'settings.moments_filter_pgc_dynamic', icon: 'i-tabler-device-tv' },
  { setting: 'momentsHideArticleDynamics', labelKey: 'settings.moments_filter_article_dynamic', icon: 'i-tabler-news' },
  { setting: 'momentsFilterUpRecommendation', labelKey: 'settings.moments_filter_up_recommendation_short', icon: 'i-tabler-sparkles' },
  { setting: 'momentsHideChargeExclusive', labelKey: 'settings.moments_filter_charge_dynamic', icon: 'i-tabler-battery-charging' },
  { setting: 'momentsHideVideoReservation', labelKey: 'settings.moments_filter_video_reservation', icon: 'i-tabler-calendar-time' },
  { setting: 'momentsHideLiveReservation', labelKey: 'settings.moments_filter_live_reservation', icon: 'i-tabler-calendar-event' },
  { setting: 'momentsHideLiveDynamics', labelKey: 'settings.moments_filter_live_dynamic', icon: 'i-tabler-broadcast' },
])

const openModeOptions = computed(() => [
  {
    label: t('settings.moments_card_open_mode_opt.dialog'),
    value: 'dialog',
  },
  {
    label: t('settings.moments_card_open_mode_opt.new_tab'),
    value: 'newTab',
  },
  {
    label: t('settings.moments_card_open_mode_opt.background'),
    value: 'background',
  },
])

const gridColumnOptions = computed(() => [
  { label: t('settings.moments_grid_columns_option', { count: 3 }), value: '3' as const },
  { label: t('settings.moments_grid_columns_option', { count: 2 }), value: '2' as const },
  { label: t('settings.moments_grid_columns_option', { count: 1 }), value: '1' as const },
])
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="settings.group_original_moments_page" :title="$t('settings.group_original_moments_page')">
      <SettingsItem setting-id="settings.original_moments_use_bewly_filters" :title="$t('settings.original_moments_use_bewly_filters')" :desc="$t('settings.original_moments_use_bewly_filters_desc')" right-width="auto">
        <Radio v-model="settings.originalMomentsUseBewlyFilters" />
      </SettingsItem>
      <SettingsItem
        setting-id="settings.original_moments_visible_components"
        :title="$t('settings.moments_visible_components')"
      >
        <template #bottom>
          <div class="moment-setting-tags" role="group" :aria-label="$t('settings.moments_visible_components')">
            <SettingsToggleTag
              v-for="option in originalComponentOptions"
              :key="option.setting"
              v-model="settings[option.setting]"
              :label="$t(option.labelKey)"
              :data-setting-id="option.labelKey"
              :icon="option.icon"
            />
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_new_moments_page" :title="$t('settings.group_new_moments_page')">
      <SettingsItem
        setting-id="page.moments.sidebar" :title="$t('settings.moments_visible_components')"
      >
        <template #bottom>
          <div class="moment-setting-tags" role="group" :aria-label="$t('settings.moments_visible_components')">
            <SettingsToggleTag
              v-for="option in pluginComponentOptions"
              :key="option.setting"
              v-model="settings[option.setting]"
              :label="$t(option.labelKey)"
              :data-setting-id="option.labelKey"
              :icon="option.icon"
            />
          </div>
        </template>
      </SettingsItem>
      <SettingsItem
        setting-id="page.moments.gridColumns"
        :title="$t('settings.moments_grid_columns')"
        :desc="$t('settings.moments_grid_columns_desc')"
        right-width="auto"
      >
        <SettingsSegmentedControl
          v-model="settings.momentsGridColumns"
          :label="$t('settings.moments_grid_columns')"
          :options="gridColumnOptions"
        />
      </SettingsItem>
      <SettingsItem
        setting-id="settings.moments_start_from_last_seen"
        :title="$t('settings.moments_start_from_last_seen')"
        :desc="$t('settings.moments_start_from_last_seen_desc')" right-width="auto"
      >
        <Radio v-model="settings.momentsStartFromLastSeen" />
      </SettingsItem>
      <SettingsItem
        setting-id="settings.moments_enable_live_preview" :title="$t('settings.moments_enable_live_preview')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsEnableLivePreview" />
      </SettingsItem>
      <SettingsItem
        setting-id="settings.moments_enable_video_preview" :title="$t('settings.moments_enable_video_preview')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsEnableVideoPreview" />
      </SettingsItem>
      <template v-if="settings.momentsEnableVideoPreview">
        <SettingsItem setting-id="settings.enable_video_ctrl_bar_on_video_card" :title="$t('settings.moments_preview_controls')" right-width="auto">
          <Radio v-model="settings.momentsEnableVideoControls" />
        </SettingsItem>
        <SettingsItem setting-id="settings.video_preview_swipe_seek" :title="$t('settings.moments_preview_swipe')" :desc="$t('settings.video_preview_swipe_seek_desc')" right-width="auto">
          <Radio v-model="settings.momentsEnableVideoPreviewSwipeSeek" />
        </SettingsItem>
        <SettingsItem setting-id="settings.hover_video_card_delayed" :title="$t('settings.moments_preview_delay')" right-width="auto">
          <Radio v-model="settings.momentsVideoPreviewDelayed" />
        </SettingsItem>
        <SettingsItem setting-id="settings.only_cover_video_preview" :title="$t('settings.moments_preview_cover_only')" right-width="auto">
          <Radio v-model="settings.momentsOnlyCoverVideoPreview" />
        </SettingsItem>
      </template>
      <SettingsItem
        setting-id="settings.moments_filtered_types" :title="$t('settings.moments_filtered_types')"
        :desc="$t('settings.moments_filtered_types_desc')"
      >
        <template #bottom>
          <div class="moment-setting-tags moment-setting-tags--filters" role="group" :aria-label="$t('settings.moments_filtered_types')">
            <SettingsToggleTag
              v-for="option in pluginFilterOptions"
              :key="option.setting"
              v-model="settings[option.setting]"
              :label="$t(option.labelKey)"
              :data-setting-id="option.labelKey"
              :icon="option.icon"
              inverted
              :show-state-icon="false"
            />
          </div>
        </template>
      </SettingsItem>
      <SettingsItem
        setting-id="settings.moments_enable_keyword_filter" :title="$t('settings.moments_enable_keyword_filter')"
        :desc="$t('settings.moments_enable_keyword_filter_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsEnableKeywordFilter" />
        <template v-if="settings.momentsEnableKeywordFilter" #bottom>
          <Input
            v-model="settings.momentsBlockedKeywords"
            :placeholder="$t('settings.moments_blocked_keywords_placeholder')"
          />
        </template>
      </SettingsItem>
      <SettingsItem
        setting-id="settings.moments_card_open_mode" :title="$t('settings.moments_card_open_mode')"
        :desc="$t('settings.moments_card_open_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.momentsCardOpenMode"
          :options="openModeOptions"
          w="180px"
        />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style scoped lang="scss">
.moment-setting-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
}
</style>
