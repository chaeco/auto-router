// GET /api/:id — single param
export default async (ctx: any) => {
  const id = ctx.params?.id
  ctx.res.body = { user: { id, name: `User ${id}` } }
}
