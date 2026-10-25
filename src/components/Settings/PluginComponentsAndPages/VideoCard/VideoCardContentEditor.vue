<script setup lang="ts">
import { settings } from '~/logic'

import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

type ContentSettingKey
  = | 'showVideoCardAuthorName'
    | 'showVideoCardPublishTime'
    | 'showVideoWatchedBadge'

interface ContentElement {
  setting: ContentSettingKey
  labelKey: string
  icon: string
}

const elements = computed<ContentElement[]>(() => [
  { setting: 'showVideoCardAuthorName', labelKey: 'settings.show_video_card_author_name', icon: 'i-tabler:edit' },
  { setting: 'showVideoCardPublishTime', labelKey: 'settings.show_video_card_publish_time', icon: 'i-tabler:calendar-plus' },
  { setting: 'showVideoWatchedBadge', labelKey: 'settings.show_video_watched_badge', icon: 'i-tabler:eye' },
])
</script>

<template>
  <div class="video-card-content-editor">
    <div class="content-row">
      <span class="content-row__label">{{ $t('settings.video_card_content_region_other') }}</span>

      <div class="content-row__elements">
        <SettingsToggleTag
          v-for="element in elements"
          :key="element.setting"
          v-model="settings[element.setting]"
          :label="$t(element.labelKey)"
          :data-setting-id="element.labelKey"
          :icon="element.icon"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.video-card-content-editor {
  padding: var(--bew-space-3) 0;
  border-bottom: var(--bew-hairline) solid var(--bew-separator-color);
}

.content-row {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  align-items: center;
  gap: var(--bew-space-3);
  min-height: 3rem;
}

.content-row__label {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
}

.content-row__elements {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
  padding: var(--bew-space-2) 0;
}

@media (max-width: 520px) {
  .content-row {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 0.5rem 0;
  }

  .content-row__elements {
    padding-bottom: 0;
  }
}
</style>
