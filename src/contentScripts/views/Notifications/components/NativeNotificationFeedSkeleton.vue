<script setup lang="ts">
import NotificationSkeletonBlock from '~/components/SkeletonBlock.vue'

import type { NativeNotificationSection } from '../notificationSections'

withDefaults(defineProps<{
  count?: number
  label: string
  section?: NativeNotificationSection
  announce?: boolean
}>(), {
  count: 6,
  section: 'reply',
  announce: true,
})
</script>

<template>
  <div class="native-notification-feed-skeleton native-notification-grid" :role="announce ? 'status' : undefined" :aria-label="announce ? label : undefined">
    <article
      v-for="index in count"
      :key="index"
      class="native-notification-feed-skeleton__item native-notification-interaction-layout native-notification-surface bew-shape-smooth-rect"
      :class="{ 'native-notification-feed-skeleton__item--system': section === 'system' }"
      aria-hidden="true"
    >
      <NotificationSkeletonBlock
        width="var(--bew-notifications-avatar-size)"
        height="var(--bew-notifications-avatar-size)"
        :radius="section === 'system' ? 'interactive' : 'circle'"
      />
      <div class="native-notification-feed-skeleton__content">
        <div class="native-notification-feed-skeleton__heading">
          <NotificationSkeletonBlock
            :width="index % 2 === 0 ? '42%' : '32%'"
            height="var(--bew-line-height-title)"
            radius="full"
          />
          <NotificationSkeletonBlock
            width="104px"
            height="var(--bew-line-height-caption)"
            radius="full"
          />
        </div>
        <NotificationSkeletonBlock
          v-if="section === 'system'"
          width="24%"
          height="var(--bew-line-height-caption)"
          radius="full"
        />
      </div>
      <div v-if="section !== 'love'" class="native-notification-feed-skeleton__body">
        <NotificationSkeletonBlock
          :width="index % 3 === 0 ? '78%' : '92%'"
          height="var(--bew-line-height-body)"
        />
        <NotificationSkeletonBlock
          v-if="index % 3 !== 0"
          width="64%"
          height="var(--bew-line-height-body)"
        />
      </div>
      <div v-if="section !== 'system'" class="native-notification-feed-skeleton__context">
        <div class="native-notification-feed-skeleton__reference">
          <NotificationSkeletonBlock width="72%" height="var(--bew-line-height-control)" />
          <div class="native-notification-feed-skeleton__reference-source">
            <NotificationSkeletonBlock
              width="calc(var(--bew-space-10) * 2)"
              height="var(--bew-space-12)"
              radius="sm"
            />
            <div class="native-notification-feed-skeleton__reference-copy">
              <NotificationSkeletonBlock width="78%" height="var(--bew-line-height-control)" />
              <NotificationSkeletonBlock width="54%" height="var(--bew-line-height-caption)" />
            </div>
          </div>
        </div>
        <NotificationSkeletonBlock
          width="96px"
          height="var(--bew-line-height-control)"
          radius="full"
        />
      </div>
    </article>
  </div>
</template>

<style scoped lang="scss">
.native-notification-feed-skeleton__item {
  pointer-events: none;
}

.native-notification-feed-skeleton__content {
  display: grid;
  gap: var(--bew-space-1);
  min-width: 0;
  align-self: center;
}

.native-notification-feed-skeleton__body {
  grid-column: 1 / -1;
  display: grid;
  min-width: 0;
  gap: var(--bew-space-2);
}

.native-notification-feed-skeleton__heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  min-width: 0;
  gap: var(--bew-space-1);
  align-items: center;
}

.native-notification-feed-skeleton__item--system .native-notification-feed-skeleton__heading {
  display: flex;
  gap: var(--bew-space-3);
  justify-content: space-between;
}

.native-notification-feed-skeleton__context {
  grid-column: 1 / -1;
  display: grid;
  min-width: 0;
  gap: var(--bew-space-2);
  align-content: center;
  padding: var(--bew-space-3);
  background: var(--bew-notifications-reference-background);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.native-notification-feed-skeleton__reference {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-2);
}

.native-notification-feed-skeleton__reference-source {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-3);
  align-items: center;
}

.native-notification-feed-skeleton__reference-copy {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--bew-space-2);
}
</style>
