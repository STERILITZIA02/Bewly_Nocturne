<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

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

interface ToggleTagOption {
  setting: ToggleSetting
  label: string
  icon: string
}

const playbackMemoryOptions = computed<ToggleTagOption[]>(() => [
  { setting: 'rememberPlaybackRate', label: t('settings.remember_playback_rate'), icon: 'i-tabler-gauge' },
  { setting: 'rememberVideoAspectRatio', label: t('settings.remember_video_aspect_ratio'), icon: 'i-tabler-aspect-ratio' },
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
    <SettingsItemGroup :title="t('settings.group_player_components')">
      <SettingsItem
        :title="t('settings.video_danmaku_default_state')"
        right-width="auto"
      >
        <Select
          v-model="settings.defaultDanmakuState"
          :options="playerDefaultStateOptions"
          w="180px"
        />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.video_caption_default_state')"
        right-width="auto"
      >
        <Select
          v-model="settings.defaultCaptionState"
          :options="playerDefaultStateOptions"
          w="180px"
        />
      </SettingsItem>

      <SettingsItemSubgroup
        :title="t('settings.group_playback_memory')"
        :desc="t('settings.group_playback_memory_desc')"
      >
        <div class="video-setting-tags" role="group" :aria-label="t('settings.group_playback_memory')">
          <SettingsToggleTag
            v-for="option in playbackMemoryOptions"
            :key="option.setting"
            v-model="settings[option.setting]"
            :label="option.label"
            :icon="option.icon"
            :show-state-icon="false"
          />
        </div>
      </SettingsItemSubgroup>

      <SettingsItemSubgroup
        :title="t('settings.group_video_page_actions')"
        :desc="t('settings.group_video_page_actions_desc')"
      >
        <SettingsItem
          :title="t('settings.enlarge_favorite_dialog')"
          :desc="t('settings.enlarge_favorite_dialog_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.enlargeFavoriteDialog" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.external_watch_later_button')"
          :desc="t('settings.external_watch_later_button_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.externalWatchLaterButton" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.show_vertical_video_zoom_button')"
          :desc="t('settings.show_vertical_video_zoom_button_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.showVerticalVideoZoomButton" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.show_video_screenshot_button')"
          :desc="t('settings.show_video_screenshot_button_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.showVideoScreenshotButton" />
        </SettingsItem>
        <SettingsItem :title="t('settings.video_screenshot_shortcut')" :desc="t('settings.video_screenshot_shortcut_desc')" right-width="auto">
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
