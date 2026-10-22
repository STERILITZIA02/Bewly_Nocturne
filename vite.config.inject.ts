import { defineConfig } from 'vite'

import packageJson from './package.json' with { type: 'json' }
import { isDev, isSafari, r } from './scripts/utils.ts'
import { bundlerChecks, sharedConfig } from './vite.config.ts'

// bundling the content script using Vite
export default defineConfig({
  ...sharedConfig,
  build: {
    watch: isDev
      ? { include: ['./**/*'] }
      : undefined,
    outDir: r(isSafari ? 'extension-safari/dist/contentScripts' : 'extension/dist/contentScripts'),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    lib: {
      entry: r('src/inject/index.ts'),
      name: packageJson.name,
      formats: ['iife'],
    },
    rolldownOptions: {
      checks: bundlerChecks,
      output: {
        entryFileNames: 'inject.global.js',
        extend: true,
      },
    },
  },
})
