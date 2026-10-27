import { defineConfig } from 'vite'

import { VITE_SCRIPT_ENTRIES } from './scripts/buildEntries.ts'
import { bundleLicenses, licenseBuildEntries } from './scripts/bundleLicenses.ts'
import { applyMotionPreferenceRules } from './scripts/contentStyleSplit.ts'
import { isDev, isSafari, r } from './scripts/utils.ts'
import { bundlerChecks, sharedConfig } from './vite.config.ts'

export default defineConfig({
  ...sharedConfig,
  plugins: [
    ...sharedConfig.plugins!,
    {
      name: 'bewly-native-motion-preference',
      generateBundle(_options, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type === 'asset' && asset.fileName.endsWith('.css')) {
            const css = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
            asset.source = applyMotionPreferenceRules(css, 'host')
          }
        }
      },
    },
    ...bundleLicenses('native', licenseBuildEntries(isDev)),
  ],
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
