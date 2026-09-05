<script setup lang="ts">
import Button from '~/components/Button.vue'
import CloseButton from '~/components/CloseButton.vue'
import { getDeepActiveElement, getTopDialog, moveDialogTabFocus, ownsDialogKeyboard, restoreOverlayFocus } from '~/utils/dialogFocus'

defineProps<{ message: string }>()
const emit = defineEmits<{ finish: [confirmed: boolean] }>()
const dialogRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const dialogId = useId()
let previousFocus: HTMLElement | null = null

function handleKeydown(event: KeyboardEvent) {
  const dialog = dialogRef.value
  if (!dialog || !panelRef.value || !ownsDialogKeyboard(dialog, event))
    return
  if (event.isComposing || event.keyCode === 229) {
    if (event.key === 'Enter')
      event.preventDefault()
    event.stopPropagation()
    return
  }
  if (event.defaultPrevented)
    return
  if (event.key === 'Tab') {
    moveDialogTabFocus(dialog, panelRef.value, event)
    event.stopPropagation()
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('finish', false)
  }
  else if (event.key === 'Enter' || event.key === ' ') {
    // Native buttons decide whether Enter/Space means cancel or confirm.
    event.stopPropagation()
  }
}

onMounted(() => {
  const active = getDeepActiveElement(document)
  previousFocus = active instanceof HTMLElement ? active : null
  const dialog = dialogRef.value
  if (dialog && getTopDialog(dialog.getRootNode() as ParentNode) === dialog)
    panelRef.value?.querySelector<HTMLButtonElement>('[data-confirm-cancel]')?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  const dialog = dialogRef.value
  const wasTopDialog = dialog && getTopDialog(dialog.getRootNode() as ParentNode) === dialog
  dialog?.removeAttribute('data-bewly-dialog-active')
  if (wasTopDialog)
    restoreOverlayFocus(dialog, previousFocus)
})
</script>

<template>
  <div
    ref="dialogRef"
    class="bew-confirm-dialog"
    role="alertdialog"
    aria-modal="true"
    :data-bewly-dialog-active="dialogId"
    :aria-label="$t('common.operation.confirm')"
    :aria-describedby="`${dialogId}-message`"
    @keydown="handleKeydown"
  >
    <div class="bew-confirm-dialog__backdrop" @click="emit('finish', false)" />
    <div ref="panelRef" class="bew-confirm-dialog__panel" tabindex="-1">
      <header class="bew-confirm-dialog__header">
        <p class="bew-confirm-dialog__title">
          {{ $t('common.operation.confirm') }}
        </p>
        <CloseButton
          class="bew-confirm-dialog__close"
          :label="$t('common.close')"
          size="medium"
          @click="emit('finish', false)"
        />
      </header>
      <div class="bew-confirm-dialog__body">
        <p :id="`${dialogId}-message`" class="bew-confirm-dialog__message">
          {{ message }}
        </p>
      </div>
      <footer class="bew-confirm-dialog__footer">
        <Button type="tertiary" data-confirm-cancel @click="emit('finish', false)">
          {{ $t('common.operation.cancel') }}
        </Button>
        <Button type="primary" @click="emit('finish', true)">
          {{ $t('common.operation.confirm') }}
        </Button>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bew-confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-dialog);
  pointer-events: auto;
}

.bew-confirm-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 40%);
}

.bew-confirm-dialog__panel {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: var(--bew-layout-dialog-width);
  max-width: calc(100vw - var(--bew-space-8));
  max-height: calc(100dvh - var(--bew-space-8));
  overflow: hidden;
  background: var(--bew-elevated-alt-solid);
  box-sizing: border-box;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-modal-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
  transform: translate(-50%, -50%);
}

.bew-confirm-dialog__header {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  min-height: 70px;
  padding: 0 var(--bew-space-8);
}

.bew-confirm-dialog__title {
  margin: 0;
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.bew-confirm-dialog__body {
  padding: var(--bew-space-2) var(--bew-space-8);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.bew-confirm-dialog__message {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  white-space: pre-line;
}

.bew-confirm-dialog__footer {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  justify-content: flex-end;
  padding: var(--bew-space-2) var(--bew-space-8) var(--bew-space-6);
}
</style>
