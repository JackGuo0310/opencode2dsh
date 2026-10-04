import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

interface PackageManifest {
  name: string
  version: string
  dsh: { bundle: { patch: string } }
  peerDependencies: Record<string, string>
  peerDependenciesMeta: Record<string, { optional?: boolean }>
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest
const DSH_PEERS = Object.keys(manifest.peerDependencies)
  .filter(name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
const RANGE = '>=0.2.1-alpha.1 <0.3'

test('DSH peer requirements are pinned to the supported 0.2 release line', () => {
  assert.ok(DSH_PEERS.includes('@deepseek-ai/dsh'))

  for (const name of DSH_PEERS) {
    assert.equal(manifest.peerDependencies[name], RANGE, `${name} has an unexpected DSH version range`)
    assert.equal(manifest.peerDependenciesMeta[name]?.optional, true, `${name} must be an optional host-provided peer`)
  }
})

test('compatibility declaration is present in the published manifest', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(Object.keys(manifest.peerDependencies).length, DSH_PEERS.length)
})

test('the manifest version matches the v-tag of the current commit', () => {
  // DSH's plugin manager shows the manifest version, so a release tag that
  // does not bump it is indistinguishable from the previous one. v1.0.10 was
  // tagged with the manifest still at 1.0.9; this pins the two together.
  // `git describe --exact-match` exits non-zero off a tag (it does not print
  // an empty line), so the untagged case is a caught failure, not a value.
  let head: string
  try {
    head = execFileSync('git', ['describe', '--tags', '--exact-match'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return // HEAD is not tagged: nothing to compare against
  }
  assert.equal(head, `v${manifest.version}`, `tag ${head} must match package.json version ${manifest.version}`)
})
