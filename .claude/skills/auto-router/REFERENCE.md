# Auto Router — Reference

## Route conversion algorithm

The `routeName` (everything after `method-` in the file name) goes through three regex passes:

```
Step 1: [param]       → :param        bracket → Express-style param
Step 2: -:/           → /:            dash-before-colon → slash-before-colon
Step 3: :param-/      → :param/       colon-segment before dash → slash after
```

Then `basePath + '/' + routeName` is assembled and `//` collapsed to `/`.

### Algorithm walkthrough

| File name | routeName | Step 1 | Step 2 | Step 3 | Route |
|-----------|-----------|--------|--------|--------|-------|
| `get-users.ts` | `users` | `users` | `users` | `users` | `/api/users` |
| `get-[id].ts` | `[id]` | `:id` | `:id` | `:id` | `/api/:id` |
| `get-[userId]-posts.ts` | `[userId]-posts` | `:userId-posts` | `:userId-posts` | `:userId/posts` | `/api/:userId/posts` |
| `get-users-[id].ts` | `users-[id]` | `users-:id` | `users/:id` | `users/:id` | `/api/users/:id` |
| `get-[a]-[b].ts` | `[a]-[b]` | `:a-:b` | `:a/:b` | `:a/:b` | `/api/:a/:b` |
| `get-[a]-[b]-[c].ts` | `[a]-[b]-[c]` | `:a-:b-:c` | `:a/:b-:c` | `:a/:b/:c` | `/api/:a/:b/:c` |
| `get-[org]-settings-[key].ts` | `[org]-settings-[key]` | `:org-settings-:key` | `:org/settings-:key` | `:org/settings/:key` | `/api/:org/settings/:key` |

### Base path construction

```
basePath = directory nesting relative to the configured dir
fullPath  = basePath ? basePath + '/' + routeName : '/' + routeName
```

| File path (relative to dir) | basePath | routeName | fullPath |
|------------------------------|----------|-----------|----------|
| `get-users.ts` | `""` | `users` | `/users` |
| `users/get.ts` | `/users` | `""` (method-only) | `/users` |
| `users/posts/get-[id].ts` | `/users/posts` | `:id` | `/users/posts/:id` |
| `users/[userId]/get.ts` | `/users/[userId]` | `""` | `/users/:userId` |

### `-` is always a path separator

The hyphen `-` between route name segments is **always** converted to `/`. There is no escape mechanism. If your API requires a literal `-` in a path (e.g. `/api/user-settings`), use one of:

- A nested directory: `controllers/user-settings/get.ts` — the directory name includes the hyphen literally
- Manual route registration outside auto-router

## Validation rules

### File name validation (`validateFileName`)

| Check | Valid | Invalid |
|-------|-------|---------|
| Starts with `{method}-` or exactly `{method}` | `get-users.ts`, `get.ts` | `users-get.ts` |
| No empty brackets | `[id]` | `[]` |
| Only `.ts`, `.js` files (excluding `.d.ts`) | `get-users.ts` | `types.d.ts` |

### Export validation (strict mode)

| Check | Allowed | Rejected |
|-------|---------|----------|
| Pure async function | `export default async (ctx) => {}` | — |
| createHandler result | `export default createHandler(fn, meta)` | — |
| Plain object with handler | — | `export default { handler, meta }` |
| Non-function types | — | `export default 42`, `export default "str"` |
| Named exports | — | `export const foo = 1` alongside default |
| Falsy non-null default | — | `export default false`, `export default 0` |
| Null/undefined default | silently skipped | `export default null` |

### Directory validation

- Directory names that match HTTP methods (`get`, `post`, `put`, `delete`, `patch`, `head`, `options`) produce a **warning** but are not blocked
- Unreadable directories (permission denied) are **skipped** with a warning; sibling files continue scanning
- Broken symlinks are **skipped** with a warning

## Auth resolution flow

```
For each route:
  1. Extract routeMeta from createHandler (if used), otherwise undefined
  2. Check forcePublic patterns  → matchedPublicPattern
  3. Check forceProtected patterns → matchedProtectedPattern
  4. Resolve:
     a. routeMeta.requiresAuth defined? → use it (explicit wins)
     b. matchedProtectedPattern? → requiresAuth: true
     c. matchedPublicPattern?  → requiresAuth: false
     d. Otherwise → defaultRequiresAuth
```

### Pattern matching (`matchesFilter`)

