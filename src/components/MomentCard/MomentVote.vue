<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { computed, onBeforeUnmount, reactive, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { normalizeIntlLocale } from '~/utils/locale'
import { getCSRF, getUserID } from '~/utils/main'
import { createMomentVoteController, createMomentVoteState, isMomentVoteEnded } from '~/utils/momentVote'

import { getMomentThumbnailUrl } from './utils'

const props = defineProps<{
  voteId: string
  momentId: string
  fallbackTitle: string
  fallbackEndTime: number
}>()
const emit = defineEmits<{ interactiveResize: [] }>()
const { t, locale } = useI18n()
const topBarStore = useTopBarStore()
const state = reactive(createMomentVoteState())
const groupId = useId()
const now = useNow({ interval: 30_000 })
const identity = () => `${topBarStore.userInfo.mid || 'guest'}:${getUserID() ?? 'guest'}:${props.momentId}:${props.voteId}`
const voterId = () => Number(getUserID())
const controller = createMomentVoteController({
  state,
  getIdentity: identity,
  getEndTime: () => props.fallbackEndTime,
  isLoggedIn: () => Boolean(getCSRF()) && Number.isSafeInteger(voterId()) && voterId() > 0,
  fetchVote: () => api.moment.getMomentVote({ vote_id: props.voteId }),
  submitVote: (votes) => {
    const voteId = Number(props.voteId)
    if (!Number.isSafeInteger(voteId) || voteId <= 0)
      throw new Error('Invalid vote id')
    const csrf = getCSRF() || ''
    return api.moment.submitMomentVote({
      vote_id: voteId,
      votes,
      voter_uid: voterId(),
      status: 0,
      op_bit: 0,
      dynamic_id: props.momentId,
      csrf,
      csrf_token: csrf,
    })
  },
})
const ended = computed(() => isMomentVoteEnded(state.info, props.fallbackEndTime, now.value.getTime() / 1000))
const showResults = computed(() => ended.value || controller.hasVoted())
const locked = computed(() => showResults.value || state.submitting || state.loading)
const deadline = computed(() => {
  const endTime = state.info?.endTime || props.fallbackEndTime
  return endTime
    ? new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(endTime * 1000))
    : ''
})
function percentage(count: number) {
  return state.info?.total ? Math.min(100, Math.max(0, count / state.info.total * 100)) : 0
}
function select(event: Event, index: number) {
  controller.select(index)
  // A rejected multi-select at the limit must also reset the native input.
  ;(event.target as HTMLInputElement).checked = state.selected.includes(index)
}
watch(identity, () => {
  controller.invalidate()
  void controller.load()
}, { immediate: true, flush: 'sync' })
watch(() => [state.info, state.loading, state.submitting, state.loadError, state.submitError, showResults.value], () => {
  emit('interactiveResize')
}, { flush: 'sync' })
onBeforeUnmount(controller.invalidate)
</script>

