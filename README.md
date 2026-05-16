# @chaeco/auto-router

[![npm version](https://badge.fury.io/js/%40chaeco%2Fauto-router.svg)](https://badge.fury.io/js/%40chaeco%2Fauto-router)
[![codecov](https://codecov.io/gh/chaeco/auto-router/branch/cf/graph/badge.svg)](https://codecov.io/gh/chaeco/auto-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

File-based automatic router plugin for Node.js frameworks (Hoa, Koa, Fastify, Express, etc.).

## Features

- 🚀 Zero-config automatic routing based on file structure
- 📁 Nested directory support with automatic path building
- 🔒 Built-in permission metadata (`requiresAuth`) support
- 🔍 Built-in validation for file naming and parameters
- 📝 Type-safe with full TypeScript support — `RouteHandler<TCtx, TRes>` generic, no framework coupling
- ⚡ Dynamic parameter support `[param]` syntax
- 🛡️ Duplicate route detection across all `autoRouter` instances
- 🎯 Async handler support
- 🌍 Global `defaultRequiresAuth` configuration
- 🎛️ `forcePublic` / `forceProtected` bulk auth overrides with method-prefix pattern support
- 📢 Custom logging via `onLog` callback
- ⛅ Cloudflare Workers support via static manifest (`createWorkerRouter` + build CLI)

## Installation

```bash
npm install github:chaeco/auto-router#cf
# or
yarn add github:chaeco/auto-router#cf
```

## Quick Start

### Basic Setup

```typescript
import { autoRouter } from '@chaeco/auto-router'

// Works with Hoa, Koa, Fastify, or any framework that exposes app[method](path, handler)
const app = new YourFramework()

app.extend(
  autoRouter({
    dir: './controllers',
    prefix: '/api',
    defaultRequiresAuth: false, // Blacklist mode: public by default
    strict: true,               // Strict mode (default)
  })
)

app.listen(3000)
```

### Strict Mode

**Strict Mode (`strict: true`) — Recommended**:

- ✅ Only pure function exports allowed
- ✅ Only `createHandler()` wrapped exports allowed
- ❌ Plain object exports `{ handler, meta }` rejected
- 🎯 Enforces consistent team code style

**Non-Strict Mode (`strict: false`)**:

- ✅ All export formats allowed (plain objects accepted with warning)
- ⚠️ Prints a warning for non-recommended export styles
- 💡 Useful for backward compatibility or gradual migration

### File Naming Convention

File naming supports two formats:

1. **HTTP method only**: `get.ts`, `post.ts`, etc. → Route is the current directory path
2. **Method + route name**: `get-users.ts`, `post-login.ts`, etc.

### Examples

**Single Parameter:**

- `get.ts` → `GET /api` (at root directory)
- `admin/get.ts` → `GET /api/admin`
- `post-login.ts` → `POST /api/login`
- `get-users.ts` → `GET /api/users`
- `get-[id].ts` → `GET /api/:id`
- `delete-[id].ts` → `DELETE /api/:id`

**Multiple Parameters:**

- `get-[userId]-[postId].ts` → `GET /api/:userId/:postId`
- `put-[userId]-profile.ts` → `PUT /api/:userId/profile`
- `get-[id]-resources.ts` → `GET /api/:id/resources`

**Nested Directories:**

- `users/get.ts` → `GET /api/users`
- `users/post.ts` → `POST /api/users`
- `users/posts/get-[id].ts` → `GET /api/users/posts/:id`

## Permission Metadata

### Two Supported Export Methods

#### Method 1: Pure Function (Recommended for most routes)

```typescript
// controllers/get-users.ts
export default async ctx => {
  ctx.res.body = { users: [] }
}
// Uses global defaultRequiresAuth configuration
```

#### Method 2: createHandler Wrapper (When permission metadata is needed)

```typescript
import { createHandler } from '@chaeco/auto-router'

// controllers/users/get-info.ts - Protected route
export default createHandler(
  async ctx => {
    ctx.res.body = { success: true, data: { userId: ctx.currentUser?.id } }
  },
  { requiresAuth: true, description: '获取用户信息' }
)

// controllers/auth/post-login.ts - Public route
export default createHandler(
  async ctx => {
    ctx.res.body = { success: true }
  },
  { requiresAuth: false }
)
```

### Configuration Modes

**Blacklist Mode (Recommended for public APIs)**:

```typescript
autoRouter({
  defaultRequiresAuth: false,  // Public by default
})

// Only mark routes that need protection
export default createHandler(async (ctx) => { ... }, { requiresAuth: true })
```

**Whitelist Mode (Recommended for internal APIs)**:

```typescript
autoRouter({
  defaultRequiresAuth: true,  // Protected by default
})

// Only mark routes that should be public
export default createHandler(async (ctx) => { ... }, { requiresAuth: false })
```

## Force Override Route Auth

`forcePublic` and `forceProtected` let you explicitly declare which routes are always public or always protected, **independent of `defaultRequiresAuth`**.

> **Priority:** `createHandler` explicit meta → `forceProtected` / `forcePublic` → `defaultRequiresAuth`  
> When a route matches both `forcePublic` and `forceProtected`, `forceProtected` wins (safer).

**Pattern formats:**

| Format | Example | Description |
|--------|---------|-------------|
| Path only | `'/api/users'` | Matches all HTTP methods on that path |
| Path only (no prefix) | `'/users'` | Same, prefix is optional |
| Wildcard | `'/api/admin/*'` | Matches all sub-routes (all methods) |
| Method + path | `'POST /api/users'` | Matches **only** POST; GET is unaffected |
| Method + wildcard | `'DELETE /api/admin/*'` | Matches only DELETE under that path |

### Force Public (`forcePublic`)

Login, registration, guest API, public docs — always public regardless of the global default:

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: true,  // protected by default
  forcePublic: [
    '/api/auth/login',   // with prefix: exact match (all methods)
    '/auth/register',    // without prefix: also matches /api/auth/register
    '/api/public/*',     // wildcard: sub-paths only (/api/public/docs ✅, /api/public itself ❌)
  ],
})
// POST /api/auth/login    → requiresAuth: false (force public)
// POST /api/auth/register → requiresAuth: false (force public)
// GET  /api/public/docs   → requiresAuth: false (force public)
// GET  /api/public        → requiresAuth: true  (/* does NOT match the base path itself)
// GET  /api/users         → requiresAuth: true  (default)
```

### Force Protected (`forceProtected`)

Admin panel, sensitive APIs — always protected regardless of the global default:

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: false,  // public by default
  forceProtected: [
    '/api/admin/*',   // wildcard: /api/admin/users ✅, /api/admin itself ❌
    '/api/user/me',   // exact match (all methods)
  ],
})
// GET  /api/admin/users → requiresAuth: true  (force protected)
// GET  /api/user/me     → requiresAuth: true  (force protected)
// GET  /api/products    → requiresAuth: false (default)
```

### Method-specific Override

When different HTTP methods on the same path need different auth, use the `METHOD /path` format:

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: false,  // public by default
  forceProtected: [
    'POST /api/users',    // creating a user requires auth
    'DELETE /api/users',  // deleting requires auth
    // Note: GET /api/users is not listed, stays public
  ],
})
// GET    /api/users → requiresAuth: false (default)
// POST   /api/users → requiresAuth: true  (force protected)
// DELETE /api/users → requiresAuth: true  (force protected)
```

### Combined Usage

`forcePublic` and `forceProtected` can be used together, each independently enforcing their respective auth state:

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: false,
  forcePublic: ['/api/auth/*'],     // auth routes always public
  forceProtected: ['/api/admin/*'], // admin routes always protected
})
```

