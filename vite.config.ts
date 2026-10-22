import { dirname, relative } from 'node:path'
import process from 'node:process'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import replace from '@rollup/plugin-replace'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'

import { buildCommit, isDev, isSafari, port, r } from './scripts/utils.ts'
// import { MV3Hmr } from './vite-mv3-hmr'

const buildId = process.env.BEWLY_BUILD_ID || (isDev ? Date.now().toString(36) : '')
// Profiling every plugin callback is diagnostic work, not a correctness check.
export const bundlerChecks = { bundlerTimings: process.env.BEWLY_PROFILE_BUILD === '1' }

const localePlugins = [VueI18nPlugin({
  runtimeOnly: true,
  compositionOnly: true,
  strictMessage: false,
  include: [r('./src/_locales/**')],
})].flat()

// Filter in Rolldown before crossing into JS for every application module.
for (const plugin of localePlugins) {
  if (plugin.load) {
    plugin.load = {
      ...(typeof plugin.load === 'function' ? { handler: plugin.load } : plugin.load),
      filter: { id: /@intlify\/unplugin-vue-i18n\/messages$/ },
    }
  }
  if (plugin.resolveId) {
    plugin.resolveId = {
      ...(typeof plugin.resolveId === 'function' ? { handler: plugin.resolveId } : plugin.resolveId),
      filter: { id: /^@intlify\/unplugin-vue-i18n\/messages$/ },
    }
  }
  if (plugin.transform) {
    plugin.transform = {
      ...(typeof plugin.transform === 'function' ? { handler: plugin.transform } : plugin.transform),
      filter: { id: /[/\\]src[/\\]_locales[/\\].*\.(?:json5?|ya?ml)(?:\?.*)?$/ },
    }
  }
}

export const sharedConfig: UserConfig = {
  root: r('src'),
  resolve: {
    alias: {
      '~/': `${r('src')}/`,
      '~': r('src'),
    },
  },
  plugins: [
    Vue(),

    AutoImport({
      imports: [
        'vue',
        {
          'webextension-polyfill': [
            ['*', 'browser'],
          ],
        },
      ],
    }),

    ...localePlugins,

    // https://github.com/unocss/unocss
    // UnoCSS(),

    replace({
      '__DEV__': JSON.stringify(isDev),
      '__BUILD_COMMIT__': JSON.stringify(buildCommit),
      '__BEWLY_BUILD_ID__': JSON.stringify(buildId),
      'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
      '__VUE_OPTIONS_API__': JSON.stringify(true),
      '__VUE_PROD_DEVTOOLS__': JSON.stringify(false),
      'preventAssignment': true,
    }),

    // rewrite assets to use relative path
    {
      name: 'assets-rewrite',
      enforce: 'post',
      apply: 'build',
      transformIndexHtml(html, { path }) {
        return html.replace(/"\/assets\//g, `"${relative(dirname(path), '/assets')}/`)
      },
    },
  ],
  optimizeDeps: {
    include: [
      'vue',
      '@vueuse/core',
      'webextension-polyfill',
    ],
    exclude: [
      'vue-demi',
    ],
  },

}

export default defineConfig(({ command }) => ({
  ...sharedConfig,
  base: command === 'serve' ? `http://localhost:${port}/` : '/dist/',
  server: {
    port,
    hmr: {
      host: 'localhost',
    },
  },
  build: {
    rolldownOptions: { checks: bundlerChecks },
    outDir: r(isSafari ? 'extension-safari/dist' : 'extension/dist'),
    emptyOutDir: true,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    // https://developer.chrome.com/docs/webstore/program_policies/#:~:text=Code%20Readability%20Requirements
    terserOptions: {
      mangle: false,
    },
    minify: 'terser',
  },
}))
