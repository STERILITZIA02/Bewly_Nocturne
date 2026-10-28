import { CODEX_THEME_NAMES } from '~/utils/appearanceThemeNames'

import { MenuType } from './types'

export interface SettingsSearchStorageValue {
  key: string
  value: string
}

export interface SettingsSearchEntry {
  titleKey?: string
  title?: string
  menu: MenuType
  targetKey?: string
  targetId?: string
  fallbackIds?: string[]
  conditionTitleKey?: string
  contextTitleKey?: string
  secondaryTitleKey?: string
  storageValues?: SettingsSearchStorageValue[]
  keywordKeys?: string[]
  keywords?: string[]
  developmentOnly?: boolean
}

interface SearchRoute {
  menu: MenuType
  secondaryPage?: string
  secondaryTitleKey?: string
  storageKey?: string
}

const bewlyPagesStorageKey = 'bewly-settings-bewly-pages-page'
const bewlyComponentsStorageKey = 'bewly-settings-bewly-components-page'
const bilibiliStorageKey = 'bewly-settings-bilibili-page'
const playbackStorageKey = 'bewly-settings-playback-page'

// 分类菜单只用于结果定位，不应作为独立搜索项参与匹配。
const nonSettingTitleKeyPatterns = [
  /^settings\.menu_/,
  /^settings\.group_/,
  /^settings\.plugin\./,
  /^settings\.bilibili_features\./,
  /^settings\.maintenance\.(title|backup_title|reset_title)$/,
  /^settings\.topbar_(display_settings|logo_and_channels|actions|user_menu)$/,
]

function isSettingTitleKey(titleKey: string) {
  return !nonSettingTitleKeyPatterns.some(pattern => pattern.test(titleKey))
}

function createEntries(
  route: SearchRoute,
  titleKeys: string[],
  options: Omit<SettingsSearchEntry, 'titleKey' | 'menu' | 'secondaryTitleKey' | 'storageValues'> & {
    storageValues?: SettingsSearchStorageValue[]
  } = {},
): SettingsSearchEntry[] {
  const routeStorageValues = route.secondaryPage
    ? [{ key: route.storageKey ?? bewlyPagesStorageKey, value: route.secondaryPage }]
    : []

  return titleKeys.filter(isSettingTitleKey).map(titleKey => ({
    titleKey,
    menu: route.menu,
    secondaryTitleKey: route.secondaryTitleKey,
    ...options,
    storageValues: [...routeStorageValues, ...(options.storageValues ?? [])],
  }))
}

const generalRoute: SearchRoute = { menu: MenuType.General, secondaryPage: 'preferences', secondaryTitleKey: 'settings.general_preferences', storageKey: 'bewly-settings-general-page' }
const dataRoute: SearchRoute = { ...generalRoute, secondaryPage: 'data', secondaryTitleKey: 'settings.settings_data' }
const authorizationRoute: SearchRoute = { ...generalRoute, secondaryPage: 'authorization', secondaryTitleKey: 'settings.authorize_app' }
const homeRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'home',
  secondaryTitleKey: 'settings.plugin.home',
  storageKey: bewlyPagesStorageKey,
}
const momentsRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'moments',
  secondaryTitleKey: 'settings.plugin.moments',
  storageKey: bewlyPagesStorageKey,
}
const watchLaterPageRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'lists',
  secondaryTitleKey: 'settings.list_layouts',
  storageKey: bewlyPagesStorageKey,
}
const videoCardRoute: SearchRoute = {
  menu: MenuType.BewlyComponents,
  secondaryPage: 'video-card',
  secondaryTitleKey: 'settings.plugin.video_card',
  storageKey: bewlyComponentsStorageKey,
}
const topBarRoute: SearchRoute = {
  menu: MenuType.BewlyComponents,
  secondaryPage: 'topbar',
  secondaryTitleKey: 'settings.plugin.topbar',
  storageKey: bewlyComponentsStorageKey,
}
const dockRoute: SearchRoute = {
  menu: MenuType.BewlyComponents,
  secondaryPage: 'dock',
  secondaryTitleKey: 'settings.plugin.dock_and_sidebar',
  storageKey: bewlyComponentsStorageKey,
}
const searchPageRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'search',
  secondaryTitleKey: 'settings.plugin.search',
  storageKey: bewlyPagesStorageKey,
}
const messagesPageRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'messages',
  secondaryTitleKey: 'settings.plugin.messages_page',
  storageKey: bewlyPagesStorageKey,
}
const playbackPageRoute: SearchRoute = {
  menu: MenuType.Playback,
  secondaryPage: 'layout',
  secondaryTitleKey: 'settings.playback_layout',
  storageKey: playbackStorageKey,
}
const playerRoute: SearchRoute = {
  menu: MenuType.Playback,
  secondaryPage: 'controls',
  secondaryTitleKey: 'settings.playback_controls',
  storageKey: playbackStorageKey,
}
const autoPlayRoute: SearchRoute = {
  menu: MenuType.Playback,
  secondaryPage: 'behavior',
  secondaryTitleKey: 'settings.playback_behavior',
  storageKey: playbackStorageKey,
}
const appearanceRoute: SearchRoute = { menu: MenuType.Appearance }
const commentsRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'comments',
  secondaryTitleKey: 'settings.bilibili_features.comments',
  storageKey: bilibiliStorageKey,
}
const vipFeaturesRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'vip-features',
  secondaryTitleKey: 'settings.bilibili_features.vip_features',
  storageKey: bilibiliStorageKey,
}
const compatibilityRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'compatibility',
  secondaryTitleKey: 'settings.menu_compatibility',
  storageKey: bilibiliStorageKey,
}
const aboutRoute: SearchRoute = { menu: MenuType.About }

