<script setup lang="ts">
import NotificationSkeletonBlock from '../components/NotificationSkeletonBlock.vue'

withDefaults(defineProps<{
  announce?: boolean
  compact?: boolean
  count?: number
  label: string
  showTools?: boolean
}>(), {
  announce: true,
  compact: false,
  count: 6,
  showTools: true,
})
</script>

<template>
  <section
    class="conversation-list-skeleton"
    :class="{
      'conversation-list-skeleton--compact': compact,
      'conversation-list-skeleton--rows-only': !showTools,
    }"
    :role="announce ? 'status' : undefined"
    :aria-label="announce ? label : undefined"
    :aria-hidden="announce ? undefined : 'true'"
  >
    <div v-if="showTools" class="conversation-list-skeleton__tools" aria-hidden="true">
      <NotificationSkeletonBlock
        height="var(--bew-control-height)"
        radius="interactive"
      />
      <div class="conversation-list-skeleton__segments">
        <NotificationSkeletonBlock
          v-for="index in 3"
          :key="index"
          height="var(--bew-control-item-height)"
          radius="control"
        />
      </div>
      <NotificationSkeletonBlock
        width="72%"
        height="var(--bew-control-height-sm)"
        radius="interactive"
      />
    </div>

    <div class="conversation-list-skeleton__items" aria-hidden="true">
      <div
        v-for="index in count"
        :key="index"
        class="conversation-list-skeleton__item"
      >
        <NotificationSkeletonBlock
          width="var(--bew-control-height-lg)"
          height="var(--bew-control-height-lg)"
          radius="circle"
        />
        <div class="conversation-list-skeleton__body">
          <div class="conversation-list-skeleton__heading">
            <NotificationSkeletonBlock
              :width="index % 2 === 0 ? '52%' : '38%'"
              height="var(--bew-line-height-title)"
              radius="full"
            />
            <NotificationSkeletonBlock
              width="52px"
              height="var(--bew-line-height-caption)"
              radius="full"
            />
          </div>
          <NotificationSkeletonBlock
            :width="index % 3 === 0 ? '66%' : '84%'"
            height="var(--bew-line-height-caption)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.conversation-list-skeleton {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.conversation-list-skeleton--rows-only {
  height: auto;
  overflow: visible;
}

.conversation-list-skeleton__tools {
  display: grid;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
}

.conversation-list-skeleton__segments {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bew-space-1);
  padding: var(--bew-space-1);
  background: var(--bew-fill-1);
  border-radius: var(--bew-control-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.conversation-list-skeleton__items {
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--bew-space-1);
  overflow: hidden;
}

.conversation-list-skeleton--rows-only .conversation-list-skeleton__items {
  flex: 0 0 auto;
  width: 100%;
  padding: 0;
}

.conversation-list-skeleton__item {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
  padding: var(--bew-space-3);
}

.conversation-list-skeleton--compact .conversation-list-skeleton__item {
  padding: var(--bew-space-2) var(--bew-space-3);
}

.conversation-list-skeleton__body {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--bew-space-1);
}

.conversation-list-skeleton__heading {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: space-between;
}
</style>
