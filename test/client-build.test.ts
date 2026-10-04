/**
 * Client-bundle build check (dsh-llm-proxy's client-build.test.js adapted):
 * verifies lib/client.js exists (run `pnpm build:client` first) and carries
 * the loader handoff, the plugin id, the settings.plugin.item card
 * registration keyed by the ip-pool namespace, the apply/inject exports the
 * shell expects, and that the bridge URL is baked in.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

test('client bundle is built and well-formed', () => {
  const path = new URL('../lib/client.js', import.meta.url)
  assert.ok(existsSync(path), 'lib/client.js missing — run `pnpm build:client` first')
  const source = readFileSync(path, 'utf8')
  assert.ok(source.includes('window.__ModuleLoader__.load'), 'loader handoff present')
  assert.ok(source.includes('"@jackguo0310/opencode2dsh"'), 'scoped bundle id stamped')
  assert.ok(source.includes('settings.plugin.item'), 'settings.plugin.item card registration present')
  // The slot's kind is keyed on DSH >= 0.1.0-rc.7 and list (id-keyed) on older
  // builds; the card probes ctx.slots.spec and shapes the registration for
  // whichever era this host declared, so both forms must be in the bundle.
  assert.ok(/id:\s*SETTINGS_NAMESPACE/.test(source), 'list-era registration shape (options.id) present')
  assert.ok(/key:\s*SETTINGS_NAMESPACE/.test(source), 'keyed registration shape (options.key) present')
  // A rejected card must not kill the plugin fiber (the boot screen lists the
  // whole plugin as failed) — the registration is contained with a warn.
  assert.ok(source.includes('settings card rejected'), 'registration failure is contained, not fatal')
  assert.ok(source.includes('/api/opencode2dsh/ip-pool'), 'bridge prefix baked in')
  assert.ok(/exports\.apply\s*=/.test(source), 'apply exported')
  assert.ok(/exports\.inject\s*=/.test(source), 'inject exported')
})

test('client externals stay inside the host platform module table', () => {
  const path = new URL('../lib/client.js', import.meta.url)
  assert.ok(existsSync(path), 'lib/client.js missing — run `pnpm build:client` first')
  const source = readFileSync(path, 'utf8')
  const required = [...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]!)
  // The allowlist lives in tsdown.client.config.ts, which is the single place
  // that declares what the host seeds. Asserting against a copy here would let
  // the two drift on a DSH upgrade — the exact failure this guards against.
  const config = readFileSync(new URL('../tsdown.client.config.ts', import.meta.url), 'utf8')
  const declared = new Set([...config.matchAll(/'([^']+)'/g)].map((m) => m[1]!))
  for (const specifier of required) {
    assert.ok(
      declared.has(specifier),
      `bundle requires "${specifier}" which the build config does not declare as a host module — it would miss at runtime`,
    )
  }
})

test('the declared host modules all exist as published packages', () => {
  // dsh-client-runtime has no 0.2.x release; if a future DSH drops it from the
  // preload graph this name becomes a lie and the client half breaks at runtime
  // rather than at build time. Guard the specific externals that are not also
  // core packages.
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/dsh-client-')) continue
    assert.ok(pkg.devDependencies[name] !== undefined, `${name} must declare a version`)
  }
})

test('client manifest is declared in package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(pkg.dsh?.client, 'dsh.client manifest missing')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, ['slots', 'locale', 'settingsScope'])
  assert.deepEqual(pkg.exports?.['./client'], './lib/client.js')
})
