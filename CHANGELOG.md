# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Parameter name validation** — `[param]` names are now validated instead of silently producing broken routes
  - Added `validateRouteName` / `validateDirSegment` to `parse-route.ts`; `parseRouteName` / `parseDirSegment` now throw on invalid syntax
  - Rejected: empty `[]`, adjacent params without a `-` separator (`[a][b]`), unpaired brackets, non-ASCII or hyphenated param names (`[user-id]`, `[用户名]`)
  - Directory params must span the whole segment (`[userId]/` valid; `users[id]/`, `[a][b]/` rejected)
  - Enforced across all three registration paths: `autoRouter` (file scan), `generateManifest` (Workers CLI), and `staticAutoRouter` (bracket syntax in `path` rejected — use `:param` form)
  - Malformed files/dirs are skipped with an error log instead of registering a broken route
- **Case-insensitive duplicate detection** — param-name casing is folded when building the duplicate-detection key, so `get-[userId].ts` and `get-[UserID].ts` are treated as the same route (they match the same URLs). The **registered** pattern keeps the original casing — `[userId]` registers as `:userId` and `ctx.params.userId` reads the way it was written, matching Express/Koa/Hoa conventions. Applied via `normalizeParamNames` across `autoRouter`, `staticAutoRouter`, and `generateManifest`

### Tested

- 179 tests passing (19 new: validation cases in `parse-route`, rejection paths in `auto-router`, `build-worker-manifest`, `static-router`, `normalizeParamNames` dedup, and case-variant dedup in `worker-integration`)

## [0.0.14] - 2026-07-31

### Added

- **Route-level middlewares** — `createHandler(handler, meta?, middlewares?)` third argument
  - `RouteMiddleware<TCtx>` type — Koa/Hoa-style `(ctx, next)` middleware
  - `RouteConfig.middlewares` field; empty `[]` normalized to `undefined`
  - Registered as `app[method](path, ...middlewares, handler)` — matches Hoa / Koa / Express variadic middleware signature
  - Supported across all three registration paths:
    - File-based `autoRouter` (`load-routes.ts`)
    - `staticAutoRouter` (`static-router.ts`) — createHandler result and plain object
    - `createWorkerRouter` (`worker-manifest.ts`) — Koa-style chain; a middleware that short-circuits (no `next()` call) stops the chain without calling the handler
  - Enables direct use of `@hoajs/zod`'s `zodValidator()` as a per-route validation middleware
  - Exported from the public API: `RouteMiddleware`
- **`WorkerManifestRoute.middlewares`** — optional route-level middleware chain for Workers manifests

### Tested

- 160 tests passing (4 new handler tests, 3 new static-router tests, 1 new auto-router test, 4 new worker-router tests)

## [0.0.13] - 2026-07-28

### Added

- **Cloudflare Workers support** — build-time manifest generation CLI + zero-dependency `createWorkerRouter`
  - `createWorkerRouter<TEnv, TCtx>(options)` — Web Platform `fetch(req, env, ctx)` router for Workers
  - `WorkerRouteContext<TEnv, TCtx>` — single-context handler signature with `req`, `env`, `ctx`, `params`, and `res` builder
  - `WorkerManifestRoute` interface — `{ pattern, method, handler }` for generated manifests
  - CLI: `npx auto-router-build-manifest <controllersDir> <outputFile> [--prefix /api] [--ext ts]`
  - Build-time directory scanning with `parseRouteName` / `parseDirSegment` shared logic
  - Response serialization precedence: direct `Response` > auto-JSON > `ctx.res` builder
  - `createHandler` unwrapping via `isRouteConfig` (Workers handlers can use same wrapper as Node handlers)
  - Subpath export: `@chaeco/auto-router/worker-manifest`
  - npm bin entry: `auto-router-build-manifest` → `dist/build-worker-manifest.js`
- **`src/parse-route.ts`** — extracted shared route-name parsing logic (previously inline in `load-routes.ts`)
  - `parseRouteName(rawName)` — three-step regex transform: `[param]` → `:param`, `-:` → `/:`, `:param-` → `:param/`
  - `parseDirSegment(segment)` — bracket-only transform for directory names
  - Now used by both runtime `autoRouter` (`load-routes.ts`) and build-time CLI (`build-worker-manifest.ts`)

