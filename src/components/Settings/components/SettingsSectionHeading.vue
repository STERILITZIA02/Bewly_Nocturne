<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  desc?: string
  collapsible?: boolean
  warning?: boolean
  badge?: string
}>(), {
  collapsible: false,
})

const collapsed = defineModel<boolean>('collapsed', {
  default: false,
})
</script>

<template>
  <button
    v-if="collapsible"
    type="button"
    class="settings-section-heading settings-section-heading--button"
    :data-settings-title="title"
    :aria-expanded="!collapsed"
    @click="collapsed = !collapsed"
  >
    <span class="settings-section-heading__content">
      <h2>
        {{ title }}
        <span v-if="badge" class="settings-risk-badge bew-warning-badge">{{ badge }}</span>
      </h2>
      <p v-if="desc" class="bew-help" :class="{ warning }">{{ desc }}</p>
    </span>
    <i
      i-tabler:chevron-down
      class="settings-section-heading__chevron"
      :class="{ collapsed }"
    />
  </button>
  <header
    v-else
    class="settings-section-heading"
    :data-settings-title="title"
  >
    <span class="settings-section-heading__content">
      <h2>
        {{ title }}
        <span v-if="badge" class="settings-risk-badge bew-warning-badge">{{ badge }}</span>
      </h2>
      <p v-if="desc" class="bew-help" :class="{ warning }">{{ desc }}</p>
    </span>
  </header>
</template>

<style lang="scss" scoped>
// The open page's title (user-specified, after Claude Code): plain type at
// the top of the page column, the page's groups below it.
.settings-section-heading {
  display: flex;
  gap: var(--bew-space-3);
  align-items: flex-start;
  margin-bottom: var(--bew-space-6);
}

.settings-section-heading__content {
  min-width: 0;
}

.settings-section-heading--button {
  width: 100%;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover .settings-section-heading__chevron {
    color: var(--bew-text-1);
  }
}

.settings-section-heading__chevron {
  width: var(--bew-icon-size-md);
  height: var(--bew-icon-size-md);
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--bew-text-2);
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard);

  &.collapsed {
    transform: rotate(-90deg);
  }
}

h2 {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-heading);
}

.settings-risk-badge {
  margin-left: var(--bew-space-2);
  vertical-align: middle;
}

p {
  margin: var(--bew-space-1) 0 0;
  color: var(--bew-text-2);
}

p.bew-help.warning {
  color: var(--bew-warning-color);
}

@media (prefers-reduced-motion: reduce) {
  .settings-section-heading__chevron {
    transition: none;
  }
}
</style>