const linkOpeningOptionKeys = [
  'settings.link_opening_behavior_opt.current_tab',
  'settings.link_opening_behavior_opt.current_tab_if_not_homepage',
  'settings.link_opening_behavior_opt.current_tab_if_homepage',
  'settings.link_opening_behavior_opt.background',
  'settings.link_opening_behavior_opt.new_tab',
]
const videoCardLinkOpeningOptionKeys = [
  'settings.link_opening_behavior_opt.current_tab',
  'settings.link_opening_behavior_opt.drawer',
  'settings.link_opening_behavior_opt.background',
  'settings.link_opening_behavior_opt.new_tab',
]
const playerModeOptionKeys = [
  'settings.video_player_mode.default',
  'settings.video_player_mode.web_fullscreen',
  'settings.video_player_mode.widescreen',
  'settings.video_player_mode.bewly_widescreen',
]
const autoPlayModeOptionKeys = [
  'settings.auto_play_mode_auto_play',
  'settings.auto_play_mode_auto_play_with_recommend',
  'settings.auto_play_mode_pause_at_end',
  'settings.auto_play_mode_loop',
]
const topBarGlobalTitleKeys = [
  'settings.group_topbar',
  'settings.topbar_display_settings',
  'settings.open_top_bar_items_in_bewly',
]

