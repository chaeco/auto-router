# Hoa Auto Router Example

这是一个展示如何使用 `auto-router` 插件的示例项目。

## 项目结构

```text
example/
├── app.ts                   # 基本应用文件
├── multi-level-example.ts   # 多层级配置示例
├── worker-routes.ts         # Cloudflare Workers 生成的清单文件（示例）
├── controllers/             # 控制器目录
│   ├── get-users.ts         # GET /api/users
│   ├── post-login.ts        # POST /api/login
│   ├── get-[id].ts          # GET /api/:id
│   ├── get-[userId]-[postId].ts  # GET /api/:userId/:postId
│   ├── get-[userId]-posts.ts     # GET /api/:userId/posts
│   ├── put-[id].ts          # PUT /api/:id
│   ├── delete-[id].ts       # DELETE /api/:id
│   ├── admin/
│   │   ├── get-dashboard.ts # GET /api/admin/dashboard
│   │   └── get-users.ts     # GET /api/admin/users
│   ├── auth/
│   │   └── post-refresh.ts  # POST /api/auth/refresh
│   └── users/
│       └── [userId]/
│           ├── posts/
│           │   ├── get.ts           # GET /api/users/:userId/posts
│           │   ├── post.ts          # POST /api/users/:userId/posts
│           │   └── get-[id].ts      # GET /api/users/:userId/posts/:id
│           └── settings/
│               └── get.ts           # GET /api/users/:userId/settings
├── package.json
├── tsconfig.json
└── README.md
```

## 安装依赖

```bash
cd example
npm install
```

注意：这个示例使用了本地包 `auto-router`，需要在上级目录先构建包：

```bash
cd ..
npm run build
cd example
npm install
```

## 运行示例

### 基本示例

```bash
# 开发模式
npm run dev

# 或构建后运行
npm run build
npm start
```

### 多层级配置示例

多层级配置示例展示了如何使用多个 `autoRouter` 实例，每个实例有不同的配置：

```typescript
// 管理端路由 - 默认公开
app.extend(
  autoRouter({
    dir: './controllers/admin',
    defaultRequiresAuth: false,
    prefix: '/api/admin',
  })
)

// 客户端路由 - 默认受保护
app.extend(
  autoRouter({
    dir: './controllers/client',
    defaultRequiresAuth: true,
    prefix: '/api/client',
  })
)
```

查看 [multi-level-example.ts](./multi-level-example.ts) 获取完整示例。

## API 端点

启动服务器后，你可以访问以下端点：

- `GET /api/users` - 获取用户列表
- `POST /api/login` - 用户登录（发送 JSON: `{"username": "admin", "password": "password"}`）
- `GET /api/:id` - 获取特定用户详情

## 控制器文件命名规则

- `get-users.ts` → `GET /api/users`
- `post-login.ts` → `POST /api/login`
- `get-[id].ts` → `GET /api/:id`

每个控制器文件必须导出默认的异步函数或使用 `createHandler` 包装的对象。

## 使用插件

```typescript
import { Hoa } from 'hoa'
import { autoRouter } from 'auto-router'

const app = new Hoa()

// 基本配置
app.extend(
  autoRouter({
    dir: './controllers', // 控制器目录
    prefix: '/api', // API 前缀
    defaultRequiresAuth: false, // 默认权限要求
  })
)

// 自定义日志输出
app.extend(
  autoRouter({
    dir: './controllers',
    onLog: (level, message) => {
      console.log(`[${level.toUpperCase()}] ${message}`)
    }
  })
)

// 禁用日志输出
app.extend(
  autoRouter({
    dir: './controllers',
    logging: false
  })
)
```

## 特性演示

### 1. 基本路由

- 文件名以 HTTP 方法开头：`get-users.ts` → `GET /api/users`
- 嵌套目录：`admin/get-dashboard.ts` → `GET /api/admin/dashboard`

### 2. 动态参数

- `get-[id].ts` → `GET /api/:id`
- `get-[userId]-[postId].ts` → `GET /api/:userId/:postId`
- `get-[userId]-posts.ts` → `GET /api/:userId/posts`
- 动态目录：`users/[userId]/posts/get.ts` → `GET /api/users/:userId/posts`

### 3. 权限控制

- 全局默认权限配置
- 单个路由权限覆盖
- 与 `@chaeco/hoa-jwt-permission` 集成

### 4. 多层级配置

- 合并式配置（推荐）：一个 `autoRouter` 配置多个目录
- 分离式配置：多个 `autoRouter` 实例

### 5. 日志管理

- 控制是否输出日志
- 自定义日志回调，集成到自己的日志系统
- 默认显示路由信息、权限标记等

### 6. Cloudflare Workers 支持

本示例包含生成的 `worker-routes.ts` 清单文件，展示了如何为 Cloudflare Workers 生成路由配置：

```bash
# 生成 Workers 清单
npx auto-router-build-manifest ./controllers ./worker-routes.ts --prefix /api
```

生成的清单包含 14 个路由，涵盖所有控制器文件：

```typescript
// worker-routes.ts（自动生成）
import type { WorkerManifestRoute } from '@chaeco/auto-router/worker-manifest'
import handler_get_users from './controllers/get-users'
import handler_get_id from './controllers/get-[id]'
// ... 更多导入

export const routes: WorkerManifestRoute[] = [
  { pattern: '/api/:id', method: 'DELETE', handler: handler_delete_id },
  { pattern: '/api/:id', method: 'GET', handler: handler_get_id },
  { pattern: '/api/:id', method: 'PUT', handler: handler_put_id },
  // ... 按 pattern 和 method 排序的路由
]
```

在 Worker 中使用：

```typescript
import { createWorkerRouter } from '@chaeco/auto-router/worker-manifest'
import { routes } from './worker-routes'

const router = createWorkerRouter({ routes })

export default {
  fetch: router.fetch
}
```

完整 Workers 用法见主 README 的 [Cloudflare Workers](../README.md#cloudflare-workers) 章节。

### 7. 参数校验

auto-router **不提供参数校验** — 所有路由参数都是字符串，需在 handler 内自行校验。

实际示例参考：
- 路径参数校验：`controllers/post-login.ts`
- 请求体校验：`controllers/users/[userId]/posts/post.ts`

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
