<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import IconButton from '~/components/IconButton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useComposerPicker } from '~/composables/useComposerPicker'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'
import type { ReplyPicture } from '~/utils/momentReply'
import { isMomentReplyImage, MOMENT_REPLY_IMAGE_LIMIT, momentReplyTarget, normalizeReplyPicture } from '~/utils/momentReply'

import type { MomentCommentItem } from './commentUtils'
import { normalizeMomentComment } from './commentUtils'
import type { MomentForwardEmote, SelectedMomentTopic } from './momentForwardContent'
import { findMomentForwardCompletion } from './momentForwardContent'
import MomentForwardEmojiPicker from './MomentForwardEmojiPicker.vue'
import MomentForwardTopicPicker from './MomentForwardTopicPicker.vue'

const props = defineProps<{
  oid: string
  type: number
  reply: MomentCommentItem | null
  accountId: string
  sourceUrl: string
}>()
const emit = defineEmits<{ close: [], posted: [reply: unknown], pending: [value: boolean], interaction: [value: boolean] }>()
const { t } = useI18n()
const { mainAppRef } = useBewlyApp()
const topBar = useTopBarStore()
const panel = ref<HTMLElement | null>(null)
const textarea = ref<HTMLTextAreaElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const pickerPanel = ref<HTMLElement | null>(null)
const focused = ref(false)

const text = ref('')
const mentions = new Map<string, string>()
const picker = ref<'emoji' | 'mention' | null>(null)
const completion = ref<ReturnType<typeof findMomentForwardCompletion>>(null)
const selection = ref({ start: 0, end: 0 })
const sync = ref(false)
const pending = ref(false)
const addingImages = ref(false)
const uncertain = ref(false)
const error = ref('')
const pictures = ref<{ file: File, url: string, uploaded?: ReplyPicture }[]>([])
const richComment = computed(() => !props.reply)
const relation = computed(() => momentReplyTarget(props.reply))
const title = computed(() => props.reply ? t('moment_card.reply_to', { name: props.reply.author.name }) : t('moment_card.reply_new'))
const accountCurrent = () => topBar.isLogin && String(topBar.userInfo.mid) === props.accountId && String(getUserID() ?? '') === props.accountId
const canSubmit = computed(() => Boolean(text.value.trim()) && !pending.value && !addingImages.value && !uncertain.value)
let alive = true
const editLocked = computed(() => pending.value || addingImages.value || uncertain.value)
watch(() => Boolean(text.value || pictures.value.length || props.reply || picker.value || focused.value || editLocked.value), value => emit('interaction', value), { flush: 'sync' })

// Only the auxiliary picker escapes the card. The editor stays in its layout.
useComposerPicker(panel, pickerPanel, computed(() => Boolean(picker.value)), () => {
  picker.value = null
  completion.value = null
})

function focusInput() {
  if (editLocked.value)
    return false
  void nextTick(() => textarea.value?.focus({ preventScroll: true }))
  return true
}
defineExpose({ focus: focusInput })
watch(() => props.reply, () => {
  picker.value = null
  completion.value = null
  error.value = ''
})

function rememberSelection() {
  if (textarea.value)
    selection.value = { start: textarea.value.selectionStart, end: textarea.value.selectionEnd }
}

function updateCompletion(event?: Event) {
  rememberSelection()
  if (pending.value || uncertain.value || (event as InputEvent | undefined)?.isComposing || (event as KeyboardEvent | undefined)?.key === 'Escape')
    return
  const candidate = findMomentForwardCompletion(text.value, selection.value.start)
  completion.value = candidate?.kind === 'mention' && selection.value.start === selection.value.end ? candidate : null
  if (completion.value)
    picker.value = 'mention'
  else if (picker.value === 'mention')
    picker.value = null
}

