// Separate entry: these sites keep their own navigation, player and account UI.
export const NATIVE_SITE_HOSTS = {
  'live.bilibili.com': 'live',
  'manga.bilibili.com': 'manga',
  'show.bilibili.com': 'show',
  'mall.bilibili.com': 'merchandise-detail',
  'game.bilibili.com': 'game',
  'www.biligame.com': 'game-detail',
  'wiki.biligame.com': 'game-wiki-community',
  'love.bilibili.com': 'love',
  'pay.bilibili.com': 'wallet',
  'link.bilibili.com': 'live-center',
  'gf.bilibili.com': 'workshop',
  'passport.bilibili.com': 'login',
  'cool.bilibili.com': 'materials',
} as const

// Main-site products without a Bewly app shell use the same appearance-only entry.
const NATIVE_MAIN_PATHS = {
  '/blackboard/activity-list.html': 'activities',
  '/blackboard/era/reward-activity-list-page.html': 'activities',
  '/blackboard/activity-5zJxM3spoS.html': 'community',
  '/match/home': 'esports',
  '/match/game': 'esports',
  '/blackboard/x/act_list': 'topics',
  '/blackboard/topic_list.html': 'topics',
  '/blackboard/aboutUs.html': 'public-about',
  '/html/aboutUs.html': 'public-contact',
  '/blackboard/contact.html': 'public-contact',
  '/html/contact.html': 'public-contact',
  '/blackboard/join.html': 'public-brand',
  '/html/join.html': 'public-brand',
  '/blackboard/help.html': 'public-help',
  '/html/help.html': 'public-help',
  '/v/customer-service': 'customer-service',
  '/v/copyright/intro': 'copyright-intro',
  '/basc': 'public-brand',
  '/blackboard/privacy-pc.html': 'public-document',
  '/blackboard/privacy-h5.html': 'public-document',
  '/blackboard/account-useragreement.html': 'public-document',
  '/protocal/licence.html': 'public-document',
  '/blackboard/blackroomrule_v17.html': 'public-document',
  '/blackboard/topic/activity-cn8bxPLzz.html': 'public-document',
  '/blackboard/activity-ML2shIHycf.html': 'public-document',
  '/blackboard/activity-EiH51rMh3L.html': 'public-document',
  '/blackboard/fe/activity-kRRmygcr4x.html': 'public-document',
  '/blackboard/activity-msK3lx0JRp.html': 'public-document',
  '/blackboard/activity-CFb6c82RAY.html': 'public-document',
  '/blackboard/activity-4gdCkFG48T.html': 'public-document',
  '/blackboard/activity-JDBsks4XG.html': 'public-document',
  '/blackboard/activity-2qx0xFPl.html': 'public-document',
} as const

const NATIVE_MAIN_DIRECTORIES = {
  '/bangumi/media': 'season-media',
  '/blackboard/topic': 'campaign',
  '/blackboard/era': 'campaign',
} as const

// Only the observed applications on shared hosts use this entry. In particular,
// existing music-center, creator shell, video and PGC runtimes keep their owners.
interface NativeAuxiliaryRoute {
  hostname: string
  path: string
  site: string
  subtree?: boolean
  htmlFiles?: boolean
  frames?: boolean
}

