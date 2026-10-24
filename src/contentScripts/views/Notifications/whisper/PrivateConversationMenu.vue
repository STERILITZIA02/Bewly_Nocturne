<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import Dialog from '~/components/Dialog.vue'

import { canManagePrivateUser, privateSessionActionsKey } from './usePrivateSessionActions'

defineProps<{ anchor: { x: number, y: number }, trigger: HTMLElement | null }>()
const emit = defineEmits<{ close: [] }>()
const actions = inject(privateSessionActionsKey)
const { t } = useI18n()
const dialog = ref<'block' | 'report' | null>(null)
const reason = ref(-1)
const description = ref('')
const reportReady = ref(false)
const completed = ref(false)
const localError = ref('')
const state = computed(() => actions?.state)
const text = (key: string) => t(`notifications.whisper.${key.startsWith('errors.') ? key : `actions.${key}`}`)
const errorText = computed(() => {
  const value = state.value
  if (!value?.error)
    return ''
  return `${text(value.error)}${value.errorCode !== null && value.errorCode !== undefined ? ` (API ${value.errorCode})` : ''}`
})
const reasons = ['other', 'sexual', 'political', 'illegal', 'advertising', 'abuse', 'fraud']
const options = computed<ContextMenuOption[]>(() => {
  const value = state.value
  if (!value?.target)
    return []
  const disabled = value.busy || value.loading || value.unconfirmed || !value.ready
  const result: ContextMenuOption[] = [
    { value: 'top', label: text(value.pinned ? 'unpin' : 'pin'), icon: 'i-tabler:pin', disabled: disabled || !value.detailReady, kind: 'toggle', checked: value.pinned, pending: value.loading && !value.detailReady, closeOnSelect: false },
    { value: 'dnd', label: text(value.muted ? 'unmute' : 'mute'), icon: 'i-tabler:bell-off', disabled: disabled || !value.detailReady, kind: 'toggle', checked: value.muted, pending: value.loading && !value.detailReady, closeOnSelect: false },
  ]
  if (canManagePrivateUser(value.target)) {
    if (!value.blocked)
      result.push({ value: 'block', label: text('block'), icon: 'i-tabler:ban', danger: true, disabled: disabled || !value.relationReady, closeOnSelect: false })
    result.push({ value: 'report', label: text('report'), icon: 'i-tabler:flag', disabled, closeOnSelect: false })
  }
  if (value.pushAvailable)
    result.push({ value: 'push', label: text(value.pushEnabled ? 'disable_push' : 'enable_push'), description: value.pushEnabled ? text('notifications_normal') : undefined, icon: 'i-tabler:bell', disabled: disabled || !value.settingsReady, kind: 'toggle', checked: value.pushEnabled, closeOnSelect: false })
  if (value.error || value.unconfirmed) {
    result.push({ value: 'error', label: errorText.value || text('unconfirmed'), icon: 'i-tabler:alert-triangle', disabled: true })
    result.push({ value: 'refresh', label: text('refresh'), icon: 'i-tabler:refresh', closeOnSelect: false, disabled: value.busy || value.loading })
  }
  return result
})
async function prepareReport() {
  reportReady.value = Boolean(await actions?.prepareReport())
}
async function refreshStatus() {
  await actions?.refresh()
  if (dialog.value === 'block' && state.value?.blocked && !state.value.unconfirmed)
    completed.value = true
}
async function select(value: string | number) {
  if (value === 'refresh') {
    await actions?.refresh()
  }
  else if (value === 'block' || value === 'report') {
    dialog.value = value
    if (value === 'report')
      await prepareReport()
  }
  else if (value === 'top' || value === 'dnd' || value === 'push') {
    await actions?.perform(value)
  }
}
async function confirm() {
  if (completed.value || state.value?.busy || state.value?.loading)
    return
  localError.value = ''
  if (dialog.value === 'report') {
    if (!reportReady.value || reason.value < 0 || (reason.value === 0 && !description.value.trim())) {
      localError.value = text(reportReady.value ? 'choose_reason' : 'load_failed')
      return
    }
    completed.value = Boolean(await actions?.perform('report', { reason: reason.value, description: reason.value === 0 ? description.value.trim() : text(`reasons.${reasons[reason.value]}`) }))
  }
  else if (dialog.value === 'block') {
    completed.value = Boolean(await actions?.perform('block'))
  }
}
watch(() => state.value?.target, (target) => {
  if (!target)
    emit('close')
})
</script>

<template>
  <ContextMenu
    v-if="!dialog && state?.target" :options="options" :anchor="anchor" :trigger="trigger" :loading="state.loading && !state.ready"
    @select="select" @close="emit('close')"
  />
  <Dialog
    v-if="dialog && state?.target" :title="text(dialog)" width="var(--bew-layout-dialog-width)"
    append-to-bewly-body :loading="state.busy || state.loading" :close-on-confirm="false" :show-footer="!completed"
    :show-loading-overlay="false" :prevent-close-when-loading="state.busy"

    @confirm="confirm" @close="emit('close')"
  >
    <div class="private-conversation-menu__dialog" :aria-busy="state.busy || state.loading">
      <p v-if="completed" role="status">
        {{ text(dialog === 'report' ? 'report_success' : 'success') }}
      </p>
      <template v-else>
        <p>{{ state.target.name }}</p>
        <p>{{ text(dialog === 'block' ? 'block_warning' : 'report_notice') }}</p>
        <template v-if="dialog === 'report'">
          <label>
            <span>{{ text('reason') }}</span>
            <select v-model.number="reason" :disabled="state.busy || state.loading">
              <option :value="-1" disabled>{{ text('choose_reason') }}</option>
              <option v-for="(key, index) in reasons" :key="key" :value="index">{{ text(`reasons.${key}`) }}</option>
            </select>
          </label>
          <textarea
            v-if="reason === 0" v-model="description" :aria-label="text('reason')" maxlength="60" rows="3"
            :disabled="state.busy || state.loading"
          />
          <Button v-if="!reportReady && !state.loading" type="tertiary" @click="prepareReport">
            {{ text('refresh') }}
          </Button>
        </template>
        <p v-if="localError || state.error" role="alert">
          {{ localError || errorText }}
        </p>
        <Button v-if="state.unconfirmed" type="tertiary" :disabled="state.loading" @click="refreshStatus">
          {{ text('refresh') }}
        </Button>
      </template>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.private-conversation-menu__dialog {
  display: grid;
  gap: var(--bew-space-4);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  p {
    margin: 0;
  }
  label {
    display: grid;
    gap: var(--bew-space-2);
  }
  select,
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: var(--bew-space-2) var(--bew-space-3);
    color: var(--bew-text-1);
    background: var(--bew-content-solid);
    border: 0;
    border-radius: var(--bew-interactive-radius);
    font: inherit;
  }
}
</style>
