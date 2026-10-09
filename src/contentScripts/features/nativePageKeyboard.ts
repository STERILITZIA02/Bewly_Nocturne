const selectors = {
  'activities': '.list-view .activity-item, .list-view .tab-item',
  'account': '.security-left .security-list, .record-nav .record-nav-item, .tabs-nav .tabs-nav-item, .coin-nav .coin-nav-item, .coin-inner .get-coin-more',
  'wallet': '.left-nav-wp .left-nav-link-item, .pay-tab-wp .pay-tab-item',
  'live-center': '.side-bar .nav-item, .side-bar .sub-pages-item, .main-ctnr .tabnav-item, .navbar-left .nav-item1-title, .navbar-left .nav-item2-title, .navbar-left .nav-item3, .app-ctnr:has(.navbar-left) .main-content .menu, #app-ctnr:has(.linkdown-header) .safe-content .btn-download, #app-ctnr:has(.linkdown-header) .platform-item .platform-bottom',
  'anime-index': '.bangumi-index-wrapper .filter-item, .bangumi-index-wrapper .sort-item',
  'anime-timeline': '.timeline-header .arrow-left, .timeline-header .arrow-right',
  'manga-classify': '.style-section .style-tag[role="button"]',
  'manga-account': '.account-info-container .pivot-header-item, :is(.date-selector, .feedback-type) .dropbox-component > .current, :is(.date-selector, .feedback-type) .dropbox-component > .data-list > li',
  'charity': '.charity-list .filter-tab li, .charity-detail .detail-header li:not(.feedback)',
  'season-media': '.media-tab-nav li, .sl-ep-nav-item',
  'error404': '.error-panel .rollback-btn:not([href])',
  'esports-schedule': '.schedule-filter .filter-content > ul > li, .schedule-filter .content-all > div, .time-contain .data',
  'topics': '.topic-main .nav-tab > li',
  'academy': '.bca-csbbul-li, .bca-cf-li, .general-filter .general-item',
  'materials': '.category .item, .square-tab-button, .category-list-wrapper > .operation, .manage-head .u-head-item, .virtual-idol-manage .bmc-virtual-idol-works-card',
  'music-portal': '.NavBar .menu-item-group, .NavBar .menu-item',
  'music-rank': '[class*="_tabsHeader_"] > [class*="_tabHeaderItem_"], [class*="_detailArea_"] .periodShow, [class*="_PcRankPeriodPop_"] .periodList > .periodItem',
  'downloads': '.info-select > li',
  'game-help': '.qa-list .qa-item, .qa-q, .jz-left .nav-btn',
  'game-personal': '[class*="user-nav_"] > li, [class*="games-wrap_"] [class*="game-sub-item_"]',
  'game-ranks': '.aside .anchor_wrapper > .anchor_item',
  'game-wiki': '.resp-tabs-list > li',
  'game-gifts': '.g-title > .btn-to-mygift',
  'game-payment': '.content > .games > .game-list > .game-body',
  'live-directory': '.all__card-list-ctnr .tab__bar-wrap :is(.tabs__tag-item, .tabs__normal-item), .all__card-list-ctnr .cover-tabs-wrap .tabs__normal-item, [class*="index_header_"] > [class*="index_switch_area_"], [class*="index_header_"] > [class*="index_tags-box_"] > a[class*="index_tag-item_"]:not([href])',
  'creator': '.cc-nav-wrp .router_wrap, .cc-nav-wrp .router-item, #video-up-app .upload-nav-item, .comment_wrap .operate_right .operate-txt, micro-app[name="convention"] .web-home-page .sub-title, micro-app[name="convention"] .web-home-page .bylaws, micro-app[name="convention"] .catalogue-bar .children-catalogue, micro-app[name="allowance-excitation"] .signment-tab .tab-item, #growing-up .history-tab .tabs__header-item, #growing-up .rules-and-history .icon-with-text, .confirm-dialog.rulesStyle .close-btn, .confirm-dialog.rulesStyle .confirm-btn',
  'creator-data': '.data-center .header-nav > .item',
  'customer-service': '.guess-panel .tag-item, .question-container > .title',
  'creator-promotion': '.fly-pc-navigation .nav-item',
  'jobs-public': '.bili-banner-right-routes:not([href]), a.bili-item-card:not([href]), .campus-pc .faq-q, .bup-pc-faq-q',
  'investor-public': '.management-container .person, .board-of-directors-container .head-info, .faqs-container .head-info, .faqs-container .tab-header, .year-list .year-item, .annual-interim-reports-container .child-head .nav-link, .news-item .title > a:not([href])',
} as const

