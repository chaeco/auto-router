import { spawnSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('auto-router-build-manifest CLI', () => {
  let testDir: string
  const cliPath = join(process.cwd(), 'dist', 'build-worker-manifest.js')

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'auto-router-cli-test-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('exits with usage error when missing required arguments', () => {
    const result = spawnSync('node', [cliPath], { encoding: 'utf-8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: auto-router-build-manifest')
    expect(result.stderr).toContain('<controllersDir>')
    expect(result.stderr).toContain('<outputFile>')
  })

  it('exits with usage error when only one argument provided', () => {
    const result = spawnSync('node', [cliPath, testDir], { encoding: 'utf-8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: auto-router-build-manifest')
  })

  it('generates manifest file and outputs success message', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const result = spawnSync('node', [cliPath, controllersDir, outputFile, '--prefix', '/api'], {
      encoding: 'utf-8'
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('✅ Generated:')
    expect(result.stdout).toContain('routes.ts')

    const generatedContent = readFileSync(outputFile, 'utf-8')
    expect(generatedContent).toContain('import type { WorkerManifestRoute }')
    expect(generatedContent).toContain("{ pattern: '/api/users', method: 'GET'")
  })

  it('respects --prefix flag', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const result = spawnSync('node', [cliPath, controllersDir, outputFile, '--prefix', '/v1'], {
      encoding: 'utf-8'
    })

    expect(result.status).toBe(0)
    const generatedContent = readFileSync(outputFile, 'utf-8')
    expect(generatedContent).toContain("{ pattern: '/v1/users', method: 'GET'")
    expect(generatedContent).not.toContain('/api/')
  })

  it('respects --ext flag', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.js'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-posts.ts'), 'export default async (ctx) => {}')

    const result = spawnSync('node', [cliPath, controllersDir, outputFile, '--prefix', '/api', '--ext', 'js'], {
      encoding: 'utf-8'
    })

    expect(result.status).toBe(0)
    const generatedContent = readFileSync(outputFile, 'utf-8')
    expect(generatedContent).toContain('handler_get_users')
    expect(generatedContent).not.toContain('handler_get_posts')
  })

  it('uses default values for --prefix and --ext when not provided', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const result = spawnSync('node', [cliPath, controllersDir, outputFile], {
      encoding: 'utf-8'
    })

    expect(result.status).toBe(0)
    const generatedContent = readFileSync(outputFile, 'utf-8')
    expect(generatedContent).toContain("{ pattern: '/api/users', method: 'GET'") // default prefix /api
    expect(generatedContent).toContain('handler_get_users') // default ext ts
  })

  it('creates output directory if it does not exist', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'deeply', 'nested', 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const result = spawnSync('node', [cliPath, controllersDir, outputFile, '--prefix', '/api'], {
      encoding: 'utf-8'
    })

    expect(result.status).toBe(0)
    expect(readFileSync(outputFile, 'utf-8')).toContain('WorkerManifestRoute')
  })

  it('exits with error when controllers directory does not exist', () => {
    const controllersDir = join(testDir, 'nonexistent')
    const outputFile = join(testDir, 'routes.ts')

    const result = spawnSync('node', [cliPath, controllersDir, outputFile], {
      encoding: 'utf-8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('❌ Error:')
    expect(result.stderr).toContain('Failed to scan directory')
  })

  it('includes regenerate command in generated file header', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    spawnSync('node', [cliPath, controllersDir, outputFile, '--prefix', '/v2', '--ext', 'ts'], {
      encoding: 'utf-8'
    })

    const generatedContent = readFileSync(outputFile, 'utf-8')
    expect(generatedContent).toContain('// Regenerate: npx auto-router-build-manifest')
    expect(generatedContent).toContain('--prefix /v2')
    expect(generatedContent).not.toContain('--ext ts') // ts is default, should be omitted
  })

  it('includes --ext flag in regenerate command when ext is js', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.js'), 'export default async (ctx) => {}')

    spawnSync('node', [cliPath, controllersDir, outputFile, '--prefix', '/api', '--ext', 'js'], {
      encoding: 'utf-8'
    })

    const generatedContent = readFileSync(outputFile, 'utf-8')
    expect(generatedContent).toContain('--ext js')
  })

  it('respects --ignore flags and preserves them in the regenerate command', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(join(controllersDir, '__internal'), { recursive: true })
    writeFileSync(join(controllersDir, '__internal', 'get-secret.ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const result = spawnSync('node', [cliPath, controllersDir, outputFile, '--prefix', '/api', '--ignore', '^__'], {
      encoding: 'utf-8'
    })

    expect(result.status).toBe(0)
    const generatedContent = readFileSync(outputFile, 'utf-8')
    expect(generatedContent).toContain('handler_get_users')
    expect(generatedContent).not.toContain('handler_secret')
    expect(generatedContent).toContain("{ pattern: '/api/users'")
    expect(generatedContent).toContain("--ignore '^__'")
  })
})
