<script setup lang="ts">
defineProps<{
  title: string
  desc?: string
}>()
</script>

<template>
  <section class="settings-item-subgroup" :data-settings-title="title">
    <header class="subgroup-heading">
      <div class="subgroup-title bew-ui-label">
        {{ title }}
      </div>
      <div v-if="desc" class="subgroup-desc bew-help">
        {{ desc }}
      </div>
    </header>

    <div class="subgroup-content">
      <slot />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.settings-item-subgroup {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0.75rem 0;
  border-top: 1px solid var(--bew-border-color);
}

.settings-item-subgroup:first-child {
  border-top: 0;
}

.subgroup-heading {
  width: 100%;
  min-width: 0;
  padding: var(--bew-space-0-5) 0 var(--bew-space-2);
}

.subgroup-desc {
  margin-top: var(--bew-space-0-5);
}

.subgroup-content {
  margin-top: var(--bew-space-1);
  padding-inline-start: var(--bew-settings-level-indent);

  :deep(.b-settings-item) {
    padding: var(--bew-space-3) 0;
  }
}
</style>