function insert(value: string, start = selection.value.start, end = selection.value.end) {
  text.value = text.value.slice(0, start) + value + text.value.slice(end)
  picker.value = null
  completion.value = null
  void nextTick(() => {
    textarea.value?.focus({ preventScroll: true })
    textarea.value?.setSelectionRange(start + value.length, start + value.length)
    rememberSelection()
  })
}

function selectMention(person: SelectedMomentTopic) {
  mentions.set(person.name, String(person.id))
  insert(`@${person.name} `, completion.value?.start, completion.value?.end)
}

function selectEmoji(emote: MomentForwardEmote) {
  insert(emote.text)
}

function togglePicker(next: 'emoji' | 'mention') {
  rememberSelection()
  completion.value = null
  picker.value = picker.value === next ? null : next
}

function closePicker() {
  picker.value = null
  completion.value = null
  void nextTick(() => textarea.value?.focus({ preventScroll: true }))
}

function removePicture(index: number) {
  if (pending.value)
    return
  const removed = pictures.value.splice(index, 1)[0]
  if (removed)
    URL.revokeObjectURL(removed.url)
}

async function addImages(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (pending.value || addingImages.value || !richComment.value)
    return
  error.value = ''
  if (files.length + pictures.value.length > MOMENT_REPLY_IMAGE_LIMIT) {
    error.value = t('moment_card.reply_image_limit')
    return
  }
  addingImages.value = true
  try {
    for (const file of files) {
      if (!isMomentReplyImage(file))
        throw new Error(t('moment_card.reply_image_invalid'))
      const bitmap = await createImageBitmap(file)
      const valid = bitmap.width >= 10 && bitmap.height >= 10
      bitmap.close()
      if (!valid)
        throw new Error(t('moment_card.reply_image_invalid'))
      if (!alive || !accountCurrent())
        return
      pictures.value.push({ file, url: URL.createObjectURL(file) })
    }
  }
  catch (cause) {
    if (alive)
      error.value = cause instanceof Error ? cause.message : t('moment_card.reply_image_invalid')
  }
  finally { addingImages.value = false }
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error(t('moment_card.reply_image_invalid')))
    reader.readAsDataURL(file)
  })
}

async function submit() {
  if (!canSubmit.value)
    return
  error.value = ''
  if (!accountCurrent() || !getCSRF()) {
    error.value = t('moment_card.forward_account_unavailable')
    return
  }
  pending.value = true
  picker.value = null
  emit('pending', true)
  const current = () => alive && accountCurrent()
  try {
    const identity = { accountId: props.accountId, csrf: getCSRF()! }
    for (const picture of richComment.value ? pictures.value : []) {
      if (picture.uploaded)
        continue
      const base64 = await readBase64(picture.file)
      if (!current() || document.hidden)
        return
      const response = await api.moment.uploadMomentReplyImage({ ...identity, base64, mimeType: picture.file.type, fileName: picture.file.name })
      if (!current())
        return
      const uploaded = response?.code === 0 ? normalizeReplyPicture(response.data) : null
      if (!uploaded)
        throw new Error(response?.message || t('moment_card.reply_upload_failed'))
      picture.uploaded = uploaded
    }
    if (!current() || document.hidden)
      return
    let response
    try {
      response = await api.moment.submitMomentReply({
        ...identity,
        oid: props.oid,
        type: props.type,
        root: relation.value.root,
        parent: relation.value.parent,
        message: relation.value.prefix + text.value,
        mentions: Object.fromEntries(mentions),
        pictures: richComment.value ? pictures.value.map(picture => picture.uploaded!) : [],
        syncToDynamic: richComment.value && sync.value,
      })
    }
    catch { response = { bewlyReplyUncertain: true } }
    if (!current())
      return
    if (response?.bewlyReplyUncertain || (response?.code === 0 && !normalizeMomentComment(response?.data?.reply)?.rpid)) {
      uncertain.value = true
      error.value = t('moment_card.reply_uncertain')
    }
    else if (response?.code !== 0) {
      error.value = response?.message || t('moment_card.reply_failed')
    }
    else {
      text.value = ''
      mentions.clear()
      pictures.value.forEach(picture => URL.revokeObjectURL(picture.url))
      pictures.value = []
      sync.value = false
      selection.value = { start: 0, end: 0 }
      emit('posted', response.data.reply)
      emit('close')
    }
  }
  catch (cause) {
    if (current())
      error.value = cause instanceof Error ? cause.message : t('moment_card.reply_failed')
  }
  finally {
    pending.value = false
    if (alive)
      emit('pending', false)
  }
}

