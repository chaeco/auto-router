# @chaeco/auto-router

[![npm version](https://badge.fury.io/js/%40chaeco%2Fauto-router.svg)](https://badge.fury.io/js/%40chaeco%2Fauto-router)
[![codecov](https://codecov.io/gh/chaeco/auto-router/branch/main/graph/badge.svg)](https://codecov.io/gh/chaeco/auto-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

File-based automatic router plugin for Node.js frameworks (Hoa, Koa, Fastify, Express, etc.). Map your filesystem to HTTP routes — no manual route registration.

## Features

- 🚀 Zero-config automatic routing from file structure
- 📁 Nested directory support with automatic path building
- ⚡ Dynamic parameter `[param]` syntax — single and multi-parameter routes
- 🔒 Built-in auth metadata (`requiresAuth`) with fine-grained `forcePublic` / `forceProtected` overrides
- 🔍 Built-in validation for file naming, parameters, and duplicate routes
- 📝 Full TypeScript support — `RouteHandler<TCtx, TRes>` generic, framework-agnostic
- 🛡️ Cross-instance duplicate route detection via shared `app.$registeredRoutes`
- 🎛️ Prefix array support — same controllers under multiple prefixes
- 🧩 Merged multi-configuration support — one call, many directories
- 📢 Custom logging via `onLog` callback
- 🌐 `staticAutoRouter` for runtimes without filesystem access (edge functions, bundled apps)
- ☁️ **Cloudflare Workers support** — build-time manifest generation + zero-dependency `createWorkerRouter`

---

## Installation

```bash
npm install @chaeco/auto-router
```

### AI Tool Skills

This package includes AI agent skills for Claude Code and OpenAI Codex. After installation, run this once:

```bash
npx auto-router-init-skills
```

This copies skill files into your project's `.claude/skills/auto-router/` and `.codex/skills/auto-router/`. AI tools will then enforce file naming rules, export conventions, auth patterns, and best practices when creating routes.

---

## Table of Contents

- [Quick Start](#quick-start)
- [File Naming Convention](#file-naming-convention)
  - [Basic formats](#basic-formats)
  - [Single parameter](#single-parameter)
  - [Multiple parameters](#multiple-parameters)
  - [Dynamic directory names](#dynamic-directory-names)
  - [Choosing flat files vs nested directories](#choosing-flat-files-vs-nested-directories)
  - [Route conversion rules (reference)](#route-conversion-rules-reference)
- [Export Methods](#export-methods)
  - [Method 1: Pure function](#method-1-pure-function)
  - [Method 2: createHandler wrapper](#method-2-createhandler-wrapper)
  - [Method 3: createHandler with route-level middlewares](#method-3-createhandler-with-route-level-middlewares)
  - [Strict mode](#strict-mode)
- [Auth & Permissions](#auth--permissions)
  - [Configuration modes](#configuration-modes)
  - [forcePublic / forceProtected](#forcepublic--forceprotected)
  - [Pattern formats](#pattern-formats)
  - [Priority chain](#priority-chain)
  - [Conflict resolution](#conflict-resolution)
  - [Warnings for unused patterns](#warnings-for-unused-patterns)
- [Configuration](#configuration)
  - [Single configuration](#single-configuration)
  - [Prefix array](#prefix-array)
  - [Merged configuration (array)](#merged-configuration-array)
  - [Multiple calls](#multiple-calls)
  - [No prefix](#no-prefix)
- [Route Registry](#route-registry)
- [API Documentation Generation](#api-documentation-generation)
  - [OpenAPI / Swagger](#openapi--swagger)
  - [Postman Collection](#postman-collection)
  - [Tags / Grouping](#tags--grouping)
- [Type Safety](#type-safety)
- [Logging](#logging)
- [Validation Rules](#validation-rules)
- [Best Practices](#best-practices)
- [Runtimes Without Filesystem Access](#runtimes-without-filesystem-access)
  - [staticAutoRouter](#staticautorouter)
  - [Cloudflare Workers](#cloudflare-workers)
- [API Reference](#api-reference)
  - [autoRouter(options)](#autorouteroptions)
  - [staticAutoRouter(options)](#staticautorouteroptions)
  - [createWorkerRouter(options)](#createworkerrouteroptions)
  - [createHandler(handler, meta?, middlewares?)](#createhandlerhandler-meta-middlewares)
  - [isRouteConfig(obj)](#isrouteconfigobj)
  - [Exported types](#exported-types)
- [License](#license)

---

## Quick Start

```typescript
import { autoRouter } from '@chaeco/auto-router'

const app = new YourFramework()

app.extend(
  autoRouter({
    dir: './controllers',
    prefix: '/api',
  })
)

app.listen(3000)
```

Given this filesystem:

```
controllers/
  get-users.ts                                      → GET /api/users
  get-[id].ts                                       → GET /api/:id
  post-login.ts                                     → POST /api/login
  get-[userId]-posts.ts                             → GET /api/:userId/posts
  get-[userId]-[postId].ts                          → GET /api/:userId/:postId
  users/
    [userId]/
      posts/
        get.ts                                      → GET /api/users/:userId/posts
        get-[id].ts                                 → GET /api/users/:userId/posts/:id
      settings/
        get.ts                                      → GET /api/users/:userId/settings
  admin/
    get-dashboard.ts                                → GET /api/admin/dashboard
```

No manual `app.get(...)` calls needed. Every `.ts` file becomes a route.

---

## File Naming Convention

Every route file name encodes the **HTTP method** and the **URL structure**. The auto-router parses the file name and converts it into a framework route registration.

### Basic formats

| File name | Registers |
|-----------|-----------|
| `get.ts` | `GET /api` (at root directory — route is the directory path) |
| `post.ts` | `POST /api` |
| `admin/get.ts` | `GET /api/admin` |
| `users/post.ts` | `POST /api/users` |
| `get-users.ts` | `GET /api/users` |
| `post-login.ts` | `POST /api/login` |

**Rule:** A file named exactly `{method}.ts` uses the **directory path** as the route. A file named `{method}-{name}.ts` appends `name` to the directory path.

### Single parameter

Wrap the parameter name in square brackets `[]`. It becomes an Express-style `:param` path segment. **Parameter names keep their original casing** — `[userId]` registers as `:userId`, and `ctx.params` keys match how you wrote them. `[userId]` and `[UserID]` are treated as the same route (case-insensitive duplicate detection).

| File name | Registers |
|-----------|-----------|
| `get-[id].ts` | `GET /api/:id` |
| `delete-[id].ts` | `DELETE /api/:id` |
| `get-[userId].ts` | `GET /api/:userId` |
| `post-[type].ts` | `POST /api/:type` |

### Multiple parameters

Multiple `[param]` segments in the file name are separated by `-`. Each `-` between two segments becomes a `/` in the URL.

| File name | Registers | Pattern |
|-----------|-----------|---------|
| `get-[userId]-posts.ts` | `GET /api/:userId/posts` | param + static |
| `get-users-[id].ts` | `GET /api/users/:id` | static + param |
| `get-[userId]-[postId].ts` | `GET /api/:userId/:postId` | param + param |
| `put-[userId]-profile.ts` | `PUT /api/:userId/profile` | param + static |
| `get-[org]-settings-[key].ts` | `GET /api/:org/settings/:key` | param + static + param |
| `get-[a]-[b]-[c].ts` | `GET /api/:a/:b/:c` | three consecutive params |

### Dynamic directory names

Directory names can also contain `[param]` brackets. This is the recommended way to express resource hierarchies with more than two levels of nesting.

| File path | Registers |
|-----------|-----------|
| `users/[userId]/get.ts` | `GET /api/users/:userId` |
| `users/[userId]/posts/get.ts` | `GET /api/users/:userId/posts` |
| `users/[userId]/posts/[postId]/get.ts` | `GET /api/users/:userId/posts/:postId` |
| `users/[userId]/posts/get-[id].ts` | `GET /api/users/:userId/posts/:id` |

Dynamic directories and file-level params compose naturally — directory params are processed first during recursive scanning, then file name params are appended.

### Choosing flat files vs nested directories

A route like `GET /api/users/:userId/posts/:postId/comments/:commentId` can be expressed two ways:

| Approach | File path | Verdict |
|----------|-----------|---------|
| Flat file | `get-users-[userId]-posts-[postId]-comments-[commentId].ts` | ❌ 60+ chars, unreadable |
| Nested directories | `users/[userId]/posts/[postId]/comments/get-[commentId].ts` | ✅ Each segment is short and clear |

**Rule of thumb:**

- **≤ 3 path segments** (method + 2 hyphens): flat file is fine — `get-[userId]-posts.ts`
- **> 3 path segments**: use nested directories — `users/[userId]/posts/get-[id].ts`
- **Resource hierarchies** naturally map to directories — `users/`, `posts/`, `comments/` are directory trees, not flat file name prefixes

### Route conversion rules (reference)

The file name `routeName` (everything after `method-`) goes through three regex passes:

| Step | Pattern | Replaces | Effect |
|------|---------|----------|--------|
| 1 | `[param]` | `:param` | Bracket → colon prefix |
| 2 | `-:` | `/:` | Dash-before-colon → slash-before-colon |
| 3 | `:param-` | `:param/` | Colon-segment-before-dash → slash after |

**How this works in practice:**

| Example `routeName` | Step 1 | Step 2 | Step 3 | Result |
|---------------------|--------|--------|--------|--------|
| `users` | `users` | `users` | `users` | `users` (no params, stays as-is) |
| `user-info` | `user-info` | `user-info` | `user-info` | `user-info` (hyphen in static text, unchanged) |
| `[id]` | `:id` | `:id` | `:id` | `:id` |
| `[userId]-posts` | `:userId-posts` | `:userId-posts` | `:userId/posts` | `:userId/posts` |
| `users-[id]` | `users-:id` | `users/:id` | `users/:id` | `users/:id` |
| `[a]-[b]` | `:a-:b` | `:a/:b` | `:a/:b` | `:a/:b` |
| `[org]-settings-[key]` | `:org-settings-:key` | `:org/settings-:key` | `:org/settings/:key` | `:org/settings/:key` |

**Key rule:** A `-` is only converted to `/` when it is adjacent to a dynamic parameter (`:`). Hyphens within purely static text (e.g., `user-info`, `my-api-v2`) are preserved as-is. You do **not** need to work around static hyphens.

### Parameter name validation

Parameter names (the content inside brackets) must be **ASCII letters, digits, or underscore** (`[A-Za-z0-9_]`), and **keep their original casing** — `[userId]` registers as `:userId` and `ctx.params.userId` reads the way you wrote it. Duplicate detection folds **casing only**: `get-[userId].ts` and `get-[UserID].ts` are treated as the same route (they match the same URLs), but `user_id` is a distinct name — `get-[userId].ts` and `get-[user_id].ts` register as two separate routes. The following are **rejected** — the offending file is skipped and an error is logged, instead of silently registering a broken route:

| Invalid | Reason |
|---------|--------|
| `get-[].ts` | Empty parameter |
| `get-[a][b].ts` | Adjacent params must be joined with `-` (use `get-[a]-[b].ts`) |
| `get-[id.ts` / `get-id].ts` | Unpaired brackets |
| `get-[user-id].ts` | Hyphen inside a param name (use `get-user-[id].ts` or `get-[userId].ts`) |
| `get-[v1.2].ts` | Dot inside a param name |
| `get-[用户名].ts` | Non-ASCII param name |

Directory names follow the same rules, and a param must **span the whole segment** — `[userId]/` is valid, while `users[id]/` and `[a][b]/` are not.

> Note: `staticAutoRouter` `path` values should use Express-style `:param` directly (e.g. `'/api/users/:id'`). The file-name `[param]` syntax is a file-naming convention and does not apply to static route declarations.

---

## Export Methods

### Method 1: Pure function

The simplest form. The route inherits the global `defaultRequiresAuth` setting.

```typescript
// controllers/get-users.ts
export default async (ctx) => {
  ctx.res.body = { users: [] }
}
```

### Method 2: createHandler wrapper

Use when you need per-route metadata (auth, description, custom fields).

```typescript
import { createHandler } from '@chaeco/auto-router'

// Protected route
export default createHandler(
  async (ctx) => {
    ctx.res.body = { success: true, data: { userId: ctx.currentUser?.id } }
  },
  { requiresAuth: true, description: 'Get current user info' }
)

// Public route (overrides a global defaultRequiresAuth: true)
export default createHandler(
  async (ctx) => {
    ctx.res.body = { success: true }
  },
  { requiresAuth: false }
)
```

The `meta` object accepts `requiresAuth`, `description`, and any custom `[key: string]: any` fields.

### Method 3: createHandler with route-level middlewares

`createHandler` accepts an optional third argument — a list of Koa/Hoa-style
middlewares `(ctx, next) => ...` that run **before** the route handler. This is
the slot for framework validation middleware like `@hoajs/zod`:

```typescript
import { z, zodValidator } from '@hoajs/zod'
import { createHandler } from '@chaeco/auto-router'

const LoginSchema = z.object({
  username: z.string().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
})

export default createHandler(
  async (ctx) => {
    // ctx.req.body is already validated & parsed by zodValidator
    ctx.res.body = { success: true }
  },
  { description: 'User login' },
  [zodValidator({ body: LoginSchema })]
)
```

- Registered as `app[method](path, ...middlewares, handler)` — matches the
  variadic middleware signature Hoa, Koa and Express all use.
- Works for every registration path: file-based `autoRouter`, `staticAutoRouter`,
  and `createWorkerRouter`.
- In Workers, middlewares run as a Koa-style chain: each receives `(ctx, next)`,
  the final `next` invokes the handler; a middleware that short-circuits (no
  `next()` call, e.g. a `zodValidator` 400) stops the chain without calling the
  handler.
- Middlewares are framework-agnostic — attach `@hoajs/zod` on Hoa,
  `express-validator` on Express, or any `(ctx, next)` middleware elsewhere.

### Strict mode

| Setting | Pure function | `createHandler()` | Plain `{ handler, meta }` |
|---------|:---:|:---:|:---:|
| `strict: true` (default) | ✅ | ✅ | ❌ Rejected |
| `strict: false` | ✅ | ✅ | ⚠️ Accepted with warning |

**Strict mode is on by default.** It enforces consistent export style across the codebase. Use non-strict mode only for gradual migration or backward compatibility.

```typescript
// Strict mode (default) — plain objects are rejected
autoRouter({ dir: './controllers', strict: true })

// Non-strict mode — plain objects accepted with a warning
autoRouter({ dir: './controllers', strict: false })
```

---

## Auth & Permissions

### Configuration modes

**Blacklist mode** (public-by-default): mark only protected routes.

```typescript
autoRouter({ dir: './controllers', defaultRequiresAuth: false })
```

```typescript
// Only this route needs an explicit auth marker
export default createHandler(async (ctx) => { ... }, { requiresAuth: true })
```

**Whitelist mode** (protected-by-default): mark only public routes.

```typescript
autoRouter({ dir: './controllers', defaultRequiresAuth: true })
```

```typescript
// Only this route needs an explicit public marker
export default createHandler(async (ctx) => { ... }, { requiresAuth: false })
```

### forcePublic / forceProtected

Bulk auth overrides that apply across many routes at once, **independent of `defaultRequiresAuth`**.

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: true,         // protected by default
  forcePublic: [
    '/api/auth/login',               // login is always public
    '/api/auth/register',            // register is always public
    '/api/public/*',                 // everything under /api/public/ is public
  ],
  forceProtected: [
    '/api/admin/*',                  // everything under /api/admin/ is protected
    'POST /api/users',               // only POST /api/users is protected; GET stays public
  ],
})
```

### Pattern formats

| Format | Example | Matches |
|--------|---------|---------|
| Exact path (with prefix) | `'/api/users'` | All methods on `/api/users` exactly |
| Exact path (without prefix) | `'/users'` | Same as above when prefix is `/api` |
| Wildcard | `'/api/admin/*'` | All methods on `/api/admin/foo`, `/api/admin/foo/bar`, etc. — **NOT** `/api/admin` itself |
| Method + exact path | `'POST /api/users'` | Only POST on `/api/users`; GET is unaffected |
| Method + wildcard | `'DELETE /api/admin/*'` | Only DELETE under `/api/admin/` |

**Wildcard note:** `/*` intentionally matches sub-paths only, not the base path. Use an additional exact-pattern entry if you need the base path covered too:

```typescript
forceProtected: [
  '/api/admin',       // covers /api/admin itself
  '/api/admin/*',     // covers /api/admin/users, /api/admin/settings, etc.
]
```

### Priority chain

```
createHandler explicit meta  >  forceProtected / forcePublic  >  defaultRequiresAuth
```

1. **Explicit meta wins.** If a route uses `createHandler(fn, { requiresAuth: true })`, no `forcePublic` pattern can override it.
2. **force rules override global default.** A `forceProtected` pattern promotes a route to protected even when `defaultRequiresAuth: false`.
3. **Default is the fallback.** When no explicit meta and no force pattern matches, `defaultRequiresAuth` applies.

### Conflict resolution

When the same route matches **both** `forcePublic` and `forceProtected`:

- `forceProtected` wins (safer default)
- A warning is logged identifying the conflict

When a `forcePublic` or `forceProtected` pattern matches a route that has **explicit `createHandler` meta**:

- The explicit meta wins
- A warning is logged: the force pattern "has no effect"

### Warnings for unused patterns

After all routes are loaded, the auto-router checks whether every `forcePublic` and `forceProtected` pattern matched at least one registered route. Unmatched patterns get a warning — this catches typos and stale config entries:

```
⚠️  forcePublic pattern "/api/nonexistent-route" did not match any registered route
   (check for typos or outdated config)
```

---

## Configuration

### Single configuration

```typescript
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: '/api',
    defaultRequiresAuth: false,
  })
)
```

### Prefix array

Register the same controllers under multiple prefixes — useful for API versioning or locale prefixes.

```typescript
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: ['/api', '/v1', '/v2'],
  })
)

// Each route file is registered 3 times:
// get-users.ts → GET /api/users, GET /v1/users, GET /v2/users
```

### Merged configuration (array)

Pass an array of config objects to `autoRouter()` to configure multiple directories in a single call. Each entry can have its own `dir`, `prefix`, `defaultRequiresAuth`, `forcePublic`, `forceProtected`, `strict`, `logging`, and `onLog`.

```typescript
app.extend(
  autoRouter([
    {
      dir: './controllers/admin',
      prefix: '/api/admin',
      defaultRequiresAuth: true,
    },
    {
      dir: './controllers/public',
      prefix: '/api/public',
      defaultRequiresAuth: false,
    },
    {
      dir: './controllers/v2',
      prefix: ['/api/v2', '/v2'],
    },
  ])
)
```

### Multiple calls

Alternatively, call `autoRouter` multiple times. Routes accumulate in `app.$routes` and duplicate detection works across all calls via `app.$registeredRoutes`.

```typescript
app.extend(autoRouter({ dir: './controllers/admin', prefix: '/api/admin' }))
app.extend(autoRouter({ dir: './controllers/client', prefix: '/api/client' }))
```

### No prefix

Pass `''` (empty string) to register routes without a prefix:

```typescript
autoRouter({ dir: './controllers', prefix: '' })
// get-users.ts → GET /users
// get-[id].ts  → GET /:id
```

---

## Route Registry

After loading, `app.$routes` contains all registered route metadata:

```typescript
app.$routes.all             // RouteInfo[]         — every registered route
app.$routes.publicRoutes    // { method, path }[]  — public routes
app.$routes.protectedRoutes // { method, path }[]  — protected routes
```

`RouteInfo` contains `method`, `path`, `requiresAuth`, and `meta` (the `RouteMeta` passed to `createHandler`, if any).

This is designed for integrating with auth middleware:

```typescript
app.use(async (ctx, next) => {
  const isProtected = app.$routes.protectedRoutes.some(
    r => r.method === ctx.method && r.path === ctx.path
  )
  if (isProtected) {
    // verify JWT token, session, etc.
  }
  await next()
})
```

---

## API Documentation Generation

`app.$routes.all` provides a complete route manifest ideal for generating OpenAPI specs, Postman collections, or any other API documentation format. Iterate over the registry and map each `RouteInfo` to your target format.

### OpenAPI / Swagger

```typescript
import { autoRouter } from '@chaeco/auto-router'

app.extend(autoRouter({ dir: './controllers', prefix: '/api' }))

// After app.listen() or await app.ready()
const spec = {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
  paths: {},
}

for (const route of app.$routes.all) {
  const path = route.path.replace(/:/g, '{').replace(/\{([^}]+)\}/g, '{$1}')
  if (!spec.paths[path]) spec.paths[path] = {}

  const operation: Record<string, any> = {
    summary: route.meta?.description ?? route.path,
    responses: { default: { description: 'Default response' } },
  }
  if (route.requiresAuth === true) operation.security = [{ bearerAuth: [] }]
  if (route.meta?.tags) operation.tags = route.meta.tags

  spec.paths[path][route.method.toLowerCase()] = operation
}
```

### Postman Collection

```typescript
const collection = {
  info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [],
}

for (const route of app.$routes.all) {
  collection.item.push({
    name: route.meta?.description ?? route.path,
    request: {
      method: route.method.toUpperCase(),
      url: { raw: `{{baseUrl}}${route.path}`, path: route.path.split('/').filter(Boolean) },
      auth: route.requiresAuth ? { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] } : undefined,
    },
  })
}
```

### Tags / Grouping

Add tags via `createHandler` meta for logical grouping in generated docs:

```typescript
export default createHandler(
  async (ctx) => { ctx.body = { users: [] } },
  { description: 'List all users', tags: ['Users', 'CRUD'] }
)
```

---

## Type Safety

`RouteHandler<TCtx, TRes>` is a conditional generic that adapts to your framework:

### Single-context frameworks (Hoa, Koa, Fastify)

```typescript
import { createHandler } from '@chaeco/auto-router'
import type { RouteHandler } from '@chaeco/auto-router'

type MyContext = { body: any; params: Record<string, string> }

export default createHandler<MyContext>(
  async (ctx) => {
    ctx.body = { success: true }   // ctx is typed as MyContext
  },
  { requiresAuth: true }
)
```

### Dual-parameter frameworks (Express)

```typescript
import type { Request, Response } from 'express'

export default createHandler<Request, Response>(
  async (req, res) => {
    res.json({ success: true })    // req: Request, res: Response
  },
  { requiresAuth: true }
)
```

`RouteMeta` supports custom extensions:

```typescript
export default createHandler(
  async (ctx) => { ... },
  {
    requiresAuth: true,
    description: 'Get user profile',
    rateLimit: 100,            // custom field
    roles: ['admin', 'user'],  // custom field
  }
)
```

---

## Logging

### Default: all levels to console

```typescript
autoRouter({ dir: './controllers' })
// info → console.log, warn → console.warn, error → console.error
```

### Custom log sink

When `onLog` is provided, console output is fully replaced — your callback handles all log levels.

```typescript
autoRouter({
  dir: './controllers',
  onLog: (level, message) => {
    myLogger[level](message)
  },
})
```

### Silent mode

```typescript
autoRouter({ dir: './controllers', logging: false })
// No console output (info, warn, and error are all suppressed)
```

### Silent but capture errors

```typescript
autoRouter({
  dir: './controllers',
  logging: false,
  onLog: (level, message) => {
    if (level === 'error') errorTracker.capture(message)
  },
})
```

---

## Validation Rules

The auto-router validates every file during scanning and **skips** invalid files (logging an error) without aborting. The remaining files in the directory continue to be scanned.

| Rule | Valid | Invalid |
|------|-------|---------|
| File name starts with HTTP method | `get-users.ts` | `users-get.ts` |
| Bracket syntax for params | `[userId]` | `:userId` |
| No empty brackets | `[id]` | `[]` |
| Only default export | `export default async ...` | `export const foo = 1` + default |
| Export is a function or `createHandler()` result | `async (ctx) => {}` | `export default 42` |
| Directory names not HTTP methods | `controllers/users/` | `controllers/get/` ⚠️ |
| No duplicate routes across instances | — | Two files mapping to `GET /api/users` |
| `.d.ts` files ignored | — | `types.d.ts` is silently skipped |

---

## Best Practices

### Do ✅

- Use **nested directories** for resource hierarchies — `users/[userId]/posts/get.ts` instead of `get-users-[userId]-posts.ts`
- Use **`[dirName]` dynamic directories** for parent resource params — keeps file names short
- Use **`createHandler()`** when a route's auth differs from the global default
- Use **`forceProtected`** for admin/sensitive areas — one pattern covers all routes
- Use **`forcePublic`** for auth/login/docs areas — explicit and auditable
- Choose **blacklist mode** (`defaultRequiresAuth: false`) for public-facing APIs
- Choose **whitelist mode** (`defaultRequiresAuth: true`) for internal/admin APIs
- Keep **handler logic thin** — delegate to service layers
- Use **`strict: true`** (the default) — enforces consistent export style

### Don't ❌

- **Don't** flatten deep resource trees into long file names — 3+ hyphens → use directories
- **Don't** put complex logic in route files — they're entry points, not business logic
- **Don't** mix export styles in the same directory — pick one and use `strict: true`
- **Don't** forget to update `forcePublic`/`forceProtected` patterns when restructuring controllers
- **Don't** create controller files outside the configured `dir` — they won't be scanned

---

## Runtimes Without Filesystem Access

The standard `autoRouter` relies on `fs` + dynamic `import()`, which are unavailable in edge runtimes (Cloudflare Workers, Deno Deploy, etc.) and bundled Node.js apps. Two solutions are available:

### staticAutoRouter

Manually import handlers and declare routes as data — works in any bundler.

```typescript
import { staticAutoRouter } from '@chaeco/auto-router'

// Static imports — works in any bundler (esbuild, webpack, rolldown, etc.)
import getUsers from './controllers/get-users'
import getUserById from './controllers/get-[id]'
import postLogin from './controllers/post-login'

app.extend(
  staticAutoRouter({
    routes: [
      { method: 'get',  path: '/api/users',  handler: getUsers },
      { method: 'get',  path: '/api/:id',    handler: getUserById },
      { method: 'post', path: '/api/login',  handler: postLogin },
    ],
    defaultRequiresAuth: false,
    forcePublic: ['/api/login'],
  })
)
```

`staticAutoRouter` supports the same auth options as `autoRouter`: `defaultRequiresAuth`, `forcePublic`, `forceProtected`, `logging`, and `onLog`. Route validation (duplicate detection, auth resolution, registry population) works identically.

### Cloudflare Workers

Cloudflare Workers require a different approach: they use the Web Platform `fetch(request, env, ctx)` signature rather than framework middleware. Use the **build-time CLI** + **`createWorkerRouter`** for Workers.

#### Step 1: Generate the manifest at build time

The CLI scans your controllers directory and generates a static TypeScript file with imports + route definitions:

```bash
npx auto-router-build-manifest ./controllers ./worker-routes.ts --prefix /api
```

This produces `worker-routes.ts`:

```typescript
// AUTO-GENERATED by @chaeco/auto-router build-manifest
import type { WorkerManifestRoute } from '@chaeco/auto-router/worker-manifest'
import handler_get_users from './controllers/get-users'
import handler_get_id from './controllers/get-[id]'
import handler_post_login from './controllers/post-login'

export const routes: WorkerManifestRoute[] = [
  { pattern: '/api/:id', method: 'GET', handler: handler_get_id },
  { pattern: '/api/login', method: 'POST', handler: handler_post_login },
  { pattern: '/api/users', method: 'GET', handler: handler_get_users },
]
```

#### Step 2: Use `createWorkerRouter` in your Worker

```typescript
import { createWorkerRouter } from '@chaeco/auto-router/worker-manifest'
import { routes } from './worker-routes'

interface Env {
  DATABASE_URL: string
  KV: KVNamespace
}

const router = createWorkerRouter<Env>({
  routes,
  notFound: (req, env, ctx) => new Response('Not Found', { status: 404 }),
  onError: (err, req, env, ctx) => {
    console.error('Handler error:', err)
    return new Response('Internal Server Error', { status: 500 })
  }
})

export default {
  fetch: router.fetch
}
```

#### Handler signature for Workers

Workers handlers receive a single `WorkerRouteContext` parameter (not `req, res` like Express):

```typescript
import type { WorkerRouteContext } from '@chaeco/auto-router/worker-manifest'

// controllers/get-users.ts
export default async (ctx: WorkerRouteContext<Env>) => {
  const users = await ctx.env.KV.get('users')
  return { users: JSON.parse(users || '[]') }
}

// controllers/get-[id].ts
export default async (ctx: WorkerRouteContext<Env>) => {
  const { id } = ctx.params
  return { id, user: await fetchUser(id) }
}

// controllers/post-login.ts
export default async (ctx: WorkerRouteContext<Env>) => {
  const body = await ctx.req.json()
  const token = await createToken(body.email, ctx.env.DATABASE_URL)
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

**Context shape:**

```typescript
interface WorkerRouteContext<TEnv = unknown, TCtx = ExecutionContext> {
  req: Request                          // Web Platform Request
  env: TEnv                             // Worker environment bindings (KV, D1, secrets)
  ctx: TCtx                             // ExecutionContext (waitUntil, passThroughOnException)
  params: Record<string, string>        // Route parameters (:id, :userId, etc.) — case preserved
  res: {                                // Response builder (only used if handler returns undefined)
    status: number
    headers: Record<string, string>
    body: string | ArrayBuffer | ReadableStream | null
  }
}
```

**Response handling:**

Handlers can return data in three ways (checked in order):

1. **Return a `Response` directly** → used as-is
2. **Return any non-null/undefined value** → auto-serialized as JSON
3. **Return `undefined`** → `ctx.res` builder is serialized

```typescript
// Option 1: Direct Response (full control)
export default async (ctx) => {
  return new Response('Hello', { status: 200, headers: { 'X-Custom': 'value' } })
}

// Option 2: Return plain object (auto JSON)
export default async (ctx) => {
  return { users: ['Alice', 'Bob'] }  // → JSON response with Content-Type: application/json
}

// Option 3: Mutate ctx.res (low-level)
export default async (ctx) => {
  ctx.res.status = 201
  ctx.res.headers['X-Custom'] = 'value'
  ctx.res.body = 'Created'
  // returning undefined triggers ctx.res serialization
}
```

#### CLI options

```bash
npx auto-router-build-manifest <controllersDir> <outputFile> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--prefix` | `/api` | Route prefix |
| `--ext` | `ts` | File extension to scan (`ts` or `js`) |

**Examples:**

```bash
# Default: scan .ts files, prefix /api
npx auto-router-build-manifest ./controllers ./worker-routes.ts

# Custom prefix
npx auto-router-build-manifest ./controllers ./routes.ts --prefix /v1

# Scan .js files instead of .ts
npx auto-router-build-manifest ./controllers ./routes.js --prefix /api --ext js
```

#### Auth in Workers

**`createWorkerRouter` does NOT integrate auth resolution** (`defaultRequiresAuth`, `forcePublic`, `forceProtected`). Workers auth is application-level — handlers receive `env` directly with secrets/KV/D1, so you implement auth logic inside handlers or via a wrapper:

```typescript
// Wrapper pattern for auth
function requireAuth<TEnv>(
  handler: (ctx: WorkerRouteContext<TEnv>) => Promise<any>
) {
  return async (ctx: WorkerRouteContext<TEnv>) => {
    const token = ctx.req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token || !(await verifyToken(token, ctx.env))) {
      return new Response('Unauthorized', { status: 401 })
    }
    return handler(ctx)
  }
}

// Usage
export default requireAuth(async (ctx) => {
  return { secret: 'data' }
})
```

#### Why not `staticAutoRouter` for Workers?

`staticAutoRouter` is designed for **framework middleware** (Hono, Koa, Express) which use `app.get(path, handler)` registration. Workers use the **`fetch(req, env, ctx)` signature** defined by the Web Platform standard — no middleware stack, no `app` object. `createWorkerRouter` matches this signature and provides zero-dependency routing optimized for Workers' execution model.

#### Performance characteristics

`createWorkerRouter` uses a **linear scan (O(n))** to match routes:

- **Fast for typical Workers apps** — most Workers have 10-50 routes; linear scan adds < 100μs per request
- **Recommended limit: < 100 routes** — beyond this, consider splitting into multiple Workers or using a trie-based router
- **No regex compilation overhead** — routes are matched by string comparison, not precompiled regexes

The simple implementation prioritizes:
- **Zero dependencies** — no router library to bundle
- **Minimal code size** — ~120 lines, < 1KB minified
- **Debuggability** — straightforward logic, no hidden complexity

For most Workers use cases, this is the right tradeoff. If you have 100+ routes and measure matching as a bottleneck, consider:
- Grouping related routes into separate Workers (e.g., `/api/v1/*` vs `/api/v2/*`)
- Using a prefix-based dispatch before calling `createWorkerRouter`
- Implementing a custom trie-based matcher (outside this library's scope)

#### Deployment example

Complete Workers project structure:

```
my-worker/
├── src/
│   ├── index.ts              # Worker entry point
│   ├── worker-routes.ts      # Generated manifest (gitignored or committed)
│   └── controllers/
│       ├── get-users.ts
│       ├── get-[id].ts
│       └── post-login.ts
├── wrangler.toml
├── package.json
└── tsconfig.json
```

**wrangler.toml:**

```toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"

# Environment variables (secrets via `wrangler secret put`)
[vars]
ENVIRONMENT = "production"

# KV, D1, R2 bindings as needed
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
```

**package.json scripts:**

```json
{
  "scripts": {
    "build:routes": "auto-router-build-manifest ./src/controllers ./src/worker-routes.ts --prefix /api",
    "build": "npm run build:routes && tsc",
    "dev": "npm run build:routes && wrangler dev",
    "deploy": "npm run build && wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240806.0",
    "wrangler": "^3.60.0",
    "typescript": "^5.5.0"
  },
  "dependencies": {
    "@chaeco/auto-router": "^0.0.14"
  }
}
```

**src/index.ts:**

```typescript
import { createWorkerRouter } from '@chaeco/auto-router/worker-manifest'
import { routes } from './worker-routes'

export interface Env {
  CACHE: KVNamespace
  DATABASE_URL: string
}

const router = createWorkerRouter<Env>({
  routes,
  notFound: (req) => new Response(`Not Found: ${new URL(req.url).pathname}`, { status: 404 }),
  onError: (err, req) => {
    console.error('Request failed:', err)
    return new Response('Internal Server Error', { status: 500 })
  }
})

export default {
  fetch: router.fetch
}
```

**Deployment workflow:**

```bash
# 1. Generate routes manifest
npm run build:routes

# 2. Test locally
npm run dev
# → http://localhost:8787

# 3. Deploy to production
npm run deploy
# → https://my-api.your-subdomain.workers.dev
```

**Regenerate manifest on file changes:**

Add a `watch` script for development:

```json
{
  "scripts": {
    "watch:routes": "nodemon --watch src/controllers -e ts --exec 'npm run build:routes'",
    "dev:watch": "concurrently \"npm run watch:routes\" \"wrangler dev\""
  }
}
```

---

## API Reference

### `autoRouter(options)`

Factory function. Returns an async plugin function `(app) => Promise<void>` for use with `app.extend()`.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dir` | `string` | `'./controllers'` | Path to controller directory |
| `prefix` | `string \| string[]` | `'/api'` | Route prefix; `''` for no prefix |
| `defaultRequiresAuth` | `boolean` | `false` | Global auth default |
| `forcePublic` | `string[]` | — | Patterns for always-public routes |
| `forceProtected` | `string[]` | — | Patterns for always-protected routes |
| `strict` | `boolean` | `true` | Strict export validation |
| `logging` | `boolean` | `true` | Console log output |
| `onLog` | `(level, message) => void` | — | Custom log sink |

`options` can also be an **array** of the above for merged multi-configuration.

### `staticAutoRouter(options)`

For runtimes without filesystem access. Accepts statically imported routes instead of scanning a directory.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routes` | `StaticRoute[]` | **required** | Array of `{ method, path, handler }` |
| `defaultRequiresAuth` | `boolean` | `false` | Global auth default |
| `forcePublic` | `string[]` | — | Patterns for always-public routes |
| `forceProtected` | `string[]` | — | Patterns for always-protected routes |
| `logging` | `boolean` | `true` | Console log output |
| `onLog` | `(level, message) => void` | — | Custom log sink |

**`StaticRoute`:**

```typescript
interface StaticRoute {
  method: string    // 'get', 'post', 'put', 'delete', 'patch'
  path: string      // '/api/users', '/api/:id'
  handler: any      // async function or createHandler() result
}
```

### `createWorkerRouter(options)`

For Cloudflare Workers and other Web Platform `fetch(request, env, ctx)` runtimes. Returns a router with a `fetch` method.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routes` | `WorkerManifestRoute[]` | **required** | Array of routes (from generated manifest) |
| `notFound` | `(req, env, ctx) => Response \| Promise<Response>` | `404 'Not Found'` | Custom 404 handler |
| `onError` | `(err, req, env, ctx) => Response \| Promise<Response>` | `500 'Internal Server Error'` | Custom error handler |

**`WorkerManifestRoute`:**

```typescript
interface WorkerManifestRoute<TEnv = unknown, TCtx = ExecutionContext> {
  pattern: string   // Express-style path: '/api/users/:id'
  method: string    // 'GET', 'POST', etc.
  handler: unknown  // Route handler function or createHandler result
}
```

**`WorkerRouteContext`:**

```typescript
interface WorkerRouteContext<TEnv = unknown, TCtx = ExecutionContext> {
  req: Request
  env: TEnv
  ctx: TCtx
  params: Record<string, string>
  res: {
    status: number
    headers: Record<string, string>
    body: string | ArrayBuffer | ReadableStream | null
  }
}
```

**CLI for manifest generation:**

```bash
npx auto-router-build-manifest <controllersDir> <outputFile> [--prefix /api] [--ext ts]
```

See [Cloudflare Workers](#cloudflare-workers) section for complete usage.

### `createHandler(handler, meta?, middlewares?)`

```typescript
createHandler<TCtx = any, TRes = void>(
  handler: RouteHandler<TCtx, TRes>,
  meta?: RouteMeta,
  middlewares?: RouteMiddleware<TCtx>[]
): RouteConfig<TCtx, TRes>
```

Wraps a handler function with metadata. An empty `{}` meta is normalized to `undefined`, and an empty `[]` middlewares is normalized to `undefined`.

**`RouteMeta` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `requiresAuth` | `boolean` | Whether auth is required |
| `description` | `string` | Human-readable route description |
| `[key: string]` | `any` | Any custom metadata |

**`RouteMiddleware`:**

```typescript
type RouteMiddleware<TCtx = any> =
  (ctx: TCtx, next: () => Promise<any> | any) => Promise<any> | any
```

Koa/Hoa-style route-level middleware. Registered before the handler — see [Method 3](#method-3-createhandler-with-route-level-middlewares).

### `isRouteConfig(obj)`

```typescript
isRouteConfig(obj: any): obj is RouteConfig
```

Returns `true` if `obj` was created by `createHandler()`. Useful for type-narrowing.

### Exported types

```typescript
export type { RouteHandler, RouteMiddleware, RouteMeta, RouteConfig, RouteInfo, AppRoutesRegistry } from '@chaeco/auto-router'
export type { StaticRoute, StaticAutoRouterOptions } from '@chaeco/auto-router'
export type { WorkerManifestRoute, WorkerRouteContext, WorkerRouterOptions } from '@chaeco/auto-router/worker-manifest'
```

---

## License

MIT — see [LICENSE](LICENSE).
