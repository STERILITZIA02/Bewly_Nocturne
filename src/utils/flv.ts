let flvModulePromise: Promise<typeof import('flv.js')> | undefined

export function loadFlvModule() {
  flvModulePromise ??= import('flv.js').then((module) => {
    // Preview failures are handled through flv.js Events.ERROR. Avoid reporting
    // the same recoverable CDN error again from the library's internal logger.
    module.default.LoggingControl.applyConfig({ enableError: false })
    return module
  })
  return flvModulePromise
}
