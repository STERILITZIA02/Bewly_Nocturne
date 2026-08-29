<script setup lang="ts">
import NotificationSkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{
  announce?: boolean
  compact?: boolean
  count?: number
  label: string
}>(), {
  announce: true,
  compact: false,
  count: 6,
})
</script>

<template>
  <div
    class="conversation-timeline-skeleton"
    :class="{ 'conversation-timeline-skeleton--compact': compact }"
    :role="announce ? 'status' : undefined"
    :aria-label="announce ? label : undefined"
    :aria-hidden="announce ? undefined : 'true'"
  >
    <div
      v-for="index in count"
      :key="index"
      class="conversation-timeline-skeleton__item"
      :class="{ 'conversation-timeline-skeleton__item--self': index % 3 === 0 }"
      aria-hidden="true"
    >
      <NotificationSkeletonBlock
        width="var(--bew-space-8)"
        height="var(--bew-space-8)"
        radius="circle"
      />
      <div class="conversation-timeline-skeleton__body">
        <NotificationSkeletonBlock
          :width="index % 2 === 0 ? '72px' : '96px'"
          height="var(--bew-line-height-caption)"
          radius="full"
        />
        <NotificationSkeletonBlock
          :width="index % 2 === 0 ? 'min(68%, 260px)' : 'min(52%, 210px)'"
          :height="index % 2 === 0 ? '56px' : '44px'"
          radius="panel"
        />
        <NotificationSkeletonBlock
          width="64px"
          height="var(--bew-line-height-caption)"
          radius="full"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.conversation-timeline-skeleton {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-3);
}

.conversation-timeline-skeleton--compact {
  gap: var(--bew-space-2);
}

.conversation-timeline-skeleton__item {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: flex-start;
}

.conversation-timeline-skeleton__item--self {
  flex-direction: row-reverse;
}

.conversation-timeline-skeleton__body {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--bew-space-1);
  justify-items: start;
}

.conversation-timeline-skeleton__item--self .conversation-timeline-skeleton__body {
  justify-items: end;
}
</style>
