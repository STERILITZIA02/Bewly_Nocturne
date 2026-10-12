<script setup lang="ts">
import { onClickOutside, useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { PRIVATE_MESSAGE_IMAGE_ACCEPT, validatePrivateMessageImage } from '~/utils/privateMessageImage'

import PrivateEmotePicker from '../PrivateEmotePicker.vue'
import type { PrivateEmote, PrivateEmotePackage } from '../privateMessageRenderers'
import { insertPrivateEmoteToken } from '../privateMessageRenderers'
import type { PrivateImageDraftState } from './privateMessageWriteTypes'

const props = defineProps<{
  conversationKey?: string
  modelValue: string
  sending: boolean
  imageDraft: PrivateImageDraftState | null
  emotePackages: PrivateEmotePackage[]
  emotesLoading?: boolean
  emotesFailed?: boolean
  enableImage?: boolean
  disabledReason?: string
}>()

const emit = defineEmits<{
  (event: 'submit'): void
  (event: 'submitImage', localId: string): void
  (event: 'update:modelValue', value: string): void
  (event: 'selectImage', file: File): void
  (event: 'removeImage', localId: string): void
  (event: 'retryImage', localId: string): void
  (event: 'loadEmotes'): void
}>()

const { locale, t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const multiline = ref(false)
useResizeObserver(textareaRef, () => {
  const input = textareaRef.value
  if (!input)
    return
  const style = getComputedStyle(input)
  const singleLineHeight = Number.parseFloat(style.lineHeight)
    + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  multiline.value = input.clientHeight > singleLineHeight + 1
})
const fileInputRef = ref<HTMLInputElement | null>(null)
const emoteControlRef = ref<HTMLElement | null>(null)
const isComposing = ref(false)
const emotePickerOpen = ref(false)
const imageValidationError = ref('')
let imagePickerConversationKey = props.conversationKey
watch(() => props.disabledReason, (reason) => {
  if (reason)
    emotePickerOpen.value = false
})
watch(() => props.conversationKey, () => {
  isComposing.value = false
  emotePickerOpen.value = false
  imageValidationError.value = ''
  if (fileInputRef.value)
    fileInputRef.value.value = ''
})
const canSendText = computed(() => !props.disabledReason && !props.sending && Boolean(props.modelValue.trim()))
const canSendImage = computed(() => (
  !props.disabledReason && !props.sending && props.imageDraft?.status === 'ready'
))
const busy = computed(() => props.sending || Boolean(props.imageDraft && ['preparing', 'uploading', 'sending', 'reconciling'].includes(props.imageDraft.status)))
const canSubmit = computed(() => !busy.value && (canSendImage.value || canSendText.value))
const canSelectImage = computed(() => !props.disabledReason && props.enableImage && !props.sending && !props.imageDraft)
const sendState = computed(() => props.disabledReason ? 'blocked' : busy.value ? 'pending' : canSubmit.value ? 'ready' : 'idle')
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
  if (props.disabledReason || busy.value)
    return
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
  if (!file || !canSelectImage.value)
    return
  const error = validatePrivateMessageImage(file)
  imageValidationError.value = error ? t(`notifications.whisper.messages.${error}`) : ''
  if (!error)
    emit('selectImage', file)
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (imagePickerConversationKey === props.conversationKey)
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
  selectImage(image)
}

function openImagePicker() {
  if (canSelectImage.value) {
    imagePickerConversationKey = props.conversationKey
    fileInputRef.value?.click()
  }
}

async function insertEmote(emote: PrivateEmote) {
  if (props.disabledReason)
    return
  const conversationKey = props.conversationKey
  const textarea = textareaRef.value
  const start = textarea?.selectionStart ?? props.modelValue.length
  const end = textarea?.selectionEnd ?? start
  const insertion = insertPrivateEmoteToken(props.modelValue, emote.text, start, end)
  emit('update:modelValue', insertion.value)
  await nextTick()
  if (conversationKey !== props.conversationKey)
    return
  textareaRef.value?.focus()
  textareaRef.value?.setSelectionRange(insertion.cursor, insertion.cursor)
}

function toggleEmotePicker() {
  if (props.disabledReason)
    return
  emotePickerOpen.value = !emotePickerOpen.value
  if (emotePickerOpen.value)
    emit('loadEmotes')
}

function closeEmotePicker() {
  if (!emotePickerOpen.value)
    return
  emotePickerOpen.value = false
  emoteControlRef.value?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
}

onClickOutside(emoteControlRef, () => {
  emotePickerOpen.value = false
})

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<template>
  <form
    class="message-composer"
    :data-expanded="multiline || Boolean(imageDraft) || Boolean(imageValidationError)"
    @keydown.esc.stop="closeEmotePicker"
    @submit.prevent="submitCurrent"
  >
    <span v-if="imageValidationError" class="message-composer__error" role="status">{{ imageValidationError }}</span>
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
        :disabled="Boolean(disabledReason)"
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
        <Tooltip :content="emotePickerOpen ? '' : t('notifications.whisper.messages.select_emote')" placement="top">
          <IconButton
            class="message-composer__action"
            shape="circle"
            :label="t('notifications.whisper.messages.select_emote')"
            :aria-expanded="emotePickerOpen"
            :disabled="Boolean(disabledReason)"
            aria-controls="private-message-emote-picker"
            @click="toggleEmotePicker"
          >
            <i i-mingcute:emoji-line aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <PrivateEmotePicker
          v-if="emotePickerOpen"
          :packages="emotePackages"
          :loading="emotesLoading"
          :failed="emotesFailed"
          @retry="emit('loadEmotes')"
          @close="closeEmotePicker"
          @select="insertEmote"
        />
      </div>

      <input
        v-if="enableImage"
        ref="fileInputRef"
        class="message-composer__file-input"
        type="file"
        :accept="PRIVATE_MESSAGE_IMAGE_ACCEPT"
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

      <div class="message-composer__inputbar" :class="{ 'is-multiline': multiline }">
        <textarea
          ref="textareaRef"
          class="message-composer__input"
          :value="disabledReason ? '' : modelValue"
          :disabled="Boolean(disabledReason)"
          :placeholder="disabledReason || t('notifications.whisper.messages.composer_placeholder')"
          :aria-label="t('notifications.whisper.messages.composer_aria')"
          rows="1"
          @input="updateValue"
          @keydown="handleKeydown"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
          @paste="handlePaste"
        />

        <button
          class="message-composer__send bew-send-button"
          type="submit"
          :disabled="!canSubmit"
          :data-bew-send-state="sendState"
          :aria-busy="sendState === 'pending'"
          :aria-label="disabledReason || t(sending ? 'notifications.whisper.messages.sending' : 'notifications.whisper.messages.send')"
          :title="disabledReason || t('notifications.whisper.messages.send')"
        />
      </div>
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
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: var(--bew-control-height);
  max-height: calc(var(--bew-space-12) * 2);
  padding: calc((var(--bew-control-height) - var(--bew-line-height-control)) / 2) var(--bew-space-2);
  field-sizing: content;
  resize: none;
  color: var(--bew-text-1);
  font-family: var(--bew-font-family);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  background: transparent;
  border: 0;
  border-radius: inherit;
  corner-shape: inherit;
}

