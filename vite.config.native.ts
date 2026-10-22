import { defineConfig } from 'vite'

import { isDev, isSafari, r } from './scripts/utils.ts'
import { bundlerChecks, sharedConfig } from './vite.config.ts'

export default defineConfig({
  ...sharedConfig,
  build: {
    watch: isDev ? {} : undefined,
    outDir: r(isSafari ? 'extension-safari/dist/nativeAppearance' : 'extension/dist/nativeAppearance'),
    emptyOutDir: false,
    cssCodeSplit: false,
    minify: isDev ? false : undefined,
    sourcemap: false,
    lib: {
      entry: r('src/contentScripts/nativeAppearance.ts'),
      name: 'bewlyNativeAppearance',
      formats: ['iife'],
      cssFileName: 'style',
    },
    rolldownOptions: { checks: bundlerChecks, output: { entryFileNames: 'index.global.js' } },
  },
})
