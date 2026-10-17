<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import type { VideoCardContextMenuKey } from '~/logic/storage'

import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()

interface MenuElement {
  key: VideoCardContextMenuKey
  label: string
  icon: string
}

interface MenuGroup {
  id: string
  label: string
  elements: MenuElement[]
}

const groups = computed<MenuGroup[]>(() => [
  {
    id: 'recommendation',
    label: t('settings.video_card_context_menu_region_recommendation'),
    elements: [
      { key: 'notInterested', label: t('video_card.operation.not_interested'), icon: 'i-tabler:mood-sad' },
      { key: 'notInterestedUploader', label: t('video_card.operation.not_interested_uploader'), icon: 'i-tabler:user-cancel' },
    ],
  },
  {
    id: 'opening',
    label: t('settings.video_card_context_menu_region_opening'),
    elements: [
      { key: 'openInNewTab', label: t('video_card.operation.open_in_new_tab'), icon: 'i-tabler:layout-bottombar' },
      { key: 'openInBackground', label: t('video_card.operation.open_in_background'), icon: 'i-tabler:layout-navbar' },
      { key: 'openInNewWindow', label: t('video_card.operation.open_in_new_window'), icon: 'i-tabler:maximize' },
      { key: 'openInCurrentTab', label: t('video_card.operation.open_in_current_tab'), icon: 'i-tabler:layout-bottombar' },
      { key: 'openInDrawer', label: t('video_card.operation.open_in_drawer'), icon: 'i-tabler:picture-in-picture' },
    ],
  },
  {
    id: 'copying',
    label: t('settings.video_card_context_menu_region_copying'),
    elements: [
      { key: 'copyVideoLink', label: t('video_card.operation.copy_video_link'), icon: 'i-tabler:copy' },
      { key: 'copyCleanVideoLink', label: t('video_card.operation.copy_clean_video_link'), icon: 'i-tabler:link' },
      { key: 'copyBVNumber', label: t('video_card.operation.copy_bv_number'), icon: 'i-tabler:copy' },
      { key: 'copyAVNumber', label: t('video_card.operation.copy_av_number'), icon: 'i-tabler:copy' },
      { key: 'viewOriginalCover', label: t('video_card.operation.view_the_original_cover'), icon: 'i-tabler:photo' },
      { key: 'favorite', label: t('video_card.operation.favorite'), icon: 'i-tabler:star' },
    ],
  },
  {
    id: 'user',
    label: t('settings.video_card_context_menu_region_user'),
    elements: [
      { key: 'followUser', label: t('settings.video_card_context_menu_follow_user'), icon: 'i-tabler:user-plus' },
      { key: 'blockUser', label: t('video_card.operation.block_user'), icon: 'i-tabler:user-cancel' },
    ],
  },
])

function isVisible(key: VideoCardContextMenuKey) {
  return settings.value.videoCardContextMenuConfig.find(item => item.key === key)?.visible ?? true
}

function setVisible(key: VideoCardContextMenuKey, visible: boolean) {
  const config = settings.value.videoCardContextMenuConfig.filter(item => item.key !== key)
  settings.value.videoCardContextMenuConfig = [...config, { key, visible }]
}
</script>

<template>
  <div class="context-menu-editor">
    <div v-for="group in groups" :key="group.id" class="context-menu-row">
      <span class="context-menu-row__label">{{ group.label }}</span>

      <div class="context-menu-row__elements">
        <SettingsToggleTag
          v-for="element in group.elements"
          :key="element.key"
          :model-value="isVisible(element.key)"
          :label="element.label"
          :icon="element.icon"
          @update:model-value="setVisible(element.key, $event)"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.context-menu-editor {
  padding: var(--bew-space-3) 0;
}

.context-menu-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  align-items: center;
  gap: var(--bew-space-3);
  min-height: 3rem;
}

.context-menu-row + .context-menu-row {
  border-top: 1px solid var(--bew-border-color);
}

.context-menu-row__label {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
}

.context-menu-row__elements {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
  padding: var(--bew-space-2) 0;
}

@media (max-width: 520px) {
  .context-menu-row {
    grid-template-columns: 1fr;
    gap: 0;
    padding: var(--bew-space-2) 0;
  }

  .context-menu-row__elements {
    padding-bottom: 0;
  }
}
</style>
