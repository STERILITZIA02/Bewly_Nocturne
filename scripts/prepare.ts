import { execSync } from 'node:child_process'
import process from 'node:process'

import chokidar from 'chokidar'
import fs from 'fs-extra'

import { CONTRIBUTORS_IMAGE_URL, prepareContributorsImage } from './contributorsCache'
import { isDev, isFirefox, isSafari, r } from './utils'

function writeManifest() {
  execSync('npx esno ./scripts/manifest.ts', { stdio: 'inherit' })
}

async function prepare() {
  const extensionDirectory = r(isFirefox ? 'extension-firefox' : isSafari ? 'extension-safari' : 'extension')
  fs.ensureDirSync(extensionDirectory)
  fs.copySync(r('assets'), `${extensionDirectory}/assets`)
  await prepareContributorsImage({
    cachePath: r('.cache/bewly-nocturne/contributors.svg'),
    outputPath: `${extensionDirectory}/assets/contributors.svg`,
    remoteUrl: CONTRIBUTORS_IMAGE_URL,
    fetchImage: async (url) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        return await fetch(url, { signal: controller.signal })
      }
      finally {
        clearTimeout(timer)
      }
    },
  })
  writeManifest()

  if (isDev) {
    chokidar.watch([r('src/manifest.ts'), r('package.json')])
      .on('change', () => {
        writeManifest()
      })
  }
}

void prepare().catch((error: unknown) => {
  console.error('[prepare] failed:', error)
  process.exitCode = 1
})
