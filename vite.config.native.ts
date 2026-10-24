import { defineConfig } from 'vite'

import { VITE_SCRIPT_ENTRIES } from './scripts/buildEntries.ts'
import { bundleLicenses, licenseBuildEntries } from './scripts/bundleLicenses.ts'
import { isDev, isSafari, r } from './scripts/utils.ts'
import { bundlerChecks, sharedConfig } from './vite.config.ts'

export default defineConfig({
  ...sharedConfig,
  plugins: [...sharedConfig.plugins!, ...bundleLicenses('native', licenseBuildEntries(isDev))],
  build: {
    watch: isDev ? {} : undefined,
    outDir: r(isSafari ? 'extension-safari/dist/nativeAppearance' : 'extension/dist/nativeAppearance'),
    emptyOutDir: false,
    cssCodeSplit: false,
    minify: isDev ? false : undefined,
    sourcemap: false,
    lib: {
      entry: r(VITE_SCRIPT_ENTRIES.native),
      name: 'bewlyNativeAppearance',
      formats: ['iife'],
      cssFileName: 'style',
    },
    rolldownOptions: { checks: bundlerChecks, output: { entryFileNames: 'index.global.js' } },
  },
})
