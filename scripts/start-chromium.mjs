import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const extension = resolve(root, 'extension')
if (!existsSync(resolve(extension, 'manifest.json')))
  throw new Error('Run pnpm dev or pnpm build before starting Chromium.')

// Chrome for Testing / Chromium still support loading an unpacked extension
// from the command line. Regular Chrome requires chrome://extensions instead.
const binary = process.env.CHROMIUM_BINARY || ({
  darwin: '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  linux: 'chromium',
  win32: 'chrome.exe',
})[process.platform]
if (!binary)
  throw new Error('Set CHROMIUM_BINARY to your Chromium or Chrome for Testing executable.')

const child = spawn(binary, [
  `--user-data-dir=${resolve(root, 'chromium-web-ext-profile')}`,
  `--load-extension=${extension}`,
  '--no-first-run',
  'https://www.bilibili.com/',
], { stdio: 'inherit' })
child.on('error', (error) => {
  console.error(`Unable to start Chromium: ${error.message}. Set CHROMIUM_BINARY to the browser executable.`)
  process.exitCode = 1
})
child.on('exit', code => process.exitCode = code ?? 1)