const entries: SettingsSearchEntry[] = [
  ...createEntries(autoPlayRoute, ['settings.play_order_multipart', 'settings.play_order_collection', 'settings.play_order_watch_later', 'settings.play_order_playlist'], { keywordKeys: ['settings.custom_play_order_inherit', 'settings.random_play_order_sequential', 'settings.random_play_order_reverse', 'settings.random_play_order_random'] }),
  ...createEntries(watchLaterPageRoute, ['settings.history_group_interval']),
  ...createEntries(searchPageRoute, ['settings.show_standalone_search_page', 'settings.search_bar_link_opening_behavior'], { keywordKeys: linkOpeningOptionKeys }),
  ...createEntries(messagesPageRoute, ['settings.notification_badge_categories', 'settings.show_like_notification_reminder', 'settings.show_reply_notification_reminder', 'settings.show_at_notification_reminder', 'settings.show_system_notification_reminder', 'settings.show_followed_private_message_unread_count', 'settings.show_unfollowed_private_message_unread_count']),
  ...createEntries(autoPlayRoute, ['settings.auto_exit_fullscreen_on_end']),
  ...createEntries(vipFeaturesRoute, ['settings.bcoin_mode'], { keywordKeys: ['settings.bcoin_remind', 'settings.bcoin_auto'] }),
  ...createEntries(generalRoute, [
    'settings.menu_general',
    'settings.group_language',
    'settings.select_language',
    'settings.group_interaction_layout',
    'layout_editor.quick_edit',
    'settings.touch_screen_optimization',
    'settings.enable_grid_layout_switcher',
    'settings.enable_horizontal_scrolling',
    'settings.group_drawer_behavior',
    'settings.drawer_escape_behavior',
  ]),
  ...createEntries(homeRoute, [
    'settings.menu_bewly_pages',
  ], { targetKey: 'settings.plugin.home' }),
  ...createEntries(messagesPageRoute, [
    'settings.messages_auto_mark_read',
    'settings.messages_follow_new',
    'settings.messages_auto_load_images',
    'settings.messages_show_official_assistants',
    'settings.messages_density',
    'settings.messages_max_cached_conversations',
    'settings.messages_max_messages_per_conversation',
    'settings.messages_mobile_open_mode',
    'settings.messages_server_refresh',
    'settings.messages_server_msg_notify',
    'settings.messages_server_ai_intercept',
    'settings.messages_server_reply',
    'settings.messages_server_at',
    'settings.messages_server_like',
    'settings.messages_server_unfollowed',
    'settings.messages_server_block_words',
  ], {
    keywordKeys: [
      'settings.plugin.messages_page',
      'settings.messages_reading_behavior',
      'settings.messages_conversation_list',
      'settings.messages_memory',
      'settings.messages_server_settings',
    ],
  }),
  ...createEntries(videoCardRoute, [
    'settings.menu_bewly_components',
  ], { targetKey: 'settings.plugin.video_card' }),

  ...createEntries(homeRoute, [
    'settings.plugin.home',
    'settings.group_home_layout',
    'settings.home_grid_layout',
    'settings.group_recommendation_mode',
    'settings.show_recommendation_mode_switcher',
    'settings.recommendation_mode_visible_options',
    'settings.remember_no_cookie_recommendation_state',
    'settings.auto_switch_recommendation_mode',
    'settings.preserve_for_you_state',
    'settings.group_recommendation_filters',
    'settings.disable_filters_for_followed_users',
    'settings.filter_out_vertical_videos',
    'settings.filter_by_view_count',
    'settings.filter_by_like_count',
    'settings.filter_by_duration',
    'settings.filter_by_publish_time',
    'settings.filter_by_title',
    'settings.filter_by_user',
    'settings.group_following',
    'settings.enable_following_inactive_blacklist',
    'settings.following_inactive_days',
    'settings.following_tab_show_livestreaming_videos',
    'settings.following_filter_charging_videos',
    'settings.following_filter_dynamic_videos',
    'settings.group_home_tabs',
    'settings.home_tabs_adjustment',
    'settings.fixed_home_tabs_on_home_page',
    'settings.group_search_page_mode',
  ]),
  ...createEntries(homeRoute, [
    'settings.recommendation_mode',
  ], {
    keywordKeys: ['settings.recommendation_mode_web_no_cookie', 'settings.recommendation_mode_app_single', 'settings.recommendation_mode_app_double'],
    keywords: ['Web', 'App'],
  }),
  ...createEntries(homeRoute, ['settings.following_sort'], {
    keywordKeys: ['settings.following_sort_group', 'settings.following_sort_updated', 'home.following_special_group', 'home.following_display_flat', 'home.following_display_grouped'],
  }),
  ...createEntries(momentsRoute, [
    'settings.plugin.moments',
    'settings.group_original_moments_page',
    'settings.original_moments_show_user_card',
    'settings.original_moments_use_bewly_filters',
    'settings.original_moments_show_live_list',
    'settings.original_moments_show_community_center',
    'settings.original_moments_show_hot_search',
    'settings.original_moments_show_up_list',
    'settings.group_new_moments_page',
    'settings.moments_visible_components',
    'settings.moments_filtered_types',
    'settings.moments_enable_keyword_filter',
    'settings.moments_blocked_keywords',
    'settings.moments_show_user_card',
    'settings.moments_show_publish',
    'settings.moments_show_live',
    'settings.moments_show_up_list',
    'settings.moments_start_from_last_seen',
    'settings.moments_enable_live_preview',
    'settings.moments_enable_video_preview',
    'settings.moments_preview_controls',
    'settings.moments_preview_swipe',
    'settings.moments_preview_delay',
    'settings.moments_preview_cover_only',
    'settings.moments_filter_video_dynamic',
    'settings.moments_filter_draw_dynamic',
    'settings.moments_filter_ugc_season_dynamic',
    'settings.moments_filter_forward_dynamic',
    'settings.moments_filter_pgc_dynamic',
    'settings.moments_filter_article_dynamic',
    'settings.moments_filter_charge_dynamic',
    'settings.moments_filter_video_reservation',
    'settings.moments_filter_live_reservation',
    'settings.moments_filter_live_dynamic',
    'settings.moments_card_open_mode',
    'settings.moments_grid_columns',
  ]),
  ...createEntries(watchLaterPageRoute, [
    'settings.watch_later_layout_mode',
  ], {
    keywordKeys: [
      'settings.plugin.watch_later_page',
      'settings.group_watch_later_layout',
      'watch_later.layout_list',
      'watch_later.layout_grid',
    ],
  }),
  ...createEntries(momentsRoute, [
    'settings.moments_filter_up_recommendation',
  ], { targetKey: 'settings.moments_filter_up_recommendation_short' }),
  ...createEntries(momentsRoute, [
    'settings.moments_hide_charge_exclusive',
  ], { targetKey: 'settings.moments_filter_charge_dynamic' }),
  ...createEntries(videoCardRoute, [
    'settings.plugin.video_card',
    'settings.group_video_card_display',
    'settings.enable_video_preview',
    'settings.resume_from_preview_position',
    'settings.enable_video_ctrl_bar_on_video_card',
    'settings.video_preview_swipe_seek',
    'settings.hover_video_card_delayed',
    'settings.only_cover_video_preview',
    'settings.group_video_card_content',
    'settings.show_video_card_author_name',
    'settings.show_video_card_publish_time',
    'settings.show_video_watched_badge',
    'settings.group_video_card_context_menu',
    'common.save_to_watch_later',
    'settings.video_card_context_menu_follow_user',
    'video_card.operation.not_interested',
    'video_card.operation.not_interested_uploader',
    'video_card.operation.open_in_new_tab',
    'video_card.operation.open_in_background',
    'video_card.operation.open_in_current_tab',
    'video_card.operation.copy_video_link',
    'video_card.operation.copy_original_link',
    'video_card.operation.copy_bv_number',
    'video_card.operation.copy_av_number',
    'video_card.operation.view_the_original_cover',
    'video_card.operation.favorite',
    'video_card.operation.block_user',
  ]),
  ...createEntries(appearanceRoute, [
    'settings.video_card_title_font_size',
    'settings.video_card_author_font_size',
  ], { keywordKeys: ['settings.font_size_option'] }),
  ...createEntries(videoCardRoute, ['video_card.operation.open_in_new_window'], { keywordKeys: ['video_card.operation.open_in_pip_window'] }),
  ...createEntries(videoCardRoute, ['video_card.operation.more_options'], { targetKey: 'settings.group_video_card_context_menu', keywordKeys: ['settings.group_video_card_context_menu_desc'] }),

  ...createEntries(videoCardRoute, [
    'settings.group_link_opening_behavior',
    'settings.video_card_link_opening_behavior',
  ], { keywordKeys: videoCardLinkOpeningOptionKeys }),

  ...createEntries(topBarRoute, [
    'settings.plugin.topbar',
    ...topBarGlobalTitleKeys,
  ]),
  ...createEntries(topBarRoute, [
    'settings.topbar_logo_and_channels',
    'settings.top_bar_logo_style',
  ]),
  ...createEntries(topBarRoute, [
    'settings.group_topbar_pinned_channels',
    'settings.topbar_pinned_channels_title',
  ]),
  ...createEntries(topBarRoute, [
    'settings.topbar_actions',
    'settings.filter_articles_in_moments',
  ], {
    keywordKeys: ['settings.visibility', 'settings.badge_type', 'settings.top_bar_icon_badges_opt'],
  }),
  ...createEntries(topBarRoute, [
    'settings.topbar_user_menu',
    'settings.hide_last_login_in_top_bar_user_pop',
  ]),
  ...createEntries(topBarRoute, [
    'settings.group_link_opening_behavior',
    'settings.top_bar_link_opening_behavior',
  ], { keywordKeys: linkOpeningOptionKeys }),
  ...createEntries(topBarRoute, ['topbar.moments'], {
    keywordKeys: ['settings.visibility', 'settings.badge_type', 'settings.top_bar_icon_badges_opt'],
  }),
  ...[
    ['favorites', 'topbar.favorites'],
    ['watchLater', 'topbar.watch_later'],
    ['history', 'topbar.history'],
    ['creatorCenter', 'topbar.creative_center'],
    ['upload', 'topbar.upload'],
  ].flatMap(([, titleKey]) => createEntries(topBarRoute, [titleKey!], {
    keywordKeys: ['settings.visibility'],
  })),

  ...createEntries(dockRoute, [
    'settings.plugin.dock_and_sidebar',
    'settings.group_dock',
    'settings.dock_collapse_mode',
    'settings.always_use_dock',
    'settings.show_dock_back_to_top',
    'settings.dock_content_adjustment',
    'settings.show_bewly_or_bili_page_switcher',
    'settings.disable_light_dark_mode_switcher',
    'settings.back_to_top_and_refresh_buttons_are_separated',
    'settings.enable_undo_refresh_button',
    'settings.group_sidebar',
    'settings.auto_hide_sidebar',
  ]),
  ...createEntries(dockRoute, [
    'settings.dock_position',
  ], { keywordKeys: ['common.position.left', 'common.position.right', 'common.position.bottom'] }),
  ...createEntries({ menu: MenuType.BewlyPages, secondaryPage: 'page-modes', storageKey: bewlyPagesStorageKey, secondaryTitleKey: 'settings.page_mode' }, ['settings.page_mode', 'settings.topbar_mode'], { keywordKeys: ['settings.topbar_mode_bewly', 'settings.topbar_mode_bilibili'] }),
  ...createEntries(dockRoute, [
    'settings.sidebar_position',
  ], { keywordKeys: ['common.position.left', 'common.position.right'] }),

  ...createEntries(searchPageRoute, [
    'settings.plugin.search',
    'settings.show_search_identity_switcher',
    'settings.group_logo',
    'settings.logo_color',
    'settings.logo_visibility',
    'settings.group_search_bar',
    'settings.show_search_recommendation',
    'settings.enable_search_history',
    'search_bar.clear_history',
    'settings.choose_search_bar_focused_character',
    'settings.group_hot_search',
    'settings.show_hot_search_in_search_page',
    'settings.group_search_results',
    'settings.use_plugin_search_results_page',
    'settings.depersonalize_search_results',
    'settings.search_results_pagination_mode',
  ]),

  ...createEntries(playerRoute, [
    'settings.bilibili_features.video_playback',
    'settings.group_player_components',
    'settings.group_playback_memory',
    'settings.remember_playback_rate',
    'settings.remember_video_aspect_ratio',
    'settings.remember_video_quality',
    'settings.group_video_page_actions',
    'settings.enlarge_favorite_dialog',
    'settings.external_watch_later_button',
    'settings.show_vertical_video_zoom_button',
    'settings.show_video_screenshot_button',
    'settings.video_screenshot_shortcut',
    'local_loudness.enable',
    'local_loudness.target',
    'local_loudness.strength',
  ]),
  ...createEntries(playerRoute, ['player_adjustment.enable', 'player_adjustment.show_button'], {
    keywordKeys: ['player_adjustment.rotate_left', 'player_adjustment.horizontal', 'player_adjustment.vertical', 'player_adjustment.delay'],
  }),
  ...createEntries(playbackPageRoute, [
    'settings.group_player_display_mode',
    'settings.video_player_mode.bewly_widescreen_sidebar_position',
    'settings.show_widescreen_idle_progress',
    'settings.video_player_mode.enable_overrides',
    'settings.video_player_mode.overrides',
    'settings.video_player_scroll',
  ]),
  ...createEntries(playbackPageRoute, [
    'settings.video_default_player_mode',
  ], { keywordKeys: playerModeOptionKeys }),
  ...createEntries(playbackPageRoute, [
    'settings.video_player_scroll_position',
  ], { keywordKeys: ['settings.video_player_scroll_sending_bar', 'settings.video_player_scroll_center'] }),
  ...createEntries(playbackPageRoute, [
    'settings.video_player_mode.context_multipart',
    'settings.video_player_mode.context_collection',
    'settings.video_player_mode.context_bangumi',
    'settings.video_player_mode.context_watch_later',
    'settings.video_player_mode.context_playlist',
    'settings.video_player_mode.context_moments_dialog',
  ], { keywordKeys: [...playerModeOptionKeys, 'settings.video_player_mode.inherit'] }),
  ...createEntries(playerRoute, [
    'settings.video_danmaku_default_state',
    'settings.video_caption_default_state',
  ], { keywordKeys: ['settings.video_default_state_opt'] }),

  ...createEntries(autoPlayRoute, [
    'settings.bilibili_features.auto_play',
    'settings.group_random_play',
    'settings.enable_custom_play_order_overrides',
    'settings.custom_play_order_overrides',
    'settings.group_random_play_settings',
    'settings.min_videos_for_random',
    'settings.group_playback_end_behavior',
    'settings.auto_remove_watch_later_on_end',
    'settings.use_bilibili_default_auto_play',
    'settings.group_video_type_end_behavior',
    'settings.group_playlist_start_behavior',
  ]),
  ...createEntries(autoPlayRoute, [
    'settings.auto_play_multipart',
    'settings.auto_play_collection',
    'settings.auto_play_watch_later',
    'settings.auto_play_playlist',
  ], {
    keywordKeys: [
      ...autoPlayModeOptionKeys,
      'settings.custom_play_order_inherit',
      'settings.random_play_order_sequential',
      'settings.random_play_order_reverse',
      'settings.random_play_order_random',
    ],
  }),
  ...createEntries(autoPlayRoute, [
    'settings.auto_play_recommend',
  ], { keywordKeys: autoPlayModeOptionKeys }),
  ...createEntries(autoPlayRoute, [
    'settings.default_custom_play_order',
  ], {
    keywordKeys: [
      'settings.random_play_order_sequential',
      'settings.random_play_order_reverse',
      'settings.random_play_order_random',
    ],
  }),
  ...createEntries(autoPlayRoute, [
    'settings.random_play_mode',
  ], {
    keywordKeys: ['settings.random_play_mode_manual', 'settings.random_play_mode_auto'],
  }),
  ...createEntries(autoPlayRoute, [
    'settings.collected_season_play_all_mode',
  ], {
    keywordKeys: [
      'settings.collected_season_play_all_mode_beginning',
      'settings.collected_season_play_all_mode_latest',
      'settings.collected_season_play_all_mode_last_watched',
    ],
  }),

  ...createEntries(appearanceRoute, [
    'settings.menu_appearance',
    'settings.group_visual_effects',
    'settings.disable_frosted_glass_and_top_bar_gradient',
    'settings.frosted_glass_blur_intensity',
    'settings.group_page_style',
    'settings.adapt_to_other_page_styles',
    'settings.group_color',
    'settings.theme',
    'settings.theme_schedule',
    'settings.video_page_dark_mode',
  ]),
  ...createEntries(appearanceRoute, ['settings.visual_style.accent'], { targetId: 'settings.theme_color', keywordKeys: ['settings.theme_color', 'settings.theme_color_opt.neutral'] }),
  ...createEntries(appearanceRoute, ['settings.visual_style.shadows'], { targetId: 'settings.disable_shadow', keywordKeys: ['settings.disable_shadow'] }),
  ...createEntries(appearanceRoute, [
    'settings.visual_style.editing_mode',
    'settings.visual_style.separate_accent',
    'settings.visual_style.background',
    'settings.visual_style.foreground',
    'settings.visual_style.contrast',
    'settings.visual_style.interface_font_size',
  ]),
  ...createEntries(appearanceRoute, ['settings.visual_style.import', 'settings.visual_style.export', 'settings.visual_style.copy'], { targetId: 'settings.visual_style.preset' }),
  ...createEntries(appearanceRoute, ['settings.visual_style.preset'], { keywordKeys: ['settings.visual_style.presets'], keywords: Object.values(CODEX_THEME_NAMES) }),
  ...createEntries(appearanceRoute, ['settings.visual_style.motion'], { keywordKeys: ['settings.visual_style.motion_system', 'settings.visual_style.motion_on', 'settings.visual_style.motion_off'] }),
  ...createEntries(appearanceRoute, [
    'settings.gradient_theme_color_background',
    'settings.group_fonts',
    'settings.customize_font',
    'settings.enable_text_autospace',
    'settings.remove_the_indent_from_chinese_punctuation',
    'settings.override_danmaku_font',
  ]),

  ...createEntries(playerRoute, [
    'settings.menu_bilibili',
  ], { targetKey: 'settings.bilibili_features.video_playback' }),
  ...createEntries(commentsRoute, [
    'settings.bilibili_features.comments',
    'settings.group_comments',
    'settings.show_ip_location',
    'settings.show_sex',
    'settings.show_comment_host_tag',
    'settings.enable_comment_reply_tree_display',
    'settings.comment_reply_tree_mode.title',
    'settings.comment_reply_pagination_mode.title',
    'settings.enable_comment_reply_tree_container',
    'settings.adjust_comment_image_height',
    'settings.hide_comment_image_scrollbar',
  ]),
  ...createEntries(commentsRoute, ['settings.comment_reply_batch_pages']),
  ...createEntries(commentsRoute, ['settings.comment_reply_tree_container_height']),
  ...createEntries(vipFeaturesRoute, [
    'settings.bilibili_features.vip_features',
    'settings.auto_receive_vip_exp',
  ]),
  ...createEntries(compatibilityRoute, [
    'settings.menu_compatibility',
    'settings.group_common',
    'settings.prevent_mobile_redirect',
    'settings.group_ad_blocking',
    'settings.block_ads',
    'settings.block_top_search_page_ads',
    'settings.clean_url_argument',
    'settings.group_clean_share_link',
    'settings.enable_clean_share_link',
    'settings.clean_share_link_include_title',
    'settings.clean_share_link_remove_tracking_params',
  ]),

  ...createEntries(authorizationRoute, ['settings.authorize_app'], { targetId: 'account.appAuthorization' }),
  ...createEntries(aboutRoute, ['settings.project_license']),
  ...createEntries(aboutRoute, ['settings.third_party_licenses', 'settings.enable_version_reminder']),
  ...createEntries(dataRoute, [
    'settings.enable_settings_sync',
    'settings.import_settings',
    'settings.export_settings',
    'settings.reset_settings',
  ]),
  ...createEntries(dataRoute, ['settings.maintenance.build_id'], { developmentOnly: true }),
]

