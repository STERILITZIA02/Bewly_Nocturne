<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  src: string
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const { t } = useI18n()
</script>

<template>
  <Dialog
    append-to-bewly-body
    content-flush
    :show-footer="false"
    :title="t('notifications.whisper.messages.image_preview')"
    width="min(90vw, calc(var(--bew-space-12) * 16))"
    max-width="90vw"
    content-max-height="80vh"
    @close="emit('close')"
  >
    <div class="private-message-image-viewer">
      <img :src="src" :alt="t('notifications.whisper.messages.image_alt')">
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.private-message-image-viewer {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--bew-homepage-bg);
}

.private-message-image-viewer img {
  display: block;
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
}
</style>
