import type { ComponentPublicInstance, InjectionKey, ShallowRef, Slots } from 'vue'
import { inject, onMounted, provide, shallowRef } from 'vue'

export interface SidebarControlBinding {
  target: HTMLElement
  props: () => Record<string, unknown>
  slots: Slots
}

interface SidebarHost {
  page: () => string
  railPage: ShallowRef<string | null>
  rail: ShallowRef<HTMLElement | null>
  search: ShallowRef<SidebarControlBinding | null>
  heading: ShallowRef<SidebarControlBinding | null>
  searchControl: ShallowRef<(ComponentPublicInstance & { focus: () => void }) | null>
  /** Published by the persistent sidebar: open on rail pages, otherwise folded into the logo. */
  railOpen: ShallowRef<boolean>
  /** True while the rail morphs between its full shape and the logo circle. */
  morphing: ShallowRef<boolean>
  /** The floating home logo's untransformed circle; the closed rail folds into it. */
  logo: ShallowRef<HTMLElement | null>
}

const sidebarHostKey: InjectionKey<SidebarHost> = Symbol('sidebar-host')

export function provideSidebarHost(page: () => string = () => '') {
  const host: SidebarHost = { page, railPage: shallowRef(null), rail: shallowRef(null), search: shallowRef(null), heading: shallowRef(null), searchControl: shallowRef(null), railOpen: shallowRef(false), morphing: shallowRef(false), logo: shallowRef(null) }
  provide(sidebarHostKey, host)
  return host
}

export function useSidebarHost() {
  return inject(sidebarHostKey, null)
}

export function useSidebarRail() {
  const host = useSidebarHost()
  onMounted(() => {
    if (host)
      host.railPage.value = host.page()
  })
  return host
}
