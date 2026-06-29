# @chaeco/auto-router

[![npm version](https://badge.fury.io/js/%40chaeco%2Fauto-router.svg)](https://badge.fury.io/js/%40chaeco%2Fauto-router)
[![codecov](https://codecov.io/gh/chaeco/auto-router/branch/main/graph/badge.svg)](https://codecov.io/gh/chaeco/auto-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

基于文件系统的自动路由插件，适用于 Node.js 框架（Hoa、Koa、Fastify、Express 等）。文件即路由——无需手动注册。

## 特性

- 🚀 基于文件结构的零配置自动路由
- 📁 支持嵌套目录结构和自动路径构建
- ⚡ `[param]` 动态参数语法 — 单参数和多参数路由
- 🔒 内置权限元数据（`requiresAuth`），支持精细的 `forcePublic` / `forceProtected` 覆盖
- 🔍 内置文件名、参数和重复路由校验
- 📝 完全 TypeScript 类型安全 — `RouteHandler<TCtx, TRes>` 泛型，无框架耦合
- 🛡️ 跨实例重复路由检测（通过共享 `app.$registeredRoutes`）
- 🎛️ Prefix 数组支持 — 同一控制器目录注册到多个前缀
- 🧩 合并式多配置支持 — 一次调用配置多个目录
- 📢 通过 `onLog` 回调自定义日志输出
- 🌐 `staticAutoRouter` 支持无文件系统的运行时（边缘函数、打包应用）

---

## 安装

```bash
npm install @chaeco/auto-router
```

### AI 工具 Skills

本包内含 Claude Code 和 OpenAI Codex 的 AI agent skill。安装后执行一次：

```bash
npx auto-router-init-skills
```

这会将 skill 文件复制到项目的 `.claude/skills/auto-router/` 和 `.codex/skills/auto-router/`。此后 AI 工具在创建路由时会自动遵守文件命名、导出方式、权限规则和最佳实践。

---

## 目录

- [快速开始](#快速开始)
- [文件命名规则](#文件命名规则)
  - [基本格式](#基本格式)
  - [单参数](#单参数)
  - [多参数](#多参数)
  - [动态目录名](#动态目录名)
  - [扁平文件 vs 目录嵌套的选择](#扁平文件-vs-目录嵌套的选择)
  - [路由转换规则（参考）](#路由转换规则参考)
- [导出方式](#导出方式)
  - [方式 1：纯函数](#方式-1纯函数)
  - [方式 2：createHandler 包装](#方式-2createhandler-包装)
  - [严格模式](#严格模式)
- [权限与认证](#权限与认证)
  - [配置模式](#配置模式)
  - [forcePublic / forceProtected](#forcepublic--forceprotected)
  - [规则格式](#规则格式)
  - [优先级链](#优先级链)
  - [冲突解决](#冲突解决)
  - [未命中规则的警告](#未命中规则的警告)
- [配置](#配置)
  - [单配置](#单配置)
  - [Prefix 数组](#prefix-数组)
  - [合并式配置（数组）](#合并式配置数组)
  - [多次调用](#多次调用)
  - [无前缀](#无前缀)
- [路由注册表](#路由注册表)
- [API 文档生成](#api-文档生成)
  - [OpenAPI / Swagger](#openapi--swagger)
  - [Postman Collection](#postman-collection)
  - [Tags / 分组](#tags--分组)
- [参数校验](#参数校验)
- [类型安全](#类型安全)
- [日志](#日志)
- [验证规则](#验证规则)
- [最佳实践](#最佳实践)
- [无文件系统访问的运行时](#无文件系统访问的运行时)
- [API 参考](#api-参考)
  - [autoRouter(options)](#autorouteroptions)
  - [staticAutoRouter(options)](#staticautorouteroptions)
  - [createHandler(handler, meta?)](#createhandlerhandler-meta)
  - [isRouteConfig(obj)](#isrouteconfigobj)
  - [导出类型](#导出类型)
- [许可证](#许可证)

---

## 快速开始

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

给定以下文件结构：

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

无需手动调用 `app.get(...)`。每个 `.ts` 文件即为一个路由。

---

## 文件命名规则

每个路由文件名编码了 **HTTP 方法**和 **URL 结构**。auto-router 解析文件名并将其转换为框架路由注册。

### 基本格式

| 文件名 | 注册为 |
|--------|--------|
| `get.ts` | `GET /api`（在根目录时，路由为目录路径） |
| `post.ts` | `POST /api` |
| `admin/get.ts` | `GET /api/admin` |
| `users/post.ts` | `POST /api/users` |
| `get-users.ts` | `GET /api/users` |
| `post-login.ts` | `POST /api/login` |

**规则：** 文件名为 `{method}.ts` 时，以**目录路径**作为路由。文件名为 `{method}-{name}.ts` 时，将 `name` 追加到目录路径后。

### 单参数

用方括号 `[]` 包裹参数名，会被转换为 Express 风格的 `:param` 路径段。

| 文件名 | 注册为 |
|--------|--------|
| `get-[id].ts` | `GET /api/:id` |
| `delete-[id].ts` | `DELETE /api/:id` |
| `get-[userId].ts` | `GET /api/:userId` |
| `post-[type].ts` | `POST /api/:type` |

### 多参数

文件名中的多个 `[param]` 段用 `-` 分隔。每个 `-` 在两个段之间转换为 URL 中的 `/`。

| 文件名 | 注册为 | 模式 |
|--------|--------|------|
| `get-[userId]-posts.ts` | `GET /api/:userId/posts` | 参数 + 静态 |
| `get-users-[id].ts` | `GET /api/users/:id` | 静态 + 参数 |
| `get-[userId]-[postId].ts` | `GET /api/:userId/:postId` | 参数 + 参数 |
| `put-[userId]-profile.ts` | `PUT /api/:userId/profile` | 参数 + 静态 |
| `get-[org]-settings-[key].ts` | `GET /api/:org/settings/:key` | 参数 + 静态 + 参数 |
| `get-[a]-[b]-[c].ts` | `GET /api/:a/:b/:c` | 三个连续参数 |

### 动态目录名

目录名也可以包含 `[param]` 方括号。这是表达超过两层嵌套资源层级的推荐方式。

| 文件路径 | 注册为 |
|----------|--------|
| `users/[userId]/get.ts` | `GET /api/users/:userId` |
| `users/[userId]/posts/get.ts` | `GET /api/users/:userId/posts` |
| `users/[userId]/posts/[postId]/get.ts` | `GET /api/users/:userId/posts/:postId` |
| `users/[userId]/posts/get-[id].ts` | `GET /api/users/:userId/posts/:id` |

动态目录和文件级参数可以自然组合——递归扫描时先处理目录参数，再处理文件名参数。

### 扁平文件 vs 目录嵌套的选择

`GET /api/users/:userId/posts/:postId/comments/:commentId` 可以用两种方式表达：

| 方式 | 文件路径 | 评价 |
|------|----------|------|
| 扁平文件 | `get-users-[userId]-posts-[postId]-comments-[commentId].ts` | ❌ 60+ 字符，不可读 |
| 目录嵌套 | `users/[userId]/posts/[postId]/comments/get-[commentId].ts` | ✅ 每段短小清晰 |

**经验法则：**

- **≤ 3 个路径段**（方法 + 2 个连字符）：扁平文件即可 —— `get-[userId]-posts.ts`
- **> 3 个路径段**：使用目录嵌套 —— `users/[userId]/posts/get-[id].ts`
- **资源层级**天然映射到目录树 —— `users/`、`posts/`、`comments/` 是目录树，不是文件名前缀

### 路由转换规则（参考）

文件名中的 `routeName`（`method-` 之后的部分）经过三步正则转换：

```
1. [param]       → :param        （方括号 → 冒号前缀）
2. -:/           → /:            （连字符后跟冒号 → 斜杠后跟冒号）
3. :param-/      → :param/       （冒号段后跟连字符 → 冒号段后跟斜杠）
```

**重要：** `-` 字符始终被解析为路径分隔符。无法通过文件命名在路由路径中表达字面量 `-`。如果路由必须包含字面量 `-`（如 `/api/user-settings`），请使用目录结构或手动配置路由。

---

## 导出方式

### 方式 1：纯函数

最简单的形式。路由继承全局 `defaultRequiresAuth` 设置。

```typescript
// controllers/get-users.ts
export default async (ctx) => {
  ctx.res.body = { users: [] }
}
```

### 方式 2：createHandler 包装

需要为单个路由设置元数据时使用（权限、描述、自定义字段）。

```typescript
import { createHandler } from '@chaeco/auto-router'

// 受保护的路由
export default createHandler(
  async (ctx) => {
    ctx.res.body = { success: true, data: { userId: ctx.currentUser?.id } }
  },
  { requiresAuth: true, description: '获取当前用户信息' }
)

// 公开路由（覆盖全局 defaultRequiresAuth: true）
export default createHandler(
  async (ctx) => {
    ctx.res.body = { success: true }
  },
  { requiresAuth: false }
)
```

`meta` 对象接受 `requiresAuth`、`description` 及任意 `[key: string]: any` 自定义字段。

### 严格模式

| 设置 | 纯函数 | `createHandler()` | 普通 `{ handler, meta }` |
|------|:---:|:---:|:---:|
| `strict: true`（默认） | ✅ | ✅ | ❌ 拒绝 |
| `strict: false` | ✅ | ✅ | ⚠️ 接受但警告 |

**严格模式默认开启。** 它强制代码库中导出风格的一致性。仅在渐进式迁移或向下兼容时使用非严格模式。

```typescript
// 严格模式（默认）—— 拒绝普通对象
autoRouter({ dir: './controllers', strict: true })

// 非严格模式 —— 接受普通对象但显示警告
autoRouter({ dir: './controllers', strict: false })
```

---

## 权限与认证

### 配置模式

**黑名单模式**（默认公开）：只标记需要保护的路由。

```typescript
autoRouter({ dir: './controllers', defaultRequiresAuth: false })
```

```typescript
// 只有这个路由需要显式标记
export default createHandler(async (ctx) => { ... }, { requiresAuth: true })
```

**白名单模式**（默认保护）：只标记需要公开的路由。

```typescript
autoRouter({ dir: './controllers', defaultRequiresAuth: true })
```

```typescript
// 只有这个路由需要显式标记为公开
export default createHandler(async (ctx) => { ... }, { requiresAuth: false })
```

### forcePublic / forceProtected

批量权限覆盖，一次性对大量路由生效，**不依赖 `defaultRequiresAuth` 的值**。

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: true,         // 全局默认受保护
  forcePublic: [
    '/api/auth/login',               // 登录始终公开
    '/api/auth/register',            // 注册始终公开
    '/api/public/*',                 // /api/public/ 下的所有路由公开
  ],
  forceProtected: [
    '/api/admin/*',                  // /api/admin/ 下的所有路由受保护
    'POST /api/users',               // 只有 POST /api/users 受保护；GET 仍公开
  ],
})
```

### 规则格式

| 格式 | 示例 | 匹配范围 |
|------|------|----------|
| 精确路径（带 prefix） | `'/api/users'` | `/api/users` 上的所有方法 |
| 精确路径（不带 prefix） | `'/users'` | 当 prefix 为 `/api` 时同上 |
| 通配符 | `'/api/admin/*'` | `/api/admin/foo`、`/api/admin/foo/bar` 等所有方法 — **不匹配** `/api/admin` 本身 |
| 方法 + 精确路径 | `'POST /api/users'` | 仅 POST `/api/users`；GET 不受影响 |
| 方法 + 通配符 | `'DELETE /api/admin/*'` | 仅 `/api/admin/` 下的 DELETE |

**通配符注意：** `/*` 有意只匹配子路径，不匹配基路径。如需同时覆盖基路径，额外添加精确匹配：

```typescript
forceProtected: [
  '/api/admin',       // 覆盖 /api/admin 本身
  '/api/admin/*',     // 覆盖 /api/admin/users、/api/admin/settings 等
]
```

### 优先级链

```
createHandler 显式 meta  >  forceProtected / forcePublic  >  defaultRequiresAuth
```

1. **显式 meta 最优先。** 如果路由使用 `createHandler(fn, { requiresAuth: true })`，任何 `forcePublic` 规则都无法覆盖它。
2. **force 规则覆盖全局默认。** `forceProtected` 规则可在 `defaultRequiresAuth: false` 时将路由提升为受保护。
3. **默认值作为兜底。** 无显式 meta 且无 force 规则命中时，使用 `defaultRequiresAuth`。

### 冲突解决

同一路由同时匹配 `forcePublic` 和 `forceProtected` 时：

- `forceProtected` 优先（更安全）
- 输出警告日志标识冲突

当 `forcePublic` 或 `forceProtected` 规则命中了一个有**显式 `createHandler` meta** 的路由时：

- 显式 meta 优先
- 输出警告：该 force 规则"无效（has no effect）"

### 未命中规则的警告

所有路由加载完成后，auto-router 检查每条 `forcePublic` / `forceProtected` 规则是否至少命中了一个已注册路由。未命中的规则会输出警告——用于检测拼写错误和过期配置：

```
⚠️  forcePublic 规则 "/api/nonexistent-route" 未命中任何已注册路由
   （请检查是否有拼写错误或配置已过期）
```

---

## 配置

### 单配置

```typescript
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: '/api',
    defaultRequiresAuth: false,
  })
)
```

### Prefix 数组

将同一控制器目录注册到多个前缀——适用于 API 版本管理或语言前缀。

```typescript
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: ['/api', '/v1', '/v2'],
  })
)

// 每个路由文件被注册 3 次：
// get-users.ts → GET /api/users、GET /v1/users、GET /v2/users
```

### 合并式配置（数组）

向 `autoRouter()` 传入配置数组，在单次调用中配置多个目录。每项可有独立的 `dir`、`prefix`、`defaultRequiresAuth`、`forcePublic`、`forceProtected`、`strict`、`logging` 和 `onLog`。

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

### 多次调用

也可以多次调用 `autoRouter`。路由累积在 `app.$routes` 中，重复检测通过 `app.$registeredRoutes` 跨所有调用生效。

```typescript
app.extend(autoRouter({ dir: './controllers/admin', prefix: '/api/admin' }))
app.extend(autoRouter({ dir: './controllers/client', prefix: '/api/client' }))
```

### 无前缀

传入 `''`（空字符串）以注册不带前缀的路由：

```typescript
autoRouter({ dir: './controllers', prefix: '' })
// get-users.ts → GET /users
// get-[id].ts  → GET /:id
```

---

## 路由注册表

加载完成后，`app.$routes` 包含所有已注册路由的元数据：

```typescript
app.$routes.all             // RouteInfo[]         — 所有已注册路由
app.$routes.publicRoutes    // { method, path }[]  — 公开路由
app.$routes.protectedRoutes // { method, path }[]  — 受保护路由
```

`RouteInfo` 包含 `method`、`path`、`requiresAuth` 和 `meta`（若通过 `createHandler` 传入则为其 `RouteMeta`）。

用于与认证中间件集成：

```typescript
app.use(async (ctx, next) => {
  const isProtected = app.$routes.protectedRoutes.some(
    r => r.method === ctx.method && r.path === ctx.path
  )
  if (isProtected) {
    // 验证 JWT token、session 等
  }
  await next()
})
```

---

## API 文档生成

`app.$routes.all` 提供完整的路由清单，可用于生成 OpenAPI 规范、Postman 集合或其他 API 文档格式。遍历注册表并将每个 `RouteInfo` 映射到目标格式即可。

### OpenAPI / Swagger

```typescript
import { autoRouter } from '@chaeco/auto-router'

app.extend(autoRouter({ dir: './controllers', prefix: '/api' }))

// app.listen() 后或 await app.ready()
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

### Tags / 分组

通过 `createHandler` 的 meta 添加 tags，便于文档分组：

```typescript
export default createHandler(
  async (ctx) => { ctx.body = { users: [] } },
  { description: 'List all users', tags: ['Users', 'CRUD'] }
)
```

---

## 类型安全

`RouteHandler<TCtx, TRes>` 是条件泛型，适配不同框架：

### 单 context 框架（Hoa、Koa、Fastify）

```typescript
import { createHandler } from '@chaeco/auto-router'
import type { RouteHandler } from '@chaeco/auto-router'

type MyContext = { body: any; params: Record<string, string> }

export default createHandler<MyContext>(
  async (ctx) => {
    ctx.body = { success: true }   // ctx 类型为 MyContext
  },
  { requiresAuth: true }
)
```

### 双参数框架（Express）

```typescript
import type { Request, Response } from 'express'

export default createHandler<Request, Response>(
  async (req, res) => {
    res.json({ success: true })    // req: Request, res: Response
  },
  { requiresAuth: true }
)
```

`RouteMeta` 支持自定义扩展：

```typescript
export default createHandler(
  async (ctx) => { ... },
  {
    requiresAuth: true,
    description: '获取用户信息',
    rateLimit: 100,            // 自定义字段
    roles: ['admin', 'user'],  // 自定义字段
  }
)
```

---

## 参数校验

auto-router **不提供参数校验** — 所有路由参数都是字符串，需在 handler 内自行校验。

#### 路径参数校验

```typescript
// controllers/users/[userId]/posts/get-[id].ts
export default createHandler(async (ctx: any) => {
  const { userId, id } = ctx.params

  // 1. 检查参数存在
  if (!userId || !id) {
    ctx.res.status = 400
    ctx.res.body = { error: 'Missing required parameters' }
    return
  }

  // 2. 类型转换与校验
  const userIdNum = Number(userId)
  const postIdNum = Number(id)

  if (isNaN(userIdNum) || isNaN(postIdNum) || userIdNum <= 0 || postIdNum <= 0) {
    ctx.res.status = 400
    ctx.res.body = { error: 'Invalid parameter format', details: 'must be positive integers' }
    return
  }

  // proceed with userIdNum and postIdNum
})
```

#### 请求体校验

```typescript
// POST /api/users/:userId/posts — 创建帖子
export default createHandler(async (ctx: any) => {
  const body = ctx.req?.body ?? {}

  const errors: string[] = []
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    errors.push('title is required and must be a non-empty string')
  }
  if (body.content !== undefined && typeof body.content !== 'string') {
    errors.push('content must be a string if provided')
  }

  if (errors.length > 0) {
    ctx.res.status = 400
    ctx.res.body = { error: 'Validation failed', details: errors }
    return
  }

  // proceed with body.title
})
```

#### 推荐：zod schema 校验

```typescript
import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional(),
})

export default createHandler(async (ctx: any) => {
  const result = PostSchema.safeParse(ctx.req?.body ?? {})
  if (!result.success) {
    ctx.res.status = 400
    ctx.res.body = { error: 'Validation failed', details: result.error.flatten() }
    return
  }

  const { title, content } = result.data
  // proceed...
})
```

#### 路由参数 zod 校验

```typescript
import { z } from 'zod'

const ParamsSchema = z.object({
  userId: z.string().regex(/^\d+$/, 'userId must be numeric'),
  id: z.string().regex(/^\d+$/, 'id must be numeric'),
})

export default createHandler(async (ctx: any) => {
  const paramsResult = ParamsSchema.safeParse(ctx.params)
  if (!paramsResult.success) {
    ctx.res.status = 400
    ctx.res.body = { error: 'Invalid URL parameters', details: paramsResult.error.flatten() }
    return
  }

  const { userId, id } = paramsResult.data
  // userId and id are now strings matching /^\d+$/
})
```

---

## 日志

### 默认：所有级别输出到控制台

```typescript
autoRouter({ dir: './controllers' })
// info → console.log、warn → console.warn、error → console.error
```

### 自定义日志接收器

设置 `onLog` 后，控制台输出被完全替代——回调函数处理所有日志级别。

```typescript
autoRouter({
  dir: './controllers',
  onLog: (level, message) => {
    myLogger[level](message)
  },
})
```

### 静默模式

```typescript
autoRouter({ dir: './controllers', logging: false })
// 无控制台输出（info、warn 和 error 全部抑制）
```

### 静默但捕获错误

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

## 验证规则

auto-router 在扫描时校验每个文件，**跳过**无效文件（记录错误）而不中止。目录中的其余文件继续被扫描。

| 规则 | 有效示例 | 无效示例 |
|------|----------|----------|
| 文件名以 HTTP 方法开头 | `get-users.ts` | `users-get.ts` |
| 参数使用方括号语法 | `[userId]` | `:userId` |
| 不允许空括号 | `[id]` | `[]` |
| 只允许默认导出 | `export default async ...` | `export const foo = 1` + default |
| 导出必须是函数或 `createHandler()` 结果 | `async (ctx) => {}` | `export default 42` |
| 目录名不能是 HTTP 方法 | `controllers/users/` | `controllers/get/` ⚠️ |
| 跨实例无重复路由 | — | 两个文件映射到 `GET /api/users` |
| `.d.ts` 文件被忽略 | — | `types.d.ts` 静默跳过 |

---

## 最佳实践

### 推荐做法 ✅

- **使用目录嵌套**表达资源层级 — `users/[userId]/posts/get.ts` 优于 `get-users-[userId]-posts.ts`
- **使用 `[dirName]` 动态目录**处理父资源参数 — 保持文件名短小
- 路由权限与全局默认不同时，**使用 `createHandler()`** 显式标注
- 管理后台/敏感区域**使用 `forceProtected`** — 一条规则覆盖全部路由
- 认证/登录/文档区域**使用 `forcePublic`** — 显式声明、可审计
- 公开 API 选择**黑名单模式**（`defaultRequiresAuth: false`）
- 内部/管理 API 选择**白名单模式**（`defaultRequiresAuth: true`）
- **保持 handler 精简** — 委托给 service 层
- 使用 **`strict: true`**（默认值）— 强制一致的导出风格

### 不推荐做法 ❌

- **不要**将深层资源树压扁为长文件名 — 3 个以上连字符 → 改用目录
- **不要**在路由文件中放复杂业务逻辑 — 它们是入口，不是业务层
- **不要**在同一目录混用导出风格 — 选择一种并用 `strict: true` 强制执行
- **不要**重构控制器目录后忘记更新 `forcePublic`/`forceProtected` 规则
- **不要**在配置的 `dir` 之外创建控制器文件 — 它们不会被扫描

---

## 无文件系统访问的运行时

标准 `autoRouter` 依赖 `fs` + 动态 `import()`，这在边缘运行时（Cloudflare Workers、Deno Deploy 等）和打包后的 Node.js 应用中不可用。在这些场景使用 `staticAutoRouter`——手动静态导入 handler，以数据形式声明路由。

```typescript
import { staticAutoRouter } from '@chaeco/auto-router'

// 静态导入 — 适用于任意打包工具（esbuild、webpack、rolldown 等）
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

### Cloudflare Workers + Hono

`staticAutoRouter` 是桥梁：它负责路由注册和权限元数据。路由分发、中间件、请求处理交给框架——[Hono](https://hono.dev) 是 Workers 的标准选择。

```typescript
import { Hono } from 'hono'
import { staticAutoRouter } from '@chaeco/auto-router'
import getUsers from './controllers/get-users'
import getUserById from './controllers/get-[id]'

const app = new Hono()

// staticAutoRouter 像其他框架一样在 Hono app 上注册路由
app.extend(
  staticAutoRouter({
    routes: [
      { method: 'get', path: '/api/users', handler: getUsers },
      { method: 'get', path: '/api/:id',   handler: getUserById },
    ],
  })
)

export default app
```

`staticAutoRouter` 支持与 `autoRouter` 相同的权限选项：`defaultRequiresAuth`、`forcePublic`、`forceProtected`、`logging` 和 `onLog`。路由校验（重复检测、权限解析、注册表填充）完全一致。

---

## API 参考

### `autoRouter(options)`

工厂函数。返回异步插件函数 `(app) => Promise<void>`，用于 `app.extend()`。

**选项：**

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `dir` | `string` | `'./controllers'` | 控制器目录路径 |
| `prefix` | `string \| string[]` | `'/api'` | 路由前缀；传 `''` 表示无前缀 |
| `defaultRequiresAuth` | `boolean` | `false` | 全局默认权限 |
| `forcePublic` | `string[]` | — | 始终公开的路由规则 |
| `forceProtected` | `string[]` | — | 始终受保护的路由规则 |
| `strict` | `boolean` | `true` | 严格导出校验 |
| `logging` | `boolean` | `true` | 控制台日志输出 |
| `onLog` | `(level, message) => void` | — | 自定义日志接收器 |

`options` 也可以是上述配置的**数组**，用于合并式多配置。

### `staticAutoRouter(options)`

适用于无文件系统访问权限的运行时。接收静态导入的路由，而非扫描目录。

**选项：**

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `routes` | `StaticRoute[]` | **必填** | `{ method, path, handler }` 数组 |
| `defaultRequiresAuth` | `boolean` | `false` | 全局默认权限 |
| `forcePublic` | `string[]` | — | 始终公开的路由规则 |
| `forceProtected` | `string[]` | — | 始终受保护的路由规则 |
| `logging` | `boolean` | `true` | 控制台日志输出 |
| `onLog` | `(level, message) => void` | — | 自定义日志接收器 |

**`StaticRoute`：**

```typescript
interface StaticRoute {
  method: string    // 'get'、'post'、'put'、'delete'、'patch'
  path: string      // '/api/users'、'/api/:id'
  handler: any      // async function 或 createHandler() 结果
}
```

### `createHandler(handler, meta?)`

```typescript
createHandler<TCtx = any, TRes = void>(
  handler: RouteHandler<TCtx, TRes>,
  meta?: RouteMeta
): RouteConfig<TCtx, TRes>
```

为 handler 函数附加元数据。空对象 `{}` 的 meta 会被归一化为 `undefined`。

**`RouteMeta` 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `requiresAuth` | `boolean` | 是否需要认证 |
| `description` | `string` | 路由描述 |
| `[key: string]` | `any` | 任意自定义元数据 |

### `isRouteConfig(obj)`

```typescript
isRouteConfig(obj: any): obj is RouteConfig
```

若 `obj` 由 `createHandler()` 创建则返回 `true`。用于类型窄化。

### 导出类型

```typescript
export type { RouteHandler, RouteMeta, RouteConfig, RouteInfo, AppRoutesRegistry } from '@chaeco/auto-router'
export type { StaticRoute, StaticAutoRouterOptions } from '@chaeco/auto-router'
```

---

## 许可证

MIT — 详见 [LICENSE](LICENSE)。
