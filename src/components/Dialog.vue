<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { useId } from 'vue'

import Button from '~/components/Button.vue'
import CloseButton from '~/components/CloseButton.vue'
import PanelTopBlur from '~/components/PanelTopBlur.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { DIALOG_FOCUS_OWNER, getDeepActiveElement, getTopDialog, moveDialogTabFocus, ownsDialogKeyboard, restoreOverlayFocus } from '~/utils/dialogFocus'
import { resolveDialogKeyboardAction } from '~/utils/dialogKeyboard'

const props = withDefaults(defineProps<{
  title?: string
  desc?: string
  center?: boolean
  frostedGlass?: boolean
  appendToBewlyBody?: boolean
  width?: string | number
  maxWidth?: string | number
  /** 对话框整体高度（含 header/footer） */
  height?: string | number
  contentHeight?: string | number
  contentMaxHeight?: string | number
  /** 顶部偏移；设置后改为顶部对齐（类似小红书 note 详情），不再垂直居中 */
  topOffset?: string | number
  /** 去掉内容区内边距（保留顶部 header），用于 iframe 详情等贴边场景 */
  contentFlush?: boolean
  /** 是否显示对话框顶栏 */
  showHeader?: boolean
  /** 是否显示顶栏局部渐进模糊 */
  showTopBlur?: boolean
  /** Vue Transition 名称；可为需要避免缩放的详情弹窗指定独立过渡 */
  transitionName?: string
  /** 是否显示边框和边缘光 */
  showBorder?: boolean
  showFooter?: boolean
  centerFooter?: boolean
  loading?: boolean
  preventCloseWhenLoading?: boolean
  layer?: 'dialog' | 'layout-editor' | 'critical-dialog'
}>(), {
  preventCloseWhenLoading: true,
  frostedGlass: true,
  showHeader: true,
  showTopBlur: true,
  showBorder: true,
  showFooter: true,
  contentFlush: false,
  transitionName: 'modal',
  layer: 'dialog',
})

const emit = defineEmits(['beforeClose', 'close', 'confirm'])

const showShortcut = ref<boolean>(false)
const { mainAppRef } = useBewlyApp()
const showDialog = ref<boolean>(false)
const dialogRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const dialogId = useId()
const titleId = `${dialogId}-title`
provide(DIALOG_FOCUS_OWNER, dialogId)
let previousFocus: HTMLElement | null = null
let focusRestored = false
/**
 * Closing protocol:
 * 1) handleClose only sets showDialog=false (starts leave transition)
 * 2) @after-leave emits `close` so parents can v-if-unmount after DOM is clean
 * Never emit close + parent-unmount while Transition/Teleport still patching
 * (that caused insertBefore NotFoundError and "works only once" ghost overlays).
 */
let isClosing = false
let closeEmitted = false
let isConfirmPending = false

function isDialogEnterEditingContext(event: KeyboardEvent) {
  return event.composedPath().some((target) => {
    if (!(target instanceof Element))
      return false

    const tagName = target.tagName.toLowerCase()
    const role = target.getAttribute('role')
    return ['input', 'textarea', 'select', 'button'].includes(tagName)
      || (tagName === 'a' && target.hasAttribute('href'))
      || (target instanceof HTMLElement && target.isContentEditable)
      || (target.hasAttribute('contenteditable') && target.getAttribute('contenteditable') !== 'false')
      || ['button', 'combobox', 'listbox', 'option', 'menuitem'].includes(role ?? '')
  })
}

function isDialogKeyboardOwner(event: KeyboardEvent) {
  const dialog = dialogRef.value
  return !!dialog && ownsDialogKeyboard(dialog, event)
}

