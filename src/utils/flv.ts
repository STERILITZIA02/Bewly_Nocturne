let flvModulePromise: Promise<typeof import('flv.js')> | undefined

export function loadFlvModule() {
  if (!flvModulePromise) {
    const request = import('flv.js').then((module) => {
      // Preview failures are handled through flv.js Events.ERROR. Avoid reporting
      // the same recoverable CDN error again from the library's internal logger.
      module.default.LoggingControl.applyConfig({ enableError: false })
      return module
    }).catch((error) => {
      if (flvModulePromise === request)
        flvModulePromise = undefined
      throw error
    })
    flvModulePromise = request
  }
  return flvModulePromise
}
