# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.6] - 2026-02-28

### Added

- **`forcePublic` / `forceProtected` bulk auth override** — explicitly declare which routes are always public or always protected, independent of `defaultRequiresAuth`
  - Pattern formats: exact path, path without prefix, wildcard suffix `/*`, and `METHOD /path` method-prefix syntax
  - `/*` wildcard intentionally matches sub-paths only, NOT the base path itself
  - When both `forcePublic` and `forceProtected` match the same route, `forceProtected` wins (safer default)
  - Post-load validation warnings: unused patterns, patterns overridden by explicit `createHandler` meta, conflicting patterns
  - `HTTP_METHODS_UPPER` module-level constant for method-prefix pattern parsing
  - `matchesFilter(routePath, routeMethod, pattern, prefix)` internal helper function
- **`onLog` custom logging callback** — replaces console output entirely when provided; allows integration with any logging system
- **`logging: false` now silences ALL log levels** — info, warn, and error are all suppressed (previously only `info` was suppressed)
- **Falsy non-null export detection** — values like `false`, `0`, `''` now trigger an error log instead of being silently skipped

### Changed

- **Framework decoupled** — removed `import { HoaContext } from 'hoa'` and all Hoa-specific coupling from `handler.ts`; `RouteHandler<TCtx = any>` is now a generic type that works with any single-context framework (Hoa, Koa, Fastify, etc.)
- **Removed `peerDependencies.hoa`** from `package.json` — library no longer requires Hoa as peer dependency
- **`createHandler` signature** — `meta` is now the second parameter: `createHandler(handler, meta?)` (was previously documented with reversed order)
- **`meta: {}` normalized to `undefined`** — `createHandler(fn, {})` now stores `undefined` instead of `{}`; enables safe `if (config.meta)` checks
- **Dead code removed** — the unreachable `if (strict)` block inside the plain-object dispatch branch (strict mode always exits earlier via the early check)
- **`loadRoutes` dead default parameter removed** — this internal function is always called with explicit options from `autoRouter`; the unused default object has been removed
- **`app.$routes?.` optional chaining replaced** — `app.$routes` is guaranteed to be initialized before use; replaced all `?.` with direct property access and removed redundant `|| 0` fallbacks
- **Log alignment** — `padEnd(6)` → `padEnd(7)` to correctly align the `OPTIONS` method (7 chars) with other methods in log output
- **`description` updated** to reflect framework-agnostic nature
- **`keywords` expanded** with `express`, `koa`, `fastify`

### Fixed

- **`return` → `continue` in `scanDir` filename validation** — was aborting the entire directory scan instead of skipping only the invalid file
- **`return` → `continue` in duplicate route detection** — same class of bug; duplicate detection now skips only the duplicate file
- **`new URL('file://...')` → `pathToFileURL()`** — fixes path encoding issues on Windows (spaces, Unicode, drive letters)
- **`validateDirPath` received full absolute path** — now correctly receives only the single directory segment (`file` rather than `filePath`)
- **`onLog` double-logging** — added missing `return` after `onLog(level, message)` call to prevent console also printing
- **`statSync` per-entry try-catch** — each entry's stat is now wrapped individually; a broken symlink or permission error no longer aborts the entire directory scan
- **Recursive `scanDir` per-entry try-catch** — unreadable subdirectories are skipped gracefully; sibling files continue to be scanned
- **`prefix || '/api'` collapsed empty string** — changed to `prefix !== undefined ? prefix : '/api'` so `prefix: ''` (no-prefix mode) is preserved correctly
- **`prefix` trailing slash normalization** — `'/api/'` is normalized to `'/api'` to prevent double-slash route paths
- **Non-strict mode plain object dead path** — plain objects with `handler` property were checked for strict mode but code flow never reached route registration; restructured so non-strict path correctly registers the route
- **`.d.ts` files excluded** — TypeScript declaration files (`.d.ts`) matched `.endsWith('.ts')` and were incorrectly treated as route files; now excluded with `&& !file.endsWith('.d.ts')`
- **`handler === undefined || handler === null` explicit check** — separated null/undefined (intentional, silent skip) from other falsy values (unexpected, error-logged)
- **Stale `HoaContext` re-export removed** from `src/index.ts` — caused a TypeScript compile error after framework decoupling
- **Unused `RouteConfig` import removed** from `src/auto-router.ts`
- **`Object.assign(autoRouter, { load: loadRoutes })` removed** — was leaking an undocumented internal API onto the public export
- **Unused `createHandler` import removed** from `src/__tests__/auto-router.test.ts`

## [0.0.1] - 2025-11-08

### Added

- Initial release of `@chaeco/auto-router`
- File-based automatic routing system
- Support for nested directory structures
- Built-in permission metadata with `requiresAuth` support
- Dynamic parameter support using `[param]` syntax
- Duplicate route detection and validation
- TypeScript support with full type definitions
- Comprehensive test suite with Jest
- ESM module support
- Node.js >=16.0.0 requirement
- MIT License
- HTTP method-only file names (`get.ts`, `post.ts`) — route maps to the directory path
- Suffix support for dynamic parameters: `get-[id]-resources.ts` → `GET /api/:id/resources`
- `prefix` array support — same controller directory registered under multiple prefixes
- Merged array configuration support — pass an array of configs to `autoRouter()`
- Multi-instance support — multiple `autoRouter` calls share `app.$registeredRoutes` for cross-instance duplicate detection
- `strict` mode option — enforces function-only exports
- `logging` option — controls console output
- `defaultRequiresAuth` global permission default
