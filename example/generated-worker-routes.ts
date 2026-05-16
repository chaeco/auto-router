// Generated worker manifest
import handler0 from 'file:///Users/a/Desktop/dev/chaeco/auto-router/example/controllers/get-%5Bid%5D.ts'
import handler1 from 'file:///Users/a/Desktop/dev/chaeco/auto-router/example/controllers/get-users.ts'
import handler2 from 'file:///Users/a/Desktop/dev/chaeco/auto-router/example/controllers/post-login.ts'

export const routes = [
  { method: 'GET', pattern: '/:id', handler: handler0 },
  { method: 'GET', pattern: '/users', handler: handler1 },
  { method: 'POST', pattern: '/login', handler: handler2 }
]