function handleDialogKeyboardEvent(event: KeyboardEvent, eventType: 'keydown' | 'keyup') {
  const decision = resolveDialogKeyboardAction({
    closing: isClosing,
    defaultPrevented: event.defaultPrevented,
    editingContext: event.key === 'Enter' && isDialogEnterEditingContext(event),
    eventType,
    isComposing: event.isComposing || event.keyCode === 229,
    key: event.key,
    loading: Boolean(props.loading),
    preventCloseWhenLoading: props.preventCloseWhenLoading,
    visible: showDialog.value && isDialogKeyboardOwner(event),
  })

  if (decision.preventDefault)
    event.preventDefault()

  if (decision.action === 'confirm')
    handleConfirm()
  else if (decision.action === 'close')
    handleClose()
  else if (decision.action === 'show-shortcut')
    showShortcut.value = true
  else if (decision.action === 'hide-shortcut')
    showShortcut.value = false
}

onKeyStroke('Enter', event => handleDialogKeyboardEvent(event, 'keydown'))
onKeyStroke('Escape', event => handleDialogKeyboardEvent(event, 'keydown'))
onKeyStroke('Tab', (event) => {
  if (!event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && showDialog.value && !isClosing && dialogRef.value && panelRef.value && isDialogKeyboardOwner(event))
    moveDialogTabFocus(dialogRef.value, panelRef.value, event)
})

const dialogWidth = computed(() => {
  return typeof props.width === 'number' ? `${props.width}px` : props.width || '400px'
})
const dialogMaxWidth = computed(() => {
  const requested = typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth
  const safeWidth = 'calc(100vw - var(--bew-space-4))'
  return requested && requested !== 'unset' && requested !== 'none'
    ? `min(${requested}, ${safeWidth})`
    : safeWidth
})
const dialogHeight = computed(() => {
  if (props.height === undefined || props.height === null || props.height === '')
    return undefined
  return typeof props.height === 'number' ? `${props.height}px` : props.height
})
const dialogTopOffset = computed(() => {
  if (props.topOffset === undefined || props.topOffset === null || props.topOffset === '')
    return undefined
  return typeof props.topOffset === 'number' ? `${props.topOffset}px` : props.topOffset
})
const dialogMaxHeight = computed(() => dialogTopOffset.value
  ? `max(0px, calc(100dvh - max(var(--bew-space-2), ${dialogTopOffset.value}) - var(--bew-space-2)))`
  : 'calc(100dvh - var(--bew-space-4))')
const dialogContentHeight = computed(() => {
  return typeof props.contentHeight === 'number' ? `${props.contentHeight}px` : props.contentHeight || 'auto'
})
const dialogContentMaxHeight = computed(() => {
  return typeof props.contentMaxHeight === 'number' ? `${props.contentMaxHeight}px` : props.contentMaxHeight || 'auto'
})
const frostedGlassEnabled = computed(() => !settings.value.disableFrostedGlass && props.frostedGlass !== false)
const dialogPanelStyle = computed(() => {
  const topAligned = dialogTopOffset.value !== undefined
  return {
    width: dialogWidth.value,
    maxWidth: dialogMaxWidth.value,
    height: dialogHeight.value,
    maxHeight: dialogMaxHeight.value,
    top: topAligned ? `max(var(--bew-space-2), ${dialogTopOffset.value})` : '50%',
    left: '50%',
    transform: topAligned ? 'translateX(-50%)' : 'translate(-50%, -50%)',
    transition: 'transform 0.4s, width 0.4s, height 0.4s',
    boxShadow: props.showBorder ? 'var(--bew-shadow-4), var(--bew-shadow-edge-glow-2)' : 'var(--bew-shadow-4)',
  }
})
const dialogSurfaceStyle = computed(() => {
  return {
    backdropFilter: frostedGlassEnabled.value ? 'var(--bew-filter-glass-2)' : 'none',
    WebkitBackdropFilter: frostedGlassEnabled.value ? 'var(--bew-filter-glass-2)' : 'none',
    backgroundColor: frostedGlassEnabled.value ? 'var(--bew-elevated-alt)' : 'var(--bew-elevated-alt-solid)',
  }
})

onKeyStroke('Alt', event => handleDialogKeyboardEvent(event, 'keydown'), { eventName: 'keydown' })
onKeyStroke('Alt', event => handleDialogKeyboardEvent(event, 'keyup'), { eventName: 'keyup' })

