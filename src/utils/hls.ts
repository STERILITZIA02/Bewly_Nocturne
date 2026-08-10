let hlsModulePromise: Promise<typeof import('hls.js')> | undefined

export function loadHlsModule() {
  hlsModulePromise ??= import('hls.js')
  return hlsModulePromise
}