const NATIVE_AUXILIARY_ROUTES: readonly NativeAuxiliaryRoute[] = [
  // Platform wiki pages use their existing profile; published community wikis
  // use the same host's separate lightweight profile. Payment/SDK documents
  // outside the observed catalogues retain their current entry ownership.
  { hostname: 'wiki.biligame.com', path: '/', site: 'game-wiki' },
  { hostname: 'wiki.biligame.com', path: '/wiki', site: 'game-wiki', subtree: true },
  { hostname: 'b-gift.biligame.com', path: '/', site: 'game-gifts' },
  { hostname: 'b-gift.biligame.com', path: '/list_my.html', site: 'game-gifts' },
  { hostname: 'pay.biligame.com', path: '/', site: 'game-payment' },
  { hostname: 'yhxy.biligame.com', path: '/', site: 'game-agreement' },
  { hostname: 'member.bilibili.com', path: '/academy', site: 'academy', subtree: true },
  { hostname: 'member.bilibili.com', path: '/york/data-center-web', site: 'creator-data', subtree: true, frames: true },
  { hostname: 'member.bilibili.com', path: '/mall/upower-manage/custom-charge', site: 'creator-charge', frames: true },
  { hostname: 'member.bilibili.com', path: '/york/up-report-weekly', site: 'creator-report' },
  { hostname: 'member.bilibili.com', path: '/studio/annyroal/upper-honor-weekly/my', site: 'creator-report' },
  { hostname: 'cm.bilibili.com', path: '/quests', site: 'creator-quests', subtree: true, frames: true },
  { hostname: 'cm.bilibili.com', path: '/clue-up', site: 'creator-tasks', frames: true },
  { hostname: 'cm.bilibili.com', path: '/fly-pc', site: 'creator-promotion', frames: true },
  { hostname: 'cm.bilibili.com', path: '/pickup-web', site: 'creator-cooperation', frames: true },
  { hostname: 'music.bilibili.com', path: '/', site: 'music-portal' },
  { hostname: 'music.bilibili.com', path: '/help', site: 'music-portal' },
  { hostname: 'music.bilibili.com', path: '/console', site: 'music-portal', subtree: true },
  { hostname: 'music.bilibili.com', path: '/pc/rank', site: 'music-rank' },
  { hostname: 'mall.bilibili.com', path: '/', site: 'merchandise-catalog' },
  { hostname: 'app.bilibili.com', path: '/', site: 'downloads' },
  { hostname: 'big.bilibili.com', path: '/pc/privilege', site: 'premium-info' },
  { hostname: 'e.bilibili.com', path: '/', site: 'marketing-public' },
  { hostname: 'e.bilibili.com', path: '/product.html', site: 'marketing-public' },
  { hostname: 'e.bilibili.com', path: '/case', site: 'marketing-public' },
  { hostname: 'e.bilibili.com', path: '/case', site: 'marketing-public', htmlFiles: true },
  { hostname: 'e.bilibili.com', path: '/bfs/static/e-fe/case', site: 'marketing-public', htmlFiles: true },
  { hostname: 'e.bilibili.com', path: '/main/observe', site: 'marketing-public', subtree: true },
  { hostname: 'e.bilibili.com', path: '/main/collaborator', site: 'marketing-public' },
  { hostname: 'e.bilibili.com', path: '/main/agent', site: 'marketing-public' },
  { hostname: 'b.bilibili.com', path: '/', site: 'brand-public' },
  { hostname: 'mcn.bilibili.com', path: '/studio/mcn/entry', site: 'mcn-public' },
  { hostname: 'jobs.bilibili.com', path: '/', site: 'jobs-public' },
  { hostname: 'jobs.bilibili.com', path: '/bstar', site: 'jobs-public' },
  { hostname: 'jobs.bilibili.com', path: '/social', site: 'jobs-public', subtree: true },
  { hostname: 'jobs.bilibili.com', path: '/campus', site: 'jobs-public', subtree: true },
  { hostname: 'security.bilibili.com', path: '/', site: 'security-public' },
  { hostname: 'security.bilibili.com', path: '/announcement', site: 'security-public', subtree: true },
  { hostname: 'security.bilibili.com', path: '/thanks', site: 'security-public' },
  { hostname: 'security.bilibili.com', path: '/gift', site: 'security-public', subtree: true },
  { hostname: 'security.bilibili.com', path: '/profile', site: 'security-public', subtree: true },
  { hostname: 'ir.bilibili.com', path: '/', site: 'investor-public' },
  { hostname: 'ir.bilibili.com', path: '/en', site: 'investor-public', subtree: true },
  { hostname: 'ir.bilibili.com', path: '/cn', site: 'investor-public', subtree: true },
  { hostname: 'ir.bilibili.com', path: '/hk', site: 'investor-public', subtree: true },
]

function auxiliaryMatches({ hostname, path, subtree, htmlFiles }: NativeAuxiliaryRoute): string[] {
  const base = `*://${hostname}${path}`
  // Static article folders also contain images/scripts. Only HTML documents
  // receive appearance scripts; opening an asset is not a page-template match.
  if (htmlFiles)
    return [`${base}/*.html`, `${base}/*.html?*`]
  return [
    base,
    `${base}?*`,
    ...(path === '/' || path.endsWith('.html') ? [] : [`${base}/`, `${base}/?*`]),
    ...(subtree ? [`${base}/*`] : []),
  ]
}

