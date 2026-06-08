#!/usr/bin/env node
/**
 * init-skills — Copy auto-router AI skills into the target project.
 *
 * Usage:
 *   npx @chaeco/auto-router init-skills          # copies to cwd
 *   npx @chaeco/auto-router init-skills /my/app   # copies to /my/app
 *
 * Copies:
 *   .claude/skills/auto-router/  →  <target>/.claude/skills/auto-router/
 *   .codex/skills/auto-router/   →  <target>/.codex/skills/auto-router/
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_NAME = 'auto-router'
const PLATFORMS = ['.claude', '.codex']

/** Path to the installed package root (where package.json lives). */
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = resolve(__dirname, '..')

/** Target project root — CLI arg or cwd. */
const targetRoot = resolve(process.argv[2] || process.cwd())

for (const platform of PLATFORMS) {
  const src = join(pkgRoot, platform, 'skills', SKILL_NAME)
  const dest = join(targetRoot, platform, 'skills', SKILL_NAME)

  if (!existsSync(src)) {
    console.warn(`⚠  Source not found: ${src} — skipping ${platform}`)
    continue
  }

  if (existsSync(dest)) {
    console.log(`⏭  ${platform} skill already exists: ${dest} (skipped)`)
    continue
  }

  mkdirSync(join(targetRoot, platform, 'skills'), { recursive: true })
  cpSync(src, dest, { recursive: true })

  const files = ['SKILL.md', 'REFERENCE.md', 'EXAMPLES.md']
    .filter(f => existsSync(join(dest, f)))
    .join(', ')

  console.log(`✅ ${platform}/skills/${SKILL_NAME}/ → ${dest}  (${files})`)
}

console.log('\nDone. AI tools in this project can now use the auto-router skill.')
