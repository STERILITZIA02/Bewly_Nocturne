import UnoCSS from 'unocss/vite'
import type { Plugin } from 'vite'
import { defineConfig, normalizePath } from 'vite'

import { VITE_SCRIPT_ENTRIES } from './scripts/buildEntries.ts'
import { bundleLicenses, licenseBuildEntries } from './scripts/bundleLicenses.ts'
import { splitContentStyles } from './scripts/contentStyleSplit.ts'
import { isDev, isSafari, r } from './scripts/utils.ts'
import { bundlerChecks, sharedConfig } from './vite.config.ts'

const BUNDLED_STYLE_GLOBAL = '__BEWLY_NOCTURNE_BUNDLED_STYLE_TEXT__'

/**
 * One compiled stylesheet, two consumers: `style.css` (manifest, host page)
 * keeps only rules the host can match; the Shadow root receives the copy
 * without host-only selectors, embedded once in the entry script.
 */
function embedShadowStyles(): Plugin {
  return {
    name: 'bewly-nocturne-embed-shadow-styles',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const styleAsset = Object.values(bundle).find(output => output.type === 'asset' && output.fileName === 'style.css')
      // Grouping may move the entry module into startup. Put styles beside the
      // code that reads them, before that module evaluates its boot constants.
      const entryChunk = Object.values(bundle).find(output => output.type === 'chunk'
        && Object.hasOwn(output.modules, normalizePath(r(VITE_SCRIPT_ENTRIES.content))))
      if (!styleAsset || styleAsset.type !== 'asset')
        this.error('Unable to find style.css for Shadow DOM embedding')
      if (!entryChunk || entryChunk.type !== 'chunk')
        this.error('Unable to find content runtime for Shadow DOM embedding')

      const styleText = typeof styleAsset.source === 'string'
        ? styleAsset.source
        : new TextDecoder().decode(styleAsset.source)
      const { host, shadow } = splitContentStyles(styleText)
      styleAsset.source = host
      entryChunk.code = `globalThis.${BUNDLED_STYLE_GLOBAL}=${JSON.stringify(shadow)};\n${entryChunk.code}`
    },
  }
}

// bundling the content script using Vite
export default defineConfig({
  ...sharedConfig,
  base: './',
  plugins: [
    UnoCSS(),
    ...sharedConfig.plugins!,
    embedShadowStyles(),
    ...bundleLicenses('content', licenseBuildEntries(isDev)),
  ],
  build: {
    watch: isDev
      ? { include: ['./**/*'] }
      : undefined,
    outDir: r(isSafari ? 'extension-safari/dist/contentScripts' : 'extension/dist/contentScripts'),
    cssCodeSplit: false,
    modulePreload: false,
    emptyOutDir: false,
    minify: isDev ? false : undefined,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    lib: {
      entry: r(VITE_SCRIPT_ENTRIES.content),
      formats: ['es'],
    },
    rolldownOptions: {
      checks: bundlerChecks,
      output: {
        entryFileNames: 'runtime.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        codeSplitting: { groups: [{ name: 'startup', tags: ['$initial'] }] },
        assetFileNames: 'style.css',
      },
    },
  },
})
