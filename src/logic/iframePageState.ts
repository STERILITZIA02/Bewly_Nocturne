import { readonly, ref } from 'vue'

const iframePageActive = ref(false)

export function setIframePageActive(active: boolean) {
  iframePageActive.value = active
}

export function useIframePageActive() {
  return readonly(iframePageActive)
}