const targetAliases: Record<string, string> = {
  'settings.play_order_multipart': 'settings.custom_play_order_overrides.multipart',
  'settings.play_order_collection': 'settings.custom_play_order_overrides.collection',
  'settings.play_order_watch_later': 'settings.custom_play_order_overrides.watchLater',
  'settings.play_order_playlist': 'settings.custom_play_order_overrides.playlist',
  'settings.moments_preview_controls': 'settings.enable_video_ctrl_bar_on_video_card',
  'settings.moments_preview_swipe': 'settings.video_preview_swipe_seek',
  'settings.moments_preview_delay': 'settings.hover_video_card_delayed',
  'settings.moments_preview_cover_only': 'settings.only_cover_video_preview',

  'settings.messages_server_msg_notify': 'messages.server.msgNotify',
  'settings.messages_server_ai_intercept': 'messages.server.aiIntercept',
  'settings.messages_server_reply': 'messages.server.reply',
  'settings.messages_server_at': 'messages.server.at',
  'settings.messages_server_like': 'messages.server.like',
  'settings.messages_server_unfollowed': 'messages.server.unfollowed',
  'settings.messages_server_block_words': 'messages.server.blockWords',
  'settings.moments_blocked_keywords': 'settings.moments_enable_keyword_filter',
  'settings.remember_playback_rate': 'settings.group_playback_memory',
  'settings.remember_video_aspect_ratio': 'settings.group_playback_memory',
  'settings.remember_video_quality': 'settings.group_playback_memory',
}
const conditionalParents: Record<string, string[]> = {
  'settings.override_danmaku_font': ['settings.customize_font'],
  'settings.back_to_top_and_refresh_buttons_are_separated': ['settings.show_dock_back_to_top'],
  'local_loudness.target': ['local_loudness.enable'],
  'local_loudness.strength': ['local_loudness.enable'],
  'settings.clean_share_link_include_title': ['settings.enable_clean_share_link'],
  'settings.clean_share_link_remove_tracking_params': ['settings.enable_clean_share_link'],
  'settings.open_top_bar_items_in_bewly': ['settings.topbar_display_settings'],
  'settings.theme_schedule': ['settings.theme'],
  'settings.frosted_glass_blur_intensity': ['settings.disable_frosted_glass_and_top_bar_gradient'],
  'settings.remember_no_cookie_recommendation_state': ['settings.recommendation_mode'],
  'settings.recommendation_mode_visible_options': ['settings.show_recommendation_mode_switcher'],
  'settings.following_inactive_days': ['settings.enable_following_inactive_blacklist'],
  'settings.video_player_scroll_position': ['settings.video_player_scroll'],
  'settings.video_player_mode.overrides': ['settings.video_player_mode.enable_overrides'],
  'settings.enable_custom_play_order_overrides': ['settings.default_custom_play_order'],
  'settings.custom_play_order_overrides': ['settings.enable_custom_play_order_overrides', 'settings.default_custom_play_order'],
  'settings.random_play_mode': ['settings.default_custom_play_order'],
  'settings.min_videos_for_random': ['settings.random_play_mode', 'settings.default_custom_play_order'],
  'settings.comment_reply_tree_mode.title': ['settings.enable_comment_reply_tree_display'],
  'settings.comment_reply_pagination_mode.title': ['settings.enable_comment_reply_tree_display'],
  'settings.comment_reply_batch_pages': ['settings.comment_reply_pagination_mode.title', 'settings.enable_comment_reply_tree_display'],
  'settings.comment_reply_tree_container_height': ['settings.enable_comment_reply_tree_container'],
  'player_adjustment.show_button': ['player_adjustment.enable'],
  'settings.always_show_dock_actions_when_auto_hide': ['settings.auto_hide_dock'],
}
const contextTitles: Record<string, string> = {
  'settings.original_moments_show_user_card': 'settings.group_original_moments_page',
  'settings.original_moments_show_live_list': 'settings.group_original_moments_page',
  'settings.original_moments_show_hot_search': 'settings.group_original_moments_page',
  'settings.original_moments_show_up_list': 'settings.group_original_moments_page',
  'settings.original_moments_show_community_center': 'settings.group_original_moments_page',
  'settings.moments_show_user_card': 'settings.group_new_moments_page',
  'settings.moments_show_live': 'settings.group_new_moments_page',
  'settings.moments_show_publish': 'settings.group_new_moments_page',
  'settings.moments_show_up_list': 'settings.group_new_moments_page',
}
const previewKeys = new Set(['settings.resume_from_preview_position', 'settings.enable_video_ctrl_bar_on_video_card', 'settings.video_preview_swipe_seek', 'settings.hover_video_card_delayed', 'settings.only_cover_video_preview'])

