import { defineConfig } from 'vite'

import packageJson from './package.json' with { type: 'json' }
import { VITE_SCRIPT_ENTRIES } from './scripts/buildEntries.ts'
import { bundleLicenses, licenseBuildEntries } from './scripts/bundleLicenses.ts'
import { isDev, isSafari, r } from './scripts/utils.ts'
import { bundlerChecks, sharedConfig } from './vite.config.ts'

// bundling the content script using Vite
export default defineConfig({
  ...sharedConfig,
  plugins: [...sharedConfig.plugins!, ...bundleLicenses('inject', licenseBuildEntries(isDev))],
  build: {
    watch: isDev
      ? { include: ['./**/*'] }
      : undefined,
    outDir: r(isSafari ? 'extension-safari/dist/contentScripts' : 'extension/dist/contentScripts'),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    lib: {
      entry: r(VITE_SCRIPT_ENTRIES.inject),
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
