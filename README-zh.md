# @chaeco/hoa-auto-router

Hoa.js 框架的文件式自动路由插件。为简单起见，路由**仅限函数**。

## 特性

- 🚀 基于文件结构的零配置自动路由
- 📁 支持嵌套目录结构和自动路径构建
- 🔒 内置权限元数据（`requiresAuth`）支持
- 🤝 与 `@chaeco/hoa-jwt-permission` 完美集成
- 🔍 内置文件名和参数验证
- 📝 完全支持 TypeScript 类型安全
- ⚡ 支持 `[param]` 语法动态参数
- 🛡️ 重复路由检测
- 🎯 支持异步处理器
- 🌍 全局 `defaultRequiresAuth` 配置

## 安装

```bash
npm install @chaeco/hoa-auto-router
# 或
yarn add @chaeco/hoa-auto-router
```

## 快速开始

### 基本设置

```typescript
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

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

- ✅ 允许所有导出方式
- ⚠️ 会显示警告提示

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
import { createHandler } from '@chaeco/hoa-auto-router'

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

## Prefix 数组支持

`prefix` 参数支持字符串数组，让同一个控制器目录同时注册到多个前缀：

```typescript
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

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

`hoa-auto-router` 支持两种方式配置多个路由目录：

### 方式 1：合并式配置（推荐）

使用数组一次性配置多个路由目录：

```typescript
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

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
import { Hoa } from 'hoa'
import { autoRouter } from '@chaeco/hoa-auto-router'

const app = new Hoa()

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

## 与 @chaeco/hoa-jwt-permission 集成

路由会自动收集用于权限检查：

```typescript
import { Hoa } from 'hoa'
import { jwt } from '@hoajs/jwt'
import { autoRouter } from '@chaeco/hoa-auto-router'
import { jwtAuth } from '@chaeco/hoa-jwt-permission'
import config from './config'

const app = new Hoa()

// 第 1 层：Token 验证
app.use(jwt({ secret: config.jwtSecret, algorithms: ['HS256'] }))

// 第 2 层：权限检查（从 autoRouter 自动发现）
app.use(jwtAuth({ autoDiscovery: true }))

// 第 3 层：路由发现和注册
app.extend(
  autoRouter({
    defaultRequiresAuth: false,
  })
)

// 现在所有路由都基于元数据自动保护！
app.listen(3000)
```

**工作原理：**

1. `autoRouter` 扫描 `controllers/` 并提取权限元数据
2. 将路由信息存储在 `app.$routes` 中，包含 `requiresAuth` 标志
3. `jwtAuth` 从 `app.$routes` 读取并验证请求
4. **无需重复路由配置！**

## 类型安全

```typescript
import { createHandler, RouteHandler } from '@chaeco/hoa-auto-router'
import type { HoaContext } from 'hoa'

export default createHandler({ requiresAuth: true }, (async (ctx: HoaContext): Promise<void> => {
  ctx.res.body = { success: true }
}) as RouteHandler)
```

## API 参考

### `autoRouter(options)`

**选项：**

- `dir` (string) - 控制器目录路径（默认：`'./controllers'`）
- `prefix` (string | string[]) - API 路由前缀，支持字符串或数组（默认：`'/api'`）
- `defaultRequiresAuth` (boolean) - 全局默认权限要求（默认：`false`）
- `strict` (boolean) - 严格模式（默认：`true`）
  - `true`：只允许纯函数和 `createHandler()` 导出
  - `false`：允许普通对象导出，但会显示警告
- `logging` (boolean) - 是否输出路由注册日志（默认：`true`）
- `onLog` (function) - 自定义日志回调 `(level: 'info' | 'warn' | 'error', message: string) => void`，用于集成自己的日志系统

### `createHandler(meta?, handler)`

包装函数，为路由处理器附加元数据。

**参数：**

- `meta` (object, 可选)
  - `requiresAuth` (boolean) - 路由是否需要认证
  - `description` (string) - 路由描述
- `handler` (function) - 异步路由处理器

**返回：** 包装后的处理器函数

### 日志示例

```typescript
// 默认控制台输出
app.extend(autoRouter({ dir: './controllers' }))

// 自定义日志输出
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

// 禁用所有日志
app.extend(autoRouter({
  dir: './controllers',
  logging: false,
  // 仍然可以通过 onLog 获取错误信息
  onLog: (level, message) => {
    if (level === 'error') {
      logger.error(message)
    }
  }
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