const NATIVE_CAMPAIGN_MATCHES = [
  // Keep the standalone entry for advertising settings without restyling
  // one-off campaign artwork or booting the main-site application there.
  '*://www.bilibili.com/blackboard/activity-*.html',
  '*://www.bilibili.com/blackboard/activity-*.html?*',
]

const NATIVE_MERCHANDISE_PATHS: readonly string[] = ['/neul-next/detailuniversal/detail.html', '/detailPc']
const NATIVE_ARTICLE_DRAFT_MATCHES = [
  '*://member.bilibili.com/york/read-draft',
  '*://member.bilibili.com/york/read-draft?*',
]

export const NATIVE_MAIN_MATCHES = Object.keys(NATIVE_MAIN_PATHS).flatMap(path => [
  `*://www.bilibili.com${path}`,
  `*://www.bilibili.com${path}?*`,
  ...(path.endsWith('.html') ? [] : [`*://www.bilibili.com${path}/`, `*://www.bilibili.com${path}/?*`]),
]).concat(Object.keys(NATIVE_MAIN_DIRECTORIES).map(path => `*://www.bilibili.com${path}/*`), NATIVE_CAMPAIGN_MATCHES)
export const NATIVE_SITE_MATCHES = [
  ...Object.keys(NATIVE_SITE_HOSTS).filter(host => host !== 'mall.bilibili.com').map(host => `*://${host}/*`),
  ...NATIVE_MAIN_MATCHES,
  ...NATIVE_ARTICLE_DRAFT_MATCHES,
  ...NATIVE_AUXILIARY_ROUTES.flatMap(auxiliaryMatches),
  ...NATIVE_MERCHANDISE_PATHS.flatMap(path => [
    `*://mall.bilibili.com${path}`,
    `*://mall.bilibili.com${path}?*`,
  ]),
]

// Verified embedded player/chat, merchandise and creator documents only. Other
// iframes do not gain this runtime merely because their parent is adapted.
export const NATIVE_SITE_FRAME_MATCHES = [
  '*://live.bilibili.com/blanc/*',
  '*://mall.bilibili.com/detailPc',
  '*://mall.bilibili.com/detailPc?*',
  ...NATIVE_ARTICLE_DRAFT_MATCHES,
  ...NATIVE_AUXILIARY_ROUTES.filter(route => route.frames).flatMap(auxiliaryMatches),
]

export function getNativeSite(hostname: string, pathname = '/') {
  for (const route of NATIVE_AUXILIARY_ROUTES) {
    if (route.htmlFiles) {
      if (hostname === route.hostname && pathname.startsWith(`${route.path}/`) && pathname.endsWith('.html'))
        return route.site
      continue
    }
    if (hostname === route.hostname && (pathname === route.path
      || (route.path !== '/' && !route.path.endsWith('.html') && pathname === `${route.path}/`)
      || (route.subtree && pathname.startsWith(`${route.path}/`)))) {
      return route.site
    }
  }
  if (hostname === 'member.bilibili.com' && pathname === '/york/read-draft')
    return 'article-drafts'
  if (hostname === 'mall.bilibili.com' && !NATIVE_MERCHANDISE_PATHS.includes(pathname))
    return undefined
  if (hostname === 'www.bilibili.com') {
    for (const [path, site] of Object.entries(NATIVE_MAIN_PATHS)) {
      if (pathname === path || (!path.endsWith('.html') && pathname === `${path}/`))
        return site
    }
    for (const [path, site] of Object.entries(NATIVE_MAIN_DIRECTORIES)) {
      if (pathname.startsWith(`${path}/`))
        return site
    }
    if (/^\/blackboard\/activity-[^/]+\.html$/.test(pathname))
      return 'campaign'
  }
  // The same publisher-owned campaign templates also appear on supported
  // subdomains, notably the live-site events linked from the creator home.
  if (Object.hasOwn(NATIVE_SITE_HOSTS, hostname) && /^\/blackboard\/(?:activity-|era\/|topic\/)/.test(pathname))
    return 'campaign'
  return Object.hasOwn(NATIVE_SITE_HOSTS, hostname)
    ? NATIVE_SITE_HOSTS[hostname as keyof typeof NATIVE_SITE_HOSTS]
    : undefined
}
