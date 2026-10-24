import { defineConfig } from 'tsup'

import { getBackgroundEntries } from './scripts/buildEntries.ts'
import { licenseBuildEntries, tsupLicenses } from './scripts/bundleLicenses'
import { buildCommit, isDev, isSafari } from './scripts/utils'

const outDir = isSafari ? 'extension-safari/dist' : 'extension/dist'
const licenses = tsupLicenses(licenseBuildEntries(isDev))

export default defineConfig(() => ({
  entry: getBackgroundEntries(isDev),
  outDir,
  format: ['esm'],
  target: 'esnext',
  ignoreWatch: ['**/extension/**', '**/extension-safari/**'],
  splitting: false,
  esbuildPlugins: [licenses.esbuildPlugin],
  plugins: [licenses.plugin],
  noExternal: ['md5'],
  sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
  define: {
    '__DEV__': JSON.stringify(isDev),
    '__BUILD_COMMIT__': JSON.stringify(buildCommit),
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
    'process.env.SAFARI': isSafari ? 'true' : 'false',
  },
  platform: 'browser',
  minifyWhitespace: !isDev,
  minifySyntax: !isDev,
}))
