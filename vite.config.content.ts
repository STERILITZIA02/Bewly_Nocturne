import UnoCSS from 'unocss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

import packageJson from './package.json' with { type: 'json' }
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
      const entryChunk = Object.values(bundle).find(output => output.type === 'chunk' && output.fileName === 'index.global.js')
      if (!styleAsset || styleAsset.type !== 'asset')
        this.error('Unable to find style.css for Shadow DOM embedding')
      if (!entryChunk || entryChunk.type !== 'chunk')
        this.error('Unable to find index.global.js for Shadow DOM embedding')

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
  plugins: [
    UnoCSS(),
    ...sharedConfig.plugins!,
    embedShadowStyles(),
  ],
  build: {
    watch: isDev
      ? { include: ['./**/*'] }
      : undefined,
    outDir: r(isSafari ? 'extension-safari/dist/contentScripts' : 'extension/dist/contentScripts'),
    cssCodeSplit: false,
    emptyOutDir: false,
    minify: isDev ? false : undefined,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    lib: {
      entry: r('src/contentScripts/index.ts'),
      name: packageJson.name,
      formats: ['iife'],
    },
    rolldownOptions: {
      checks: bundlerChecks,
      output: {
        entryFileNames: 'index.global.js',
        assetFileNames: 'style.css',
        extend: true,
      },
    },
  },
})
