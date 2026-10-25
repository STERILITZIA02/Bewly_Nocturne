<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import Dialog from '~/components/Dialog.vue'

defineProps<{
  submitting: boolean
}>()
const emit = defineEmits<{
  submit: [reasonType: number, reasonDesc: string]
  close: []
}>()

const REMARK_MAX_LENGTH = 60
const REPORT_REASONS = [
  { value: 4, key: 'spam' },
  { value: 8, key: 'inciting_conflict' },
  { value: 1, key: 'pornography' },
  { value: 5, key: 'personal_attack' },
  { value: 3, key: 'illegal_content' },
  { value: 9, key: 'political_rumors' },
  { value: 10, key: 'social_event_rumor' },
  { value: 12, key: 'false_information' },
  { value: 13, key: 'illegal_link' },
  { value: 0, key: 'other' },
] as const

const { t } = useI18n()
const radioName = `moment-report-${useId()}`
const dialogRef = ref<InstanceType<typeof Dialog> | null>(null)
const selected = ref<number | null>(null)
const remark = ref('')
const reasons = computed(() => REPORT_REASONS.map(reason => ({
  value: reason.value,
  label: t(`moment_card.report_reasons.${reason.key}`),
})))
const remarkLength = computed(() => [...remark.value].length)
const canSubmit = computed(() => selected.value !== null && (selected.value !== 0 || Boolean(remark.value.trim())) && remarkLength.value <= REMARK_MAX_LENGTH)

function submit() {
  if (!canSubmit.value || selected.value === null)
    return
  emit('submit', selected.value, selected.value === 0 ? remark.value.trim() : '')
}

defineExpose({ close: () => dialogRef.value?.close() })
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="t('moment_card.report_title')"
    width="440px"
    max-width="calc(100vw - 16px)"
    append-to-bewly-body
    :loading="submitting"
    :close-on-confirm="false"
    @close="emit('close')"
    @confirm="submit"
  >
    <fieldset class="moment-report">
      <legend class="moment-report__legend">
        {{ t('moment_card.report_select_reason') }}
      </legend>
      <div class="moment-report__options">
        <label
          v-for="reason in reasons"
          :key="reason.value"
          class="moment-report__option"
          :class="{ 'is-selected': selected === reason.value }"
        >
          <input
            v-model="selected"
            class="moment-report__radio"
            type="radio"
            :name="radioName"
            :value="reason.value"
          >
          <span>{{ reason.label }}</span>
        </label>
      </div>
      <div v-if="selected === 0" class="moment-report__remark">
        <textarea
          v-model="remark"
          class="moment-report__textarea"
          rows="3"
          :maxlength="REMARK_MAX_LENGTH"
          :placeholder="t('moment_card.report_remark_placeholder')"
          :aria-label="t('moment_card.report_remark_placeholder')"
          @keydown.enter.stop
        />
        <span class="moment-report__count" aria-hidden="true">{{ remarkLength }}/{{ REMARK_MAX_LENGTH }}</span>
      </div>
    </fieldset>
  </Dialog>
</template>

<style lang="scss" scoped>
.moment-report {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.moment-report__legend {
  margin-bottom: var(--bew-space-3);
  padding: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.moment-report__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-2);
}

.moment-report__option {
  position: relative;
  display: flex;
  align-items: center;
  min-height: var(--bew-popover-row-min-height);
  padding: var(--bew-space-2) var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-fill-2);
  }

  &.is-selected {
    color: var(--bew-text-1);
    background: var(--bew-fill-3);
  }

  &:has(.moment-report__radio:focus-visible) {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: 2px;
  }
}

.moment-report__radio {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.moment-report__remark {
  position: relative;
}

.moment-report__textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: var(--bew-space-2) var(--bew-space-3) var(--bew-space-6);
  border: 1px solid var(--bew-field-edge-color);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  resize: none;

  &:focus-visible {
    border-color: var(--bew-text-3);
    outline: none;
  }
}

.moment-report__count {
  position: absolute;
  right: var(--bew-space-3);
  bottom: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
