import { getPageLoadingGuard } from './pageLoadingGuard'

if (!/Electron/i.test(navigator.userAgent))
  getPageLoadingGuard()
