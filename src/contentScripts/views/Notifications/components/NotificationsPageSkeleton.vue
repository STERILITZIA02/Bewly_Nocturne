<script setup lang="ts">
import NotificationSkeletonBlock from '~/components/SkeletonBlock.vue'

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
  <section class="notifications-page-skeleton" :role="announce ? 'status' : undefined" :aria-label="announce ? label : undefined">
    <header class="notifications-page-skeleton__header" aria-hidden="true">
      <NotificationSkeletonBlock
        width="min(100%, var(--notifications-conversation-list-width, var(--bew-notifications-list-max-width)))"
        height="var(--bew-control-height)"
        radius="control"
      />
    </header>
    <div v-if="view === 'whisper'" class="notifications-page-skeleton__workspace">
      <aside class="notifications-page-skeleton__sessions bew-shape-smooth-rect">
        <ConversationListSkeleton
          :announce="false"
          :count="6"
          :label="label"
        />
      </aside>
      <ConversationDetailSkeleton
        :announce="false"
        :label="label"
      />
    </div>
    <NativeNotificationFeedSkeleton v-else :label="label" :section="view" :announce="false" />
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.notifications-page-skeleton {
  display: grid;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--bew-space-4);
}

.notifications-page-skeleton__header {
  min-width: 0;
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

.notifications-page-skeleton__sessions {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bew-elevated-alt-solid);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
}

@media (max-width: breakpoints.$compact-max) {
  .notifications-page-skeleton,
  .notifications-page-skeleton__workspace {
    gap: var(--bew-space-3);
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .notifications-page-skeleton__workspace {
    display: block;
  }

  .notifications-page-skeleton__sessions {
    width: 100%;
    height: 100%;
  }

  .notifications-page-skeleton__workspace > :last-child {
    display: none;
  }
}
</style>