<template>
  <section class="moment-vote" :aria-busy="state.loading || state.submitting" @click.stop>
    <strong :id="groupId" class="moment-vote__title">{{ state.info?.title || fallbackTitle }}</strong>
    <p v-if="state.loading" class="moment-vote__meta" role="status">
      {{ t('moments.vote_loading') }}
    </p>
    <p v-if="state.loadError" class="moment-vote__error" role="alert">
      {{ t('moments.vote_load_failed') }}
      <button type="button" :disabled="state.loading || state.submitting" @click="controller.load">
        {{ t('moment_card.comments_retry') }}
      </button>
    </p>
    <template v-if="state.info">
      <p v-if="!showResults" class="moment-vote__meta">
        {{ t('moments.vote_select_up_to', { count: state.info.choiceCount }) }}
      </p>
      <div class="moment-vote__options" :role="state.info.choiceCount === 1 ? 'radiogroup' : 'group'" :aria-labelledby="groupId">
        <label v-for="option in state.info.options" :key="option.index" class="moment-vote__option" :class="{ 'is-selected': state.selected.includes(option.index), 'is-locked': locked }">
          <span v-if="showResults" class="moment-vote__fill" :style="{ width: `${percentage(option.count)}%` }" aria-hidden="true" />
          <img
            v-if="option.imageUrl" class="moment-vote__image" :src="getMomentThumbnailUrl(option.imageUrl, 320)" alt="" loading="lazy"
            decoding="async"
          >
          <span class="moment-vote__option-body">
            <input
              :type="state.info.choiceCount === 1 ? 'radio' : 'checkbox'"
              :name="groupId"
              :value="option.index"
              :checked="state.selected.includes(option.index)"
              :disabled="locked"
              @change="select($event, option.index)"
            >
            <span>{{ option.text || t('moments.vote_image_option', { index: option.index }) }}</span>
            <span v-if="showResults" class="moment-vote__percentage">{{ percentage(option.count).toFixed(1) }}%</span>
          </span>
        </label>
      </div>
      <p class="moment-vote__meta">
        {{ t('moments.vote_participants', { count: state.info.total }) }}
        <template v-if="deadline">
          · {{ t('moments.vote_deadline', { time: deadline }) }}
        </template>
        · {{ ended ? t('moments.vote_ended') : controller.hasVoted() ? t('moments.vote_submitted') : t('moments.vote_ongoing') }}
      </p>
      <p v-if="state.submitError" class="moment-vote__error" role="alert">
        {{ t(state.submitError === 'login' ? 'moments.login_to_vote' : 'moments.vote_submit_failed') }}
      </p>
      <button v-if="!showResults" type="button" class="moment-vote__submit" :disabled="locked || !state.selected.length" @click="controller.submit">
        {{ state.submitting ? t('moments.vote_submitting') : t('moments.vote_submit') }}
      </button>
    </template>
  </section>
</template>

<style scoped lang="scss">
.moment-vote {
  // MomentCard's surface passes clicks through to its primary action by default.
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  padding: 0 var(--bew-space-4) var(--bew-space-3);
  color: var(--bew-text-1);
  cursor: default;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.moment-vote p {
  margin: 0;
}
.moment-vote__title {
  font-weight: var(--bew-font-weight-semibold);
  overflow-wrap: anywhere;
}
.moment-vote__meta,
.moment-vote__error {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.moment-vote__options {
  display: grid;
  gap: var(--bew-space-2);
}
.moment-vote__option {
  position: relative;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  cursor: pointer;
}
.moment-vote__option:not(.is-locked):hover {
  background: var(--bew-fill-2);
}
.moment-vote__option:not(.is-locked):active {
  background: var(--bew-theme-color-10);
}
.moment-vote__option.is-selected {
  border-color: var(--bew-theme-color);
}
.moment-vote__option.is-locked {
  cursor: default;
}
.moment-vote__option:has(:focus-visible) {
  outline: var(--bew-space-0-5) solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
.moment-vote__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--bew-theme-color-10);
  pointer-events: none;
}
.moment-vote__image {
  position: relative;
  display: block;
  width: 100%;
  max-height: 160px;
  object-fit: contain;
}
.moment-vote__option-body {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2) var(--bew-space-3);
  box-sizing: border-box;
  overflow-wrap: anywhere;
}
.moment-vote input {
  flex: none;
  margin: 0;
  accent-color: var(--bew-theme-color);
}
.moment-vote__percentage {
  margin-left: auto;
  flex: none;
  font-variant-numeric: tabular-nums;
}
.moment-vote button {
  min-height: var(--bew-control-height);
  padding: var(--bew-space-1) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  font: inherit;
  font-weight: var(--bew-font-weight-medium);
  cursor: pointer;
}
.moment-vote__submit {
  align-self: flex-start;
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}
.moment-vote__error button {
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
}
.moment-vote button:hover:not(:disabled) {
  filter: brightness(0.95);
}
.moment-vote button:active:not(:disabled) {
  filter: brightness(0.9);
}
.moment-vote button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
