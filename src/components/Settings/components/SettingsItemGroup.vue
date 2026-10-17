<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  desc?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  warningDesc?: boolean
  icon?: string
}>(), {
  collapsible: false,
  defaultCollapsed: false,
  warningDesc: false,
})

const collapsed = ref(props.defaultCollapsed)
</script>

<template>
  <div class="b-settings-item-group" :data-settings-title="title">
    <button
      v-if="collapsible"
      type="button"
      class="group-heading"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <span>
        <span class="group-title bew-section-label">
          <i v-if="icon" :class="icon" />
          {{ title }}
        </span>
        <span
          v-if="desc"
          block class="bew-help"
          :class="{ 'warning-desc': warningDesc }"
        >
          {{ desc }}
        </span>
      </span>
      <i
        i-tabler:chevron-down
        class="collapse-icon"
        :class="{ collapsed }"
      />
    </button>
    <template v-else-if="title || desc">
      <p class="group-title bew-section-label">
        <i v-if="icon" :class="icon" />
        {{ title }}
      </p>
      <p v-if="desc" class="bew-help" :class="{ 'warning-desc': warningDesc }">
        {{ desc }}
      </p>
    </template>

    <main
      v-show="!collapsed"
      class="group-panel"
    >
      <slot />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.b-settings-item-group + .b-settings-item-group {
  --uno: "mt-6";
}

.group-panel {
  margin: var(--bew-space-2) calc(0px - var(--bew-space-4)) 0;
  padding-inline: var(--bew-space-4);
  padding-inline-start: calc(var(--bew-space-4) + var(--bew-settings-level-indent));
  background: var(--bew-content-solid);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
}

.group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  color: inherit;
  text-align: left;
  cursor: pointer;

  .group-title {
    transition: color var(--bew-duration-normal) var(--bew-ease-standard);
  }

  &:hover {
    .group-title,
    .collapse-icon {
      color: var(--bew-text-1);
    }
  }
}

.group-title {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.group-title > i {
  color: currentColor;
  font-size: var(--bew-icon-size-xs);
}

.collapse-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  color: var(--bew-text-2);
  font-size: var(--bew-icon-size-md);
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard);

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.bew-help.warning-desc {
  color: var(--bew-warning-color);
}
</style>