function close() {
  if (!editLocked.value && props.reply)
    emit('close')
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229)
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (picker.value) {
      closePicker()
    }
    else { close() }
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    void submit()
  }
}
onBeforeUnmount(() => {
  alive = false
  pictures.value.forEach(picture => URL.revokeObjectURL(picture.url))
  emit('pending', false)
  emit('interaction', false)
})
</script>

<template>
  <section
    ref="panel" class="moment-reply" :aria-label="title" @keydown="keydown"
    @focusin="focused = true" @focusout="focused = false"
    @click.stop @pointerdown.stop
  >
    <header v-if="reply" class="moment-reply__header">
      <span>
        {{ title }}
      </span>
      <IconButton class="moment-reply__tool" :disabled="editLocked" :label="t('moment_card.reply_cancel_target')" @click="close(); focusInput()">
        <i i-tabler-x aria-hidden="true" />
      </IconButton>
    </header>
    <form @submit.prevent="submit">
      <textarea
        ref="textarea" v-model="text" :aria-label="title" :placeholder="reply ? '' : title" :disabled="pending"
        :readonly="uncertain"
        rows="2" @input="updateCompletion" @keyup="updateCompletion" @click="updateCompletion" @select="rememberSelection"
        @compositionend="updateCompletion"
      />
      <div v-if="richComment && pictures.length" class="moment-reply__pictures">
        <div v-for="(picture, index) in pictures" :key="picture.url">
          <img :src="picture.url" :alt="picture.file.name">
          <IconButton class="moment-reply__remove" shape="smooth-rect" :disabled="pending" :label="t('moment_card.reply_remove_image')" @click="removePicture(index)">
            <i i-tabler-x aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div class="moment-reply__tools">
        <IconButton class="moment-reply__tool" :disabled="pending || uncertain" :label="t('moment_card.reply_emoji')" :aria-expanded="picker === 'emoji'" @click="togglePicker('emoji')">
          <i i-tabler-mood-smile aria-hidden="true" />
        </IconButton>
        <IconButton class="moment-reply__tool" :disabled="pending || uncertain" :label="t('moment_card.reply_mention')" :aria-expanded="picker === 'mention'" @click="togglePicker('mention')">
          <i i-tabler-at aria-hidden="true" />
        </IconButton>
        <IconButton v-if="richComment" class="moment-reply__tool" :disabled="pending || addingImages || uncertain" :label="t('moment_card.reply_image')" @click="imageInput?.click()">
          <i i-tabler-photo aria-hidden="true" />
        </IconButton>
        <input
          ref="imageInput" type="file" accept="image/jpeg,image/png" multiple hidden
          @change="addImages"
        >
        <button
          v-if="richComment" type="button" class="moment-reply__sync" :aria-pressed="sync"
          :disabled="pending || uncertain" @click="sync = !sync"
        >
          <span>{{ t('moment_card.reply_sync') }}</span>
          <i class="moment-reply__sync-check" i-tabler-check aria-hidden="true" />
        </button>
        <button type="submit" class="bew-send-button" :disabled="!canSubmit" :aria-label="t('moment_card.reply_send')" :data-bew-send-state="pending ? 'pending' : canSubmit ? 'ready' : 'idle'" />
      </div>
    </form>
    <Teleport :to="mainAppRef">
      <div v-if="picker" ref="pickerPanel" class="moment-reply__picker" @click.stop @pointerdown.stop>
        <MomentForwardEmojiPicker
          v-if="picker === 'emoji'" :account-id="accountId" business="reply" :picker-label="t('moment_card.reply_emoji')" :retry-label="t('common.retry')"
          :error-label="t('moment_card.reply_picker_failed')" @select="selectEmoji" @close="closePicker"
        />
        <MomentForwardTopicPicker
          v-if="picker === 'mention'" :content="text" kind="reply-mention" :initial-query="completion?.query || ''" :autofocus="!completion"
          :search-placeholder="t('moment_card.reply_mention')" :empty-label="t('moment_card.reply_no_users')" :retry-label="t('common.retry')" :error-label="t('moment_card.reply_picker_failed')" @select="selectMention"
          @close="closePicker"
        />
      </div>
    </Teleport>
    <p v-if="addingImages" class="bew-help" role="status">
      {{ t('common.loading') }}
    </p>
    <p v-if="error" class="moment-reply__error" role="alert">
      {{ error }}
    </p>
    <a v-if="error" :href="sourceUrl" target="_blank" rel="noopener noreferrer">{{ t('moment_card.reply_check_original') }}</a>
  </section>
