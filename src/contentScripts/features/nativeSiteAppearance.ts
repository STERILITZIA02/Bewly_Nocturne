import { effectScope, onScopeDispose, watch } from 'vue'

import { stopDarkState, useDark } from '~/composables/useDark'
import { getNativeSite } from '~/constants/nativeSites'
import { settings, settingsInitializationState } from '~/logic/storage'
import { getThemeColorTokens, readThemeContrastSurfaces } from '~/utils/themeColor'

import { setupNativePageKeyboard } from './nativePageKeyboard'

/** Native-site projection of the existing settings/theme owners; no app or player mounts. */
export function setupNativeSiteAppearance() {
  const site = getNativeSite(location.hostname, location.pathname)
  if (!site)
    return () => {}
  // This host also serves API/resource documents. Only the actual MediaWiki
  // page shell participates in its community appearance projection.
  if (site === 'game-wiki-community' && !document.body?.classList.contains('mediawiki'))
    return () => {}
  // One-off campaigns and author-designed wiki documents keep their own visual
  // system. They still share the existing, independent advertising preference.
  const preserveNativeDesign = site === 'campaign' || site === 'game-wiki-community'
  const root = document.documentElement
  root.dataset.bewlyNativeSite = site
  const scope = effectScope()
  const appearanceProperties = ['--bew-theme-color', '--bew-on-theme-color', '--bew-theme-checkmark-image', '--bew-switch-thumb-active', '--bew-theme-foreground', '--bew-theme-focus-ring', '--bew-dark-base-color', '--bew-native-font-family']
  let originalProperties: string[][] = []
  const originalClasses = new Map<Element, Map<string, boolean>>()
  let appearanceScope: ReturnType<typeof effectScope> | undefined

  function stopAppearance() {
    if (!appearanceScope)
      return
    appearanceScope.stop()
    appearanceScope = undefined
    stopDarkState()
    root.classList.remove('bewly-design', 'bewly-native-fonts')
    for (const [element, classes] of originalClasses) {
      for (const [name, enabled] of classes)
        element.classList.toggle(name, enabled)
    }
    originalClasses.clear()
    for (const [key, value, priority] of originalProperties) {
      if (value)
        root.style.setProperty(key, value, priority)
      else root.style.removeProperty(key)
    }
  }

  scope.run(() => {
    watch([settings.displayReady, settingsInitializationState, () => settings.value.adaptToOtherPageStyles, () => settings.value.blockAds], ([ready, state, enabled, blockAds]) => {
      const available = ready && state !== 'invalidated'
      root.classList.toggle('block-useless-contents', available && blockAds)
      if (!available || !enabled || preserveNativeDesign) {
        stopAppearance()
        return
      }
      if (appearanceScope)
        return
      originalProperties = appearanceProperties.map(key => [key, root.style.getPropertyValue(key), root.style.getPropertyPriority(key)])
      for (const element of [root, document.body].filter((element): element is HTMLElement => Boolean(element)))
        originalClasses.set(element, new Map(['dark', 'oled-dark', 'bili_dark'].map(name => [name, element.classList.contains(name)])))
      root.classList.add('bewly-design')
      appearanceScope = effectScope(true)
      appearanceScope.run(() => {
        const mangaClassify = site === 'manga' && /^\/classify\/?$/.test(location.pathname)
        const app = document.getElementById(mangaClassify ? 'main-stage' : site === 'live-center' ? 'live-center-app' : site === 'music-rank' ? 'root' : 'app')
          ?? (site === 'live-center' ? document.getElementById('app') : null)
        const keyboardPage = site === 'live' && /^\/(?:all|lol)\/?$/.test(location.pathname)
          ? 'live-directory'
          : site === 'game' && /^\/platform\/mine(?:\/|$)/.test(location.pathname)
            ? 'game-personal'
            : site === 'game' && /^\/platform\/ranks(?:\/|$)/.test(location.pathname)
              ? 'game-ranks'
              : site === 'game' && /^\/(?:kf|jiazhang)(?:\/|$)/.test(location.pathname)
                ? 'game-help'
                : site === 'security-public' && document.querySelector('.error-container')
                  ? 'error404'
                  : site === 'topics' || site === 'academy' || site === 'materials' || site === 'music-portal' || site === 'music-rank' || site === 'downloads' || site === 'creator-promotion' || site === 'creator-data' || site === 'customer-service' || site === 'jobs-public'
                    ? site
                    : undefined
        if (app && mangaClassify) {
          onScopeDispose(setupNativePageKeyboard(app, 'manga-classify'))
        }
        else if (site === 'manga' && /^\/account-center(?:\/|$)/.test(location.pathname) && document.body) {
          // The native account app replaces its mount element and reuses the
          // body across its account routes. Only its observed read filters match.
          onScopeDispose(setupNativePageKeyboard(document.body, 'manga-account'))
        }
        // These native Vue shells can replace #app after DOMContentLoaded. Keep
        // the same scoped keyboard observer on the stable document container.
        else if ((site === 'love' || site === 'wallet' || site === 'game-gifts' || site === 'game-payment') && document.body) {
          onScopeDispose(setupNativePageKeyboard(document.body, site === 'love' ? 'charity' : site))
        }
        else if (site === 'live-center' && (location.pathname.startsWith('/p/help/') || /^\/p\/eden\/download\/?$/.test(location.pathname)) && document.body) {
          onScopeDispose(setupNativePageKeyboard(document.body, site))
        }
        else if (app && (site === 'activities' || site === 'live-center' || site === 'season-media')) {
          onScopeDispose(setupNativePageKeyboard(app, site))
        }
        else if (site === 'game-wiki') {
          // Only the platform's static catalogue needs click-only tab activation.
          // Keep its observer away from the hero, counters and author wiki pages.
          const catalogue = document.querySelector<HTMLElement>('.resp-tabs')
          if (catalogue)
            onScopeDispose(setupNativePageKeyboard(catalogue, site))
        }
        else if (site === 'investor-public') {
          // IR uses server-rendered documents. Its tab workspace is stable and
          // excludes the animated hero, counters and external iframe documents.
          const workspace = document.querySelector<HTMLElement>('.tabcontent-container')
          if (workspace) {
            // Native Bootstrap already owns focus/trapping and return focus.
            // Its server-rendered modal roots omit the tabindex needed by focus().
            const dialogs = Array.from(workspace.querySelectorAll<HTMLElement>('.management-modal:not([tabindex])'))
            for (const dialog of dialogs)
              dialog.tabIndex = -1
            onScopeDispose(() => {
              for (const dialog of dialogs) {
                if (dialog.getAttribute('tabindex') === '-1')
                  dialog.removeAttribute('tabindex')
              }
            })
            onScopeDispose(setupNativePageKeyboard(workspace, site))
          }
        }
        // These independent Vue applications can replace their initial mount
        // element. Keep one controller on the stable body and its narrow selectors.
        else if (keyboardPage && document.body) {
          // These catalogues retain their static #app / #root. Keep their
          // observer off the native header, chat and payment overlays.
          const keyboardRoot = keyboardPage === 'live-directory' || keyboardPage === 'music-rank' || keyboardPage === 'game-ranks' ? app : document.body
          if (keyboardRoot)
            onScopeDispose(setupNativePageKeyboard(keyboardRoot, keyboardPage))
        }
        const { isDark } = useDark({ observeRoute: false, syncNativeTheme: false })
        watch([() => settings.value.customizeFont, () => settings.value.fontFamily], ([mode, family]) => {
          root.classList.toggle('bewly-native-fonts', mode !== 'default')
          if (mode === 'default')
            root.style.removeProperty('--bew-native-font-family')
          else root.style.setProperty('--bew-native-font-family', mode === 'custom' && family ? family : 'var(--bew-fonts)')
        }, { immediate: true })
        watch([() => settings.value.themeColor, isDark, () => settings.value.darkModeBaseColor, () => settings.value.enableOledDarkMode], ([themeColor, dark]) => {
          const tokens = getThemeColorTokens(themeColor, dark, readThemeContrastSurfaces(root))
          root.style.setProperty('--bew-theme-color', tokens.theme)
          root.style.setProperty('--bew-on-theme-color', tokens.onTheme)
          root.style.setProperty('--bew-theme-checkmark-image', tokens.checkmarkImage)
          root.style.setProperty('--bew-switch-thumb-active', tokens.switchThumb)
          root.style.setProperty('--bew-theme-foreground', tokens.foreground)
          root.style.setProperty('--bew-theme-focus-ring', tokens.focusRing)
        }, { immediate: true, flush: 'post' })
      })
    }, { immediate: true })
  })

  return () => {
    scope.stop()
    stopAppearance()
    root.classList.remove('block-useless-contents')
    delete root.dataset.bewlyNativeSite
  }
}
