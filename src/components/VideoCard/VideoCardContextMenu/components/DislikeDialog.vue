<script lang="ts" setup>
import { onKeyStroke } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Dialog from '~/components/Dialog.vue'
import type { Video } from '~/components/VideoCard/types'
import { getRecommendationRequestIdentity } from '~/logic/recommendationMode'
import type { DislikeReason } from '~/models/video/appForYou'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import type { AppFeedFeedbackSelection, AppFeedFeedbackType } from '~/utils/appFeedFeedback'
import { getAppFeedFeedbackReasonKey, getAppFeedFeedbackTarget, isSameAppFeedFeedbackTarget, submitAppFeedFeedback } from '~/utils/appFeedFeedback'
import { captureAppAuth, ensureFreshAppAccessToken } from '~/utils/authProvider'

const props = defineProps<{
  modelValue: boolean
  video: Video
}>()

const emit = defineEmits<{
  (event: 'removed', selectedOpt: AppFeedFeedbackSelection): void
  (event: 'close'): void
}>()

const showDislikeDialog = defineModel<boolean>()

const toast = useToast()
const { t } = useI18n()

const loadingDislikeDialog = ref<boolean>(false)
interface SelectableReason {
  key: string
  type: AppFeedFeedbackType
  reason: DislikeReason
}

const selectedOptionKey = ref<string>()
const emptyReasons: DislikeReason[] = []

const dislikeReasons = computed(() => props.video?.threePointV2?.find(option => option.type === ThreePointV2Type.Dislike)?.reasons || emptyReasons)
const feedbackReasons = computed(() => props.video?.threePointV2?.find(option => option.type === ThreePointV2Type.Feedback)?.reasons || emptyReasons)
const toSelectableReason = (type: AppFeedFeedbackType) => (reason: DislikeReason): SelectableReason => ({ key: getAppFeedFeedbackReasonKey(type, reason), type, reason })
const selectableOptions = computed<SelectableReason[]>(() => [
  ...dislikeReasons.value.map(toSelectableReason(ThreePointV2Type.Dislike)),
  ...feedbackReasons.value.map(toSelectableReason(ThreePointV2Type.Feedback)),
])

watch([
  () => JSON.stringify([getAppFeedFeedbackTarget(props.video), props.video.recommendationRequestIdentity]),
  dislikeReasons,
  feedbackReasons,
  () => JSON.stringify(selectableOptions.value.map(option => option.key)),
  showDislikeDialog,
], () => {
  selectedOptionKey.value = selectableOptions.value[0]?.key
}, { immediate: true, flush: 'sync' })

function selectOption(type: AppFeedFeedbackType, reason: DislikeReason) {
  selectedOptionKey.value = getAppFeedFeedbackReasonKey(type, reason)
}

function isSelected(type: AppFeedFeedbackType, reason: DislikeReason) {
  return selectedOptionKey.value === getAppFeedFeedbackReasonKey(type, reason)
}

function getSelectedPayload(): AppFeedFeedbackSelection | undefined {
  const option = selectableOptions.value.find(option => option.key === selectedOptionKey.value)
  if (!option)
    return undefined

  const { id, mid, rid, tag_id } = option.reason
  return {
    ...(option.type === ThreePointV2Type.Feedback ? { feedbackId: id } : { reasonId: id }),
    mid,
    rid,
    tag_id,
  }
}

function closeDislikeDialog() {
  showDislikeDialog.value = false
  emit('close')
}

async function handleAppDislike() {
  if (loadingDislikeDialog.value)
    return
  const selectedPayload = getSelectedPayload()
  const selectionKey = selectedOptionKey.value
  const target = getAppFeedFeedbackTarget(props.video)
  const requestIdentity = props.video.recommendationRequestIdentity
  if (!selectedPayload || !target) {
    toast.warning(t('video_card.feedback_unavailable'))
    return
  }
  loadingDislikeDialog.value = true
  try {
    const auth = await ensureFreshAppAccessToken() ? captureAppAuth() : null
    if (!auth) {
      toast.warning(t('auth.auth_access_key_first'))
      return
    }
    if ((requestIdentity && requestIdentity !== getRecommendationRequestIdentity()) || selectionKey !== selectedOptionKey.value || !isSameAppFeedFeedbackTarget(target, getAppFeedFeedbackTarget(props.video)))
      return
    const { outcome, message } = await submitAppFeedFeedback('feedDislike', auth, target, selectedPayload)
    if (outcome === 'stale' || (requestIdentity && requestIdentity !== getRecommendationRequestIdentity()) || !isSameAppFeedFeedbackTarget(target, getAppFeedFeedbackTarget(props.video)))
      return
    if (outcome === 'succeeded')
      emit('removed', selectedPayload)
    else if (outcome === 'uncertain')
      toast.warning(t('video_card.feedback_uncertain'))
    else if (outcome === 'expired')
      toast.error(t('video_card.feedback_auth_expired'))
    else
      toast.error(message || t('video_card.feedback_failed'))
  }
  finally {
    loadingDislikeDialog.value = false
  }
}

