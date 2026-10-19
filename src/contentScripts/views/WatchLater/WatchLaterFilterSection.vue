<script setup lang="ts">
import { ref, useId, watch } from 'vue'

// `memoryKey` names the section within its page; the open state is remembered
// for this browser tab only and every section starts collapsed.
const props = defineProps<{ title: string, memoryKey: string }>()
const storageKey = `bewly-library-filter-section:${props.memoryKey}`
const expanded = ref(readExpanded())
watch(expanded, (value) => {
  try {
    sessionStorage.setItem(storageKey, value ? '1' : '0')
  }
  catch {
    // Storage may be unavailable; the section still works for this view.
  }
})

function readExpanded() {
  try {
    return sessionStorage.getItem(storageKey) === '1'
  }
  catch {
    return false
  }
}
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const id = useId()
const panelId = `watch-later-filter-${id}`
const headingId = `${panelId}-heading`

function toggle() {
  const root = panel.value?.getRootNode() as Document | ShadowRoot | undefined
  if (expanded.value && root?.activeElement && panel.value?.contains(root.activeElement))
    trigger.value?.focus()
  expanded.value = !expanded.value
}
</script>

<template>
  <section class="watch-later-filter-section">
    <h2>
      <button
        :id="headingId" ref="trigger" type="button" :aria-expanded="expanded" :aria-controls="panelId"
        @click="toggle"
      >
        <span>{{ title }}</span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 12h12" />
          <path class="watch-later-filter-section__plus" :class="{ 'is-expanded': expanded }" d="M12 6v12" />
        </svg>
      </button>
    </h2>
    <div
      :id="panelId" ref="panel" class="watch-later-filter-section__panel" :data-expanded="expanded"
      :aria-labelledby="headingId" :aria-hidden="!expanded" :inert="expanded ? undefined : true"
    >
      <div class="watch-later-filter-section__clip">
        <div class="watch-later-filter-section__content">
          <slot :expanded="expanded" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.watch-later-filter-section + .watch-later-filter-section {
  padding-top: var(--bew-space-3);
  border-top: 1px solid var(--bew-message-card-border);
}
.watch-later-filter-section h2 {
  margin: 0;
}
.watch-later-filter-section button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  width: 100%;
  min-height: var(--bew-control-item-height);
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-align: start;
  cursor: pointer;
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
  &:is(:hover, :focus-visible):not(:disabled) {
    color: var(--bew-message-icon-hover);
  }
  &:disabled {
    color: var(--bew-text-3);
    cursor: not-allowed;
  }
}
.watch-later-filter-section svg {
  flex: none;
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}
.watch-later-filter-section__plus {
  transform-origin: center;
  transition: transform var(--bew-duration-normal) var(--bew-ease-standard);
  &.is-expanded {
    transform: scaleY(0);
  }
}
.watch-later-filter-section__panel {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition:
    grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
  &[data-expanded="false"] {
    grid-template-rows: 0fr;
    opacity: 0;
  }
}
.watch-later-filter-section__clip {
  min-height: 0;
  overflow: hidden;
}
.watch-later-filter-section__content {
  padding-top: var(--bew-space-2);
}
@media (prefers-reduced-motion: reduce) {
  .watch-later-filter-section__panel {
    transition-property: opacity;
  }
  .watch-later-filter-section__plus {
    transition: none;
  }
}
</style>