onMounted(() => {
  const active = getDeepActiveElement(document)
  previousFocus = active instanceof HTMLElement ? active : null
  showDialog.value = true
  void nextTick(() => {
    const dialog = dialogRef.value
    if (isClosing || !dialog || getTopDialog(dialog.getRootNode() as ParentNode) !== dialog)
      return
    // A detail iframe may already have acquired focus through its load owner.
    if (!dialog.contains(getDeepActiveElement(document)))
      panelRef.value?.focus({ preventScroll: true })
  })
})

function restoreDialogFocus() {
  if (focusRestored)
    return
  focusRestored = true
  dialogRef.value?.removeAttribute('data-bewly-dialog-active')
  const target = previousFocus
  previousFocus = null
  restoreOverlayFocus(dialogRef.value, target)
}

onBeforeUnmount(() => {
  showShortcut.value = false
  // Parent forced unmount (e.g. v-if=false while still open) — ensure close is observed once.
  emitCloseOnce()
})

function emitCloseOnce() {
  if (closeEmitted)
    return
  closeEmitted = true
  isClosing = true
  restoreDialogFocus()
  emit('close')
}

function onAfterLeave() {
  // Leave finished (or instant when no CSS transition) — safe for parent to unmount.
  emitCloseOnce()
}

function handleClose() {
  if (isClosing || closeEmitted)
    return
  if (props.loading && props.preventCloseWhenLoading)
    return

  isClosing = true
  dialogRef.value?.removeAttribute('data-bewly-dialog-active')
  showShortcut.value = false
  emit('beforeClose')
  // Already hidden (e.g. closed before enter finished) — no leave hook will run.
  if (!showDialog.value) {
    emitCloseOnce()
    return
  }
  showDialog.value = false
  // `close` is emitted in onAfterLeave after the leaving node is removed from DOM.
}

defineExpose({ close: handleClose })

async function handleConfirm() {
  if (props.loading || isClosing || closeEmitted || isConfirmPending)
    return

  isConfirmPending = true
  emit('confirm')
  await nextTick()
  isConfirmPending = false
  if (!props.loading && showDialog.value && !isClosing)
    handleClose()
}
</script>

