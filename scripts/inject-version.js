#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))
const htmlPath = join(__dirname, '../docs/index.html')

let html = readFileSync(htmlPath, 'utf-8')

// Replace version badge in hero section (e.g., "v0.0.12" → "v0.0.13")
html = html.replace(/v\d+\.\d+\.\d+/g, `v${pkg.version}`)

writeFileSync(htmlPath, html, 'utf-8')

console.log(`✅ Injected version ${pkg.version} into docs/index.html`)
