<script setup lang="ts">
import { useMotionValue } from '~/composables/useMotionValue'
import { holdMotion } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

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
const requestedCollapsed = props.collapsible
  ? useMotionValue(() => collapsed.value, (value) => {
      collapsed.value = value
    })
  : collapsed
let releaseMotion: (() => void) | undefined
function toggle(event: MouseEvent) {
  const previous = releaseMotion
  releaseMotion = holdMotion(prefersReducedMotion() ? 0 : getMotionDuration(getComputedStyle(event.currentTarget as HTMLElement), '--bew-duration-normal'))
  previous?.()
  requestedCollapsed.value = !requestedCollapsed.value
}
onScopeDispose(() => releaseMotion?.())
</script>

<template>
  <div class="b-settings-item-group" :data-settings-title="title">
    <button
      v-if="collapsible"
      type="button"
      class="group-heading"
      :aria-expanded="!requestedCollapsed"
      @click="toggle"
    >
      <span>
        <span class="group-title">
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
        :class="{ collapsed: requestedCollapsed }"
      />
    </button>
    <template v-else-if="title || desc">
      <p class="group-title">
        <i v-if="icon" :class="icon" />
        {{ title }}
      </p>
      <p v-if="desc" class="bew-help" :class="{ 'warning-desc': warningDesc }">
        {{ desc }}
      </p>
    </template>

    <Transition name="page-fade" :css="collapsible">
      <main v-show="!collapsed" class="group-panel" :inert="requestedCollapsed || undefined">
        <slot />
      </main>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
// Groups are flat sections of the page (user-specified, after Claude Code):
// a title over rows ruled by hairlines, space between groups, no card.
.b-settings-item-group + .b-settings-item-group {
  margin-top: var(--bew-space-8);
}

.group-title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-subheading);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-subheading);
}

.group-title + .bew-help,
.group-heading .bew-help {
  margin-top: var(--bew-space-1);
}

.group-panel {
  margin-top: var(--bew-space-2);
  padding-inline-start: var(--bew-settings-level-indent);
}

// An untitled group starts the page: its rows begin at once.
.b-settings-item-group > .group-panel:first-child {
  margin-top: 0;
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
@media (prefers-reduced-motion: reduce) {
  .collapse-icon {
    transition: none;
  }
}
</style>