```
Pattern: "GET /api/users"
  → method: "GET", pathPattern: "/api/users"

Pattern: "/api/users"
  → method: undefined (all methods), pathPattern: "/api/users"

Pattern: "/api/admin/*"
  → method: undefined, pathPattern: "/api/admin/*", isWildcard: true
  → matches /api/admin/foo, /api/admin/foo/bar
  → does NOT match /api/admin itself

Pattern: "/users"  (without prefix)
  → tries candidatePaths: ["/api/users", "/users"]
  → both are checked against the pattern
```

### Post-load warnings

After all routes are loaded, the auto-router checks:

1. **Conflict warnings** — routes matching both `forcePublic` and `forceProtected`
2. **Override warnings** — force patterns overridden by explicit `createHandler` meta
3. **Unused pattern warnings** — `forcePublic`/`forceProtected` patterns that matched zero routes

## Error handling during scan

| Error | Behavior |
|-------|----------|
| statSync fails (broken symlink, permission) | Skip entry, log warning, continue |
| Directory unreadable | Skip directory, log warning, continue scanning siblings |
| Module import throws | Log error, skip route, continue |
| Duplicate route | Log error, skip route (first registration wins), continue |

**Key principle:** A single bad file never aborts the entire scan.

## Configuration expansion

When `options` is an array, each entry is expanded independently:

```
autoRouter([A, B]) → [expand(A), expand(B)]

expand({ prefix: ['/api', '/v1'] }) → [{prefix:'/api'}, {prefix:'/v1'}]
expand({ prefix: '/api' })           → [{prefix:'/api'}]
expand({})                           → [{prefix:'/api'}]  (default)
```

Prefix normalization: trailing slash removed unless bare `"/"`.

## Route registration lifecycle

```
1. Initialize app.$routes (if not exists)
2. Initialize app.$registeredRoutes (if not exists)
3. Scan directory → validate files → dynamic import
4. Per file:
   a. Validate export
   b. Resolve auth
   c. Register: app[method](path, handler)
   d. Record in app.$routes
5. Wait for all imports (Promise.all)
6. Post-load warnings (conflicts, unused patterns)
7. Print summary
```

## API documentation generation

`app.$routes.all` exposes a complete route manifest for generating OpenAPI specs, Postman collections, or other API documentation formats.

### Route manifest structure

```typescript
interface RouteInfo {
  method: string          // 'get', 'post', 'put', 'delete', 'patch'
  path: string            // '/api/users/:id'
  requiresAuth?: boolean
  meta?: RouteMeta        // { description?, tags?, [key: string]: any }
}
```

### OpenAPI generation pattern

```typescript
const spec = { openapi: '3.0.0', info: { title: 'API', version: '1.0.0' }, paths: {} }

for (const route of app.$routes.all) {
  const path = route.path.replace(/:/g, '{')
  if (!spec.paths[path]) spec.paths[path] = {}
  spec.paths[path][route.method.toLowerCase()] = {
    summary: route.meta?.description ?? route.path,
    responses: { default: { description: 'OK' } },
    ...(route.requiresAuth ? { security: [{ bearerAuth: [] }] } : {}),
  }
}
```

### Postman collection pattern

```typescript
const collection = {
  info: { name: 'API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: app.$routes.all.map(route => ({
    name: route.meta?.description ?? route.path,
    request: {
      method: route.method.toUpperCase(),
      url: { raw: `{{baseUrl}}${route.path}`, path: route.path.split('/').filter(Boolean) },
    },
  })),
}
```

### Extending with custom metadata

Add `tags`, `operationId`, or other OpenAPI-compatible fields via `createHandler`:

```typescript
export default createHandler(
  async (ctx) => { ctx.body = { users: [] } },
  { description: 'List users', tags: ['Users'], operationId: 'listUsers' }
)
```

## Type reference

```typescript
// From '@chaeco/auto-router'
createHandler<TCtx, TRes>(handler, meta?): RouteConfig
isRouteConfig(obj): obj is RouteConfig

type RouteHandler<TCtx, TRes>  // conditional: single-ctx vs dual-param
type RouteMeta { requiresAuth?, description?, [key: string]: any }
type RouteConfig<TCtx, TRes> { handler, meta? }
type RouteInfo { method, path, requiresAuth?, meta? }
type AppRoutesRegistry { publicRoutes, protectedRoutes, all }

type StaticRoute { method, path, handler }
type StaticAutoRouterOptions { routes, ...auth options }

// From '@chaeco/auto-router/worker-manifest'
createWorkerRouter(options): { fetch }
type WorkerRouteContext<TEnv, TCtx> { req, env, ctx, params, res }
type WorkerManifestRoute<TEnv, TCtx> { pattern, method, handler }
```