## Prefix Array Support

The `prefix` parameter supports string arrays, allowing the same controller directory to be registered with multiple prefixes:

```typescript
import { autoRouter } from '@chaeco/auto-router'

// Works with any framework that exposes app[method](path, handler)
const app = new YourFramework()

// Register the same directory with multiple prefixes
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: ['/api', '/v1', '/v2'],  // Array supported
  })
)

// Now get-users.ts will be registered as:
// GET /api/users
// GET /v1/users
// GET /v2/users

app.listen(3000)
```

**Use Cases:**

```typescript
// Scenario 1: API version compatibility
app.extend(
  autoRouter({
    dir: './controllers/v2',
    prefix: ['/api', '/v2'],  // Support both old and new prefixes
  })
)

// Scenario 2: Multi-language support
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: ['/api', '/zh', '/en'],
  })
)
```

## Multi-Level Configuration

`auto-router` supports two approaches for configuring multiple route directories:

### Approach 1: Merged Configuration (Recommended)

Configure multiple directories at once using an array:

```typescript
import { autoRouter } from '@chaeco/auto-router'

const app = new YourFramework()

// Merged configuration - configure multiple directories at once
app.extend(
  autoRouter([
    {
      dir: './src/controllers/admin',
      defaultRequiresAuth: false,
      prefix: '/api/admin',
    },
    {
      dir: './src/controllers/client',
      defaultRequiresAuth: true,
      prefix: '/api/client',
    },
  ])
)

// Even with a single configuration, array form is supported (for consistency)
app.extend(
  autoRouter([
    {
      dir: './controllers',
      prefix: '/api',
    },
  ])
)

app.listen(3000)
```

