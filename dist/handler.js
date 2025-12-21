import { HoaContext } from 'hoa';
/**
 * Export convenient tool, only supports two usage patterns:
 * 导出便捷工具，仅支持两种用法：
 *
 * Usage 1: Pure function (recommended for most routes)
 * 用法 1：纯函数（推荐大多数路由）
 *    export default async (ctx: HoaContext) => {
 *      ctx.res.body = { success: true }
 *    }
 *
 * Usage 2: createHandler wrapper (for routes that need metadata)
 * 用法 2：createHandler 包装（需要元数据的路由）
 *    export default createHandler(async (ctx) => {
 *      ctx.res.body = { success: true }
 *    }, { requiresAuth: true })
 */
export function createHandler(handler, meta) {
    const config = {
        handler,
        meta: meta || {},
        $__isRouteConfig: true, // Mark this as an object created by createHandler
        // 标记这是 createHandler 创建的对象
    };
    return config;
}
/**
 * Check if it's a route configuration object
 * 检查是否为路由配置对象
 * Must be an object returned by createHandler(), not a plain object
 * 必须是 createHandler() 返回的对象，而不是普通对象
 */
export function isRouteConfig(obj) {
    return !!(obj &&
        typeof obj === 'object' &&
        typeof obj.handler === 'function' &&
        // Check if there's $__isRouteConfig mark (set by createHandler)
        // 检查是否有 $__isRouteConfig 标记（由 createHandler 设置）
        obj.$__isRouteConfig === true);
}
export { HoaContext };
//# sourceMappingURL=handler.js.map