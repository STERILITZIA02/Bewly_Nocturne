import type { App, Plugin } from 'vue'

// Templates resolve these names globally. Every matching component is eagerly
// loaded, so unused components must be removed rather than merely unreferenced.
const paths: Record<string, { default: Component }> = import.meta.glob(['./*/*.vue', './*.vue'], { eager: true })

export default {
  install: (app: App) => {
    for (const path in paths) {
      const splitPath = path.split('/')
      const name = splitPath[splitPath.length - 1].replace('.vue', '').replace('.ts', '')
      app.component(name, paths[path].default)
    }
  },
} as Plugin
