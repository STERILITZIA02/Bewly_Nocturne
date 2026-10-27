<script setup lang="ts">
import Button from '~/components/Button.vue'
import { useDark } from '~/composables/useDark'
import { applyAppearanceStyle } from '~/utils/appearance'
import { applyMotionPreference } from '~/utils/reducedMotion'
import { applyThemeColorTokens, getThemeColorTokens, readThemeContrastSurfaces } from '~/utils/themeColor'

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
const { isDark, isOledDark, darkModeBaseColor, appearanceStyle, accentColor, motionPreference } = useDark()
let pipHost: HTMLElement | null = null
let disposed = false
let closing = false
let closed = false

function applyPipTheme() {
  const documentElement = pipWindowEl.value?.document?.documentElement
  if (!documentElement)
    return

  for (const element of [documentElement, pipHost]) {
    if (!element)
      continue
    element.classList.toggle('dark', isDark.value)
    element.classList.toggle('oled-dark', isOledDark.value)
    element.style.setProperty('--bew-dark-base-color', darkModeBaseColor.value)
    applyAppearanceStyle(element, appearanceStyle.value)
    applyMotionPreference(element, motionPreference.value)
  }
}

function applyPipColors() {
  const documentElement = pipWindowEl.value?.document?.documentElement
  if (!documentElement || !pipHost)
    return
  const surfaces = readThemeContrastSurfaces(pipHost)
  const background = pipWindowEl.value.getComputedStyle(pipHost).getPropertyValue('--bew-bg')
  const tokens = getThemeColorTokens(accentColor.value, isDark.value, surfaces)
  applyThemeColorTokens(documentElement, tokens)
  applyThemeColorTokens(pipHost, tokens)
  documentElement.style.background = background
}
watch([isDark, isOledDark, darkModeBaseColor, appearanceStyle, motionPreference], applyPipTheme)
watch([isDark, isOledDark, darkModeBaseColor, accentColor, () => appearanceStyle.value['--bew-custom-background'], () => appearanceStyle.value['--bew-custom-foreground']], applyPipColors, { flush: 'post' })

onMounted(() => {
  void openPipWindow()
})

onBeforeUnmount(() => {
  disposed = true
  void handleClose()
})

async function openPipWindow() {
  // https://developer.chrome.com/docs/web-platform/document-picture-in-picture
  if ('documentPictureInPicture' in window) {
    // The Document Picture-in-Picture API is supported.
    const width = window.innerWidth * 0.8
    const height = window.innerHeight * 0.8
    let openedWindow: Window
    try {
      openedWindow = await (window as any).documentPictureInPicture.requestWindow({
        disallowReturnToOpener: true,
        width,
        height,
      })
    }
    catch (error) {
      console.warn('[Bewly] Unable to open picture-in-picture window:', error)
      await handleClose()
      return
    }
    if (disposed || closing || closed) {
      openedWindow.close()
      return
    }
    pipWindowEl.value = openedWindow
    pipWindowEl.value.document.body.style.padding = '0'
    pipWindowEl.value.document.body.style.margin = '0'

    // Styles in the opener's Shadow root do not follow a node into a new document.
    const sourceRoot = pipWindowRef.value!.getRootNode() as ShadowRoot
    pipHost = openedWindow.document.createElement('div')
    pipHost.className = sourceRoot.host.className
    pipHost.style.cssText = sourceRoot.host.getAttribute('style') ?? ''
    const shadow = pipHost.attachShadow({ mode: 'open' })
    sourceRoot.querySelectorAll('style').forEach(style => shadow.append(style.cloneNode(true)))
    shadow.append(pipWindowRef.value!)
    openedWindow.document.body.append(pipHost)
    applyPipTheme()
    applyPipColors()

    openedWindow.addEventListener('pagehide', handleClose, { once: true })
  }
  else {
    const width = window.innerWidth * 0.8
    const height = window.innerHeight * 0.8
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2)
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2)
    window.open(currentUrl.value, '', `width=${Math.round(width)},height=${Math.round(height)},left=${left},top=${top},toolbar=no,location=no,directories=no,menubar=no,scrollbars=yes,resizable=yes,status=no`)
    await handleClose()
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
  pipHost = null
  closed = true
  closing = false
  if (!disposed)
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
</script>

<template>
  <div ref="pipWindowRef" class="bewly-wrapper">
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
            <i i-tabler:external-link />
          </template>
          {{ $t('iframe_drawer.open_in_new_tab') }}
        </Button>
        <Button
          style="
            --b-button-color: var(--bew-elevated-solid);
            --b-button-color-hover: var(--bew-elevated-solid-hover);
          "
          pointer-events-auto
          mr-8
          @click="handleClose"
        >
          <template #left>
            <i i-tabler:x />
          </template>
          {{ $t('iframe_drawer.close') }}
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
