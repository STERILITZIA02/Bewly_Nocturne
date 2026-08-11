let hlsModulePromise: Promise<typeof import('hls.js')> | undefined

export function loadHlsModule() {
  if (!hlsModulePromise) {
    const request = import('hls.js').catch((error) => {
      if (hlsModulePromise === request)
        hlsModulePromise = undefined
      throw error
    })
    hlsModulePromise = request
  }
  return hlsModulePromise
}