<template>
  <Teleport :to="mainAppRef" :disabled="!appendToBewlyBody">
    <Transition :name="transitionName" @after-leave="onAfterLeave">
      <div
        v-if="showDialog"
        ref="dialogRef"
        class="dialog"
        :data-bewly-dialog-active="dialogId"
        :class="`dialog--${layer}`"
        pos="fixed top-0 left-0" w-full h-full
        pointer-events-auto
      >
        <div
          bg="black opacity-40 dark:opacity-40"
          pos="absolute top-0 left-0" w-full h-full z-0
          @click="handleClose"
        />
        <slot name="floating-actions" />
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="showHeader ? titleId : undefined"
          :aria-label="showHeader ? undefined : title || $t('common.dialog')"
          tabindex="-1"
          :style="dialogPanelStyle"
          pos="absolute" rounded="$bew-modal-radius"
          z-2
          antialiased
          class="dialog__panel bew-shape-smooth-rect"
          :class="{ 'dialog__panel--borderless': !showBorder }"
        >
          <div class="dialog__clip">
            <div
              class="dialog__surface"
              :style="dialogSurfaceStyle"
              aria-hidden="true"
            />

            <!-- loading masking -->
            <Transition name="fade">
              <div
                v-if="loading"
                pos="absolute top-0 left-0" w-full h-full bg="white dark:black opacity-60 dark:opacity-60" flex="~ justify-center items-center"
                rounded-inherit
                class="dialog__loading-mask"
                z-2
              >
                <div i-svg-spinners-ring-resize text="size-$bew-icon-size-xl" />
              </div>
            </Transition>

            <header
              v-if="showHeader"
              class="dialog__header"
              style="
              text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
            "
              pos="sticky top-0 left-0" w-full h-70px px-8 flex
              items-center justify-between
              z-1
            >
              <PanelTopBlur v-if="showTopBlur" :enabled="frostedGlassEnabled" />
              <div
                class="dialog__heading"
                :style="{ textAlign: center ? 'center' : 'left' }"
                w-full
              >
                <div :id="titleId">
                  <slot name="title">
                    <p class="dialog__title">
                      {{ title }}
                    </p>
                  </slot>
                </div>
                <p class="dialog__description" text="$bew-text-2">
                  <slot name="desc">
                    {{ desc }}
                  </slot>
                </p>
              </div>

              <CloseButton
                class="dialog__close"
                :label="$t('common.close')"
                size="medium"
                @click="handleClose"
              />
            </header>

            <main
              :style="{
                height: dialogContentHeight,
                maxHeight: dialogContentMaxHeight,
                flex: '1 1 auto',
                minHeight: '0',
                ...(contentFlush
                  ? { padding: '0' }
                  : { paddingBottom: !showFooter ? '1.5rem' : '0.5rem' }),
              }"
              :p="contentFlush ? undefined : 'x-8 y-2'"
              relative
              :overflow="contentFlush ? 'hidden' : 'x-hidden y-overlay'"
            >
              <!-- <div h-80px mt--8 /> -->
              <slot />
            </main>
            <footer
              v-if="showFooter"
              :style="{ justifyContent: centerFooter || center ? 'center' : 'flex-end' }"
              flex="~ gap-2" p="x-8 t-2 b-6"
            >
              <Button type="tertiary" @click="handleClose">
                <div>
                  {{ $t('common.operation.cancel') }}
                  <span
                    v-show="showShortcut"
                    text="xs $bew-text-2 lh-0" p="x-1" rounded="$bew-radius-sm" bg="$bew-fill-1"
                    border="1 $bew-border-color"
                    mix-blend-color-dodge
                  >
                    ESC
                  </span>
                </div>
              </Button>
              <Button type="primary" @click="handleConfirm">
                <div>
                  {{ $t('common.operation.confirm') }}
                  <span
                    v-show="showShortcut"
                    text="xs $bew-text-2 lh-0" p="x-1" rounded="$bew-radius-sm" bg="$bew-fill-1"
                    border="1 $bew-border-color"
                    mix-blend-color-dodge
                  >
                    ENTER
                  </span>
                </div>
              </Button>
            </footer>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.dialog {
  z-index: var(--bew-z-dialog);
}

.dialog--layout-editor {
  z-index: var(--bew-z-layout-editor);
}

.dialog--critical-dialog {
  z-index: var(--bew-z-critical-dialog);
}

.dialog__panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.dialog__clip {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  max-height: inherit;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  box-sizing: border-box;
  overflow: clip;
  border-radius: inherit;
  corner-shape: inherit;
  isolation: isolate;

  &::after {
    position: absolute;
    z-index: 3;
    inset: 0;
    box-sizing: border-box;
    border: 1px solid var(--bew-surface-border-color);
    border-radius: inherit;
    corner-shape: inherit;
    content: "";
    pointer-events: none;
  }
}

.dialog__panel--borderless .dialog__clip::after {
  border: 0;
}

.dialog__surface,
.dialog__loading-mask {
  border-radius: inherit;
  corner-shape: inherit;
}

.dialog__surface {
  position: absolute;
  inset: 0;
  z-index: -1;
  box-sizing: border-box;
  pointer-events: none;
}

.dialog__header {
  flex-shrink: 0;
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  corner-shape: inherit;
}

.dialog__clip > footer {
  flex-shrink: 0;
}

.dialog__title {
  margin: 0;
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.dialog__description {
  margin: var(--bew-space-0-5) 0 0;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
}

.dialog__heading,
.dialog__close {
  position: relative;
  z-index: 1;
}

.dialog__close {
  margin-left: var(--bew-space-8);
}

.moments-dialog-enter-active,
.moments-dialog-leave-active {
  transition: opacity 140ms var(--bew-ease-standard, ease);
}

.moments-dialog-enter-from,
.moments-dialog-leave-to {
  opacity: 0;
}
</style>
