import fs from 'fs-extra'
import type { Manifest } from 'webextension-polyfill'

import type PkgType from '../package.json'
import { isDev, isSafari, port, r } from '../scripts/utils'
import { CONTENT_SCRIPT_EXCLUDE_MATCHES, CONTENT_SCRIPT_MATCHES } from './constants/contentScript'

export async function getManifest() {
  const pkg = await fs.readJSON(r('package.json')) as typeof PkgType

  // update this file to update this manifest.json
  // can also be conditional based on your need
  const manifest: Manifest.WebExtensionManifest = {
    manifest_version: 3,
    name: `${pkg.displayName || pkg.name}${isDev ? ' Dev' : ''}`,
    version: pkg.version,
    description: pkg.description,
    homepage_url: pkg.homepage,
    background: isSafari
      ? { scripts: ['./dist/background/index.js'], persistent: false }
      : { service_worker: './dist/background/index.js', type: 'module' },

    icons: {
      16: 'assets/icon-512.png',
      48: 'assets/icon-512.png',
      128: 'assets/icon-512.png',
    },
    permissions: [
      'storage',
      'declarativeNetRequest',
      'cookies',
      ...(!isSafari ? ['scripting'] : []),
    ],
    host_permissions: [
      '*://*.bilibili.com/*',
      '*://*.hdslb.com/*',
    ],
    content_scripts: [
      {
        matches: [...CONTENT_SCRIPT_MATCHES],
        exclude_matches: [...CONTENT_SCRIPT_EXCLUDE_MATCHES],
        js: ['./dist/contentScripts/index.global.js'],
        css: ['./dist/contentScripts/style.css'],
        run_at: 'document_start',
        match_about_blank: true,
        all_frames: true,
      },
      {
        matches: [...CONTENT_SCRIPT_MATCHES],
        exclude_matches: [...CONTENT_SCRIPT_EXCLUDE_MATCHES],
        js: ['./dist/contentScripts/inject.global.js'],
        run_at: 'document_start',
        match_about_blank: true,
        all_frames: true,
        world: 'MAIN',
      },
    ],
    web_accessible_resources: [
      {
        resources: [
          'dist/contentScripts/style.css',
          'assets/*',
        ],
        matches: ['<all_urls>'],
        // matches: ['./assets/*'],
      },
    ],
    content_security_policy: {
      extension_pages: isDev
      // this is required on dev for Vite script to load
        ? `script-src 'self' http://localhost:${port}; object-src 'self' http://localhost:${port}`
        : 'script-src \'self\'; object-src \'self\'',
    },
    declarative_net_request: {
      rule_resources: [
        {
          id: 'ruleset_1',
          enabled: true,
          path: 'assets/rules.json',
        },
      ],
    },
  }

  if (isDev)
    manifest.permissions?.push('webNavigation')

  return manifest
}
