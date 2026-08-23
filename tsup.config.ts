// import path from 'node:path'

// import fs from 'fs-extra'
import { defineConfig } from 'tsup'

import { isDev, isSafari } from './scripts/utils'

const outDir = isSafari ? 'extension-safari/dist' : 'extension/dist'

export default defineConfig(() => ({
  entry: {
    'background/index': './src/background/index.ts',
    ...(isDev ? { mv3client: './scripts/client.ts' } : {}),
  },
  async onSuccess() {
    // fs.copySync(path.resolve(__dirname, './src/inject/index.js'), path.resolve(__dirname, `./${outDir}/inject/index.js`))
  },
  outDir,
  format: ['esm'],
  target: 'esnext',
  ignoreWatch: ['**/extension/**', '**/extension-safari/**'],
  splitting: false,
  noExternal: ['md5'],
  sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
  define: {
    '__DEV__': JSON.stringify(isDev),
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
    'process.env.SAFARI': isSafari ? 'true' : 'false',
  },
  platform: 'browser',
  minifyWhitespace: !isDev,
  minifySyntax: !isDev,
}))
