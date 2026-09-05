<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import PrivateEmotePicker from '../PrivateEmotePicker.vue'
import type { PrivateEmote, PrivateEmotePackage } from '../privateMessageRenderers'
import { insertPrivateEmoteToken } from '../privateMessageRenderers'
import type { PrivateImageDraftState } from './privateMessageWriteTypes'

const props = defineProps<{
  modelValue: string
  sending: boolean
  imageDraft: PrivateImageDraftState | null
  emotePackages: PrivateEmotePackage[]
  enableImage?: boolean
}>()

const emit = defineEmits<{
  (event: 'submit'): void
  (event: 'submitImage', localId: string): void
  (event: 'update:modelValue', value: string): void
  (event: 'selectImage', file: File): void
  (event: 'removeImage', localId: string): void
  (event: 'retryImage', localId: string): void
}>()

const { locale, t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const emoteControlRef = ref<HTMLElement | null>(null)
const isComposing = ref(false)
const emotePickerOpen = ref(false)
const canSendText = computed(() => !props.sending && Boolean(props.modelValue.trim()))
const canSendImage = computed(() => (
  !props.sending && props.imageDraft?.status === 'ready'
))
const canSubmit = computed(() => canSendImage.value || canSendText.value)
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
  if (draft.status === 'ready')
    return t('notifications.whisper.messages.image_ready')
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

function submitText() {
  if (canSendText.value)
    emit('submit')
}

function submitCurrent() {
  const draft = props.imageDraft
  if (draft?.status === 'ready' && canSendImage.value) {
    emit('submitImage', draft.localId)
    return
  }
  submitText()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || isComposing.value)
    return
  event.preventDefault()
  submitCurrent()
}

function selectImage(file: File | undefined) {
  if (file && canSelectImage.value && file.type.startsWith('image/') && file.size > 0)
    emit('selectImage', file)
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectImage(input.files?.[0])
  input.value = ''
}

function handlePaste(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.files ?? []).find(file => (
    file.type.startsWith('image/') && file.size > 0
  ))
  if (!image || !canSelectImage.value)
    return
  event.preventDefault()
  emit('selectImage', image)
}

function openImagePicker() {
  if (canSelectImage.value)
    fileInputRef.value?.click()
}

async function insertEmote(emote: PrivateEmote) {
  const textarea = textareaRef.value
  const start = textarea?.selectionStart ?? props.modelValue.length
  const end = textarea?.selectionEnd ?? start
  const insertion = insertPrivateEmoteToken(props.modelValue, emote.text, start, end)
  emit('update:modelValue', insertion.value)
  await nextTick()
  textareaRef.value?.focus()
  textareaRef.value?.setSelectionRange(insertion.cursor, insertion.cursor)
}

onClickOutside(emoteControlRef, () => {
  emotePickerOpen.value = false
})

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<template>
  <form
    class="message-composer"
    @keydown.esc.stop="emotePickerOpen = false"
    @submit.prevent="submitCurrent"
  >
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
          class="message-composer__action"
          shape="circle"
          :label="t('notifications.whisper.messages.remove_image')"
          @click="emit('removeImage', imageDraft.localId)"
        >
          <i i-mingcute:close-line aria-hidden="true" />
        </IconButton>
      </Tooltip>
    </div>

    <div class="message-composer__actions">
      <div ref="emoteControlRef" class="message-composer__emote-control">
        <Tooltip :content="t('notifications.whisper.messages.select_emote')" placement="top">
          <IconButton
            class="message-composer__action"
            shape="circle"
            :label="t('notifications.whisper.messages.select_emote')"
            :aria-expanded="emotePickerOpen"
            aria-controls="private-message-emote-picker"
            @click="emotePickerOpen = !emotePickerOpen"
          >
            <i i-mingcute:emoji-line aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <PrivateEmotePicker
          v-if="emotePickerOpen"
          :packages="emotePackages"
          @close="emotePickerOpen = false"
          @select="insertEmote"
        />
      </div>

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
          class="message-composer__action"
          shape="circle"
          :label="t('notifications.whisper.messages.select_image')"
          :disabled="!canSelectImage"
          @click="openImagePicker"
        >
          <i i-mingcute:pic-line aria-hidden="true" />
        </IconButton>
      </Tooltip>

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

      <Tooltip :content="t('notifications.whisper.messages.send')" placement="top">
        <IconButton
          class="message-composer__action message-composer__send"
          shape="circle"
          :label="t('notifications.whisper.messages.send')"
          :disabled="!canSubmit"
          @click="submitCurrent"
        >
          <i v-if="sending" i-svg-spinners-ring-resize aria-hidden="true" />
          <i v-else i-mingcute:send-plane-line aria-hidden="true" />
        </IconButton>
      </Tooltip>
    </div>
  </form>
</template>

<style scoped lang="scss">
.message-composer {
  display: grid;
  gap: var(--bew-space-2);
  width: 100%;
  min-width: 0;
}

.message-composer__input {
  box-sizing: border-box;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  max-height: calc(var(--bew-space-12) * 2);
  padding: var(--bew-space-2) var(--bew-space-3);
  resize: none;
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

.message-composer__emote-control {
  position: relative;
  display: grid;
}

.message-composer__action {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
}

.message-composer__action:hover:not(:disabled) {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.message-composer__action i {
  font-size: var(--bew-icon-size-md);
}

.message-composer__send {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}

.message-composer__send:hover:not(:disabled) {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  filter: brightness(1.05);
}
</style>