</template>

<style scoped lang="scss">
@use "../../styles/composer";
.moment-reply {
  @include composer.surface;
  position: relative;
  width: 100%;
  max-height: min(40dvh, var(--bew-moment-comments-max-height));
  overflow-y: auto;
  overscroll-behavior: contain;
  container-type: inline-size;
}
.moment-reply__picker {
  @include composer.picker;
}
.moment-reply__header,
.moment-reply__tools {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}
.moment-reply__header {
  justify-content: space-between;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}
.moment-reply__header span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.moment-reply textarea {
  @include composer.input;
}
.moment-reply__tools {
  margin-top: var(--bew-space-2);
  flex-wrap: wrap;
}
.moment-reply__tool {
  @include composer.tool;
}
.moment-reply__sync {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  min-height: var(--bew-control-height-sm);
  padding-inline: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  font-size: var(--bew-font-size-caption);
  color: var(--bew-text-3);
  background: transparent;
  transition: color var(--bew-duration-fast) ease;
}
.moment-reply__sync:disabled {
  opacity: 0.5;
  cursor: default;
}
.moment-reply__sync[aria-pressed="true"] {
  color: var(--bew-text-1);
}
.moment-reply .moment-reply__sync:not(:disabled):hover {
  color: var(--bew-text-1);
}
.moment-reply__sync-check {
  flex: 0 0 var(--bew-icon-size-sm);
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
  opacity: 0;
  clip-path: inset(0 100% 0 0);
  transition:
    clip-path var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) ease;
}
.moment-reply__sync[aria-pressed="true"] .moment-reply__sync-check {
  opacity: 1;
  clip-path: inset(0);
}
@media (prefers-reduced-motion: reduce) {
  .moment-reply__sync-check {
    clip-path: none;
    transition: opacity var(--bew-duration-fast) ease;
  }
}
.moment-reply .bew-send-button {
  margin-inline-start: auto !important;
}
.moment-reply__pictures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-2);
}
.moment-reply__pictures > div {
  position: relative;
  width: var(--bew-moment-reply-image-size);
  height: var(--bew-moment-reply-image-size);
}
.moment-reply__pictures img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--bew-thumb-radius);
}
// In the thumbnail's corner, concentric with it: thumb radius 12 − inset 4 = 8.
.moment-reply__remove {
  @include composer.attachment-remove;
  position: absolute;
  top: var(--bew-space-1);
  right: var(--bew-space-1);
  border-radius: var(--bew-interactive-radius);
}
.moment-reply__error {
  margin-top: var(--bew-space-2);
  color: var(--bew-error-foreground);
  font-size: var(--bew-font-size-control);
}
.moment-reply > a {
  color: var(--bew-theme-foreground);
  font-size: var(--bew-font-size-control);
}
</style>
