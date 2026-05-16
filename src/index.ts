// Main exports
// 主要导出
export { autoRouter } from './auto-router'
export { staticAutoRouter } from './static-router'

// Type exports
// 类型导出
export type { RouteHandler, RouteMeta, RouteConfig, RouteInfo, AppRoutesRegistry } from './handler'
export type { StaticRoute, StaticAutoRouterOptions } from './static-router'

// Utility function exports
// 工具函数导出
export { createHandler, isRouteConfig } from './handler'
