# @chaeco/auto-router

Node.js 框架的文件式自动路由插件（支持 Hoa、Koa、Fastify、Express 等任意框架）。

## 特性

- 🚀 基于文件结构的零配置自动路由
- 📁 支持嵌套目录结构和自动路径构建
- 🔒 内置权限元数据（`requiresAuth`）支持
- 🔍 内置文件名和参数验证
- 📝 完全 TypeScript 类型安全 — `RouteHandler<TCtx, TRes>` 泛型，无框架耦合
- ⚡ 支持 `[param]` 语法动态参数
- 🛡️ 跨所有 `autoRouter` 实例的重复路由检测
- 🎯 支持异步处理器
- 🌍 全局 `defaultRequiresAuth` 配置
- 🎛️ `forcePublic` / `forceProtected` 批量权限覆盖，支持方法前缀规则语法
- 📢 通过 `onLog` 回调自定义日志输出
- ⛅ Cloudflare Workers 支持，通过静态清单（`createWorkerRouter` + 构建 CLI）实现

## 安装

```bash
npm install github:chaeco/auto-router#cf
# 或
yarn add github:chaeco/auto-router#cf
```

## 快速开始

### 基本设置

```typescript
import { autoRouter } from '@chaeco/auto-router'

// 适用于 Hoa、Koa、Fastify 等任何暴露 app[method](path, handler) 的框架
const app = new YourFramework()

// 推荐：严格模式（默认开启，只允许函数导出）
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: '/api',
    defaultRequiresAuth: false, // 黑名单模式
    strict: true, // 严格模式（默认值）
  })
)

app.listen(3000)
```

### 严格模式

**严格模式（strict: true）- 推荐**：

- ✅ 只允许纯函数导出
- ✅ 只允许 `createHandler()` 包装导出
- ❌ 不允许普通对象导出 `{ handler, meta }`
- 🎯 强制团队代码风格一致

**非严格模式（strict: false）**：

- ✅ 允许所有导出方式（普通对象也可接受，但会显示警告）
- ⚠️ 对不推荐的导出风格打印警告
- 💡 适用于向下兼容或渐进式迁移

## 文件命名规则

### 基本格式

文件命名支持两种格式：

1. **仅 HTTP 方法名**：`get.ts`、`post.ts` 等 → 路由为当前目录路径
2. **方法 + 路由名**：`get-users.ts`、`post-login.ts` 等

### 单参数示例

- `get.ts` → `GET /api`（位于根目录）
- `admin/get.ts` → `GET /api/admin`
- `post-login.ts` → `POST /api/login`
- `get-users.ts` → `GET /api/users`
- `get-[id].ts` → `GET /api/:id`
- `delete-[id].ts` → `DELETE /api/:id`

### 多参数示例

- `get-[userId]-[postId].ts` → `GET /api/:userId/:postId`
- `put-[userId]-profile.ts` → `PUT /api/:userId/profile`
- `get-[id]-resources.ts` → `GET /api/:id/resources`

### 嵌套目录示例

- `users/get.ts` → `GET /api/users`
- `users/post.ts` → `POST /api/users`
- `users/posts/get-[id].ts` → `GET /api/users/posts/:id`

## 权限元数据

### 支持的两种导出方法

#### 方法 1：纯函数（推荐大多数路由）

```typescript
// controllers/get-users.ts
export default async ctx => {
  ctx.res.body = { users: [] }
}
// 使用全局 defaultRequiresAuth 配置
```

#### 方法 2：createHandler 包装（需要权限元数据时）

```typescript
import { createHandler } from '@chaeco/auto-router'

// controllers/users/get-info.ts - 受保护的接口
export default createHandler(
  async ctx => {
    ctx.res.body = { success: true, data: { userId: ctx.currentUser?.id } }
  },
  { requiresAuth: true, description: '获取用户信息' }
)

// controllers/auth/post-login.ts - 公开接口
export default createHandler(
  async ctx => {
    ctx.res.body = { success: true }
  },
  { requiresAuth: false }
)
```

### 配置模式

**黑名单模式（推荐用于公开 API）**：

```typescript
autoRouter({
  defaultRequiresAuth: false,  // 默认公开
})
// 只需要在需要保护的路由上标记
export default createHandler(async (ctx) => { ... }, { requiresAuth: true })
```

**白名单模式（推荐用于内部 API）**：

