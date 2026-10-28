<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="conversation-empty-state">
    <div class="conversation-empty-state__content">
      <div class="conversation-empty-state__symbol" aria-hidden="true">
        <i i-tabler:message-circle />
      </div>
      <h2 class="conversation-empty-state__heading">
        {{ t('notifications.whisper.select_conversation_empty') }}
      </h2>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.conversation-empty-state {
  display: grid;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: var(--bew-space-8);
  place-items: center;
  background: transparent;
}

.conversation-empty-state__content {
  display: grid;
  width: min(100%, calc(var(--bew-space-12) * 8));
  gap: var(--bew-space-4);
  justify-items: center;
  color: var(--bew-text-2);
  text-align: center;
}

.conversation-empty-state__symbol {
  display: grid;
  width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  place-items: center;
  color: var(--bew-text-3);
}

.conversation-empty-state__symbol i {
  font-size: var(--bew-icon-size-lg);
}

.conversation-empty-state__heading {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-heading);
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-empty-state {
    padding: var(--bew-space-4);
  }
}
</style>
