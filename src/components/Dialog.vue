<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'

import Button from '~/components/Button.vue'
import CloseButton from '~/components/CloseButton.vue'
import PanelTopBlur from '~/components/PanelTopBlur.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'

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
  /** Vue Transition 名称；可为需要避免缩放的详情弹窗指定独立过渡 */
  transitionName?: string
  /** 是否显示边框和边缘光 */
  showBorder?: boolean
  showFooter?: boolean
  centerFooter?: boolean
  loading?: boolean
  preventCloseWhenLoading?: boolean
}>(), {
  preventCloseWhenLoading: true,
  frostedGlass: true,
  showHeader: true,
  showBorder: true,
  showFooter: true,
  contentFlush: false,
  transitionName: 'modal',
})

const emit = defineEmits(['close', 'confirm'])

const showShortcut = ref<boolean>(false)
const { mainAppRef } = useBewlyApp()
const showDialog = ref<boolean>(false)
/**
 * Closing protocol:
 * 1) handleClose only sets showDialog=false (starts leave transition)
 * 2) @after-leave emits `close` so parents can v-if-unmount after DOM is clean
 * Never emit close + parent-unmount while Transition/Teleport still patching
 * (that caused insertBefore NotFoundError and "works only once" ghost overlays).
 */
let isClosing = false
let closeEmitted = false

onKeyStroke('Enter', (e: KeyboardEvent) => {
  e.preventDefault()
  if (!props.loading && showDialog.value && !isClosing)
    handleConfirm()
})
onKeyStroke('Escape', (e: KeyboardEvent) => {
  if (!showDialog.value || isClosing)
    return

  e.preventDefault()
  if (props.loading && props.preventCloseWhenLoading)
    return
  handleClose()
})

const dialogWidth = computed(() => {
  return typeof props.width === 'number' ? `${props.width}px` : props.width || '400px'
})
const dialogMaxWidth = computed(() => {
  return typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth || 'unset'
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
    top: topAligned ? dialogTopOffset.value : '50%',
    left: '50%',
    transform: topAligned ? 'translateX(-50%)' : 'translate(-50%, -50%)',
    transition: 'transform 0.4s, width 0.4s, height 0.4s',
    overflow: topAligned ? 'visible' : 'hidden',
  }
})
const dialogSurfaceStyle = computed(() => {
  return {
    backdropFilter: frostedGlassEnabled.value ? 'var(--bew-filter-glass-2)' : 'none',
    WebkitBackdropFilter: frostedGlassEnabled.value ? 'var(--bew-filter-glass-2)' : 'none',
    backgroundColor: frostedGlassEnabled.value ? 'var(--bew-elevated-alt)' : 'var(--bew-elevated-alt-solid)',
    boxShadow: props.showBorder ? 'var(--bew-shadow-4), var(--bew-shadow-edge-glow-2)' : 'var(--bew-shadow-4)',
  }
})

onKeyStroke('Alt', (e: KeyboardEvent) => {
  e.preventDefault()
  showShortcut.value = true
}, { eventName: 'keydown' })
onKeyStroke('Alt', (e: KeyboardEvent) => {
  e.preventDefault()
  showShortcut.value = false
}, { eventName: 'keyup' })

onMounted(() => {
  showDialog.value = true
})

onBeforeUnmount(() => {
  // Parent forced unmount (e.g. v-if=false while still open) — ensure close is observed once.
  emitCloseOnce()
})

function emitCloseOnce() {
  if (closeEmitted)
    return
  closeEmitted = true
  isClosing = true
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
  // Already hidden (e.g. closed before enter finished) — no leave hook will run.
  if (!showDialog.value) {
    emitCloseOnce()
    return
  }
  showDialog.value = false
  // `close` is emitted in onAfterLeave after the leaving node is removed from DOM.
}

function handleConfirm() {
  if (isClosing || closeEmitted)
    return

  emit('confirm')
  if (!props.loading)
    handleClose()
}
</script>

<template>
  <Teleport :to="mainAppRef" :disabled="!appendToBewlyBody">
    <Transition :name="transitionName" @after-leave="onAfterLeave">
      <div
        v-if="showDialog"
        class="dialog"
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
          :style="dialogPanelStyle"
          pos="absolute" rounded="$bew-modal-radius"
          z-2
          antialiased
          class="dialog__panel bew-shape-smooth-rect"
          :class="{ 'dialog__panel--borderless': !showBorder }"
        >
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
            rounded="t-$bew-modal-radius" z-1
          >
            <PanelTopBlur
              :enabled="frostedGlassEnabled"
              style="--bew-panel-top-blur-hold: 45%;"
            />
            <div
              :style="{ textAlign: center ? 'center' : 'left' }"
              w-full
            >
              <slot name="title">
                <p class="dialog__title">
                  {{ title }}
                </p>
              </slot>
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
              flex: dialogHeight ? '1 1 auto' : undefined,
              minHeight: dialogHeight ? '0' : undefined,
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
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.dialog {
  z-index: var(--bew-z-modal);
}

.dialog__panel {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
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

  &--borderless::after {
    border: 0;
  }
}

.dialog__surface {
  position: absolute;
  inset: 0;
  z-index: -1;
  box-sizing: border-box;
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

.dialog__header {
  isolation: isolate;
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
