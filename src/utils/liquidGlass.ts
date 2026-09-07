import type { ObjectDirective } from 'vue'
import { createVNode, ref, render, watch } from 'vue'

import LiquidGlassSurface from '~/components/LiquidGlassSurface.vue'
import { liquidGlassEnabled, useLiquidGlassOptions } from '~/composables/useLiquidGlass'

let nextAttachmentId = 0

/** Decorate an existing positioned surface without moving its interactive DOM. */
export function attachLiquidGlass(host: HTMLElement, active = true) {
  const liquidGlassProps = useLiquidGlassOptions()
  const enabled = ref(active)
  const mount = document.createElement('div')
  mount.className = 'bew-liquid-glass-layer'
  mount.setAttribute('aria-hidden', 'true')
  const filterId = `bew-liquid-glass-attached-${++nextAttachmentId}`
  const clear = () => {
    render(null, mount)
    mount.remove()
    host.removeAttribute('data-bew-liquid-glass')
  }
  const stop = watch([enabled, liquidGlassEnabled, liquidGlassProps], () => {
    if (!enabled.value || !liquidGlassEnabled.value) {
      clear()
      return
    }
    if (mount.parentElement !== host)
      host.prepend(mount)
    host.setAttribute('data-bew-liquid-glass', '')
    render(createVNode(LiquidGlassSurface, { ...liquidGlassProps.value, filterId }), mount)
  }, { immediate: true, flush: 'post' })

  return {
    setActive: (value: boolean) => { enabled.value = value },
    dispose() {
      stop()
      clear()
    },
  }
}

const attachments = new WeakMap<HTMLElement, ReturnType<typeof attachLiquidGlass>>()
export const vLiquidGlass: ObjectDirective<HTMLElement, boolean | undefined> = {
  mounted(host, binding) {
    attachments.set(host, attachLiquidGlass(host, binding.value !== false))
  },
  updated(host, binding) {
    attachments.get(host)?.setActive(binding.value !== false)
  },
  beforeUnmount(host) {
    attachments.get(host)?.dispose()
    attachments.delete(host)
  },
}
