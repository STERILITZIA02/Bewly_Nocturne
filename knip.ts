import type { KnipConfig } from 'knip'

import { getBackgroundEntries, VITE_SCRIPT_ENTRIES } from './scripts/buildEntries'

export default {
  entry: [
    ...Object.values(VITE_SCRIPT_ENTRIES),
    ...Object.values(getBackgroundEntries(true)),
    'scripts/manifest.ts',
    'scripts/prepare.ts',
    'scripts/verify-notification-fixtures.ts',
    'scripts/verify-private-message.ts',
    'scripts/verify-targeted-fixes.ts',
    'scripts/verify-selected-p2.mjs',
    'scripts/verify-visual-editor-browser.mjs',
    'scripts/fixtures/visual-editor.browser.ts',
    'scripts/verify-color-policy.ts',
    'scripts/verify-style-invalidation.ts',
    'scripts/verify-bundle-licenses.ts',
    'scripts/serve-card-window-benchmark.mjs',
  ],
  ignoreExportsUsedInFile: true,
  ignoreDependencies: ['uno.css'],
  rules: {
    types: 'error',
    enumMembers: 'error',
    exports: 'error',
  },
} satisfies KnipConfig
