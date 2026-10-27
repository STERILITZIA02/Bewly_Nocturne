import type { AppearancePalette } from './appearance'
import { CODEX_THEME_NAMES } from './appearanceThemeNames'

export interface AppearanceThemePalette extends AppearancePalette {
  accent: string
}
export interface AppearancePreset {
  id: string
  name?: string
  light?: AppearanceThemePalette
  dark?: AppearanceThemePalette
}

// Palette data from the installed Codex theme registry (2026-10-27).
// Only color seeds are carried over; surface derivation remains Nocturne-owned.
export const CODEX_APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  { 'id': 'absolutely', 'name': CODEX_THEME_NAMES.absolutely, 'light': { 'accent': '#cc7d5e', 'background': '#f9f9f7', 'foreground': '#2d2d2b' }, 'dark': { 'accent': '#cc7d5e', 'background': '#2d2d2b', 'foreground': '#f9f9f7' } },
  { 'id': 'ayu', 'name': CODEX_THEME_NAMES.ayu, 'dark': { 'accent': '#e6b450', 'background': '#10141c', 'foreground': '#bfbdb6' } },
  { 'id': 'catppuccin', 'name': CODEX_THEME_NAMES.catppuccin, 'light': { 'accent': '#8839ef', 'background': '#eff1f5', 'foreground': '#4c4f69' }, 'dark': { 'accent': '#cba6f7', 'background': '#1e1e2e', 'foreground': '#cdd6f4' } },
  { 'id': 'codex', 'name': CODEX_THEME_NAMES.codex, 'light': { 'accent': '#0169cc', 'background': '#ffffff', 'foreground': '#0d0d0d' }, 'dark': { 'accent': '#0169cc', 'background': '#111111', 'foreground': '#fcfcfc' } },
  { 'id': 'dracula', 'name': CODEX_THEME_NAMES.dracula, 'dark': { 'accent': '#ff79c6', 'background': '#282a36', 'foreground': '#f8f8f2' } },
  { 'id': 'everforest', 'name': CODEX_THEME_NAMES.everforest, 'light': { 'accent': '#93b259', 'background': '#fdf6e3', 'foreground': '#5c6a72' }, 'dark': { 'accent': '#a7c080', 'background': '#2d353b', 'foreground': '#d3c6aa' } },
  { 'id': 'github', 'name': CODEX_THEME_NAMES.github, 'light': { 'accent': '#0969da', 'background': '#ffffff', 'foreground': '#1f2328' }, 'dark': { 'accent': '#1f6feb', 'background': '#0d1117', 'foreground': '#e6edf3' } },
  { 'id': 'gruvbox', 'name': CODEX_THEME_NAMES.gruvbox, 'light': { 'accent': '#458588', 'background': '#fbf1c7', 'foreground': '#3c3836' }, 'dark': { 'accent': '#458588', 'background': '#282828', 'foreground': '#ebdbb2' } },
  { 'id': 'linear', 'name': CODEX_THEME_NAMES.linear, 'light': { 'accent': '#5e6ad2', 'background': '#fcfcfd', 'foreground': '#1b1b1b' }, 'dark': { 'accent': '#606acc', 'background': '#0f0f11', 'foreground': '#e3e4e6' } },
  { 'id': 'lobster', 'name': CODEX_THEME_NAMES.lobster, 'dark': { 'accent': '#ff5c5c', 'background': '#111827', 'foreground': '#e4e4e7' } },
  { 'id': 'material', 'name': CODEX_THEME_NAMES.material, 'dark': { 'accent': '#80cbc4', 'background': '#212121', 'foreground': '#eeffff' } },
  { 'id': 'matrix', 'name': CODEX_THEME_NAMES.matrix, 'dark': { 'accent': '#1eff5a', 'background': '#040805', 'foreground': '#b8ffca' } },
  { 'id': 'monokai', 'name': CODEX_THEME_NAMES.monokai, 'dark': { 'accent': '#99947c', 'background': '#272822', 'foreground': '#f8f8f2' } },
  { 'id': 'night_owl', 'name': CODEX_THEME_NAMES.night_owl, 'dark': { 'accent': '#44596b', 'background': '#011627', 'foreground': '#d6deeb' } },
  { 'id': 'nord', 'name': CODEX_THEME_NAMES.nord, 'dark': { 'accent': '#88c0d0', 'background': '#2e3440', 'foreground': '#d8dee9' } },
  { 'id': 'notion', 'name': CODEX_THEME_NAMES.notion, 'light': { 'accent': '#3183d8', 'background': '#ffffff', 'foreground': '#37352f' }, 'dark': { 'accent': '#3183d8', 'background': '#191919', 'foreground': '#d9d9d8' } },
  { 'id': 'og', 'name': CODEX_THEME_NAMES.og, 'dark': { 'accent': '#10a37f', 'background': '#343541', 'foreground': '#d1d5db' } },
  { 'id': 'one', 'name': CODEX_THEME_NAMES.one, 'light': { 'accent': '#526fff', 'background': '#fafafa', 'foreground': '#383a42' }, 'dark': { 'accent': '#4d78cc', 'background': '#282c34', 'foreground': '#abb2bf' } },
  { 'id': 'oscurange', 'name': CODEX_THEME_NAMES.oscurange, 'dark': { 'accent': '#f9b98c', 'background': '#0b0b0f', 'foreground': '#e6e6e6' } },
  { 'id': 'proof', 'name': CODEX_THEME_NAMES.proof, 'light': { 'accent': '#3d755d', 'background': '#f5f3ed', 'foreground': '#2f312d' } },
  { 'id': 'raycast', 'name': CODEX_THEME_NAMES.raycast, 'light': { 'accent': '#ff6363', 'background': '#ffffff', 'foreground': '#030303' }, 'dark': { 'accent': '#ff6363', 'background': '#101010', 'foreground': '#fefefe' } },
  { 'id': 'rose_pine', 'name': CODEX_THEME_NAMES.rose_pine, 'light': { 'accent': '#d7827e', 'background': '#faf4ed', 'foreground': '#575279' }, 'dark': { 'accent': '#ea9a97', 'background': '#232136', 'foreground': '#e0def4' } },
  { 'id': 'sentry', 'name': CODEX_THEME_NAMES.sentry, 'dark': { 'accent': '#7055f6', 'background': '#2d2935', 'foreground': '#e6dff9' } },
  { 'id': 'solarized', 'name': CODEX_THEME_NAMES.solarized, 'light': { 'accent': '#b58900', 'background': '#fdf6e3', 'foreground': '#657b83' }, 'dark': { 'accent': '#d30102', 'background': '#002b36', 'foreground': '#839496' } },
  { 'id': 'temple', 'name': CODEX_THEME_NAMES.temple, 'dark': { 'accent': '#e4f222', 'background': '#02120c', 'foreground': '#c7e6da' } },
  { 'id': 'tokyo_night', 'name': CODEX_THEME_NAMES.tokyo_night, 'dark': { 'accent': '#3d59a1', 'background': '#1a1b26', 'foreground': '#a9b1d6' } },
  { 'id': 'vercel', 'name': CODEX_THEME_NAMES.vercel, 'light': { 'accent': '#006aff', 'background': '#ffffff', 'foreground': '#171717' }, 'dark': { 'accent': '#006efe', 'background': '#000000', 'foreground': '#ededed' } },
  { 'id': 'vscode_plus', 'name': CODEX_THEME_NAMES.vscode_plus, 'light': { 'accent': '#007acc', 'background': '#ffffff', 'foreground': '#000000' }, 'dark': { 'accent': '#007acc', 'background': '#1e1e1e', 'foreground': '#d4d4d4' } },
  { 'id': 'xcode', 'name': CODEX_THEME_NAMES.xcode, 'light': { 'accent': '#0e0eff', 'background': '#ffffff', 'foreground': '#000000' }, 'dark': { 'accent': '#5482ff', 'background': '#1f1f24', 'foreground': '#ffffff' } },
]
