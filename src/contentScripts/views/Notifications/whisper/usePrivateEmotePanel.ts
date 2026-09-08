import type { Ref } from 'vue'
import { ref, watch } from 'vue'

import type { PrivateEmotePackage } from './privateMessageRenderers'
import { parsePrivateEmotePanel } from './privateMessageRenderers'

/** The native sendable catalog is account-owned; history e_infos is only rendering metadata. */
export function usePrivateEmotePanel(currentMid: Ref<string>, fetchPanel: () => Promise<unknown>) {
  const packages = ref<PrivateEmotePackage[]>([])
  const loading = ref(false)
  const failed = ref(false)
  let generation = 0
  let loaded = false
  let pending: Promise<void> | null = null

  function load(): Promise<void> {
    if (pending)
      return pending
    if (loaded || !currentMid.value)
      return Promise.resolve()
    const mid = currentMid.value
    const requestGeneration = generation
    const isCurrent = () => mid === currentMid.value && generation === requestGeneration
    loading.value = true
    failed.value = false
    const request = (async () => {
      try {
        const result = parsePrivateEmotePanel(await Promise.resolve().then(fetchPanel))
        if (isCurrent()) {
          packages.value = result
          loaded = true
        }
      }
      catch {
        if (isCurrent())
          failed.value = true
      }
      finally {
        if (isCurrent()) {
          loading.value = false
          pending = null
        }
      }
    })()
    pending = request
    return request
  }

  function release() {
    generation++
    pending = null
    loaded = false
    packages.value = []
    loading.value = false
    failed.value = false
  }

  watch(currentMid, release, { flush: 'sync' })
  return { packages, loading, failed, load, release }
}

export type PrivateEmotePanelController = ReturnType<typeof usePrivateEmotePanel>