/** Local activation for observed click-only native navigation; business clicks stay native. */
export function setupNativePageKeyboard(root: HTMLElement, page: keyof typeof selectors) {
  const selector = selectors[page]
  const clickOnlyLinks = page === 'jobs-public' || page === 'investor-public' || page === 'live-directory' || page === 'creator'
  const originals = new Map<HTMLElement, Map<string, string | null>>()
  let disposed = false
  let spaceTarget: HTMLElement | undefined
  let styleScope: HTMLElement | null = null
  let creatorReadScopes: HTMLElement[] = []
  let creatorRulesTrigger: HTMLElement | undefined
  const creatorReadScopeSelector = '.comment_wrap .operate_right, micro-app[name="convention"] .catalogue-bar, micro-app[name="allowance-excitation"] .signment-tab, #growing-up .history-tab'
  const styleScopeSelector = page === 'creator' ? '.cc-nav-wrp' : page === 'customer-service' ? '.question-panel' : undefined
  const attributes = ['role', 'tabindex', 'aria-label', 'aria-pressed', 'aria-current', 'aria-expanded']
  const interactiveChild = 'a[href], button, input, textarea, select, [tabindex], [role="button"], [role="link"]'

  function restore(element: HTMLElement, values: Map<string, string | null>) {
    for (const [name, value] of values) {
      if (value === null)
        element.removeAttribute(name)
      else element.setAttribute(name, value)
    }
  }
  function update(element: HTMLElement) {
    if (!element.matches(selector) || element.querySelector(interactiveChild)
      || element.parentElement?.closest('a[href], button, [role="button"], [role="link"]')) {
      const original = originals.get(element)
      if (original) {
        restore(element, original)
        originals.delete(element)
      }
      return
    }
    if (!originals.has(element)) {
      const mangaRoleOnly = page === 'manga-classify' && element.tagName === 'DIV'
        && element.getAttribute('role') === 'button' && !element.hasAttribute('tabindex')
      if ((!mangaRoleOnly && element.matches('a[href],button,input,select,textarea,[role],[tabindex]')) || (element.tagName === 'A' && page !== 'error404' && !clickOnlyLinks))
        return
      originals.set(element, new Map(attributes.map(name => [name, element.getAttribute(name)])))
      element.setAttribute('role', clickOnlyLinks && element.tagName === 'A' ? 'link' : 'button')
      element.tabIndex = 0
    }
    if (element.classList.contains('tab-item'))
      element.setAttribute('aria-pressed', String(element.classList.contains('active')))
    if (page === 'anime-timeline' && !element.hasAttribute('aria-label'))
      element.setAttribute('aria-label', element.classList.contains('arrow-left') ? '更早的日期' : '更晚的日期')
    if (page === 'anime-index' || page === 'season-media')
      element.setAttribute('aria-pressed', String(element.classList.contains('on')))
    if (page === 'manga-classify')
      element.setAttribute('aria-pressed', String(element.classList.contains('selected')))
    if (page === 'materials') {
      if (element.matches('.category-list-wrapper > .operation'))
        element.setAttribute('aria-expanded', String(!element.parentElement?.classList.contains('collapse')))
      else element.setAttribute('aria-pressed', String(element.classList.contains('active') || element.classList.contains('u-head-item-active')))
    }
    if (page === 'music-rank') {
      if (element.matches('[class*="_tabHeaderItem_"]'))
        element.setAttribute('aria-pressed', String(element.matches('[class*="_tabHeaderItemSelect_"]')))
      if (element.classList.contains('periodShow'))
        element.setAttribute('aria-expanded', String(Boolean(element.closest('[class*="_target_"]')?.querySelector('.periodList'))))
    }
    if (page === 'manga-account') {
      if (element.classList.contains('pivot-header-item'))
        element.setAttribute('aria-pressed', String(element.classList.contains('selected')))
      if (element.classList.contains('current'))
        element.setAttribute('aria-expanded', String(element.parentElement?.classList.contains('is-open')))
    }
    if (page === 'charity')
      element.setAttribute('aria-pressed', String(element.classList.contains('selected') || element.classList.contains('clicked')))
    if (page === 'esports-schedule')
      element.setAttribute('aria-pressed', String(element.classList.contains('active')))
    if ((page === 'account' && element.matches('.security-list'))
      || (page === 'wallet' && element.matches('.left-nav-link-item'))) {
      if (element.classList.contains('on'))
        element.setAttribute('aria-current', 'page')
      else element.removeAttribute('aria-current')
    }
    if (page === 'account' && element.matches('.record-nav-item, .tabs-nav-item, .coin-nav-item'))
      element.setAttribute('aria-pressed', String(element.classList.contains('on') || element.classList.contains('active')))
    if (page === 'wallet' && element.classList.contains('pay-tab-item'))
      element.setAttribute('aria-pressed', String(element.classList.contains('pay-tab-item-selected')))
    if (page === 'customer-service') {
      if (element.classList.contains('tag-item'))
        element.setAttribute('aria-pressed', String(element.classList.contains('tag-item__active')))
      if (element.matches('.question-container > .title')) {
        const answer = element.parentElement?.querySelector<HTMLElement>('.answer')
        element.setAttribute('aria-expanded', String(Number.parseFloat(answer?.style.height || '0') > 0))
      }
    }
    if (page === 'jobs-public') {
      if (element.classList.contains('bili-banner-right-routes')) {
        if (element.classList.contains('active'))
          element.setAttribute('aria-current', 'page')
        else element.removeAttribute('aria-current')
      }
      if (element.matches('.faq-q, .bup-pc-faq-q'))
        element.setAttribute('aria-expanded', String(element.parentElement?.classList.contains('active')))
    }
    if (page === 'investor-public') {
      if (element.matches('.year-item, .tab-header, .child-head .nav-link'))
        element.setAttribute('aria-pressed', String(element.classList.contains('active')))
      if (element.classList.contains('head-info'))
        element.setAttribute('aria-expanded', String(element.parentElement?.classList.contains('active')))
    }
    if (page === 'topics' || page === 'downloads')
      element.setAttribute('aria-pressed', String(element.classList.contains(page === 'topics' ? 'on' : 'active')))
    if (page === 'game-help' && element.matches('.qa-item, .nav-btn'))
      element.setAttribute('aria-pressed', String(element.classList.contains('qa-active') || element.classList.contains('cur')))
    if (page === 'game-help' && element.matches('.jz-left .nav-btn') && !element.hasAttribute('aria-label')) {
      // These four native navigation nodes render their labels only in bitmaps.
      const labels = { 'btn-info': '工程介绍', 'btn-flow': '申请流程', 'btn-progress': '进度查询', 'btn-question': '常见问题' }
      const label = Object.entries(labels).find(([name]) => element.classList.contains(name))?.[1]
      if (label)
        element.setAttribute('aria-label', label)
    }
    if (page === 'game-help' && element.classList.contains('qa-q'))
      element.setAttribute('aria-expanded', String(Boolean(element.querySelector('.icon-arrow-up'))))
    if (page === 'game-ranks' || page === 'game-wiki')
      element.setAttribute('aria-pressed', String(element.classList.contains('active')))
    if (page === 'game-personal') {
      if (element.matches('[class*="user-nav_"] > li')) {
        if (element.matches('[class*="active_"]'))
          element.setAttribute('aria-current', 'page')
        else element.removeAttribute('aria-current')
      }
      else {
        element.setAttribute('aria-pressed', String(element.matches('[class*="tab-active_"]')))
      }
    }
    if (page === 'live-directory') {
      if (element.matches('[class*="index_switch_area_"]')) {
        element.setAttribute('aria-expanded', String(element.matches('[class*="index_active_"]')))
      }
      else if (element.matches('[class*="index_tag-item_"]')) {
        if (element.matches('[class*="index_active_"]'))
          element.setAttribute('aria-current', 'page')
        else element.removeAttribute('aria-current')
      }
      else {
        element.setAttribute('aria-pressed', String(element.classList.contains('active')))
      }
    }
    if (page === 'academy' && !element.classList.contains('bca-csbbul-li'))
      element.setAttribute('aria-pressed', String(element.classList.contains('selected') || element.classList.contains('active')))
    if ((page === 'academy' && element.classList.contains('bca-csbbul-li')) || page === 'music-portal' || page === 'creator-promotion' || page === 'creator-data'
      || (page === 'creator' && element.matches('.router-item, .upload-nav-item'))) {
      if (element.classList.contains('selected') || element.classList.contains('active') || element.classList.contains('nav-item-active'))
        element.setAttribute('aria-current', 'page')
      else element.removeAttribute('aria-current')
    }
    if (page === 'creator') {
      if (element.matches('.comment_wrap .operate_right .operate-txt'))
        element.setAttribute('aria-pressed', String(element.classList.contains('active')))
      if (element.matches('.signment-tab .tab-item'))
        element.setAttribute('aria-pressed', String(element.classList.contains('item-active')))
      if (element.matches('.history-tab .tabs__header-item'))
        element.setAttribute('aria-pressed', String(element.classList.contains('is-active')))
      if (element.matches('.confirm-dialog.rulesStyle .close-btn') && !element.hasAttribute('aria-label'))
        element.setAttribute('aria-label', '关闭任务规则')
      if (element.classList.contains('children-catalogue')) {
        if (element.classList.contains('anchor'))
          element.setAttribute('aria-current', 'page')
        else element.removeAttribute('aria-current')
      }
      const group = element.closest<HTMLElement>('.bcc-nav-slider-sub-menu__group')
      element.tabIndex = group && (group.style.display === 'none' || group.style.height === '0px') ? -1 : 0
      if (element.classList.contains('router_wrap')) {
        const childGroup = element.closest('.bcc-nav-slider-sub-menu__wrap')?.querySelector<HTMLElement>('.bcc-nav-slider-sub-menu__group')
        if (childGroup)
          element.setAttribute('aria-expanded', String(childGroup.style.display !== 'none' && childGroup.style.height !== '0px'))
      }
    }
    if (page === 'live-center') {
      if (element.closest('.navbar-left')) {
        const outerGroup = element.closest('.nav-warp1')
        const innerGroup = element.closest('.nav-warp2')
        element.tabIndex = [outerGroup, innerGroup].some(group => group && !group.previousElementSibling?.classList.contains('expand')) ? -1 : 0
        if (element.nextElementSibling?.matches('.nav-warp1, .nav-warp2'))
          element.setAttribute('aria-expanded', String(element.classList.contains('expand')))
        if (element.matches('.nav-item3')) {
          if (element.classList.contains('active'))
            element.setAttribute('aria-current', 'page')
          else element.removeAttribute('aria-current')
        }
      }
      if (element.classList.contains('nav-item') && element.parentElement?.querySelector('.sub-pages-item'))
        element.setAttribute('aria-expanded', String(element.classList.contains('expanded')))
      if (element.classList.contains('sub-pages-item')) {
        element.tabIndex = element.closest('.nav-item-ctnr')?.classList.contains('expanded') ? 0 : -1
        if (element.classList.contains('active'))
          element.setAttribute('aria-current', 'page')
        else element.removeAttribute('aria-current')
      }
      if (element.classList.contains('tabnav-item'))
        element.setAttribute('aria-pressed', String(element.classList.contains('current')))
    }
  }
  function scan(node: Element) {
    if (node instanceof HTMLElement)
      update(node)
    node.querySelectorAll<HTMLElement>(selector).forEach(update)
  }
  function focusRulesClose() {
    if (disposed || !creatorRulesTrigger || root.ownerDocument.activeElement !== creatorRulesTrigger)
      return
    const close = root.querySelector<HTMLElement>('.confirm-dialog.rulesStyle .close-btn')
    if (close && originals.has(close))
      close.focus({ preventScroll: true })
  }
  function activate(target: HTMLElement) {
    const coinRecordsTrigger = page === 'account' && target.matches('.coin-inner .get-coin-more')
    const dropdown = page === 'manga-account' && target.matches('.data-list > li')
      ? target.closest<HTMLElement>('.dropbox-component')
      : null
    const directoryHeader = page === 'live-directory' && target.matches('[class*="index_tag-item_"]')
      ? target.closest<HTMLElement>('[class*="index_header_"]')
      : null
    const periodShell = page === 'music-rank' && target.classList.contains('periodItem')
      ? target.closest<HTMLElement>('[class*="_target_"]')
      : null
    const rulesDialog = page === 'creator' && target.matches('.close-btn, .confirm-btn')
      ? target.closest<HTMLElement>('.confirm-dialog.rulesStyle')
      : null
    const rulesReturn = rulesDialog
      ? creatorRulesTrigger ?? root.querySelector<HTMLElement>('#growing-up .rules-and-history .icon-with-text:first-child')
      : null
    if (page === 'creator' && target.matches('#growing-up .rules-and-history .icon-with-text:first-child'))
      creatorRulesTrigger = target
    target.click()
    if (coinRecordsTrigger) {
      queueMicrotask(() => {
        const activeElement = root.ownerDocument.activeElement
        if (!disposed && root.isConnected
          && (activeElement === target || activeElement === root.ownerDocument.body)
          && (!root.contains(target) || target.getClientRects().length === 0)) {
          const selected = root.querySelector<HTMLElement>('.coin-nav .coin-nav-item.on')
          if (selected && originals.has(selected))
            selected.focus()
        }
      })
    }
    if (creatorRulesTrigger && !rulesDialog)
      queueMicrotask(focusRulesClose)
    if (rulesDialog) {
      creatorRulesTrigger = undefined
      queueMicrotask(() => {
        const activeElement = root.ownerDocument.activeElement
        if (!disposed && rulesReturn && root.contains(rulesReturn)
          && (!rulesDialog.isConnected || rulesDialog.getClientRects().length === 0)
          && (activeElement === target || activeElement === root.ownerDocument.body)) {
          rulesReturn.focus({ preventScroll: true })
        }
      })
    }
    if (dropdown) {
      // Native selection closes its list in the Vue tick. Return focus only if
      // it still belongs to the option that just became hidden.
      queueMicrotask(() => {
        if (!disposed && root.contains(dropdown) && !dropdown.classList.contains('is-open')
          && root.ownerDocument.activeElement === target) {
          dropdown.querySelector<HTMLElement>(':scope > .current')?.focus({ preventScroll: true })
        }
      })
    }
    if (directoryHeader) {
      queueMicrotask(() => {
        const trigger = directoryHeader.querySelector<HTMLElement>(':scope > [class*="index_switch_area_"]')
        const activeElement = root.ownerDocument.activeElement
        if (!disposed && root.contains(directoryHeader) && trigger && !trigger.matches('[class*="index_active_"]')
          && (activeElement === target || (!target.isConnected && activeElement === root.ownerDocument.body))) {
          trigger.focus({ preventScroll: true })
        }
      })
    }
    if (periodShell) {
      queueMicrotask(() => {
        const activeElement = root.ownerDocument.activeElement
        if (!disposed && root.contains(periodShell)
          && (activeElement === target || (!target.isConnected && activeElement === root.ownerDocument.body))) {
          periodShell.querySelector<HTMLElement>('.periodShow')?.focus({ preventScroll: true })
        }
      })
    }
    if (page !== 'anime-timeline')
      return
    // At either end the native Vue template removes the activated arrow.
    // Keep keyboard navigation in the remaining direction after its DOM tick.
    queueMicrotask(() => {
      if (!disposed && root.isConnected && !root.contains(target)
        && root.ownerDocument.activeElement === root.ownerDocument.body) {
        root.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
      }
    })
  }
  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return
    if (page === 'creator' && event.key === 'Escape' && event.target instanceof HTMLElement && originals.has(event.target)) {
      const close = event.target.closest('.confirm-dialog.rulesStyle')?.querySelector<HTMLElement>('.close-btn')
      if (close && originals.has(close)) {
        event.preventDefault()
        event.stopPropagation()
        activate(close)
      }
      return
    }
    if (page === 'manga-account' && event.key === 'Escape' && event.target instanceof HTMLElement && originals.has(event.target)) {
      const dropdown = event.target.closest<HTMLElement>('.dropbox-component.is-open')
      const trigger = dropdown?.querySelector<HTMLElement>(':scope > .current')
      if (trigger) {
        event.preventDefault()
        event.stopPropagation()
        trigger.click()
        trigger.focus({ preventScroll: true })
      }
      return
    }
    if (page === 'live-directory' && event.key === 'Escape' && event.target instanceof HTMLElement && originals.has(event.target)) {
      const trigger = event.target.closest('[class*="index_header_"]')?.querySelector<HTMLElement>(':scope > [class*="index_switch_area_"]')
      if (trigger?.matches('[class*="index_active_"]')) {
        event.preventDefault()
        event.stopPropagation()
        trigger.click()
        trigger.focus({ preventScroll: true })
      }
      return
    }
    if (page === 'music-rank' && event.key === 'Escape' && event.target instanceof HTMLElement && originals.has(event.target)) {
      const shell = event.target.closest('[class*="_target_"]')
      const trigger = shell?.querySelector<HTMLElement>('.periodShow')
      if (trigger && shell?.querySelector('.periodList')) {
        event.preventDefault()
        event.stopPropagation()
        trigger.click()
        trigger.focus({ preventScroll: true })
      }
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ')
      return
    const target = event.target
    if (!(target instanceof HTMLElement) || !originals.has(target))
      return
    if (event.key === ' ' && target.getAttribute('role') === 'link')
      return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat)
      return
    if (event.key === ' ')
      spaceTarget = target
    else activate(target)
  }
  function keyup(event: KeyboardEvent) {
    if (event.key !== ' ')
      return
    const target = spaceTarget
    spaceTarget = undefined
    if (!target || event.target !== target || !originals.has(target)
      || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    activate(target)
  }
  function cancelSpace() {
    spaceTarget = undefined
  }
  function revealFocusedCategory(event: FocusEvent) {
    const target = event.target
    if (!(target instanceof HTMLElement) || !originals.has(target) || !target.matches('.category .item'))
      return
    const wrapper = target.closest<HTMLElement>('.category-list-wrapper.collapse')
    if (!wrapper)
      return
    const itemBounds = target.getBoundingClientRect()
    const visibleBounds = wrapper.getBoundingClientRect()
    if (itemBounds.bottom > visibleBounds.bottom + 1 || itemBounds.top < visibleBounds.top - 1)
      wrapper.querySelector<HTMLElement>(':scope > .operation')?.click()
  }
  function observeStyleScope(targetObserver: MutationObserver) {
    styleScope = styleScopeSelector ? (root.matches(styleScopeSelector) ? root : root.querySelector<HTMLElement>(styleScopeSelector)) : null
    // Only native collapsed navigation / FAQ answer heights require style
    // observation. Carousels and charts elsewhere must not wake this owner.
    targetObserver.observe(root, page === 'creator'
      ? { childList: true, subtree: true }
      : { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    if (styleScope)
      targetObserver.observe(styleScope, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    if (page === 'creator') {
      creatorReadScopes = Array.from(root.querySelectorAll<HTMLElement>(creatorReadScopeSelector))
      for (const readScope of creatorReadScopes)
        targetObserver.observe(readScope, { attributes: true, subtree: true, attributeFilter: ['class'] })
    }
  }
  const observer = new MutationObserver((mutations) => {
    const readScopesChanged = page === 'creator' && mutations.some(mutation => mutation.type === 'childList')
      && (() => {
        const next = root.querySelectorAll(creatorReadScopeSelector)
        return next.length !== creatorReadScopes.length || Array.from(next).some((element, index) => element !== creatorReadScopes[index])
      })()
    if (styleScopeSelector && (!styleScope || !root.contains(styleScope) || readScopesChanged)) {
      observer.disconnect()
      observeStyleScope(observer)
    }
    for (const [element, values] of originals) {
      if (!root.contains(element) || !element.matches(selector) || element.querySelector(interactiveChild)) {
        if (spaceTarget === element)
          cancelSpace()
        restore(element, values)
        originals.delete(element)
      }
    }
    for (const mutation of mutations) {
      if (!root.contains(mutation.target))
        continue
      if (page === 'music-rank' && mutation.target instanceof Element) {
        const trigger = mutation.target.closest('[class*="_target_"]')?.querySelector<HTMLElement>('.periodShow')
        if (trigger)
          update(trigger)
      }
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        if (page === 'live-center' && mutation.target.matches('.navbar-left .nav-item1-title, .navbar-left .nav-item2-title')) {
          scan(mutation.target.parentElement ?? mutation.target)
        }
        else if (page === 'game-help' && mutation.target.matches('.qa-icon-arrow')) {
          const question = mutation.target.closest<HTMLElement>('.qa-q')
          if (question)
            update(question)
        }
        else if (page === 'manga-account' && mutation.target.matches('.dropbox-component')) {
          scan(mutation.target)
        }
        else if (page === 'materials' && mutation.target.matches('.category-list-wrapper')) {
          scan(mutation.target)
        }
        else if (page === 'jobs-public' && mutation.target.matches('.faq-item, .bup-pc-faq-item')) {
          scan(mutation.target)
        }
        else if (page === 'investor-public' && mutation.target.matches('.faqs-container .item, .board-of-directors-container .item')) {
          scan(mutation.target)
        }
        else if (page === 'customer-service' && mutation.target.matches('.answer')) {
          const title = mutation.target.parentElement?.querySelector<HTMLElement>(':scope > .title')
          if (title)
            update(title)
        }
        else if (page === 'creator' && mutation.target.matches('.bcc-nav-slider-sub-menu__group')) {
          scan(mutation.target.parentElement ?? mutation.target)
        }
        else if (mutation.target.matches('.list-view, .security-left, .nav-item-ctnr')) {
          scan(mutation.target)
        }
        else {
          update(mutation.target)
        }
      }
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof Element && root.contains(node))
          scan(node)
      }
    }
    if (page === 'creator')
      focusRulesClose()
  })
  scan(root)
  if (styleScopeSelector)
    observeStyleScope(observer)
  else observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  root.addEventListener('keydown', keydown)
  root.addEventListener('keyup', keyup)
  root.addEventListener('focusout', cancelSpace)
  if (page === 'materials')
    root.addEventListener('focusin', revealFocusedCategory)
  return () => {
    disposed = true
    observer.disconnect()
    styleScope = null
    creatorReadScopes = []
    creatorRulesTrigger = undefined
    root.removeEventListener('keydown', keydown)
    root.removeEventListener('keyup', keyup)
    root.removeEventListener('focusout', cancelSpace)
    if (page === 'materials')
      root.removeEventListener('focusin', revealFocusedCategory)
    cancelSpace()
    for (const [element, values] of originals)
      restore(element, values)
    originals.clear()
  }
}
