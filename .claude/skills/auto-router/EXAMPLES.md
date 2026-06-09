# Auto Router — Examples

## Scenario 1: Simple CRUD

```
controllers/
  get-users.ts         → GET    /api/users
  get-[id].ts          → GET    /api/:id
  post-users.ts        → POST   /api/users
  put-[id].ts          → PUT    /api/:id
  delete-[id].ts       → DELETE /api/:id
```

```typescript
// controllers/get-users.ts
export default async (ctx) => {
  ctx.res.body = await db.users.findMany()
}

// controllers/get-[id].ts
export default async (ctx) => {
  ctx.res.body = await db.users.findById(ctx.params.id)
}

// controllers/post-users.ts
export default async (ctx) => {
  ctx.res.body = await db.users.create(ctx.req.body)
}
```

All routes inherit `defaultRequiresAuth: false` — public API.

## Scenario 2: Resource hierarchy with nested directories

Goal: `GET /api/users/:userId/posts/:postId/comments`

```
controllers/
  users/
    [userId]/
      posts/
        [postId]/
          comments/
            get.ts       → GET /api/users/:userId/posts/:postId/comments
            post.ts      → POST /api/users/:userId/posts/:postId/comments
```

```typescript
// controllers/users/[userId]/posts/[postId]/comments/get.ts
export default async (ctx) => {
  const { userId, postId } = ctx.params
  ctx.res.body = await db.comments.findByPost({ userId, postId })
}
```

Each directory segment is short. The hierarchy is self-documenting.

## Scenario 3: Mixed flat + nested

Goal:
```
GET    /api/orgs/:orgId
GET    /api/orgs/:orgId/members
POST   /api/orgs/:orgId/members
DELETE /api/orgs/:orgId/members/:userId
```

```
controllers/
  orgs/
    get-[orgId].ts                    → GET    /api/orgs/:orgId
    [orgId]/
      members/
        get.ts                        → GET    /api/orgs/:orgId/members
        post.ts                       → POST   /api/orgs/:orgId/members
        delete-[userId].ts            → DELETE /api/orgs/:orgId/members/:userId
```

The top-level `get-[orgId].ts` is flat (≤3 segments). The `members` subtree uses directories for deeper nesting.

## Scenario 4: Auth — whitelist mode with forcePublic

```typescript
// Bootstrap
app.extend(autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: true,     // everything protected by default
  forcePublic: [
    '/api/auth/*',               // all auth routes are public
    '/api/health',               // health check is public
  ],
}))
```

```typescript
// controllers/auth/post-login.ts — public (forcePublic pattern)
export default async (ctx) => {
  ctx.res.body = { token: jwt.sign({ userId: ctx.user.id }) }
}
```

```typescript
// controllers/get-users.ts — protected (defaultRequiresAuth: true)
export default async (ctx) => {
  ctx.res.body = await db.users.findMany()
}
```

No per-file `createHandler` needed for either route. The `forcePublic` pattern handles auth routes, and the default covers everything else.

## Scenario 5: Auth — mixed, with method-specific overrides

Goal:
```
GET    /api/products          → public
POST   /api/products          → protected (admin only)
PUT    /api/products/:id      → protected (admin only)
DELETE /api/products/:id      → protected (admin only)
```

```typescript
app.extend(autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: false,         // public by default
  forceProtected: [
    'POST /api/products',             // only POST is protected
    'PUT /api/products/*',            // wildcard for PUT on any product
    'DELETE /api/products/*',         // wildcard for DELETE on any product
  ],
}))
```

```typescript
// controllers/get-products.ts → public (default)
export default async (ctx) => {
  ctx.res.body = await db.products.findMany()
}

// controllers/post-products.ts → protected (forceProtected)
export default async (ctx) => {
  ctx.res.body = await db.products.create(ctx.req.body)
}
```

GET stays public without any annotation. POST/PUT/DELETE are protected via patterns.

## Scenario 6: Per-route explicit meta overriding forcePublic

```typescript
app.extend(autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: false,
  forcePublic: ['/api/users/*'],      // intended: all user routes public
}))
```

```typescript
// controllers/users/get-settings.ts
// Explicit meta wins over forcePublic — this route IS protected
import { createHandler } from '@chaeco/auto-router'

export default createHandler(
  async (ctx) => {
    ctx.res.body = { settings: ctx.user.settings }
  },
  { requiresAuth: true }    // ← overrides forcePublic
)
```

A warning is logged: `forcePublic pattern "/api/users/*" matched "/api/users/settings" but has no effect — route has explicit createHandler meta`.

## Scenario 7: Multi-prefix with versioning

```typescript
app.extend(autoRouter({
  dir: './controllers/v2',
  prefix: ['/api/v2', '/api/latest'],
}))
```

```
controllers/v2/
  get-users.ts  → GET /api/v2/users, GET /api/latest/users
  get-[id].ts   → GET /api/v2/:id,   GET /api/latest/:id
```

Same handler, two URL prefixes. No code duplication.

## Scenario 8: Merged multi-configuration

```typescript
app.extend(autoRouter([
  {
    dir: './controllers/admin',
    prefix: '/api/admin',
    defaultRequiresAuth: true,          // admin: all protected
  },
  {
    dir: './controllers/public',
    prefix: '/api',
    defaultRequiresAuth: false,         // public: all open
    forcePublic: ['/api/docs/*'],
  },
  {
    dir: './controllers/webhooks',
    prefix: '/api/webhooks',
    defaultRequiresAuth: false,
    forceProtected: ['POST /api/webhooks/*'],  // only POST webhooks need auth
  },
]))
```

Three independent controller directories, each with its own auth policy. All in one call.

## Scenario 9: No prefix (root-level API)

```typescript
app.extend(autoRouter({ dir: './controllers', prefix: '' }))
```

```
controllers/
  get-users.ts   → GET /users
  get-[id].ts    → GET /:id
  post-login.ts  → POST /login
```

## Scenario 10: CreateHandler with custom metadata

```typescript
import { createHandler } from '@chaeco/auto-router'

export default createHandler(
  async (ctx) => {
    const { userId } = ctx.params
    ctx.res.body = await db.users.findById(userId)
  },
  {
    requiresAuth: true,
    description: 'Get user by ID',
    rateLimit: 100,                                  // custom
    roles: ['admin', 'support'],                     // custom
    audit: true,                                     // custom
  }
)
```

Custom meta fields are accessible via `app.$routes.all[i].meta` after loading.

## Scenario 11: Cloudflare Workers (static manifest)

Build step (Node.js):
```bash
npx tsx node_modules/@chaeco/auto-router/dist/build-worker-manifest.js \
  ./controllers \
  ./dist/worker-routes.ts
```

Worker code:
```typescript
import { createWorkerRouter } from '@chaeco/auto-router/worker-manifest'
import { routes } from './worker-routes'

const router = createWorkerRouter({
  routes,
  notFound: (ctx) => {
    ctx.res.status = 404
    ctx.res.body = { error: 'Not Found' }
  },
  onError: (err, req) => new Response('Internal Server Error', { status: 500 }),
})

export default { fetch: (req, env, ctx) => router.fetch(req, env, ctx) }
```

## Scenario 12: Logging — custom sink

```typescript
import pino from 'pino'
const logger = pino()

app.extend(autoRouter({
  dir: './controllers',
  onLog: (level, message) => {
    logger[level](message)  // info → logger.info, warn → logger.warn, error → logger.error
  },
}))
```
