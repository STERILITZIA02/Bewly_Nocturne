<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { AutoPlayMode, CollectedSeasonPlayAllMode, CustomPlayOrderContext, DefaultCustomPlayOrder } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'

const { t } = useI18n()
const playOrder = computed({
  get: () => settings.value.enableRandomPlay ? settings.value.defaultCustomPlayOrder : 'native',
  set: (order: DefaultCustomPlayOrder | 'native') => {
    settings.value = {
      ...settings.value,
      enableRandomPlay: order !== 'native',
      ...(order === 'native' ? {} : { defaultCustomPlayOrder: order }),
    }
  },
})
const usesRandomOrder = computed(() => settings.value.enableRandomPlay && (
  settings.value.enableCustomPlayOrderOverrides
    ? Object.values(settings.value.customPlayOrderOverrides).some(order => (order === 'inherit' ? settings.value.defaultCustomPlayOrder : order) === 'random')
    : settings.value.defaultCustomPlayOrder === 'random'
))

const singleVideoMode = computed({
  get: () => settings.value.autoPlayRecommend === 'autoPlayWithRecommend' ? 'autoPlay' : settings.value.autoPlayRecommend,
  set: (mode: AutoPlayMode) => { settings.value.autoPlayRecommend = mode },
})

const nativeAutoPlayModes: { label: string, value: AutoPlayMode }[] = [
  { label: 'play_order_native', value: 'default' },
  { label: 'auto_play_mode_auto_play', value: 'autoPlay' },
  { label: 'auto_play_mode_auto_play_with_recommend', value: 'autoPlayWithRecommend' },
  { label: 'auto_play_mode_pause_at_end', value: 'pauseAtEnd' },
  { label: 'auto_play_mode_loop', value: 'loop' },
]

const defaultCustomPlayOrderOptions = computed(() => [
  {
    label: t('settings.random_play_order_sequential'),
    value: 'sequential' satisfies DefaultCustomPlayOrder,
  },
  {
    label: t('settings.random_play_order_reverse'),
    value: 'reverse' satisfies DefaultCustomPlayOrder,
  },
  {
    label: t('settings.random_play_order_random'),
    value: 'random' satisfies DefaultCustomPlayOrder,
  },
])

const customPlayOrderOverrideOptions = computed(() => [
  {
    label: t('settings.custom_play_order_inherit'),
    value: 'inherit' as const,
  },
  ...defaultCustomPlayOrderOptions.value,
])

const customPlayOrderContextOptions = computed<{ label: string, value: CustomPlayOrderContext }[]>(() => [
  { label: t('settings.play_order_multipart'), value: 'multipart' },
  { label: t('settings.play_order_collection'), value: 'collection' },
  { label: t('settings.play_order_watch_later'), value: 'watchLater' },
  { label: t('settings.play_order_playlist'), value: 'playlist' },
])

const collectedSeasonPlayAllModeOptions = computed(() => [
  {
    label: t('settings.collected_season_play_all_mode_beginning'),
    value: 'beginning' satisfies CollectedSeasonPlayAllMode,
  },
  {
    label: t('settings.collected_season_play_all_mode_latest'),
    value: 'latest' satisfies CollectedSeasonPlayAllMode,
  },
  {
    label: t('settings.collected_season_play_all_mode_last_watched'),
    value: 'lastWatched' satisfies CollectedSeasonPlayAllMode,
  },
])

