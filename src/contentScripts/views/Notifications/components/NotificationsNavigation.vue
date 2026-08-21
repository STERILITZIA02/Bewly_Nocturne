<script setup lang="ts">
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
}>()

const { t } = useI18n()
const topBarStore = useTopBarStore()
const indicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)

watch(() => props.modelValue, () => {
  void indicatorRef.value?.updateIndicator(true)
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
    class="notifications-navigation bew-segment-control bew-segment-control--surface"
    :class="{ 'bew-segment-control--solid': settings.disableFrostedGlass }"
    :aria-label="t('notifications.navigation_aria')"
  >
    <div class="notifications-navigation__scroll">
      <div class="notifications-navigation__inside">
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
            v-if="unreadCount(section) > 0"
            class="notifications-navigation__badge"
            :aria-label="t('notifications.unread_count', { count: unreadCount(section) })"
          >
            {{ unreadCount(section) > 99 ? '99+' : unreadCount(section) }}
          </span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.notifications-navigation {
  display: block;
  width: fit-content;
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
}

.notifications-navigation__label {
  white-space: nowrap;
}

.notifications-navigation__badge {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  min-width: var(--bew-space-4);
  height: var(--bew-space-4);
  padding: 0 var(--bew-space-1);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}
</style>