### Approach 2: Multiple Calls

Call `autoRouter` multiple times separately:

```typescript
import { autoRouter } from '@chaeco/auto-router'

const app = new YourFramework()

// Admin routes
app.extend(
  autoRouter({
    dir: './src/controllers/admin',
    defaultRequiresAuth: false,
    prefix: '/api/admin',
  })
)

// Client routes
app.extend(
  autoRouter({
    dir: './src/controllers/client',
    defaultRequiresAuth: true,
    prefix: '/api/client',
  })
)

app.listen(3000)
```

**Features:**

- ✅ Each `autoRouter` instance can have independent configuration
- ✅ Route metadata automatically accumulates without overwriting
- ✅ Duplicate routes across instances are detected and rejected
- ✅ All route information is stored in `app.$routes`

**Example Scenarios:**

```typescript
// Scenario 1: Multiple business modules (merged)
app.extend(
  autoRouter([
    { dir: './controllers/user', prefix: '/api/user' },
    { dir: './controllers/order', prefix: '/api/order' },
    { dir: './controllers/product', prefix: '/api/product' },
  ])
)

// Scenario 2: Different permission levels (merged)
app.extend(
  autoRouter([
    { dir: './controllers/public', defaultRequiresAuth: false, prefix: '/api/public' },
    { dir: './controllers/protected', defaultRequiresAuth: true, prefix: '/api/protected' },
  ])
)

// Scenario 3: API versioning (merged)
app.extend(
  autoRouter([
    { dir: './controllers/v1', prefix: '/api/v1' },
    { dir: './controllers/v2', prefix: '/api/v2' },
  ])
)
```

## Route Registry

After loading, all route metadata is accessible via `app.$routes`:

```typescript
app.$routes.all             // RouteInfo[] — all registered routes
app.$routes.publicRoutes    // { method, path }[] — public routes
app.$routes.protectedRoutes // { method, path }[] — protected routes
```

This is useful for integrating with JWT middleware or any permission-checking layer:

```typescript
// Example: manual JWT middleware using app.$routes
app.use(async (ctx, next) => {
  const match = app.$routes.protectedRoutes.find(
    r => r.method === ctx.method && r.path === ctx.path
  )
  if (match) {
    // verify token ...
  }
  await next()
})
```

## Type Safety

`RouteHandler<TCtx, TRes>` supports both single-context and dual-parameter frameworks:

```typescript
import { createHandler } from '@chaeco/auto-router'
import type { RouteHandler } from '@chaeco/auto-router'

// Single-context frameworks (Hoa, Koa, Fastify, etc.)
type MyContext = { body: any; params: Record<string, string> }

export default createHandler<MyContext>(
  async (ctx) => {
    ctx.body = { success: true }
  },
  { requiresAuth: true }
)

// Dual-parameter frameworks (Express, etc.)
import type { Request, Response } from 'express'

export default createHandler<Request, Response>(
  async (req, res) => {
    res.json({ success: true })
  },
  { requiresAuth: true }
)
```

## API Reference

