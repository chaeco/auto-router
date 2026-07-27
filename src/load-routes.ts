import { readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { isRouteConfig, type RouteMeta, type RouteInfo } from './handler.js'
import { matchesFilter } from './matches-filter.js'

/** Internal options passed from autoRouter() after normalization. */
export interface LoadRoutesOptions {
  dir: string
  prefix: string
  defaultRequiresAuth: boolean
  strict: boolean
  logging: boolean
  forcePublic?: string[]
  forceProtected?: string[]
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

// Helper function for logging
// 日志输出辅助函数
function createLogger(onLog: LoadRoutesOptions['onLog'], logging: boolean) {
  return (level: 'info' | 'warn' | 'error', message: string) => {
    if (onLog) {
      // Custom logger takes over entirely — skip default console output
      // 自定义日志接管，不再重复输出到控制台
      onLog(level, message)
      return
    }

    // Default console output
    // 默认控制台输出
    if (!logging) return

    switch (level) {
      case 'info':
        console.log(message)
        break
      case 'warn':
        console.warn(message)
        break
      case 'error':
        console.error(message)
        break
    }
  }
}

// Internal loading function
// 内部加载函数
export async function loadRoutes(
  app: any,
  options: LoadRoutesOptions
) {
  const { dir, prefix, defaultRequiresAuth, strict, forcePublic, forceProtected } = options
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']
  const log = createLogger(options.onLog, options.logging)

  // Track which forcePublic/forceProtected patterns actually matched at least one route
  // 追踪哪些 forcePublic/forceProtected 规则实际命中了路由
  const matchedForcePublicPatterns = new Set<string>()
  const matchedForceProtectedPatterns = new Set<string>()
  // Track routes where forcePublic/forceProtected matched but was overridden by explicit createHandler meta
  // 追踪规则命中但被 createHandler 显式 meta 覆盖的路由
  const overriddenByMeta: Array<{ route: string; pattern: string; type: 'forcePublic' | 'forceProtected' }> = []
  // Track routes where both forcePublic and forceProtected matched (conflict)
  // 追踪同时被 forcePublic 和 forceProtected 命中的路由（冲突）
  const conflictRoutes: Array<{ route: string; publicPattern: string; protectedPattern: string }> = []

  const importPromises: Promise<void>[] = [] // Collect all import promises
  // 收集所有导入 Promise
  // Buffer route log lines for sorted output after all async imports resolve
  // 缓存路由日志行，等所有异步导入完成后再排序输出
  const routeLogLines: Array<{ path: string; method: string; line: string }> = []

  // Initialize app's route metadata storage (only once)
  // 初始化应用的路由元数据存储（仅一次）
  if (!app.$routes) {
    app.$routes = {
      publicRoutes: [],
      protectedRoutes: [],
      all: [],
    }
  }

  // Initialize registered routes set (shared across all autoRouter calls)
  // 初始化已注册路由集合（在所有 autoRouter 调用间共享）
  if (!app.$registeredRoutes) {
    app.$registeredRoutes = new Set<string>()
  }
  const registeredRoutes = app.$registeredRoutes // For detecting duplicate routes
  // 用于检测重复路由

  // Validation function
  // 验证函数
  function validateFileName(fileName: string): { valid: boolean; method?: string; error?: string } {
    const nameWithoutExt = fileName.replace(/\.(ts|js)$/, '')

    // Check if file name is exactly a HTTP method (e.g., get.ts, post.ts)
    // 检查文件名是否恰好是 HTTP 方法（例如：get.ts, post.ts）
    if (methods.includes(nameWithoutExt)) {
      return { valid: true, method: nameWithoutExt }
    }

    // Check if starts with valid HTTP method followed by dash
    // 检查是否以有效的 HTTP 方法开头，后跟连字符
    let method: string | undefined
    for (const m of methods) {
      if (nameWithoutExt.startsWith(m + '-')) {
        method = m
        break
      }
    }

    if (!method) {
      return {
        valid: false,
        error: `File name must be a valid HTTP method or start with method- (${methods.join('|')})`,
        // 文件名必须是有效的 HTTP 方法或以 method- 开头 (${methods.join('|')})
      }
    }

    // Check parameter format
    // 检查参数格式
    const hasInvalidParams = /\[\]/.test(nameWithoutExt)
    if (hasInvalidParams) {
      return {
        valid: false,
        error: 'Empty parameters not allowed [], use [id] instead of []',
        // 不允许空参数 [], 例如：[id] 而不是 []
      }
    }

    return { valid: true, method }
  }

  // Validate directory name (receives only the single directory segment, not a full path)
  // 验证目录名（只接收单个目录段，而非完整路径）
  function validateDirPath(dirName: string): void {
    if (methods.includes(dirName.toLowerCase())) {
      log(
        'warn',
        `⚠️  Warning: Directory name "${dirName}" is an HTTP method keyword, consider renaming`
      )
      // 警告: 目录名 "${dirName}" 是 HTTP 方法关键字，建议重命名
    }
  }

  // Recursively scan directory
  // 递归扫描目录
  function scanDir(dirPath: string, basePath: string = '') {
    const files = readdirSync(dirPath)

    for (const file of files) {
      const filePath = join(dirPath, file)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(filePath)
      } catch (err: unknown) {
        // Broken symlink, race-condition deletion, permission denied, etc.
        // 断开的符号链接、竞态删除、权限拒绝等
        log('warn', `⚠️  Skip entry (stat failed): ${filePath}`)
        log('warn', `   ⚠️  ${err instanceof Error ? err.message : String(err)}`)
        continue
      }

      if (stat.isDirectory()) {
        // Validate directory name (only the new segment, not the full absolute path)
        // 验证目录名（只检查新增的这一段，而非完整绝对路径）
        validateDirPath(file)
        // Convert [param] in directory names to :param, e.g. [userId] -> :userId
        // 转换目录名中的 [param] 为 :param，如 [userId] -> :userId
        const dirSegment = file.replace(/\[(\w+)\]/g, ':$1')
        // Recursively scan subdirectory
        // 递归扫描子目录
        try {
          scanDir(filePath, basePath ? `${basePath}/${dirSegment}` : `/${dirSegment}`)
        } catch (err: unknown) {
          // Subdirectory unreadable (permission denied, etc.) — skip it, continue scanning siblings
          // 子目录不可读（权限拒绝等）—跳过，继续扫描同级其他文件
          log('warn', `⚠️  Skip directory (scan failed): ${filePath}`)
          log('warn', `   ⚠️  ${err instanceof Error ? err.message : String(err)}`)
        }
      } else if ((file.endsWith('.ts') && !file.endsWith('.d.ts')) || file.endsWith('.js')) {
        // Validate filename
        // 验证文件名
        const validation = validateFileName(file)
        if (!validation.valid) {
          log('error', `❌ Skip file: ${filePath}`)
          // 跳过文件: ${filePath}
          log('error', `   ❌ ${validation.error}`)
          continue  // Skip this file only, continue scanning remaining files in the directory
          // 只跳过此文件，继续扫描目录中的其余文件
        }

        const method = validation.method!
        const nameWithoutExt = file.replace(/\.(ts|js)$/, '')

        // If file name is exactly the HTTP method, routeName is empty
        // 如果文件名恰好是 HTTP 方法，routeName 为空
        let routeName = ''
        if (nameWithoutExt !== method) {
          // Extract route name after "method-"
          // 提取 "method-" 之后的路由名称
          routeName = nameWithoutExt.substring(method.length + 1)
        }

        // Process dynamic parameters [id] -> :id, and -[param] -> /:param
        // 处理动态参数 [id] -> :id，以及 -[param] -> /:param
        // Examples:
        // 例如：
        // - [id] -> :id
        // - [userId]-[postId] -> :userId/:postId
        // - [userId]-posts -> :userId/posts
        routeName = routeName
          .replace(/\[(\w+)\]/g, ':$1') // [param] -> :param
          // [param] -> :param
          .replace(/-:/g, '/:') // -: -> /: (handle parameter connectors)
          .replace(/:(\w+)-/g, ':$1/') // :- -> :/ (handle parameter suffixes)
        // -: -> /:（处理参数之间的连接符）
        // :- -> :/（处理参数后的连接符）

        // Build full route path
        // 构建完整路由路径
        let fullPath: string
        if (routeName) {
          // Has route name: basePath + routeName
          // 有路由名：basePath + routeName
          fullPath = basePath ? `${basePath}/${routeName}` : `/${routeName}`
        } else {
          // No route name (method-only file): use basePath
          // 无路由名（仅方法名文件）：使用 basePath
          fullPath = basePath
        }

        fullPath = fullPath.replace(/\/+/g, '/') // Remove double slashes
        // 移除双斜杠

        // Detect duplicate routes
        // 检测重复路由
        const routePath = prefix
          ? `${prefix}${fullPath}`.replace(/\/+/g, '/') // Normalize any double slashes from prefix
          : fullPath                                     // 归一化来自 prefix 的多余斜杠
        const routeKey = `${method.toUpperCase()} ${routePath}`
        if (registeredRoutes.has(routeKey)) {
          log('error', `❌ Skip file: ${filePath}`)
          // 跳过文件: ${filePath}
          log('error', `   ❌ Duplicate route: ${routeKey}`)
          // 路由重复: ${routeKey}
          continue  // Skip this file only, continue scanning remaining files
          // 只跳过此文件，继续扫描目录中的其余文件
        }
        registeredRoutes.add(routeKey)

        // Dynamically import and register route - using file:// URL
        // 动态导入并注册路由 - 使用 file:// URL
        const absolutePath = resolve(filePath)
        const fileUrl = pathToFileURL(absolutePath).href

        const importPromise = import(fileUrl)
          .then(module => {
            let handler = module.default
            let routeMeta: RouteMeta | undefined

            // Skip if no default export
            // 没有默认导出则跳过
            if (handler === undefined || handler === null) {
              return
            }

            // Catch unexpected falsy values (false, 0, '') that are clearly not handlers
            // 捕获明显不是 handler 的意外 falsy 值（false、0、''）
            if (!handler) {
              log('error', `❌ Failed to load route: ${filePath}`)
              log('error', `   ❌ Default export is a falsy non-null value (${JSON.stringify(handler)}), expected a function or createHandler result`)
              return
            }

            // Strict mode check: in strict mode, only allow functions or createHandler objects
            // 严格模式检查：在严格模式下，只允许函数或 createHandler 对象
            if (strict && typeof handler !== 'function' && !isRouteConfig(handler)) {
              log('error', `❌ Failed to load route: ${filePath}`)
              // 加载路由失败: ${filePath}
              log(
                'error',
                `   ❌ In strict mode, only functions or createHandler results are allowed`
              )
              // 严格模式下，只允许导出函数或 createHandler 结果
              log('error', `   ❌ Current export type: ${typeof handler}`)
              // 当前导出类型: ${typeof handler}
              log('error', `   ❌ Correct ways:`)
              // 正确的方式：
              log('error', `      ✅ export default async (ctx) => { ... }`)
              log('error', `      ✅ export default createHandler(async (ctx) => { ... }, meta)`)
              log('error', `      ❌ Not supported: export default { handler, meta }`)
              log('error', `      💡 Tip: You can set strict: false to disable strict checking`)
              // 提示: 可以设置 strict: false 来禁用严格检查
              return
            }

            // Validation rule: each file can only have one export (only default export)
            // 验证规则：每个文件只能有一个导出（只能有默认导出）
            const namedExports = Object.keys(module).filter(key => key !== 'default')
            if (namedExports.length > 0) {
              log('error', `❌ Failed to load route: ${filePath}`)
              // 加载路由失败: ${filePath}
              log(
                'error',
                `   ❌ File can only have default export, named exports are not allowed`
              )
              // 文件只能有默认导出，不允许命名导出
              log('error', `   ❌ Detected named exports: ${namedExports.join(', ')}`)
              // 检测到的命名导出: ${namedExports.join(', ')}
              return
            }

            // Check export method
            // 检查导出方式
            // strict mode (default): only allow two ways
            // strict 模式（默认）：只允许两种方式
            // 1. Pure function (async function or arrow function)
            // 1. 纯函数（async function 或 arrow function）
            // 2. createHandler wrapped RouteConfig object
            // 2. createHandler 包装的 RouteConfig 对象

            // Check if it's a createHandler wrapped object
            // 检查是否为 createHandler 包装的对象
            if (isRouteConfig(handler)) {
              // Way 2: createHandler wrapped { handler, meta }
              // 方式 2: createHandler 包装 { handler, meta }
              routeMeta = handler.meta
              handler = handler.handler
            } else if (typeof handler === 'function') {
              // Way 1: Pure function - normal
              // 方式 1: 纯函数 - 正常
              // routeMeta remains undefined, use global default
              // routeMeta 保持 undefined，使用全局默认值
            } else if (typeof handler === 'object' && handler !== null) {
              // Detected plain object export
              // 检测到普通对象导出
              // Note: strict mode is already handled above by the early check — if we reach here,
              // strict must be false (non-strict mode).
              // 注意：严格模式已在上方的提前检查中处理，执行到此处时 strict 一定为 false（非严格模式）。
              if (typeof handler.handler === 'function') {
                // Non-strict mode: allow ordinary object export, show warning
                // 非严格模式：允许普通对象导出，显示警告
                log('warn', `⚠️  Warning: ${filePath}`)
                // 警告: ${filePath}
                log('warn', `   ⚠️  Detected non-recommended export method (non-strict mode)`)
                // 检测到非推荐的导出方式（非严格模式）
                routeMeta = handler.meta
                handler = handler.handler
                // handler is now a valid function; fall through to route registration
                // handler 现在是有效函数，继续执行路由注册
              } else {
                log('error', `❌ Failed to load route: ${filePath}`)
                // 加载路由失败: ${filePath}
                log('error', `   ❌ Exported object must contain handler function`)
                // 导出的对象必须包含 handler 函数
                return
              }
            } else {
              // Unsupported export type (e.g. number, string, null)
              // 不支持的导出类型（如 number、string、null）
              const handlerType = typeof handler
              log('error', `❌ Failed to load route: ${filePath}`)
              // 加载路由失败: ${filePath}
              log('error', `   ❌ Unsupported export type: ${handlerType}`)
              // 不支持的导出类型: ${handlerType}
              log('error', `   ❌ Only the following ways are allowed:`)
              // 只允许以下方式：
              log('error', `      ✅ export default async (ctx) => { ... }`)
              log('error', `      ✅ export default createHandler(async (ctx) => { ... }, meta)`)
              return
            }

            // Output route information, including permission mark
            // 输出路由信息，包括权限标记
            // Priority: explicit meta > forceProtected/forcePublic > defaultRequiresAuth
            // 优先级：显式 meta > forceProtected/forcePublic > defaultRequiresAuth
            const matchedPublicPattern = forcePublic?.find(p => matchesFilter(routePath, method, p, prefix))
            const matchedProtectedPattern = forceProtected?.find(p => matchesFilter(routePath, method, p, prefix))

            // Detect conflict: same route matched by both forcePublic and forceProtected
            // 检测冲突：同一路由同时被 forcePublic 和 forceProtected 命中
            if (matchedPublicPattern && matchedProtectedPattern) {
              conflictRoutes.push({
                route: routePath,
                publicPattern: matchedPublicPattern,
                protectedPattern: matchedProtectedPattern,
              })
            }

            if (matchedPublicPattern) matchedForcePublicPatterns.add(matchedPublicPattern)
            if (matchedProtectedPattern) matchedForceProtectedPatterns.add(matchedProtectedPattern)

            let requiresAuth: boolean
            if (routeMeta?.requiresAuth !== undefined) {
              // Explicit meta always wins
              // 显式 meta 优先级最高
              requiresAuth = routeMeta.requiresAuth
              // Warn for the pattern that would have applied had there been no explicit meta:
              // forceProtected beats forcePublic in conflict, so only warn about forceProtected
              // when both match; otherwise warn about whichever one matched.
              // 警告"如果没有 explicit meta 才会生效的那条规则"：
              // 两者都命中时 forceProtected 赢得冲突，forcePublic 本已落败，无需重复警告。
              if (matchedProtectedPattern) {
                overriddenByMeta.push({ route: routePath, pattern: matchedProtectedPattern, type: 'forceProtected' })
              } else if (matchedPublicPattern) {
                overriddenByMeta.push({ route: routePath, pattern: matchedPublicPattern, type: 'forcePublic' })
              }
            } else if (matchedPublicPattern && matchedProtectedPattern) {
              // Conflict: forceProtected wins (safer default)
              // 冲突时：forceProtected 优先（更安全）
              requiresAuth = true
            } else if (matchedProtectedPattern) {
              requiresAuth = true
            } else if (matchedPublicPattern) {
              requiresAuth = false
            } else {
              requiresAuth = defaultRequiresAuth
            }
            const authMark = requiresAuth ? ' 🔒' : ''
            routeLogLines.push({
              path: routePath,
              method: method.toUpperCase(),
              line: `✅ ${method.toUpperCase().padEnd(7)} ${routePath}${authMark}`,
            })

            // Collect route metadata to application instance
            // 收集路由元数据到应用实例
            const routeInfo: RouteInfo = { method: method.toUpperCase(), path: routePath, requiresAuth }
            if (routeMeta) {
              routeInfo.meta = routeMeta
            }
            app.$routes.all.push(routeInfo)
            if (requiresAuth) {
              app.$routes.protectedRoutes.push({ method: method.toUpperCase(), path: routePath })
            } else {
              app.$routes.publicRoutes.push({ method: method.toUpperCase(), path: routePath })
            }

            app[method](routePath, handler)
          })
          .catch((err: unknown) => {
            log('error', `❌ Failed to load route: ${filePath}`)
            // 加载路由失败: ${filePath}
            log('error', `   ❌ ${err instanceof Error ? err.message : String(err)}`)
          })

        importPromises.push(importPromise)
      }
    }
  }

  log('info', `🔄 Scanning controller directory: ${dir}`)
  // 扫描控制器目录: ${dir}
  const fullDir = resolve(dir)
  try {
    scanDir(fullDir)
  } catch (err: unknown) {
    // Directory does not exist or is not readable
    // 目录不存在或无法读取
    log('error', `❌ Failed to scan directory: ${fullDir}`)
    log('error', `   ❌ ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // Wait for all imports to complete
  // 等待所有导入完成
  await Promise.all(importPromises)

  // Flush sorted route registration logs
  // 排序后输出所有路由注册日志
  routeLogLines.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  for (const { line } of routeLogLines) {
    log('info', line)
  }

  // Validate forcePublic / forceProtected pattern reasonableness
  // 校验 forcePublic / forceProtected 规则合理性

  // Warn about conflict routes (matched by both forcePublic and forceProtected)
  // 警告：同时被 forcePublic 和 forceProtected 命中的路由（冲突，forceProtected 优先）
  for (const { route, publicPattern, protectedPattern } of conflictRoutes) {
    log(
      'warn',
      `⚠️  Route "${route}" matched both forcePublic ("${publicPattern}") and forceProtected ("${protectedPattern}") — forceProtected wins`
      // 路由 "${route}" 同时被 forcePublic 和 forceProtected 命中 — forceProtected 优先
    )
  }

  // Warn about patterns overridden by explicit createHandler meta
  // 警告：规则命中了路由，但被 createHandler 显式 meta 覆盖
  for (const { route, pattern, type } of overriddenByMeta) {
    log(
      'warn',
      `⚠️  ${type} pattern "${pattern}" matched "${route}" but has no effect — route has explicit createHandler meta`
      // ${type} 规则 "${pattern}" 命中了 "${route}"，但该路由已通过 createHandler 显式设置权限，此规则对其无效
    )
  }

  // Warn about forcePublic patterns that never matched any route
  // 警告：从未命中任何路由的 forcePublic 规则
  if (forcePublic) {
    for (const pattern of forcePublic) {
      if (!matchedForcePublicPatterns.has(pattern)) {
        log(
          'warn',
          `⚠️  forcePublic pattern "${pattern}" did not match any registered route (check for typos or outdated config)`
          // forcePublic 规则 "${pattern}" 未命中任何已注册路由（请检查是否有拼写错误或配置已过期）
        )
      }
    }
  }

  // Warn about forceProtected patterns that never matched any route
  // 警告：从未命中任何路由的 forceProtected 规则
  if (forceProtected) {
    for (const pattern of forceProtected) {
      if (!matchedForceProtectedPatterns.has(pattern)) {
        log(
          'warn',
          `⚠️  forceProtected pattern "${pattern}" did not match any registered route (check for typos or outdated config)`
          // forceProtected 规则 "${pattern}" 未命中任何已注册路由（请检查是否有拼写错误或配置已过期）
        )
      }
    }
  }

  // Output summary after all routes are loaded
  // 所有路由加载完成后输出总结
  log('info', `📋 Registered routes:`)
  // 注册的路由:
  if (app.$routes.all.length === 0) {
    log('warn', `⚠️  No routes registered!`)
    // 没有注册任何路由!
  } else {
    log('info', `   Total: ${app.$routes.all.length}`)
    // 总计: ${app.$routes.all.length}
    log('info', `   Public: ${app.$routes.publicRoutes.length}`)
    // 公开: ${app.$routes.publicRoutes.length}
    log('info', `   Protected: ${app.$routes.protectedRoutes.length}`)
    // 受保护: ${app.$routes.protectedRoutes.length}
  }
}
