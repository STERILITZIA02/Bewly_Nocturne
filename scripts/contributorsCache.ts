import { randomUUID } from 'node:crypto'
import { rename } from 'node:fs/promises'
import path from 'node:path'

import fs from 'fs-extra'

export const CONTRIBUTORS_IMAGE_URL = 'https://contrib.rocks/image?repo=STERILITZIA02/Bewly_Nocturne'

interface ContributorImageResponse {
  ok: boolean
  status?: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

export interface PrepareContributorsImageOptions {
  cachePath: string
  outputPath: string
  fetchImage: (url: string) => Promise<ContributorImageResponse>
  remoteUrl?: string
  warn?: (message: string) => void
  replaceFile?: (tempPath: string, cachePath: string) => Promise<void>
}

export type ContributorsImageSource = 'network' | 'cache' | 'missing'

async function hasUsableCache(cachePath: string) {
  try {
    return (await fs.stat(cachePath)).size > 0
  }
  catch {
    return false
  }
}

async function copyCacheToOutput(cachePath: string, outputPath: string) {
  await fs.ensureDir(path.dirname(outputPath))
  await fs.copy(cachePath, outputPath, { overwrite: true })
}

export async function prepareContributorsImage({
  cachePath,
  outputPath,
  fetchImage,
  remoteUrl = CONTRIBUTORS_IMAGE_URL,
  warn = console.warn,
  replaceFile = rename,
}: PrepareContributorsImageOptions): Promise<ContributorsImageSource> {
  try {
    const response = await fetchImage(remoteUrl)
    if (!response.ok)
      throw new Error(`HTTP ${response.status ?? 'error'}`)

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0)
      throw new Error('empty response')

    await fs.ensureDir(path.dirname(cachePath))
    const tempPath = `${cachePath}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(tempPath, bytes)
      await replaceFile(tempPath, cachePath)
    }
    finally {
      await fs.remove(tempPath)
    }
    await copyCacheToOutput(cachePath, outputPath)
    return 'network'
  }
  catch (error) {
    if (await hasUsableCache(cachePath)) {
      await copyCacheToOutput(cachePath, outputPath)
      warn(`[prepare] contributors image download failed; using cache: ${String(error)}`)
      return 'cache'
    }

    await fs.remove(outputPath)
    warn(`[prepare] contributors image unavailable and no cache exists: ${String(error)}`)
    return 'missing'
  }
}
