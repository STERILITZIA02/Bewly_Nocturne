<script setup lang="ts">
import { useDocumentVisibility, useElementVisibility } from '@vueuse/core'
import { computed, ref } from 'vue'

import ALink from '~/components/ALink.vue'

const props = defineProps<{ mid: number, name: string, liveStatus?: number, roomid?: number }>()
const root = ref<HTMLElement>()
const visible = useElementVisibility(root)
const documentVisibility = useDocumentVisibility()
const live = computed(() => props.liveStatus === 1)
const href = computed(() => live.value && Number.isSafeInteger(props.roomid) && props.roomid! > 0 ? `https://live.bilibili.com/${props.roomid}` : `https://space.bilibili.com/${props.mid}`)
</script>

<template>
  <span ref="root" class="user-avatar-link" :class="{ 'is-live': live, 'is-animating': live && visible && documentVisibility === 'visible' }">
    <ALink :href="href" :aria-label="live ? `${name} · ${$t('search.user.live')}` : name" type="videoCard" stop-propagation>
      <slot />
      <span v-if="live" class="user-avatar-link__badge">{{ $t('search.user.live') }}</span>
    </ALink>
  </span>
</template>

<style scoped lang="scss">
.user-avatar-link {
  position: relative;
  display: inline-flex;
  flex: none;
  pointer-events: auto;
  z-index: 1;
  &.is-live::before,
  &.is-live::after {
    content: "";
    position: absolute;
    inset: calc(-1 * var(--bew-space-1));
    border: var(--bew-space-0-5) solid var(--bew-theme-foreground);
    border-radius: 50%;
    corner-shape: var(--bew-corner-shape-round);
    pointer-events: none;
    opacity: 0;
  }
  &.is-animating::before,
  &.is-animating::after {
    animation: user-live-ripple 2s var(--bew-ease-standard) infinite;
  }
  &.is-animating::after {
    animation-delay: -1s;
  }
}
.user-avatar-link__badge {
  position: absolute;
  bottom: calc(-1 * var(--bew-space-1));
  left: 50%;
  transform: translateX(-50%);
  padding-inline: var(--bew-space-2);
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  white-space: nowrap;
}
@keyframes user-live-ripple {
  from {
    transform: scale(1);
    opacity: 0.8;
  }
  to {
    transform: scale(1.16);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .user-avatar-link.is-animating::before,
  .user-avatar-link.is-animating::after {
    animation: none;
  }
}
</style>
