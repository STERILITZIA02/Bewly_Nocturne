<script setup lang="ts">
import NotificationSkeletonBlock from '../components/NotificationSkeletonBlock.vue'

withDefaults(defineProps<{
  announce?: boolean
  label: string
}>(), {
  announce: true,
})
</script>

<template>
  <div
    class="conversation-history-skeleton"
    :role="announce ? 'status' : undefined"
    :aria-label="announce ? label : undefined"
    :aria-hidden="announce ? undefined : 'true'"
  >
    <div
      v-for="index in 2"
      :key="index"
      class="conversation-history-skeleton__item"
      aria-hidden="true"
    >
      <NotificationSkeletonBlock
        width="var(--bew-space-6)"
        height="var(--bew-space-6)"
        radius="circle"
      />
      <div class="conversation-history-skeleton__copy">
        <NotificationSkeletonBlock
          :width="index === 1 ? '44%' : '56%'"
          height="var(--bew-space-2)"
          radius="full"
        />
        <NotificationSkeletonBlock
          :width="index === 1 ? '78%' : '66%'"
          height="var(--bew-space-2)"
          radius="full"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.conversation-history-skeleton {
  display: grid;
  width: 100%;
  min-width: 0;
  height: var(--bew-control-height);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-4);
  align-items: center;
  overflow: hidden;
}

.conversation-history-skeleton__item {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: center;
}

.conversation-history-skeleton__copy {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--bew-space-1);
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-history-skeleton {
    grid-template-columns: minmax(0, 1fr);
  }

  .conversation-history-skeleton__item:last-child {
    display: none;
  }
}
</style>
