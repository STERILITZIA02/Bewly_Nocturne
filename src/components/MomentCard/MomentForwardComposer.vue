<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useComposerPicker } from '~/composables/useComposerPicker'
import { useTopBarStore } from '~/stores/topBarStore'

import type { MomentForwardEmote, MomentForwardToken, SelectedMomentTopic } from './momentForwardContent'
import {
  findMomentForwardCompletion,
  insertMomentForwardEmoji,
  momentForwardTokensToText,
  parseMomentForwardTokens,
} from './momentForwardContent'
import MomentForwardEmojiPicker from './MomentForwardEmojiPicker.vue'
import MomentForwardTopicPicker from './MomentForwardTopicPicker.vue'
import type { DisplayMoment } from './types'
import { useMomentForwardComposer } from './useMomentForwardComposer'

const props = defineProps<{
  moment: DisplayMoment
  active: boolean
  autofocus?: boolean
}>()

const emit = defineEmits<{
  close: []
  interactionChange: [held: boolean]
}>()

const { t } = useI18n()
const toast = useToast()
const { mainAppRef } = useBewlyApp()
const topBarStore = useTopBarStore()
const momentRef = toRef(() => props.moment)
const accountId = computed(() => topBarStore.isLogin ? topBarStore.userInfo.mid : '')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const emojiPickerOpen = ref(false)
const topicPickerOpen = ref(false)
const completion = ref<ReturnType<typeof findMomentForwardCompletion>>(null)
const completionPickerRef = ref<InstanceType<typeof MomentForwardTopicPicker>>()
const surfaceRef = ref<HTMLElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)
const pickerVisible = computed(() => props.active && Boolean(emojiPickerOpen.value || topicPickerOpen.value || completion.value))
function closePickers() {
  emojiPickerOpen.value = false
  topicPickerOpen.value = false
  completion.value = null
}
useComposerPicker(surfaceRef, pickerRef, pickerVisible, closePickers)

const {
  state,
  beginEditing,
  setTokens,
  selectTopic,
  clearTopic,
  submit,
  invalidate,
} = useMomentForwardComposer(momentRef, accountId, {
  accountUnavailable: t('moment_card.forward_account_unavailable'),
  csrfUnavailable: t('moment_card.forward_csrf_unavailable'),
  momentUnavailable: t('moment_card.forward_moment_unavailable'),
  forwardFailed: t('moment_card.forward_failed'),
})

const knownEmojiTexts = ref(new Set(
  state.tokens.filter(token => token.type === 'emoji').map(token => token.text),
))
const mentions = () => state.tokens.filter((token): token is Extract<MomentForwardToken, { type: 'mention' }> => token.type === 'mention')
const draftText = computed(() => momentForwardTokensToText(state.tokens))
const submitting = computed(() => state.status === 'submitting')
watch(() => props.active && (submitting.value || emojiPickerOpen.value || topicPickerOpen.value || Boolean(completion.value)), held => emit('interactionChange', held), { immediate: true, flush: 'sync' })
onBeforeUnmount(() => emit('interactionChange', false))

function focusTextarea() {
  void nextTick(() => textareaRef.value?.focus({ preventScroll: true }))
}

function handleInput(event: Event) {
  if (!(event.target instanceof HTMLTextAreaElement))
    return
  setTokens(parseMomentForwardTokens(event.target.value, knownEmojiTexts.value, mentions()))
  if (!(event as InputEvent).isComposing)
    updateCompletion()
}

function updateCompletion() {
  const input = textareaRef.value
  completion.value = input && input.selectionStart === input.selectionEnd && props.active && !submitting.value
    ? findMomentForwardCompletion(input.value, input.selectionStart)
    : null
}

