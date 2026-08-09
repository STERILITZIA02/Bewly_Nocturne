<script setup lang="ts">
// import { onKeyStroke } from '@vueuse/core'

import { useDark } from '~/composables/useDark'
import { settings } from '~/logic'

const props = defineProps<{
  url: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const pipWindowRef = ref<HTMLElement | null>(null)
const pipWindowEl = ref<any | null>(null)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref<string>(props.url)
const { isDark, isOledDark } = useDark()
let closing = false
let closed = false

function applyPipTheme() {
  const documentElement = pipWindowEl.value?.document?.documentElement
  if (!documentElement)
    return

  documentElement.classList.toggle('dark', isDark.value)
  documentElement.classList.toggle('oled-dark', isOledDark.value)
  documentElement.style.background = isOledDark.value ? '#000' : 'var(--bew-bg)'
}

watch([isDark, isOledDark, () => settings.value.darkModeBaseColor], applyPipTheme)

onMounted(() => {
  openPipWindow()
})

async function openPipWindow() {
  // https://developer.chrome.com/docs/web-platform/document-picture-in-picture
  if ('documentPictureInPicture' in window) {
    // The Document Picture-in-Picture API is supported.
    const width = window.innerWidth * 0.8
    const height = window.innerHeight * 0.8
    pipWindowEl.value = await (window as any).documentPictureInPicture.requestWindow({
      disallowReturnToOpener: true,
      width,
      height,
    })
    pipWindowEl.value.document.body.style.padding = '0'
    pipWindowEl.value.document.body.style.margin = '0'

    applyPipTheme()

    pipWindowEl.value.document.body.append(pipWindowRef.value)

    pipWindowEl.value.addEventListener('pagehide', () => {
      handleClose()
    })
  }
  else {
    const width = window.innerWidth * 0.8
    const height = window.innerHeight * 0.8
    const left = (screen.width / 2) - (width / 2)
    const top = (screen.height / 2) - (height / 2)
    window.open(currentUrl.value, '', `width=${width}px,height=${height}px,left=${left}px,top=${top}px,toolbar=no,location=no,directories=no,menubar=no,scrollbars=yes,resizable=yes,status=no`)
    handleClose()
  }
}

function handleOpenInNewTab() {
  window.open(currentUrl.value, '_blank')
  handleClose()
}

async function handleClose() {
  if (closing || closed)
    return

  closing = true
  await releaseIframeResources()
  try {
    pipWindowEl.value?.close()
  }
  catch {
    // The user may already have closed the Document Picture-in-Picture window.
  }
  pipWindowEl.value = null
  closed = true
  closing = false
  emit('close')
}

async function releaseIframeResources() {
  const iframe = iframeRef.value
  currentUrl.value = 'about:blank'
  if (iframe)
    iframe.src = 'about:blank'
  await nextTick()
  try {
    iframe?.contentWindow?.close()
  }
  catch {
    // Cross-origin browsing contexts may reject direct close access.
  }
  iframe?.remove()
  iframeRef.value = null
}

// TODO: figure out why the `esc` key doesn't work in here

const isEscPressed = ref<boolean>(false)
// const escPressedTimer = ref<NodeJS.Timeout | null>(null)

// nextTick(() => {
//   onKeyStroke('Escape', (e: KeyboardEvent) => {
//     e.preventDefault()
//     if (isEscPressed.value) {
//       handleClose()
//     }
//     else {
//       isEscPressed.value = true
//       if (escPressedTimer.value) {
//         clearTimeout(escPressedTimer.value)
//       }
//       escPressedTimer.value = setTimeout(() => {
//         isEscPressed.value = false
//       }, 1300)
//     }
//   }, { target: iframeRef.value?.contentWindow })
// })
</script>

<template>
  <div ref="pipWindowRef">
    <div pos="absolute top-0 left-0" w-full h-full>
      <div
        pos="relative top-0" z-1 flex="~ items-center justify-end gap-2"
        w-full h="$bew-top-bar-height"
        pointer-events-none
      >
        <Button
          style="
              --b-button-color: var(--bew-elevated-solid);
              --b-button-color-hover: var(--bew-elevated-solid-hover);
            "
          pointer-events-auto
          @click="handleOpenInNewTab"
        >
          <template #left>
            <i i-mingcute:external-link-line />
          </template>
          {{ $t('iframe_drawer.open_in_new_tab') }}
          <!-- <div flex="~">
              <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>T</kbd>
            </div> -->
        </Button>
        <Button
          v-if="!isEscPressed"
          style="
            --b-button-color: var(--bew-elevated-solid);
            --b-button-color-hover: var(--bew-elevated-solid-hover);
          "
          pointer-events-auto
          mr-8
          @click="handleClose"
        >
          <template #left>
            <i i-mingcute:close-line />
          </template>
          {{ $t('iframe_drawer.close') }}
          <!-- <kbd>Esc</kbd> -->
        </Button>
        <Button
          v-else
          type="error"
          @click="handleClose"
        >
          <template #left>
            <i i-mingcute:close-line />
          </template>
          {{ $t('iframe_drawer.press_esc_again_to_close') }}
          <!-- <kbd>Esc</kbd> -->
        </Button>
      </div>
      <iframe
        ref="iframeRef"
        :src="url" frameborder="0"
        w-full h-full p-0
        pos="absolute top-0 left-0"
        bg="$bew-bg"
      />
    </div>
  </div>
</template>
