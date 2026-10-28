// Legacy storage keys only. They must be removed after authoritative reads and
// excluded from sync so older clients cannot restore retired functionality.
export const RETIRED_SETTINGS_FIELDS = ['autoSwitchListLayout', 'autoSwitchListLayoutBreakpoint', 'videoCardCoverRatioOneColumn', 'videoCardCoverRatioTwoColumns', 'useFollowingNewLayout', 'homeAdaptiveTitleFontSize', 'homeAdaptiveTitleAutoSize', 'showVideoCardViewCount', 'showVideoCardDanmakuCount', 'showVideoCardLikeCount', 'showVideoCardDuration', 'showVideoCardWatchLater', 'videoCardShadowCurve', 'videoCardShadowHeight', 'enableSidebarCoverBlur', 'enableFavoriteCoverBlur', 'enableTextAutospace', 'customizeCSS', 'customizeCSSContent', 'momentsEnableWantedFilter', 'videoCardLayout', 'disableDockGlowingEffect', 'searchPageLogoGlow', 'enableDockLiquidGlass', 'dockLiquidGlassMode', 'dockLiquidGlassRefraction', 'dockLiquidGlassBlur', 'dockLiquidGlassTintSource', 'dockLiquidGlassTintColor', 'dockLiquidGlassTintOpacity', 'dockLiquidGlassDispersion', 'dockLiquidGlassSaturation', 'dockLiquidGlassFrost', 'bewlyWidescreenLayoutPriority', 'bewlyWidescreenCenterVideo', 'bewlyWidescreenSidebarWidth', 'showVideoCardAuthorAvatar', 'showVideoCardVideoTag', 'showVideoCardRecommendTag', 'videoCardContextMenuConfig', 'videoCardMetaFontSize', 'gridColumns', 'videoGridColumns', 'disableSearchFocusEffect', 'openNotificationsPageAsDrawer', 'autoHideTopBar', 'videoPageTopBarConfig', 'historyLayout', 'enableOledDarkMode', 'enableDarkModeTint', 'darkModeBaseColor', 'hideTopBarUserPanelLv6LastLoginLocation', 'liquidGlassMaterial', 'showImmersiveModeEntry', 'immersiveWheelSwitch', 'immersiveKeyboardSwitch', 'immersiveAutoPlay', 'immersiveAutoNext', 'immersivePreloadNext'] as const
export const RETIRED_LOCAL_STORAGE_KEYS = ['momentsWantedUsers', 'momentsPinnedUsers', 'momentsFeedCache'] as const

export function removeRetiredSettings(value: unknown): void {
  if (!value || typeof value !== 'object')
    return
  for (const field of RETIRED_SETTINGS_FIELDS)
    Reflect.deleteProperty(value, field)
}
