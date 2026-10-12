<script setup lang="ts">
import NotificationSkeletonBlock from '~/components/SkeletonBlock.vue'
import { settings } from '~/logic'

import type { NotificationView } from '../notificationSections'
import ConversationDetailSkeleton from '../whisper/ConversationDetailSkeleton.vue'
import ConversationListSkeleton from '../whisper/ConversationListSkeleton.vue'
import NativeNotificationFeedSkeleton from './NativeNotificationFeedSkeleton.vue'

withDefaults(defineProps<{
  label: string
  view?: NotificationView
  announce?: boolean
}>(), { view: 'whisper', announce: true })
</script>

<template>
  <section class="notifications-page-skeleton" :class="{ 'notifications-page-skeleton--solid': settings.disableFrostedGlass }" :role="announce ? 'status' : undefined" :aria-label="announce ? label : undefined">
    <div class="notifications-page-skeleton__workspace">
      <aside class="notifications-page-skeleton__sessions bew-shape-smooth-rect">
        <header class="notifications-page-skeleton__header" aria-hidden="true">
          <NotificationSkeletonBlock width="28%" height="var(--bew-line-height-control)" />
          <NotificationSkeletonBlock width="44%" height="var(--bew-wheel-label-line-height)" />
          <NotificationSkeletonBlock width="32%" height="var(--bew-line-height-control)" />
        </header>
        <ConversationListSkeleton
          :announce="false"
          :count="6"
          :label="label"
        />
      </aside>
      <ConversationDetailSkeleton
        v-if="view === 'whisper'"
        :announce="false"
        :label="label"
      />
      <div v-else class="notifications-page-skeleton__feed">
        <NativeNotificationFeedSkeleton :label="label" :section="view" :announce="false" />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";
@use "../../../../styles/sidebarSurface";

.notifications-page-skeleton {
  display: grid;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  gap: var(--bew-space-4);
}

.notifications-page-skeleton__header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--bew-space-1);
  box-sizing: border-box;
  height: var(--bew-sidebar-heading-height);
  min-width: 0;
  flex: 0 0 auto;
  padding: 0 var(--bew-top-bar-inline-padding) var(--bew-space-2);
}

.notifications-page-skeleton__workspace {
  display: grid;
  grid-template-columns:
    minmax(0, var(--notifications-conversation-list-width, var(--bew-notifications-list-max-width)))
    minmax(0, 1fr);
  gap: var(--bew-space-4);
  min-width: 0;
  min-height: 0;
}

.notifications-page-skeleton__workspace:has(> .notifications-page-skeleton__feed) {
  gap: 0;
}

.notifications-page-skeleton__sessions {
  @include sidebarSurface.surface;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  padding-top: var(--bew-top-bar-height);
  border: 0;
  border-inline-end: 1px solid var(--bew-surface-border-color);
  border-radius: 0;
}

.notifications-page-skeleton__workspace > :last-child:not(.notifications-page-skeleton__feed) {
  box-sizing: border-box;
  padding: calc(var(--bew-top-bar-height) + var(--bew-space-3)) var(--bew-space-4)
    var(--notifications-detail-bottom-space, var(--bew-space-3)) 0;
  overflow: hidden;
}

.notifications-page-skeleton__feed {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  container: notification-feed / inline-size;
  padding: calc(var(--bew-top-bar-height) + var(--bew-space-4)) var(--bew-notifications-feed-inline-space)
    calc(var(--notifications-detail-bottom-space, var(--bew-space-3)) + var(--bew-space-4));

  :deep(.native-notification-feed-skeleton) {
    margin-inline: auto;
  }
}

.notifications-page-skeleton--solid .notifications-page-skeleton__sessions {
  @include sidebarSurface.solid;
}

@media (max-width: breakpoints.$compact-max) {
  .notifications-page-skeleton,
  .notifications-page-skeleton__workspace {
    gap: var(--bew-space-3);
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .notifications-page-skeleton__workspace {
    gap: var(--bew-space-2);
  }
}
</style>
