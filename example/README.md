# Hoa Auto Router Example

这是一个展示如何使用 `auto-router` 插件的示例项目。

## 项目结构

```text
example/
├── app.ts                   # 基本应用文件
├── multi-level-example.ts   # 多层级配置示例
├── controllers/             # 控制器目录
│   ├── get-users.ts         # GET /api/users
│   ├── post-login.ts        # POST /api/login
│   ├── get-[id].ts          # GET /api/:id
│   ├── get.ts               # GET /api（仅方法名）
│   └── admin/
│       └── get-dashboard.ts # GET /api/admin/dashboard
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
- 仅方法名：`get.ts` → `GET /api` (新增特性)

### 2. 动态参数

- `get-[id].ts` → `GET /api/:id`
- `get-[userId]-[postId].ts` → `GET /api/:userId/:postId`
- `get-[id]-resources.ts` → `GET /api/:id/resources`

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

### 6. API 文档生成

通过 `app.$routes.all` 获取所有路由信息，可生成 OpenAPI、Postman 等文档：

```typescript
// 在 app.listen() 后执行
const spec = {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
  paths: {},
}

for (const route of app.$routes.all) {
  const path = route.path.replace(/:/g, '{')
  if (!spec.paths[path]) spec.paths[path] = {}
  spec.paths[path][route.method.toLowerCase()] = {
    summary: route.meta?.description ?? route.path,
    responses: { default: { description: 'Default response' } },
  }
}
```

### 7. 参数校验

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

**推荐方案：** 使用 zod / joi 等 schema 库在 handler 入口集中校验：

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
