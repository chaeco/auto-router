#!/usr/bin/env node
/**
 * Single-source version bump for @chaeco/auto-router.
 *
 * Reads the target version from the `version` field of package.json (edit it
 * there first), then keeps every version-bearing artifact in sync:
 *
 *   - package.json      (source of truth — already set by the user)
 *   - package-lock.json (root self-reference at the top level and packages[""])
 *   - docs/index.html   (hero version badge, same as `build:docs` injects)
 *
 * Usage:
 *   npm run bump   # reads the new version from package.json
 */
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const semver = /^\d+\.\d+\.\d+$/

function fail(message) {
  console.error(message)
  process.exit(1)
}

// --- package.json (source of truth) ---
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version
if (typeof version !== 'string' || !semver.test(version)) {
  fail(`❌ Invalid version in package.json: "${String(version)}" — expected semver like 1.2.3`)
}

// --- package-lock.json ---
// npm writes the package version twice in lock v3: at the top level and under
// packages[""]. A manually edited package.json leaves the lockfile behind —
// exactly the drift that happened at v0.1.0 (lock stayed at 0.0.14). Both
// self-references sit at the very front of the file; every later occurrence of
// the old version string is a third-party dependency and must NOT be touched,
// so we replace only the first two matches.
const lockPath = join(root, 'package-lock.json')
const lockSource = readFileSync(lockPath, 'utf-8')
const lockVersion = JSON.parse(lockSource).version
if (typeof lockVersion !== 'string' || !semver.test(lockVersion)) {
  fail('❌ Cannot read a valid version from package-lock.json — aborting')
}

if (lockVersion !== version) {
  const before = `"version": "${lockVersion}"`
  const after = `"version": "${version}"`

  let replaced = 0
  const updated = lockSource.replace(before, () => {
    replaced++
    return after
  })
  // Re-run against the result: the first replacement changed the top-level
  // field, leaving only the packages[""] self-reference still matching.
  const updatedFinal = updated.replace(before, () => {
    replaced++
    return after
  })

  if (replaced === 0) {
    fail(`❌ Version string "${lockVersion}" not found in package-lock.json`)
  }
  if (replaced < 2) {
    fail(`❌ Found only ${replaced} root version field(s), expected 2 — package-lock.json may be corrupted`)
  }
  writeFileSync(lockPath, updatedFinal, 'utf-8')
  console.log(`✅ package-lock.json: ${lockVersion} → ${version}`)
} else {
  console.log(`✅ package-lock.json already at ${version} — nothing to change`)
}

// --- docs/index.html hero badge ---
const htmlPath = join(root, 'docs/index.html')
const html = readFileSync(htmlPath, 'utf-8')
if (!/v\d+\.\d+\.\d+/.test(html)) {
  console.warn('⚠️  No version badge (vX.Y.Z) found in docs/index.html — skipped')
} else {
  writeFileSync(htmlPath, html.replace(/v\d+\.\d+\.\d+/g, `v${version}`), 'utf-8')
  console.log(`✅ docs/index.html badge → v${version}`)
}