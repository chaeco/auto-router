// GET /api/users
export default async (ctx: any) => {
  ctx.res.body = {
    message: 'Hello from auto-router!',
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ],
  }
}
