<script setup lang="ts">
import Button from '~/components/Button.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import type { BundleLicenseIndex, BundleLicensePackage, BundleLicenseReport } from '~/utils/bundleLicenseTypes'
import { getExtensionAssetUrl } from '~/utils/messaging'

const props = defineProps<{ kind: 'project' | 'thirdParty' }>()
const controller = new AbortController()
onScopeDispose(() => controller.abort())
const loading = ref(true)
const failed = ref(false)
const projectText = ref('')
const issues = shallowRef<string[]>([])
const missingEntries = shallowRef<string[]>([])
type Package = BundleLicensePackage & { entries: string[] }
const packages = shallowRef<Package[]>([])
const expandedId = ref('')
const loadingText = ref(false)
const textFailed = ref(false)
const licenseTexts = shallowRef<{ name: string, text: string }[]>([])
const textCache = new Map<string, { name: string, text: string }[]>()
let textRevision = 0

async function readAsset(asset: string) {
  const response = await fetch(getExtensionAssetUrl(`/assets/licenses/${asset}`), { signal: controller.signal })
  if (!response.ok)
    throw new Error('License asset unavailable')
  return response.text()
}

async function load() {
  loading.value = true
  failed.value = false
  issues.value = []
  missingEntries.value = []
  try {
    const index: BundleLicenseIndex = JSON.parse(await readAsset('index.json'))
    if (index.schema !== 1 || !Array.isArray(index.entries) || !index.entries.length)
      throw new Error('Invalid license index')
    if (props.kind === 'project') {
      if (!index.project)
        throw new Error('Project license unavailable')
      projectText.value = await readAsset(index.project)
      return
    }
    const reports = await Promise.allSettled(index.entries.map(async ({ asset, entry }) => {
      const report: BundleLicenseReport = JSON.parse(await readAsset(asset))
      if (report.schema !== 1 || report.entry !== entry || !Array.isArray(report.packages) || !Array.isArray(report.issues))
        throw new Error('Invalid license entry report')
      return report
    }))
    const merged = new Map<string, Package>()
    const missing: string[] = []
    const entryIssues: string[] = []
    reports.forEach((result, position) => {
      const entry = index.entries[position].entry
      if (result.status !== 'fulfilled') {
        missing.push(entry)
        return
      }
      entryIssues.push(...result.value.issues.map(issue => `${entry}: ${issue}`))
      for (const item of result.value.packages) {
        const previous = merged.get(item.id)
        if (previous) {
          previous.entries.push(entry)
          previous.files = [...new Map([...previous.files, ...item.files].map(file => [file.asset, file])).values()]
          previous.issues = [...new Set([...previous.issues, ...item.issues])]
        }
        else {
          merged.set(item.id, { ...item, entries: [entry] })
        }
      }
    })
    issues.value = entryIssues
    missingEntries.value = missing
    packages.value = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name) || `${a.version}`.localeCompare(`${b.version}`))
  }
  catch {
    if (!controller.signal.aborted)
      failed.value = true
  }
  finally {
    loading.value = false
  }
}

async function showText(item: Package) {
  const revision = ++textRevision
  expandedId.value = expandedId.value === item.id ? '' : item.id
  licenseTexts.value = []
  textFailed.value = false
  loadingText.value = false
  if (!expandedId.value)
    return
  if (textCache.has(item.id)) {
    licenseTexts.value = textCache.get(item.id)!
    return
  }
  loadingText.value = true
  try {
    const texts = await Promise.all(item.files.map(async file => ({ name: file.name, text: await readAsset(file.asset) })))
    if (revision !== textRevision)
      return
    textCache.set(item.id, texts)
    licenseTexts.value = texts
  }
  catch {
    if (!controller.signal.aborted && revision === textRevision)
      textFailed.value = true
  }
  finally {
    if (revision === textRevision)
      loadingText.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="license-panel">
    <LoadingRing v-if="loading" :loading="loading" :aria-label="$t('settings.licenses_loading')" role="status" />
    <div v-else-if="failed" role="alert">
      <p>{{ $t('settings.licenses_failed') }}</p>
      <Button type="secondary" @click="load">
        {{ $t('common.retry') }}
      </Button>
    </div>
    <pre v-else-if="kind === 'project'" class="license-panel__text">{{ projectText }}</pre>
    <template v-else>
      <p class="bew-help">
        {{ $t('settings.licenses_summary') }}
      </p>
      <div v-if="issues.length || missingEntries.length" role="status">
        <p>{{ $t('settings.licenses_incomplete') }}</p>
        <ul>
          <li v-for="entry in missingEntries" :key="entry">
            {{ $t('settings.licenses_entry_missing') }}: {{ entry }}
          </li>
          <li v-for="issue in issues" :key="issue">
            {{ issue }}
          </li>
        </ul>
      </div>
      <section v-for="item in packages" :key="item.id" class="license-panel__package">
        <Button type="tertiary" :aria-expanded="expandedId === item.id" @click="showText(item)">
          {{ item.name }} · {{ item.version || $t('settings.licenses_unknown') }} · {{ item.license || $t('settings.licenses_unknown') }}
        </Button>
        <p class="bew-help">
          {{ $t('settings.licenses_sources') }}: {{ item.entries.join(', ') }}
        </p>
        <p v-if="item.issues.length" class="bew-help">
          {{ $t('settings.licenses_incomplete') }}: {{ item.issues.join('; ') }}
        </p>
        <div v-if="expandedId === item.id">
          <LoadingRing v-if="loadingText" :loading="loadingText" :aria-label="$t('settings.licenses_loading')" role="status" />
          <p v-else-if="textFailed" role="alert">
            {{ $t('settings.licenses_failed') }}
          </p>
          <p v-else-if="!licenseTexts.length">
            {{ $t('settings.licenses_text') }}: {{ $t('settings.licenses_unknown') }}
          </p>
          <template v-for="file in licenseTexts" v-else :key="file.name">
            <p class="bew-section-label">
              {{ file.name }}
            </p>
            <pre class="license-panel__text">{{ file.text }}</pre>
          </template>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.license-panel {
  display: grid;
  gap: var(--bew-space-4);
}
.license-panel__package {
  display: grid;
  gap: var(--bew-space-2);
  min-width: 0;
}
.license-panel__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-autospace: no-autospace;
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
  color: var(--bew-text-2);
}
</style>