### `autoRouter(options)`

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dir` | `string` | `'./controllers'` | Controllers directory path |
| `prefix` | `string \| string[]` | `'/api'` | Route prefix; pass `''` for no prefix, or an array for multiple prefixes |
| `defaultRequiresAuth` | `boolean` | `false` | Global auth default (`false` = public by default) |
| `forcePublic` | `string[]` | — | Patterns whose matched routes are always public |
| `forceProtected` | `string[]` | — | Patterns whose matched routes are always protected |
| `strict` | `boolean` | `true` | `true`: only functions and `createHandler()` allowed; `false`: plain objects accepted with warning |
| `logging` | `boolean` | `true` | `true`: print all levels to console; `false`: completely silent (all levels suppressed) |
| `onLog` | `(level, message) => void` | — | Custom log sink; takes over entirely when provided (console is not called) |

**`forcePublic` / `forceProtected` pattern rules:**

- `'/api/users'` — exact match, all HTTP methods
- `'/users'` — prefix is optional; also matches `/api/users` when `prefix` is `/api`
- `'/api/admin/*'` — wildcard: matches `/api/admin/foo` and deeper, but **NOT** `/api/admin` itself
- `'POST /api/users'` — method-prefixed: only matches POST, GET is unaffected
- `'DELETE /api/admin/*'` — method + wildcard combination

**Priority:** `createHandler` explicit meta > `forceProtected` / `forcePublic` > `defaultRequiresAuth`  
When both `forcePublic` and `forceProtected` match the same route, `forceProtected` wins.

### `createHandler(handler, meta?)`

Wrapper function to attach metadata to a route handler.

```typescript
createHandler(handler: RouteHandler<TCtx, TRes>, meta?: RouteMeta): RouteConfig<TCtx, TRes>
```

**Parameters**:

- `handler` (function, required) — The async route handler
- `meta` (object, optional)
  - `requiresAuth` (boolean) — Whether route requires authentication
  - `description` (string) — Route description
  - `[key: string]: any` — Any additional custom metadata

**Notes:**

- An empty `{}` meta is normalized to `undefined` internally
- Returns an object marked with `$__isRouteConfig: true`; use `isRouteConfig(obj)` to check

### `isRouteConfig(obj)`

Returns `true` if `obj` was created by `createHandler()`. Use this to distinguish from plain objects.

### Logging Examples

```typescript
// Default: all levels printed to console
app.extend(autoRouter({ dir: './controllers' }))

// Custom log sink — console output fully replaced
app.extend(autoRouter({
  dir: './controllers',
  onLog: (level, message) => myLogger[level](message),
}))

// Completely silent (logging: false suppresses info + warn + error)
app.extend(autoRouter({
  dir: './controllers',
  logging: false,
}))

// Silent but still capture errors via onLog
app.extend(autoRouter({
  dir: './controllers',
  logging: false,
  onLog: (level, message) => {
    if (level === 'error') errorLogger.error(message)
  },
}))
```

## Validation Rules

- ✅ Filenames must start with a valid HTTP method
- ✅ Parameters must use bracket syntax: `[paramName]`
- ✅ Empty parameters `[]` are not allowed
- ✅ Only default exports allowed (no named exports)
- ✅ Default export must be a function
- ✅ Directory names should not contain HTTP method keywords
- ✅ Duplicate routes are detected and skipped
- ✅ Routes are logged with permission indicators (🔒 for protected routes)

## Best Practices

✅ **Do**:

- Use `createHandler()` to explicitly mark permission requirements
- Choose appropriate `defaultRequiresAuth` mode for your API
- Use `@chaeco/hoa-jwt-permission` with `autoDiscovery: true`
- Keep route metadata close to handlers
- Use nested directories for logical grouping

❌ **Don't**:

- Export objects or other non-function types
- Mix export styles unnecessarily
- Use complex logic for route names
- Create routes outside `controllers/` directory
- Forget to update permission config when changing API behavior

## Cloudflare Workers

Cloudflare Workers don't support dynamic `import()` at runtime. `@chaeco/auto-router` solves this with a two-step approach: a build-time CLI scans your controller files and generates a static manifest, and `createWorkerRouter` provides a lightweight runtime dispatcher.

### Step 1: Generate the manifest

```bash
npx tsx node_modules/@chaeco/auto-router/dist/build-worker-manifest.js ./controllers ./dist/worker-routes.ts
```

This writes `dist/worker-routes.ts` with static imports for every route file it finds. Add it to your build pipeline:

```json
{
  "scripts": {
    "build:manifest": "npx tsx node_modules/@chaeco/auto-router/dist/build-worker-manifest.js ./controllers ./dist/worker-routes.ts"
  }
}
```

### Step 2: Use the manifest in your Worker

```typescript
import { createWorkerRouter } from '@chaeco/auto-router/worker-manifest'
import { routes } from './worker-re... truncated ...
## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