function handleKeyup(event: KeyboardEvent) {
  if (!event.isComposing && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
    updateCompletion()
}

function selectCompletion(choice: SelectedMomentTopic) {
  const range = completion.value
  if (!range)
    return
  const text = range.kind === 'mention' ? `@${choice.name}` : `#${choice.name}#`
  const known = mentions()
  if (range.kind === 'mention')
    known.push({ type: 'mention', text, mid: String(choice.id) })
  else
    selectTopic(choice)
  const value = `${draftText.value.slice(0, range.start)}${text} ${draftText.value.slice(range.end)}`
  setTokens(parseMomentForwardTokens(value, knownEmojiTexts.value, known))
  completion.value = null
  void nextTick(() => {
    textareaRef.value?.focus({ preventScroll: true })
    textareaRef.value?.setSelectionRange(range.start + text.length + 1, range.start + text.length + 1)
  })
}

function toggleEmojiPicker() {
  if (submitting.value)
    return
  emojiPickerOpen.value = !emojiPickerOpen.value
  completion.value = null
  topicPickerOpen.value = false
}

function toggleTopicPicker() {
  if (submitting.value)
    return
  topicPickerOpen.value = !topicPickerOpen.value
  completion.value = null
  emojiPickerOpen.value = false
}

function toggleMentionPicker() {
  if (submitting.value)
    return
  if (completion.value?.kind === 'mention') {
    closePickers()
    focusTextarea()
    return
  }
  const start = textareaRef.value?.selectionStart ?? draftText.value.length
  const end = textareaRef.value?.selectionEnd ?? start
  // Preserve token boundaries beside text/emotes, including insertion mid-word.
  const prefix = start > 0 && !/\s/.test(draftText.value[start - 1]) ? ' ' : ''
  const suffix = end < draftText.value.length && !/\s/.test(draftText.value[end]) ? ' ' : ''
  const value = `${draftText.value.slice(0, start)}${prefix}@${suffix}${draftText.value.slice(end)}`
  const caret = start + prefix.length + 1
  closePickers()
  setTokens(parseMomentForwardTokens(value, knownEmojiTexts.value, mentions()))
  void nextTick(() => {
    textareaRef.value?.focus({ preventScroll: true })
    textareaRef.value?.setSelectionRange(caret, caret)
    updateCompletion()
  })
}

function handleEmojiSelect(emote: MomentForwardEmote) {
  const textarea = textareaRef.value
  const selectionStart = textarea?.selectionStart ?? draftText.value.length
  const selectionEnd = textarea?.selectionEnd ?? selectionStart
  if (emote.type === 4) {
    const value = `${draftText.value.slice(0, selectionStart)}${emote.text}${draftText.value.slice(selectionEnd)}`
    setTokens(parseMomentForwardTokens(value, knownEmojiTexts.value, mentions()))
    emojiPickerOpen.value = false
    void nextTick(() => {
      textareaRef.value?.focus({ preventScroll: true })
      textareaRef.value?.setSelectionRange(selectionStart + emote.text.length, selectionStart + emote.text.length)
    })
    return
  }
  knownEmojiTexts.value = new Set(knownEmojiTexts.value).add(emote.text)
  const insertion = insertMomentForwardEmoji(
    state.tokens,
    emote.text,
    selectionStart,
    selectionEnd,
    knownEmojiTexts.value,
  )
  setTokens(insertion.tokens)
  emojiPickerOpen.value = false
  void nextTick(() => {
    textareaRef.value?.focus({ preventScroll: true })
    textareaRef.value?.setSelectionRange(insertion.caret, insertion.caret)
  })
}

function handleTopicSelect(topic: SelectedMomentTopic) {
  selectTopic(topic)
  topicPickerOpen.value = false
  focusTextarea()
}

function handleEscape(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229)
    return
  event.preventDefault()
  event.stopPropagation()
  if (emojiPickerOpen.value || topicPickerOpen.value || completion.value) {
    closePickers()
    focusTextarea()
    return
  }
  emit('close')
}

function handleSubmitShortcut(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229)
    return
  if (event.key === 'ArrowDown' && completion.value) {
    event.preventDefault()
    completionPickerRef.value?.$el?.querySelector('[data-completion-result]')?.focus()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void handleSubmit()
  }
}

async function handleSubmit() {
  if (submitting.value)
    return
  closePickers()
  const result = await submit()
  if (!result.applied)
    return
  if (!result.success) {
    toast.error(result.error || t('moment_card.forward_failed'))
    return
  }
  toast.success(t('moment_card.forward_success'))
  emit('close')
}

watch(
  () => [props.active, props.autofocus] as const,
  ([active, autofocus]) => {
    if (active) {
      beginEditing()
      if (autofocus)
        focusTextarea()
    }
    else {
      completion.value = null
      emojiPickerOpen.value = false
      topicPickerOpen.value = false
    }
  },
  { immediate: true },
)

watch(
  () => props.moment.id,
  () => {
    invalidate(true)
    knownEmojiTexts.value = new Set()
    completion.value = null
    emojiPickerOpen.value = false
    topicPickerOpen.value = false
  },
)

watch(accountId, (nextAccountId, previousAccountId) => {
  if (previousAccountId === undefined || nextAccountId === previousAccountId)
    return
  invalidate(true)
  knownEmojiTexts.value = new Set()
  completion.value = null
  emojiPickerOpen.value = topicPickerOpen.value = false
  emit('close')
})
</script>

