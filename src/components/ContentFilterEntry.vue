<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import IconButton from '~/components/IconButton.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { MOMENT_TYPE_FILTER_OPTIONS } from '~/constants/momentFilters'
import { settings } from '~/logic'

const props = defineProps<{ kind: 'recommendation' | 'moments' }>()
const { t } = useI18n()
const { openSettingsAt } = useBewlyApp()
const menu = ref<{ anchor: { x: number, y: number }, trigger: HTMLElement }>()
const title = computed(() => t(props.kind === 'moments' ? 'settings.moments_filter_entry' : 'settings.recommendation_filter_entry'))
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
const definitions = computed(() => props.kind === 'moments'
  ? [...MOMENT_TYPE_FILTER_OPTIONS, { setting: 'momentsEnableKeywordFilter' as const, labelKey: 'settings.moments_enable_keyword_filter', icon: 'i-tabler:letter-case' }]
  : recommendationOptions.filter(option => !('mode' in option) || option.mode === (settings.value.recommendationMode === 'app' ? 'app' : 'web')))
const active = computed(() => definitions.value.some(option => option.setting !== 'disableFilterForFollowedUser' && settings.value[option.setting]))
const options = computed<ContextMenuOption[]>(() => [
  ...definitions.value.map(option => ({
    value: option.setting,
    label: t(option.labelKey),
    icon: option.icon,
    kind: 'toggle' as const,
    closeOnSelect: false,
    checked: props.kind === 'moments' && option.setting !== 'momentsEnableKeywordFilter' ? !settings.value[option.setting] : settings.value[option.setting],
    section: props.kind === 'moments' && option.setting !== 'momentsEnableKeywordFilter' ? t('settings.moments_shown_types') : title.value,
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
    openSettingsAt({ category: 'bewly-pages', page: props.kind === 'moments' ? 'moments' : 'home', settingId: props.kind === 'moments' ? 'settings.moments_filtered_types' : 'settings.filter_by_view_count' })
    return
  }
  const option = definitions.value.find(option => option.setting === value)
  if (option)
    settings.value[option.setting] = !settings.value[option.setting]
}
</script>

<template>
  <button
    v-if="kind === 'moments'" type="button" class="library-sidebar-action" :aria-expanded="Boolean(menu)" aria-haspopup="menu"
    @click="open"
  >
    <i i-tabler:filter :class="{ 'content-filter-active': active }" aria-hidden="true" />
    <span>{{ title }}</span>
  </button>
  <Tooltip v-else :content="title">
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
