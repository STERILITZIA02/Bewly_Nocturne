<script setup lang="ts">
import NotificationSkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{
  count?: number
  label: string
}>(), {
  count: 5,
})
</script>

<template>
  <div class="native-notification-feed-skeleton" role="status" :aria-label="label">
    <article
      v-for="index in count"
      :key="index"
      class="native-notification-feed-skeleton__item native-notification-surface bew-shape-smooth-rect"
      aria-hidden="true"
    >
      <NotificationSkeletonBlock
        width="var(--bew-space-12)"
        height="var(--bew-space-12)"
        radius="circle"
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
          :width="index % 3 === 0 ? '78%' : '92%'"
          height="var(--bew-line-height-body)"
        />
        <NotificationSkeletonBlock
          width="64%"
          height="var(--bew-line-height-body)"
        />
        <div v-if="index % 2 === 1" class="native-notification-feed-skeleton__reference">
          <NotificationSkeletonBlock width="72%" height="var(--bew-line-height-control)" />
          <div class="native-notification-feed-skeleton__reference-source">
            <NotificationSkeletonBlock
              width="calc(var(--bew-space-10) * 2)"
              height="var(--bew-space-12)"
              radius="media"
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
.native-notification-feed-skeleton {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-3);
}

.native-notification-feed-skeleton__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bew-space-3);
  padding: var(--bew-space-4);
  pointer-events: none;
}

.native-notification-feed-skeleton__content {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-2);
}

.native-notification-feed-skeleton__heading {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-3);
  align-items: center;
  justify-content: space-between;
}

.native-notification-feed-skeleton__reference {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-1);
  padding: var(--bew-space-3);
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.native-notification-feed-skeleton__reference-source {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: center;
}

.native-notification-feed-skeleton__reference-copy {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--bew-space-2);
}
</style>
