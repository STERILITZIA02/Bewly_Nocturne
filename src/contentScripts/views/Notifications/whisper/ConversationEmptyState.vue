<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="conversation-empty-state">
    <Empty :description="t('notifications.whisper.select_conversation_empty')" />
  </section>
</template>

<style scoped lang="scss">
.conversation-empty-state {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  align-items: center;
  justify-content: center;
  background: transparent;
}
</style>
