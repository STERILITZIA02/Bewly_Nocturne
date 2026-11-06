import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { parseAllDocuments } from 'yaml'

const require = createRequire(import.meta.url)
// Exact upstream fixes, backported without the breaking minimatch 11 API change.
const backports = [
  {
    name: 'minimatch',
    version: '10.2.6',
    parent: 'eslint',
    file: 'index.js',
    advisory: 'GHSA-g3hv-75wg-m249',
    commit: '77a0f5c4b80bdc641c3c930a1d9edf5ad2db57f8',
    hashes: [
      'b5665e0682c95482f9f0f2fcb3c0e094f3a5118bc09bfcc230004472cc485218',
      'df62b5058f6b4077d524f0717bad0b8ea525865783535aaa029bc7e113f85ca0',
    ],
  },
  {
    name: 'glob',
    version: '13.0.6',
    parent: '@ffflorian/jszip-cli',
    file: 'walker.js',
    advisory: 'GHSA-3g3m-2fjr-6pw4',
    commit: '4682e8c9babee1b385202ede36389634e12076d7',
    hashes: [
      '8afedbdf3bb2bddaf37ee3ef4b393b76a5a99c80ef12aaedd2160a77c2effadb',
      '4eca6e1f2fd9c9ef7469977a12c7e9bd6503bc7a9257ccdc8e79b346ec34fccd',
    ],
  },
]
const lock = parseAllDocuments(
  await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'),
)
  .map(document => document.toJS())
  .find(document => document.patchedDependencies)
for (const patch of backports) {
  const id = `${patch.name}@${patch.version}`
  const hash = lock.patchedDependencies[id]
  assert.equal(typeof hash, 'string', `${id} must retain its security patch`)
  const snapshots = Object.keys(lock.snapshots).filter(
    key => key === id || key.startsWith(`${id}(`),
  )
  assert.ok(
    snapshots.length
    && snapshots.every(key => key.includes(`patch_hash=${hash}`)),
    `${id} has an unpatched resolution`,
  )
  const fromParent = createRequire(
    require.resolve(`${patch.parent}/package.json`),
  )
  const packagePath = fromParent.resolve(`${patch.name}/package.json`)
  assert.equal(
    JSON.parse(await readFile(packagePath, 'utf8')).version,
    patch.version,
  )
  for (const [index, build] of ['esm', 'commonjs'].entries()) {
    const file = path.join(
      path.dirname(packagePath),
      'dist',
      build,
      patch.file,
    )
    assert.equal(
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
      patch.hashes[index],
      `${id}/${build} differs from the reviewed backport`,
    )
    const module = await import(pathToFileURL(file).href)
    if (patch.name === 'minimatch') {
      const matcher = new module.Minimatch('**/x/../'.repeat(20), {
        optimizationLevel: 2,
        braceExpandMax: 16,
      })
      assert.ok(matcher.globParts.length <= 16)
      let comparisons = 0
      matcher.partsMatch = () => {
        comparisons++
        return false
      }
      const parts = Array.from({ length: 1001 }, (_, i) => [String(i)])
      assert.equal(matcher.secondPhasePreProcess(parts), parts)
      assert.equal(comparisons, 0)
    }
    else {
      const signal = AbortSignal.abort()
      let callbacks = 0
      const owner = {
        signal,
        walkCB2() {
          assert.fail('aborted traversal')
        },
        walkCB2Sync() {
          assert.fail('aborted traversal')
        },
      }
      for (const method of ['walkCB', 'walkCBSync']) {
        module.GlobWalker.prototype[method].call(
          owner,
          null,
          [],
          () => callbacks++,
        )
      }
      assert.equal(callbacks, 2)
    }
  }
  console.log(`Verified ${id}: ${patch.advisory}, upstream ${patch.commit}`)
}

// Keep the registry's unfiltered result. A backport is accepted only for this
// advisory and version after both installed builds and every lock entry pass.
const result = spawnSync('pnpm', ['audit', '--json', '--audit-level', 'low'], {
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
})
if (result.error)
  throw result.error
assert.ok(
  result.status === 0 || result.status === 1,
  result.stderr || 'Audit command failed',
)
const audit = JSON.parse(result.stdout)
assert.ok(audit.advisories && !audit.error, 'Registry audit unavailable')
let unresolved = 0
for (const advisory of Object.values(audit.advisories)) {
  const patch = backports.find(
    item =>
      item.advisory === advisory.github_advisory_id
      && item.name === advisory.module_name,
  )
  const covered
    = patch
      && advisory.findings.length > 0
      && advisory.findings.every(finding => finding.version === patch.version)
  console.log(
    `${covered ? 'BACKPORTED' : 'UNRESOLVED'} ${advisory.severity} ${advisory.github_advisory_id}: ${advisory.title}`,
  )
  if (!covered)
    unresolved++
}
process.exitCode = unresolved ? 1 : 0