onKeyStroke((e: KeyboardEvent) => {
  if (showDislikeDialog.value) {
    const options = selectableOptions.value

    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const option = options[Number(e.key) - 1]
      if (option)
        selectOption(option.type, option.reason)
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const currentIndex = options.findIndex(option => option.key === selectedOptionKey.value)
      if (currentIndex > 0)
        selectOption(options[currentIndex - 1].type, options[currentIndex - 1].reason)
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const currentIndex = options.findIndex(option => option.key === selectedOptionKey.value)
      if (currentIndex < options.length - 1)
        selectOption(options[currentIndex + 1].type, options[currentIndex + 1].reason)
    }
  }
})
</script>

<template>
  <Dialog
    v-if="showDislikeDialog"
    :title="$t('home.tell_us_why')"
    width="var(--bew-layout-dialog-width)"
    append-to-bewly-body
    :loading="loadingDislikeDialog"
    @close="closeDislikeDialog"
    @confirm="handleAppDislike"
  >
    <ul v-if="dislikeReasons.length > 0" flex="~ col gap-2">
      <li
        v-for="(reason, index) in dislikeReasons"
        :key="getAppFeedFeedbackReasonKey(ThreePointV2Type.Dislike, reason)"
        :class="{ 'activated-dislike-reason': isSelected(ThreePointV2Type.Dislike, reason) }"
        p="x-6 y-4" rounded="$bew-interactive-radius" cursor-pointer bg="$bew-fill-1 hover:$bew-fill-2"
        flex="~ gap-2 items-center justify-between"
        @click="selectOption(ThreePointV2Type.Dislike, reason)"
      >
        <div flex="~ gap-2">
          <div
            class="bew-shape-circle bew-centered-numeral"
            bg="$bew-selected-bg" color="$bew-text-1" w-20px h-20px
          >
            <span>{{ index + 1 }}</span>
          </div>
          {{ reason.name }}
        </div>
        <span
          v-if="isSelected(ThreePointV2Type.Dislike, reason)" class="i-tabler:check"
          w-18px h-18px aria-hidden="true"
        />
      </li>
    </ul>
    <template v-if="feedbackReasons.length > 0">
      <div v-if="dislikeReasons.length > 0" class="divider" />
      <ul flex="~ col gap-2">
        <li
          v-for="(reason, index) in feedbackReasons"
          :key="getAppFeedFeedbackReasonKey(ThreePointV2Type.Feedback, reason)"
          :class="{ 'activated-dislike-reason': isSelected(ThreePointV2Type.Feedback, reason) }"
          p="x-6 y-4" rounded="$bew-interactive-radius" cursor-pointer bg="$bew-fill-1 hover:$bew-fill-2"
          flex="~ gap-2 items-center justify-between"
          @click="selectOption(ThreePointV2Type.Feedback, reason)"
        >
          <div flex="~ gap-2">
            <div
              class="bew-shape-circle bew-centered-numeral"
              bg="$bew-selected-bg" color="$bew-text-1" w-20px h-20px
            >
              <span>{{ dislikeReasons.length + index + 1 }}</span>
            </div>
            {{ reason.name }}
          </div>
          <span
            v-if="isSelected(ThreePointV2Type.Feedback, reason)" class="i-tabler:check"
            w-18px h-18px aria-hidden="true"
          />
        </li>
      </ul>
    </template>
    <p text="$bew-text-3 sm" mt-4 v-html="$t('home.not_interested_desc')" />
  </Dialog>
</template>

<style lang="scss" scoped>
.activated-dislike-reason {
  --uno: "bg-$bew-selected-bg color-$bew-text-1";
}

.divider {
  height: 1px;
  margin: 12px 0;
  background: var(--bew-separator-color);
}
</style>