```typescript
autoRouter({
  defaultRequiresAuth: true,  // 默认受保护
})
// 只需要在需要公开的路由上标记
export default createHandler(async (ctx) => { ... }, { requiresAuth: false })
```

## 强制覆盖路由权限

`forcePublic` 和 `forceProtected` 选项允许您显式指定哪些路由始终公开、哪些始终受保护，不依赖 `defaultRequiresAuth` 的当前值。

> **优先级：** `createHandler` 显式 meta → `forceProtected` / `forcePublic` → `defaultRequiresAuth`  
> 当同一路由同时匹配 `forcePublic` 和 `forceProtected` 时，`forceProtected` 优先（更安全）。

### 强制公开（`forcePublic`）

登录、注册、公开文档等路由始终公开，不受全局 `defaultRequiresAuth: true` 影响：

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: true,   // 全局默认受保护
  forcePublic: [
    '/api/auth/login',    // 带 prefix：精确匹配（所有方法）
    '/auth/register',     // 不带 prefix：运行效果相同，匹配 /api/auth/register
    '/api/public/*',      // 通配符：只匹配子路径（/api/public/docs ✅，/api/public 本身 ❌）
  ],
})
// POST /api/auth/login    → requiresAuth: false（强制公开）
// POST /api/auth/register → requiresAuth: false（强制公开）
// GET  /api/public/docs   → requiresAuth: false（强制公开）
// GET  /api/public        → requiresAuth: true （/* 不匹配基路径本身）
// GET  /api/users         → requiresAuth: true （默认）
```

### 强制保护（`forceProtected`）

管理后台、敏感接口等路由始终受保护，不受全局 `defaultRequiresAuth: false` 影响：

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: false,  // 全局默认公开
  forceProtected: [
    '/api/admin/*',   // 通配符：/api/admin/users ✅，/api/admin 本身 ❌
    '/api/user/me',  // 精确匹配（所有方法）
  ],
})
// GET  /api/admin/users → requiresAuth: true （强制保护）
// GET  /api/user/me    → requiresAuth: true （强制保护）
// GET  /api/products   → requiresAuth: false（默认）
```

### 组合使用

`forcePublic` 和 `forceProtected` 可以同时使用，各自独立强制相应路由的权限状态：

```typescript
autoRouter({
  dir: './controllers',
  prefix: '/api',
  defaultRequiresAuth: false,
  forcePublic: ['/api/auth/*'],    // 认证相关接口公开
  forceProtected: ['/api/admin/*'], // 管理接口受保护
})
```

## Prefix 数组支持

`prefix` 参数支持字符串数组，让同一个控制器目录同时注册到多个前缀：

```typescript
import { autoRouter } from '@chaeco/auto-router'

// 适用于任何暴露 app[method](path, handler) 的框架
const app = new YourFramework()

// 同一个目录注册到多个前缀
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: ['/api', '/v1', '/v2'],  // 支持数组
  })
)

// 这样 get-users.ts 会同时注册为：
// GET /api/users
// GET /v1/users
// GET /v2/users

app.listen(3000)
```

**使用场景：**

```typescript
// 场景 1：API 版本兼容
app.extend(
  autoRouter({
    dir: './controllers/v2',
    prefix: ['/api', '/v2'],  // 同时支持新旧两个前缀
  })
)

// 场景 2：多语言支持
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: ['/api', '/zh', '/en'],
  })
)
```

## 多层级设置

`auto-router` 支持两种方式配置多个路由目录：

### 方式 1：合并式配置（推荐）

使用数组一次性配置多个路由目录：

```typescript
import { autoRouter } from '@chaeco/auto-router'

const app = new YourFramework()

// 合并式配置 - 一次配置多个目录
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

// 即使只有一个配置，也可以使用数组形式（保持一致性）
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

### 方式 2：多次调用

分别调用多个 `autoRouter` 实例：

```typescript
import { autoRouter } from '@chaeco/auto-router'

const app = new YourFramework()

// 管理端路由
app.extend(
  autoRouter({
    dir: './src/controllers/admin',
    defaultRequiresAuth: false,
    prefix: '/api/admin',
  })
)

// 客户端路由
app.extend(
  autoRouter({
    dir: './src/controllers/client',
    defaultRequiresAuth: true,
    prefix: '/api/client',
  })
)

