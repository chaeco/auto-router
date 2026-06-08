---
name: auto-router
description: File-based automatic router for Node.js frameworks. Use when creating routes, controllers, or API endpoints in projects using @chaeco/auto-router. Handles file naming ([method]-[route].ts), dynamic params ([param] syntax), createHandler exports, auth config (defaultRequiresAuth, forcePublic/forceProtected), and nested directory routing.
---

# Auto Router

File-based automatic routing: name a file → get a route. No manual registration.

## Quick start

```typescript
// controllers/get-users.ts
export default async (ctx) => {
  ctx.res.body = { users: [] }
}
// → GET /api/users
```

## Core rules

### File naming → route

| File | Route |
|------|-------|
| `get.ts` | `GET /api` (directory path) |
| `get-users.ts` | `GET /api/users` |
| `post-login.ts` | `POST /api/login` |
| `get-[id].ts` | `GET /api/:id` |
| `get-[userId]-posts.ts` | `GET /api/:userId/posts` |
| `get-[userId]-[postId].ts` | `GET /api/:userId/:postId` |
| `users/[userId]/posts/get.ts` | `GET /api/users/:userId/posts` |
| `users/[userId]/posts/get-[id].ts` | `GET /api/users/:userId/posts/:id` |

**Rule of thumb:** ≤3 path segments → flat file. >3 segments → nested directories. See [REFERENCE.md](REFERENCE.md) for the full conversion algorithm.

### Exports — two forms only

```typescript
// Form 1: Pure function (inherits global defaultRequiresAuth)
export default async (ctx) => { ... }

// Form 2: createHandler (explicit per-route meta)
import { createHandler } from '@chaeco/auto-router'
export default createHandler(async (ctx) => { ... }, { requiresAuth: true })
```

### Auth — three priority tiers

```
createHandler explicit meta  >  forceProtected / forcePublic  >  defaultRequiresAuth
```

| Mode | Setting | Effect |
|------|---------|--------|
| Blacklist | `defaultRequiresAuth: false` | Public by default, mark protected routes |
| Whitelist | `defaultRequiresAuth: true` | Protected by default, mark public routes |

`forcePublic` / `forceProtected` are bulk pattern-based overrides. When a route matches both, `forceProtected` wins.

## Workflows

### Adding a new public GET endpoint

1. Create file: `controllers/get-{name}.ts`
2. Export a pure async function
3. If `defaultRequiresAuth: true`, wrap with `createHandler(fn, { requiresAuth: false })`

### Adding a protected POST endpoint with url params

1. Use nested dirs if >2 params: `controllers/{resource}/[id]/{action}/post.ts`
2. Or flat file: `controllers/post-{resource}-[id]-{action}.ts`
3. Export with `createHandler(fn, { requiresAuth: true })`

### Adding bulk admin auth overrides

1. Use `forceProtected: ['/api/admin/*']` in config
2. No per-file `createHandler` needed — all admin routes protected

### Bootstrapping router config

```typescript
app.extend(autoRouter({
  dir: './controllers',
  prefix: ['/api', '/v1'],   // multi-prefix if needed
  defaultRequiresAuth: false, // blacklist mode
  forceProtected: ['/api/admin/*', 'POST /api/users'],
}))
```

## Guardrails

- ❌ NEVER export plain objects `{ handler, meta }` — use `createHandler()` instead
- ❌ NEVER use `:param` directly in file names — use `[param]` brackets
- ❌ NEVER use empty brackets `[]` — must be `[name]`
- ❌ NEVER use named exports alongside `export default` — only default export allowed
- ❌ NEVER flatten deep resource trees into long file names — use nested directories
- ❌ NEVER put `-` literals in route paths via file naming — `-` is always a path separator

See [REFERENCE.md](REFERENCE.md) for complete rules, [EXAMPLES.md](EXAMPLES.md) for scenario-driven examples.