### Changed

- **`src/load-routes.ts`** — replaced inline regex transforms with calls to `parseRouteName` / `parseDirSegment`
- **`package.json`** — added `./worker-manifest` subpath export and `auto-router-build-manifest` bin entry

### Tested

- 137 tests passing (21 new tests added for Workers support)
- **`src/__tests__/parse-route.test.ts`** (16 tests) — all documented conversion rules, step-ordering regression guard
- **`src/__tests__/worker-router.test.ts`** (18 tests) — route matching, param extraction, method dispatch, 404/500 handlers, response serialization, `createHandler` unwrapping, URI decoding, query strings, trailing slashes, segment count mismatch, custom `TEnv` generics
- **`src/__tests__/build-worker-manifest.test.ts`** (16 tests) — file name validation, identifier sanitization, relative imports, prefix normalization, empty directory, duplicate detection, sorting, broken symlinks, unreadable subdirectories, `.d.ts` exclusion
- **`src/__tests__/cli-build-manifest.test.ts`** (10 tests) — CLI argument parsing, usage errors, `--prefix`/`--ext` flags, output directory creation, regenerate command formatting
- **`src/__tests__/worker-integration.test.ts`** (4 tests) — end-to-end manifest generation → `createWorkerRouter` → real `fetch()` round-trip with nested routes, dynamic segments, custom error handlers

## [0.0.12] - 2026-07-27

### Changed

- **Type safety improvements** — `RouteMeta.[key: string]` from `any` to `unknown`; all `catch` blocks from `err: any` to `err: unknown`; `createHandler` internal config typed instead of `any` bypass; `isRouteConfig` parameter from `any` to `unknown`
- **CI matrix** — removed Node 16.x (EOL); removed unused `registry-url` from CI workflow; removed redundant build step from release workflow (handled by `prepack`)
- **`.nvmrc`** — added for local Node version consistency

### Fixed

- **Test files leaked into npm package** — excluded `src/__tests__` from TypeScript compilation, removed `dist/__tests__` from git tracking, added `!dist/__tests__` negation to `files` field
- **`AutoRouterOptions` type not exported** — extracted inline type to exported `AutoRouterOptions` interface, re-exported from `index.ts`
- **Stale `.npmignore` reference** — `jest.config.js` → `jest.config.mjs`
- **`RouteMeta` as value import** — changed to `type`-only import in test file

## [0.0.11] - 2026-07-27

### Fixed

- **Missing `.js` extensions in ESM imports** — switched `tsconfig.json` to `moduleResolution: "NodeNext"` and added `.js` suffixes to all relative imports in source files. This fixes `ERR_MODULE_NOT_FOUND` when importing the package in ESM projects.

## [0.0.10] - 2026-07-27

### Added

- **`prepack` script** — `npm publish` now automatically rebuilds `dist/` before packaging via `npm run build`
- **Git pre-commit hook** — `scripts/pre-commit.sh` rebuilds `dist/` and stages it before every commit, ensuring GitHub-imported versions have fresh build output. Run `bash scripts/install-hooks.sh` to install.

## [0.0.9] - 2026-06-29

### Fixed

- **`[param]` in directory names not converted to `:param`** — the recursive `scanDir` call was passing raw directory names (e.g. `[userId]`) into `basePath` without converting them. Now applies the same `[param]` → `:param` transformation to directory segments, so routes like `users/[userId]/posts/get.ts` correctly resolve to `GET /api/users/:userId/posts` instead of `GET /api/users/[userId]/posts`.

## [0.0.8] - 2026-06-09

### Added

- **`RouteInfo.meta`** — `createHandler` metadata is now preserved in `app.$routes.all`, making it accessible for API documentation generators, introspection panels, and OpenAPI adapters. Previously, `requiresAuth` and other meta fields were used for auth resolution but discarded from the route registry.

### Changed

- **`staticAutoRouter`** — matches `autoRouter` behaviour: route meta is now written to `app.$routes.all` entries.

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
