<script setup lang="ts">
import type { TransientPrivateRecipient } from './privateRecipientSearch'

defineProps<{
  recipient: TransientPrivateRecipient
}>()

const emit = defineEmits<{
  (event: 'select', recipient: TransientPrivateRecipient): void
}>()
</script>

<template>
  <button
    type="button"
    class="private-recipient-result"
    :aria-label="$t('notifications.whisper.select_recipient', { name: recipient.name })"
    @click="emit('select', recipient)"
  >
    <span class="private-recipient-result__avatar" aria-hidden="true">
      <img
        v-if="recipient.avatar"
        :src="recipient.avatar"
        alt=""
        loading="lazy"
        decoding="async"
      >
      <span v-else>{{ recipient.name.trim().charAt(0).toLocaleUpperCase() || '?' }}</span>
    </span>
    <span class="private-recipient-result__copy">
      <strong>{{ recipient.name }}</strong>
      <span>{{ $t(`notifications.whisper.recipient_search.sources.${recipient.source}`) }}</span>
    </span>
  </button>
</template>

<style scoped lang="scss">
.private-recipient-result {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  gap: var(--bew-space-3);
  align-items: center;
  padding: var(--bew-space-2) var(--bew-space-3);
  color: inherit;
  text-align: left;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.private-recipient-result:hover {
  background: var(--bew-fill-1);
}

.private-recipient-result:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.private-recipient-result__avatar {
  display: grid;
  width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  place-items: center;
  overflow: hidden;
  color: var(--bew-text-2);
  font-weight: var(--bew-font-weight-semibold);
  background: var(--bew-fill-2);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.private-recipient-result__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.private-recipient-result__copy {
  display: grid;
  min-width: 0;
}

.private-recipient-result__copy strong,
.private-recipient-result__copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.private-recipient-result__copy strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.private-recipient-result__copy span {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
