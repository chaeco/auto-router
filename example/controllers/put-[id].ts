// PUT /api/users/:id — update a user
export default async (ctx: any) => {
  const { id } = ctx.params
  const body = ctx.req?.body ?? {}
  ctx.res.body = { success: true, user: { id, ...body } }
}
