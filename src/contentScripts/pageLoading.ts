import { isConfirmedLiveEmbeddedFrame } from '../utils/bilibiliLiveContext'
import { getPageLoadingGuard } from './pageLoadingGuard'

if (!/Electron/i.test(navigator.userAgent) && !isConfirmedLiveEmbeddedFrame())
  getPageLoadingGuard()