export const settingsSearchEntries = entries.map((entry) => {
  const key = entry.titleKey!
  const page = entry.storageValues?.find(value => value.key !== 'bewly-settings-general-page')?.value
  let targetKey = entry.targetKey ?? targetAliases[key] ?? key
  let parents = conditionalParents[key] ?? []
  if (key.startsWith('video_card.operation.') || key === 'common.save_to_watch_later' || key === 'settings.video_card_context_menu_follow_user')
    targetKey = 'settings.group_video_card_context_menu'
  if (key.startsWith('settings.video_player_mode.context_')) {
    targetKey = 'settings.video_player_mode.overrides'
    parents = ['settings.video_player_mode.enable_overrides']
  }
  if (key.startsWith('settings.play_order_'))
    parents = ['settings.enable_custom_play_order_overrides', 'settings.default_custom_play_order']
  if (key.startsWith('settings.auto_play_'))
    parents = ['settings.use_bilibili_default_auto_play']
  if (key.startsWith('settings.moments_preview_'))
    parents = ['settings.moments_enable_video_preview']
  if (previewKeys.has(key))
    parents = [page === 'moments' ? 'settings.moments_enable_video_preview' : 'settings.enable_video_preview']
  return {
    ...entry,
    contextTitleKey: entry.contextTitleKey ?? contextTitles[key],
    keywordKeys: targetAliases[key] ? [...(entry.keywordKeys ?? []), `${targetAliases[key]}_desc`] : entry.keywordKeys,
    targetId: entry.targetId ?? targetKey,
    fallbackIds: entry.fallbackIds ?? parents,
    conditionTitleKey: entry.conditionTitleKey ?? (key === 'settings.open_top_bar_items_in_bewly' ? 'settings.touch_screen_optimization' : undefined),
  }
})
