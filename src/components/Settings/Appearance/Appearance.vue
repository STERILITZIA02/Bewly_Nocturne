<script lang="ts" setup>
import { useThrottleFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import { FROSTED_GLASS_BLUR_MAX_PX, FROSTED_GLASS_BLUR_MIN_PX, settings } from '~/logic'
import { clampThemeColor, DEFAULT_THEME_COLOR, NEUTRAL_THEME_COLOR } from '~/utils/themeColor'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'
import SettingsSegmentedControl from '../components/SettingsSegmentedControl.vue'

const { t } = useI18n()

const themeScheduleStart = ref(settings.value.themeScheduleStart)
const themeScheduleEnd = ref(settings.value.themeScheduleEnd)

watch(() => settings.value.themeScheduleStart, (value) => {
  themeScheduleStart.value = value
})

watch(() => settings.value.themeScheduleEnd, (value) => {
  themeScheduleEnd.value = value
})

function saveThemeSchedule() {
  settings.value.themeScheduleStart = themeScheduleStart.value
  settings.value.themeScheduleEnd = themeScheduleEnd.value
}

const themeColorOptions = computed<Array<string>>(() => {
  return [
    '#22c55e',
    '#34d399',
    '#14b8a6',
    '#06b6d4',
    '#00a1d6',
    '#60a5fa',
    '#3b82f6',
    '#6366f1',
    '#818cf8',
    '#a78bfa',
    '#f46d43',
    '#fb923c',
    '#f59e0b',
    '#eab308',
    '#f43f5e',
    '#fb7299',
    '#fda4af',
  ]
})

// 深色模式基准颜色选项
const darkModeBaseColorOptions = computed<Array<string>>(() => {
  return [
    '#2a2d32', // 默认深色
    '#1a1b1e', // 更深的黑色
    '#2d2a2f', // 紫色调深色
    '#2a2f2d', // 绿色调深色
    '#2f2d2a', // 棕色调深色
    '#252829', // 蓝色调深色
    '#2c2a2a', // 红色调深色
    '#292a2c', // 灰色调深色
  ]
})

const isNeutralThemeColor = computed(() => settings.value.themeColor === NEUTRAL_THEME_COLOR)
const isCustomColor = computed<boolean>(() => {
  return !isNeutralThemeColor.value && !themeColorOptions.value.includes(settings.value.themeColor)
})

const isCustomDarkModeBaseColor = computed<boolean>(() => {
  return !darkModeBaseColorOptions.value.includes(settings.value.darkModeBaseColor)
})

const fontPreferenceOptions = computed(() => {
  return [
    {
      label: t('settings.customize_font_opt.default'),
      value: 'default',
    },
    {
      label: t('settings.customize_font_opt.recommend'),
      value: 'recommend',
    },
    {
      label: t('settings.customize_font_opt.custom'),
      value: 'custom',
    },
  ]
})

const themeOptions = computed<Array<{ value: string, label: string }>>(() => {
  return [
    {
      label: t('settings.theme_opt.dark'),
      value: 'dark',
    },
    {
      label: t('settings.theme_opt.light'),
      value: 'light',
    },
    {
      label: t('settings.theme_opt.auto'),
      value: 'auto',
    },
    {
      label: t('settings.theme_opt.scheduled'),
      value: 'scheduled',
    },
  ]
})

function changeThemeColor(color: string) {
  settings.value.themeColor = color
}
// The native picker cannot restrict its range, so out-of-range picks snap back into it.
const changeThemeColorThrottle = useThrottleFn((color: string) => changeThemeColor(clampThemeColor(color)), 100)

function changeDarkModeBaseColor(color: string) {
  settings.value.darkModeBaseColor = color
}
const changeDarkModeBaseColorThrottle = useThrottleFn((color: string) => changeDarkModeBaseColor(color), 100)
</script>

<template>
  <div>
    <SettingsSectionHeading
      data-setting-id="settings.menu_appearance" :title="$t('settings.menu_appearance')"
      :desc="$t('settings.category_appearance_desc')"
      icon="i-tabler:brush"
    />

    <SettingsItemGroup data-setting-id="settings.group_visual_effects" :title="$t('settings.group_visual_effects')">
      <SettingsItem
        setting-id="settings.disable_frosted_glass_and_top_bar_gradient" :title="$t('settings.disable_frosted_glass_and_top_bar_gradient')"
        :desc="$t('settings.disable_frosted_glass_and_top_bar_gradient_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.disableFrostedGlass" />
      </SettingsItem>
      <SettingsItem
        v-if="!settings.disableFrostedGlass" setting-id="settings.frosted_glass_blur_intensity"
        :title="$t('settings.frosted_glass_blur_intensity')"
        right-width="auto"
      >
        <div class="slider-control">
          <Slider
            v-model="settings.frostedGlassBlurIntensity"
            :min="FROSTED_GLASS_BLUR_MIN_PX"
            :max="FROSTED_GLASS_BLUR_MAX_PX"
            :label="`${settings.frostedGlassBlurIntensity}`"
          />
        </div>
      </SettingsItem>
      <SettingsItem setting-id="settings.disable_shadow" :title="$t('settings.disable_shadow')" right-width="auto">
        <Radio v-model="settings.disableShadow" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_page_style" :title="$t('settings.group_page_style')">
      <SettingsItem
        setting-id="settings.adapt_to_other_page_styles" :title="$t('settings.adapt_to_other_page_styles')"
        :desc="$t('settings.adapt_to_other_page_styles_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.adaptToOtherPageStyles" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_color" :title="$t('settings.group_color')">
      <SettingsItem setting-id="appearance.theme" :title="$t('settings.theme')" right-width="auto">
        <Select v-model="settings.theme" w="160px" :options="themeOptions" />
      </SettingsItem>
      <SettingsItem
        v-if="settings.theme === 'scheduled'" setting-id="settings.theme_schedule"
        :title="$t('settings.theme_schedule')"
        :desc="$t('settings.theme_schedule_desc')"
        right-width="auto"
      >
        <div class="theme-schedule" flex="~ items-center gap-2">
          <input v-model="themeScheduleStart" type="time" @blur="saveThemeSchedule">
          <span>–</span>
          <input v-model="themeScheduleEnd" type="time" @blur="saveThemeSchedule">
        </div>
      </SettingsItem>
      <SettingsItem setting-id="settings.video_page_dark_mode" :title="$t('settings.video_page_dark_mode')" right-width="auto">
        <template #desc>
          {{ $t('settings.video_page_dark_mode_desc') }}
        </template>

        <Radio v-model="settings.videoPageDarkMode" />
      </SettingsItem>
      <SettingsItem setting-id="settings.theme_color" :title="$t('settings.theme_color')" :desc="$t('settings.theme_color_desc')" right-width="auto">
        <div class="theme-color-options" flex="~ gap-2 wrap" justify-end>
          <button
            type="button"
            class="color-option color-option--preset color-option--neutral"
            :aria-label="`${$t('settings.theme_color')}: ${$t('settings.theme_color_opt.neutral')}`"
            :title="$t('settings.theme_color_opt.neutral')"
            :aria-pressed="isNeutralThemeColor"
            w-20px h-20px p-0 appearance-none rounded="$bew-pill-radius"
            cursor-pointer transition duration-300 box-border
            :style="{
              transform: isNeutralThemeColor ? 'scale(1.3)' : 'scale(1)',
              border: isNeutralThemeColor ? '1px solid var(--bew-focus-ring-color)' : '1px solid var(--bew-border-color)',
              boxShadow: isNeutralThemeColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
            @click="changeThemeColor(NEUTRAL_THEME_COLOR)"
          />
          <button
            v-for="color in themeColorOptions" :key="color"
            type="button"
            class="color-option color-option--preset"
            :aria-label="`${$t('settings.theme_color')}: ${color}`"
            :aria-pressed="color === settings.themeColor"
            w-20px h-20px p-0 appearance-none rounded="$bew-pill-radius"
            cursor-pointer transition duration-300 box-border
            :style="{
              background: color,
              transform: color === settings.themeColor ? 'scale(1.3)' : 'scale(1)',
              border: color === settings.themeColor ? '1px solid var(--bew-focus-ring-color)' : '1px solid transparent',
              boxShadow: color === settings.themeColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
            @click="changeThemeColor(color)"
          />
          <div
            class="color-option"
            w-20px h-20px rounded="$bew-pill-radius" overflow-hidden
            cursor-pointer transition duration-300
            flex="~ items-center justify-center"
            :style="{
              transform: isCustomColor ? 'scale(1.3)' : 'scale(1)',
              border: isCustomColor ? '1px solid var(--bew-focus-ring-color)' : '1px solid var(--bew-border-color)',
              boxShadow: isCustomColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
          >
            <div
              i-tabler:color-picker pos="absolute" text-white w-12px h-12px
              pointer-events-none
            />
            <input
              :value="isNeutralThemeColor ? DEFAULT_THEME_COLOR : settings.themeColor"
              type="color"
              :aria-label="$t('settings.theme_color')"
              w-30px h-30px p-0 m-0 block
              shrink-0 rounded="$bew-pill-radius" border-none cursor-pointer
              @input="(e) => changeThemeColorThrottle((e.target as HTMLInputElement)?.value)"
            >
          </div>
        </div>
      </SettingsItem>

      <SettingsItem
        setting-id="settings.enable_dark_mode_tint" :title="$t('settings.enable_dark_mode_tint')"
        :desc="$t('settings.enable_dark_mode_tint_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableDarkModeTint" />
      </SettingsItem>
      <SettingsItem v-if="settings.enableDarkModeTint" setting-id="settings.dark_mode_base_color" :title="$t('settings.dark_mode_base_color')" right-width="auto">
        <div class="dark-mode-base-color-options" flex="~ gap-2 wrap" justify-end>
          <button
            v-for="color in darkModeBaseColorOptions" :key="color"
            type="button"
            class="color-option color-option--preset"
            :aria-label="`${$t('settings.dark_mode_base_color')}: ${color}`"
            :aria-pressed="color === settings.darkModeBaseColor"
            w-20px h-20px p-0 appearance-none rounded="$bew-pill-radius"
            cursor-pointer transition duration-300 box-border
            :style="{
              background: color,
              transform: color === settings.darkModeBaseColor ? 'scale(1.3)' : 'scale(1)',
              border: color === settings.darkModeBaseColor ? '1px solid var(--bew-focus-ring-color)' : '1px solid transparent',
              boxShadow: color === settings.darkModeBaseColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
            @click="changeDarkModeBaseColor(color)"
          />
          <div
            class="color-option"
            w-20px h-20px rounded="$bew-pill-radius" overflow-hidden
            cursor-pointer transition duration-300
            flex="~ items-center justify-center"
            :style="{
              transform: isCustomDarkModeBaseColor ? 'scale(1.3)' : 'scale(1)',
              border: isCustomDarkModeBaseColor ? '1px solid var(--bew-focus-ring-color)' : '1px solid var(--bew-border-color)',
              boxShadow: isCustomDarkModeBaseColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
          >
            <div
              i-tabler:color-picker pos="absolute" text-white w-12px h-12px
              pointer-events-none
            />
            <input
              :value="settings.darkModeBaseColor"
              type="color"
              :aria-label="$t('settings.dark_mode_base_color')"
              w-30px h-30px p-0 m-0 block
              shrink-0 rounded="$bew-pill-radius" border-none cursor-pointer
              @input="(e) => changeDarkModeBaseColorThrottle((e.target as HTMLInputElement)?.value)"
            >
          </div>
        </div>
      </SettingsItem>
      <SettingsItem
        setting-id="settings.enable_oled_dark_mode" :title="$t('settings.enable_oled_dark_mode')"
        :desc="$t('settings.enable_oled_dark_mode_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableOledDarkMode" />
      </SettingsItem>

      <SettingsItem
        setting-id="settings.gradient_theme_color_background" :title="$t('settings.gradient_theme_color_background')"
        :desc="$t('settings.gradient_theme_color_background_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.useLinearGradientThemeColorBackground" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_fonts" :title="$t('settings.group_fonts')">
      <SettingsItem setting-id="settings.enable_text_autospace" :title="$t('settings.enable_text_autospace')" :desc="$t('settings.enable_text_autospace_desc')" right-width="auto">
        <SettingsSegmentedControl
          v-model="settings.textAutospaceMode" :label="$t('settings.enable_text_autospace')"
          :options="[
            { value: 'default', label: $t('settings.text_autospace_default') },
            { value: 'on', label: $t('settings.text_autospace_on') },
            { value: 'off', label: $t('settings.text_autospace_off') },
          ]"
        />
      </SettingsItem>
      <SettingsItem setting-id="settings.customize_font" :title="$t('settings.customize_font')" right-width="auto">
        <Select
          v-model="settings.customizeFont"
          :options="fontPreferenceOptions"
          w="160px"
        />
        <template v-if="settings.customizeFont === 'custom'" #bottom>
          <Input v-model="settings.fontFamily" @keydown.stop.passive="() => {}" />
          <i18n-t keypath="settings.customize_font_desc" scope="global" tag="div" text="sm $bew-text-2" mt-1>
            <template #shanggu>
              <a class="link" href="https://github.com/GuiWonder/Shanggu" target="_blank">Shanggu Fonts (尚古字型)</a>
            </template>
            <template #fanwunhak>
              <a class="link" href="https://github.com/ayaka14732/FanWunHak" target="_blank">Fan Wun Hak (繁媛黑體)</a>
            </template>
          </i18n-t>
        </template>
      </SettingsItem>
      <SettingsItem setting-id="settings.remove_the_indent_from_chinese_punctuation" :title="$t('settings.remove_the_indent_from_chinese_punctuation')" :desc="$t('settings.remove_the_indent_from_chinese_punctuation_desc')" right-width="auto">
        <Radio v-model="settings.removeTheIndentFromChinesePunctuation" />
      </SettingsItem>
      <SettingsItem setting-id="settings.override_danmaku_font" :title="$t('settings.override_danmaku_font')" :desc="$t('settings.override_danmaku_font_desc')" right-width="auto">
        <Radio v-model="settings.overrideDanmakuFont" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.color-option {
  transition:
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    box-shadow var(--bew-duration-normal) var(--bew-ease-standard),
    filter var(--bew-duration-normal) var(--bew-ease-standard),
    outline-color var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard);
}

.color-option--preset {
  position: relative;

  &::after {
    position: absolute;
    inset: calc(-1 * var(--bew-space-0-5));
    content: "";
  }
}

// Black in light mode, white in dark mode.
.color-option--neutral {
  background: linear-gradient(135deg, #000000 50%, #ffffff 50%);
}

.color-option:hover {
  filter: brightness(1.12);
  outline: 1px solid var(--bew-border-color);
  outline-offset: 2px;
}

.theme-color-options {
  width: 312px;
}

.dark-mode-base-color-options {
  width: 252px;
}

.theme-schedule input {
  flex: 1 1 0;
  min-width: 0;
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-fill-3);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  color-scheme: inherit;
}

.slider-control {
  width: 220px;
}
</style>
