<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import LocalLoudnessPreferences from '~/components/LocalLoudnessPreferences.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { PlayerDefaultState } from '~/logic/storage'
import { DEFAULT_SCREENSHOT_SHORTCUT, isValidScreenshotShortcut, screenshotKey } from '~/utils/videoScreenshotShortcut'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()
const shortcutError = ref(false)
function recordScreenshotKey(event: KeyboardEvent) {
  if (event.isComposing || event.repeat || ['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key))
    return
  event.preventDefault()
  event.stopPropagation()
  const key = event.key === 'Backspace' || event.key === 'Delete' ? '' : screenshotKey(event)
  shortcutError.value = !isValidScreenshotShortcut(key)
  if (!shortcutError.value)
    settings.value.videoScreenshotShortcut = key
}

type ToggleSetting
  = | 'rememberPlaybackRate'
    | 'rememberVideoAspectRatio'
    | 'rememberVideoQuality'

interface ToggleTagOption {
  setting: ToggleSetting
  labelKey: string
  description?: string
  icon: string
}

const playbackMemoryOptions = computed<ToggleTagOption[]>(() => [
  { setting: 'rememberPlaybackRate', labelKey: 'settings.remember_playback_rate', icon: 'i-tabler-gauge' },
  { setting: 'rememberVideoAspectRatio', labelKey: 'settings.remember_video_aspect_ratio', icon: 'i-tabler-aspect-ratio' },
  { setting: 'rememberVideoQuality', labelKey: 'settings.remember_video_quality', description: t('settings.remember_video_quality_desc'), icon: 'i-tabler-badge-hd' },
])

const playerDefaultStateOptions = computed<{ label: string, value: PlayerDefaultState }[]>(() => [
  { label: t('settings.video_default_state_opt.system'), value: 'system' },
  { label: t('settings.video_default_state_opt.remember'), value: 'remember' },
  { label: t('settings.video_default_state_opt.on'), value: 'on' },
  { label: t('settings.video_default_state_opt.off'), value: 'off' },
])
</script>

<template>
  <div>
    <SettingsItemGroup :title="t('player_adjustment.title')">
      <SettingsItem setting-id="player_adjustment.enable" :title="t('player_adjustment.enable')" :desc="t('player_adjustment.description')" right-width="auto">
        <Radio v-model="settings.playerAdjustmentEnabled" />
      </SettingsItem>
      <SettingsItem setting-id="player_adjustment.show_button" :title="t('player_adjustment.show_button')" :desc="t('player_adjustment.show_button_description')" right-width="auto">
        <Radio v-model="settings.showPlayerAdjustmentButton" />
      </SettingsItem>
    </SettingsItemGroup>
    <SettingsItemGroup data-setting-id="local_loudness.title" :title="t('local_loudness.title')">
      <LocalLoudnessPreferences />
    </SettingsItemGroup>
    <SettingsItemGroup data-setting-id="settings.group_player_components" :title="t('settings.group_player_components')">
      <SettingsItem
        setting-id="settings.video_danmaku_default_state" :title="t('settings.video_danmaku_default_state')"
        right-width="auto"
      >
        <Select
          v-model="settings.defaultDanmakuState"
          :options="playerDefaultStateOptions"
          w="180px"
        />
      </SettingsItem>

      <SettingsItem
        setting-id="settings.video_caption_default_state" :title="t('settings.video_caption_default_state')"
        right-width="auto"
      >
        <Select
          v-model="settings.defaultCaptionState"
          :options="playerDefaultStateOptions"
          w="180px"
        />
      </SettingsItem>

      <SettingsItemSubgroup
        data-setting-id="settings.group_playback_memory" :title="t('settings.group_playback_memory')"
      >
        <div class="video-setting-tags" role="group" :aria-label="t('settings.group_playback_memory')">
          <SettingsToggleTag
            v-for="option in playbackMemoryOptions"
            :key="option.setting"
            v-model="settings[option.setting]"
            :label="$t(option.labelKey)"
            :data-setting-id="option.labelKey"
            :description="option.description"
            :icon="option.icon"
            :show-state-icon="false"
          />
        </div>
      </SettingsItemSubgroup>

      <SettingsItemSubgroup
        data-setting-id="settings.group_video_page_actions" :title="t('settings.group_video_page_actions')"
      >
        <SettingsItem
          setting-id="settings.enlarge_favorite_dialog" :title="t('settings.enlarge_favorite_dialog')"
          right-width="auto"
        >
          <Radio v-model="settings.enlargeFavoriteDialog" />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.external_watch_later_button" :title="t('settings.external_watch_later_button')"
          right-width="auto"
        >
          <Radio v-model="settings.externalWatchLaterButton" />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.show_vertical_video_zoom_button" :title="t('settings.show_vertical_video_zoom_button')"
          right-width="auto"
        >
          <Radio v-model="settings.showVerticalVideoZoomButton" />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.show_video_screenshot_button" :title="t('settings.show_video_screenshot_button')"
          :desc="t('settings.player_extra_controls_hint')"
          right-width="auto"
        >
          <Radio v-model="settings.showVideoScreenshotButton" />
        </SettingsItem>
        <SettingsItem setting-id="settings.video_screenshot_shortcut" :title="t('settings.video_screenshot_shortcut')" :desc="t('settings.video_screenshot_shortcut_desc')" right-width="auto">
          <div class="screenshot-shortcut">
            <input :value="settings.videoScreenshotShortcut" :aria-label="t('settings.video_screenshot_shortcut')" readonly @keydown="recordScreenshotKey">
            <Button type="tertiary" @click="settings.videoScreenshotShortcut = DEFAULT_SCREENSHOT_SHORTCUT; shortcutError = false">
              {{ t('common.operation.reset') }}
            </Button>
            <span v-if="shortcutError" role="status">{{ t('settings.video_screenshot_shortcut_conflict') }}</span>
          </div>
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.screenshot-shortcut {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-2);
  input {
    width: calc(var(--bew-space-12) * 3);
    min-height: var(--bew-control-height);
    padding-inline: var(--bew-space-3);
    background: var(--bew-content-solid);
    border-radius: var(--bew-interactive-radius);
    color: var(--bew-text-1);
    font: inherit;
  }
  [role="status"] {
    color: var(--bew-error-color);
  }
}
.video-setting-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  padding: 0.25rem 0 0.5rem;
}
</style>
