<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { useTopBarStore } from '~/stores/topBarStore'

import type { MomentForwardEmote, SelectedMomentTopic } from './momentForwardContent'
import {
  insertMomentForwardEmoji,
  momentForwardTokensToText,
  parseMomentForwardTokens,
  resolveForwardCountAfterSuccess,
} from './momentForwardContent'
import MomentForwardEmojiPicker from './MomentForwardEmojiPicker.vue'
import MomentForwardTopicPicker from './MomentForwardTopicPicker.vue'
import type { DisplayMoment } from './types'
import { useMomentForwardComposer } from './useMomentForwardComposer'

const props = defineProps<{
  moment: DisplayMoment
  active: boolean
  forwardCount: number
}>()

const emit = defineEmits<{
  close: []
  submitted: [forwardCount: number]
}>()

const { t } = useI18n()
const toast = useToast()
const topBarStore = useTopBarStore()
const momentRef = toRef(() => props.moment)
const accountId = computed(() => topBarStore.isLogin ? topBarStore.userInfo.mid : '')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const emojiPickerOpen = ref(false)
const topicPickerOpen = ref(false)

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
const draftText = computed(() => momentForwardTokensToText(state.tokens))
const submitting = computed(() => state.status === 'submitting')

function focusTextarea() {
  void nextTick(() => textareaRef.value?.focus())
}

function handleInput(event: Event) {
  if (!(event.target instanceof HTMLTextAreaElement))
    return
  setTokens(parseMomentForwardTokens(event.target.value, knownEmojiTexts.value))
}

function toggleEmojiPicker() {
  if (submitting.value)
    return
  emojiPickerOpen.value = !emojiPickerOpen.value
  topicPickerOpen.value = false
}

function toggleTopicPicker() {
  if (submitting.value)
    return
  topicPickerOpen.value = !topicPickerOpen.value
  emojiPickerOpen.value = false
}

function handleEmojiSelect(emote: MomentForwardEmote) {
  const textarea = textareaRef.value
  const selectionStart = textarea?.selectionStart ?? draftText.value.length
  const selectionEnd = textarea?.selectionEnd ?? selectionStart
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
    textareaRef.value?.focus()
    textareaRef.value?.setSelectionRange(insertion.caret, insertion.caret)
  })
}

function handleTopicSelect(topic: SelectedMomentTopic) {
  selectTopic(topic)
  topicPickerOpen.value = false
  focusTextarea()
}

function handleEscape(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (emojiPickerOpen.value || topicPickerOpen.value) {
    emojiPickerOpen.value = false
    topicPickerOpen.value = false
    focusTextarea()
    return
  }
  emit('close')
}

function handleSubmitShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void handleSubmit()
  }
}

async function handleSubmit() {
  if (submitting.value)
    return
  emojiPickerOpen.value = false
  topicPickerOpen.value = false
  const result = await submit()
  if (!result.applied)
    return
  if (!result.success) {
    toast.error(result.error || t('moment_card.forward_failed'))
    return
  }
  const nextForwardCount = resolveForwardCountAfterSuccess(result.response, props.forwardCount)
  toast.success(t('moment_card.forward_success'))
  emit('submitted', nextForwardCount)
  emit('close')
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      beginEditing()
      focusTextarea()
    }
    else {
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
    emojiPickerOpen.value = false
    topicPickerOpen.value = false
  },
)

watch(accountId, (nextAccountId, previousAccountId) => {
  if (previousAccountId === undefined || nextAccountId === previousAccountId)
    return
  invalidate(true)
  knownEmojiTexts.value = new Set()
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
    <textarea
      ref="textareaRef"
      :value="draftText"
      :placeholder="t('moment_card.forward_placeholder')"
      :disabled="submitting"
      rows="2"
      @input="handleInput"
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
          :disabled="submitting"
          @click="toggleEmojiPicker"
        >
          <span i-tabler-mood-smile aria-hidden="true" />
          {{ t('moment_card.forward_emoji') }}
        </button>
        <button
          type="button"
          :aria-expanded="topicPickerOpen"
          :disabled="submitting"
          @click="toggleTopicPicker"
        >
          <span i-tabler-hash aria-hidden="true" />
          {{ t('moment_card.forward_select_topic') }}
        </button>
      </div>

      <button
        type="button"
        class="moment-forward-composer__submit"
        :disabled="submitting"
        @click="handleSubmit"
      >
        <span v-if="submitting" i-tabler-loader-2 class="bew-spinner" aria-hidden="true" />
        {{ submitting ? t('moment_card.forward_submitting') : t('moment_card.forward') }}
      </button>
    </div>

    <MomentForwardEmojiPicker
      v-if="emojiPickerOpen"
      :account-id="accountId"
      :picker-label="t('moment_card.forward_emoji')"
      :retry-label="t('moment_card.comments_retry')"
      :error-label="t('moment_card.forward_emote_failed')"
      @select="handleEmojiSelect"
      @close="emojiPickerOpen = false"
    />
    <MomentForwardTopicPicker
      v-if="topicPickerOpen"
      :content="draftText"
      :search-placeholder="t('moment_card.forward_search_topic')"
      :empty-label="t('moment_card.forward_topic_empty')"
      :retry-label="t('moment_card.comments_retry')"
      :error-label="t('moment_card.forward_topic_search_failed')"
      @select="handleTopicSelect"
      @close="topicPickerOpen = false"
    />
  </section>
</template>

<style scoped lang="scss">
.moment-forward-composer {
  padding: var(--bew-space-4);
  border-top: 1px solid var(--bew-border-color);
  background: var(--bew-fill-1);
}
.moment-forward-composer textarea {
  display: block;
  field-sizing: content;
  width: 100%;
  min-height: var(--bew-moment-forward-textarea-min-height);
  max-height: var(--bew-moment-forward-textarea-max-height);
  padding: var(--bew-space-3);
  overflow-y: auto;
  resize: none;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  outline: 0;
  color: var(--bew-text-1);
  background: var(--bew-bg);
  font: inherit;
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  box-sizing: border-box;
}
.moment-forward-composer textarea:focus-visible {
  border-color: var(--bew-theme-color);
  box-shadow: 0 0 0 2px var(--bew-theme-color-20);
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
  border-radius: var(--bew-badge-radius);
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
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
  background: var(--bew-theme-color-20);
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
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-3);
}
.moment-forward-composer__tools {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-2);
}
.moment-forward-composer__tools button,
.moment-forward-composer__submit {
  display: inline-flex;
  min-height: var(--bew-control-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-2);
  background: transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
}
.moment-forward-composer__tools button:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}
.moment-forward-composer__tools button[aria-expanded="true"] {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}
.moment-forward-composer__submit {
  flex: 0 0 auto;
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}
.moment-forward-composer__tools button:focus-visible,
.moment-forward-composer__submit:focus-visible,
.moment-forward-composer__topic button:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}
.moment-forward-composer__tools button:disabled,
.moment-forward-composer__submit:disabled,
.moment-forward-composer__topic button:disabled {
  cursor: default;
  opacity: 0.55;
}
</style>
