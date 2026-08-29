<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import type { NotificationSectionDefinition, NotificationView } from '../notificationSections'
import { NOTIFICATION_SECTIONS } from '../notificationSections'

const props = defineProps<{
  modelValue: NotificationView
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', view: NotificationView): void
  (event: 'widthChange', width: number): void
}>()

const { t } = useI18n()
const topBarStore = useTopBarStore()
const navigationRef = ref<HTMLElement | null>(null)
const insideRef = ref<HTMLElement | null>(null)
const indicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)
let lastEmittedWidth = 0
const ACTIVE_SECTION_EDGE_GAP = 4

function revealActiveSection() {
  const navigation = navigationRef.value
  const inside = insideRef.value
  const scroller = navigation?.querySelector<HTMLElement>('.notifications-navigation__scroll')
  const activeItem = inside?.querySelector<HTMLElement>('[data-active="true"]')
  if (!scroller || !activeItem)
    return

  const itemStart = activeItem.offsetLeft
  const itemEnd = itemStart + activeItem.offsetWidth
  const viewportStart = scroller.scrollLeft
  const viewportEnd = viewportStart + scroller.clientWidth
  if (itemStart < viewportStart)
    scroller.scrollTo({ left: Math.max(0, itemStart - ACTIVE_SECTION_EDGE_GAP), behavior: 'auto' })
  else if (itemEnd > viewportEnd)
    scroller.scrollTo({ left: itemEnd - scroller.clientWidth + ACTIVE_SECTION_EDGE_GAP, behavior: 'auto' })
}

function measureNavigationWidth() {
  const navigation = navigationRef.value
  const inside = insideRef.value
  if (!navigation || !inside)
    return

  const style = getComputedStyle(navigation)
  const horizontalChrome = Number.parseFloat(style.paddingLeft)
    + Number.parseFloat(style.paddingRight)
    + Number.parseFloat(style.borderLeftWidth)
    + Number.parseFloat(style.borderRightWidth)
  const width = Math.ceil(inside.getBoundingClientRect().width + horizontalChrome)
  if (!Number.isFinite(width) || width <= 0 || width === lastEmittedWidth)
    return

  lastEmittedWidth = width
  emit('widthChange', width)
  revealActiveSection()
}

useResizeObserver(insideRef, measureNavigationWidth)

onMounted(() => {
  void nextTick(() => {
    measureNavigationWidth()
    revealActiveSection()
  })
})

watch(() => props.modelValue, () => {
  void nextTick(() => {
    revealActiveSection()
    void indicatorRef.value?.updateIndicator(true)
  })
}, { flush: 'post' })

function unreadCount(section: NotificationSectionDefinition): number {
  switch (section.unreadSource) {
    case 'dm':
      return (topBarStore.unReadDm.follow_unread || 0) + (topBarStore.unReadDm.unfollow_unread || 0)
    case 'reply':
      return topBarStore.unReadMessage.reply || 0
    case 'at':
      return topBarStore.unReadMessage.at || 0
    case 'like':
      return Math.max(topBarStore.unReadMessage.like || 0, (topBarStore.unReadMessage as { recv_like?: number }).recv_like || 0)
    case 'system':
      return topBarStore.unReadMessage.sys_msg || 0
    default:
      return 0
  }
}
</script>

<template>
  <nav
    ref="navigationRef"
    class="notifications-navigation bew-segment-control bew-segment-control--surface"
    :class="{ 'bew-segment-control--solid': settings.disableFrostedGlass }"
    :aria-label="t('notifications.navigation_aria')"
  >
    <div class="notifications-navigation__scroll">
      <div ref="insideRef" class="notifications-navigation__inside">
        <LiquidSegmentIndicator ref="indicatorRef" :active-key="modelValue" />
        <button
          v-for="section in NOTIFICATION_SECTIONS"
          :key="section.id"
          type="button"
          class="notifications-navigation__item bew-segment-control__item bew-segment-control__item--wide"
          data-segment-item
          :data-active="modelValue === section.id ? 'true' : undefined"
          :aria-current="modelValue === section.id ? 'page' : undefined"
          :aria-label="t('notifications.section_aria', { section: t(section.labelKey) })"
          @click="emit('update:modelValue', section.id)"
        >
          <span class="notifications-navigation__label">{{ t(section.labelKey) }}</span>
          <span
            class="notifications-navigation__badge"
            :class="{ 'notifications-navigation__badge--empty': unreadCount(section) <= 0 }"
            :aria-hidden="unreadCount(section) <= 0"
            :aria-label="unreadCount(section) > 0 ? t('notifications.unread_count', { count: unreadCount(section) }) : undefined"
          >
            {{ unreadCount(section) > 99 ? '99+' : Math.max(0, unreadCount(section)) }}
          </span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.notifications-navigation {
  display: block;
  width: min(100%, var(--notifications-conversation-list-width));
  max-width: 100%;
  min-width: 0;
  justify-self: start;
}

.notifications-navigation__scroll {
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  scrollbar-width: none;
}

.notifications-navigation__scroll::-webkit-scrollbar {
  display: none;
}

.notifications-navigation__inside {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--bew-control-gap);
  width: max-content;
  height: 100%;
  box-sizing: border-box;
  padding-inline: var(--bew-space-0-5);
}

.notifications-navigation__label {
  white-space: nowrap;
}

.notifications-navigation__badge {
  display: inline-grid;
  box-sizing: border-box;
  flex: 0 0 auto;
  place-items: center;
  width: var(--bew-space-8);
  height: var(--bew-space-4);
  padding: 0 var(--bew-space-1);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  white-space: nowrap;
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.notifications-navigation__badge--empty {
  visibility: hidden;
}
</style>
