import { createWorkerRouter } from '@chaeco/auto-router/worker-manifest'
import { routes } from './generated-worker-routes'

export default createWorkerRouter({
  routes,
  notFound: async () => {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  onError: async (err) => {
    console.error(err)
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
