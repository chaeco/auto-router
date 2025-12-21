import { createHandler, isRouteConfig } from '../handler';
describe('createHandler', () => {
    it('should create a RouteConfig with handler and meta', () => {
        const handler = async () => { };
        const meta = { requiresAuth: true, description: 'test' };
        const config = createHandler(handler, meta);
        expect(config.handler).toBe(handler);
        expect(config.meta).toEqual(meta);
        expect(isRouteConfig(config)).toBe(true);
    });
    it('should create a RouteConfig with default meta if not provided', () => {
        const handler = async () => { };
        const config = createHandler(handler);
        expect(config.handler).toBe(handler);
        expect(config.meta).toEqual({});
        expect(isRouteConfig(config)).toBe(true);
    });
});
describe('isRouteConfig', () => {
    it('should return true for objects created by createHandler', () => {
        const config = createHandler(async () => { });
        expect(isRouteConfig(config)).toBe(true);
    });
    it('should return false for plain objects', () => {
        const plain = { handler: async () => { }, meta: {} };
        expect(isRouteConfig(plain)).toBe(false);
    });
    it('should return false for non-objects', () => {
        expect(isRouteConfig(null)).toBe(false);
        expect(isRouteConfig(undefined)).toBe(false);
        expect(isRouteConfig('string')).toBe(false);
        expect(isRouteConfig(123)).toBe(false);
    });
    it('should return false for objects without $__isRouteConfig', () => {
        const obj = { handler: async () => { }, meta: {}, $__isRouteConfig: false };
        expect(isRouteConfig(obj)).toBe(false);
    });
});
//# sourceMappingURL=handler.test.js.map