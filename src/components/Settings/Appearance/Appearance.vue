<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import IconButton from '~/components/IconButton.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useDark } from '~/composables/useDark'
import { useMotionValue } from '~/composables/useMotionValue'
import { useReadyPageTransition } from '~/composables/useReadyPageTransition'
import { FROSTED_GLASS_BLUR_MAX_PX, FROSTED_GLASS_BLUR_MIN_PX, settings } from '~/logic'
import type { VideoCardFontSizeSetting } from '~/logic/storage'
import type { AppearancePalette, AppearancePreferences, ColorScheme } from '~/utils/appearance'
import { defaultAppearanceColors, getAppearanceStyle, INTERFACE_FONT_SIZE, normalizeAppearanceColors, resolveAppearanceAccent } from '~/utils/appearance'
import { ACCENT_COLORS, APPEARANCE_PRESETS, appearancePresetPatch, matchingAppearancePreset, parseAppearance, serializeAppearance } from '~/utils/appearanceThemes'
import { clampThemeColor, DEFAULT_THEME_COLOR, getThemeColorTokens, normalizeHexColor } from '~/utils/themeColor'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsItemSubgroup from '../components/SettingsItemSubgroup.vue'
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'
import SettingsSegmentedControl from '../components/SettingsSegmentedControl.vue'
import AppearanceColorField from './AppearanceColorField.vue'
import AppearanceModePicker from './AppearanceModePicker.vue'
import AppearanceThemePicker from './AppearanceThemePicker.vue'

const { t } = useI18n()
const toast = useToast()
const { isDark, transitionAppearance } = useDark()
const editingScheme = ref<ColorScheme>(isDark.value ? 'dark' : 'light')
const selectedScheme = useMotionValue(() => editingScheme.value, (value) => {
  editingScheme.value = value
})
const paletteTransition = useReadyPageTransition(() => editingScheme.value, async () => {})
const selectedMotion = useMotionValue(() => settings.value.motionPreference, (value) => {
  settings.value.motionPreference = value
})
const selectedAutospace = useMotionValue(() => settings.value.textAutospaceMode, (value) => {
  settings.value.textAutospaceMode = value
})
const importFile = ref<HTMLInputElement>()
const importing = ref(false)
let importGeneration = 0
onScopeDispose(() => {
  importGeneration++
})