app.listen(3000)
```

**特性：**

- ✅ 每个 `autoRouter` 实例可以有独立的配置
- ✅ 路由元数据会自动累积，不会相互覆盖
- ✅ 跨实例的重复路由会被检测并拒绝
- ✅ 所有路由信息都存储在 `app.$routes` 中

**示例场景：**

```typescript
// 场景 1: 多个业务模块（合并式）
app.extend(
  autoRouter([
    { dir: './controllers/user', prefix: '/api/user' },
    { dir: './controllers/order', prefix: '/api/order' },
    { dir: './controllers/product', prefix: '/api/product' },
  ])
)

// 场景 2: 不同权限级别（合并式）
app.extend(
  autoRouter([
    { dir: './controllers/public', defaultRequiresAuth: false, prefix: '/api/public' },
    { dir: './controllers/protected', defaultRequiresAuth: true, prefix: '/api/protected' },
  ])
)

// 场景 3: API 版本管理（合并式）
app.extend(
  autoRouter([
    { dir: './controllers/v1', prefix: '/api/v1' },
    { dir: './controllers/v2', prefix: '/api/v2' },
  ])
)
```

## 路由注册表

加载完成后，所有路由元数据可从 `app.$routes` 访问：

```typescript
app.$routes.all             // RouteInfo[] — 所有已注册路由
app.$routes.publicRoutes    // { method, path }[] — 公开路由
app.$routes.protectedRoutes // { method, path }[] — 受保护路由
```

可用于与 JWT 中间件或任意权限核查层集成：

```typescript
app.use(async (ctx, next) => {
  const match = app.$routes.protectedRoutes.find(
    r => r.method === ctx.method && r.path === ctx.path
  )
  if (match) {
    // 验证 token ...
  }
  await next()
})
```

## 类型安全

`RouteHandler<TCtx, TRes>` 同时支持单 context 框架和双参数框架：

```typescript
import { createHandler } from '@chaeco/auto-router'
import type { RouteHandler } from '@chaeco/auto-router'

// 单 context 框架（Hoa、Koa、Fastify 等）
type MyContext = { body: any; params: Record<string, string> }

export default createHandler<MyContext>(
  async (ctx) => {
    ctx.body = { success: true }
  },
  { requiresAuth: true }
)

// 双参数框架（Express 等）
import type { Request, Response } from 'express'

export default createHandler<Request, Response>(
  async (req, res) => {
    res.json({ success: true })
  },
  { requiresAuth: true }
)
```

## API 参考

### `autoRouter(options)`

**选项：**

| 选项 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `dir` | `string` | `'./controllers'` | 控制器目录路径 |
| `prefix` | `string \| string[]` | `'/api'` | 路由前缀；传 `''` 表示无前缀，支持数组 |
| `defaultRequiresAuth` | `boolean` | `false` | 全局默认权限（`false` 表示默认公开） |
| `forcePublic` | `string[]` | — | 匹配的路由始终公开 |
| `forceProtected` | `string[]` | — | 匹配的路由始终受保护 |
| `strict` | `boolean` | `true` | `true`：只允许函数和 `createHandler()`；`false`：允许普通对象并显示警告 |
| `logging` | `boolean` | `true` | `true`：所有日志级别输出到控制台；`false`：完全静默（info / warn / error 全部抹除） |
| `onLog` | `(level, message) => void` | — | 自定义日志接收器；设置后完全接管日志，不再输出到控制台 |

**`forcePublic` / `forceProtected` 规则格式：**

- `'/api/users'` — 精确匹配，匹配所有 HTTP 方法
- `'/users'` — prefix 可选；当 `prefix` 为 `/api` 时同样匹配 `/api/users`
- `'/api/admin/*'` — 通配符：匹配 `/api/admin/foo` 及更深子路径，**不匹配** `/api/admin` 本身
- `'POST /api/users'` — 方法前缀：只匹配 POST，GET 不受影响
- `'DELETE /api/admin/*'` — 方法 + 通配符组合

**优先级：** `createHandler` 显式 meta > `forceProtected` / `forcePublic` > `defaultRequiresAuth`  
同一路由同时匹配 `forcePublic` 和 `forceProtected` 时，`forceProtected` 优先。

### `createHandler(handler, meta?)`

包装函数，为路由处理器附加元数据。

```typescript
createHandler(handler: RouteHandler<TCtx, TRes>, meta?: RouteMeta): RouteConfig<TCtx, TRes>
```

**参数：**

- `handler`（函数，必填）— 异步路由处理器
- `meta`（对象，可选）
  - `requiresAuth` (boolean) — 路由是否需要认证
  - `description` (string) — 路由描述
  - `[key: string]: any` — 任意自定义元数据

**注意：**

- 空对象 `{}` 会被内部归一化为 `undefined`
- 返回的对象含有 `$__isRouteConfig: true` 标记，可用 `isRouteConfig(obj)` 检测

### `isRouteConfig(obj)`

若 `obj` 是由 `createHandler()` 创建的则返回 `true`。用于区分普通对象。

### 日志示例

```typescript
// 默认：所有级别输出到控制台
app.extend(autoRouter({ dir: './controllers' }))

