<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { onBeforeUnmount, ref, useId, watch } from 'vue'

import { removeHttpFromUrl } from '~/utils/main'
import { getMotionDuration } from '~/utils/motionTiming'
import { keepSelectionScrollAnchor } from '~/utils/selectionScrollAnchor'

const props = defineProps<{
  title: string
  count: number
  cover?: string
  expanded: boolean
  selected?: boolean
  managing?: boolean
  disabled?: boolean
  locked?: boolean
  icon: string
  iconLabel?: string
}>()
const emit = defineEmits<{ select: [], visible: [] }>()
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const failedImage = ref(false)
const panelId = `favorite-folder-${useId()}`
const renderActions = ref(props.expanded)
let closeActionsTimer: ReturnType<typeof setTimeout> | undefined
let releaseAnchor: (() => void) | undefined
watch(() => props.expanded, (expanded) => {
  clearTimeout(closeActionsTimer)
  if (expanded) {
    renderActions.value = true
  }
  else if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    renderActions.value = false
  }
  else {
    const duration = root.value ? getMotionDuration(getComputedStyle(root.value), '--bew-duration-normal') : 200
    closeActionsTimer = setTimeout(() => renderActions.value = false, duration + 50)
  }
  releaseAnchor?.()
  if (expanded && root.value?.parentElement)
    releaseAnchor = keepSelectionScrollAnchor(root.value, root.value.parentElement)
}, { flush: 'pre' })
onBeforeUnmount(() => {
  clearTimeout(closeActionsTimer)
  releaseAnchor?.()
})
watch(() => props.cover, () => failedImage.value = false)
watch(() => props.expanded, (expanded) => {
  const active = (panel.value?.getRootNode() as Document | ShadowRoot | undefined)?.activeElement
  if (!expanded && active && panel.value?.contains(active))
    trigger.value?.focus({ preventScroll: true })
}, { flush: 'sync' })
const { stop } = useIntersectionObserver(root, ([entry]) => {
  if (entry?.isIntersecting) {
    emit('visible')
    stop()
  }
})
</script>

<template>
  <li ref="root" class="favorite-sidebar-item" :class="{ 'is-active': expanded, 'is-selected': selected }">
    <button
      ref="trigger" type="button" class="favorite-sidebar-item__trigger" :disabled="disabled || locked"
      :aria-expanded="expanded" :aria-controls="panelId" :aria-current="expanded ? 'true' : undefined"
      :aria-pressed="managing ? Boolean(selected) : undefined" @click="emit('select')"
    >
      <span class="favorite-sidebar-item__cover" aria-hidden="true">
        <img v-if="cover && !failedImage" :src="removeHttpFromUrl(`${cover}@96w_96h_1c`)" alt="" loading="lazy" @error="failedImage = true">
        <span v-else i-tabler:folder-star />
      </span>
      <span class="favorite-sidebar-item__title">{{ title }}</span>
      <span class="favorite-sidebar-item__meta">
        <span :class="icon" :title="iconLabel" />
        <span>{{ count }}</span>
      </span>
    </button>
    <div
      :id="panelId" ref="panel" class="favorite-sidebar-item__panel" :data-expanded="expanded"
      :inert="expanded ? undefined : true" :aria-hidden="!expanded"
    >
      <div class="favorite-sidebar-item__clip">
        <div v-if="renderActions" class="favorite-sidebar-item__actions">
          <slot />
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped lang="scss">
.favorite-sidebar-item {
  flex: none;
  min-width: 0;
  border-radius: var(--bew-radius-xl);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-sidebar-secondary);
  transition:
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    color var(--bew-duration-fast) var(--bew-ease-standard);
  &:is(:hover, :focus-within) {
    background: var(--bew-sidebar-control);
  }
  // Same plate as the History / Watch Later advanced filters, which reads
  // clearly on the rail material in every theme.
  &.is-active,
  &.is-selected {
    color: var(--bew-text-1);
    background: var(--bew-message-pinned-background);
  }
}
.favorite-sidebar-item__trigger {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  width: 100%;
  padding: var(--bew-space-2);
  border: 0;
  border-radius: inherit;
  color: inherit;
  background: transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-align: start;
  cursor: pointer;
  &:disabled {
    opacity: 0.56;
    cursor: default;
  }
}
.favorite-sidebar-item__cover {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--bew-space-12);
  height: var(--bew-space-12);
  overflow: hidden;
  // The 8px inset and 8px cover radius nest inside the 16px row radius.
  border-radius: var(--bew-radius-md);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-2);
  background: var(--bew-content-alt-solid);
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  > span {
    width: var(--bew-icon-size-lg);
    height: var(--bew-icon-size-lg);
  }
}
.favorite-sidebar-item__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.favorite-sidebar-item__meta {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  font-size: var(--bew-font-size-caption);
  > span:first-child {
    width: var(--bew-icon-size-xs);
    height: var(--bew-icon-size-xs);
  }
}
.favorite-sidebar-item__panel {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
  &[data-expanded="true"] {
    grid-template-rows: 1fr;
    opacity: 1;
  }
}
.favorite-sidebar-item__clip {
  min-height: 0;
  overflow: hidden;
}
.favorite-sidebar-item__actions {
  display: grid;
  gap: var(--bew-space-2);
  padding: 0 var(--bew-space-2) var(--bew-space-2);
  :deep(.favorite-folder-action) {
    display: flex;
    align-items: center;
    gap: var(--bew-space-2);
    width: 100%;
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2);
    border: 0;
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    color: var(--bew-text-1);
    background: var(--bew-content-alt-solid);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-medium);
    line-height: var(--bew-line-height-control);
    text-align: start;
    cursor: pointer;
    transition:
      background-color var(--bew-duration-fast) var(--bew-ease-standard),
      color var(--bew-duration-fast) var(--bew-ease-standard);
    &:hover:not(:disabled) {
      color: var(--bew-on-theme-surface);
      background: var(--bew-theme-surface-hover);
    }
    &:disabled {
      opacity: 0.56;
      cursor: default;
    }
    &.danger {
      color: var(--bew-error-foreground);
    }
    &.warning {
      color: var(--bew-warning-foreground);
    }
    > span:first-child {
      width: var(--bew-control-icon-size);
      height: var(--bew-control-icon-size);
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .favorite-sidebar-item__panel {
    transition: none;
  }
}
</style>
