<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import IconButton from '~/components/IconButton.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'

// The recommendation feed's quick filters. (Moments keeps its own in the rail
// search field's funnel menu.)
const { t } = useI18n()
const { openSettingsAt } = useBewlyApp()
const menu = ref<{ anchor: { x: number, y: number }, trigger: HTMLElement }>()
const title = computed(() => t('settings.recommendation_filter_entry'))
const recommendationOptions = [
  { setting: 'filterOutVerticalVideos', labelKey: 'settings.filter_out_vertical_videos', icon: 'i-tabler:device-mobile', mode: 'app' },
  { setting: 'enableFilterByViewCount', labelKey: 'settings.filter_by_view_count', icon: 'i-tabler:eye' },
  { setting: 'enableFilterByLikeCount', labelKey: 'settings.filter_by_like_count', icon: 'i-tabler:thumb-up' },
  { setting: 'enableFilterByDuration', labelKey: 'settings.filter_by_duration', icon: 'i-tabler:clock' },
  { setting: 'enableFilterByPublishTime', labelKey: 'settings.filter_by_publish_time', icon: 'i-tabler:calendar', mode: 'web' },
  { setting: 'enableFilterByTitle', labelKey: 'settings.filter_by_title', icon: 'i-tabler:letter-case' },
  { setting: 'enableFilterByUser', labelKey: 'settings.filter_by_user', icon: 'i-tabler:user' },
  { setting: 'disableFilterForFollowedUser', labelKey: 'settings.disable_filters_for_followed_users', icon: 'i-tabler:user-check' },
] as const
const definitions = computed(() => recommendationOptions.filter(option => !('mode' in option) || option.mode === (settings.value.recommendationMode === 'app' ? 'app' : 'web')))
const active = computed(() => definitions.value.some(option => option.setting !== 'disableFilterForFollowedUser' && settings.value[option.setting]))
const options = computed<ContextMenuOption[]>(() => [
  ...definitions.value.map(option => ({
    value: option.setting,
    label: t(option.labelKey),
    icon: option.icon,
    kind: 'toggle' as const,
    closeOnSelect: false,
    checked: settings.value[option.setting],
    section: title.value,
  })),
  { value: 'settings', label: t('settings.filter_settings'), icon: 'i-tabler:settings' },
])
function open(event: MouseEvent) {
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  menu.value = { trigger, anchor: { x: rect.right, y: rect.bottom } }
}
function select(value: string | number) {
  if (value === 'settings') {
    openSettingsAt({ category: 'bewly-pages', page: 'home', settingId: 'settings.filter_by_view_count' })
    return
  }
  const option = definitions.value.find(option => option.setting === value)
  if (option)
    settings.value[option.setting] = !settings.value[option.setting]
}
</script>

<template>
  <Tooltip :content="title">
    <IconButton :label="title" :aria-expanded="Boolean(menu)" aria-haspopup="menu" :class="{ 'content-filter-active': active }" @click="open">
      <i i-tabler:filter aria-hidden="true" />
    </IconButton>
  </Tooltip>
  <ContextMenu
    v-if="menu" :options="options" :anchor="menu.anchor" :trigger="menu.trigger" @select="select"
    @close="menu = undefined"
  />
</template>

<style scoped>
.content-filter-active {
  color: var(--bew-text-1);
}
</style>
