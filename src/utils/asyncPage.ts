import type { AsyncComponentLoader, AsyncComponentOptions } from 'vue'
import { defineAsyncComponent } from 'vue'

/** Warm the selected page during an outgoing transition without mounting its data owners. */
export function createAsyncPageRegistry() {
  const loaders = new WeakMap<object, AsyncComponentLoader>()
  return {
    define(loader: AsyncComponentLoader, options: Omit<AsyncComponentOptions, 'loader'>) {
      let pending: ReturnType<AsyncComponentLoader> | undefined
      const load: AsyncComponentLoader = () => {
        pending ??= loader().catch((error) => {
          pending = undefined
          throw error
        })
        return pending
      }
      const component = defineAsyncComponent({ ...options, loader: load })
      loaders.set(component, load)
      return component
    },
    preload(component?: object) {
      // The mounted async component remains responsible for errors/retry UI.
      if (component)
        return Promise.resolve(loaders.get(component)?.()).then(() => {}, () => {})
      return Promise.resolve()
    },
  }
}
