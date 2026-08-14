<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

const props = defineProps<{
  modelValue: string
  sending: boolean
}>()

const emit = defineEmits<{
  (event: 'submit'): void
  (event: 'update:modelValue', value: string): void
}>()

const { t } = useI18n()
const originalUrl = buildOriginalNotificationUrl('whisper')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isComposing = ref(false)
const canSend = computed(() => !props.sending && Boolean(props.modelValue.trim()))

function updateValue(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function submit() {
  if (canSend.value)
    emit('submit')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || isComposing.value)
    return
  event.preventDefault()
  submit()
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<template>
  <form class="message-composer" @submit.prevent="submit">
    <textarea
      ref="textareaRef"
      class="message-composer__input"
      :value="modelValue"
      :placeholder="t('notifications.whisper.messages.composer_placeholder')"
      :aria-label="t('notifications.whisper.messages.composer_aria')"
      rows="2"
      @input="updateValue"
      @keydown="handleKeydown"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
    />
    <div class="message-composer__actions">
      <span>{{ t('notifications.whisper.messages.composer_hint') }}</span>
      <ALink :href="originalUrl" type="content">
        {{ t('notifications.whisper.messages.send_original') }}
      </ALink>
      <Button native-type="submit" type="primary" :disabled="!canSend">
        <i v-if="sending" i-svg-spinners-ring-resize aria-hidden="true" />
        {{ sending
          ? t('notifications.whisper.messages.sending')
          : t('notifications.whisper.messages.send') }}
      </Button>
    </div>
  </form>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.message-composer {
  display: grid;
  gap: var(--bew-space-2);
  width: 100%;
  min-width: 0;
}

.message-composer__input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-height: calc(var(--bew-space-12) * 3);
  padding: var(--bew-space-2) var(--bew-space-3);
  resize: vertical;
  color: var(--bew-text-1);
  font: inherit;
  line-height: var(--bew-line-height-body);
  background: var(--bew-content-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.message-composer__input::placeholder {
  color: var(--bew-text-3);
}

.message-composer__input:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.message-composer__actions {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: center;
}

.message-composer__actions > span {
  min-width: 0;
  margin-right: auto;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.message-composer__actions a {
  flex: 0 0 auto;
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
}

@media (max-width: breakpoints.$mobile-max) {
  .message-composer__actions > span {
    display: none;
  }
}
</style>
