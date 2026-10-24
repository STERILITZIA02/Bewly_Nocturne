export const VITE_SCRIPT_ENTRIES = {
  content: 'src/contentScripts/index.ts',
  inject: 'src/inject/index.ts',
  native: 'src/contentScripts/nativeAppearance.ts',
} as const

export function getBackgroundEntries(dev: boolean) {
  return {
    'background/index': './src/background/index.ts',
    'contentScripts/pageLoading': './src/contentScripts/pageLoading.ts',
    'regex/host': './src/regex/host.ts',
    'regex/worker': './src/regex/worker.ts',
    ...(dev ? { mv3client: './scripts/client.ts' } : {}),
  }
}
