<script setup lang="ts">
/**
 * EXPERIMENTAL: text send is available only through the explicit DEV test UI; image writes remain unexposed.
 */
import { useI18n } from 'vue-i18n'

import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { PrivateImageDraftState } from './usePrivateMessageWrites'

const props = defineProps<{
  modelValue: string
  sending: boolean
  imageDraft: PrivateImageDraftState | null
  enableImage?: boolean
  testMode?: boolean
}>()

const emit = defineEmits<{
  (event: 'submit'): void
  (event: 'update:modelValue', value: string): void
  (event: 'selectImage', file: File): void
  (event: 'removeImage', localId: string): void
  (event: 'retryImage', localId: string): void
}>()

const { locale, t } = useI18n()
const originalUrl = buildOriginalNotificationUrl('whisper')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isComposing = ref(false)
const canSend = computed(() => !props.sending && !props.imageDraft && Boolean(props.modelValue.trim()))
const canSelectImage = computed(() => props.enableImage && !props.sending && !props.imageDraft)
const imageSize = computed(() => {
  if (!props.imageDraft)
    return ''
  const size = new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(
    props.imageDraft.size / 1024,
  )
  return t('notifications.whisper.messages.image_size_kb', { size })
})
const imageStatus = computed(() => {
  const draft = props.imageDraft
  if (!draft)
    return ''
  if (draft.failureKind === 'upload-failed')
    return t('notifications.whisper.messages.image_upload_failed')
  if (draft.failureKind === 'send-failed')
    return t('notifications.whisper.messages.image_send_failed')
  if (draft.failureKind === 'reconcile-failed')
    return t('notifications.whisper.messages.image_reconcile_failed')
  if (draft.status === 'preparing')
    return t('notifications.whisper.messages.image_preparing')
  if (draft.status === 'uploading')
    return t('notifications.whisper.messages.image_uploading')
  if (draft.status === 'sending')
    return t('notifications.whisper.messages.sending')
  return t('notifications.whisper.messages.reconciling')
})

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

function selectImage(file: File | undefined) {
  if (file && canSelectImage.value && file.type.startsWith('image/'))
    emit('selectImage', file)
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectImage(input.files?.[0])
  input.value = ''
}

function handlePaste(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.files ?? []).find(file => file.type.startsWith('image/'))
  if (!image || !canSelectImage.value)
    return
  event.preventDefault()
  emit('selectImage', image)
}

function openImagePicker() {
  if (canSelectImage.value)
    fileInputRef.value?.click()
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<template>
  <form class="message-composer" @submit.prevent="submit">
    <div v-if="imageDraft" class="message-composer__image-preview" role="status">
      <img
        :src="imageDraft.objectUrl"
        :alt="t('notifications.whisper.messages.selected_image_alt')"
        decoding="async"
      >
      <span class="message-composer__image-copy">
        <strong>{{ imageDraft.fileName }}</strong>
        <span>{{ imageSize }}</span>
        <small>{{ imageStatus }}</small>
      </span>
      <Button
        v-if="imageDraft.status === 'failed'"
        type="tertiary"
        @click="emit('retryImage', imageDraft.localId)"
      >
        {{ t('notifications.whisper.messages.retry_send') }}
      </Button>
      <Tooltip :content="t('notifications.whisper.messages.remove_image')" placement="top">
        <IconButton
          shape="circle"
          :label="t('notifications.whisper.messages.remove_image')"
          @click="emit('removeImage', imageDraft.localId)"
        >
          <i i-mingcute:close-line aria-hidden="true" />
        </IconButton>
      </Tooltip>
    </div>
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
      @paste="handlePaste"
    />
    <div class="message-composer__actions">
      <span>{{ t('notifications.whisper.messages.composer_hint') }}</span>
      <input
        v-if="enableImage"
        ref="fileInputRef"
        class="message-composer__file-input"
        type="file"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        @change="handleFileChange"
      >
      <Tooltip v-if="enableImage" :content="t('notifications.whisper.messages.select_image')" placement="top">
        <IconButton
          shape="circle"
          :label="t('notifications.whisper.messages.select_image')"
          :disabled="!canSelectImage"
          @click="openImagePicker"
        >
          <i i-mingcute:pic-line aria-hidden="true" />
        </IconButton>
      </Tooltip>
      <ALink :href="originalUrl" type="content">
        {{ t('notifications.whisper.messages.send_original') }}
      </ALink>
      <Button native-type="submit" type="primary" :disabled="!canSend">
        <i v-if="sending" i-svg-spinners-ring-resize aria-hidden="true" />
        {{ sending
          ? t('notifications.whisper.messages.sending')
          : t(testMode
            ? 'notifications.whisper.messages.test_send'
            : 'notifications.whisper.messages.send') }}
      </Button>
    </div>
  </form>
</template>

<style scoped lang="scss">
@use "../../../../../styles/breakpoints";

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

.message-composer__image-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: var(--bew-space-2);
  align-items: center;
  min-width: 0;
  padding: var(--bew-space-2);
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.message-composer__image-preview > img {
  width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  object-fit: cover;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
}

.message-composer__image-copy {
  display: grid;
  min-width: 0;
}

.message-composer__image-copy strong,
.message-composer__image-copy span,
.message-composer__image-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-composer__image-copy strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.message-composer__image-copy span,
.message-composer__image-copy small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.message-composer__file-input {
  display: none;
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
