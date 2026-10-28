<script setup lang="ts">
import Button from '~/components/Button.vue'

/**
 * The actions above a page shown in a frame (drawer, picture-in-picture):
 * open it in a new tab, and close it. The new-tab action is a real link, so
 * middle click and the context menu work; `sync` lets the host write the
 * frame's current address into it just before use. `escape` shows the Esc
 * hint, and `armed` asks for the second press.
 */
defineProps<{
  href: string
  escape?: 'hint' | 'armed'
}>()
const emit = defineEmits<{
  open: [event: MouseEvent]
  sync: [event: Event]
  close: []
}>()
</script>

<template>
  <div class="frame-actions">
    <a
      :href="href" target="_blank" rel="noopener noreferrer"
      class="frame-actions__link"
      @pointerdown="emit('sync', $event)" @focus="emit('sync', $event)" @contextmenu="emit('sync', $event)"
      @click="emit('open', $event)"
    >
      <i class="i-tabler:external-link" aria-hidden="true" />
      {{ $t('iframe_drawer.open_in_new_tab') }}
    </a>
    <Button :type="escape === 'armed' ? 'error' : undefined" :class="{ 'frame-actions__close': escape !== 'armed' }" @click="emit('close')">
      <template #left>
        <i class="i-tabler:x" aria-hidden="true" />
      </template>
      {{ $t(escape === 'armed' ? 'iframe_drawer.press_esc_again_to_close' : 'iframe_drawer.close') }}
      <kbd v-if="escape">Esc</kbd>
    </Button>
  </div>
</template>

<style scoped lang="scss">
.frame-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bew-space-2);
  pointer-events: auto;
}

// The link wears the same elevated surface as the close button beside it; the
// extra ancestor outranks Button's own default surface.
.frame-actions :is(.frame-actions__link, .frame-actions__close) {
  --b-button-color: var(--bew-elevated-solid);
  --b-button-color-hover: var(--bew-elevated-solid-hover);
}

.frame-actions__link {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  box-sizing: border-box;
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-1);
  background: var(--b-button-color);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
  transition:
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--b-button-color-hover);
  }
  &:active {
    transform: scale(var(--bew-control-press-scale));
  }
}

@media (prefers-reduced-motion: reduce) {
  .frame-actions__link {
    transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

    &:active {
      transform: none;
    }
  }
}
</style>
