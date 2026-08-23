<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const tips = ['emote', 'image', 'history', 'shortcut'] as const
</script>

<template>
  <section class="conversation-empty-state">
    <div class="conversation-empty-state__content">
      <div class="conversation-empty-state__symbol" aria-hidden="true">
        <i i-mingcute:message-3-line />
      </div>
      <div class="conversation-empty-state__heading">
        <h2>{{ t('notifications.whisper.select_conversation_empty') }}</h2>
        <p>{{ t('notifications.whisper.select_conversation_hint') }}</p>
      </div>
      <ul class="conversation-empty-state__tips">
        <li v-for="tip in tips" :key="tip">
          <i v-if="tip === 'emote'" i-mingcute:emoji-line aria-hidden="true" />
          <i v-else-if="tip === 'image'" i-mingcute:pic-line aria-hidden="true" />
          <i v-else-if="tip === 'history'" i-mingcute:arrow-up-line aria-hidden="true" />
          <i v-else i-mingcute:keyboard-line aria-hidden="true" />
          <span>{{ t(`notifications.whisper.empty_tips.${tip}`) }}</span>
        </li>
      </ul>
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
  justify-items: start;
  color: var(--bew-text-2);
}

.conversation-empty-state__symbol {
  display: grid;
  width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  place-items: center;
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.conversation-empty-state__symbol i {
  font-size: var(--bew-icon-size-lg);
}

.conversation-empty-state__heading {
  display: grid;
  gap: var(--bew-space-1);
}

.conversation-empty-state__heading h2,
.conversation-empty-state__heading p {
  margin: 0;
}

.conversation-empty-state__heading h2 {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-heading);
}

.conversation-empty-state__heading p,
.conversation-empty-state__tips {
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.conversation-empty-state__tips {
  display: grid;
  gap: var(--bew-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.conversation-empty-state__tips li {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
}

.conversation-empty-state__tips i {
  flex: 0 0 auto;
  color: var(--bew-text-3);
  font-size: var(--bew-icon-size-md);
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-empty-state {
    padding: var(--bew-space-4);
  }
}
</style>
