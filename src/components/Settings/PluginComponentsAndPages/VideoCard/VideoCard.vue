<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import { settings } from '~/logic'
import type { VideoCardFontSizeSetting } from '~/logic/storage'
import {
  MAX_LIST_LAYOUT_BREAKPOINT,
  MIN_LIST_LAYOUT_BREAKPOINT,
  normalizeListLayoutBreakpoint,
} from '~/utils/gridLayout'
import {
  VIDEO_CARD_COVER_RATIO_MAX,
  VIDEO_CARD_COVER_RATIO_MIN,
  VIDEO_CARD_COVER_RATIO_STEP,
} from '~/utils/videoCardLayout'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import LinkOpening from '../../Navigation/LinkOpening.vue'
import VideoCardContentEditor from './VideoCardContentEditor.vue'
import VideoCardContextMenuEditor from './VideoCardContextMenuEditor.vue'

const { t } = useI18n()

const fontSizeOptionValues: VideoCardFontSizeSetting[] = ['xs', 'sm', 'base', 'lg']

const videoCardFontSizeOptions = computed(() => fontSizeOptionValues.map(value => ({
  label: t(`settings.font_size_option.${value}`),
  value,
})))

const listLayoutBreakpointDraft = ref(String(settings.value.autoSwitchListLayoutBreakpoint))
const isEditingListLayoutBreakpoint = ref(false)

watch(() => settings.value.autoSwitchListLayoutBreakpoint, (value) => {
  if (!isEditingListLayoutBreakpoint.value)
    listLayoutBreakpointDraft.value = String(value)
})

function updateListLayoutBreakpointDraft(value: string | number | undefined) {
  isEditingListLayoutBreakpoint.value = true
  listLayoutBreakpointDraft.value = value == null ? '' : String(value)
}

function commitListLayoutBreakpoint() {
  const normalized = normalizeListLayoutBreakpoint(listLayoutBreakpointDraft.value)
  settings.value.autoSwitchListLayoutBreakpoint = normalized
  listLayoutBreakpointDraft.value = String(normalized)
}

function finishListLayoutBreakpointEditing() {
  commitListLayoutBreakpoint()
  isEditingListLayoutBreakpoint.value = false
}

function cancelListLayoutBreakpointEditing() {
  listLayoutBreakpointDraft.value = String(settings.value.autoSwitchListLayoutBreakpoint)
  isEditingListLayoutBreakpoint.value = false
}
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

    <!-- 视频卡片网格：打开设置时直接展示断点配置 -->
    <SettingsItemGroup
      data-setting-id="settings.group_video_card_grid" :title="$t('settings.group_video_card_grid')"
      :desc="$t('settings.group_video_card_grid_desc')"
    >
      <SettingsItem
        setting-id="settings.auto_switch_list_layout" :title="$t('settings.auto_switch_list_layout')"
        :desc="$t('settings.auto_switch_list_layout_desc')"
        right-width="auto"
      >
        <div class="list-layout-control">
          <Input
            :model-value="listLayoutBreakpointDraft"
            type="number"
            :min="MIN_LIST_LAYOUT_BREAKPOINT"
            :max="MAX_LIST_LAYOUT_BREAKPOINT"
            class="list-layout-control__input"
            @focus="isEditingListLayoutBreakpoint = true"
            @update:model-value="updateListLayoutBreakpointDraft"
            @blur="finishListLayoutBreakpointEditing"
            @keydown.enter.prevent="commitListLayoutBreakpoint"
            @keydown.escape.prevent.stop="cancelListLayoutBreakpointEditing"
          >
            <template #prefix>
              <span class="list-layout-control__label">{{ $t('settings.auto_switch_list_layout_breakpoint') }}</span>
            </template>
            <template #suffix>
              <span class="list-layout-control__unit">px</span>
            </template>
          </Input>
          <Radio v-model="settings.autoSwitchListLayout" />
        </div>
      </SettingsItem>

      <SettingsItem
        setting-id="settings.video_card_cover_ratio" :title="$t('settings.video_card_cover_ratio')"
        :desc="$t('settings.video_card_cover_ratio_desc')"
      >
        <template #bottom>
          <div class="cover-ratio-controls">
            <Slider
              v-model="settings.videoCardCoverRatioOneColumn"
              :accessible-label="`${$t('settings.video_card_cover_ratio_one_column')} · ${$t('settings.video_card_cover_ratio')}`"
              :min="VIDEO_CARD_COVER_RATIO_MIN"
              :max="VIDEO_CARD_COVER_RATIO_MAX"
              :step="VIDEO_CARD_COVER_RATIO_STEP"
              :label="`${$t('settings.video_card_cover_ratio_one_column')} · ${settings.videoCardCoverRatioOneColumn}%`"
            />
            <Slider
              v-model="settings.videoCardCoverRatioTwoColumns"
              :accessible-label="`${$t('settings.video_card_cover_ratio_two_columns')} · ${$t('settings.video_card_cover_ratio')}`"
              :min="VIDEO_CARD_COVER_RATIO_MIN"
              :max="VIDEO_CARD_COVER_RATIO_MAX"
              :step="VIDEO_CARD_COVER_RATIO_STEP"
              :label="`${$t('settings.video_card_cover_ratio_two_columns')} · ${settings.videoCardCoverRatioTwoColumns}%`"
            />
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      data-setting-id="settings.group_video_card_content" :title="$t('settings.group_video_card_content')"
      :desc="$t('settings.group_video_card_content_desc')"
    >
      <VideoCardContentEditor />

      <SettingsItem
        setting-id="settings.video_card_title_font_size" :title="$t('settings.video_card_title_font_size')"
        :desc="$t('settings.video_card_title_font_size_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoCardTitleFontSize" :options="videoCardFontSizeOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        setting-id="settings.video_card_author_font_size" :title="$t('settings.video_card_author_font_size')"
        :desc="$t('settings.video_card_author_font_size_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoCardAuthorFontSize" :options="videoCardFontSizeOptions" w="160px" />
      </SettingsItem>
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

<style lang="scss" scoped>
.cover-ratio-controls {
  display: grid;
  gap: var(--bew-space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}

.list-layout-control {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.list-layout-control__input {
  width: 150px;
}

.list-layout-control__label,
.list-layout-control__unit {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  white-space: nowrap;
}
</style>