// 自定义日志接收器 — 完全替代控制台输出
app.extend(autoRouter({
  dir: './controllers',
  onLog: (level, message) => myLogger[level](message),
}))

// 完全静默（logging: false 抹除 info + warn + error 所有级别）
app.extend(autoRouter({
  dir: './controllers',
  logging: false,
}))

// 静默但仍能通过 onLog 捕获错误
app.extend(autoRouter({
  dir: './controllers',
  logging: false,
  onLog: (level, message) => {
    if (level === 'error') errorLogger.error(message)
  },
}))
```

## 验证规则

- ✅ 文件名必须以有效的 HTTP 方法开头
- ✅ 参数必须使用方括号语法：`[paramName]`
- ✅ 空参数 `[]` 不允许
- ✅ 只允许默认导出（不允许命名导出）
- ✅ 默认导出必须是函数
- ✅ 目录名不应包含 HTTP 方法关键字
- ✅ 检测重复路由
- ✅ 路由会显示权限指示符（🔒 表示受保护路由）

## 最佳实践

✅ **推荐做法**：

- 使用 `createHandler()` 显式标注权限要求
- 根据 API 性质选择合适的 `defaultRequiresAuth` 默认值
- 结合 `@chaeco/hoa-jwt-permission` 的 `autoDiscovery: true` 使用
- 将路由元数据保留在处理函数附近
- 用嵌套目录进行逻辑分组

❌ **不推荐做法**：

- 导出对象或其他非函数类型
- 不必要地混用导出风格
- 在路由文件名中使用复杂逻辑
- 在 `controllers/` 目录之外创建路由
- 修改 API 权限行为后忘记同步更新权限配置

## Cloudflare Workers

Cloudflare Workers 不支持运行时动态 `import()`。`@chaeco/auto-router` 通过两步方案解决：构建阶段 CLI 扫描控制器文件生成静态清单，运行时由 `createWorkerRouter` 轻量分发。

### 第一步：生成清单

```bash
npx tsx node_modules/@chaeco/auto-router/dist/build-worker-manifest.js ./controllers ./dist/worker-routes.ts
```

此命令将扫描到的所有路由文件生成静态 import，写入 `dist/worker-routes.ts`。可加入构建流程：

```json
{
  "scripts": {
    "build:manifest": "npx tsx node_modules/@chaeco/auto-router/dist/build-worker-manifest.js ./controllers ./dist/worker-routes.ts"
  }
}
```

### 第二步：在 Worker 中使用清单

```typescript
import { createWorkerRouter } from '@chaeco/auto-router/worker-manifest'
import { routes } from './worker-routes' // 第一步生成

const router = createWorkerRouter({
  routes,
  notFound: (ctx) => {
    ctx.res.status = 404
    ctx.res.body = { error: 'Not Found' }
  },
  onError: (err) => new Response('Internal Server Error', { status: 500 }),
})

export default router // { fetch: (req, env, ctx) => Response }
```

### `createWorkerRouter(options)`

| 选项 | 类型 | 说明 |
|------|------|------|
| `routes` | `WorkerManifestRoute[]` | 路由清单数组（由构建 CLI 生成） |
| `notFound` | `(ctx) => any` | 自定义 404 处理器（可选） |
| `onError` | `(err, req) => Response` | 全局错误处理器（可选） |

每个路由处理器接收 `WorkerRouteContext`，包含 `{ req, env, ctx, params, res }`。返回 `Response` 会直接使用，其他返回值自动序列化为 JSON。

## 许可证

本项目基于 MIT 许可证授权 — 详见 [LICENSE](LICENSE) 文件。