function apply(patch: Partial<AppearancePreferences>, animate = false) {
  const entries = Object.entries(patch).filter(([key, value]) => key === 'appearanceColors'
    ? !sameColors(settings.value.appearanceColors, value as AppearancePreferences['appearanceColors'])
    : settings.value[key as keyof AppearancePreferences] !== value)
  if (!entries.length)
    return
  const update = () => {
    settings.value = { ...settings.value, ...Object.fromEntries(entries) }
  }
  if (!animate) {
    update()
    return
  }
  const next = { ...settings.value, ...patch }
  const scheme = isDark.value ? 'dark' : 'light'
  const paletteChanged = resolveAppearanceAccent(next, isDark.value) !== resolveAppearanceAccent(settings.value, isDark.value)
    || next.appearanceColors[scheme].background !== settings.value.appearanceColors[scheme].background
    || next.appearanceColors[scheme].foreground !== settings.value.appearanceColors[scheme].foreground
  if (paletteChanged)
    transitionAppearance(update)
  else update()
}
function sameColors(a: AppearancePreferences['appearanceColors'], b: AppearancePreferences['appearanceColors']) {
  return a.separateModes === b.separateModes && a.darkAccent === b.darkAccent
    && a.light.background === b.light.background && a.light.foreground === b.light.foreground
    && a.dark.background === b.dark.background && a.dark.foreground === b.dark.foreground
}
function selectMode(theme: typeof settings.value.theme) {
  return transitionAppearance(() => {
    settings.value.theme = theme
  })
}
const colors = computed(() => settings.value.appearanceColors)
const palette = computed(() => colors.value[editingScheme.value])
const separateModes = computed({
  get: () => colors.value.separateModes,
  set: (value: boolean) => apply({ appearanceColors: { ...colors.value, separateModes: value } }),
})
const accent = computed(() => resolveAppearanceAccent(settings.value, editingScheme.value === 'dark'))
const previewAccent = computed(() => getThemeColorTokens(accent.value, editingScheme.value === 'dark', palette.value.background ? [palette.value.background] : []).foreground)
function setAccent(scheme: ColorScheme, value: string | null) {
  if (scheme !== editingScheme.value)
    return
  const independentDark = scheme === 'dark' && separateModes.value
  const color = value === 'neutral' ? value : independentDark ? normalizeHexColor(value)! : clampThemeColor(value ?? DEFAULT_THEME_COLOR)
  if (independentDark)
    apply({ appearanceColors: { ...colors.value, darkAccent: color } })
  else apply({ themeColor: color, appearanceColors: { ...colors.value, darkAccent: separateModes.value ? colors.value.darkAccent ?? settings.value.themeColor : null } })
}
function setPalette(scheme: ColorScheme, field: keyof AppearancePalette, value: string | null) {
  if (scheme !== editingScheme.value)
    return
  apply({ appearanceColors: normalizeAppearanceColors({ ...colors.value, [scheme]: { ...colors.value[scheme], [field]: value } }) })
}
// Retiring editors keep their original handlers; a late blur cannot write into the incoming mode.
const colorActions = computed(() => {
  const scheme = editingScheme.value
  return {
    accent: (value: string | null) => setAccent(scheme, value),
    background: (value: string | null) => setPalette(scheme, 'background', value),
    foreground: (value: string | null) => setPalette(scheme, 'foreground', value),
  }
})
const previewStyle = computed(() => {
  const result: Record<string, string> = {}
  for (const scheme of ['light', 'dark'] as const) {
    const dark = scheme === 'dark'
    const custom = getAppearanceStyle(settings.value, dark)
    const modeAccent = resolveAppearanceAccent(settings.value, dark)
    result[`--bew-appearance-preview-${scheme}-accent`] = modeAccent === 'neutral' ? dark ? '#ffffff' : '#000000' : modeAccent
    if (custom['--bew-custom-background'])
      result[`--bew-preview-${scheme}-background`] = custom['--bew-custom-background']
    if (custom['--bew-custom-foreground'])
      result[`--bew-preview-${scheme}-foreground`] = custom['--bew-custom-foreground']
  }
  return result
})
const preset = computed(() => matchingAppearancePreset(settings.value, editingScheme.value))
function selectPreset(value: unknown) {
  const selected = APPEARANCE_PRESETS.find(item => item.id === value)
  if (selected)
    apply(appearancePresetPatch(selected, settings.value, separateModes.value ? editingScheme.value : undefined), true)
}
function resetColors() {
  apply({ themeColor: DEFAULT_THEME_COLOR, appearanceColors: defaultAppearanceColors(), appearanceContrast: 0 }, true)
}

const frostedGlassEnabled = computed({
  get: () => !settings.value.disableFrostedGlass,
  set: (enabled: boolean) => {
    settings.value.disableFrostedGlass = !enabled
  },
})
const shadowsEnabled = computed({
  get: () => !settings.value.disableShadow,
  set: (enabled: boolean) => {
    settings.value.disableShadow = !enabled
  },
})
const themeScheduleStart = ref(settings.value.themeScheduleStart)
const themeScheduleEnd = ref(settings.value.themeScheduleEnd)
watch(() => settings.value.themeScheduleStart, (value) => {
  themeScheduleStart.value = value
})
watch(() => settings.value.themeScheduleEnd, (value) => {
  themeScheduleEnd.value = value
})
function saveThemeSchedule() {
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (!validTime.test(themeScheduleStart.value))
    themeScheduleStart.value = settings.value.themeScheduleStart
  if (!validTime.test(themeScheduleEnd.value))
    themeScheduleEnd.value = settings.value.themeScheduleEnd
  if (themeScheduleStart.value !== settings.value.themeScheduleStart || themeScheduleEnd.value !== settings.value.themeScheduleEnd)
    settings.value = { ...settings.value, themeScheduleStart: themeScheduleStart.value, themeScheduleEnd: themeScheduleEnd.value }
}
const fontPreferenceOptions = computed(() => ['default', 'recommend', 'custom'].map(value => ({ value, label: t(`settings.customize_font_opt.${value}`) })))
const fontSizeOptionValues: VideoCardFontSizeSetting[] = ['xs', 'sm', 'base', 'lg']
const videoCardFontSizeOptions = computed(() => fontSizeOptionValues.map(value => ({ value, label: t(`settings.font_size_option.${value}`) })))