.message-composer__error {
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.message-composer__image-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: var(--bew-space-2);
  align-items: center;
  min-width: 0;
  padding: var(--bew-space-2);
  background: var(--bew-fill-1);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
}

.message-composer__image-preview > img {
  width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  object-fit: cover;
  border-radius: var(--bew-radius-sm);
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
  /* The whole input bar provides the shared focus ring. */
  outline: none;
}

.message-composer__inputbar {
  display: flex;
  flex: 1 1 auto;
  align-items: flex-start;
  min-width: 0;
  min-height: var(--bew-message-input-height);
  padding: var(--bew-space-1);
  gap: var(--bew-space-1);
  box-sizing: border-box;
  background: var(--bew-elevated-alt-solid);
  border-radius: calc(var(--bew-message-input-height) / 2);
  corner-shape: var(--bew-corner-shape-round);
  transition:
    border-radius var(--bew-duration-normal) var(--bew-ease-standard),
    corner-shape var(--bew-duration-normal) var(--bew-ease-standard),
    box-shadow var(--bew-duration-fast) var(--bew-ease-standard);
}

.message-composer__inputbar.is-multiline {
  border-radius: var(--bew-radius-xl);
  corner-shape: var(--bew-corner-shape);
}

.message-composer__inputbar.is-multiline .message-composer__send {
  --bew-send-height: auto;
  --bew-send-radius: var(--bew-radius-lg);
  --bew-send-corner-shape: var(--bew-corner-shape);
  align-self: stretch;
}

@media (prefers-reduced-motion: reduce) {
  .message-composer__inputbar {
    transition: none;
  }
}

.message-composer__inputbar:focus-within {
  box-shadow: var(--bew-focus-shadow);
}

.message-composer__actions {
  display: flex;
  grid-row: 1;
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: flex-start;
}

.message-composer__actions .message-composer__action {
  margin-top: var(--bew-space-1);
}

.message-composer__emote-control {
  position: relative;
  display: grid;
}

.message-composer__action {
  flex: 0 0 auto;
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

@media (max-width: breakpoints.$grid-sm) {
  .message-composer__actions {
    gap: var(--bew-space-1);
  }
  .message-composer__actions .message-composer__action {
    width: var(--bew-control-height-sm);
    height: var(--bew-control-height-sm);
    margin-top: var(--bew-space-2);
  }
}
</style>