<template>
  <section
    class="moment-forward-composer"
    :aria-label="t('moment_card.forward')"
    @keydown="handleSubmitShortcut"
    @keydown.esc="handleEscape"
  >
    <form ref="surfaceRef" class="moment-forward-composer__surface" @submit.prevent="handleSubmit">
      <textarea
        ref="textareaRef"
        :value="draftText"
        :placeholder="t('moment_card.forward_placeholder')"
        :aria-label="t('moment_card.forward_placeholder')"
        :disabled="submitting"
        rows="2"
        @input="handleInput"
        @keyup="handleKeyup"
        @compositionend="updateCompletion"
      />

      <div v-if="state.selectedTopic" class="moment-forward-composer__topic">
        <span>#{{ state.selectedTopic.name }}</span>
        <button
          type="button"
          :aria-label="t('moment_card.forward_clear_topic')"
          :disabled="submitting"
          @click="clearTopic"
        >
          <span i-tabler-x aria-hidden="true" />
        </button>
      </div>

      <p v-if="state.error" class="moment-forward-composer__error" role="alert">
        {{ state.error }}
      </p>

      <div class="moment-forward-composer__toolbar">
        <div class="moment-forward-composer__tools">
          <button
            type="button"
            :aria-expanded="emojiPickerOpen"
            :aria-label="t('moment_card.forward_emoji')"
            :disabled="submitting"
            @click="toggleEmojiPicker"
          >
            <span i-tabler-mood-smile aria-hidden="true" />
          </button>
          <button
            type="button" :aria-expanded="completion?.kind === 'mention'" :aria-label="t('moment_card.forward_search_mention')"
            :disabled="submitting" @click="toggleMentionPicker"
          >
            <span i-tabler-at aria-hidden="true" />
          </button>
          <button
            type="button"
            :aria-expanded="topicPickerOpen"
            :aria-label="t('moment_card.forward_select_topic')"
            :disabled="submitting"
            @click="toggleTopicPicker"
          >
            <span i-tabler-hash aria-hidden="true" />
          </button>
        </div>

        <button
          type="submit"
          class="moment-forward-composer__submit bew-send-button"
          :disabled="submitting"
          :aria-label="t(submitting ? 'moment_card.forward_submitting' : 'moment_card.forward')"
          :aria-busy="submitting"
          :data-bew-send-state="submitting ? 'pending' : 'ready'"
        />
      </div>
    </form>

    <Teleport :to="mainAppRef">
      <div
        v-if="pickerVisible" ref="pickerRef" class="moment-forward-composer__picker" @click.stop @pointerdown.stop
        @keydown="handleSubmitShortcut"
      >
        <MomentForwardTopicPicker
          v-if="completion" ref="completionPickerRef" :kind="completion.kind" :initial-query="completion.query" :autofocus="false"
          :content="draftText" :search-placeholder="t(completion.kind === 'mention' ? 'moment_card.forward_search_mention' : 'moment_card.forward_search_topic')"
          :empty-label="t('moment_card.forward_topic_empty')" :retry-label="t('common.retry')" :error-label="t('moment_card.forward_topic_search_failed')"
          @select="selectCompletion" @close="closePickers(); focusTextarea()"
        />
        <MomentForwardEmojiPicker
          v-if="emojiPickerOpen"
          :account-id="accountId"
          :picker-label="t('moment_card.forward_emoji')"
          :retry-label="t('moment_card.comments_retry')"
          :error-label="t('moment_card.forward_emote_failed')"
          @select="handleEmojiSelect"
          @close="emojiPickerOpen = false; focusTextarea()"
        />
        <MomentForwardTopicPicker
          v-if="topicPickerOpen"
          :content="draftText"
          :search-placeholder="t('moment_card.forward_search_topic')"
          :empty-label="t('moment_card.forward_topic_empty')"
          :retry-label="t('moment_card.comments_retry')"
          :error-label="t('moment_card.forward_topic_search_failed')"
          @select="handleTopicSelect"
          @close="topicPickerOpen = false; focusTextarea()"
        />
      </div>
    </Teleport>
  </section>
</template>

<style scoped lang="scss">
@use "../../styles/composer";
.moment-forward-composer {
  padding: var(--bew-space-4);
  background: transparent;
}
.moment-forward-composer__surface {
  @include composer.surface;
  position: relative;
  min-width: 0;
}
.moment-forward-composer__picker {
  @include composer.picker;
}
.moment-forward-composer textarea {
  @include composer.input;
  overflow-y: auto;
}
.moment-forward-composer textarea:disabled {
  opacity: 0.65;
}
.moment-forward-composer__topic {
  display: inline-flex;
  min-height: var(--bew-control-height-sm);
  align-items: center;
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-2);
  padding-left: var(--bew-space-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.moment-forward-composer__topic button {
  display: grid;
  width: var(--bew-control-height-sm);
  height: var(--bew-control-height-sm);
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: transparent;
  cursor: pointer;
  corner-shape: var(--bew-corner-shape-round);
}
.moment-forward-composer__topic button:hover {
  background: var(--bew-theme-surface-hover);
}
.moment-forward-composer__error {
  margin: var(--bew-space-2) 0 0;
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.moment-forward-composer__toolbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-2);
}
.moment-forward-composer__tools {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-2);
}
.moment-forward-composer__tools button {
  display: inline-flex;
  width: var(--bew-control-height-sm);
  height: var(--bew-control-height-sm);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-2);
  background: transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
}
.moment-forward-composer__tools button:hover {
  color: var(--bew-text-1);
  background: var(--bew-hover-bg);
}
.moment-forward-composer__tools button[aria-expanded="true"] {
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
}
.moment-forward-composer__tools span {
  font-size: var(--bew-icon-size-sm);
}
.moment-forward-composer__tools button:focus-visible,
.moment-forward-composer__submit:focus-visible,
.moment-forward-composer__topic button:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: 2px;
}
.moment-forward-composer__tools button:disabled,
.moment-forward-composer__submit:disabled,
.moment-forward-composer__topic button:disabled {
  cursor: default;
  opacity: 0.55;
}
</style>
