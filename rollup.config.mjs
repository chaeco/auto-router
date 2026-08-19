import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Node built-ins stay external; worker-manifest is a type-only subpath.
const external = [/^node:/, 'fs', 'path', 'url', 'os', 'child_process', /^@chaeco\/auto-router/]

const config = [
  // Main ESM bundle — dist/index.js
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ extensions: ['.ts', '.js'] }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external,
  },
  // worker-manifest subpath — dist/worker-manifest.js (type-only, tiny)
  {
    input: 'src/worker-manifest.ts',
    output: {
      file: 'dist/worker-manifest.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ extensions: ['.ts', '.js'] }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external,
  },
  // build-worker-manifest CLI — dist/build-worker-manifest.js (needs shebang preserved)
  {
    input: 'src/build-worker-manifest.ts',
    output: {
      file: 'dist/build-worker-manifest.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ extensions: ['.ts', '.js'] }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external,
  },
  // Type declarations — main entry
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.ts', format: 'es' },
    plugins: [dts({ tsconfig: './tsconfig.build.json', respectExternal: true })],
    external,
  },
  // Type declarations — worker-manifest subpath
  {
    input: 'src/worker-manifest.ts',
    output: { file: 'dist/worker-manifest.d.ts', format: 'es' },
    plugins: [dts({ tsconfig: './tsconfig.build.json', respectExternal: true })],
    external,
  },
  // Type declarations — build-worker-manifest
  {
    input: 'src/build-worker-manifest.ts',
    output: { file: 'dist/build-worker-manifest.d.ts', format: 'es' },
    plugins: [dts({ tsconfig: './tsconfig.build.json', respectExternal: true })],
    external,
  },
]

export default config
