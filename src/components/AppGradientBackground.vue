<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'

const props = defineProps<{ activatedPage: AppPage }>()

const { isDark } = useDark()

// Preserve the optional decoration and its geometry without spreading accent
// across the page. The legacy storage key remains compatible with backups.
const neutralGradient = `linear-gradient(180deg,
  transparent 0% 44%,
  rgb(255 255 255 / 8%) 62%,
  rgb(255 255 255 / 20%) 80%,
  rgb(255 255 255 / 40%) 100%)`
</script>

<template>
  <Transition name="fade">
    <div
      v-if="settings.useLinearGradientThemeColorBackground && isDark"
      :style="{
        opacity: props.activatedPage === AppPage.Search ? 1 : 0.4,
        background: neutralGradient,
      }"
      pos="absolute top-0 left-0" w-full h-full z-0 pointer-events-none
    />
  </Transition>
</template>
