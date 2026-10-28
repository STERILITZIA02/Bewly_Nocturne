<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import LinkOpening from '../../Navigation/LinkOpening.vue'
import VideoCardContentEditor from './VideoCardContentEditor.vue'
import VideoCardContextMenuEditor from './VideoCardContextMenuEditor.vue'
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="settings.group_video_card_display" :title="$t('settings.group_video_card_display')">
      <SettingsItem setting-id="settings.enable_video_preview" :title="$t('settings.enable_video_preview')" right-width="auto">
        <Radio v-model="settings.enableVideoPreview" />
      </SettingsItem>

      <template v-if="settings.enableVideoPreview">
        <SettingsItem setting-id="settings.resume_from_preview_position" :title="$t('settings.resume_from_preview_position')" :desc="$t('settings.resume_from_preview_position_desc')" right-width="auto">
          <Radio v-model="settings.resumeFromPreviewPosition" />
        </SettingsItem>
        <SettingsItem setting-id="settings.enable_video_ctrl_bar_on_video_card" :title="$t('settings.enable_video_ctrl_bar_on_video_card')" right-width="auto">
          <Radio v-model="settings.enableVideoCtrlBarOnVideoCard" />
        </SettingsItem>

        <SettingsItem
          setting-id="settings.video_preview_swipe_seek" :title="$t('settings.video_preview_swipe_seek')"
          :desc="$t('settings.video_preview_swipe_seek_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.enableVideoPreviewSwipeSeek" />
        </SettingsItem>

        <SettingsItem setting-id="settings.hover_video_card_delayed" :title="$t('settings.hover_video_card_delayed')" right-width="auto">
          <Radio v-model="settings.hoverVideoCardDelayed" />
        </SettingsItem>

        <SettingsItem setting-id="settings.only_cover_video_preview" :title="$t('settings.only_cover_video_preview')" right-width="auto">
          <Radio v-model="settings.onlyCoverVideoPreview" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <SettingsItemGroup
      data-setting-id="settings.group_video_card_content" :title="$t('settings.group_video_card_content')"
    >
      <VideoCardContentEditor />
    </SettingsItemGroup>

    <SettingsItemGroup
      data-setting-id="settings.group_video_card_context_menu" :title="$t('settings.group_video_card_context_menu')"
      :desc="$t('settings.group_video_card_context_menu_desc')"
      collapsible
    >
      <VideoCardContextMenuEditor />
    </SettingsItemGroup>

    <LinkOpening scope="videoCard" />
  </div>
</template>