// 随机播放专用的启用方式
const randomPlayActivationModeOptions = computed(() => {
  return [
    {
      label: t('settings.random_play_mode_manual'),
      value: 'manual',
    },
    {
      label: t('settings.random_play_mode_auto'),
      value: 'auto',
    },
  ]
})
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="settings.group_playback_end_behavior" :title="$t('settings.group_playback_end_behavior')" :desc="$t('settings.playback_policy_priority')">
      <SettingsItem
        setting-id="settings.auto_exit_fullscreen_on_end" :title="t('settings.auto_exit_fullscreen_on_end')"
        :desc="t('settings.auto_exit_fullscreen_on_end_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.autoExitFullscreenOnEnd" />
      </SettingsItem>
      <SettingsItem setting-id="settings.auto_remove_watch_later_on_end" :title="$t('settings.auto_remove_watch_later_on_end')" :desc="$t('settings.auto_remove_watch_later_on_end_desc')" right-width="auto">
        <Radio v-model="settings.autoRemoveWatchLaterOnEnd" />
      </SettingsItem>
      <SettingsItem
        setting-id="settings.use_bilibili_default_auto_play" :title="t('settings.use_bilibili_default_auto_play')"
        right-width="auto"
      >
        <Radio v-model="settings.useBilibiliDefaultAutoPlay" />
      </SettingsItem>

      <SettingsItemSubgroup
        v-if="!settings.useBilibiliDefaultAutoPlay" data-setting-id="settings.group_video_type_end_behavior"
        :title="t('settings.group_video_type_end_behavior')"
        :desc="t('settings.group_custom_auto_play_behavior_desc')"
      >
        <SettingsItem
          setting-id="settings.auto_play_multipart" :title="t('settings.auto_play_multipart')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayMultipart"
            :options="nativeAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.auto_play_collection" :title="t('settings.auto_play_collection')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayCollection"
            :options="nativeAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.auto_play_watch_later" :title="t('settings.auto_play_watch_later')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayWatchLater"
            :options="nativeAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.auto_play_playlist" :title="t('settings.auto_play_playlist')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayPlaylist"
            :options="nativeAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.auto_play_recommend" :title="t('settings.auto_play_recommend')"
          right-width="auto"
        >
          <Select
            v-model="singleVideoMode"
            :options="nativeAutoPlayModes.filter(m => m.value !== 'autoPlayWithRecommend').map(m => ({ label: $t(m.value === 'autoPlay' ? 'settings.single_video_auto_play' : `settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_random_play" :title="t('settings.group_random_play')">
      <SettingsItem
        setting-id="settings.default_custom_play_order"
        :title="t('settings.default_custom_play_order')"
        :desc="t('settings.default_custom_play_order_desc')"
        right-width="auto"
      >
        <Select v-model="playOrder" :options="[{ label: t('settings.play_order_native'), value: 'native' }, ...defaultCustomPlayOrderOptions]" w="160px" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      v-if="settings.enableRandomPlay" data-setting-id="settings.custom_play_order_overrides"
      :title="t('settings.custom_play_order_overrides')" collapsible :default-collapsed="!settings.enableCustomPlayOrderOverrides"
    >
      <SettingsItem
        setting-id="settings.enable_custom_play_order_overrides"
        :title="t('settings.enable_custom_play_order_overrides')"
        right-width="auto"
      >
        <Radio v-model="settings.enableCustomPlayOrderOverrides" />
      </SettingsItem>

      <template v-if="settings.enableCustomPlayOrderOverrides">
        <SettingsItem
          v-for="context in customPlayOrderContextOptions"
          :key="context.value"
          :setting-id="`settings.custom_play_order_overrides.${context.value}`"
          :title="context.label"
          right-width="auto"
        >
          <Select
            v-model="settings.customPlayOrderOverrides[context.value]"
            :options="customPlayOrderOverrideOptions"
            w="160px"
          />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <SettingsItemGroup
      v-if="usesRandomOrder" data-setting-id="settings.group_random_play_settings"
      :title="t('settings.group_random_play_settings')"
      :desc="t('settings.group_random_play_settings_desc')"
    >
      <SettingsItem
        setting-id="settings.random_play_mode" :title="t('settings.random_play_mode')"
        right-width="auto"
      >
        <Select v-model="settings.randomPlayMode" :options="randomPlayActivationModeOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        v-if="settings.randomPlayMode === 'auto'" setting-id="settings.min_videos_for_random"
        :title="t('settings.min_videos_for_random')"
        :desc="t('settings.min_videos_for_random_desc')"
        right-width="auto"
      >
        <Input
          v-model="settings.minVideosForRandom"
          type="number"
          w="120px"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_playlist_start_behavior" :title="t('settings.group_playlist_start_behavior')">
      <SettingsItem
        setting-id="settings.collected_season_play_all_mode" :title="t('settings.collected_season_play_all_mode')"
        :desc="t('settings.collected_season_play_all_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.collectedSeasonPlayAllMode"
          :options="collectedSeasonPlayAllModeOptions"
          w="180px"
        />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