async function copyTheme() {
  try {
    await navigator.clipboard.writeText(serializeAppearance(settings.value))
    toast.success(t('settings.visual_style.copied'))
  }
  catch { toast.error(t('common.operation_failed')) }
}
function exportTheme() {
  const url = URL.createObjectURL(new Blob([serializeAppearance(settings.value)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'nocturne-appearance.json'
  link.click()
  URL.revokeObjectURL(url)
}
async function importTheme(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return
  const generation = ++importGeneration
  importing.value = true
  try {
    if (file.size > 128 * 1024)
      throw new TypeError('Appearance file too large')
    const patch = parseAppearance(await file.text())
    if (generation !== importGeneration)
      return
    await settings.import(patch)
    if (generation === importGeneration)
      toast.success(t('settings.visual_style.imported'))
  }
  catch {
    if (generation === importGeneration)
      toast.error(t('settings.visual_style.import_failed'))
  }
  finally {
    if (generation === importGeneration)
      importing.value = false
  }
}
</script>

<template>
  <div class="appearance-settings" :style="previewStyle">
    <SettingsSectionHeading data-setting-id="settings.menu_appearance" :title="$t('settings.visual_style.title')" :desc="$t('settings.visual_style.description')" />

    <SettingsItemGroup>
      <SettingsItem setting-id="appearance.theme" :title="$t('settings.theme')">
        <template #bottom>
          <AppearanceModePicker :model-value="settings.theme" :apply="selectMode" />
        </template>
      </SettingsItem>
      <SettingsItem v-if="settings.theme === 'scheduled'" setting-id="settings.theme_schedule" :title="$t('settings.theme_schedule')" :desc="$t('settings.theme_schedule_desc')" right-width="auto">
        <div class="theme-schedule">
          <input v-model="themeScheduleStart" type="time" :aria-label="$t('settings.visual_style.schedule_start')" @blur="saveThemeSchedule">
          <span>–</span>
          <input v-model="themeScheduleEnd" type="time" :aria-label="$t('settings.visual_style.schedule_end')" @blur="saveThemeSchedule">
        </div>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_color" :title="$t('settings.visual_style.palette')">
      <SettingsItem setting-id="settings.visual_style.preset" :title="$t('settings.visual_style.preset')" :desc="$t(separateModes ? 'settings.visual_style.preset_single' : 'settings.visual_style.preset_pair')" right-width="auto">
        <div class="appearance-settings__actions">
          <Tooltip :content="$t('settings.visual_style.import')">
            <IconButton :label="$t('settings.visual_style.import')" :disabled="importing" class="bew-icon-button--control" @click="importFile?.click()">
              <i i-tabler:upload />
            </IconButton>
          </Tooltip>
          <Tooltip :content="$t('settings.visual_style.export')">
            <IconButton :label="$t('settings.visual_style.export')" class="bew-icon-button--control" @click="exportTheme">
              <i i-tabler:download />
            </IconButton>
          </Tooltip>
          <Tooltip :content="$t('settings.visual_style.copy')">
            <IconButton :label="$t('settings.visual_style.copy')" class="bew-icon-button--control" @click="copyTheme">
              <i i-tabler:copy />
            </IconButton>
          </Tooltip>
          <AppearanceThemePicker :model-value="preset" :scheme="editingScheme" class="appearance-settings__select" @update:model-value="selectPreset" />
          <input ref="importFile" type="file" accept="application/json,.json" hidden @change="importTheme">
        </div>
      </SettingsItem>
      <SettingsItem setting-id="settings.visual_style.editing_mode" :title="$t('settings.visual_style.editing_mode')" :desc="$t('settings.visual_style.editing_mode_desc')" right-width="auto">
        <SettingsSegmentedControl v-model="selectedScheme" :label="$t('settings.visual_style.editing_mode')" :options="[{ value: 'light', label: $t('settings.theme_opt.light') }, { value: 'dark', label: $t('settings.theme_opt.dark') }]" />
      </SettingsItem>
      <SettingsItem setting-id="settings.visual_style.separate_accent" :title="$t('settings.visual_style.separate_accent')" :desc="$t('settings.visual_style.separate_accent_desc')" right-width="auto">
        <Radio v-model="separateModes" commit-after-motion />
      </SettingsItem>
      <Transition v-bind="paletteTransition" mode="out-in">
        <div :key="editingScheme">
          <SettingsItem setting-id="settings.theme_color" :title="$t('settings.visual_style.accent')" :desc="$t('settings.theme_color_desc')" right-width="auto">
            <AppearanceColorField
              :key="`accent-${editingScheme}`" :model-value="accent" :label="$t('settings.visual_style.accent')" :fallback="DEFAULT_THEME_COLOR" :presets="ACCENT_COLORS"
              :swatch-color="accent === 'neutral' ? editingScheme === 'dark' ? '#ffffff' : '#000000' : accent"
              neutral @update:model-value="colorActions.accent"
            />
          </SettingsItem>
          <SettingsItem setting-id="settings.visual_style.background" :title="$t('settings.visual_style.background')" :desc="$t('settings.visual_style.background_desc')" right-width="auto">
            <AppearanceColorField
              :key="`background-${editingScheme}`" :model-value="palette.background" :label="$t('settings.visual_style.background')" :fallback="editingScheme === 'dark' ? '#202020' : '#ffffff'" automatic
              :swatch-color="`var(--bew-appearance-preview-${editingScheme}-bg)`"
              @update:model-value="colorActions.background"
            />
          </SettingsItem>
          <SettingsItem setting-id="settings.visual_style.foreground" :title="$t('settings.visual_style.foreground')" :desc="$t('settings.visual_style.foreground_desc')" right-width="auto">
            <AppearanceColorField
              :key="`foreground-${editingScheme}`" :model-value="palette.foreground" :label="$t('settings.visual_style.foreground')" :fallback="editingScheme === 'dark' ? '#ebebeb' : '#171717'" automatic
              :swatch-color="`var(--bew-appearance-preview-${editingScheme}-fg)`"
              @update:model-value="colorActions.foreground"
            />
          </SettingsItem>
          <SettingsItem setting-id="settings.visual_style.contrast" :title="$t('settings.visual_style.contrast')" :desc="$t('settings.visual_style.contrast_desc')" right-width="auto">
            <Slider
              v-model="settings.appearanceContrast" class="appearance-settings__slider" commit-on-change editable :min="0"
              :max="100"
            />
          </SettingsItem>
          <div class="appearance-settings__sample" :style="{ background: `var(--bew-appearance-preview-${editingScheme}-bg)`, color: `var(--bew-appearance-preview-${editingScheme}-fg)` }">
            <span>{{ $t('settings.visual_style.preview') }}</span>
            <span class="appearance-settings__sample-secondary">{{ $t('settings.visual_style.preview_secondary') }}</span>
            <span class="appearance-settings__sample-accent" :style="{ color: previewAccent }">Nocturne</span>
          </div>
        </div>
      </Transition>
      <div class="appearance-settings__footer">
        <button type="button" @click="resetColors">
          {{ $t('settings.visual_style.reset_colors') }}
        </button>
      </div>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.visual_style.advanced')" collapsible default-collapsed>
      <SettingsItemSubgroup :title="$t('settings.group_fonts')">
        <SettingsItem setting-id="settings.visual_style.interface_font_size" :title="$t('settings.visual_style.interface_font_size')" :desc="$t('settings.visual_style.interface_font_size_desc')" right-width="auto">
          <Slider
            v-model="settings.interfaceFontSize" class="appearance-settings__slider" commit-on-change :min="INTERFACE_FONT_SIZE.min" :max="INTERFACE_FONT_SIZE.max"
            editable
            unit="px"
          />
        </SettingsItem>
        <SettingsItem setting-id="settings.video_card_title_font_size" :title="$t('settings.video_card_title_font_size')" :desc="$t('settings.video_card_title_font_size_desc')" right-width="auto">
          <Select v-model="settings.videoCardTitleFontSize" commit-after-leave :options="videoCardFontSizeOptions" class="appearance-settings__select" />
        </SettingsItem>
        <SettingsItem setting-id="settings.video_card_author_font_size" :title="$t('settings.video_card_author_font_size')" :desc="$t('settings.video_card_author_font_size_desc')" right-width="auto">
          <Select v-model="settings.videoCardAuthorFontSize" commit-after-leave :options="videoCardFontSizeOptions" class="appearance-settings__select" />
        </SettingsItem>
        <SettingsItem setting-id="settings.customize_font" :title="$t('settings.customize_font')" right-width="auto">
          <Select v-model="settings.customizeFont" commit-after-leave :options="fontPreferenceOptions" class="appearance-settings__select" />
          <template v-if="settings.customizeFont === 'custom'" #bottom>
            <Input v-model="settings.fontFamily" />
            <i18n-t keypath="settings.customize_font_desc" scope="global" tag="div" class="bew-help">
              <template #shanggu>
                <a class="link" href="https://github.com/GuiWonder/Shanggu" target="_blank">Shanggu Fonts (尚古字型)</a>
              </template>
              <template #fanwunhak>
                <a class="link" href="https://github.com/ayaka14732/FanWunHak" target="_blank">Fan Wun Hak (繁媛黑體)</a>
              </template>
            </i18n-t>
          </template>
        </SettingsItem>
        <SettingsItem v-if="settings.customizeFont !== 'default'" setting-id="settings.override_danmaku_font" :title="$t('settings.override_danmaku_font')" :desc="$t('settings.override_danmaku_font_desc')" right-width="auto">
          <Radio v-model="settings.overrideDanmakuFont" commit-after-motion />
        </SettingsItem>
        <SettingsItem setting-id="settings.enable_text_autospace" :title="$t('settings.enable_text_autospace')" :desc="$t('settings.enable_text_autospace_desc')" right-width="auto">
          <SettingsSegmentedControl v-model="selectedAutospace" :label="$t('settings.enable_text_autospace')" :options="[{ value: 'default', label: $t('settings.text_autospace_default') }, { value: 'on', label: $t('settings.text_autospace_on') }, { value: 'off', label: $t('settings.text_autospace_off') }]" />
        </SettingsItem>
        <SettingsItem setting-id="settings.remove_the_indent_from_chinese_punctuation" :title="$t('settings.remove_the_indent_from_chinese_punctuation')" :desc="$t('settings.remove_the_indent_from_chinese_punctuation_desc')" right-width="auto">
          <Radio v-model="settings.removeTheIndentFromChinesePunctuation" commit-after-motion />
        </SettingsItem>
      </SettingsItemSubgroup>
      <SettingsItemSubgroup :title="$t('settings.group_visual_effects')">
        <SettingsItem setting-id="settings.disable_frosted_glass_and_top_bar_gradient" :title="$t('settings.disable_frosted_glass_and_top_bar_gradient')" :desc="$t('settings.disable_frosted_glass_and_top_bar_gradient_desc')" right-width="auto">
          <Radio v-model="frostedGlassEnabled" commit-after-motion />
        </SettingsItem>
        <SettingsItem v-if="frostedGlassEnabled" setting-id="settings.frosted_glass_blur_intensity" :title="$t('settings.frosted_glass_blur_intensity')" right-width="auto">
          <Slider
            v-model="settings.frostedGlassBlurIntensity" class="appearance-settings__slider" commit-on-change :min="FROSTED_GLASS_BLUR_MIN_PX" :max="FROSTED_GLASS_BLUR_MAX_PX"
            editable
            unit="px"
          />
        </SettingsItem>
        <SettingsItem setting-id="settings.disable_shadow" :title="$t('settings.visual_style.shadows')" right-width="auto">
          <Radio v-model="shadowsEnabled" commit-after-motion />
        </SettingsItem>
        <SettingsItem setting-id="settings.gradient_theme_color_background" :title="$t('settings.gradient_theme_color_background')" :desc="$t('settings.gradient_theme_color_background_desc')" right-width="auto">
          <Radio v-model="settings.useLinearGradientThemeColorBackground" commit-after-motion />
        </SettingsItem>
        <SettingsItem setting-id="settings.visual_style.motion" :title="$t('settings.visual_style.motion')" :desc="$t('settings.visual_style.motion_desc')" right-width="auto">
          <SettingsSegmentedControl v-model="selectedMotion" :label="$t('settings.visual_style.motion')" :options="[{ value: 'system', label: $t('settings.visual_style.motion_system') }, { value: 'reduce', label: $t('settings.visual_style.motion_on') }, { value: 'full', label: $t('settings.visual_style.motion_off') }]" />
        </SettingsItem>
      </SettingsItemSubgroup>
      <SettingsItemSubgroup :title="$t('settings.group_page_style')">
        <SettingsItem setting-id="settings.adapt_to_other_page_styles" :title="$t('settings.adapt_to_other_page_styles')" :desc="$t('settings.adapt_to_other_page_styles_desc')" right-width="auto">
          <Radio v-model="settings.adaptToOtherPageStyles" commit-after-motion />
        </SettingsItem>
        <SettingsItem setting-id="settings.video_page_dark_mode" :title="$t('settings.video_page_dark_mode')" :desc="$t('settings.video_page_dark_mode_desc')" right-width="auto">
          <Radio v-model="settings.videoPageDarkMode" commit-after-motion />
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/appearancePalette";

.appearance-settings {
  @include appearancePalette.pigments($prefix: "--bew-appearance-preview-light", $custom: "--bew-preview-light");
  @include appearancePalette.pigments(
    $dark: true,
    $prefix: "--bew-appearance-preview-dark",
    $custom: "--bew-preview-dark"
  );
}
.appearance-settings__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: end;
  gap: var(--bew-space-2);
}
.appearance-settings__select {
  width: 180px;
}
.appearance-settings__slider {
  width: 240px;
}
.appearance-settings__sample {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bew-space-3);
  padding: var(--bew-space-4);
  border-radius: var(--bew-interactive-radius);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  font-size: var(--bew-font-size-body);
}
.appearance-settings__sample-secondary {
  color: color-mix(in srgb, currentColor calc(70% + var(--bew-contrast-boost)), transparent);
  font-size: var(--bew-font-size-callout);
}
.appearance-settings__sample-accent {
  margin-inline-start: auto;
}
.appearance-settings__footer {
  display: flex;
  justify-content: end;
  padding-block: var(--bew-space-3);
}
.appearance-settings__footer button {
  color: var(--bew-text-2);
  padding: var(--bew-space-1) var(--bew-space-2);
  cursor: pointer;
  border-radius: var(--bew-interactive-radius);
}
.appearance-settings__footer button:is(:hover, :focus-visible) {
  color: var(--bew-text-1);
  background: var(--bew-hover-bg);
}
.theme-schedule {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}
.theme-schedule input {
  flex: 1 1 0;
  min-width: 0;
  min-height: var(--bew-control-height);
  padding-inline: var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-field-edge-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  font-size: var(--bew-font-size-body);
  color-scheme: inherit;
}
</style>
