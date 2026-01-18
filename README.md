# @chaeco/hoa-auto-router

[![npm version](https://badge.fury.io/js/%40chaeco%2Fhoa-auto-router.svg)](https://badge.fury.io/js/%40chaeco%2Fhoa-auto-router)
[![codecov](https://codecov.io/gh/chaeco/hoa-auto-router/branch/main/graph/badge.svg)](https://codecov.io/gh/chaeco/hoa-auto-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

File-based automatic router plugin for Hoa.js framework. Routes are **functions only** for simplicity.

## Features

- 🚀 Zero-config automatic routing based on file structure
- 📁 Nested directory support with automatic path building
- � Built-in permission metadata (`requiresAuth`) support
- 🤝 Perfect integration with `@chaeco/hoa-jwt-permission`
- �🔍 Built-in validation for file naming and parameters
- 📝 Type-safe with full TypeScript support
- ⚡ Dynamic parameter support `[param]` syntax
- 🛡️ Duplicate route detection
- 🎯 Async handler support
- 🌍 Global `defaultRequiresAuth` configuration

## Installation

```bash
npm install @chaeco/hoa-auto-router
# or
yarn add @chaeco/hoa-auto-router
```

## Quick Start

### Basic Setup

```typescript
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

// Recommended: Strict mode (default enabled, functions only)
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: '/api',
    defaultRequiresAuth: false, // Blacklist mode
    strict: true, // Strict mode (default)
  })
)

app.listen(3000)
```

### Strict Mode

**Strict Mode (strict: true) - Recommended**:

- ✅ Only pure function exports allowed
- ✅ Only `createHandler()` wrapped exports allowed
- ❌ Plain object exports `{ handler, meta }` not allowed
- 🎯 Enforces consistent team code style

**Non-Strict Mode (strict: false)**:

- ✅ All export formats allowed
- ⚠️ Will show warning messages
- 💡 用于向后兼容或灵活迁移

### File Naming Convention

### Basic Format

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

#### Method 2: createHandler Wrapper（需要权限元数据时）

```typescript
import { createHandler } from '@chaeco/hoa-auto-router'

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

## Prefix Array Support

The `prefix` parameter supports string arrays, allowing the same controller directory to be registered with multiple prefixes:

```typescript
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

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

`hoa-auto-router` supports two approaches for configuring multiple route directories:

### Approach 1: Merged Configuration (Recommended)

Configure multiple directories at once using an array:

```typescript
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

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
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

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

## Integration with @chaeco/hoa-jwt-permission

Routes automatically collected for permission checking:

```typescript
import { Hoa } from 'hoa'
import { jwt } from '@hoajs/jwt'
import { autoRouter } from '@chaeco/hoa-auto-router'
import { jwtAuth } from '@chaeco/hoa-jwt-permission'
import config from './config'

const app = new Hoa()

// Layer 1: Token Verification
app.use(jwt({ secret: config.jwtSecret, algorithms: ['HS256'] }))

// Layer 2: Permission Check (auto-discovers from autoRouter)
app.use(jwtAuth({ autoDiscovery: true }))

// Layer 3: Route Discovery & Registration
app.extend(
  autoRouter({
    defaultRequiresAuth: false,
  })
)

// Now all routes are automatically protected based on metadata!
app.listen(3000)
```

**How it works:**

1. `autoRouter` scans `controllers/` and extracts permission metadata
2. Stores route info in `app.$routes` with `requiresAuth` flag
3. `jwtAuth` reads from `app.$routes` and validates requests
4. **No duplicate route configuration needed!**

## Type Safety

```typescript
import { createHandler, RouteHandler } from '@chaeco/hoa-auto-router'
import type { HoaContext } from 'hoa'

export default createHandler({ requiresAuth: true }, (async (ctx: HoaContext): Promise<void> => {
  ctx.res.body = { success: true }
}) as RouteHandler)
```

## API Reference

### `autoRouter(options)`

**Options**:

- `dir` (string) - Controllers directory path (default: `./controllers`)
- `prefix` (string | string[]) - API route prefix, supports string or array (default: `'/api'`)
- `defaultRequiresAuth` (boolean) - Global default permission requirement (default: `false`)
- `strict` (boolean) - Strict mode (default: `true`)
  - `true`: Only allow pure functions and `createHandler()` exports
  - `false`: Allow plain object exports but show warnings
- `logging` (boolean) - Whether to output route registration logs (default: `true`)
- `onLog` (function) - Custom logging callback `(level: 'info' | 'warn' | 'error', message: string) => void` for integrating with your own logging system

### `createHandler(meta?, handler)`

Wrapper function to attach metadata to route handlers.

**Parameters**:

- `meta` (object, optional)
  - `requiresAuth` (boolean) - Whether route requires authentication
  - `description` (string) - Route description
- `handler` (function) - The async route handler

**Returns**: The wrapped handler function

### Logging Examples

```typescript
// Default console output
app.extend(autoRouter({ dir: './controllers' }))

// Custom logging output
app.extend(autoRouter({
  dir: './controllers',
  onLog: (level, message) => {
    if (level === 'error') {
      console.error(`[AutoRouter] ${message}`)
    } else if (level === 'info') {
      logger.info(`[AutoRouter] ${message}`)
    }
  }
}))

// Disable all logs but still capture errors
app.extend(autoRouter({
  dir: './controllers',
  logging: false,
  // Still receive error messages via onLog
  onLog: (level, message) => {
    if (level === 'error') {
      logger.error(message)
    }
  }
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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

ISC
