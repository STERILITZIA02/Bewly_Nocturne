<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Select from '~/components/Select.vue'
import type { ColorScheme } from '~/utils/appearance'
import { APPEARANCE_PRESETS } from '~/utils/appearanceThemes'

import AppearanceThemeSample from './AppearanceThemeSample.vue'

const props = defineProps<{ modelValue: string, scheme: ColorScheme }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
const themes = new Map(APPEARANCE_PRESETS.map(preset => [preset.id, preset]))
const options = computed(() => [
  ...APPEARANCE_PRESETS.filter(preset => preset[props.scheme]).map((preset) => {
    const label = t(`settings.visual_style.presets.${preset.id}`)
    return { value: preset.id, label: preset.name && label !== preset.name ? `${label} ${preset.name}` : label }
  }),
  ...(props.modelValue === 'custom' ? [{ value: 'custom', label: t('settings.visual_style.custom') }] : []),
])
const name = (value: string) => t(value === 'custom' ? 'settings.visual_style.custom' : `settings.visual_style.presets.${value}`)
</script>

<template>
  <Select
    :key="scheme"
    size="compact"
    commit-after-leave
    :model-value="modelValue" :options="options" :accessible-label="$t('settings.visual_style.preset')"
    @update:model-value="value => emit('update:modelValue', String(value))"
  >
    <template #value>
      <AppearanceThemeSample :label="name(modelValue)" :palette="themes.get(modelValue)?.[scheme]" />
    </template>
    <template #option="{ option }">
      <AppearanceThemeSample :label="name(String(option.value))" :original-name="themes.get(String(option.value))?.name" :palette="themes.get(String(option.value))?.[scheme]" />
    </template>
  </Select>
</template>
