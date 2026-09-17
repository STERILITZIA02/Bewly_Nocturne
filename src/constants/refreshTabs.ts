export const REFRESH_SUPPORTED_TABS = 'bewly:refresh-supported-tabs'

export function getRefreshTabsCopy(locale: string) {
  const copies = {
    'cmn-CN': {
      refreshAll: '刷新全部页面',
      refreshAllBusy: '正在刷新…',
      refreshAllRetry: '重试失败页面',
      refreshAllWarning: '刷新同一普通/无痕会话、所有窗口中扩展支持的 B 站页面。可能打断播放或丢失未保存的输入；不会自动接受网页的离开确认。继续？',
      refreshAllFailed: '刷新未完成，请重试。已成功的页面不会重复刷新。',
      refreshAllResult: '待处理 {pending} · 已刷新 {success} · 跳过 {skipped} · 失败 {failed}',
    },
    'cmn-TW': {
      refreshAll: '重新整理全部頁面',
      refreshAllBusy: '正在重新整理…',
      refreshAllRetry: '重試失敗頁面',
      refreshAllWarning: '重新整理同一一般/無痕工作階段、所有視窗中擴充功能支援的 B 站頁面。可能中斷播放或遺失未儲存的輸入；不會自動接受網頁的離開確認。繼續？',
      refreshAllFailed: '尚未完成，請重試。成功的頁面不會重複重新整理。',
      refreshAllResult: '待處理 {pending} · 已整理 {success} · 略過 {skipped} · 失敗 {failed}',
    },
    jyut: {
      refreshAll: '重新整理全部頁面',
      refreshAllBusy: '整理緊…',
      refreshAllRetry: '重試失敗頁面',
      refreshAllWarning: '重新整理同一普通/無痕工作階段、所有視窗入面擴充功能支援嘅 B 站頁面。可能打斷播放或遺失未儲存嘅輸入；唔會自動接受網頁嘅離開確認。繼續？',
      refreshAllFailed: '未完成，請重試。成功嘅頁面唔會重複整理。',
      refreshAllResult: '待處理 {pending} · 已整理 {success} · 跳過 {skipped} · 失敗 {failed}',
    },
    en: {
      refreshAll: 'Refresh all pages',
      refreshAllBusy: 'Refreshing…',
      refreshAllRetry: 'Retry failed pages',
      refreshAllWarning: 'Refresh supported Bilibili pages in all windows of this normal/private context. Playback may stop and unsaved input may be lost. Page leave confirmations will not be accepted automatically. Continue?',
      refreshAllFailed: 'Refresh is incomplete. Retry; successful pages will not be refreshed again.',
      refreshAllResult: 'Pending {pending} · Refreshed {success} · Skipped {skipped} · Failed {failed}',
    },
  }
  const key = locale === 'jyut' ? 'jyut' : /^(?:cmn-TW|zh-(?:TW|HK))$/i.test(locale) ? 'cmn-TW' : /^(?:cmn-CN|zh)/i.test(locale) ? 'cmn-CN' : 'en'
  return { ...copies[key], refreshAllMessage: REFRESH_SUPPORTED_TABS }
}
