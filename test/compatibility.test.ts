import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

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
const RANGE = '>=0.1.7-rc.1 <0.1.8'

test('DSH peer requirements are pinned to the supported 0.1.7 release line', () => {
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
