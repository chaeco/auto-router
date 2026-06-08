// POST /api/users/:userId/posts — create a post under a user
export default async (ctx: any) => {
  const { userId } = ctx.params
  const body = ctx.req?.body ?? {}
  ctx.res.status = 201
  ctx.res.body = { userId, post: { id: Date.now(), ...body } }
}
