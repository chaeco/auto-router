import { jest } from '@jest/globals';
import { autoRouter } from '../auto-router';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
describe('autoRouter', () => {
    const testDir = join(process.cwd(), '__tests__', 'controllers');
    beforeAll(() => {
        // Create test controllers directory
        mkdirSync(testDir, { recursive: true });
        // Create test route files (using .js for dynamic imports to work in tests)
        writeFileSync(join(testDir, 'get-users.js'), 'export default async (ctx) => { ctx.res.body = { users: [] } }');
        writeFileSync(join(testDir, 'post-login.js'), 'export default async (ctx) => { ctx.res.body = { token: "test" } }');
        writeFileSync(join(testDir, 'get-[id].js'), 'export default async (ctx) => { ctx.res.body = { id: ctx.params.id } }');
    });
    afterAll(() => {
        // Clean up test files
        rmSync(testDir, { recursive: true, force: true });
    });
    it('should load routes from directory', async () => {
        const mockApp = {
            get: jest.fn(),
            post: jest.fn(),
            $routes: {
                publicRoutes: [],
                protectedRoutes: [],
                all: [],
            },
        };
        const router = autoRouter({ dir: testDir, prefix: '/api' });
        await router(mockApp);
        expect(mockApp.get).toHaveBeenCalledWith('/api/users', expect.any(Function));
        expect(mockApp.post).toHaveBeenCalledWith('/api/login', expect.any(Function));
        expect(mockApp.get).toHaveBeenCalledWith('/api/:id', expect.any(Function));
        expect(mockApp.$routes).toBeDefined();
        expect(mockApp.$routes.all).toHaveLength(3);
        expect(mockApp.$routes.publicRoutes).toHaveLength(3); // Since defaultRequiresAuth: false
    });
    it('should handle default options', async () => {
        const mockApp = {
            get: jest.fn(),
            post: jest.fn(),
            $routes: undefined,
        };
        const router = autoRouter({ dir: testDir });
        await router(mockApp);
        expect(mockApp.get).toHaveBeenCalledWith('/api/users', expect.any(Function));
    });
    it('should throw error if app is not provided', () => {
        const router = autoRouter();
        expect(() => router(null)).toThrow('Auto-router plugin requires an application instance');
    });
});
//# sourceMappingURL=auto-router.test.js.map